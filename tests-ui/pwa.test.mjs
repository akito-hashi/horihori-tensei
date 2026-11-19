// ホーム画面に追加・オフライン・演出（動きを減らす設定・音のオンオフ）の確認（ほりほり転生）
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import puppeteer from "puppeteer-core";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const E = require("../engine.js");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".webmanifest": "application/manifest+json" };

let browser, server, BASE;
before(async () => {
  server = http.createServer((req, res) => {
    const u = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const f = path.join(ROOT, u.endsWith("/") ? u + "index.html" : u);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream" });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  BASE = `http://127.0.0.1:${server.address().port}/`;
  browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
});
after(async () => { await browser?.close(); server?.close(); });

async function page() {
  const ctx = await browser.createBrowserContext();
  const p = await ctx.newPage();
  await p.setViewport({ width: 375, height: 667, isMobile: true, hasTouch: true });
  p.errors = [];
  p.on("pageerror", (e) => p.errors.push(e.message));
  return p;
}

test("マニフェストとアイコンがそろっていて、ホーム画面に追加できる", async () => {
  const m = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.webmanifest"), "utf8"));
  assert.equal(m.name, "ほりほり転生");
  assert.equal(m.display, "standalone");
  for (const ic of m.icons) {
    const buf = fs.readFileSync(path.join(ROOT, ic.src));
    assert.equal(buf.subarray(1, 4).toString(), "PNG");
    const [w] = ic.sizes.split("x").map(Number);
    assert.equal(buf.readUInt32BE(16), w);
  }
  assert.ok(fs.existsSync(path.join(ROOT, "icons/icon-180.png")));
  const p = await page();
  await p.goto(BASE);
  assert.equal(await p.$eval('link[rel="manifest"]', (l) => l.getAttribute("href")), "manifest.webmanifest");
  assert.equal(await p.$eval('link[rel="apple-touch-icon"]', (l) => l.getAttribute("href")), "icons/icon-180.png");
});

test("一度開けば、電波がなくても開いて遊べる", async () => {
  const p = await page();
  await p.goto(BASE);
  await p.evaluate(() => navigator.serviceWorker.ready);
  await p.reload();
  await p.waitForFunction(() => navigator.serviceWorker.controller);
  await p.setOfflineMode(true);
  await p.reload();
  assert.equal(await p.$eval("#app", (el) => el.dataset.screen), "title");
  await p.$eval('[data-act="new"]', (e) => e.click());
  assert.equal(await p.$eval("#app", (el) => el.dataset.screen), "dig");
  assert.deepEqual(p.errors, []);
});

test("サービスワーカーが保存するファイルは、すべて実在する", () => {
  const sw = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");
  const files = [...sw.matchAll(/"\.\/([^"]*)"/g)].map((m) => m[1]).filter(Boolean);
  assert.ok(files.length >= 6);
  for (const f of files) assert.ok(fs.existsSync(path.join(ROOT, f)), f);
  for (const f of ["index.html", "style.css", "data.js", "engine.js", "chars.js", "app.js", "sfx.js"]) assert.ok(files.includes(f), `${f} が sw.js にない`);
});

function clearSave() {
  const g = E.newGame({ seed: 5 });
  for (const id of ["suit", "drill", "starpick", "f5"]) g.tree[id] = true;
  g.life.layer = 6; g.life.depth = 6371000 - 20; g.life.lv.soko = 3;
  return { v: 1, game: g };
}
async function toClear(p) {
  await p.evaluate((s) => { localStorage.setItem("horihori-tensei-v1", JSON.stringify(s)); }, clearSave());
  await p.reload();
  await p.$eval('[data-act="continue"]', (e) => e.click());
  await p.waitForFunction(() => document.querySelector("#app").dataset.screen === "credits", { timeout: 4000 });
  await p.$eval('[data-act="skip-credits"]', (e) => e.click()); // エンドロールをとばしてクリア画面へ
  await p.waitForFunction(() => document.querySelector("#app").dataset.screen === "clear", { timeout: 4000 });
  await new Promise((r) => setTimeout(r, 300));
}

test("「動きを減らす」設定のときは、紙ふぶきや動きが出ない", async () => {
  const p = await page();
  await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await p.goto(BASE);
  await toClear(p);
  assert.equal(await p.$$eval(".confetti", (c) => c.length), 0);
  assert.equal(await p.$eval(".gem", (e) => getComputedStyle(e).animationName), "none");
});

test("ふつうの設定ではクリアで紙ふぶきが舞う", async () => {
  const p = await page();
  await p.goto(BASE);
  await toClear(p);
  assert.ok((await p.$$eval(".confetti", (c) => c.length)) > 10);
});

test("音はタイトルで消せて、その設定が残る。音ありで遊んでもエラーが出ない", async () => {
  const p = await page();
  await p.goto(BASE);
  await p.evaluate(() => localStorage.clear());
  await p.reload();
  assert.match(await p.$eval('[data-act="sound"]', (e) => e.textContent), /🔊/);
  await p.$eval('[data-act="new"]', (e) => e.click());
  const box = await (await p.$("#pit")).boundingBox();
  for (let i = 0; i < 40; i++) await p.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await p.$eval('[data-lvup="mog"]', (e) => e.click());
  await new Promise((r) => setTimeout(r, 500));
  assert.deepEqual(p.errors, []);
  await p.goto(BASE);
  await p.$eval('[data-act="sound"]', (e) => e.click());
  assert.match(await p.$eval('[data-act="sound"]', (e) => e.textContent), /🔇/);
  assert.equal(await p.evaluate(() => localStorage.getItem("horihori-tensei-sound")), "off");
  await p.reload();
  assert.match(await p.$eval('[data-act="sound"]', (e) => e.textContent), /🔇/);
});

test("「動きを減らす」設定では、強化したときの光が残らない", async () => {
  const p = await page();
  await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await p.goto(BASE);
  const g = E.newGame({ seed: 2 }); g.life.money = 1e6;
  await p.evaluate((s) => localStorage.setItem("horihori-tensei-v1", JSON.stringify(s)), { v: 1, game: g });
  await p.reload();
  await p.$eval('[data-act="continue"]', (e) => e.click());
  await p.$eval('[data-tab="me"]', (e) => e.click());
  await p.$eval('[data-gear="pick"]', (e) => e.click());
  await new Promise((r) => setTimeout(r, 300));
  const glow = await p.$eval('#pit [data-comp="me"]', (e) => getComputedStyle(e, "::before").content);
  assert.ok(glow === "none" || glow === "normal", glow);
});

test("「動きを減らす」設定でも、ボスに勝った知らせが出る", async () => {
  const p = await page();
  await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await p.goto(BASE);
  const g = E.newGame({ seed: 2 });
  for (const id of ["suit", "drill", "starpick"]) g.tree[id] = true;
  g.cleared = true; g.clears = [{ lifeNo: 1, totalTime: 600, lifeTime: 600 }];
  Object.assign(g.life, { space: true, planet: 0, startPlanet: 0, depth: 1737000, layer: 2, atCore: true, lv: { mog: 2300 } });
  await p.evaluate((s) => localStorage.setItem("horihori-tensei-v1", JSON.stringify(s)), { v: 1, game: g });
  await p.reload();
  await p.$eval('[data-act="continue"]', (e) => e.click());
  await p.waitForSelector('[data-act="boss"]');
  await p.$eval('[data-act="boss"]', (e) => e.click());
  await p.waitForFunction(() => /たおした/.test(document.querySelector("#banner")?.textContent || ""), { timeout: 8000 });
});
