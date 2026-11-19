// スキルツリー「💰 お金」の枝：お小づかい・貯金の利子・宝箱・仲間の紹介状・黄金の土
const test = require("node:test");
const assert = require("node:assert/strict");
const E = require("../engine.js");
const D = require("../data.js");

const fresh = (seed = 1) => E.newGame({ seed });
const node = (id) => D.TREE.find((n) => n.id === id);

test("お金の枝は 5マスで、根元から順に開放する", () => {
  const ms = D.TREE.filter((n) => n.branch === "money");
  assert.deepEqual(ms.map((n) => n.id), ["m1", "m2", "m3", "m4", "m5"]);
  const g = fresh();
  g.shards = 1e6;
  assert.equal(E.unlockNode(g, "m2"), false);
  assert.ok(E.unlockNode(g, "m1"));
  assert.ok(E.unlockNode(g, "m2"));
});

test("お小づかい（×2）と黄金の土（×3）で、掘って入るお金が増える", () => {
  const gain = (tree) => { const g = fresh(); Object.assign(g.tree, tree); E.dig(g, 50); return g.life.money; };
  const base = gain({});
  assert.ok(Math.abs(gain({ m1: true }) - base * node("m1").moneyMult) < 1e-9);
  assert.ok(Math.abs(gain({ m1: true, m5: true }) - base * node("m1").moneyMult * node("m5").moneyMult) < 1e-9);
  assert.ok(node("m1").desc.includes("×" + node("m1").moneyMult));
});

test("貯金の利子：掘らなくても、持っているお金が毎秒すこし増える（増え方には上限あり）", () => {
  const g = fresh();
  g.life.layer = 3; g.life.depth = 35000; g.life.atWall = true; // 壁で止まっている
  g.life.money = 1000;
  E.tick(g, 1);
  assert.equal(g.life.money, 1000, "開放前は増えない");
  g.tree.m2 = true;
  E.tick(g, 1);
  assert.ok(g.life.money > 1000);
  // 上限：稼ぎが 0 でも、とても大きなお金が爆発的に増えたりしない
  const h = fresh();
  h.tree.m2 = true; h.life.money = 1e15;
  E.tick(h, 10);
  assert.ok(h.life.money < 1e15 * 1.001, String(h.life.money));
});

test("宝箱：開放するとときどき出て、タップすると今の稼ぎの約 1分ぶんのお金。しばらくすると消える", () => {
  const g = fresh(3);
  g.life.lv.mog = 20;
  for (let i = 0; i < 1000; i++) E.tick(g, 0.25);
  assert.ok(!g.life.chest || !g.life.chest.shown, "開放前は出ない");
  g.tree.m3 = true;
  E.scheduleChest(g);
  let seen = null;
  for (let i = 0; i < 4 * D.CHEST.maxGap + 8 && !seen; i++) seen = E.tick(g, 0.25).find((e) => e.type === "chest");
  assert.ok(seen, "決まった時間のうちに出る");
  const income = E.incomeRate(g);
  const before = g.life.money;
  const r = E.tapChest(g);
  assert.ok(r && r.money > 0);
  assert.ok(Math.abs(g.life.money - before - r.money) < 1e-6);
  assert.ok(r.money >= income * D.CHEST.seconds * 0.99);
  assert.equal(E.tapChest(g), null, "取ったらもうない");
  // 取らないと消える
  for (let i = 0; i < 4 * D.CHEST.maxGap + 8 && !(g.life.chest && g.life.chest.shown); i++) E.tick(g, 0.25);
  assert.ok(g.life.chest.shown);
  for (let i = 0; i < 4 * D.CHEST.show + 4; i++) E.tick(g, 0.25);
  assert.equal(g.life.chest.shown, false);
});

test("仲間の紹介状：仲間になる最初の値段（Lv.0 → 1）だけが 1/10", () => {
  const g = fresh();
  g.life.layer = 2;
  const join = E.levelCost(g, "drill");
  g.tree.m4 = true;
  assert.equal(E.levelCost(g, "drill"), Math.ceil(join / 10));
  g.life.lv.drill = 1;
  const g2 = fresh(); g2.life.layer = 2; g2.life.lv.drill = 1;
  assert.equal(E.levelCost(g, "drill"), E.levelCost(g2, "drill"), "Lv.1 からの強化はふつうの値段");
});

test("宝箱があるセーブも、保存して戻すと同じ続きになる", () => {
  const g = fresh(5);
  g.tree.m3 = true; g.tree.m2 = true; g.life.lv.mog = 10;
  E.scheduleChest(g);
  for (let i = 0; i < 300; i++) E.tick(g, 0.5);
  const s = JSON.parse(JSON.stringify(g));
  assert.equal(E.sanitize(s), true);
  for (const x of [g, s]) for (let i = 0; i < 200; i++) { E.tick(x, 0.5); if (x.life.chest && x.life.chest.shown) E.tapChest(x); }
  assert.deepEqual(g, s);
});
