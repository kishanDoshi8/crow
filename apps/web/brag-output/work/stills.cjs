(async () => {
const { chromium } = require("playwright");
const times = process.argv.slice(2).map(Number);
const out = process.env.OUT;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
page.on("pageerror", (e) => console.error("pageerror", e.message));
page.on("console", (m) => m.type() === "error" && console.error("console", m.text()));
await page.goto("http://localhost:5199/");
await page.waitForFunction(() => typeof window.__setTime === "function");
await page.evaluate(() => document.fonts.ready);
for (const t of times) {
  await page.evaluate((t) => window.__setTime(t), t);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.screenshot({ path: `${out}/s-${t.toFixed(2)}.png` });
}
await browser.close();
})();
