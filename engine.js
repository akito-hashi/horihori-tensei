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
  const LAYER_INDEX = Object.fromEntries(D.LAYERS.map((l, i) => [l.id, i]));

  function newLife() {
    return { depth: 0, layer: 0, money: 0, t: 0, owned: {}, upgrades: {}, taps: [], reach: {}, atWall: false };
  }

  function newGame({ seed } = {}) {
    return {
      v: 1,
      rng: (seed == null ? Math.floor(Math.random() * 2 ** 32) : seed) >>> 0,
      lifeNo: 1,
      shards: 0,
      tree: {},
      life: newLife(),
    };
  }

  const layerOf = (game) => D.LAYERS[game.life.layer];

  // ---- 力の計算 ----
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
    return p;
  }
  // 仲間・機械が毎秒掘る力（かたさで割る前）
  function autoPower(game) {
    let p = 0;
    for (const b of D.BUILDINGS) p += buildingPower(game, b.id);
    return p;
  }
  // タップ 1回の掘る力（かたさで割る前）
  function tapPower(game) {
    return 1 * pickMult(game);
  }

  // ---- 掘る ----
  // power（かたさで割る前の量）だけ掘る。地層の境目ではかたさが変わる。壁は道具がないと越えられない。
  function dig(game, power) {
    const L = game.life;
    let rem = power, dug = 0;
    const events = [];
    while (rem > 0) {
      const layer = D.LAYERS[L.layer];
      const next = D.LAYERS[L.layer + 1];
      const end = next ? next.from : D.GOAL;
      const room = end - L.depth;
      const m = rem / layer.hard;
      if (m < room) {
        L.depth += m; L.money += m * layer.value; dug += m;
        rem = 0;
        break;
      }
      L.depth = end; L.money += room * layer.value; dug += room;
      rem -= room * layer.hard;
      if (!next) break; // 地球の中心
      if (next.wall && !hasTool(game, next.wall)) { L.atWall = true; break; }
      L.layer += 1;
      L.atWall = false;
      events.push({ type: "layer", id: next.id });
    }
    return { dug, events };
  }

  function hasTool(game, id) {
    return !!(game.tree && game.tree[id]);
  }

  function tap(game) {
    const L = game.life;
    let p = tapPower(game);
    const crit = false;
    const r = dig(game, p);
    return { gain: r.dug, crit, events: r.events };
  }

  function tick(game, dt) {
    const L = game.life;
    L.t += dt;
    const r = dig(game, autoPower(game) * dt);
    return r.events;
  }

  // ---- 買い物 ----
  function isUnlocked(game, id) {
    const b = BUILDING[id];
    if (b.node && !(game.tree && game.tree[b.node])) return false;
    return game.life.layer >= LAYER_INDEX[b.layer];
  }
  function buildingCost(game, id) {
    const b = BUILDING[id];
    return Math.ceil(b.cost * Math.pow(D.COST_GROWTH, game.life.owned[id] || 0));
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
    return true;
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
    const s = (Math.floor(v * 10) / 10).toFixed(1).replace(/\.0$/, "");
    return s + name;
  }
  function fmtDepth(m) {
    if (m < 10) return m.toFixed(1) + " m";
    if (m < 1000) return commas(m) + " m";
    const km = m / 1000;
    if (km < 100) return (Math.floor(km * 10) / 10).toFixed(1) + " km";
    return commas(km) + " km";
  }

  return { newGame, layerOf, tapPower, autoPower, buildingPower, dig, tap, tick, isUnlocked, buildingCost, buy, canBuyUpgrade, buyUpgrade, fmtNum, fmtDepth, rand };
});
