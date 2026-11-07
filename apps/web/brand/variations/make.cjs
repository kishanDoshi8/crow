// Eight subtle variations on the Crow app icon, plus a one-colour silhouette.
// Exploration only: nothing here feeds the shipped icons (that is brand/crow.svg
// + brand/render-icons.mjs). From apps/web: node brand/variations/make.cjs
//
// Colours are literal because these are image files, not themed UI. They match
// the app tokens: --primary (rose), --accent (amber), --brand-ink (crow), plus
// one orange mid-stop that sits between the two.
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const ROSE = "#ff2056";
const ORANGE = "#ff5a1f";
const AMBER = "#fe9a00";
const INK = "#020617";
const out = __dirname;

// The current mark's path (crow space, 512 grid), for variants that keep it.
const CURRENT = "M492 190 L344 154 L296 130 L228 140 L186 182 L170 248 L162 312 L122 366 L182 354 L158 414 L216 392 L210 446 L274 406 L316 350 L340 294 L358 262 L482 294 L366 234 Z";

const pts = (s) => "M" + s.trim().split(/\s*,\s*|\s+(?=\d|-)/).join(" ").replace(/ /g, " ");
const poly = (list) => "M" + list.map((p) => p.join(" ")).join(" L") + " Z";
// Four-point sparkle, used as a "glint" eye.
const sparkle = (cx, cy, r) => {
	const k = r * 0.28;
	return poly([[cx, cy - r], [cx + k, cy - k], [cx + r, cy], [cx + k, cy + k], [cx, cy + r], [cx - k, cy + k], [cx - r, cy], [cx - k, cy - k]]);
};

const gradient = (id, [x1, y1, x2, y2], stops) =>
	`<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">` +
	stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join("") +
	`</linearGradient>`;

// One icon: rounded tile, gradient, crow body (ink) with holes punched by `holes`.
const icon = (v, { mono = false } = {}) => {
	const id = v.key;
	const holes = v.holes.map((h) => h.replace("<HOLE", `<path fill="#000"`)).join("");
	const body = `<g mask="url(#${id}-m)" fill="${mono ? "#000" : INK}">${v.body}</g>`;
	const mask = `<mask id="${id}-m" maskUnits="userSpaceOnUse" x="-100" y="-100" width="712" height="712"><rect x="-100" y="-100" width="712" height="712" fill="#fff"/>${holes}</mask>`;
	if (mono) return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs>${mask}</defs>${body}</svg>`;
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs>${gradient(id + "-g", v.angle, v.stops)}${mask}<clipPath id="${id}-c"><rect width="512" height="512" rx="138"/></clipPath></defs>
<rect width="512" height="512" rx="138" fill="url(#${id}-g)"/><g clip-path="url(#${id}-c)">${body}</g></svg>`;
};
const P = (d) => `<path d="${d}"/>`;
const HOLE = (d) => `<HOLE d="${d}"/>`;
const circle = (cx, cy, r) => `M${cx - r} ${cy} a${r} ${r} 0 1 0 ${2 * r} 0 a${r} ${r} 0 1 0 ${-2 * r} 0 Z`;
// Crow-space path into tile space (same placement as the shipped tile).
const T = (inner, s = 0.8, x = 51.2, y = 51.2) => `<g transform="translate(${x} ${y}) scale(${s})">${inner}</g>`;
const Ti = (d, s = 0.8, x = 51.2, y = 51.2) => `<HOLE transform="translate(${x} ${y}) scale(${s})" d="${d}"/>`;

const variants = [
	{
		key: "01-sharp-caw",
		title: "Sharp caw",
		note: "Same pose, harder edges: longer needle beak, wider gape, faceted crown. Orange mid-stop.",
		angle: [0, 0, 1, 1],
		stops: [[0, ROSE], [0.55, ORANGE], [1, AMBER]],
		body: T(P(poly([[504, 184], [340, 150], [302, 116], [234, 126], [188, 170], [170, 246], [160, 312], [116, 372], [180, 356], [152, 422], [216, 394], [208, 454], [276, 408], [318, 350], [342, 292], [360, 258], [474, 316], [366, 228]]))),
		holes: [Ti(circle(292, 180, 15))],
	},
	{
		key: "02-confident-squint",
		title: "Confident squint",
		note: "Beak shut, eye narrowed to a sly squint: the 'called it' face. Steeper, more vertical gradient.",
		angle: [0.25, 0, 0.75, 1],
		stops: [[0, ROSE], [1, AMBER]],
		body: T(P(poly([[492, 222], [346, 160], [298, 128], [230, 138], [186, 182], [170, 248], [162, 312], [122, 366], [182, 354], [158, 414], [216, 392], [210, 446], [274, 406], [318, 352], [344, 296], [362, 266]]))),
		holes: [Ti("M252 198 L328 166 L320 194 Q290 210 252 198 Z")],
	},
	{
		key: "03-perched",
		title: "Perched",
		note: "Full bird on a branch, bottom-anchored. Tiny dot eye. Flatter, more horizontal gradient.",
		angle: [0, 0.15, 1, 0.85],
		stops: [[0, ROSE], [1, AMBER]],
		body:
			P(poly([[410, 180], [334, 150], [306, 124], [260, 120], [228, 140], [214, 176], [190, 226], [164, 284], [142, 332], [84, 420], [128, 406], [118, 446], [178, 378], [214, 392], [266, 384], [306, 344], [324, 290], [324, 240], [330, 212], [344, 200]])) +
			P(poly([[214, 380], [232, 380], [232, 420], [214, 420]])) +
			P(poly([[252, 376], [270, 376], [270, 420], [252, 420]])) +
			P("M150 412 H420 a12 12 0 0 1 0 24 H150 a12 12 0 0 1 0 -24 Z"),
		holes: [HOLE(circle(300, 160, 12))],
	},
	{
		key: "04-over-the-shoulder",
		title: "Over the shoulder",
		note: "Body turned away, head snapped back to the right, as if checking who's behind on the leaderboard.",
		angle: [0, 0, 1, 1],
		stops: [[0, ROSE], [0.5, ORANGE], [1, AMBER]],
		body:
			P(poly([[404, 168], [306, 136], [276, 108], [226, 104], [190, 124], [174, 160], [168, 198], [146, 240], [140, 296], [158, 346], [204, 378], [258, 388], [372, 420], [440, 446], [414, 412], [446, 404], [370, 352], [318, 300], [276, 250], [262, 214], [292, 190], [312, 182]])) +
			P(poly([[212, 380], [230, 380], [226, 430], [208, 430]])) +
			P(poly([[248, 384], [266, 384], [262, 430], [244, 430]])),
		holes: [HOLE(circle(262, 146, 13)), HOLE(poly([[228, 250], [244, 240], [392, 398], [378, 404]]))],
	},
	{
		key: "05-crowned",
		title: "Crowned",
		note: "The current mark with a tiny jaunty crown floating just above the head. Winner energy.",
		angle: [0, 0, 1, 1],
		stops: [[0, ROSE], [1, AMBER]],
		body: T(P(CURRENT), 0.78, 62, 72) + P(poly([[220, 168], [212, 120], [238, 140], [250, 100], [264, 132], [290, 108], [292, 158]])),
		holes: [Ti(circle(290, 188, 15), 0.78, 62, 72)],
	},
	{
		key: "06-caw-burst",
		title: "Caw burst",
		note: "Current pose nudged left, with three short sound wedges coming off the beak. Gradient runs top-to-bottom-right.",
		angle: [0.1, 0, 0.9, 1],
		stops: [[0, ROSE], [0.6, ORANGE], [1, AMBER]],
		body:
			T(P(CURRENT), 0.74, 22, 62) +
			[-34, 0, 34]
				.map((a) => `<path transform="translate(402 246) rotate(${a})" d="M24 -9 L74 -4 Q80 0 74 4 L24 9 Z"/>`)
				.join(""),
		holes: [Ti(circle(290, 188, 15), 0.74, 22, 62)],
	},
	{
		key: "07-bold-crop-check",
		title: "Bold crop + check",
		note: "Big bust rising from the bottom-left edge, cropped by the tile. A checkmark is cut into the shoulder.",
		angle: [0, 0, 0.75, 1],
		stops: [[0, ROSE], [1, AMBER]],
		body: P(poly([[476, 232], [334, 186], [294, 148], [222, 146], [168, 186], [128, 252], [64, 330], [-40, 420], [-40, 600], [420, 600], [384, 470], [350, 380], [336, 330], [346, 304], [452, 292], [358, 244]])),
		holes: [HOLE(circle(278, 210, 17)), HOLE(poly([[128, 410], [152, 386], [188, 420], [256, 350], [280, 374], [188, 466]]))],
	},
	{
		key: "08-round-friendly",
		title: "Round and friendly",
		note: "Rounder head, chunkier short beak, rounded-off ruff feathers and a sparkle glint for an eye. Softer, more horizontal gradient.",
		angle: [0, 0.3, 1, 0.7],
		stops: [[0, ROSE], [0.5, ORANGE], [1, AMBER]],
		body:
			P(circle(238, 226, 112)) +
			P("M318 168 L436 222 Q446 230 436 238 L322 290 Z") +
			P("M182 236 L150 336 Q142 360 166 356 L200 350 L174 404 Q166 426 188 418 L230 398 L226 438 Q226 458 244 446 L302 404 Q334 366 342 300 L332 236 Z"),
		holes: [HOLE(sparkle(282, 200, 26))],
	},
];

(async () => {
	const browser = await chromium.launch();
	const page = await browser.newPage();
	const shot = async (html, w, h, file) => {
		await page.setViewportSize({ width: w, height: h });
		await page.setContent(`<style>html,body{margin:0;background:transparent}</style>${html}`);
		await page.screenshot({ path: path.join(out, file), omitBackground: true });
	};
	const sized = (svg, px) => svg.replace("<svg ", `<svg width="${px}" height="${px}" style="display:block" `);

	for (const v of variants) {
		const svg = icon(v);
		fs.writeFileSync(path.join(out, v.key + ".svg"), svg + "\n");
		await shot(sized(svg, 1024), 1024, 1024, v.key + ".png");
	}
	const mono = icon(variants[0], { mono: true });
	fs.writeFileSync(path.join(out, "09-silhouette-mono.svg"), mono + "\n");
	await shot(sized(mono, 1024), 1024, 1024, "09-silhouette-mono.png");

	// Contact sheet: each icon large, then at 48px on light and dark home screens.
	const all = [...variants, { key: "09-silhouette-mono", title: "Mono silhouette", mono: true }];
	const cell = (v) => {
		const svg = v.mono ? mono : icon(v);
		const tag = (s) => s.replaceAll(`${v.key}-`, `${v.key}-${Math.random().toString(36).slice(2, 6)}-`);
		return `<div class="cell"><div class="big">${tag(sized(svg, 220))}</div>
<div class="row"><div class="home light">${tag(sized(svg, 48))}</div><div class="home dark">${tag(sized(v.mono ? svg.replace(/(<g mask="[^"]+") fill="#000">/, '$1 fill="#fff">') : svg, 48))}</div></div>
<div class="t">${v.key.slice(0, 2)} · ${v.title}</div></div>`;
	};
	const sheet = `<style>
body{margin:0;padding:32px;background:#e7e5e4;font:600 15px system-ui,sans-serif;color:#1c1917}
.grid{display:grid;grid-template-columns:repeat(3,260px);gap:28px}
.cell{background:#fff;border-radius:20px;padding:20px;display:flex;flex-direction:column;align-items:center;gap:14px}
.big{background:repeating-conic-gradient(#eee 0 25%,#fff 0 50%) 0 0/20px 20px;border-radius:8px}
.row{display:flex;gap:10px}.home{width:96px;height:72px;border-radius:12px;display:grid;place-items:center}
.light{background:#f5f5f4}.dark{background:#0c0a09}.t{text-align:center}</style>
<div class="grid">${all.map(cell).join("")}</div>`;
	await page.setViewportSize({ width: 3 * 260 + 2 * 28 + 64, height: 400 });
	await page.setContent(sheet);
	await page.screenshot({ path: path.join(out, "contact-sheet.png"), fullPage: true });
	await browser.close();
	console.log("done");
})();
