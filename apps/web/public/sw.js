// Offline: the app keeps a copy of itself (the page, its code and styles,
// the icons) so it opens with no connection and shows the data saved on the
// device. Online it always loads fresh; the copy is only the fallback.
//
// Each build lists its files in /version.json. After the app opens online,
// the copy is brought up to date with that list: new files are fetched, old
// ones dropped, and the page saved alongside, so the page and its code
// always come from the same build.
const APP_CACHE = "crow-app-v1";
const PAGE = "/index.html";
const PUBLIC_FILES = ["/manifest.json", "/pwa-192x192.png", "/apple-touch-icon.png"];

self.addEventListener("install", () => {
	globalThis.self.skipWaiting();
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		(async () => {
			// Caches from earlier versions of this worker.
			const names = await caches.keys();
			await Promise.all(
				names
					.filter((name) => name.startsWith("crow-") && name !== APP_CACHE)
					.map((name) => caches.delete(name)),
			);
			await clients.claim();
		})(),
	);
});

let syncing = null;

// Brings the saved copy up to date with the build that's live now.
async function syncAppCopy() {
	const response = await fetch("/version.json", { cache: "no-store" });
	if (!response.ok) return;
	const { version, assets } = await response.json();
	// Development builds have no file list: nothing to keep.
	if (!version || !Array.isArray(assets)) return;

	const cache = await caches.open(APP_CACHE);
	const saved = await cache.match("/__version");
	if (saved && (await saved.text()) === version) return;

	const wanted = new Set([PAGE, ...PUBLIC_FILES, ...assets]);
	const have = new Set(
		(await cache.keys()).map((request) => new URL(request.url).pathname),
	);
	// The page always, as it changes with every build; hashed files only
	// when missing, since their names change when their content does.
	const toFetch = [...wanted].filter((path) => path === PAGE || !have.has(path));
	await Promise.all(
		toFetch.map(async (path) => {
			const file = await fetch(path, { cache: "no-cache" });
			if (file.ok) await cache.put(path, file);
		}),
	);
	await Promise.all(
		[...have]
			.filter((path) => path !== "/__version" && !wanted.has(path))
			.map((path) => cache.delete(path)),
	);
	await cache.put("/__version", new Response(version));
}

function syncSoon() {
	syncing ??= syncAppCopy()
		.catch(() => {
			// Offline or mid-deploy: the next open tries again.
		})
		.finally(() => {
			syncing = null;
		});
	return syncing;
}

self.addEventListener("fetch", (event) => {
	const request = event.request;
	if (request.method !== "GET") return;
	const url = new URL(request.url);
	if (url.origin !== self.location.origin) return;

	if (request.mode === "navigate") {
		// Opening the app must never be answered by a stale cached page, so the
		// page is always checked with the server (a cheap 304 when unchanged).
		// Only with no connection does the saved copy answer.
		event.respondWith(
			(async () => {
				try {
					const response = await fetch(
						new Request(request, { cache: "no-cache" }),
					);
					event.waitUntil(syncSoon());
					return response;
				} catch (error) {
					const saved = await caches.match(PAGE, { cacheName: APP_CACHE });
					if (saved) return saved;
					throw error;
				}
			})(),
		);
		return;
	}

	// Build files never change under the same name, so a saved one is used
	// as is. Icons and the manifest: network first, the saved copy offline.
	// Everything else (API calls, version.json) is left alone.
	if (url.pathname.startsWith("/assets/")) {
		event.respondWith(
			caches
				.match(url.pathname, { cacheName: APP_CACHE })
				.then((saved) => saved ?? fetch(request)),
		);
	} else if (PUBLIC_FILES.includes(url.pathname)) {
		event.respondWith(
			fetch(request).catch(async (error) => {
				const saved = await caches.match(url.pathname, { cacheName: APP_CACHE });
				if (saved) return saved;
				throw error;
			}),
		);
	}
});

self.addEventListener("push", (event) => {
	let payload = {};

	if (event.data) {
		try {
			payload = event.data.json();
		} catch {
			payload = { body: event.data.text() };
		}
	}

	const title = payload.title ?? "Crow";
	const options = {
		body: payload.body ?? "You have a new notification.",
		icon: payload.icon ?? "/pwa-192x192.png",
		badge: payload.badge ?? "/notification-badge-96.png",
		image: payload.image,
		data: payload.data ?? {},
	};

	event.waitUntil(
		globalThis.self.registration.showNotification(title, options),
	);
});

// The browser replaced this device's push subscription (it can rotate them).
// Subscribe again with the same key and tell any open app to save it; if the
// app is closed, it re-saves the subscription the next time it opens.
self.addEventListener("pushsubscriptionchange", (event) => {
	const options = event.oldSubscription?.options;
	event.waitUntil(
		(async () => {
			if (!event.newSubscription && options?.applicationServerKey) {
				await globalThis.self.registration.pushManager.subscribe({
					userVisibleOnly: true,
					applicationServerKey: options.applicationServerKey,
				});
			}
			const clientList = await clients.matchAll({
				type: "window",
				includeUncontrolled: true,
			});
			for (const client of clientList) {
				client.postMessage({ type: "push-subscription-changed" });
			}
		})(),
	);
});

self.addEventListener("notificationclick", (event) => {
	event.notification.close();
	const targetUrl = event.notification.data?.url ?? "/";
	const absoluteTargetUrl = new URL(targetUrl, self.location.origin).href;

	event.waitUntil(
		clients
			.matchAll({ type: "window", includeUncontrolled: true })
			.then((clientList) => {
				// The app is already open: bring it forward and let it move to
				// the page itself, so Back returns to where the person was.
				const appWindow = clientList.find(
					(client) =>
						new URL(client.url).origin === self.location.origin &&
						"focus" in client,
				);
				if (appWindow) {
					const target = new URL(absoluteTargetUrl);
					appWindow.postMessage({
						type: "navigate",
						path: `${target.pathname}${target.search}${target.hash}`,
					});
					return appWindow.focus();
				}

				if (clients.openWindow) {
					return clients.openWindow(absoluteTargetUrl);
				}

				return undefined;
			}),
	);
});
