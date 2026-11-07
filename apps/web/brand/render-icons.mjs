// Makes every icon file from brand/crow.svg: the favicon, the home-screen and
// install icons, the Android maskable icon and the one-colour notification badge.
// From apps/web: node brand/render-icons.mjs (needs Playwright).
//
// Colours are literal here because these are image files, not themed UI. They
// match the app tokens: --primary (rose), --accent (amber), --brand-ink (crow),
// --brand-eye (the eye).
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROSE = "#ff2056";
const AMBER = "#fe9a00";
const INK = "#020617";
const EYE = "#ffffff";

const here = path.dirname(fileURLToPath(import.meta.url));
const pub = path.join(here, "..", "public");
const source = readFileSync(path.join(here, "crow.svg"), "utf8");
const shape = (id) => source.match(new RegExp(`id="${id}"[^>]* d="([^"]+)"`))[1];
const body = shape("crow");
const wing = shape("wing");
const eye = shape("eye");
const pupil = source.match(/id="pupil" cx="(\d+)" cy="(\d+)" r="(\d+)"/).slice(1).map(Number);

// The crow, scaled by `scale` around (px, py). The body is cut to `clip`.
// With `withEye` false the wing and eye stay plain holes (one-colour badge).
const crow = ({ color, scale = 1, px = 0, py = 512, withEye = true }) => {
	const t = `translate(${px * (1 - scale)} ${py * (1 - scale)}) scale(${scale})`;
	return `<g transform="${t}"><path fill-rule="evenodd" fill="${color}" d="${body}"/>${
		withEye ? `<path fill="${ROSE}" d="${wing}"/><path fill="${EYE}" d="${eye}"/><circle cx="${pupil[0]}" cy="${pupil[1]}" r="${pupil[2]}" fill="${color}"/>` : ""
	}</g>`;
};
const defs = (rx) => `<defs><linearGradient id="sun" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="${ROSE}"/><stop offset="1" stop-color="${AMBER}"/></linearGradient>
  <clipPath id="tile"><rect width="512" height="512" rx="${rx}"/></clipPath></defs>`;
const onTile = (rx, bird) =>
	`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${defs(rx)}
<rect width="512" height="512" rx="${rx}" fill="url(#sun)"/><g clip-path="url(#tile)">${bird}</g></svg>`;

// Rounded tile (favicon, install icons): the bust runs off the left and bottom.
const tile = onTile(138, crow({ color: INK }));
// iOS rounds the corners itself and turns transparency black: full square.
const apple = onTile(0, crow({ color: INK }));
// Maskable: the platform cuts its own shape (as small as the central circle), so
// the bird shrinks toward the bottom-left, keeping the bleed while the eye and
// beak stay inside the safe zone.
const maskable = onTile(0, crow({ color: INK, scale: 0.82, px: 100 }));
// Badge: white crow on transparent; Android tints it. Wing and eye stay holes.
const badge = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${crow({ color: "#ffffff", withEye: false })}</svg>`;

writeFileSync(path.join(here, "..", "favicon.svg"), tile + "\n");

const browser = await chromium.launch();
const page = await browser.newPage();
const png = async (svg, size, file) => {
	await page.setViewportSize({ width: size, height: size });
	await page.setContent(
		`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
	);
	await page.screenshot({ path: path.join(pub, file), omitBackground: true });
	console.log("wrote public/" + file);
};
await png(tile, 192, "pwa-192x192.png");
await png(tile, 512, "pwa-512x512.png");
await png(apple, 180, "apple-touch-icon.png");
await png(maskable, 512, "pwa-maskable-512x512.png");
await png(badge, 96, "notification-badge-96.png");
await browser.close();
console.log("wrote favicon.svg");
