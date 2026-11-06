self.addEventListener("install", () => {
	globalThis.self.skipWaiting();
});

self.addEventListener("activate", (event) => {
	event.waitUntil(clients.claim());
});

self.addEventListener("fetch", (event) => {
	// Bundles, images and API calls go straight to the network untouched.
	if (event.request.mode !== "navigate") return;
	// Opening the app must never be answered by a stale cached page, so the
	// page is always checked with the server (a cheap 304 when unchanged).
	event.respondWith(
		fetch(new Request(event.request, { cache: "no-cache" })).catch(() =>
			fetch(event.request),
		),
	);
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
