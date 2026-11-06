// Makes every icon file from brand/crow.svg: the favicon, the home-screen and
// install icons, the Android maskable icon and the one-colour notification badge.
// From apps/web: node brand/render-icons.mjs (needs Playwright).
//
// Colours are literal here because these are image files, not themed UI. They
// match the app tokens: --primary (rose), --accent (amber), --brand-ink (crow).
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROSE = "#ff2056";
const AMBER = "#fe9a00";
const INK = "#020617";

const here = path.dirname(fileURLToPath(import.meta.url));
const pub = path.join(here, "..", "public");
const source = readFileSync(path.join(here, "crow.svg"), "utf8");
const d = source.match(/ d="([^"]+)"/)[1];
const eye = source.match(/<circle cx="(\d+)" cy="(\d+)" r="(\d+)"/).slice(1).map(Number);

// The crow, scaled by `scale` around the centre of a 512 canvas.
const crow = (color, scale) => {
	const offset = (512 * (1 - scale)) / 2;
	return `<g transform="translate(${offset} ${offset}) scale(${scale})">
  <mask id="eye"><rect width="512" height="512" fill="#fff"/><circle cx="${eye[0]}" cy="${eye[1]}" r="${eye[2]}" fill="#000"/></mask>
  <path mask="url(#eye)" fill="${color}" d="${d}"/></g>`;
};
const gradient = `<defs><linearGradient id="sun" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="${ROSE}"/><stop offset="1" stop-color="${AMBER}"/></linearGradient></defs>`;

// Rounded tile (favicon, install icons), full-bleed square (maskable: the
// platform cuts its own shape, so the crow stays inside the central safe circle),
// and the badge (white crow on transparent; Android tints it).
const tile = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${gradient}
<rect width="512" height="512" rx="138" fill="url(#sun)"/>${crow(INK, 0.8)}</svg>`;
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${gradient}
<rect width="512" height="512" fill="url(#sun)"/>${crow(INK, 0.62)}</svg>`;
// iOS rounds the corners itself and turns transparency black: full square.
const apple = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${gradient}
<rect width="512" height="512" fill="url(#sun)"/>${crow(INK, 0.74)}</svg>`;
const badge = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${crow("#ffffff", 0.96)}</svg>`;

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
