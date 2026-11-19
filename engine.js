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
      taps: [], reach: {}, atWall: false, cleared: false, boost: null, ore: null, space: false, planet: null, atCore: false, boss: null };
    game.life = L;
    scheduleOre(game);
    L.chest = null;
    if (has(game, "m3")) scheduleChest(game);
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
      space: { best: 0, prayers: 0 },
      life: null,
    };
    newLife(game);
    return game;
  }

  // ---- 星めぐり：星のデータ（名前のある星のあとは作る） ----
  const planetCache = new Map();
  function planet(k) {
    if (planetCache.has(k)) return planetCache.get(k);
    const G = D.PLANET_GEN, S = D.SPACE;
    let p;
    if (k < D.PLANETS.length) p = { ...D.PLANETS[k] };
    else {
      const n = k - D.PLANETS.length;
      const name = G.syll[n % 16] + G.syll[(Math.floor(n / 16) + n * 5) % 16] + "星" + (n >= 256 ? ` ${Math.floor(n / 256) + 1}` : "");
      const hue = (n * 47) % 360;
      p = { name, icon: G.icons[n % G.icons.length], radius: (1500 + ((n * 2654435761) % 6500)) * 1000,
        boss: `${name}の${G.bosses[n % G.bosses.length]}`, bossIcon: G.bossIcons[n % G.bossIcons.length],
        colors: [`hsl(${hue} 55% 70%)`, `hsl(${hue} 50% 48%)`, `hsl(${hue} 55% 28%)`],
        layerNames: [`${name}の表面`, `${name}の奥`, `${name}のコア`] };
    }
    // 大きい星ほど地面はやわらかい（星の大きさで掘る時間が極端に変わらないように）
    const size = D.PLANETS[0].radius / p.radius;
    const hk = S.h0 * Math.pow(S.hg, k) * size, vk = S.v0 * Math.pow(S.vg, k) * size;
    p.index = k;
    p.layers = [0, 1, 2].map((i) => ({ id: `p${k}_${i}`, name: p.layerNames[i], icon: p.icon, from: (p.radius * i) / 3,
      hard: hk * S.layerHard[i], value: vk * S.layerHard[i], grow: i ? S.grow : 0, color: p.colors[i] }));
    planetCache.set(k, p);
    return p;
  }
  const layersFor = (game) => (game.life.space ? planet(game.life.planet).layers : D.LAYERS);
  const endOf = (game) => (game.life.space ? planet(game.life.planet).radius : D.GOAL);
  const layerOf = (game) => layersFor(game)[game.life.layer];

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
  // その Lv までに着いた「掘る力×2」の節目の数（表のあとも 100 ごとに続く）
  function msCount(n) {
    const last = D.LV_MILESTONES[D.LV_MILESTONES.length - 1];
    return D.LV_MILESTONES.filter((m) => n >= m).length + Math.max(0, Math.floor((n - last) / 100));
  }
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
    let p = n * COMP[id].out * Math.pow(2, msCount(n));
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
  // ---- 星座と星の祈り（ずっと続くボーナス） ----
  function constellations(game) {
    const n = Math.floor(((game.space && game.space.best) || 0) / D.STARS_PER_CONSTELLATION);
    const out = [];
    for (let i = 0; i < n; i++) {
      if (i < D.CONSTELLATIONS.length) out.push(D.CONSTELLATIONS[i]);
      else {
        const j = i - D.CONSTELLATIONS.length, m = D.MORE_CONSTELLATIONS;
        const name = m[j % m.length] + (j >= m.length ? ` ${Math.floor(j / m.length) + 1}` : "");
        out.push(j % 2 ? { name, desc: "仲間全員の掘る力 ×3", auto: 3 } : { name, desc: "タップ ×3", tap: 3 });
      }
    }
    return out;
  }
  function starBonus(game, key) {
    let m = key === "crit" ? 0 : 1;
    for (const c of constellations(game)) if (c[key]) m = key === "crit" ? m + c[key] : m * c[key];
    return m;
  }
  // 掘って入るお金の倍率（スキルツリー「お金」・星座）
  function moneyMult(game) {
    let m = starBonus(game, "money");
    for (const nd of D.TREE) if (nd.moneyMult && has(game, nd.id)) m *= nd.moneyMult;
    return m;
  }
  const prayerMult = (game) => Math.pow(1 + D.PRAYER.mult, (game.space && game.space.prayers) || 0);
  // 仲間全員にかかる倍率（スキルツリー・チームワーク・化石・星座・星の祈り。ブーストなし）
  function baseShared(game) {
    let m = 1;
    for (const nd of D.TREE) if (nd.autoMult && has(game, nd.id)) m *= nd.autoMult;
    if (has(game, "f3")) m *= Math.pow(1.5, Math.floor(totalLv(game) / 100));
    return m * fossilMult(game) * starBonus(game, "auto") * prayerMult(game);
  }
  // 仲間全員が毎秒掘る力（かたさで割る前・ブーストなし）
  function autoRaw(game) {
    let p = 0;
    for (const c of D.COMPANIONS) p += compPower(game, c.id);
    return p * baseShared(game);
  }
  function autoPower(game) {
    return autoRaw(game) * boostMult(game);
  }
  // 仲間カードに出す速さ：その仲間の力に、スキルツリー・化石・ブーストの倍率をかけたもの（全員の合計が本当の速さになる）
  function sharedMult(game) {
    return baseShared(game) * boostMult(game);
  }
  function compShown(game, id, power) {
    return (power == null ? compPower(game, id) : power) * sharedMult(game);
  }
  function critChance(game) {
    let c = has(game, "t3") ? 0.1 : 0;
    for (const k of D.SKILLS) if (k.crit && game.life.skills[k.id]) c += k.crit;
    return c + D.GEAR.boots.crit * game.life.gear.boots + starBonus(game, "crit");
  }
  function comboMult(game) {
    return 1 + (has(game, "t2") ? D.COMBO.base : 0) + D.GEAR.glove.combo * game.life.gear.glove;
  }
  // タップ 1回の掘る力（かたさで割る前。連打・会心は含まない）
  function tapPower(game) {
    let p = Math.pow(D.GEAR.pick.tapMult, game.life.gear.pick);
    for (const nd of D.TREE) if (nd.tapMult && has(game, nd.id)) p *= nd.tapMult;
    p *= fossilMult(game) * starBonus(game, "tap") * prayerMult(game);
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
  function powerBetween(li, a, b, layers = D.LAYERS) {
    const l = layers[li], g = l.grow || 0;
    if (!g) return l.hard * (b - a);
    const k = l.hard / (Math.pow(l.from, g) * (g + 1));
    return k * (Math.pow(b, g + 1) - Math.pow(a, g + 1));
  }
  // 地層 li の中で a から力 p で掘ったときの到達点
  function reachWith(li, a, p, layers = D.LAYERS) {
    const l = layers[li], g = l.grow || 0;
    if (!g) return a + p / l.hard;
    const k = l.hard / (Math.pow(l.from, g) * (g + 1));
    return Math.pow(Math.pow(a, g + 1) + p / k, 1 / (g + 1));
  }

  // power（かたさで割る前の量）だけ掘る。地層の境目ではかたさが変わる。壁は道具がないと越えられない。
  function dig(game, power) {
    const L = game.life;
    const LS = layersFor(game), mm = moneyMult(game);
    let rem = power, dug = 0;
    const events = [];
    while (rem > 0 && !L.cleared) {
      const layer = LS[L.layer];
      const next = LS[L.layer + 1];
      const end = next ? next.from : endOf(game);
      if (L.space && L.atCore) {
        // 星の中心：これ以上は深くならないが、掘ったぶんのお金は入る
        L.money += (rem / hardAt(layer, end)) * layer.value * mm;
        break;
      }
      const need = powerBetween(L.layer, L.depth, end, LS);
      if (rem < need) {
        const to = Math.min(end, reachWith(L.layer, L.depth, rem, LS));
        dug += to - L.depth; L.money += (to - L.depth) * layer.value * mm; L.depth = to;
        break;
      }
      dug += end - L.depth; L.money += (end - L.depth) * layer.value * mm; L.depth = end;
      rem -= need;
      if (!next && L.space) { L.atCore = true; events.push({ type: "core", planet: L.planet }); continue; }
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
    if (!(L.money < 1e300)) L.money = L.money > 0 || L.money === Infinity ? 1e300 : 0;
    afterDig(game, events);
    return { dug, events };
  }

  function afterDig(game, events) {
    const L = game.life;
    const marks = L.space
      ? [1, 2, 3].map((i) => ({ key: `p${L.planet}:${i}`, depth: (planet(L.planet).radius * i) / 3, planet: L.planet, part: i }))
      : D.MILESTONES.map((d) => ({ key: String(d), depth: d }));
    for (const m of marks) {
      if (m.depth <= L.depth && L.reach[m.key] == null) {
        L.reach[m.key] = L.t;
        const prev = game.prevReach[m.key];
        const t = L.space ? L.t - (L.planetT || 0) : L.t; // 星ではその星に着いてからの時間
        if (L.space) L.reach[m.key] = t;
        events.push({ type: "milestone", ...m, t, prev: prev == null ? null : prev });
      }
    }
    if (L.space) return;
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
    if (L.boss) {
      L.boss.hp = Math.max(0, L.boss.hp - p);
      const events = [];
      bossCheck(game, events);
      return { gain: 0, dmg: p, crit, combo, events };
    }
    const r = dig(game, p);
    return { gain: r.dug, crit, combo, events: r.events };
  }

  // ---- 光る鉱石 ----
  function oreFreq(game) {
    let f = 1;
    if (has(game, "o1")) f *= 2;
    f *= Math.pow(D.GEAR.helmet.ore, game.life.gear.helmet);
    if (game.life.skills.soko_a) f *= SKILL.soko_a.ore;
    return f * starBonus(game, "ore");
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

  // ---- お金の枝：宝箱・利子 ----
  // いまの稼ぎ（毎秒のお金。仲間の自動ぶん）
  function incomeRate(game) {
    const layer = layerOf(game);
    return (autoPower(game) / hardAt(layer, game.life.depth)) * layer.value * moneyMult(game);
  }
  function scheduleChest(game) {
    const L = game.life;
    L.chest = { shown: false, next: L.t + D.CHEST.minGap + rand(game) * (D.CHEST.maxGap - D.CHEST.minGap), shownAt: null, x: 0.5, y: 0.5 };
  }
  function tapChest(game) {
    const L = game.life;
    if (!L.chest || !L.chest.shown) return null;
    const money = Math.max(incomeRate(game) * D.CHEST.seconds, layerOf(game).value * D.CHEST.minValue * moneyMult(game));
    L.money += money;
    scheduleChest(game);
    return { money };
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
    // 宝箱
    if (has(game, "m3")) {
      if (!L.chest) scheduleChest(game);
      const c = L.chest;
      if (!c.shown && L.t >= c.next) { c.shown = true; c.shownAt = L.t; c.x = 0.18 + rand(game) * 0.6; c.y = 0.3 + rand(game) * 0.45; events.push({ type: "chest" }); }
      else if (c.shown && L.t >= c.shownAt + D.CHEST.show) { scheduleChest(game); events.push({ type: "chestGone" }); }
    }
    // 貯金の利子（稼ぎに見合った分まで）
    if (has(game, "m2") && L.money > 0) {
      const cap = Math.max(incomeRate(game) * D.INTEREST.capSeconds, layerOf(game).value * D.INTEREST.minValue * moneyMult(game));
      L.money += Math.min(L.money, cap) * D.INTEREST.rate * dt;
    }
    if (L.boss) {
      L.boss.hp = Math.max(0, L.boss.hp - autoPower(game) * dt);
      bossCheck(game, events);
    } else {
      const r = dig(game, autoPower(game) * dt);
      events.push(...r.events);
    }
    if (!(L.money < 1e300)) L.money = L.money > 0 || L.money === Infinity ? 1e300 : 0;
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

  // ---- ボス戦（星の中心） ----
  const bossHp = (k) => D.BOSS.base * Math.pow(D.BOSS.growth, k);
  function bossReward(k) {
    const core = planet(k).layers[2];
    return bossHp(k) * (core.value / hardAt(core, planet(k).radius)) * D.BOSS.reward;
  }
  function startBoss(game) {
    const L = game.life;
    if (!L.space || !L.atCore || L.boss) return false;
    const hp = bossHp(L.planet);
    L.boss = { hp, max: hp, until: L.t + D.BOSS.time };
    return L.boss;
  }
  // 30秒で削れる見こみ（1 以上なら勝てそう）
  function bossOdds(game, tapsPerSec = 3) {
    const L = game.life;
    const taps = tapsPerSec + (has(game, "t6") ? D.AUTO_TAP : 0);
    // ブーストは数えない（見こみがブーストの始まり・終わりでぶれないように）
    const dps = autoRaw(game) + (tapPower(game) / boostMult(game)) * (1 + 9 * critChance(game)) * taps;
    return (dps * D.BOSS.time) / bossHp(L.space ? L.planet : 0);
  }
  function bossCheck(game, events) {
    const L = game.life, b = L.boss;
    if (!b) return;
    if (b.hp <= 0) {
      const k = L.planet, reward = bossReward(k);
      const before = constellations(game).length;
      L.money += reward;
      L.boss = null;
      game.space.best = Math.max(game.space.best, k + 1);
      events.push({ type: "bossWin", planet: k, reward });
      const cs = constellations(game);
      for (let i = before; i < cs.length; i++) events.push({ type: "constellation", name: cs[i].name, desc: cs[i].desc });
      L.planet = k + 1; L.depth = 0; L.layer = 0; L.atCore = false; L.planetT = L.t;
      events.push({ type: "planet", planet: k + 1 });
    } else if (L.t >= b.until) {
      L.boss = null;
      events.push({ type: "bossFail", planet: L.planet });
    }
  }

  // ---- 宇宙へ ----
  function canEnterSpace(game) {
    return !!game.cleared && !!game.life.cleared && !game.life.space;
  }
  function enterSpace(game) {
    if (!canEnterSpace(game)) return false;
    const L = game.life;
    Object.assign(L, { space: true, planet: game.space.best, startPlanet: game.space.best, dugBefore: L.depth, planetT: L.t,
      depth: 0, layer: 0, atWall: false, cleared: false, atCore: false, boss: null });
    return true;
  }

  // ---- 星の祈り ----
  const canPray = (game) => D.TREE.every((n) => has(game, n.id));
  const prayerCost = (game) => Math.ceil(D.PRAYER.base * Math.pow(D.PRAYER.growth, game.space.prayers));
  function pray(game) {
    if (!canPray(game) || game.shards < prayerCost(game)) return false;
    game.shards -= prayerCost(game);
    game.space.prayers += 1;
    return true;
  }

  // ---- 買い物（仲間の強化・特技・自分の装備） ----
  function isUnlocked(game, id) {
    const c = COMP[id];
    if (!c) return false;
    if (c.node && !has(game, c.node)) return false;
    return game.life.space || game.life.layer >= LAYER_INDEX[c.layer];
  }
  function levelCost(game, id) {
    const join = lv(game, id) === 0 && has(game, "m4") ? 0.1 : 1; // 仲間の紹介状
    return Math.ceil(COMP[id].cost * Math.pow(D.COST_GROWTH, lv(game, id)) * (has(game, "f2") ? 0.9 : 1) * join);
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
  // まとめて強化（n 回まで、買えるだけ）
  function levelUpMany(game, id, n) {
    let count = 0, joined = false, transformed = false, last = null;
    while (count < n) {
      const r = levelUp(game, id);
      if (!r) break;
      count++; last = r;
      joined = joined || r.joined; transformed = transformed || r.transformed;
    }
    return count ? { count, lv: last.lv, joined, transformed } : false;
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
    if (id === "m3" && !game.life.chest) scheduleChest(game);
    return true;
  }
  function wallTool(game) {
    if (game.life.space) return null;
    const next = D.LAYERS[game.life.layer + 1];
    return game.life.atWall && next ? next.wall : null;
  }

  // ---- 転生 ----
  // 合計の深さ：地球の中心 ＋ それまでの星 ＋ いまの星での深さ
  function totalDepth(game) {
    const L = game.life;
    if (!L.space) return L.depth;
    let d = D.GOAL;
    for (let i = 0; i < L.planet; i++) d += planet(i).radius;
    return d + L.depth;
  }
  // この人生で掘った深さ（宇宙では、この人生で着いた星から数える。地球から来た人生は地球の分もふくむ）
  function dugThisLife(game) {
    const L = game.life;
    if (!L.space) return L.depth;
    let d = L.dugBefore || 0;
    for (let i = L.startPlanet == null ? L.planet : L.startPlanet; i < L.planet; i++) d += planet(i).radius;
    return d + L.depth;
  }
  function rebirthShards(game) {
    const L = game.life;
    const far = L.space ? 1 + 0.1 * L.planet : 1; // 遠い星ほど 1m の価値が高い
    return Math.floor(Math.sqrt(dugThisLife(game) / D.SHARD_DIV) * far * (has(game, "o6") ? 1.25 : 1));
  }
  function rebirth(game) {
    const s = rebirthShards(game);
    if (s < 1) return null;
    const L = game.life;
    game.shards += s;
    game.lives.push({ lifeNo: game.lifeNo, maxDepth: L.depth, t: L.t, shards: s, wall: wallTool(game), planet: L.space ? L.planet : null });
    game.prevReach = { ...game.prevReach, ...L.reach };
    game.lifeNo += 1;
    const wasSpace = L.space;
    newLife(game);
    if (wasSpace) Object.assign(game.life, { space: true, planet: game.space.best, startPlanet: game.space.best, dugBefore: 0, planetT: 0 });
    return { shards: s };
  }

  // ---- セーブの点検 ----
  // 前のしくみ（仲間を何人もやとう）のセーブを、仲間のレベルと装備に置きかえる。
  // いる地層で毎秒掘れる m が前と同じくらいになるように、仲間ごとのレベルを決める（かたさの見直しも計算に入れる）
  const OLD = {
    out: { apprentice: 0.5, mole: 3, shovel: 20, jack: 120, tunnel: 800, machine: 6000, magma: 50000, chitei: 400000 },
    group: { mog: ["apprentice", "mole"], gan: ["shovel", "jack"], drill: ["tunnel", "machine", "magma"], soko: ["chitei"] },
    hard: [1.485, 5.94, 29.7, 74.25, 445.5, 4455, 6682.5],
  };
  function levelFor(id, target) {
    for (let n = 1; n < 3000; n++) {
      if (n * COMP[id].out * Math.pow(2, msCount(n)) >= target) return n;
    }
    return 3000;
  }
  function migrateV1(game) {
    const L = game.life, o = L.owned && typeof L.owned === "object" ? L.owned : {}, u = L.upgrades && typeof L.upgrades === "object" ? L.upgrades : {};
    const n = (k) => (Number.isInteger(o[k]) && o[k] > 0 ? o[k] : 0);
    const ratio = D.LAYERS[L.layer] ? D.LAYERS[L.layer].hard / OLD.hard[L.layer] : 1;
    L.lv = {};
    for (const [id, members] of Object.entries(OLD.group)) {
      let p = 0;
      for (const k of members) {
        const c = n(k);
        if (!c) continue;
        p += c * OLD.out[k] * (u["eq_" + k] === true ? 2 : 1) * (game.tree && game.tree.f3 === true ? Math.pow(2, Math.floor(c / 25)) : 1);
      }
      if (p > 0) L.lv[id] = levelFor(id, p * ratio);
    }
    game.migrated = true;
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
      const sp = game.space && typeof game.space === "object" ? game.space : {};
      game.space = { best: Number.isInteger(sp.best) && sp.best >= 0 ? sp.best : 0, prayers: Number.isInteger(sp.prayers) && sp.prayers >= 0 ? sp.prayers : 0 };
      L.space = L.space === true;
      if (L.space && !(Number.isInteger(L.planet) && L.planet >= 0 && L.planet <= Math.max(game.space.best, 0) + 1)) return false;
      if (!L.space) L.planet = null;
      else {
        if (!(Number.isInteger(L.startPlanet) && L.startPlanet >= 0 && L.startPlanet <= L.planet)) L.startPlanet = L.planet;
        if (!num(L.dugBefore) || L.dugBefore < 0) L.dugBefore = 0;
        if (!num(L.planetT)) L.planetT = 0;
      }
      if (!num(L.depth) || L.depth < 0 || !num(L.money) || !num(L.t) || !Number.isInteger(L.layer) || !layersFor(game)[L.layer]) return false;
      // 深さに合う地層に直す（地層の範囲の外にいたら）
      const LS = layersFor(game);
      const inLayer = (i) => L.depth >= LS[i].from && (!LS[i + 1] || L.depth <= LS[i + 1].from);
      if (!inLayer(L.layer)) { let i = 0; while (LS[i + 1] && LS[i + 1].from <= L.depth) i++; L.layer = i; }
      L.atCore = L.space && L.atCore === true;
      if (!L.boss || !num(L.boss.hp) || !num(L.boss.max) || !num(L.boss.until) || !L.space) L.boss = null;
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
        .map((x) => ({ lifeNo: x.lifeNo, maxDepth: x.maxDepth, t: x.t, shards: x.shards, wall: NODE[x.wall] ? x.wall : null, planet: Number.isInteger(x.planet) ? x.planet : null }));
      game.clears = (Array.isArray(game.clears) ? game.clears : []).filter((x) => nums(x, ["lifeNo", "totalTime", "lifeTime"]))
        .map((x) => ({ lifeNo: x.lifeNo, totalTime: x.totalTime, lifeTime: x.lifeTime }));
      if (!num(game.totalTime)) game.totalTime = 0;
      game.cleared = !!game.cleared;
      L.atWall = !!L.atWall; L.cleared = !!L.cleared;
      if (!L.boost || !num(L.boost.mult) || !num(L.boost.until)) L.boost = null;
      if (!L.ore || !num(L.ore.next)) scheduleOre(game);
      if (!L.chest || !num(L.chest.next)) L.chest = null;
      else L.chest.shown = L.chest.shown === true;
      return true;
    } catch (e) {
      return false;
    }
  }

  // ---- 表示用の数字 ----
  const UNITS = [[1e68, "無量大数"], [1e64, "不可思議"], [1e60, "那由他"], [1e56, "阿僧祇"], [1e52, "恒河沙"], [1e48, "極"], [1e44, "載"], [1e40, "正"], [1e36, "澗"],
    [1e32, "溝"], [1e28, "穣"], [1e24, "𥝱"], [1e20, "垓"], [1e16, "京"], [1e12, "兆"], [1e8, "億"], [1e4, "万"]];
  const commas = (n) => String(Math.floor(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  function fmtNum(x) {
    if (!isFinite(x)) return "∞";
    if (x < 1e4) return commas(x);
    if (x >= 1e72) { const e = Math.floor(Math.log10(x)); return (Math.floor((x / Math.pow(10, e)) * 10) / 10).toFixed(1).replace(/\.0$/, "") + "e" + e; }
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
    levelUpMany, dugThisLife, lv, stage, compPower, compShown, sharedMult, turboOn, msCount,
    moneyMult, incomeRate, scheduleChest, tapChest,
    planet, layersFor, canEnterSpace, enterSpace, bossHp, bossReward, startBoss, bossOdds, constellations, canPray, prayerCost, pray, totalDepth, critChance, comboMult, oreFreq, totalLv,
    isUnlocked, levelCost, levelUp, skillCost, canBuySkill, buySkill, gearCost, buyGear, canUnlock, unlockNode, wallTool,
    rebirthShards, rebirth, sanitize, fmtNum, fmtDepth, rand,
  };
});
