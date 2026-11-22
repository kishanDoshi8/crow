// Makes public/og-image.jpg, the 1200×630 picture shown when a Crow link is
// pasted into a chat (invites, results, the landing page). It mirrors the
// landing hero: the line on the left, a revealed example question on the right.
// From apps/web: node og/render.mjs (needs Playwright).
//
// Colours come from the app's dark theme tokens, read from global.css, so the
// image follows the palette. The crow mark comes from brand/crow.svg.
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const web = path.join(here, "..");
const require = createRequire(import.meta.url);

// The dark theme's custom properties, e.g. "--card: oklch(...);".
const css = readFileSync(path.join(web, "src/shared/assets/styles/global.css"), "utf8");
const darkBlock = css.match(/\.dark\s*\{([\s\S]*?)\n\}/)[1];
const lightBlock = css.match(/:root\s*\{([\s\S]*?)\n\}/)[1];
const vars = (block) => [...block.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => `${m[1]}: ${m[2]};`).join("\n");

const font = pathToFileURL(
	require.resolve("@fontsource-variable/fira-code/files/fira-code-latin-wght-normal.woff2"),
).href;

// The mark on its sunset tile, built from crow.svg's shapes like the icons.
const source = readFileSync(path.join(web, "brand", "crow.svg"), "utf8");
const shape = (id) => source.match(new RegExp(`id="${id}"[^>]* d="([^"]+)"`))[1];
const pupil = source.match(/id="pupil" cx="(\d+)" cy="(\d+)" r="(\d+)"/).slice(1);
const svg = `<svg viewBox="0 0 512 512"><defs><linearGradient id="sun" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" style="stop-color:var(--primary)"/><stop offset="1" style="stop-color:var(--accent)"/></linearGradient></defs>
  <rect width="512" height="512" fill="url(#sun)"/>
  <path fill-rule="evenodd" style="fill:var(--brand-ink)" d="${shape("crow")}"/>
  <path style="fill:var(--primary)" d="${shape("wing")}"/>
  <path style="fill:var(--brand-eye)" d="${shape("eye")}"/>
  <circle cx="${pupil[0]}" cy="${pupil[1]}" r="${pupil[2]}" style="fill:var(--brand-ink)"/></svg>`;

const options = [
	{ label: "Arsenal", share: 46, color: "var(--option-1)", winner: true },
	{ label: "Draw", share: 22, color: "var(--option-2)" },
	{ label: "Spurs", share: 32, color: "var(--option-3)" },
];

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: "Fira Code"; src: url("${font}") format("woff2"); font-weight: 300 700; }
:root { ${vars(lightBlock)} }
:root { ${vars(darkBlock)} }
* { box-sizing: border-box; margin: 0; }
html, body { width: 1200px; height: 630px; }
body {
  background: var(--background); color: var(--foreground);
  font-family: "Fira Code", monospace; display: flex; align-items: center;
  gap: 56px; padding: 0 64px;
}
.left { flex: 1; min-width: 0; }
.brand { display: flex; align-items: center; gap: 16px; font-size: 34px; font-weight: 700; letter-spacing: -0.02em; }
.tile { width: 64px; height: 64px; border-radius: 17px; overflow: hidden; }
.tile svg { width: 100%; height: 100%; display: block; }
h1 { margin-top: 40px; font-size: 70px; line-height: 1.04; font-weight: 700; letter-spacing: -0.03em; white-space: nowrap; }
p.sub { margin-top: 28px; font-size: 24px; line-height: 1.5; color: var(--muted-foreground); max-width: 540px; }
.card {
  flex: none; width: 480px; background: var(--card); border: 2px solid var(--border);
  border-radius: 28px; padding: 32px;
}
.head { white-space: nowrap; display: flex; justify-content: space-between; align-items: center; font-size: 18px; color: var(--muted-foreground); }
.pill { color: var(--win); background: color-mix(in oklch, var(--win) 14%, transparent); border-radius: 999px; padding: 4px 14px; font-weight: 600; }
.q { margin-top: 20px; font-size: 28px; font-weight: 600; line-height: 1.3; }
.opts { margin-top: 24px; display: flex; flex-direction: column; gap: 12px; }
.opt { position: relative; overflow: hidden; display: flex; justify-content: space-between; align-items: center;
  border: 2px solid var(--border); border-radius: 14px; padding: 16px 20px; font-size: 22px; font-weight: 500; }
.opt.win { border-color: color-mix(in oklch, var(--win) 60%, transparent); }
.fill { position: absolute; inset: 0 auto 0 0; opacity: 0.22; }
.name, .pct { position: relative; display: flex; align-items: center; gap: 12px; }
.dot { width: 14px; height: 14px; border-radius: 50%; }
.pct { color: var(--muted-foreground); font-variant-numeric: tabular-nums; }
.win .pct { color: var(--win); font-weight: 600; }
.result { margin-top: 24px; font-size: 21px; white-space: nowrap; }
.result b { color: var(--win); margin-right: 10px; }
</style></head><body>
<div class="left">
  <div class="brand"><div class="tile">${svg}</div>crow</div>
  <h1>Call it.<br>Crow about it.</h1>
  <p class="sub">The prediction game for your group chat. Same points for everyone, most points wins.</p>
</div>
<div class="card">
  <div class="head"><span>Example question</span><span class="pill">● Result's in</span></div>
  <div class="q">Who wins the derby on Sunday?</div>
  <div class="opts">
    ${options
			.map(
				(o) => `<div class="opt${o.winner ? " win" : ""}">
      <span class="fill" style="width:${o.share}%;background:${o.color}"></span>
      <span class="name"><span class="dot" style="background:${o.color}"></span>${o.label}</span>
      <span class="pct">${o.winner ? "✓ " : ""}${o.share}%</span></div>`,
			)
			.join("")}
  </div>
  <div class="result"><b>+117</b>Called it. Crow about it.</div>
</div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html, { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: path.join(web, "public", "og-image.jpg"), type: "jpeg", quality: 90 });
await browser.close();
console.log("wrote public/og-image.jpg");
