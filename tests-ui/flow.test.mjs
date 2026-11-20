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

async function open({ save = null, reduce = false, block = null } = {}) {
  const ctx = await browser.createBrowserContext();
  const p = await ctx.newPage();
  if (reduce) await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  if (block) {
    await p.setRequestInterception(true);
    p.on("request", (r) => (r.url().includes(block) ? r.abort() : r.continue()));
  }
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
  await click(p, '[data-lvup="mog"]');
  await saveNow(p);
  s = await saved(p);
  assert.equal(s.game.life.lv.mog, 1);
  assert.match(await text(p, "#depth"), /m/);
  assert.ok(await fits(p));
  await p.reload();
  assert.equal(await screen(p), "title");
  await click(p, '[data-act="continue"]');
  assert.equal(await screen(p), "dig");
  await wait(1200);
  await saveNow(p);
  const s2 = await saved(p);
  assert.equal(s2.game.life.lv.mog, 1);
  assert.ok(s2.game.life.depth > s.game.life.depth, "仲間が自動で掘っている");
  assert.deepEqual(p.errors, []);
});

test("自分タブでつるはしを強化できる", async () => {
  const p = await open({ save: mk((g) => { g.life.money = 1000; }) });
  await click(p, '[data-act="continue"]');
  await click(p, '[data-tab="me"]');
  await click(p, '[data-gear="pick"]');
  await saveNow(p);
  assert.equal((await saved(p)).game.life.gear.pick, 1);
  assert.ok(await p.$('#pit [data-comp="me"][data-pick="1"]'), "自分の絵のつるはしが変わる");
  assert.ok(await fits(p));
});

test("マントルの壁で止まると知らせが出て、スキルツリーで耐熱スーツを開放すると先へ進める", async () => {
  const p = await open({ save: mk((g) => {
    g.life.layer = 3; g.life.depth = 35000; g.life.atWall = true; g.shards = 40;
    g.life.lv.drill = 5;
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

test("地球の中心に着くとエンドロールが流れ、そのあとクリア画面。記録も見られる", async () => {
  const p = await open({ save: mk((g) => {
    for (const id of ["suit", "drill", "starpick", "f5"]) g.tree[id] = true;
    g.life.layer = 6; g.life.depth = D.GOAL - 30; g.life.lv.soko = 3;
    g.lives = [{ lifeNo: 1, maxDepth: 35000, t: 600, shards: 31 }]; g.lifeNo = 2;
  }) });
  await click(p, '[data-act="continue"]');
  await p.waitForFunction(() => document.querySelector("#app").dataset.screen === "credits", { timeout: 4000 });
  const roll = await text(p);
  assert.match(roll, /Thank you for playing/);
  assert.match(roll, /モグ/);
  assert.match(roll, /1回目/, "人生の振り返り");
  assert.ok(await p.$("#roll .spr"), "仲間の絵");
  assert.ok(await p.$("#roll .cr-me .spr"), "自分の絵");
  assert.ok(await fits(p));
  await click(p, '[data-act="skip-credits"]');
  assert.equal(await screen(p), "clear");
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
  await click(p, '[data-act="confirm-yes"]'); // 読めないセーブを消す前に確認が出る
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
  const p = await open({ save: mk((g) => { g.life.lv.mog = 40; g.lifeNo = 2; g.prevReach = { 100: 400 }; }) });
  await click(p, '[data-act="continue"]');
  await click(p, '[data-nav="book"]');
  await wait(1500);
  await click(p, '[data-nav="dig"]');
  assert.match(await text(p, "#toasts"), /前世/);
});

test("転生画面のかけらの数は、掘り進むと増えていく。記録も見られる", async () => {
  const p = await open({ save: mk((g) => { g.life.layer = 2; g.life.depth = 3000; g.life.lv.drill = 30; }) });
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

test("仲間は穴の横で掘っている。まだの仲間は出ない。強化で Lv が上がり、Lv.10 で変身する", async () => {
  const p = await open({ save: mk((g) => { g.life.money = 1e6; g.life.lv.mog = 9; }) });
  await click(p, '[data-act="continue"]');
  assert.ok(await p.$('#pit [data-comp="mog"] .spr'), "モグの絵");
  assert.ok(await p.$('#pit [data-comp="me"] .spr'), "自分の絵");
  assert.equal(await p.$('#pit [data-comp="gan"]'), null, "ガンさんはまだ");
  assert.equal(await p.$eval('#pit [data-comp="mog"]', (e) => e.dataset.stage), "0");
  await click(p, '[data-lvup="mog"]');
  assert.equal(await p.$eval('#pit [data-comp="mog"]', (e) => e.dataset.stage), "1", "変身して見た目が変わる");
  assert.ok(await p.$('#pit [data-comp="mog"].transform'), "変身の演出");
  assert.match(await text(p, "#banner"), /変身/);
  assert.match(await text(p, "#shop"), /Lv\.10/);
  assert.ok(await fits(p));
});

test("新しい仲間を強化すると「仲間になった！」と登場する", async () => {
  const p = await open({ save: mk((g) => { g.life.money = 1e6; g.life.layer = 1; g.life.depth = 200; }) });
  await click(p, '[data-act="continue"]');
  await click(p, '[data-lvup="gan"]');
  assert.ok(await p.$('#pit [data-comp="gan"].join'));
  assert.match(await text(p, "#banner"), /仲間になった/);
});

test("Lv が足りると特技を買える", async () => {
  const p = await open({ save: mk((g) => { g.life.money = 1e6; g.life.lv.mog = 10; }) });
  await click(p, '[data-act="continue"]');
  assert.ok(await p.$('[data-skill="mog_a"]:not([disabled])'));
  assert.ok(await p.$('[data-skill="mog_b"][disabled]'), "Lv.25 の特技はまだ");
  await click(p, '[data-skill="mog_a"]');
  await saveNow(p);
  assert.equal((await saved(p)).game.life.skills.mog_a, true);
});

test("オートタップを開放していると、触らなくても自分が掘り続ける", async () => {
  const p = await open({ save: mk((g) => { g.tree.t6 = true; }) });
  await click(p, '[data-act="continue"]');
  await wait(1500);
  assert.ok(await p.$('#pit [data-comp="me"].auto'), "オート中の印");
  assert.ok(await p.$(".float"), "掘った数字が出る");
  await saveNow(p);
  assert.ok((await saved(p)).game.life.depth > 0);
});

test("ドリルンのターボ中は、ターボの見た目になる", async () => {
  const p = await open({ save: mk((g) => { g.life.layer = 2; g.life.depth = 2500; g.life.lv.drill = 12; g.life.skills.drill_a = true; g.life.t = 25.2; }) });
  await click(p, '[data-act="continue"]');
  await p.waitForSelector('#pit [data-comp="drill"].turbo', { timeout: 2000 });
});

test("仲間の絵の上をタップしても、ちゃんと掘れる", async () => {
  const p = await open({ save: mk((g) => { g.life.lv.mog = 5; }) });
  await click(p, '[data-act="continue"]');
  const box = await (await p.$('#pit [data-comp="mog"]')).boundingBox();
  await saveNow(p);
  const before = (await saved(p)).game.life.depth;
  for (let i = 0; i < 10; i++) await p.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  assert.ok(await p.$(".float"), "タップの数字が出る");
  await saveNow(p);
  assert.ok((await saved(p)).game.life.depth > before);
});

test("光る鉱石のブースト表示は上の段（HUD）に出て、仲間の顔にかからない", async () => {
  const p = await open({ save: mk((g) => { g.life.lv = { mog: 30, gan: 20 }; g.life.layer = 1; g.life.depth = 500; g.life.boost = { mult: 7, until: 15, kind: "gold" }; }) });
  await click(p, '[data-act="continue"]');
  await p.waitForSelector("#boost");
  assert.ok(await p.$(".hud #boost"), "ブーストは HUD の中");
  const over = await p.evaluate(() => {
    const b = document.querySelector("#boost").getBoundingClientRect();
    return [...document.querySelectorAll("#pit .tun .who")].some((w) => { const r = w.getBoundingClientRect(); return r.top < b.bottom && r.bottom > b.top && r.left < b.right && r.right > b.left; });
  });
  assert.equal(over, false);
});

test("壁で止まっているときは、オートタップの数字（+0）が出ない", async () => {
  const p = await open({ save: mk((g) => { g.tree.t6 = true; g.life.layer = 3; g.life.depth = 35000; g.life.atWall = true; }) });
  await click(p, '[data-act="continue"]');
  await wait(1200);
  assert.equal(await p.$(".float"), null);
});

test("前のしくみのセーブで続きを始めると、しくみが新しくなったお知らせが 1回だけ出る", async () => {
  const old = { v: 1, rng: 5, lifeNo: 2, shards: 3, tree: {}, fossils: {}, prevReach: {}, lives: [], clears: [], cleared: false, totalTime: 60,
    life: { depth: 300, layer: 1, money: 100, t: 30, reach: {}, taps: [], atWall: false, cleared: false, boost: null, ore: null, owned: { apprentice: 5, mole: 3, shovel: 1 }, upgrades: { pick_iron: true } } };
  const p = await open({ save: { v: 1, game: old } });
  await click(p, '[data-act="continue"]');
  assert.match(await text(p, "#banner"), /新しく/);
  assert.ok(await p.$('#pit [data-comp="gan"]'));
  await saveNow(p);
  assert.ok(!(await saved(p)).game.migrated, "2回目は出ない");
});

test("読めないセーブがあるときも、「はじめから」は確認してから", async () => {
  const p = await open();
  await p.evaluate((k) => localStorage.setItem(k, JSON.stringify({ v: 1, game: { v: 9, life: {} } })), KEY);
  await p.reload();
  await click(p, '[data-act="new"]');
  assert.ok(await p.$('[data-act="confirm-no"]'));
});

// 宇宙（星めぐり）の画面
function spaceSave(fn) {
  return mk((g) => {
    for (const id of ["suit", "drill", "starpick"]) g.tree[id] = true;
    g.cleared = true;
    g.clears = [{ lifeNo: 1, totalTime: 6000, lifeTime: 600 }];
    Object.assign(g.life, { space: true, planet: 0, depth: 0, layer: 0, lv: { mog: 60, gan: 40 } });
    fn && fn(g);
  });
}

test("クリア画面から「宇宙へ」で月へ。星の地層と色になる。エンドロールは記録画面からもう一度見られる", async () => {
  const p = await open({ save: mk((g) => {
    for (const id of ["suit", "drill", "starpick"]) g.tree[id] = true;
    g.life.layer = 6; g.life.depth = D.GOAL; g.life.cleared = true; g.cleared = true;
    g.clears = [{ lifeNo: 1, totalTime: 6000, lifeTime: 6000 }];
  }) });
  await click(p, '[data-act="continue"]');
  assert.equal(await screen(p), "clear");
  await click(p, '[data-act="records"]');
  await click(p, '[data-act="credits"]');
  assert.equal(await screen(p), "credits");
  await click(p, '[data-act="skip-credits"]');
  assert.equal(await screen(p), "records", "記録画面にもどる");
  await click(p, '[data-act="back"]');
  assert.equal(await screen(p), "clear");
  await click(p, '[data-act="space"]');
  assert.equal(await screen(p), "dig");
  assert.match(await text(p, "#layerchip"), /月/);
  assert.match(await text(p, "#banner"), /月/);
  await saveNow(p);
  assert.equal((await saved(p)).game.life.space, true);
  assert.ok(await fits(p));
});

test("星の中心に着くとボスの案内が出て、挑むとHPと残り時間が出る。勝つと次の星へ", async () => {
  // 数秒は戦いが続く強さ（月のボスを約 2〜3秒でたおせる）
  const p = await open({ save: spaceSave((g) => { g.life.lv = { mog: 2300 }; }) });
  await click(p, '[data-act="continue"]');
  await p.waitForSelector("#core", { timeout: 8000 });
  assert.match(await text(p, "#core"), /うさぎ岩の番人/);
  assert.match(await text(p, "#core"), /勝て/);
  assert.ok(await fits(p));
  await click(p, '[data-act="boss"]');
  await p.waitForSelector("#bossbar");
  assert.match(await text(p, "#bossbar"), /秒/);
  await p.waitForFunction(() => /たおした/.test(document.querySelector("#banner")?.textContent || ""), { timeout: 8000 });
  await p.waitForFunction(() => /火星/.test(document.querySelector("#layerchip").textContent), { timeout: 4000 });
  await saveNow(p);
  const s = await saved(p);
  assert.equal(s.game.life.planet, 1);
  assert.equal(s.game.space.best, 1);
});

test("ボス戦は時間切れで負け。「時間切れ」が出て、もう一度挑める", async () => {
  const p = await open({ save: spaceSave((g) => {
    g.life.lv = { mog: 1 }; g.life.depth = 1737000; g.life.layer = 2; g.life.atCore = true;
    g.life.boss = { hp: 1e15, max: 1e15, until: g.life.t + 0.6 };
  }) });
  await click(p, '[data-act="continue"]');
  await p.waitForFunction(() => /時間切れ/.test(document.querySelector("#banner")?.textContent || ""), { timeout: 4000 });
  await p.waitForSelector('#core [data-act="boss"]');
});

test("星を 3つ倒すと星座が完成して知らせが出る。星空の画面で星座と星の祈りが見られる", async () => {
  const p = await open({ save: spaceSave((g) => { g.space.best = 2; g.life.planet = 2; g.life.lv = { mog: 5000 }; g.shards = 500; }) });
  await click(p, '[data-act="continue"]');
  await p.waitForSelector('#core [data-act="boss"]', { timeout: 8000 });
  await click(p, '[data-act="boss"]');
  await p.waitForFunction(() => /つるはし座/.test(document.querySelector("#banner")?.textContent || "") || /つるはし座/.test(document.querySelector("#toasts")?.textContent || ""), { timeout: 8000 });
  await click(p, '[data-nav="sky"]');
  assert.equal(await screen(p), "sky");
  const t = await text(p);
  assert.match(t, /つるはし座/);
  assert.match(t, /タップ ×2/);
  assert.match(t, /星の祈り/);
  assert.ok(await p.$('[data-act="pray"][disabled]'), "ツリーを全部開放するまでは祈れない");
  assert.ok(await fits(p));
});

test("ツリーを全部開放すると、星空の画面で星の祈りができる", async () => {
  const p = await open({ save: spaceSave((g) => { for (const n of D.TREE) g.tree[n.id] = true; g.shards = 500; }) });
  await click(p, '[data-act="continue"]');
  await click(p, '[data-nav="sky"]');
  await click(p, '[data-act="pray"]');
  await saveNow(p);
  assert.equal((await saved(p)).game.space.prayers, 1);
  assert.match(await text(p), /\+10%/);
});

test("宇宙で転生すると、いちばん先の星の地表から始まる", async () => {
  const p = await open({ save: spaceSave((g) => { g.space.best = 3; g.life.planet = 3; g.life.depth = 2000000; }) });
  await click(p, '[data-act="continue"]');
  await click(p, '[data-nav="rebirth"]');
  assert.match(await text(p), /土星/);
  await click(p, '[data-act="reborn"]');
  assert.match(await text(p, "#layerchip"), /土星|輪/);
  await saveNow(p);
  const s = await saved(p);
  assert.equal(s.game.life.planet, 3);
  assert.equal(s.game.life.depth < 10, true);
});

test("スキルツリーに「お金」の枝があり、画面に収まる", async () => {
  const p = await open({ save: mk((g) => { g.shards = 10; }) });
  await click(p, '[data-act="continue"]');
  await click(p, '[data-nav="tree"]');
  assert.match(await text(p, ".tlabels"), /お金/);
  await click(p, '[data-node="m1"]');
  assert.match(await text(p, ".detail"), /お小づかい/);
  await click(p, '[data-act="unlock"]');
  await saveNow(p);
  assert.equal((await saved(p)).game.tree.m1, true);
  assert.ok(await fits(p));
});

test("宝箱が出たらタップでお金がもらえる", async () => {
  const p = await open({ save: mk((g) => { g.tree.m3 = true; g.life.lv.mog = 10; g.life.chest = { shown: false, next: 0.3, shownAt: null, x: 0.5, y: 0.5 }; }) });
  await click(p, '[data-act="continue"]');
  await p.waitForSelector("#chest", { timeout: 3000 });
  await saveNow(p);
  const before = (await saved(p)).game.life.money;
  await click(p, "#chest");
  await saveNow(p);
  assert.ok((await saved(p)).game.life.money > before);
  assert.equal(await p.$("#chest"), null);
});

test("クリアしたあと掘る画面に戻っても、そこから「宇宙へ」行ける。星空の画面からも行ける", async () => {
  const p = await open({ save: mk((g) => {
    for (const id of ["suit", "drill", "starpick"]) g.tree[id] = true;
    g.life.layer = 6; g.life.depth = D.GOAL; g.life.cleared = true; g.cleared = true;
    g.clears = [{ lifeNo: 1, totalTime: 6000, lifeTime: 6000 }];
  }) });
  await click(p, '[data-act="continue"]');
  await click(p, '[data-nav="dig"]');
  assert.ok(await p.$('#pit [data-act="space"]'), "掘る画面のクリアの案内に「宇宙へ」");
  await click(p, '[data-nav="sky"]');
  await click(p, '[data-act="space"]');
  assert.equal(await screen(p), "dig");
  assert.match(await text(p, "#layerchip"), /月/);
});

test("星の中心のボスの案内は穴の下のほうに出て、真ん中をタップすればお金を掘れる", async () => {
  const p = await open({ save: spaceSave((g) => { Object.assign(g.life, { lv: { mog: 5 }, depth: 1737000, layer: 2, atCore: true }); }) });
  await click(p, '[data-act="continue"]');
  await p.waitForSelector("#core");
  const [pit, core] = await p.evaluate(() => [document.querySelector("#pit").getBoundingClientRect().toJSON(), document.querySelector("#core").getBoundingClientRect().toJSON()]);
  assert.ok(core.top > pit.top + pit.height * 0.45, "下のほう");
  assert.ok(core.bottom <= pit.bottom + 1, "はみ出さない");
  await saveNow(p);
  const before = (await saved(p)).game.life.money;
  await p.touchscreen.tap(pit.x + pit.width / 2, pit.y + pit.height * 0.3);
  await saveNow(p);
  assert.ok((await saved(p)).game.life.money > before);
});

test("仲間は「×10」「最大」でまとめて強化できる", async () => {
  const p = await open({ save: mk((g) => { g.life.money = 1e6; }) });
  await click(p, '[data-act="continue"]');
  await click(p, '[data-buyn="10"]');
  await click(p, '[data-lvup="mog"]');
  await saveNow(p);
  assert.equal((await saved(p)).game.life.lv.mog, 10);
  await click(p, '[data-buyn="max"]');
  await click(p, '[data-lvup="mog"]');
  await saveNow(p);
  assert.ok((await saved(p)).game.life.lv.mog > 10);
});

test("エンドロールはタップすると、とちゅうから 4倍速になる（飛ばない）", async () => {
  const p = await open({ save: mk((g) => {
    for (const id of ["suit", "drill", "starpick"]) g.tree[id] = true;
    g.life.layer = 6; g.life.depth = D.GOAL; g.life.cleared = true; g.cleared = true;
    g.clears = [{ lifeNo: 1, totalTime: 6000, lifeTime: 6000 }];
  }) });
  await click(p, '[data-act="continue"]');
  await click(p, '[data-act="records"]');
  await click(p, '[data-act="credits"]');
  await wait(600);
  const y0 = await p.$eval(".rollin", (e) => e.getBoundingClientRect().top);
  await click(p, "#roll");
  const y1 = await p.$eval(".rollin", (e) => e.getBoundingClientRect().top);
  assert.ok(Math.abs(y1 - y0) < 40, `飛ばない ${y0} → ${y1}`);
  assert.equal(await p.$eval(".rollin", (e) => e.getAnimations()[0].playbackRate), 4);
  assert.equal(await screen(p), "credits");
});

// ===== 3Dのキャラの絵 =====
const allCrew = () => mk((g) => { g.life.money = 1e6; g.life.lv = { mog: 120, gan: 30, drill: 12, soko: 3 }; g.life.gear = { pick: 5, glove: 2, helmet: 3, boots: 1 }; });
const imgsLoaded = (p, sel) => p.$$eval(sel, (els) => Promise.all(els.map((e) => e.decode().then(() => e.naturalWidth > 0, () => false))));

test("穴の中の自分と仲間 4人は 3Dの絵で、全部の画像が読み込めている", async () => {
  const p = await open({ save: allCrew() });
  await click(p, '[data-act="continue"]');
  for (const id of ["me", "mog", "gan", "drill", "soko"]) assert.ok(await p.$(`#pit [data-comp="${id}"] .spr`), id);
  assert.ok(await p.$('#pit [data-comp="mog"] .spr.s-4'), "Lv.120 のモグは最後の段階");
  assert.ok(await p.$('#pit [data-comp="me"] .spr.star'), "流れ星のつるはし");
  const ok = await imgsLoaded(p, "#pit .spr img");
  assert.ok(ok.length > 20, String(ok.length));
  assert.ok(ok.every(Boolean), "読み込めない画像がある");
  assert.equal(await p.$('#pit svg.ch'), null, "SVG の絵は使わない");
  assert.ok(await fits(p));
  assert.deepEqual(p.errors, []);
});

test("仲間カードとエンドロールも 3Dの絵", async () => {
  const p = await open({ save: allCrew() });
  await click(p, '[data-act="continue"]');
  assert.ok(await p.$('.cc[data-card="mog"] .pic .spr'));
  const ok = await imgsLoaded(p, ".cc .pic .spr img");
  assert.ok(ok.length > 0 && ok.every(Boolean));
});

test("ドリルンのターボ中は、ドリルの刃が速く回る", async () => {
  const dur = async (t) => {
    const s = allCrew(); s.game.life.skills.drill_a = true; s.game.life.t = t; // ターボは 30秒ごとの最後の 5秒
    const p = await open({ save: s });
    await click(p, '[data-act="continue"]');
    await wait(150);
    return p.$eval('#pit [data-comp="drill"] .p-drill .fr', (e) => [e.closest(".tun").classList.contains("turbo"), parseFloat(getComputedStyle(e).animationDuration)]);
  };
  const [offT, slow] = await dur(1);
  const [onT, fast] = await dur(26);
  assert.deepEqual([offT, onT], [false, true]);
  assert.ok(slow > 0 && fast > 0 && fast < slow, `${slow} → ${fast}`);
});

test("動きを減らす設定では、部品が動かず、まばたきも出ない", async () => {
  const p = await open({ save: allCrew(), reduce: true });
  await click(p, '[data-act="continue"]');
  const st = await p.evaluate(() => {
    const cs = (sel) => getComputedStyle(document.querySelector(sel));
    return { arm: cs('#pit [data-comp="gan"] .p-arm').animationName, blink: cs('#pit [data-comp="mog"] .blink').opacity, fr: cs('#pit [data-comp="drill"] .fr').animationName };
  });
  assert.deepEqual(st, { arm: "none", blink: "0", fr: "none" });
});

test("一覧（sprites/manifest.js）が読み込めないときは、今までの絵で遊べる", async () => {
  const p = await open({ save: allCrew(), block: "sprites/manifest.js" });
  await click(p, '[data-act="continue"]');
  assert.ok(await p.$('#pit [data-comp="mog"] svg'), "モグの絵（SVG）");
  assert.ok(await p.$('#pit [data-comp="me"] svg'), "自分の絵（SVG）");
  assert.equal(await p.$("#pit .spr"), null);
  await tapPit(p, 3);
  assert.deepEqual(p.errors, []);
});

test("変身の演出は、くるっと 1回まわって終わる（最後に逆まわりしない）", async () => {
  const p = await open({ save: mk((g) => { g.life.money = 1e6; g.life.lv.mog = 9; }) });
  await click(p, '[data-act="continue"]');
  await click(p, '[data-lvup="mog"]');
  const m11 = await p.$eval('#pit [data-comp="mog"] .who', (el) => {
    const an = el.getAnimations().find((a) => a.animationName === "transform3d");
    if (!an) return null;
    an.pause();
    return [760, 800, 850, 900, 950, 990].map((t) => { an.currentTime = t; return +new DOMMatrix(getComputedStyle(el).transform).m11.toFixed(2); });
  });
  assert.ok(m11 && m11.every((v) => v > 0.85), `終わりぎわの向き ${m11}`);
});

test("自分はタップで振ったあとも、また呼吸の動きにもどる", async () => {
  const p = await open({ save: mk() });
  await click(p, '[data-act="continue"]');
  await tapPit(p, 1);
  await wait(700);
  const an = await p.$eval('#pit [data-comp="me"] .sb', (e) => e.getAnimations().map((a) => `${a.animationName}:${a.playState}`));
  assert.ok(an.includes("breathe:running"), String(an));
});
