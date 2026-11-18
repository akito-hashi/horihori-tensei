// ほりほり転生 — ゲームのルール（画面は app.js）
// 状態はすべて素のオブジェクト。乱数の状態も game.rng に持つので、JSON にして保存・復元しても同じ続きになる。
// 時間は「アプリを開いて遊んだ時間」だけ進む（放置はない）。
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./data.js"));
  else root.Engine = factory(root.GameData);
})(typeof self !== "undefined" ? self : this, function (D) {
  "use strict";

  // ---- 乱数（mulberry32） ----
  function rand(game) {
    game.rng = (game.rng + 0x6d2b79f5) >>> 0;
    let t = game.rng;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  const COMP = Object.fromEntries(D.COMPANIONS.map((c) => [c.id, c]));
  const SKILL = Object.fromEntries(D.SKILLS.map((k) => [k.id, k]));
  const GEAR_LINES = Object.keys(D.GEAR);
  const NODE = Object.fromEntries(D.TREE.map((n) => [n.id, n]));
  const LAYER_INDEX = Object.fromEntries(D.LAYERS.map((l, i) => [l.id, i]));
  const has = (game, id) => !!(game.tree && game.tree[id]);

  function newLife(game) {
    const L = { depth: 0, layer: 0, money: 0, t: 0, lv: {}, skills: {}, gear: { pick: 0, glove: 0, helmet: 0, boots: 0 }, autoAcc: 0,
      taps: [], reach: {}, atWall: false, cleared: false, boost: null, ore: null };
    game.life = L;
    scheduleOre(game);
    return L;
  }

  function newGame({ seed } = {}) {
    const game = {
      v: 2,
      rng: (seed == null ? Math.floor(Math.random() * 2 ** 32) : seed) >>> 0,
      lifeNo: 1,
      shards: 0,
      tree: {},
      fossils: {},
      prevReach: {},
      lives: [],
      clears: [],
      cleared: false,
      totalTime: 0,
      life: null,
    };
    newLife(game);
    return game;
  }

  const layerOf = (game) => D.LAYERS[game.life.layer];

  // ---- 力の計算 ----
  function fossilMult(game) {
    return 1 + D.FOSSIL_BONUS * Object.keys(game.fossils || {}).length;
  }
  function boostMult(game) {
    const b = game.life.boost;
    return b && game.life.t < b.until ? b.mult : 1;
  }
  // ---- 仲間 ----
  const lv = (game, id) => game.life.lv[id] || 0;
  // 見た目の段階：-1=まだ仲間でない、0=Lv.1〜、1=Lv.10〜、2=Lv.25〜、3=Lv.50〜、4=Lv.100〜
  function stage(game, id) {
    const n = lv(game, id);
    if (!n) return -1;
    return D.LV_MILESTONES.slice(0, 4).filter((m) => n >= m).length;
  }
  function turboOn(game) {
    return !!game.life.skills.drill_a && game.life.t % D.TURBO.every >= D.TURBO.every - D.TURBO.dur;
  }
  // その仲間が毎秒掘る力（スキルツリーの倍率・化石・ブーストは含まない）
  function compPower(game, id) {
    const n = lv(game, id);
    if (!n) return 0;
    let p = n * COMP[id].out * Math.pow(2, D.LV_MILESTONES.filter((m) => n >= m).length);
    for (const k of D.SKILLS) {
      if (!game.life.skills[k.id]) continue;
      if (k.selfMult && k.comp === id) p *= k.selfMult;
      if (k.allMult) p *= k.allMult;
    }
    if (id === "drill" && turboOn(game)) p *= D.TURBO.mult;
    return p;
  }
  function totalLv(game) {
    return D.COMPANIONS.reduce((a, c) => a + lv(game, c.id), 0);
  }
  // 仲間全員が毎秒掘る力（かたさで割る前・ブーストなし）
  function autoRaw(game) {
    let p = 0;
    for (const c of D.COMPANIONS) p += compPower(game, c.id);
    for (const nd of D.TREE) if (nd.autoMult && has(game, nd.id)) p *= nd.autoMult;
    if (has(game, "f3")) p *= Math.pow(1.5, Math.floor(totalLv(game) / 100));
    return p * fossilMult(game);
  }
  function autoPower(game) {
    return autoRaw(game) * boostMult(game);
  }
  function critChance(game) {
    let c = has(game, "t3") ? 0.1 : 0;
    for (const k of D.SKILLS) if (k.crit && game.life.skills[k.id]) c += k.crit;
    return c + D.GEAR.boots.crit * game.life.gear.boots;
  }
  function comboMult(game) {
    return 1 + (has(game, "t2") ? D.COMBO.base : 0) + D.GEAR.glove.combo * game.life.gear.glove;
  }
  // タップ 1回の掘る力（かたさで割る前。連打・会心は含まない）
  function tapPower(game) {
    let p = Math.pow(D.GEAR.pick.tapMult, game.life.gear.pick);
    for (const nd of D.TREE) if (nd.tapMult && has(game, nd.id)) p *= nd.tapMult;
    p *= fossilMult(game);
    if (has(game, "t4")) p += 0.05 * autoRaw(game);
    if (game.life.skills.mog_a) p += SKILL.mog_a.tapShare * compPower(game, "mog");
    return p * boostMult(game);
  }
  // 今の地層で、毎秒何 m 掘れるか（表示用）
  function autoSpeed(game) {
    return autoPower(game) / hardAt(layerOf(game), game.life.depth);
  }
  function hardNow(game) {
    return hardAt(layerOf(game), game.life.depth);
  }

  // ---- 掘る ----
  // 地層の中では、深くなるほどかたくなる：かたさ = hard × (深さ ÷ その地層の始まり)^grow
  // お金は掘った m × value。深くなるほど 1m が重くなるので、稼ぎの伸びもゆっくりになる（そこで転生）
  function hardAt(layer, d) {
    return layer.grow ? layer.hard * Math.pow(Math.max(1, d / layer.from), layer.grow) : layer.hard;
  }
  // 地層 li の中で a から b まで掘るのに要る力
  function powerBetween(li, a, b) {
    const l = D.LAYERS[li], g = l.grow || 0;
    if (!g) return l.hard * (b - a);
    const k = l.hard / (Math.pow(l.from, g) * (g + 1));
    return k * (Math.pow(b, g + 1) - Math.pow(a, g + 1));
  }
  // 地層 li の中で a から力 p で掘ったときの到達点
  function reachWith(li, a, p) {
    const l = D.LAYERS[li], g = l.grow || 0;
    if (!g) return a + p / l.hard;
    const k = l.hard / (Math.pow(l.from, g) * (g + 1));
    return Math.pow(Math.pow(a, g + 1) + p / k, 1 / (g + 1));
  }

  // power（かたさで割る前の量）だけ掘る。地層の境目ではかたさが変わる。壁は道具がないと越えられない。
  function dig(game, power) {
    const L = game.life;
    let rem = power, dug = 0;
    const events = [];
    while (rem > 0 && !L.cleared) {
      const layer = D.LAYERS[L.layer];
      const next = D.LAYERS[L.layer + 1];
      const end = next ? next.from : D.GOAL;
      const need = powerBetween(L.layer, L.depth, end);
      if (rem < need) {
        const to = Math.min(end, reachWith(L.layer, L.depth, rem));
        dug += to - L.depth; L.money += (to - L.depth) * layer.value; L.depth = to;
        break;
      }
      dug += end - L.depth; L.money += (end - L.depth) * layer.value; L.depth = end;
      rem -= need;
      if (!next) break; // 地球の中心
      if (next.wall && !has(game, next.wall)) {
        if (!L.atWall) events.push({ type: "wall", tool: next.wall });
        L.atWall = true;
        break;
      }
      L.layer += 1;
      L.atWall = false;
      const ev = { type: "layer", id: next.id };
      if (has(game, "o4")) {
        ev.bonus = (autoRaw(game) / next.hard) * next.value * 30 + next.value * 50;
        L.money += ev.bonus;
      }
      events.push(ev);
    }
    afterDig(game, events);
    return { dug, events };
  }

  function afterDig(game, events) {
    const L = game.life;
    for (const d of D.MILESTONES) {
      if (d <= L.depth && L.reach[d] == null) {
        L.reach[d] = L.t;
        const prev = game.prevReach[d];
        events.push({ type: "milestone", depth: d, t: L.t, prev: prev == null ? null : prev });
      }
    }
    if (has(game, "o3")) {
      for (const f of D.FOSSILS) {
        if (f.depth <= L.depth && !game.fossils[f.id]) {
          game.fossils[f.id] = { lifeNo: game.lifeNo, depth: f.depth };
          events.push({ type: "fossil", id: f.id });
        }
      }
    }
    if (L.depth >= D.GOAL && !L.cleared) {
      L.cleared = true;
      game.cleared = true;
      game.clears.push({ lifeNo: game.lifeNo, totalTime: game.totalTime, lifeTime: L.t });
      events.push({ type: "clear" });
    }
  }

  function tap(game) {
    const L = game.life;
    L.taps = (L.taps || []).filter((t) => t >= L.t - 1);
    L.taps.push(L.t);
    let p = tapPower(game);
    const cm = comboMult(game);
    const combo = cm > 1 && L.taps.length >= D.COMBO.taps;
    if (combo) p *= cm;
    const cc = critChance(game);
    const crit = cc > 0 && rand(game) < cc;
    if (crit) p *= 10;
    const r = dig(game, p);
    return { gain: r.dug, crit, combo, events: r.events };
  }

  // ---- 光る鉱石 ----
  function oreFreq(game) {
    let f = 1;
    if (has(game, "o1")) f *= 2;
    f *= Math.pow(D.GEAR.helmet.ore, game.life.gear.helmet);
    if (game.life.skills.soko_a) f *= SKILL.soko_a.ore;
    return f;
  }
  function scheduleOre(game) {
    const L = game.life;
    const gap = (D.ORE.minGap + rand(game) * (D.ORE.maxGap - D.ORE.minGap)) / oreFreq(game);
    L.ore = { shown: false, next: L.t + gap, kind: "gold", shownAt: null, x: 0.5, y: 0.5 };
  }
  function tapOre(game) {
    const L = game.life;
    if (!L.ore || !L.ore.shown) return null;
    const rainbow = L.ore.kind === "rainbow";
    const mult = rainbow ? D.ORE.rainbowMult : D.ORE.mult;
    const dur = (rainbow ? D.ORE.rainbowDur : D.ORE.dur) * (has(game, "o2") ? 1.5 : 1);
    L.boost = { mult, until: L.t + dur, kind: L.ore.kind };
    scheduleOre(game);
    return { mult, dur, kind: rainbow ? "rainbow" : "gold" };
  }

  function tick(game, dt) {
    const L = game.life;
    L.t += dt;
    game.totalTime += dt;
    const events = [];
    if (L.boost && L.t >= L.boost.until) { L.boost = null; events.push({ type: "boostEnd" }); }
    const o = L.ore;
    if (o && !o.shown && L.t >= o.next) {
      o.shown = true; o.shownAt = L.t;
      o.kind = has(game, "o5") && rand(game) < D.ORE.rainbowChance ? "rainbow" : "gold";
      o.x = 0.15 + rand(game) * 0.7; o.y = 0.2 + rand(game) * 0.5;
      events.push({ type: "ore", kind: o.kind });
    } else if (o && o.shown && L.t >= o.shownAt + D.ORE.show) {
      scheduleOre(game);
      events.push({ type: "oreGone" });
    }
    const r = dig(game, autoPower(game) * dt);
    events.push(...r.events);
    if (has(game, "t6") && !L.cleared) {
      L.autoAcc = (L.autoAcc || 0) + D.AUTO_TAP * dt;
      while (L.autoAcc >= 1) {
        L.autoAcc -= 1;
        const t = tap(game);
        events.push({ type: "autotap", gain: t.gain, crit: t.crit }, ...t.events);
      }
    }
    return events;
  }

  // ---- 買い物（仲間の強化・特技・自分の装備） ----
  function isUnlocked(game, id) {
    const c = COMP[id];
    if (!c) return false;
    if (c.node && !has(game, c.node)) return false;
    return game.life.layer >= LAYER_INDEX[c.layer];
  }
  function levelCost(game, id) {
    return Math.ceil(COMP[id].cost * Math.pow(D.COST_GROWTH, lv(game, id)) * (has(game, "f2") ? 0.9 : 1));
  }
  function levelUp(game, id) {
    const L = game.life;
    if (!isUnlocked(game, id)) return false;
    const c = levelCost(game, id);
    if (L.money < c) return false;
    const before = stage(game, id);
    L.money -= c;
    L.lv[id] = lv(game, id) + 1;
    return { lv: L.lv[id], joined: L.lv[id] === 1, transformed: before >= 0 && stage(game, id) > before };
  }
  const skillCost = (id) => COMP[SKILL[id].comp].cost * SKILL[id].cost;
  function canBuySkill(game, id) {
    const k = SKILL[id];
    return !!k && !game.life.skills[id] && lv(game, k.comp) >= k.need;
  }
  function buySkill(game, id) {
    if (!canBuySkill(game, id) || game.life.money < skillCost(id)) return false;
    game.life.money -= skillCost(id);
    game.life.skills[id] = true;
    return true;
  }
  // 次の段階の値段（もう最後まで買ったら null）
  function gearCost(game, line) {
    const tier = D.GEAR[line].tiers[game.life.gear[line]];
    return tier ? tier.cost : null;
  }
  function buyGear(game, line) {
    const c = D.GEAR[line] ? gearCost(game, line) : null;
    if (c == null || game.life.money < c) return false;
    game.life.money -= c;
    game.life.gear[line] += 1;
    if (line === "helmet" && game.life.ore && !game.life.ore.shown) {
      // 次の鉱石までの待ち時間を、明るくなった分だけ縮める
      const o = game.life.ore;
      o.next = game.life.t + (o.next - game.life.t) / D.GEAR.helmet.ore;
    }
    return true;
  }

  // ---- スキルツリー ----
  function canUnlock(game, id) {
    const n = NODE[id];
    return !!n && !has(game, id) && (!n.req || has(game, n.req));
  }
  function unlockNode(game, id) {
    if (!canUnlock(game, id) || game.shards < NODE[id].cost) return false;
    game.shards -= NODE[id].cost;
    game.tree[id] = true;
    return true;
  }
  function wallTool(game) {
    const next = D.LAYERS[game.life.layer + 1];
    return game.life.atWall && next ? next.wall : null;
  }

  // ---- 転生 ----
  function rebirthShards(game) {
    return Math.floor(Math.sqrt(game.life.depth / D.SHARD_DIV) * (has(game, "o6") ? 1.25 : 1));
  }
  function rebirth(game) {
    const s = rebirthShards(game);
    if (s < 1) return null;
    const L = game.life;
    game.shards += s;
    game.lives.push({ lifeNo: game.lifeNo, maxDepth: L.depth, t: L.t, shards: s, wall: wallTool(game) });
    game.prevReach = { ...game.prevReach, ...L.reach };
    game.lifeNo += 1;
    newLife(game);
    return { shards: s };
  }

  // ---- セーブの点検 ----
  // 前のしくみ（仲間を何人もやとう）のセーブを、仲間のレベルと装備に置きかえる
  function migrateV1(game) {
    const L = game.life, o = L.owned && typeof L.owned === "object" ? L.owned : {}, u = L.upgrades && typeof L.upgrades === "object" ? L.upgrades : {};
    const n = (k) => (Number.isInteger(o[k]) && o[k] > 0 ? o[k] : 0);
    const lvs = { mog: n("apprentice") + n("mole"), gan: n("shovel") + n("jack"), drill: n("tunnel") + n("machine") + n("magma"), soko: n("chitei") };
    L.lv = Object.fromEntries(Object.entries(lvs).filter(([, v]) => v > 0));
    L.skills = {};
    L.gear = { pick: ["pick_iron", "pick_steel", "pick_diamond", "pick_mithril", "pick_star"].filter((k) => u[k] === true).length, glove: 0, helmet: u.light === true ? 1 : 0, boots: 0 };
    delete L.owned; delete L.upgrades;
    game.v = 2;
  }

  // 読みこんだセーブを点検する。遊べない形なら false。知らないもの・おかしな数は取りのぞく
  function sanitize(game) {
    try {
      const num = (x) => typeof x === "number" && isFinite(x);
      if (!game || (game.v !== 1 && game.v !== 2) || !game.life || typeof game.life !== "object") return false;
      const L = game.life;
      if (game.v === 1) migrateV1(game);
      if (!num(L.depth) || L.depth < 0 || !num(L.money) || !num(L.t) || !Number.isInteger(L.layer) || !D.LAYERS[L.layer]) return false;
      if (!num(game.shards) || game.shards < 0 || !num(game.rng) || !Number.isInteger(game.lifeNo)) return false;
      const keep = (obj, ok) => Object.fromEntries(Object.entries(obj && typeof obj === "object" ? obj : {}).filter(([k, v]) => ok(k, v)));
      L.lv = keep(L.lv, (k, v) => COMP[k] && Number.isInteger(v) && v > 0);
      L.skills = keep(L.skills, (k, v) => SKILL[k] && v === true);
      const gear = L.gear && typeof L.gear === "object" ? L.gear : {};
      L.gear = Object.fromEntries(GEAR_LINES.map((k) => [k, Number.isInteger(gear[k]) ? Math.max(0, Math.min(D.GEAR[k].tiers.length, gear[k])) : 0]));
      if (!num(L.autoAcc)) L.autoAcc = 0;
      game.tree = keep(game.tree, (k, v) => NODE[k] && v === true);
      game.fossils = keep(game.fossils, (k) => D.FOSSILS.some((f) => f.id === k));
      game.prevReach = keep(game.prevReach, (k, v) => num(v));
      L.reach = keep(L.reach, (k, v) => num(v));
      L.taps = Array.isArray(L.taps) ? L.taps.filter(num) : [];
      const nums = (o, keys) => o && typeof o === "object" && keys.every((k) => num(o[k]));
      game.lives = (Array.isArray(game.lives) ? game.lives : []).filter((x) => nums(x, ["lifeNo", "maxDepth", "t", "shards"]))
        .map((x) => ({ lifeNo: x.lifeNo, maxDepth: x.maxDepth, t: x.t, shards: x.shards, wall: NODE[x.wall] ? x.wall : null }));
      game.clears = (Array.isArray(game.clears) ? game.clears : []).filter((x) => nums(x, ["lifeNo", "totalTime", "lifeTime"]))
        .map((x) => ({ lifeNo: x.lifeNo, totalTime: x.totalTime, lifeTime: x.lifeTime }));
      if (!num(game.totalTime)) game.totalTime = 0;
      game.cleared = !!game.cleared;
      L.atWall = !!L.atWall; L.cleared = !!L.cleared;
      if (!L.boost || !num(L.boost.mult) || !num(L.boost.until)) L.boost = null;
      if (!L.ore || !num(L.ore.next)) scheduleOre(game);
      return true;
    } catch (e) {
      return false;
    }
  }

  // ---- 表示用の数字 ----
  const UNITS = [[1e32, "溝"], [1e28, "穣"], [1e24, "𥝱"], [1e20, "垓"], [1e16, "京"], [1e12, "兆"], [1e8, "億"], [1e4, "万"]];
  const commas = (n) => String(Math.floor(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  function fmtNum(x) {
    if (!isFinite(x)) return "∞";
    if (x < 1e4) return commas(x);
    const [u, name] = UNITS.find(([u]) => x >= u);
    const v = x / u;
    if (v >= 100) return commas(v) + name;
    return (Math.floor(v * 10) / 10).toFixed(1).replace(/\.0$/, "") + name;
  }
  function fmtDepth(m) {
    if (m <= 0) return "0 m";
    if (m < 1) return Math.max(1, Math.round(m * 100)) + " cm";
    if (m < 10) return m.toFixed(1) + " m";
    if (m < 1000) return commas(m) + " m";
    const km = m / 1000;
    if (km < 100) return (Math.floor(km * 10) / 10).toFixed(1) + " km";
    return commas(km) + " km";
  }

  return {
    newGame, layerOf, tapPower, autoPower, autoSpeed, hardNow, hardAt, powerBetween, fossilMult, dig, tap, tick, tapOre,
    lv, stage, compPower, turboOn, critChance, comboMult, oreFreq, totalLv,
    isUnlocked, levelCost, levelUp, skillCost, canBuySkill, buySkill, gearCost, buyGear, canUnlock, unlockNode, wallTool,
    rebirthShards, rebirth, sanitize, fmtNum, fmtDepth, rand,
  };
});
