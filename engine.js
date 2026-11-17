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

  const BUILDING = Object.fromEntries(D.BUILDINGS.map((b) => [b.id, b]));
  const UPGRADE = Object.fromEntries(D.UPGRADES.map((u) => [u.id, u]));
  const NODE = Object.fromEntries(D.TREE.map((n) => [n.id, n]));
  const LAYER_INDEX = Object.fromEntries(D.LAYERS.map((l, i) => [l.id, i]));
  const has = (game, id) => !!(game.tree && game.tree[id]);

  function newLife(game) {
    const L = { depth: 0, layer: 0, money: 0, t: 0, owned: {}, upgrades: {}, taps: [], reach: {}, atWall: false, cleared: false, boost: null, ore: null };
    game.life = L;
    scheduleOre(game);
    return L;
  }

  function newGame({ seed } = {}) {
    const game = {
      v: 1,
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
  function pickMult(game) {
    let m = 1;
    for (const u of D.UPGRADES) if (u.kind === "pick" && game.life.upgrades[u.id]) m *= u.mult;
    return m;
  }
  function buildingPower(game, id) {
    const b = BUILDING[id];
    const n = game.life.owned[id] || 0;
    if (!n) return 0;
    let p = n * b.out;
    const eq = UPGRADE["eq_" + id];
    if (eq && game.life.upgrades[eq.id]) p *= eq.mult;
    if (has(game, "f3")) p *= Math.pow(2, Math.floor(n / 25));
    return p;
  }
  // 仲間・機械が毎秒掘る力（かたさで割る前・ブーストなし）
  function autoRaw(game) {
    let p = 0;
    for (const b of D.BUILDINGS) p += buildingPower(game, b.id);
    for (const nd of D.TREE) if (nd.autoMult && has(game, nd.id)) p *= nd.autoMult;
    return p * fossilMult(game);
  }
  function autoPower(game) {
    return autoRaw(game) * boostMult(game);
  }
  // タップ 1回の掘る力（かたさで割る前。連打・会心は含まない）
  function tapPower(game) {
    let p = pickMult(game);
    for (const nd of D.TREE) if (nd.tapMult && has(game, nd.id)) p *= nd.tapMult;
    p *= fossilMult(game);
    if (has(game, "t4")) p += 0.05 * autoRaw(game);
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
    const combo = has(game, "t2") && L.taps.length >= 5;
    if (combo) p *= 1.5;
    const crit = has(game, "t3") && rand(game) < 0.1;
    if (crit) p *= 10;
    const r = dig(game, p);
    return { gain: r.dug, crit, combo, events: r.events };
  }

  // ---- 光る鉱石 ----
  function oreFreq(game) {
    let f = 1;
    if (has(game, "o1")) f *= 2;
    if (game.life.upgrades.light) f *= 1.5;
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
    return events.concat(r.events);
  }

  // ---- 買い物 ----
  function isUnlocked(game, id) {
    const b = BUILDING[id];
    if (b.node && !has(game, b.node)) return false;
    return game.life.layer >= LAYER_INDEX[b.layer];
  }
  function buildingCost(game, id) {
    const b = BUILDING[id];
    return Math.ceil(b.cost * Math.pow(D.COST_GROWTH, game.life.owned[id] || 0) * (has(game, "f2") ? 0.9 : 1));
  }
  function buy(game, id) {
    const L = game.life;
    if (!BUILDING[id] || !isUnlocked(game, id)) return false;
    const c = buildingCost(game, id);
    if (L.money < c) return false;
    L.money -= c;
    L.owned[id] = (L.owned[id] || 0) + 1;
    return true;
  }

  function canBuyUpgrade(game, id) {
    const u = UPGRADE[id], L = game.life;
    if (!u || L.upgrades[id]) return false;
    if (u.kind === "pick" && u.order > 0 && !L.upgrades[D.UPGRADES.find((x) => x.kind === "pick" && x.order === u.order - 1).id]) return false;
    if (u.kind === "equip" && (L.owned[u.building] || 0) < u.need) return false;
    return true;
  }
  function buyUpgrade(game, id) {
    if (!canBuyUpgrade(game, id)) return false;
    const u = UPGRADE[id];
    if (game.life.money < u.cost) return false;
    game.life.money -= u.cost;
    game.life.upgrades[id] = true;
    if (u.kind === "light" && game.life.ore && !game.life.ore.shown) {
      // 次の鉱石までの待ち時間を、明るくなった分だけ縮める
      const o = game.life.ore;
      o.next = game.life.t + (o.next - game.life.t) / 1.5;
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
  // 読みこんだセーブを点検する。遊べない形なら false。知らないもの・おかしな数は取りのぞく
  function sanitize(game) {
    try {
      const num = (x) => typeof x === "number" && isFinite(x);
      if (!game || game.v !== 1 || !game.life || typeof game.life !== "object") return false;
      const L = game.life;
      if (!num(L.depth) || L.depth < 0 || !num(L.money) || !num(L.t) || !Number.isInteger(L.layer) || !D.LAYERS[L.layer]) return false;
      if (!num(game.shards) || game.shards < 0 || !num(game.rng) || !Number.isInteger(game.lifeNo)) return false;
      const keep = (obj, ok) => Object.fromEntries(Object.entries(obj && typeof obj === "object" ? obj : {}).filter(([k, v]) => ok(k, v)));
      L.owned = keep(L.owned, (k, v) => BUILDING[k] && Number.isInteger(v) && v > 0);
      L.upgrades = keep(L.upgrades, (k, v) => UPGRADE[k] && v === true);
      game.tree = keep(game.tree, (k, v) => NODE[k] && v === true);
      game.fossils = keep(game.fossils, (k) => D.FOSSILS.some((f) => f.id === k));
      game.prevReach = keep(game.prevReach, (k, v) => num(v));
      L.reach = keep(L.reach, (k, v) => num(v));
      L.taps = Array.isArray(L.taps) ? L.taps.filter(num) : [];
      if (!Array.isArray(game.lives)) game.lives = [];
      if (!Array.isArray(game.clears)) game.clears = [];
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
    newGame, layerOf, tapPower, autoPower, autoSpeed, hardNow, hardAt, powerBetween, buildingPower, fossilMult, dig, tap, tick, tapOre,
    isUnlocked, buildingCost, buy, canBuyUpgrade, buyUpgrade, canUnlock, unlockNode, wallTool,
    rebirthShards, rebirth, sanitize, fmtNum, fmtDepth, rand,
  };
});
