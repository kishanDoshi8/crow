// Makes every icon file from brand/crow.svg: the favicons (SVG, and .ico for
// browsers and crawlers that ask for /favicon.ico), the home-screen and
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
const render = async (svg, size) => {
	await page.setViewportSize({ width: size, height: size });
	await page.setContent(
		`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
	);
	return page.screenshot({ omitBackground: true });
};
const png = async (svg, size, file) => {
	writeFileSync(path.join(pub, file), await render(svg, size));
	console.log("wrote public/" + file);
};
// An .ico holding PNG images: a 6-byte header, a 16-byte entry per image,
// then the images themselves.
const ico = async (svg, sizes, file) => {
	const images = [];
	for (const size of sizes) images.push(await render(svg, size));
	const header = Buffer.alloc(6 + 16 * sizes.length);
	header.writeUInt16LE(1, 2); // type: icon
	header.writeUInt16LE(sizes.length, 4);
	let offset = header.length;
	sizes.forEach((size, i) => {
		const entry = 6 + 16 * i;
		header.writeUInt8(size, entry); // width (0 would mean 256)
		header.writeUInt8(size, entry + 1); // height
		header.writeUInt16LE(1, entry + 4); // colour planes
		header.writeUInt16LE(32, entry + 6); // bits per pixel
		header.writeUInt32LE(images[i].length, entry + 8);
		header.writeUInt32LE(offset, entry + 12);
		offset += images[i].length;
	});
	writeFileSync(path.join(pub, file), Buffer.concat([header, ...images]));
	console.log("wrote public/" + file);
};
await ico(tile, [16, 32, 48], "favicon.ico");
await png(tile, 192, "pwa-192x192.png");
await png(tile, 512, "pwa-512x512.png");
await png(apple, 180, "apple-touch-icon.png");
await png(maskable, 512, "pwa-maskable-512x512.png");
await png(badge, 96, "notification-badge-96.png");
await browser.close();
console.log("wrote favicon.svg");
