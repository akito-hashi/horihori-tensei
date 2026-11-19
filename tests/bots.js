// バランス確認用のボット（テストとシミュレーションで共用）
// 時間は「遊んだ時間」。1回の呼び出しで、クリアするまで（または上限まで）遊ぶ。
const E = require("../engine.js");
const D = require("../data.js");

const clone = (o) => JSON.parse(JSON.stringify(o));

// 買い物：毎秒どれだけ速くなるか ÷ 値段 が一番よいものを選ぶ。すぐ買えないなら、少し待つ価値があるかで決める
// （速さのため、試しに買った状態を作って測り、すぐ元に戻す）
function trial(g, apply, undo, speed) { apply(); const v = speed(g); undo(); return v; }
function shop(g, tapsPerSec) {
  for (let guard = 0; guard < 3000; guard++) {
    const L = g.life;
    const ratio = E.layerOf(g).value / E.hardNow(g); // 力 1 あたりのお金（今の深さで）
    const taps = tapsPerSec + (g.tree.t6 ? D.AUTO_TAP : 0);
    const speed = (x) => E.autoPower(x) + E.tapPower(x) * (1 + 9 * E.critChance(x)) * taps; // かたさで割る前の力（会心の期待値こみ）
    const base = speed(g);
    const income = Math.max(1e-9, base * ratio);
    const cands = [];
    for (const c of D.COMPANIONS) {
      if (!E.isUnlocked(g, c.id)) continue;
      const n = L.lv[c.id] || 0;
      const v = trial(g, () => { L.lv[c.id] = n + 1; }, () => { if (n) L.lv[c.id] = n; else delete L.lv[c.id]; }, speed);
      cands.push({ kind: "lv", id: c.id, cost: E.levelCost(g, c.id), gain: v - base });
    }
    for (const sk of D.SKILLS) {
      if (!E.canBuySkill(g, sk.id)) continue;
      let gain = trial(g, () => { L.skills[sk.id] = true; }, () => { delete L.skills[sk.id]; }, speed) - base;
      if (sk.turbo) gain = E.compPower(g, "drill") * (D.TURBO.mult - 1) * D.TURBO.dur / D.TURBO.every;
      if (sk.ore) gain = base * 0.05;
      cands.push({ kind: "sk", id: sk.id, cost: E.skillCost(sk.id), gain });
    }
    for (const line of Object.keys(D.GEAR)) {
      const cost = E.gearCost(g, line);
      if (cost == null) continue;
      const gain = line === "helmet" ? base * 0.05 : trial(g, () => { L.gear[line] += 1; }, () => { L.gear[line] -= 1; }, speed) - base;
      cands.push({ kind: "gear", id: line, cost, gain });
    }
    if (!cands.length) return;
    // 「買うまで待つ時間 + 元が取れる時間」が一番短いもの
    const score = (c) => Math.max(0, c.cost - L.money) / income + c.cost / Math.max(1e-12, c.gain * ratio);
    cands.sort((a, b) => score(a) - score(b));
    const best = cands[0];
    if (L.money < best.cost) return;
    const ok = best.kind === "lv" ? E.levelUp(g, best.id) : best.kind === "sk" ? E.buySkill(g, best.id) : E.buyGear(g, best.id);
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

// 宇宙（星めぐり）を遊ぶ。地球をクリアした game から、上限の時間まで。星ごとのクリア時間（分）を返す
function playSpace(g, opt = {}) {
  opt = { tapsPerSec: 3, oreCatch: 0.85, minutes: 180, ...opt };
  if (!E.enterSpace(g)) throw new Error("宇宙へ行けない");
  const start = g.totalTime, out = [];
  let planetStart = g.totalTime, tapAcc = 0, oreSeen = null, coreSince = null, bestOdds = 0, hist = [];
  const spend = () => {
    for (let guard = 0; guard < 80; guard++) {
      const opts = D.TREE.filter((n) => E.canUnlock(g, n.id) && n.cost <= g.shards).sort((a, b) => a.cost - b.cost);
      if (opts.length && E.unlockNode(g, opts[0].id)) continue;
      if (E.pray(g)) continue;
      return;
    }
  };
  spend();
  while (g.totalTime - start < opt.minutes * 60 && out.length < (opt.maxPlanets || 40)) {
    const L = g.life;
    const ev = E.tick(g, 0.25);
    for (const e of ev) if (e.type === "bossWin") { out.push(+((g.totalTime - planetStart) / 60).toFixed(1)); planetStart = g.totalTime; coreSince = null; bestOdds = 0; }
    if (L.ore.shown) { if (!oreSeen) oreSeen = { at: L.t, will: E.rand(g) < opt.oreCatch }; if (oreSeen.will && L.t - oreSeen.at >= 1.5) { E.tapOre(g); oreSeen = null; } } else oreSeen = null;
    tapAcc += opt.tapsPerSec * 0.25;
    while (tapAcc >= 1) { tapAcc -= 1; E.tap(g); }
    if (Math.abs(L.t % 1) < 1e-9 || Math.abs((L.t % 1) - 1) < 1e-9) {
      if (!L.boss) shop(g, opt.tapsPerSec);
      if (L.atCore && !L.boss) {
        if (coreSince == null) coreSince = L.t;
        const odds = E.bossOdds(g, opt.tapsPerSec);
        if (odds >= 1.15) E.startBoss(g);
        if (odds > bestOdds * 1.05) { bestOdds = odds; coreSince = L.t; }
        // 中心で 4分たっても見こみが伸びない → 転生
        if (L.t - coreSince > 240 && E.rebirthShards(g) >= 1) { E.rebirth(g); spend(); coreSince = null; bestOdds = 0; hist = []; }
      } else if (!L.atCore) {
        hist.push([L.t, L.depth]);
        const old = hist.find(([t]) => t >= L.t - 180);
        if (L.t > 300 && old && L.depth < old[1] * 1.05 && E.rebirthShards(g) >= 1) { E.rebirth(g); spend(); hist = []; }
      }
    }
  }
  return out;
}

module.exports = { playUntilClear, playSpace, _shop: shop };
