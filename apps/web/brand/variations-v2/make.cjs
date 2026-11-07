// Nine icon variations, round two: oversized angular crow cropped edge to edge,
// white squint eye, curved rose crescent in the wing. Exploration only; the
// shipped icons still come from brand/crow.svg. From apps/web:
//   NODE_PATH=$(npm root -g) node brand/variations-v2/make.cjs
//
// Colours are literal because these are image files, not themed UI. They match
// the app tokens --primary (rose), --accent (amber) and --brand-ink (crow), plus
// an orange mid-stop and white for the eye.
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const ROSE = "#ff2056";
const ORANGE = "#ff5a1f";
const AMBER = "#fe9a00";
const INK = "#020617";
const out = __dirname;

const scaleAt = ([x, y], [px, py], k) => [px + (x - px) * k, py + (y - py) * k];
const d = (pts) => "M" + pts.map((p) => p.map((n) => +n.toFixed(1)).join(" ")).join(" L") + " Z";

const BASE = {
	head: 1, // head size around the neck
	beak: 0, // extra beak length
	scale: 1, // whole bird, around the bottom-left
	wing: [150, 320, 170, 372], // crescent: outer and inner control points
	wingWidth: 1,
	eye: "squint",
	angle: [0, 0, 1, 1],
	stops: [[0, ROSE], [0.5, ORANGE], [1, AMBER]],
};

const icon = (key, o) => {
	const v = { ...BASE, ...o };
	const neck = [230, 250];
	const H = (p) => scaleAt(p, neck, v.head);
	const tip = [494 + v.beak, 226];
	const head = [tip, [330, 168], [302, 118], [228, 110], [166, 150], [140, 214]].map((p, i) => (i === 0 ? H([p[0], p[1]]) : H(p)));
	const body = [[40, 326], [-60, 420], [-60, 620], [430, 620], [394, 470], [358, 372], [336, 306]];
	const chin = [[344, 276]].map(H);
	const pivot = [40, 560];
	const S = (p) => scaleAt(p, pivot, v.scale);
	const crow = [...head, ...body, ...chin].map(S);

	// Wing crescent, from shoulder low-left up toward the chest.
	const [ox, oy, ix, iy] = v.wing;
	const w = v.wingWidth;
	const A = S([70, 476]), B = S([332, 362]), O = S([ox, oy - (w - 1) * 30]), I = S([ix, iy]);
	const wing = `M${A[0]} ${A[1]} Q${O[0]} ${O[1]} ${B[0]} ${B[1]} Q${I[0]} ${I[1]} ${A[0]} ${A[1]} Z`;

	// Eye shapes, drawn around the head then moved with it.
	const eyes = {
		squint: [[244, 202], [320, 174], [312, 202], [282, 214]],
		slash: [[240, 204], [324, 172], [318, 190], [282, 204]],
		lid: [[248, 196], [318, 184], [310, 206], [272, 214]],
	};
	const e = eyes[v.eye].map(H).map(S);
	const eye = `M${e[0]} L${e[1]} L${e[2]} Q${e[3]} ${e[0]} Z`.replace(/,/g, " ");

	const [x1, y1, x2, y2] = v.angle;
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs>
<linearGradient id="${key}-g" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${v.stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join("")}</linearGradient>
<clipPath id="${key}-c"><rect width="512" height="512" rx="138"/></clipPath></defs>
<rect width="512" height="512" rx="138" fill="url(#${key}-g)"/>
<g clip-path="url(#${key}-c)"><path fill="${INK}" d="${d(crow)}"/><path fill="${ROSE}" d="${wing}"/><path fill="#fff" d="${eye}"/></g></svg>`;
};

// One or two changes from the base per icon.
const variants = [
	["01-base", {}],
	["02-big-head", { head: 1.12, beak: -30 }],
	["03-deep-wing", { wing: [120, 250, 190, 350] }],
	["04-slash-eye", { eye: "slash" }],
	["05-oversized", { scale: 1.1, beak: -38 }],
	["06-steep-gradient", { angle: [0.3, 0, 0.7, 1], head: 0.94, beak: 8 }],
	["07-long-beak", { beak: 12, wing: [160, 340, 180, 380], wingWidth: 0.8 }],
	["08-thick-wing", { wingWidth: 1.6 }],
	["09-lidded-eye", { eye: "lid", angle: [0, 0.25, 1, 0.75] }],
];

(async () => {
	const svgs = variants.map(([k, o]) => [k, icon(k, o)]);
	const sized = (svg, px) => svg.replace("<svg ", `<svg width="${px}" height="${px}" style="display:block" `);
	const browser = await chromium.launch();
	const page = await browser.newPage();
	const shot = async (html, w, h, file) => {
		await page.setViewportSize({ width: w, height: h });
		await page.setContent(`<style>html,body{margin:0;background:transparent}</style>${html}`);
		await page.screenshot({ path: path.join(out, file), omitBackground: true, fullPage: true });
	};
	for (const [k, svg] of svgs) {
		fs.writeFileSync(path.join(out, k + ".svg"), svg + "\n");
		await shot(sized(svg, 1024), 1024, 1024, k + ".png");
	}
	// The 3x3 grid: no labels, even spacing.
	const grid = (px, gap, bg) =>
		`<div style="display:grid;grid-template-columns:repeat(3,${px}px);gap:${gap}px;padding:${gap}px;background:${bg};width:max-content">${svgs.map(([, s]) => sized(s, px)).join("")}</div>`;
	await shot(grid(320, 48, "#f5f5f4"), 3 * 320 + 4 * 48, 100, "grid.png");
	// Home-screen check at 48px, light and dark.
	await shot(`<div style="display:flex">${grid(48, 20, "#f5f5f4")}${grid(48, 20, "#0c0a09")}</div>`, 400, 100, "grid-48px.png");
	await browser.close();
	console.log("done");
})();
