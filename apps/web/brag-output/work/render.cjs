const { chromium } = require("playwright");
const fs = require("fs");
(async () => {
  const FPS = 30, DUR = 20, out = process.env.OUT || "frames";
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: process.env.FORMAT === "vertical" ? 1080 : 1920, height: process.env.FORMAT === "vertical" ? 1920 : 1080 }, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.error("pageerror", e.message));
  await page.goto("http://localhost:5199/?format=" + (process.env.FORMAT || "landscape"));
  await page.waitForFunction(() => typeof window.__setTime === "function");
  await page.evaluate(() => document.fonts.ready);
  for (let f = 0; f < FPS * DUR; f++) {
    await page.evaluate((t) => window.__setTime(t), f / FPS);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await page.screenshot({ path: `${out}/f${String(f).padStart(4, "0")}.png` });
    if (f % 100 === 0) console.log("frame", f);
  }
  await browser.close();
})();
