// 仲間（レベル・変身・特技）・自分の装備・オートタップ・古いセーブの置きかえ
const test = require("node:test");
const assert = require("node:assert/strict");
const E = require("../engine.js");
const D = require("../data.js");

const fresh = (seed = 1) => E.newGame({ seed });
const COMP = Object.fromEntries(D.COMPANIONS.map((c) => [c.id, c]));
const rich = (g) => { g.life.money = 1e30; return g; };

test("仲間は 4人。モグは最初から、ガンさんは岩盤、ドリルンは化石の層、ソコはスキルツリーで仲間になる", () => {
  assert.deepEqual(D.COMPANIONS.map((c) => c.id), ["mog", "gan", "drill", "soko"]);
  const g = rich(fresh());
  assert.equal(E.isUnlocked(g, "mog"), true);
  assert.equal(E.isUnlocked(g, "gan"), false);
  assert.equal(E.levelUp(g, "gan"), false);
  g.life.layer = 1;
  assert.equal(E.isUnlocked(g, "gan"), true);
  assert.equal(E.isUnlocked(g, "drill"), false);
  g.life.layer = 2;
  assert.equal(E.isUnlocked(g, "drill"), true);
  assert.equal(E.isUnlocked(g, "soko"), false);
  g.tree.f5 = true;
  assert.equal(E.isUnlocked(g, "soko"), true);
});

test("強化するとお金が減ってレベルが 1上がり、次の値段は 1.15倍。お金が足りないと強化できない", () => {
  const g = fresh();
  assert.equal(E.levelUp(g, "mog"), false);
  assert.equal(E.lv(g, "mog"), 0);
  g.life.money = 1000;
  const c0 = E.levelCost(g, "mog");
  assert.equal(c0, COMP.mog.cost);
  assert.ok(E.levelUp(g, "mog"));
  assert.equal(E.lv(g, "mog"), 1);
  assert.equal(g.life.money, 1000 - c0);
  assert.equal(E.levelCost(g, "mog"), Math.ceil(COMP.mog.cost * D.COST_GROWTH));
});

test("掘る力はレベルに比例し、Lv.10・25・50・100… に着くたびに 2倍", () => {
  const g = fresh();
  const at = (n) => { g.life.lv.mog = n; return E.compPower(g, "mog"); };
  assert.equal(at(0), 0);
  assert.ok(Math.abs(at(9) - 9 * COMP.mog.out) < 1e-9);
  assert.ok(Math.abs(at(10) - 10 * COMP.mog.out * 2) < 1e-9);
  assert.ok(Math.abs(at(25) - 25 * COMP.mog.out * 4) < 1e-9);
  assert.ok(Math.abs(at(100) - 100 * COMP.mog.out * 16) < 1e-9);
});

test("見た目の段階（変身）：Lv.1=0、10=1、25=2、50=3、100=4。変身した強化では transformed が返る", () => {
  const g = rich(fresh());
  assert.equal(E.stage(g, "mog"), -1);
  for (const [n, st] of [[1, 0], [9, 0], [10, 1], [24, 1], [25, 2], [50, 3], [99, 3], [100, 4], [500, 4]]) {
    g.life.lv.mog = n;
    assert.equal(E.stage(g, "mog"), st, `Lv.${n}`);
  }
  g.life.lv.mog = 9;
  const r = E.levelUp(g, "mog");
  assert.equal(r.lv, 10);
  assert.equal(r.transformed, true);
  assert.equal(E.levelUp(g, "mog").transformed, false);
  g.life.lv.mog = 0;
  assert.equal(E.levelUp(g, "mog").joined, true, "Lv.0 → 1 は仲間になった");
});

test("特技はレベルが足りるまで買えず、1回だけ。値段は仲間の Lv.1 の値段 × 決まった倍率", () => {
  const g = rich(fresh());
  const sk = D.SKILLS.find((s) => s.id === "mog_b");
  g.life.lv.mog = sk.need - 1;
  assert.equal(E.canBuySkill(g, sk.id), false);
  g.life.lv.mog = sk.need;
  assert.equal(E.canBuySkill(g, sk.id), true);
  assert.equal(E.skillCost(sk.id), COMP.mog.cost * sk.cost);
  const before = g.life.money;
  assert.equal(E.buySkill(g, sk.id), true);
  assert.equal(g.life.money, before - E.skillCost(sk.id));
  assert.equal(E.buySkill(g, sk.id), false);
  assert.equal(D.SKILLS.length, 12);
  for (const c of D.COMPANIONS) assert.deepEqual(D.SKILLS.filter((s) => s.comp === c.id).map((s) => s.need), [10, 25, 50]);
});

test("特技：その仲間 ×3、仲間全員 ×1.2", () => {
  const g = fresh();
  g.life.lv.mog = 30; g.life.lv.gan = 30; g.life.layer = 1;
  const m = E.compPower(g, "mog"), gp = E.compPower(g, "gan");
  g.life.skills.mog_b = true;
  assert.ok(Math.abs(E.compPower(g, "mog") - m * 3) < 1e-9);
  assert.ok(Math.abs(E.compPower(g, "gan") - gp) < 1e-9);
  g.life.skills.gan_c = true;
  assert.ok(Math.abs(E.compPower(g, "gan") - gp * 1.2) < 1e-9);
  assert.ok(Math.abs(E.compPower(g, "mog") - m * 3 * 1.2) < 1e-9);
});

test("特技「仲よし」：タップにモグの毎秒の力の 10% が上乗せ", () => {
  const g = fresh();
  g.life.lv.mog = 20;
  const base = E.tapPower(g);
  g.life.skills.mog_a = true;
  assert.ok(Math.abs(E.tapPower(g) - (base + 0.1 * E.compPower(g, "mog"))) < 1e-9);
});

test("特技「ターボ」：30秒ごとに 5秒間、ドリルンだけ 3倍", () => {
  const g = fresh();
  g.life.lv.drill = 12; g.life.layer = 2;
  g.life.skills.drill_a = true;
  g.life.t = 40; // 30秒の区切りのうち 10秒目：ふつう
  const normal = E.compPower(g, "drill");
  assert.equal(E.turboOn(g), false);
  g.life.t = 56; // 26秒目：最後の 5秒はターボ
  assert.equal(E.turboOn(g), true);
  assert.ok(Math.abs(E.compPower(g, "drill") - normal * 3) < 1e-9);
  delete g.life.skills.drill_a;
  assert.equal(E.turboOn(g), false, "特技がなければターボしない");
});

test("会心：開放前でも「会心の教え」とブーツで出るようになり、確率が足し算で上がる", () => {
  const g = fresh(4);
  assert.equal(E.critChance(g), 0);
  g.life.skills.gan_a = true;
  assert.ok(Math.abs(E.critChance(g) - 0.05) < 1e-12);
  g.life.gear.boots = 2;
  assert.ok(Math.abs(E.critChance(g) - 0.11) < 1e-12);
  g.tree.t3 = true;
  assert.ok(Math.abs(E.critChance(g) - 0.21) < 1e-12);
});

test("装備は段階を順番に買う。つるはしは 1段階ごとにタップ ×3、最後まで買うともう買えない", () => {
  const g = rich(fresh());
  const t0 = E.tapPower(g);
  assert.equal(E.gearCost(g, "pick"), D.GEAR.pick.tiers[0].cost);
  assert.ok(E.buyGear(g, "pick"));
  assert.equal(g.life.gear.pick, 1);
  assert.equal(E.tapPower(g), t0 * 3);
  assert.equal(E.gearCost(g, "pick"), D.GEAR.pick.tiers[1].cost);
  for (let i = 1; i < D.GEAR.pick.tiers.length; i++) assert.ok(E.buyGear(g, "pick"));
  assert.equal(E.gearCost(g, "pick"), null);
  assert.equal(E.buyGear(g, "pick"), false);
  const poor = fresh();
  assert.equal(E.buyGear(poor, "glove"), false);
});

test("手袋：連打中の力が 1段階ごとに +50%（連打ボーナスがなくても効く）", () => {
  const g = fresh();
  g.life.gear.glove = 2;
  const m = E.tapPower(g) / D.LAYERS[0].hard;
  const gains = [];
  for (let i = 0; i < 5; i++) { gains.push(E.tap(g).gain); E.tick(g, 0.1); }
  assert.ok(Math.abs(gains[0] - m) < 1e-9);
  assert.ok(Math.abs(gains[4] - m * 2) < 1e-9, String(gains[4] / m));
  g.tree.t2 = true;
  E.tick(g, 0.05);
  assert.ok(Math.abs(E.tap(g).gain - m * 2.5) < 1e-9);
});

test("ヘルメットのライトと「光の道」で光る鉱石が出やすくなる", () => {
  const g = fresh();
  assert.equal(E.oreFreq(g), 1);
  g.life.gear.helmet = 2;
  assert.ok(Math.abs(E.oreFreq(g) - 1.5625) < 1e-12);
  g.life.skills.soko_a = true;
  assert.ok(Math.abs(E.oreFreq(g) - 1.5625 * 1.3) < 1e-12);
});

test("まとめ買い割引は強化の値段 10%引き。チームワークはレベルの合計 100 ごとに仲間全員 ×1.5", () => {
  const g = fresh();
  g.life.lv.mog = 60; g.life.lv.gan = 39; g.life.layer = 1;
  const c = E.levelCost(g, "mog");
  g.tree.f2 = true;
  assert.equal(E.levelCost(g, "mog"), Math.ceil(COMP.mog.cost * Math.pow(D.COST_GROWTH, 60) * 0.9));
  assert.ok(E.levelCost(g, "mog") < c);
  const a = E.autoPower(g);
  g.tree.f3 = true;
  assert.ok(Math.abs(E.autoPower(g) - a) < 1e-6, "合計 99 では変わらない");
  g.life.lv.gan = 40;
  const b = E.autoPower(g);
  g.tree.f3 = false; delete g.tree.f3;
  assert.ok(Math.abs(b - E.autoPower(g) * 1.5) < 1e-6);
});

test("オートタップ：開放すると 1秒に 3回、自動でタップする（開放前はしない）", () => {
  const a = fresh(), b = fresh();
  b.tree.t6 = true;
  let autos = 0;
  for (let i = 0; i < 40; i++) { E.tick(a, 0.25); autos += E.tick(b, 0.25).filter((e) => e.type === "autotap").length; }
  assert.equal(a.life.depth, 0);
  assert.ok(Math.abs(autos - 30) <= 1, String(autos));
  const per = E.tapPower(b) / D.LAYERS[0].hard;
  assert.ok(Math.abs(b.life.depth - autos * per) < 1e-6);
});

test("前のしくみ（仲間を何人もやとう）の古いセーブは、仲間のレベルと装備に置きかえて続きから遊べる", () => {
  const old = {
    v: 1, rng: 5, lifeNo: 3, shards: 20, tree: { t1: true, f3: true }, fossils: {}, prevReach: {}, lives: [], clears: [], cleared: false, totalTime: 99,
    life: { depth: 3000, layer: 2, money: 500, t: 40, reach: {}, taps: [], atWall: false, cleared: false, boost: null, ore: null,
      owned: { apprentice: 10, mole: 5, shovel: 3, jack: 2, tunnel: 1, machine: 1, magma: 0, chitei: 0 },
      upgrades: { pick_iron: true, pick_steel: true, light: true, eq_mole: true } },
  };
  assert.equal(E.sanitize(old), true);
  assert.equal(old.v, 2);
  assert.deepEqual(old.life.lv, { mog: 15, gan: 5, drill: 2 });
  assert.equal(old.life.gear.pick, 2);
  assert.equal(old.life.gear.helmet, 1);
  assert.equal(old.life.owned, undefined);
  assert.equal(old.life.upgrades, undefined);
  assert.equal(old.shards, 20);
  assert.ok(old.tree.t1);
});
