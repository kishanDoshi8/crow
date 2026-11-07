import * as React from "react";
import * as ReactDOM from "react-dom/client";
import App from "@/app/App";
import "@/shared/assets/styles/global.css";
import { captureReferral } from "@/shared/lib/referral";
import { initErrorReporting } from "@/shared/lib/errorReporting";

initErrorReporting();
captureReferral();

if ("serviceWorker" in navigator) {
	void navigator.serviceWorker
		.register("/sw.js", { scope: "/" })
		.then((registration) => {
			// An installed app can stay open for days; look for a new worker
			// each time it comes back into view.
			document.addEventListener("visibilitychange", () => {
				if (document.visibilityState === "visible") {
					registration.update().catch(() => {});
				}
			});
		})
		.catch((error) => {
			console.error("Service worker registration failed:", error);
		});
}

ReactDOM.createRoot(document.getElementById("root")!).render(
	<React.StrictMode>
		<App />
	</React.StrictMode>,
);
