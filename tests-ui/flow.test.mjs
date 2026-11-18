// 画面のテスト（Mac の Chrome を、iPhone SE の Safari でツールバーが出ているときの 375×553 で動かす）
// 使い方: npm run test:ui
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import puppeteer from "puppeteer-core";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APP = "file://" + path.join(ROOT, "index.html");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const E = require("../engine.js");
const D = require("../data.js");
const KEY = "horihori-tensei-v1";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let browser;
before(async () => { browser = await puppeteer.launch({ executablePath: CHROME, headless: true }); });
after(async () => { await browser?.close(); });

async function open({ save = null } = {}) {
  const ctx = await browser.createBrowserContext();
  const p = await ctx.newPage();
  await p.emulate({ viewport: { width: 375, height: 553, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" });
  p.errors = [];
  p.dialogs = [];
  p.on("pageerror", (e) => p.errors.push(e.message));
  p.on("dialog", (d) => { p.dialogs.push(d.message()); d.dismiss(); });
  await p.goto(APP);
  await p.evaluate((k, s) => { localStorage.clear(); localStorage.setItem("horihori-tensei-sound", "off"); if (s) localStorage.setItem(k, JSON.stringify(s)); }, KEY, save);
  await p.goto(APP);
  return p;
}
const screen = (p) => p.$eval("#app", (el) => el.dataset.screen);
const saved = (p) => p.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);
const click = (p, sel) => p.$eval(sel, (el) => el.click());
const text = (p, sel = "#app") => p.$eval(sel, (el) => el.textContent);
// 画面からはみ出していないか：ボタンやカードが、画面の中に収まっているか（中でスクロールする一覧の中身は除く）
const fits = (p) => p.evaluate(() => {
  if (document.scrollingElement.scrollHeight > window.innerHeight + 1) return false;
  const els = [...document.querySelectorAll("#app button, #app .glass, #app .detail, #app .hud, #app nav, #wall")]
    .filter((el) => !el.closest(".shop, .records") && el.getClientRects().length);
  if (!els.every((el) => { const r = el.getBoundingClientRect(); return r.top >= -1 && r.bottom <= window.innerHeight + 1 && r.left >= -1 && r.right <= window.innerWidth + 1; })) return false;
  // 下のメニューと重なっていないか
  const nav = document.querySelector("#app nav");
  if (!nav) return true;
  const navTop = nav.getBoundingClientRect().top;
  return [...document.querySelectorAll("#app .screen button, #app .screen .glass, #app .screen .detail")]
    .filter((el) => el.getClientRects().length).every((el) => el.getBoundingClientRect().bottom <= navTop + 1);
});
async function tapPit(p, n = 1) {
  const box = await (await p.$("#pit")).boundingBox();
  for (let i = 0; i < n; i++) await p.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
}
async function saveNow(p) { await p.evaluate(() => window.dispatchEvent(new Event("pagehide"))); }
const mk = (fn) => { const g = E.newGame({ seed: 3 }); fn && fn(g); return { v: 1, game: g }; };

test("はじめから：タップで掘れて、お金で仲間を買える。閉じても、つづきから同じところに戻れる", async () => {
  const p = await open();
  assert.equal(await screen(p), "title");
  assert.ok(await fits(p));
  await click(p, '[data-act="new"]');
  assert.equal(await screen(p), "dig");
  await tapPit(p, 30);
  assert.ok(await p.$(".float"), "タップで数字が飛ぶ");
  await saveNow(p);
  let s = await saved(p);
  assert.ok(s.game.life.depth > 10, String(s.game.life.depth));
  assert.ok(s.game.life.money >= 15);
  await click(p, '[data-buy="apprentice"]');
  await saveNow(p);
  s = await saved(p);
  assert.equal(s.game.life.owned.apprentice, 1);
  assert.match(await text(p, "#depth"), /m/);
  assert.ok(await fits(p));
  await p.reload();
  assert.equal(await screen(p), "title");
  await click(p, '[data-act="continue"]');
  assert.equal(await screen(p), "dig");
  await wait(1200);
  await saveNow(p);
  const s2 = await saved(p);
  assert.equal(s2.game.life.owned.apprentice, 1);
  assert.ok(s2.game.life.depth > s.game.life.depth, "仲間が自動で掘っている");
  assert.deepEqual(p.errors, []);
});

test("道具タブでつるはしを強化できる", async () => {
  const p = await open({ save: mk((g) => { g.life.money = 1000; }) });
  await click(p, '[data-act="continue"]');
  await click(p, '[data-tab="tools"]');
  await click(p, '[data-upg="pick_iron"]');
  await saveNow(p);
  assert.equal((await saved(p)).game.life.upgrades.pick_iron, true);
  assert.ok(await fits(p));
});

test("マントルの壁で止まると知らせが出て、スキルツリーで耐熱スーツを開放すると先へ進める", async () => {
  const p = await open({ save: mk((g) => {
    g.life.layer = 3; g.life.depth = 35000; g.life.atWall = true; g.shards = 40;
    g.life.owned.machine = 5;
  }) });
  await click(p, '[data-act="continue"]');
  await wait(300);
  assert.ok(await p.$("#wall"), "壁の知らせ");
  assert.match(await text(p, "#wall"), /耐熱スーツ/);
  assert.ok(await fits(p));
  await click(p, '[data-nav="tree"]');
  assert.equal(await screen(p), "tree");
  assert.ok(await fits(p));
  await click(p, '[data-node="suit"]');
  await click(p, '[data-act="unlock"]');
  await saveNow(p);
  assert.equal((await saved(p)).game.tree.suit, true);
  await click(p, '[data-nav="dig"]');
  await wait(800);
  assert.equal(await p.$("#wall"), null);
  await saveNow(p);
  assert.ok((await saved(p)).game.life.depth > 35000);
  assert.deepEqual(p.errors, []);
});

test("転生：もらえる星のかけらを確かめて生まれ変わると、深さが 0 に戻り、かけらが増える", async () => {
  const p = await open({ save: mk((g) => { g.life.layer = 2; g.life.depth = 5000; g.life.money = 123; }) });
  await click(p, '[data-act="continue"]');
  await click(p, '[data-nav="rebirth"]');
  assert.equal(await screen(p), "rebirth");
  const expect = Math.floor(Math.sqrt(5000 / D.SHARD_DIV));
  assert.match(await text(p), new RegExp("✦\\s*" + expect));
  assert.ok(await fits(p));
  await click(p, '[data-act="reborn"]');
  assert.equal(await screen(p), "dig");
  await saveNow(p);
  const s = await saved(p);
  assert.equal(s.game.lifeNo, 2);
  assert.equal(s.game.shards, expect);
  assert.ok(s.game.life.depth < 5);
  assert.match(await text(p), /2回目の人生/);
});

test("前世より速く節目に着くと、時間の比べっこが出る", async () => {
  const p = await open({ save: mk((g) => { g.lifeNo = 2; g.prevReach = { 10: 300 }; g.lives = [{ lifeNo: 1, maxDepth: 500, t: 400, shards: 3 }]; }) });
  await click(p, '[data-act="continue"]');
  await tapPit(p, 20);
  await wait(200);
  const t = await text(p, "#toasts");
  assert.match(t, /前世/);
  assert.match(t, /倍速/);
});

test("光る鉱石が出たらタップでブースト", async () => {
  const p = await open({ save: mk((g) => { g.life.ore.next = 0.3; }) });
  await click(p, '[data-act="continue"]');
  await p.waitForSelector("#ore", { timeout: 3000 });
  await click(p, "#ore");
  assert.ok(await p.$("#boost"));
  assert.match(await text(p, "#boost"), /7/);
});

test("地球の中心に着くとクリア画面。記録も見られる", async () => {
  const p = await open({ save: mk((g) => {
    for (const id of ["suit", "drill", "starpick", "f5"]) g.tree[id] = true;
    g.life.layer = 6; g.life.depth = D.GOAL - 30; g.life.owned.chitei = 3;
    g.lives = [{ lifeNo: 1, maxDepth: 35000, t: 600, shards: 31 }]; g.lifeNo = 2;
  }) });
  await click(p, '[data-act="continue"]');
  await p.waitForFunction(() => document.querySelector("#app").dataset.screen === "clear", { timeout: 4000 });
  assert.match(await text(p), /地球の中心/);
  assert.ok(await fits(p));
  await click(p, '[data-act="records"]');
  assert.equal(await screen(p), "records");
  assert.match(await text(p), /1回目/);
  assert.ok(await fits(p));
});

test("化石図鑑とスキルツリーの画面も収まる", async () => {
  const p = await open({ save: mk((g) => { g.tree.o3 = true; g.fossils.acorn = { lifeNo: 1, depth: 30 }; g.shards = 5; }) });
  await click(p, '[data-act="continue"]');
  await click(p, '[data-nav="book"]');
  assert.equal(await screen(p), "book");
  assert.match(await text(p), /どんぐり/);
  assert.ok(await fits(p));
  await click(p, '[data-nav="tree"]');
  assert.ok(await fits(p));
  await click(p, '[data-node="t1"]');
  assert.match(await text(p), /強いつるはし/);
  await click(p, '[data-act="unlock"]');
  await saveNow(p);
  assert.equal((await saved(p)).game.shards, 4);
});

test("セーブがあるときの「はじめから」は画面内で確認。やめればセーブは残る", async () => {
  const p = await open({ save: mk((g) => { g.life.depth = 777; }) });
  await click(p, '[data-act="new"]');
  assert.deepEqual(p.dialogs, []);
  await click(p, '[data-act="confirm-no"]');
  assert.equal(await screen(p), "title");
  assert.equal((await saved(p)).game.life.depth, 777);
  await click(p, '[data-act="new"]');
  await click(p, '[data-act="confirm-yes"]');
  assert.equal(await screen(p), "dig");
});

test("こわれたセーブでも、タイトルから新しく始められる", async () => {
  const p = await open();
  await p.evaluate((k) => localStorage.setItem(k, "{こわれた"), KEY);
  await p.reload();
  assert.equal(await screen(p), "title");
  assert.equal(await p.$('[data-act="continue"]'), null);
  await click(p, '[data-act="new"]');
  assert.equal(await screen(p), "dig");
  assert.deepEqual(p.errors, []);
});

test("はみ出しチェックは、本当にはみ出したら気づける", async () => {
  const p = await open();
  assert.ok(await fits(p));
  await p.evaluate(() => document.querySelector(".screen").insertAdjacentHTML("afterbegin", '<div style="height:900px;flex:none"></div>'));
  assert.equal(await fits(p), false);
});

test("壁の「スキルツリーで開放する」からは、必要な道具が選ばれた状態で開く", async () => {
  const p = await open({ save: mk((g) => { g.life.layer = 3; g.life.depth = 35000; g.life.atWall = true; g.shards = 40; }) });
  await click(p, '[data-act="continue"]');
  await p.waitForSelector("#wall");
  await click(p, '#wall [data-nav="tree"]');
  assert.equal(await p.$eval('[aria-pressed="true"][data-node]', (e) => e.dataset.node), "suit");
  assert.match(await text(p, ".detail"), /耐熱スーツ/);
});

test("前の人生が壁で終わったときは、ツリーを開くと道具が選ばれていて、ほかのマスを買うと足りなくなるなら注意が出る", async () => {
  const p = await open({ save: mk((g) => { g.shards = 12; g.lives = [{ lifeNo: 1, maxDepth: 35000, t: 600, shards: 24, wall: "suit" }]; g.lifeNo = 2; }) });
  await click(p, '[data-act="continue"]');
  await click(p, '[data-nav="tree"]');
  assert.equal(await p.$eval('[aria-pressed="true"][data-node]', (e) => e.dataset.node), "suit");
  await click(p, '[data-node="t1"]');
  assert.match(await text(p, ".detail"), /耐熱スーツ/, "道具のぶんが足りなくなる注意");
});

test("クリアしたあと「つづきから」はクリア画面へ。掘る画面にも、クリアずみと出る", async () => {
  const p = await open({ save: mk((g) => {
    for (const id of ["suit", "drill", "starpick"]) g.tree[id] = true;
    g.life.layer = 6; g.life.depth = D.GOAL; g.life.cleared = true; g.cleared = true;
    g.clears = [{ lifeNo: 1, totalTime: 6000, lifeTime: 6000 }];
  }) });
  await click(p, '[data-act="continue"]');
  assert.equal(await screen(p), "clear");
  await click(p, '[data-nav="dig"]');
  assert.match(await text(p, "#pit"), /クリア/);
  assert.doesNotMatch(await text(p, "#speed"), /毎秒/);
});

test("掘る画面でも音のオンオフができる", async () => {
  const p = await open({ save: mk() });
  await click(p, '[data-act="continue"]');
  assert.match(await text(p, '.hud [data-act="sound"]'), /🔇/);
  await click(p, '.hud [data-act="sound"]');
  assert.match(await text(p, '.hud [data-act="sound"]'), /🔊/);
  assert.equal(await p.evaluate(() => localStorage.getItem("horihori-tensei-sound")), "on");
});

test("別のタブで進んだセーブを、古いタブが上書きしない", async () => {
  const p = await open({ save: mk((g) => { g.life.depth = 50; }) });
  await click(p, '[data-act="continue"]');
  // ほかのタブで先に進んだことにする
  const newer = mk((g) => { g.life.depth = 99999; g.life.layer = 3; });
  await p.evaluate((k, s) => { s.savedAt = Date.now() + 60000; localStorage.setItem(k, JSON.stringify(s)); window.dispatchEvent(new StorageEvent("storage", { key: k })); }, KEY, newer);
  await wait(300);
  await saveNow(p);
  const s = await saved(p);
  assert.ok(s.game.life.depth >= 99999, "新しいほうが残る");
  assert.equal(await screen(p), "title", "古いタブはタイトルにもどる");
});

test("ほかの画面にいる間に着いた節目や化石も、掘る画面にもどると知らせが出る", async () => {
  const p = await open({ save: mk((g) => { g.life.owned.mole = 40; g.lifeNo = 2; g.prevReach = { 100: 400 }; }) });
  await click(p, '[data-act="continue"]');
  await click(p, '[data-nav="book"]');
  await wait(1500);
  await click(p, '[data-nav="dig"]');
  assert.match(await text(p, "#toasts"), /前世/);
});

test("転生画面のかけらの数は、掘り進むと増えていく。記録も見られる", async () => {
  const p = await open({ save: mk((g) => { g.life.layer = 2; g.life.depth = 3000; g.life.owned.tunnel = 30; }) });
  await click(p, '[data-act="continue"]');
  await click(p, '[data-nav="rebirth"]');
  const a = await text(p, "#shardGain");
  await wait(2500);
  const b = await text(p, "#shardGain");
  assert.notEqual(a, b);
  assert.ok(await fits(p), "転生画面が下のメニューと重ならない");
  await click(p, '[data-act="records"]');
  assert.equal(await screen(p), "records");
  await click(p, '[data-act="back"]');
  assert.equal(await screen(p), "rebirth");
  await click(p, '[data-nav="book"]');
  assert.ok(await fits(p), "図鑑が下のメニューと重ならない");
});

test("やとった仲間・機械が穴の中に見える。買うと増え、持っていないものは出ない", async () => {
  const p = await open({ save: mk((g) => { g.life.money = 5000; g.life.owned.mole = 30; }) });
  await click(p, '[data-act="continue"]');
  assert.equal(await p.$('#crew [data-crew="apprentice"]'), null, "まだやとっていない");
  assert.match(await text(p, '#crew [data-crew="mole"]'), /30/);
  assert.equal(await p.$$eval('#crew [data-crew="mole"] .who', (x) => x.length), 3, "絵は 3体まで");
  await click(p, '[data-buy="apprentice"]');
  assert.ok(await p.$('#crew [data-crew="apprentice"].new'), "新しく来たときは登場の動き");
  assert.equal(await p.$$eval('#crew [data-crew="apprentice"] .who', (x) => x.length), 1);
  await click(p, '[data-buy="apprentice"]');
  assert.equal(await p.$$eval('#crew [data-crew="apprentice"] .who', (x) => x.length), 2);
  assert.ok(await fits(p));
});

test("仲間の絵の上をタップしても、ちゃんと掘れる", async () => {
  const p = await open({ save: mk((g) => { g.life.owned.mole = 5; }) });
  await click(p, '[data-act="continue"]');
  const box = await (await p.$('#crew [data-crew="mole"]')).boundingBox();
  await saveNow(p);
  const before = (await saved(p)).game.life.depth;
  for (let i = 0; i < 10; i++) await p.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  assert.ok(await p.$(".float"), "タップの数字が出る");
  await saveNow(p);
  assert.ok((await saved(p)).game.life.depth > before);
});
