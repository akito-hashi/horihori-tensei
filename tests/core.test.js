const test = require("node:test");
const assert = require("node:assert/strict");
const E = require("../engine.js");
const D = require("../data.js");

const fresh = (seed = 1) => E.newGame({ seed });
const clone = (o) => JSON.parse(JSON.stringify(o));

test("はじめは深さ 0・お金 0・1回目の人生・星のかけら 0・仲間なし・装備なし", () => {
  const g = fresh();
  assert.deepEqual(g.life.lv, {});
  assert.deepEqual(g.life.gear, { pick: 0, glove: 0, helmet: 0, boots: 0 });
  assert.equal(g.v, 2);
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

test("仲間がいると、時間がたつだけで掘れる（毎秒の量 × 秒数）", () => {
  const g = fresh();
  g.life.lv.mog = 10;
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
  const power = E.powerBetween(0, rock.from - 1, rock.from) + E.powerBetween(1, rock.from, rock.from + 10); // 土を 1m、岩盤を 10m 掘れる力
  E.dig(g, power);
  assert.ok(Math.abs(g.life.depth - (rock.from + 10)) < 1e-6, String(g.life.depth));
  assert.equal(E.layerOf(g).id, "rock");
});

test("地層の中でも、深くなるほどかたくなる（同じ力でも進みが遅くなる）", () => {
  const g = fresh();
  const rock = D.LAYERS[1];
  g.life.layer = 1; g.life.depth = rock.from;
  const first = E.dig(g, 1000).dug;
  g.life.depth = 1500;
  const later = E.dig(g, 1000).dug;
  assert.ok(later < first * 0.5, `${first} ${later}`);
  assert.ok(E.hardNow(g) > rock.hard);
});

test("地層には順番があり、深いほどかたく、お金も多い。境目で柔らかくならない", () => {
  for (let i = 1; i < D.LAYERS.length; i++) {
    const a = D.LAYERS[i - 1], b = D.LAYERS[i];
    assert.ok(b.from > a.from);
    assert.ok(b.value > a.value);
    assert.ok(b.hard >= E.hardAt(a, b.from), `${a.id}→${b.id}`);
  }
  assert.deepEqual(D.LAYERS.filter((l) => l.wall).map((l) => l.id), ["mantle", "outer", "inner"]);
  assert.equal(D.GOAL, 6371000);
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
  assert.equal(E.fmtDepth(0), "0 m");
  assert.equal(E.fmtDepth(0.04), "4 cm");
  assert.equal(E.fmtDepth(0.001), "1 cm");
  assert.equal(E.fmtDepth(38.4), "38 m");
  assert.equal(E.fmtDepth(3.25), "3.3 m");
  assert.equal(E.fmtDepth(3200), "3.2 km");
  assert.equal(E.fmtDepth(1840000), "1,840 km");
  assert.equal(E.fmtDepth(6371000), "6,371 km");
});

test("状態を JSON にして戻しても、同じ続きになる（保存のため）", () => {
  const a = fresh(7);
  a.life.lv.mog = 3;
  for (let i = 0; i < 20; i++) { E.tap(a); E.tick(a, 0.25); }
  const b = clone(a);
  for (const g of [a, b]) for (let i = 0; i < 50; i++) { E.tap(g); E.tick(g, 0.5); }
  assert.deepEqual(a, b);
});
