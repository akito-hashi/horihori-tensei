// バランス確認用のボット（テストとシミュレーションで共用）
// 時間は「遊んだ時間」。1回の呼び出しで、クリアするまで（または上限まで）遊ぶ。
const E = require("../engine.js");
const D = require("../data.js");

const clone = (o) => JSON.parse(JSON.stringify(o));

// 買い物：毎秒どれだけ速くなるか ÷ 値段 が一番よいものを選ぶ。すぐ買えないなら、少し待つ価値があるかで決める
function shop(g, tapsPerSec) {
  for (let guard = 0; guard < 200; guard++) {
    const L = g.life;
    const ratio = E.layerOf(g).value / E.hardNow(g); // 力 1 あたりのお金（今の深さで）
    const speed = (x) => E.autoPower(x) + E.tapPower(x) * tapsPerSec; // かたさで割る前の力
    const base = speed(g);
    const income = Math.max(1e-9, base * ratio);
    const cands = [];
    for (const b of D.BUILDINGS) {
      if (!E.isUnlocked(g, b.id)) continue;
      const t = clone(g); t.life.owned[b.id] = (t.life.owned[b.id] || 0) + 1;
      cands.push({ kind: "b", id: b.id, cost: E.buildingCost(g, b.id), gain: speed(t) - base });
    }
    for (const u of D.UPGRADES) {
      if (!E.canBuyUpgrade(g, u.id) || u.kind === "light") continue;
      const t = clone(g); t.life.upgrades[u.id] = true;
      cands.push({ kind: "u", id: u.id, cost: u.cost, gain: speed(t) - base });
    }
    if (E.canBuyUpgrade(g, "light")) cands.push({ kind: "u", id: "light", cost: D.UPGRADES.find((u) => u.id === "light").cost, gain: base * 0.1 });
    if (!cands.length) return;
    // 「買うまで待つ時間 + 元が取れる時間」が一番短いもの
    const score = (c) => Math.max(0, c.cost - L.money) / income + c.cost / Math.max(1e-12, c.gain * ratio);
    cands.sort((a, b) => score(a) - score(b));
    const best = cands[0];
    if (L.money < best.cost) return;
    const ok = best.kind === "b" ? E.buy(g, best.id) : E.buyUpgrade(g, best.id);
    if (!ok) return;
  }
}

// スキルツリー：前の人生で止められた壁の道具を最優先（足りなければ貯める）。それ以外は安い順
function spendShards(g, needTool) {
  if (needTool && !g.tree[needTool] && !E.unlockNode(g, needTool)) return;
  for (let guard = 0; guard < 50; guard++) {
    const tool = D.TREE.find((n) => n.branch === "tool" && E.canUnlock(g, n.id));
    const opts = D.TREE.filter((n) => n.branch !== "tool" && E.canUnlock(g, n.id) && n.cost <= g.shards).sort((a, b) => a.cost - b.cost);
    if (opts.length && E.unlockNode(g, opts[0].id)) continue;
    if (tool && E.unlockNode(g, tool.id)) continue;
    return;
  }
}

// 1回の人生を遊ぶ。転生すべきと判断したら止まる
function playLife(g, opt) {
  const dt = 0.25;
  let tapAcc = 0, oreSeenAt = null, wallSince = null;
  const hist = []; // [t, depth]
  const L = g.life;
  while (L.t < opt.maxLife) {
    const ev = E.tick(g, dt);
    if (ev.some((e) => e.type === "clear")) return "clear";
    if (L.ore.shown) {
      if (oreSeenAt == null) oreSeenAt = { at: L.t, will: E.rand(g) < opt.oreCatch };
      if (oreSeenAt.will && L.t - oreSeenAt.at >= 1.5) { E.tapOre(g); oreSeenAt = null; }
    } else oreSeenAt = null;
    tapAcc += opt.tapsPerSec * dt;
    while (tapAcc >= 1) { tapAcc -= 1; if (E.tap(g).events.some((e) => e.type === "clear")) return "clear"; }
    if (Math.abs(L.t % 1) < 1e-9 || Math.abs((L.t % 1) - 1) < 1e-9) {
      shop(g, opt.tapsPerSec);
      hist.push([L.t, L.depth]);
      if (L.atWall) { if (wallSince == null) wallSince = L.t; } else wallSince = null;
      if (wallSince != null && L.t - wallSince > 20 && E.rebirthShards(g) >= 1) return "wall";
      // 伸びが鈍った：直近 opt.slowWin 秒で深さが opt.slowPct も増えていない
      const old = hist.find(([t]) => t >= L.t - opt.slowWin);
      if (L.t > 240 && old && L.depth < old[1] * (1 + opt.slowPct) && E.rebirthShards(g) >= 1) return "slow";
    }
  }
  return "limit";
}

// 子どもらしい使い方：壁の道具が買えるなら買う。それ以外は安い順に、壁の道具のぶんを残さずに使う
function spendCheapFirst(g) {
  const tool = E.wallTool(g) || (g.lives.length && g.lives[g.lives.length - 1].wall);
  if (tool && !g.tree[tool]) E.unlockNode(g, tool);
  for (let guard = 0; guard < 50; guard++) {
    const opts = D.TREE.filter((n) => E.canUnlock(g, n.id) && n.cost <= g.shards).sort((a, b) => a.cost - b.cost);
    if (!opts.length || !E.unlockNode(g, opts[0].id)) return;
  }
}

function playUntilClear(seed, opt = {}) {
  opt = { tapsPerSec: 3, oreCatch: 0.85, maxTotal: 6 * 3600, maxLife: 3600, slowWin: 120, slowPct: 0.08, ...opt };
  const g = E.newGame({ seed });
  const lives = [];
  let saving = null;
  while (g.totalTime < opt.maxTotal) {
    if (opt.cheapFirst) spendCheapFirst(g); else spendShards(g, saving);
    const res = playLife(g, opt);
    lives.push({ t: g.life.t, depth: g.life.depth, res, shardsGot: res === "clear" ? 0 : E.rebirthShards(g), reach: { ...g.life.reach } });
    if (res === "clear") break;
    saving = E.wallTool(g);
    if (!E.rebirth(g)) break;
  }
  return { cleared: g.cleared, totalMin: g.totalTime / 60, lives, game: g };
}

module.exports = { playUntilClear, _shop: shop };
