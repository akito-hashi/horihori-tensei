const test = require("node:test");
const assert = require("node:assert/strict");
const E = require("../engine.js");
const D = require("../data.js");

const fresh = (seed = 1) => E.newGame({ seed });
const clone = (o) => JSON.parse(JSON.stringify(o));
const layerIdx = (id) => D.LAYERS.findIndex((l) => l.id === id);
function place(g, layerId, extra = 0) {
  g.life.layer = layerIdx(layerId);
  g.life.depth = D.LAYERS[g.life.layer].from + extra;
}
function grant(g, ...ids) { for (const id of ids) g.tree[id] = true; }

// ---- 壁と伝説の道具 ----
test("耐熱スーツがないとマントルの壁で止まり、開放すると先へ進める", () => {
  const g = fresh();
  place(g, "crust");
  g.life.depth = D.LAYERS[layerIdx("mantle")].from - 5;
  E.dig(g, 1e9);
  assert.equal(g.life.depth, D.LAYERS[layerIdx("mantle")].from);
  assert.equal(g.life.atWall, true);
  assert.equal(E.layerOf(g).id, "crust");
  assert.equal(E.wallTool(g), "suit");
  g.shards = 1e6;
  assert.equal(E.unlockNode(g, "suit"), true);
  E.dig(g, 1e6);
  assert.equal(E.layerOf(g).id, "mantle");
  assert.equal(g.life.atWall, false);
  assert.ok(g.life.depth > D.LAYERS[layerIdx("mantle")].from);
});

test("伝説の道具は順番（耐熱スーツ → 超高圧ドリル → 星のつるはし）", () => {
  const g = fresh();
  g.shards = 1e6;
  assert.equal(E.unlockNode(g, "drill"), false);
  assert.equal(E.unlockNode(g, "suit"), true);
  assert.equal(E.unlockNode(g, "starpick"), false);
  assert.equal(E.unlockNode(g, "drill"), true);
  assert.equal(E.unlockNode(g, "starpick"), true);
});

// ---- スキルツリー ----
test("スキルツリーは 3本の枝（5・5・6マス）と道具 3つ。枝は根元から順に、かけらを払って開放", () => {
  const branches = {};
  for (const n of D.TREE) branches[n.branch] = (branches[n.branch] || 0) + 1;
  assert.deepEqual(branches, { tap: 5, friend: 5, treasure: 6, tool: 3 });
  const g = fresh();
  const [first, second] = D.TREE.filter((n) => n.branch === "tap");
  assert.equal(E.unlockNode(g, first.id), false, "かけらがない");
  g.shards = first.cost + second.cost;
  assert.equal(E.unlockNode(g, second.id), false, "根元から順");
  assert.equal(E.unlockNode(g, first.id), true);
  assert.equal(g.shards, second.cost);
  assert.equal(E.unlockNode(g, first.id), false, "2回は開放できない");
  assert.equal(E.unlockNode(g, second.id), true);
  assert.equal(g.shards, 0);
});

test("強いつるはし ×2・黄金のつるはし ×5 がタップ力にかかる", () => {
  const g = fresh();
  const base = E.tapPower(g);
  grant(g, "t1");
  assert.equal(E.tapPower(g), base * 2);
  grant(g, "t5");
  assert.equal(E.tapPower(g), base * 10);
});

test("仲間の力：タップに毎秒の掘る力の 5% が上乗せ", () => {
  const g = fresh();
  g.life.owned.apprentice = 100;
  const base = E.tapPower(g);
  grant(g, "t4");
  assert.ok(Math.abs(E.tapPower(g) - (base + 0.05 * E.autoPower(g))) < 1e-9);
});

test("先輩の教え ×1.5・気合いの朝礼 ×2・チームワーク（25人ごとに ×2）・まとめ買い割引", () => {
  const g = fresh();
  g.life.owned.apprentice = 24;
  const a = E.autoPower(g);
  grant(g, "f1");
  assert.ok(Math.abs(E.autoPower(g) - a * 1.5) < 1e-9);
  grant(g, "f4");
  assert.ok(Math.abs(E.autoPower(g) - a * 3) < 1e-9);
  const before = E.autoPower(g);
  grant(g, "f3");
  assert.ok(Math.abs(E.autoPower(g) - before) < 1e-9, "24人では変わらない");
  g.life.owned.apprentice = 25;
  assert.ok(Math.abs(E.autoPower(g) - 25 * D.BUILDINGS[0].out * 3 * 2) < 1e-9);
  const c = E.buildingCost(g, "apprentice");
  grant(g, "f2");
  assert.equal(E.buildingCost(g, "apprentice"), Math.ceil(D.BUILDINGS[0].cost * Math.pow(D.COST_GROWTH, 25) * 0.9));
  assert.ok(E.buildingCost(g, "apprentice") < c);
});

test("地底人は『地底の友だち』を開放するまで買えない", () => {
  const g = fresh();
  g.life.money = 1e15;
  assert.equal(E.isUnlocked(g, "chitei"), false);
  grant(g, "f5");
  assert.equal(E.buy(g, "chitei"), true);
});

test("会心の一撃：開放するとタップの約 10回に 1回が 10倍。開放前は起きない", () => {
  const g = fresh(3);
  let crits = 0;
  for (let i = 0; i < 2000; i++) { g.life.taps = []; if (E.tap(g).crit) crits++; }
  assert.equal(crits, 0);
  grant(g, "t3");
  const p = E.tapPower(g);
  for (let i = 0; i < 2000; i++) {
    g.life.taps = [];
    const before = g.life.depth;
    const r = E.tap(g);
    if (r.crit) { crits++; assert.ok(Math.abs((g.life.depth - before) - 10 * p / E.layerOf(g).hard) < 1e-6); }
  }
  assert.ok(crits > 140 && crits < 260, String(crits));
});

test("連打ボーナス：1秒に 5回以上タップすると、その間は 1.5倍", () => {
  const g = fresh();
  grant(g, "t2");
  const p = E.tapPower(g);
  const gains = [];
  for (let i = 0; i < 6; i++) { gains.push(E.tap(g).gain); E.tick(g, 0.1); }
  assert.ok(Math.abs(gains[0] - p) < 1e-9);
  assert.ok(Math.abs(gains[4] - p * 1.5) < 1e-9, "5回目から");
  assert.equal(E.tap(g).combo, true);
  const h = fresh();
  grant(h, "t2");
  for (let i = 0; i < 6; i++) { assert.equal(E.tap(h).combo, false); E.tick(h, 0.5); }
});

// ---- 光る鉱石 ----
function countOres(g, seconds, tapIt = false) {
  let n = 0;
  for (let s = 0; s < seconds; s += 0.5) {
    const ev = E.tick(g, 0.5);
    if (ev.some((e) => e.type === "ore")) { n++; if (tapIt) E.tapOre(g); }
  }
  return n;
}

test("光る鉱石はときどき出て、12秒で消える。タップすると 30秒間すべて 7倍", () => {
  const g = fresh(5);
  let t0 = null;
  for (let s = 0; s < 200 && !g.life.ore.shown; s += 0.5) E.tick(g, 0.5);
  assert.ok(g.life.ore.shown, "200秒以内に出る");
  t0 = g.life.t;
  const keep = clone(g);
  for (let s = 0; s < 13; s += 0.5) E.tick(g, 0.5);
  assert.equal(g.life.ore.shown, false, "12秒で消える");
  const h = keep;
  h.life.owned.apprentice = 10;
  const tapBase = E.tapPower(h), autoBase = E.autoPower(h);
  const r = E.tapOre(h);
  assert.equal(r.mult, 7);
  assert.equal(E.tapPower(h), tapBase * 7);
  assert.equal(E.autoPower(h), autoBase * 7);
  for (let s = 0; s < 31; s += 0.5) E.tick(h, 0.5);
  assert.equal(E.autoPower(h), autoBase, "30秒で終わる");
  assert.equal(E.tapOre(h), null, "出ていないときはタップできない");
});

test("『光る鉱石』を開放すると約 2倍、強力ライトで約 1.5倍出やすくなる", () => {
  const a = fresh(11), b = fresh(11), c = fresh(11);
  grant(b, "o1");
  c.life.upgrades.light = true;
  const na = countOres(a, 6000, true), nb = countOres(b, 6000, true), nc = countOres(c, 6000, true);
  assert.ok(nb / na > 1.6 && nb / na < 2.4, `${na} ${nb}`);
  assert.ok(nc / na > 1.25 && nc / na < 1.8, `${na} ${nc}`);
});

test("『長持ち』でブーストが 45秒。『虹の鉱石』を開放したときだけ、虹色（10秒間 77倍）が出る", () => {
  const g = fresh(2);
  grant(g, "o2");
  while (!g.life.ore.shown) E.tick(g, 0.5);
  E.tapOre(g);
  assert.ok(Math.abs(g.life.boost.until - g.life.t - 45) < 1e-9);
  let rainbows = 0;
  const h = fresh(4);
  for (let i = 0; i < 300; i++) { while (!h.life.ore.shown) E.tick(h, 1); if (h.life.ore.kind === "rainbow") rainbows++; E.tapOre(h); }
  assert.equal(rainbows, 0);
  grant(h, "o5");
  for (let i = 0; i < 300; i++) {
    while (!h.life.ore.shown) E.tick(h, 1);
    const kind = h.life.ore.kind;
    const r = E.tapOre(h);
    if (kind === "rainbow") { rainbows++; assert.equal(r.mult, 77); assert.ok(Math.abs(h.life.boost.until - h.life.t - 10) < 1e-9); }
  }
  assert.ok(rainbows > 10 && rainbows < 60, String(rainbows));
});

// ---- 化石 ----
test("『化石図鑑』を開放すると、決まった深さを通ったときに化石が見つかり、1個ごとに +2%（転生しても残る）", () => {
  assert.equal(D.FOSSILS.length, 16);
  const g = fresh();
  const f = D.FOSSILS[0];
  E.dig(g, f.depth * 2);
  assert.equal(Object.keys(g.fossils).length, 0, "開放前は見つからない");
  const h = fresh();
  grant(h, "o3");
  h.life.owned.apprentice = 10;
  const before = E.autoPower(h);
  const r = E.dig(h, f.depth * 2);
  assert.ok(r.events.some((e) => e.type === "fossil" && e.id === f.id));
  assert.ok(h.fossils[f.id]);
  assert.ok(Math.abs(E.autoPower(h) - before * 1.02) < 1e-9);
  h.life.depth = 5000;
  h.shards = 0;
  E.rebirth(h);
  assert.ok(h.fossils[f.id]);
});

// ---- 宝の地図 ----
test("『宝の地図』を開放すると、新しい地層に入ったときお金のボーナスが出る", () => {
  const a = fresh(), b = fresh();
  grant(b, "o4");
  for (const g of [a, b]) { g.life.depth = 99; g.life.owned.mole = 5; }
  const ra = E.dig(a, 10), rb = E.dig(b, 10);
  const ev = rb.events.find((e) => e.type === "layer");
  assert.ok(ev.bonus > 0);
  assert.ok(Math.abs((b.life.money - a.life.money) - ev.bonus) < 1e-6);
  assert.ok(!ra.events.find((e) => e.type === "layer").bonus);
});

// ---- 転生 ----
test("転生すると深さに応じて星のかけらがもらえ、人生がリセットされ、ツリー・かけら・化石は残る", () => {
  const g = fresh();
  assert.equal(E.rebirthShards(g), 0);
  assert.equal(E.rebirth(g), null, "かけら 0 では転生できない");
  g.life.depth = 35000; g.life.layer = layerIdx("crust");
  g.life.money = 999; g.life.owned.apprentice = 5; g.life.upgrades.pick_iron = true;
  grant(g, "t1");
  const s = E.rebirthShards(g);
  assert.equal(s, Math.floor(Math.sqrt(35000 / 50)));
  const r = E.rebirth(g);
  assert.equal(r.shards, s);
  assert.equal(g.shards, s);
  assert.equal(g.lifeNo, 2);
  assert.equal(g.life.depth, 0);
  assert.equal(g.life.money, 0);
  assert.deepEqual(g.life.owned, {});
  assert.deepEqual(g.life.upgrades, {});
  assert.ok(g.tree.t1);
  assert.equal(g.lives.length, 1);
  assert.equal(g.lives[0].maxDepth, 35000);
});

test("『かけら増量』で転生のかけらが 1.25倍", () => {
  const g = fresh();
  g.life.depth = 100000;
  const s = E.rebirthShards(g);
  grant(g, "o6");
  assert.equal(E.rebirthShards(g), Math.floor(Math.sqrt(100000 / 50) * 1.25));
  assert.ok(E.rebirthShards(g) > s);
});

test("節目の深さに着いた時間が記録され、転生後は前世の時間と比べられる", () => {
  const g = fresh();
  g.life.owned.mole = 50;
  let first = null;
  for (let i = 0; i < 2000 && !first; i++) {
    const ev = E.tick(g, 0.5);
    first = ev.find((e) => e.type === "milestone" && e.depth === 100);
  }
  assert.ok(first, "100m の節目");
  assert.equal(first.prev, null, "1回目の人生には前世がない");
  const t1 = g.life.reach[100];
  E.rebirth(g);
  g.life.owned.mole = 500;
  let again = null;
  for (let i = 0; i < 2000 && !again; i++) {
    const ev = E.tick(g, 0.5);
    again = ev.find((e) => e.type === "milestone" && e.depth === 100);
  }
  assert.equal(again.prev, t1);
  assert.ok(again.t < again.prev);
});

test("地球の中心に着くとクリア（合計の時間が記録される）", () => {
  const g = fresh();
  grant(g, "suit", "drill", "starpick");
  place(g, "inner");
  g.life.depth = D.GOAL - 10;
  E.tick(g, 1);
  g.life.owned.chitei = 1; g.tree.f5 = true;
  const ev = E.tick(g, 1);
  assert.ok(ev.some((e) => e.type === "clear"));
  assert.equal(g.life.depth, D.GOAL);
  assert.equal(g.cleared, true);
  assert.equal(g.clears.length, 1);
  assert.ok(g.clears[0].totalTime > 0);
  assert.equal(E.tick(g, 1).filter((e) => e.type === "clear").length, 0, "クリアは 1回だけ知らせる");
});
