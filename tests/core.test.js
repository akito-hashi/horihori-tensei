const test = require("node:test");
const assert = require("node:assert/strict");
const E = require("../engine.js");
const D = require("../data.js");

const fresh = (seed = 1) => E.newGame({ seed });
const clone = (o) => JSON.parse(JSON.stringify(o));

test("はじめは深さ 0・お金 0・1回目の人生・星のかけら 0", () => {
  const g = fresh();
  assert.equal(g.life.depth, 0);
  assert.equal(g.life.money, 0);
  assert.equal(g.lifeNo, 1);
  assert.equal(g.shards, 0);
  assert.equal(E.layerOf(g).id, "soil");
});

test("タップすると、タップ力 ÷ かたさ だけ掘れて、掘った分のお金が入る", () => {
  const g = fresh();
  g.life.taps = []; // 連打なし
  const p = E.tapPower(g);
  const r = E.tap(g);
  const m = (r.crit ? 10 : 1) * p / D.LAYERS[0].hard;
  assert.ok(Math.abs(g.life.depth - m) < 1e-9);
  assert.ok(Math.abs(g.life.money - m * D.LAYERS[0].value) < 1e-9);
});

test("仲間を買うとお金が減り、数が増え、次の値段が上がる。お金が足りないと買えない", () => {
  const g = fresh();
  const b = D.BUILDINGS[0];
  assert.equal(E.buy(g, b.id), false);
  assert.equal(g.life.owned[b.id] || 0, 0);
  g.life.money = 1e6;
  const c0 = E.buildingCost(g, b.id);
  assert.equal(c0, b.cost);
  assert.equal(E.buy(g, b.id), true);
  assert.equal(g.life.owned[b.id], 1);
  assert.equal(g.life.money, 1e6 - c0);
  assert.ok(E.buildingCost(g, b.id) > c0);
});

test("仲間がいると、時間がたつだけで掘れる（毎秒の量 × 秒数）", () => {
  const g = fresh();
  g.life.owned[D.BUILDINGS[0].id] = 10;
  const ps = E.autoPower(g);
  assert.ok(ps > 0);
  E.tick(g, 2);
  assert.ok(Math.abs(g.life.depth - (ps * 2) / D.LAYERS[0].hard) < 1e-9);
  assert.ok(Math.abs(g.life.t - 2) < 1e-9);
});

test("地層の境目をまたぐと、その先は新しい地層のかたさで掘る", () => {
  const g = fresh();
  const rock = D.LAYERS[1];
  g.life.depth = rock.from - 1; // 境目の 1m 手前
  g.life.owned[D.BUILDINGS[0].id] = 1;
  const power = 1 * D.LAYERS[0].hard + 10 * rock.hard; // 土を 1m、岩盤を 10m 掘れる力
  E.dig(g, power);
  assert.ok(Math.abs(g.life.depth - (rock.from + 10)) < 1e-6, String(g.life.depth));
  assert.equal(E.layerOf(g).id, "rock");
});

test("地層には順番があり、深いほどかたく、お金も多い。壁のある地層には道具が決まっている", () => {
  for (let i = 1; i < D.LAYERS.length; i++) {
    assert.ok(D.LAYERS[i].from > D.LAYERS[i - 1].from);
    assert.ok(D.LAYERS[i].hard > D.LAYERS[i - 1].hard);
    assert.ok(D.LAYERS[i].value > D.LAYERS[i - 1].value);
  }
  assert.deepEqual(D.LAYERS.filter((l) => l.wall).map((l) => l.id), ["mantle", "outer", "inner"]);
  assert.equal(D.GOAL, 6371000);
});

test("仲間・機械は、決まった地層に着くまで買えない", () => {
  const g = fresh();
  g.life.money = 1e12;
  const locked = D.BUILDINGS.find((b) => b.layer === "rock");
  assert.equal(E.isUnlocked(g, locked.id), false);
  assert.equal(E.buy(g, locked.id), false);
  g.life.depth = D.LAYERS[1].from; g.life.layer = 1;
  assert.equal(E.isUnlocked(g, locked.id), true);
  assert.equal(E.buy(g, locked.id), true);
});

test("つるはしは順番に強くなり、タップ力が上がる", () => {
  const g = fresh();
  g.life.money = 1e15;
  const picks = D.UPGRADES.filter((u) => u.kind === "pick");
  assert.equal(E.buyUpgrade(g, picks[1].id), false, "飛ばして買えない");
  const before = E.tapPower(g);
  assert.equal(E.buyUpgrade(g, picks[0].id), true);
  assert.ok(E.tapPower(g) > before);
  assert.equal(E.buyUpgrade(g, picks[0].id), false, "同じものは 2回買えない");
});

test("仲間ごとの装備は、その仲間を一定数そろえると買えて、その仲間が 2倍になる", () => {
  const g = fresh();
  const b = D.BUILDINGS[0];
  const eq = D.UPGRADES.find((u) => u.kind === "equip" && u.building === b.id);
  g.life.money = 1e15;
  g.life.owned[b.id] = eq.need - 1;
  assert.equal(E.buyUpgrade(g, eq.id), false);
  g.life.owned[b.id] = eq.need;
  const before = E.autoPower(g);
  assert.equal(E.buyUpgrade(g, eq.id), true);
  assert.ok(Math.abs(E.autoPower(g) - before * 2) < 1e-6);
});

test("大きな数は日本式（万・億・兆…）、深さは m と km で表す", () => {
  assert.equal(E.fmtNum(0), "0");
  assert.equal(E.fmtNum(1234), "1,234");
  assert.equal(E.fmtNum(12345), "1.2万");
  assert.equal(E.fmtNum(485000), "48.5万");
  assert.equal(E.fmtNum(12000000), "1,200万");
  assert.equal(E.fmtNum(1.2e8), "1.2億");
  assert.equal(E.fmtNum(8.7e15), "8,700兆");
  assert.equal(E.fmtNum(3e20), "3垓");
  assert.equal(E.fmtDepth(38.4), "38 m");
  assert.equal(E.fmtDepth(3.25), "3.3 m");
  assert.equal(E.fmtDepth(3200), "3.2 km");
  assert.equal(E.fmtDepth(1840000), "1,840 km");
  assert.equal(E.fmtDepth(6371000), "6,371 km");
});

test("状態を JSON にして戻しても、同じ続きになる（保存のため）", () => {
  const a = fresh(7);
  a.life.owned[D.BUILDINGS[0].id] = 3;
  for (let i = 0; i < 20; i++) { E.tap(a); E.tick(a, 0.25); }
  const b = clone(a);
  for (const g of [a, b]) for (let i = 0; i < 50; i++) { E.tap(g); E.tick(g, 0.5); }
  assert.deepEqual(a, b);
});
