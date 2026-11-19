// エンドレスモード「星めぐり」：星・ボス・星座・星の祈り・宇宙での転生
const test = require("node:test");
const assert = require("node:assert/strict");
const E = require("../engine.js");
const D = require("../data.js");

const clone = (o) => JSON.parse(JSON.stringify(o));
// 地球をクリアした直後の状態
function clearedGame(seed = 1) {
  const g = E.newGame({ seed });
  for (const id of ["suit", "drill", "starpick"]) g.tree[id] = true;
  g.life.layer = D.LAYERS.length - 1; g.life.depth = D.GOAL - 1; g.life.lv = { mog: 50, gan: 50, drill: 50 };
  E.dig(g, 1e12);
  assert.equal(g.cleared, true);
  return g;
}
function inSpace(seed) { const g = clearedGame(seed); E.enterSpace(g); return g; }
function toCore(g) { E.dig(g, 1e30); assert.equal(g.life.atCore, true); }

test("地球をクリアするまで宇宙へは行けない。クリアすると月から星めぐりが始まる", () => {
  const g = E.newGame({ seed: 1 });
  assert.equal(E.canEnterSpace(g), false);
  assert.equal(E.enterSpace(g), false);
  const c = clearedGame();
  assert.equal(E.canEnterSpace(c), true);
  const lvBefore = clone(c.life.lv), moneyBefore = c.life.money;
  assert.ok(E.enterSpace(c));
  assert.equal(c.life.space, true);
  assert.equal(c.life.planet, 0);
  assert.equal(E.planet(0).name, "月");
  assert.equal(c.life.depth, 0);
  assert.equal(c.life.layer, 0);
  assert.deepEqual(c.life.lv, lvBefore, "仲間やお金はそのまま");
  assert.equal(c.life.money, moneyBefore);
  assert.equal(E.layerOf(c).name.includes("月"), true);
});

test("星は名前のある 7つのあとも、名前つきでいくらでも続き、先の星ほど硬い", () => {
  const names = D.PLANETS.map((p) => p.name);
  assert.deepEqual(names, ["月", "火星", "木星", "土星", "天王星", "海王星", "冥王星"]);
  const seen = new Set();
  for (let k = 0; k < 60; k++) {
    const p = E.planet(k);
    assert.ok(p.name && p.radius > 0 && p.boss && p.icon, `星 ${k}`);
    seen.add(p.name);
    assert.equal(p.layers.length, 3);
    for (let i = 1; i < 3; i++) assert.ok(p.layers[i].hard >= E.hardAt(p.layers[i - 1], p.layers[i].from) - 1e-9, `${p.name} の地層 ${i}`);
    if (k) assert.ok(p.layers[0].hard > E.planet(k - 1).layers[0].hard);
    assert.deepEqual(E.planet(k), E.planet(k), "同じ星はいつも同じ");
  }
  assert.ok(seen.size >= 55, "名前がほとんどかぶらない");
  assert.ok(E.planet(0).layers[0].hard >= E.hardAt(D.LAYERS[D.LAYERS.length - 1], D.GOAL), "月は地球の中心より硬い");
});

test("星の中心に着くと止まり（ボスが待つ）、掘り続けてもお金は入る", () => {
  const g = inSpace();
  const ev = E.dig(g, 1e30).events;
  assert.ok(ev.some((e) => e.type === "core"));
  assert.equal(g.life.depth, E.planet(0).radius);
  assert.equal(g.life.atCore, true);
  g.life.money = 0; // 中心までの分は数えない
  const m = g.life.money;
  E.dig(g, 1e9);
  assert.equal(g.life.depth, E.planet(0).radius);
  assert.ok(g.life.money > m, "中心でもお金は増える");
});

test("ボス戦：中心でだけ始められ、30秒以内に HP を 0 にすると勝ち。次の星へ進み、ごほうびが出る", () => {
  const g = inSpace();
  assert.equal(E.startBoss(g), false, "中心に着くまではボスと戦えない");
  toCore(g);
  const b = E.startBoss(g);
  assert.ok(b);
  assert.equal(g.life.boss.hp, E.bossHp(0));
  assert.equal(g.life.boss.until - g.life.t, D.BOSS.time);
  const before = g.life.boss.hp;
  const r = E.tap(g);
  assert.ok(r.dmg > 0 && g.life.boss.hp < before, "タップでダメージ");
  assert.equal(g.life.depth, E.planet(0).radius, "ボス戦中のタップは掘らない");
  g.life.lv.mog = 3000;
  g.life.money = 0;
  const money = g.life.money;
  let win = null;
  for (let i = 0; i < 400 && !win; i++) win = E.tick(g, 0.1).find((e) => e.type === "bossWin");
  assert.ok(win, "仲間の力でも HP が減る");
  assert.equal(g.life.planet, 1);
  assert.equal(g.space.best, 1);
  assert.equal(g.life.depth, 0);
  assert.equal(g.life.atCore, false);
  assert.equal(g.life.boss, null);
  assert.ok(g.life.money - money >= win.reward && win.reward > 0);
});

test("ボス戦：30秒で倒せなければ負け。HP は満タンに戻り、すぐ挑み直せる", () => {
  const g = inSpace();
  g.life.lv = { mog: 1 };
  toCore(g);
  E.startBoss(g);
  E.tap(g);
  let fail = null;
  for (let i = 0; i < 320 && !fail; i++) fail = E.tick(g, 0.1).find((e) => e.type === "bossFail");
  assert.ok(fail);
  assert.equal(g.life.boss, null);
  assert.equal(g.life.planet, 0);
  assert.ok(E.startBoss(g));
  assert.equal(g.life.boss.hp, E.bossHp(0), "満タンから");
});

test("ボスの HP は先の星ほど多い。勝てる見こみ（30秒で削れる割合）が分かる", () => {
  for (let k = 1; k < 20; k++) assert.ok(E.bossHp(k) > E.bossHp(k - 1));
  const g = inSpace();
  toCore(g);
  const p = E.bossOdds(g, 3);
  assert.ok(p > 0);
  g.life.lv.mog *= 2;
  assert.ok(E.bossOdds(g, 3) > p);
});

test("星を 3つ倒すごとに星座が 1つ完成し、ずっと続くボーナスがつく（1つ目はつるはし座：タップ ×2）", () => {
  const g = inSpace();
  assert.equal(E.constellations(g).length, 0);
  const tap0 = E.tapPower(g);
  g.space.best = 2;
  assert.equal(E.constellations(g).length, 0);
  g.space.best = 3;
  const cs = E.constellations(g);
  assert.equal(cs.length, 1);
  assert.equal(cs[0].name, "つるはし座");
  assert.ok(Math.abs(E.tapPower(g) - tap0 * 2) < 1e-6);
  g.space.best = 30;
  assert.equal(E.constellations(g).length, 10);
  for (const c of E.constellations(g)) assert.ok(c.name && c.desc);
});

test("ボスに勝って星座が完成すると、知らせが出る", () => {
  const g = inSpace();
  g.space.best = 2; g.life.planet = 2; g.life.lv.mog = 3000;
  toCore(g);
  E.startBoss(g);
  let evs = [];
  for (let i = 0; i < 300 && !evs.some((e) => e.type === "bossWin"); i++) evs = evs.concat(E.tick(g, 0.1));
  assert.ok(evs.some((e) => e.type === "constellation" && e.name === "つるはし座"));
});

test("星の祈り：スキルツリーを全部開放するまで買えず、1回ごとに全員の掘る力とタップが +10%", () => {
  const g = inSpace();
  g.shards = 1e9;
  assert.equal(E.canPray(g), false);
  assert.equal(E.pray(g), false);
  for (const n of D.TREE) g.tree[n.id] = true;
  const a = E.autoPower(g), t = E.tapPower(g);
  const c0 = E.prayerCost(g);
  assert.ok(E.pray(g));
  assert.equal(g.space.prayers, 1);
  assert.equal(g.shards, 1e9 - c0);
  assert.ok(E.prayerCost(g) > c0);
  assert.ok(Math.abs(E.autoPower(g) - a * 1.1) < 1e-6 * a);
  E.pray(g);
  assert.ok(Math.abs(E.autoPower(g) - a * 1.2) < 1e-6 * a);
});

test("宇宙で転生すると、いちばん先まで行った星の地表から始まり、かけらは地球の中心よりも多い", () => {
  const g = inSpace();
  g.space.best = 4; g.life.planet = 4;
  g.life.depth = E.planet(4).radius / 2;
  const s = E.rebirthShards(g);
  assert.ok(s > Math.floor(Math.sqrt(D.GOAL / D.SHARD_DIV)));
  const r = E.rebirth(g);
  assert.equal(r.shards, s);
  assert.equal(g.life.space, true);
  assert.equal(g.life.planet, 4);
  assert.equal(g.life.depth, 0);
  assert.deepEqual(g.life.lv, {});
});

test("宇宙では、ガンさんやドリルンも最初から仲間にできる（地球の地層の条件はない）", () => {
  const g = inSpace();
  E.rebirth(g);
  g.life.money = 1e30;
  assert.ok(E.isUnlocked(g, "gan"));
  assert.ok(E.isUnlocked(g, "drill"));
});

test("前の人生と同じ星の節目に着いた時間をくらべられる", () => {
  const g = inSpace();
  g.life.lv = { mog: 1 };
  const third = E.planet(0).radius / 3;
  const ev = E.dig(g, E.powerBetween(0, 0, third + 1, E.planet(0).layers)).events.find((e) => e.type === "milestone");
  assert.ok(ev, "星の 1/3 の節目");
  assert.equal(ev.key, "p0:1");
  assert.equal(ev.prev, null);
});

test("仲間の掘る力×2 の節目は Lv.500 のあとも 100 ごとに続く", () => {
  const g = E.newGame({ seed: 1 });
  const out = D.COMPANIONS[0].out;
  g.life.lv.mog = 599;
  const a = E.compPower(g, "mog");
  g.life.lv.mog = 600;
  assert.ok(Math.abs(E.compPower(g, "mog") / a - (600 / 599) * 2) < 1e-9);
  g.life.lv.mog = 1000;
  assert.ok(Math.abs(E.compPower(g, "mog") - 1000 * out * Math.pow(2, D.LV_MILESTONES.length + 5)) < 1e-6);
});

test("宇宙にいるセーブも、保存して戻すと同じ続きになり、点検を通る", () => {
  const g = inSpace();
  toCore(g);
  E.startBoss(g);
  const s = clone(g);
  assert.equal(E.sanitize(s), true);
  assert.equal(s.life.space, true);
  assert.ok(s.life.boss);
  for (const x of [g, s]) for (let i = 0; i < 20; i++) { E.tap(x); E.tick(x, 0.25); }
  assert.deepEqual(g, s);
  const bad = clone(g); bad.life.planet = -3;
  assert.equal(E.sanitize(bad), false);
  const old = clone(g); delete old.space;
  assert.equal(E.sanitize(old), true);
  assert.deepEqual(old.space, { best: 0, prayers: 0 });
});
