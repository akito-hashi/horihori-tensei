// ほりほり転生 — 画面（ルールは engine.js、数値は data.js）
(function () {
  "use strict";
  const D = window.GameData, E = window.Engine;
  // キャラの絵（chars.js）が読めなかったときは絵文字で代わりに出す
  const emo = (e) => () => `<svg viewBox="0 0 100 100" class="ch"><text x="50" y="72" font-size="60" text-anchor="middle">${e}</text></svg>`;
  const C0 = window.Chars || { mog: emo("🐹"), gan: emo("🧔"), drill: emo("🤖"), soko: emo("👽"), player: emo("⛏️") };
  // 3Dの絵（sprites/manifest.js と pics.js）があればそちらを使い、なければ SVG の絵
  const PX = window.Pics;
  const C = PX ? { mog: (s) => PX.comp("mog", s), gan: (s) => PX.comp("gan", s), drill: (s) => PX.comp("drill", s), soko: (s) => PX.comp("soko", s), player: (g) => PX.player(g) } : C0;
  // 画面のアイコン（3D の絵）。一覧が読めないときは絵文字
  const UI_EMO = { coin: "💰", shard: "✦", pick: "⛏️", glove: "🧤", helmet: "⛑️", boot: "👢", tree: "🌳", book: "📖", star: "✨" };
  const UI = (n, cls = "ico") => (window.SPRITES && SPRITES.ui && SPRITES.ui[n] ? `<img class="${cls}" src="sprites/${SPRITES.ui[n]}" alt="">` : UI_EMO[n] || "");
  const S = window.Sfx || { play() {}, setOn() {}, isOn: () => false, unlock() {} };
  const KEY = "horihori-tensei-v1";
  const app = document.getElementById("app");
  const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

  let stamp = 0; // 読みこんだ・保存したセーブの時刻（別のタブが新しく保存したかを見分ける）
  let unreadable = false; // 何か保存されているが、このバージョンでは読めない
  let game = load();
  const ui = { view: "title", prev: null, tab: "friends", sel: null, fsel: null, confirm: null, shopSig: "", lastSave: 0, raf: null, last: 0, pending: [], note: null };

  // ---- 保存 ----
  function readStored() {
    try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; }
  }
  function load() {
    const s = readStored();
    if (s && s.v === 1 && E.sanitize(s.game)) { stamp = s.savedAt || 0; unreadable = false; return s.game; }
    try { unreadable = !!localStorage.getItem(KEY); } catch (e) { unreadable = false; }
    return null;
  }
  // 別のタブでもっと新しく保存されていたら、上書きせずにそちらを読みこんでタイトルにもどる
  function newerElsewhere() {
    const s = readStored();
    return !!(s && (s.savedAt || 0) > stamp);
  }
  function adoptNewer() {
    game = load();
    ui.confirm = null;
    ui.note = "別の画面で進めたデータを読みこみました。";
    go("title");
  }
  function save(force) {
    if (!game) return;
    if (!force && newerElsewhere()) { adoptNewer(); return; }
    try {
      stamp = Date.now();
      localStorage.setItem(KEY, JSON.stringify({ v: 1, game, savedAt: stamp }));
    } catch (e) { /* 容量不足などでも遊びは止めない */ }
    ui.lastSave = performance.now();
  }
  window.addEventListener("storage", (e) => { if (e.key === KEY && ui.view !== "title" && newerElsewhere()) adoptNewer(); });

  // ---- 小物 ----
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const $ = (sel) => app.querySelector(sel);
  const N = E.fmtNum, M = E.fmtDepth;
  const mmss = (sec) => { const s = Math.max(0, Math.round(sec)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
  const hms = (sec) => { const m = Math.round(sec / 60); return m >= 60 ? `${Math.floor(m / 60)}時間${m % 60}分` : `${m}分`; };
  const NODE = Object.fromEntries(D.TREE.map((n) => [n.id, n]));
  const LAYER_AT = Object.fromEntries(D.LAYERS.map((l) => [l.from, l]));
  const BRANCHES = [["tap", "⛏️ 掘る力"], ["friend", "🧑‍🔧 仲間"], ["treasure", "💎 お宝"], ["money", "💰 お金"], ["tool", "🔑 道具"]];
  const CAVE = (() => {
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const F = 170, pts = [[8, 58], [110, 44], [260, 48], [367, 60], [370, F - 16], [352, F], [22, F], [5, F - 16]], out = [];
    pts.forEach(([x1, y1], i) => {
      const [x2, y2] = pts[(i + 1) % pts.length], n = Math.max(2, Math.round(Math.hypot(x2 - x1, y2 - y1) / 9));
      for (let k = 0; k < n; k++) out.push(`${(x1 + (x2 - x1) * k / n + (rnd() - 0.5) * 6).toFixed(1)},${(y1 + (y2 - y1) * k / n + (rnd() - 0.5) * 6).toFixed(1)}`);
    });
    const d = "M" + out.join("L") + "Z";
    return `<svg class="cave" viewBox="0 0 375 214" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="cv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#140e0a" stop-opacity=".97"/><stop offset="1" stop-color="#2a2018" stop-opacity=".96"/></linearGradient>`
      + `<radialGradient id="cl" cx=".5" cy=".7" r=".55"><stop offset="0" stop-color="#ffb060" stop-opacity=".12"/><stop offset="1" stop-color="#ffb060" stop-opacity="0"/></radialGradient></defs>`
      + `<path d="${d}" fill="url(#cv)"/><path d="${d}" fill="url(#cl)"/><path d="${d}" fill="none" stroke="rgba(255,220,180,.18)" stroke-width="1.2" vector-effect="non-scaling-stroke"/></svg>`;
  })();
  const gaugePos = (d) => Math.log10(1 + d) / Math.log10(1 + D.GOAL);
  // 次の壁に必要で、まだ持っていない道具（いま壁にいるか、前の人生が壁で終わったとき）
  function neededTool() {
    const last = game.lives[game.lives.length - 1];
    const t = E.wallTool(game) || (last && last.wall);
    return t && !game.tree[t] ? t : null;
  }
  const affordableNode = () => D.TREE.some((n) => E.canUnlock(game, n.id) && game.shards >= n.cost);

  // ---- 画面の切りかえ ----
  function go(view) {
    if (view !== ui.view) ui.prev = ui.view;
    ui.view = view;
    render();
  }
  function render() {
    app.dataset.screen = ui.view;
    document.body.style.background = "";
    app.className = "";
    ui.shopSig = "";
    app.innerHTML = VIEWS[ui.view]();
    if (ui.confirm) app.insertAdjacentHTML("beforeend", `<div id="confirm" role="dialog" aria-modal="true"><div class="card">${ui.confirm.text}</div>
      <button class="btn" data-act="confirm-yes">${ui.confirm.yes}</button><button class="btn dark" data-act="confirm-no">やめる</button></div>`);
    if (ui.view === "dig") { ui.crewSig = null; update(true); const p = ui.pending; ui.pending = []; if (p.length) toast(p[p.length - 1]); }
    if (ui.view !== "clear") document.querySelectorAll(".confetti").forEach((c) => c.remove());
    if (ui.view === "credits") { const r = $(".rollin"); if (r) r.addEventListener("animationend", () => { if (ui.view === "credits") go(ui.afterCredits || "clear"); }); }
    running();
  }
  const navHtml = () => `<nav class="nav">${[["dig", "pick", "掘る"], ["tree", "tree", "ツリー"], ["book", "book", "図鑑"], ...(game.cleared ? [["sky", "shard", "星空"]] : []), ["rebirth", "star", "転生"]]
    .map(([v, i, l]) => `<button data-nav="${v}" ${ui.view === v ? 'aria-current="page"' : ""}><i aria-hidden="true">${UI(i)}</i>${l}${v === "tree" && affordableNode() ? '<span class="dot" aria-label="開放できるマスあり"></span>' : ""}</button>`).join("")}</nav>`;

  const where = () => (game.life.space ? `${E.planet(game.life.planet).icon} ${E.planet(game.life.planet).name} ${M(game.life.depth)}` : M(game.life.depth));
  const PIC2 = () => ({ mog: C.mog(3), gan: C.gan(3), drill: C.drill(3), soko: C.soko(3) });

  const VIEWS = {
    title() {
      app.className = "titlebg";
      const L = game && game.life;
      return `<div class="screen">
        <div class="logo"><h1 class="big hot">ほりほり<br>転生</h1><div class="s">めざせ 地球の中心 6,371km</div></div>
        <div class="titlecrew" aria-hidden="true"${window.Pit ? ` style="background-image:url(&quot;${Pit.rockTile(Pit.rockStyle({ layer: "soil" }))}&quot;)"` : ""}>${CAVE}<div class="tc s1">${C.gan(1)}</div><div class="tc s2">${C.mog(1)}</div><div class="tc s3">${C.player(L ? L.gear : { pick: 1, glove: 0, helmet: 1, boots: 0 })}</div><div class="tc s4">${C.soko(2)}</div><div class="tc s5">${C.drill(1)}</div></div>
        <div class="center sub" style="opacity:.95">掘って、転生して、もっと深く。</div>
        ${ui.note ? `<div class="center sub" style="opacity:1;color:#fff6c4">${ui.note}</div>` : ""}
        <div class="grow"></div>
        <button class="btn" data-act="new">はじめから</button>
        ${game ? `<button class="btn dark" data-act="continue">つづきから ・ ${game.lifeNo}回目の人生 ・ ${where()}</button>` : ""}
        <button class="sub" data-act="sound" style="padding:6px">${S.isOn() ? "🔊 音あり" : "🔇 音なし"}</button>
      </div>`;
    },

    dig() {
      const L = game.life;
      const marks = L.space ? "" : D.LAYERS.filter((l) => l.wall).map((l) => `<span class="w ${game.tree[l.wall] ? "ok" : ""}" style="left:${(gaugePos(l.from) * 100).toFixed(1)}%"></span>`).join("");
      return `<header class="hud">
          <div class="top"><span id="where">${game.lifeNo}回目の人生${L.space ? ` ・ ${E.planet(L.planet).icon} ${E.planet(L.planet).name}` : ""}</span><span class="sh">${UI("shard")}<b class="num" id="shards">${N(game.shards)}</b>
            <button data-act="sound" class="snd" aria-label="効果音のオンオフ">${S.isOn() ? "🔊" : "🔇"}</button></span></div>
          <div id="depth" class="depth num">${M(L.depth)}</div>
          <div class="row2"><span>${UI("coin")}<b class="num" id="money">${N(L.money)}</b></span><span id="speed"></span></div>
          <div class="hudrow"><span class="layerchip" id="layerchip"></span><div class="gauge" aria-hidden="true"><i id="gdot"></i>${marks}<b id="gicon">${L.space ? E.planet(L.planet).bossIcon : "💎"}</b></div></div>
          <div id="boostslot"></div>
        </header>
        <section id="pit" class="${L.space ? "space" : "L-" + E.layerOf(game).id}" tabindex="0" role="button" aria-label="タップで掘る">
          ${CAVE}
          <div id="crew" aria-hidden="true"></div>
          <div id="dirtbox" aria-hidden="true"></div>
          ${game.lifeNo === 1 && L.depth < 5 ? '<div class="taphint" id="taphint">タップで掘る！</div>' : ""}
          <div id="toasts" aria-live="polite"></div>
        </section>
        <section class="dock">
          <div class="tabs"><button data-tab="friends" aria-pressed="${ui.tab === "friends"}">仲間</button><button data-tab="me" aria-pressed="${ui.tab === "me"}">自分</button>
            <span class="buyn" aria-label="仲間をまとめて強化">${["1", "10", "max"].map((n) => `<button data-buyn="${n}" aria-pressed="${(ui.buyN || "1") === n}">${n === "max" ? "最大" : "×" + n}</button>`).join("")}</span></div>
          <div class="shop" id="shop"></div>
        </section>${navHtml()}`;
    },

    tree() {
      app.className = "treebg";
      const need = neededTool();
      if (!ui.sel) ui.sel = need || D.TREE.find((n) => E.canUnlock(game, n.id))?.id || "t1";
      const n = NODE[ui.sel];
      const have = !!game.tree[n.id];
      const can = E.canUnlock(game, n.id);
      const state = have ? '<span class="tag have">開放ずみ</span>' : can && game.shards >= n.cost ? '<span class="tag ok">開放できる</span>' : can ? '<span class="tag">かけらが足りない</span>' : '<span class="tag">先に下のマスを開放</span>';
      const col = (br) => `<div class="tcol">${D.TREE.filter((x) => x.branch === br).map((x) => {
        const cls = game.tree[x.id] ? "on" : E.canUnlock(game, x.id) && game.shards >= x.cost ? "can" : E.canUnlock(game, x.id) ? "" : "locked";
        return `<button class="node ${br === "tool" ? "tool" : ""} ${cls}" data-node="${x.id}" aria-pressed="${ui.sel === x.id}" aria-label="${x.name}">${x.icon}</button>`;
      }).join("")}</div>`;
      return `<div class="screen" style="padding-bottom:6px">
          <div class="thead"><span class="hot" style="font-size:20px">スキルツリー</span><span class="soulchip num">✦ ${N(game.shards)}</span></div>
          <div class="tlabels">${BRANCHES.map(([, l]) => `<span>${l}</span>`).join("")}</div>
          <div class="tree">${BRANCHES.map(([b]) => col(b)).join("")}</div>
          <div class="root" aria-hidden="true">🌟</div>
          <div class="detail glass"><h3><span>${n.icon} ${n.name}</span>${state}</h3><p>${n.desc}${need && n.id !== need && !have && can && game.shards >= n.cost && game.shards - n.cost < NODE[need].cost
            ? `<br><b style="color:#ffb3b3">⚠️ これを開放すると「${NODE[need].name}」（✦${N(NODE[need].cost)}）のぶんが足りなくなる</b>` : need && n.id === need && !have ? "<br>先に進むには、まずこれ！" : ""}</p>
            ${have ? "" : `<button class="btn" data-act="unlock" ${can && game.shards >= n.cost ? "" : "disabled"}>✦ ${N(n.cost)} で開放する</button>`}</div>
        </div>${navHtml()}`;
    },

    book() {
      app.className = "bookbg";
      const found = Object.keys(game.fossils).length;
      const f = ui.fsel && D.FOSSILS.find((x) => x.id === ui.fsel && game.fossils[x.id]);
      return `<div class="screen">
          <div><div class="thead"><span class="hot" style="font-size:22px">📖 化石図鑑</span><button class="sub" data-act="records">📜 記録</button></div>
            <div class="sub" style="margin-top:2px">見つけた化石 ${found} / ${D.FOSSILS.length} ・ 掘る力 <b style="color:var(--gold)">+${Math.round(found * D.FOSSIL_BONUS * 100)}%</b>（ずっと続く）</div></div>
          <div class="fossils">${D.FOSSILS.map((x) => game.fossils[x.id]
            ? `<button class="fs" data-fossil="${x.id}" aria-pressed="${ui.fsel === x.id}">${x.icon}<small>${x.name}</small></button>`
            : `<div class="fs no" aria-label="まだ見つけていない">❓</div>`).join("")}</div>
          <div class="glass pad sub" style="opacity:1;line-height:1.6">${f ? `${f.icon} <b>${f.name}</b>（深さ ${M(f.depth)} で発見）<br>${f.text}`
            : game.tree.o3 ? "化石は決まった深さに埋まっている。深く掘るほど、めずらしい化石が見つかる。" : "スキルツリーの「化石図鑑」を開放すると、化石が見つかるようになる。"}</div>
          <div class="grow"></div>
        </div>${navHtml()}`;
    },

    rebirth() {
      app.className = "soulbg";
      const L = game.life;
      const s = E.rebirthShards(game);
      const fossilsNow = Object.values(game.fossils).filter((f) => f.lifeNo === game.lifeNo).length;
      return `<div class="screen">
          <div class="thead"><span class="sub">${game.lifeNo}回目の人生</span><button class="sub" data-act="records">📜 記録</button></div>
          <div class="hot center" style="font-size:30px;text-shadow:0 0 20px #8fb8ff;margin-top:-8px">転生する？</div>
          <div class="center sub">もらえる星のかけら</div>
          <div class="shardnum num" id="shardGain">✦ ${N(s)}</div>
          <div class="glass" style="padding:4px 0">
            <div class="rowx"><span>いちばん深いところ</span><b class="num" id="rbDepth">${where()}</b></div>
            <div class="rowx"><span>この人生で遊んだ時間</span><b class="num">${mmss(L.t)}</b></div>
            <div class="rowx"><span>見つけた化石</span><b class="num">${fossilsNow} 個</b></div></div>
          <div class="glass pad" style="font-size:12px;line-height:1.7">リセット：深さ・お金・仲間・道具<br>ずっと残る：<b style="color:var(--gold)">スキルツリー・星のかけら・化石・前世の記録${game.cleared ? "・星座・星の祈り" : ""}</b>${L.space ? `<br>🚀 生まれ変わると <b style="color:var(--gold)">${E.planet(game.space.best).icon} ${E.planet(game.space.best).name}</b> の地表から` : ""}</div>
          <div class="grow"></div>
          ${s >= 1 ? `<button class="btn" data-act="reborn">✨ 生まれ変わる</button>` : `<button class="btn" disabled>もう少し掘ろう（かけら 0）</button>`}
          <button class="btn dark" data-nav="dig">まだ掘る</button>
        </div>${navHtml()}`;
    },

    clear() {
      app.className = "corebg";
      const c = game.clears[game.clears.length - 1];
      setTimeout(confetti, 0);
      return `<div class="screen">
          <div class="center"><div class="sub" style="color:#fff6b0;letter-spacing:.2em">深さ 6,371 km</div>
            <div class="hot" style="font-size:34px;line-height:1.2;text-shadow:0 0 20px #ffb000,0 4px 0 #6b1400">地球の中心に<br>到達！！</div></div>
          <div class="gem" aria-hidden="true">💎</div>
          <div class="pad center" style="border-radius:18px;background:rgba(40,8,4,.75);font-size:13px;line-height:1.8">${c.lifeNo}回目の人生で、ついに伝説の<br><b style="color:var(--gold)">「星のしずく」</b>を見つけた。<br>
            合計 ${hms(c.totalTime)} ・ 転生 ${c.lifeNo - 1}回 ・ 化石 ${Object.keys(game.fossils).length}/${D.FOSSILS.length}</div>
          <div class="grow"></div>
          ${E.canEnterSpace(game) ? `<button class="btn" data-act="space">🚀 宇宙へ（星めぐり）</button>` : ""}
          <button class="btn dark" data-act="records">記録を見る</button>
          <button class="btn dark" data-nav="rebirth">転生して、もっと速いクリアに挑戦</button>
          <button class="sub" data-nav="dig" style="padding:2px">地底にもどる</button>
        </div>`;
    },

    credits() {
      app.className = "creditsbg";
      const c = game.clears[game.clears.length - 1] || { lifeNo: game.lifeNo, totalTime: game.totalTime };
      const lives = [...game.lives.filter((l) => l.lifeNo < c.lifeNo).map((l) => `${l.lifeNo}回目の人生 …… ${M(l.maxDepth)}`), `${c.lifeNo}回目の人生 …… 地球の中心！`];
      const pics = PIC2();
      const friends = D.COMPANIONS.filter((x) => !x.node || game.tree[x.node]).map((x) => `<div class="cf">${pics[x.id]}<div><b>${x.name}</b><br><small>${x.kind}</small></div></div>`).join("");
      return `<div id="roll" class="${reduceMotion() ? "still" : ""}"><div class="rollin">
          <div class="cr-big hot">ほりほり転生</div>
          <div class="cr-sec">✨ 地球の中心で 伝説の「星のしずく」を見つけた ✨</div>
          <div class="cr-h">これまでの人生</div>${lives.map((t) => `<div>${t}</div>`).join("")}
          <div class="cr-h">記録</div>
          <div>合計の時間 …… ${hms(c.totalTime)}</div><div>転生した回数 …… ${c.lifeNo - 1}回</div><div>見つけた化石 …… ${Object.keys(game.fossils).length} / ${D.FOSSILS.length}</div>
          <div class="cr-h">いっしょに掘った仲間</div><div class="cfs">${friends}</div>
          <div class="cr-h">そして</div><div class="cr-me">${C.player(game.life.gear)}</div><div>何度生まれ変わっても掘りつづけた、あなた</div>
          <div class="cr-end hot">Thank you for playing!</div>
          <div class="sub">星のしずくが、宇宙へのとびらを開いた……</div>
        </div></div>
        <button class="btn dark skipbtn" data-act="skip-credits">${reduceMotion() ? "次へ" : "とばす ⏭"}</button>`;
    },

    sky() {
      app.className = "skybg";
      const cs = E.constellations(game), best = game.space.best, per = D.STARS_PER_CONSTELLATION;
      const stars = Array.from({ length: best }, (_, k) => `<span class="st" title="${E.planet(k).name}">${E.planet(k).icon}</span>`).join("");
      const next = per - (best % per);
      const pr = game.space.prayers, cost = E.prayerCost(game), can = E.canPray(game);
      return `<div class="screen">
          <div class="thead"><span class="hot" style="font-size:22px">🌌 星空</span><span class="soulchip num">✦ ${N(game.shards)}</span></div>
          <div class="glass pad"><div class="sub">たおした星 ${best}個 ・ いま ${game.life.space ? `${E.planet(game.life.planet).icon} ${E.planet(game.life.planet).name}` : "地球"}</div>
            <div class="stars">${stars || '<span class="sub">まだ星をたおしていない。地球をクリアして宇宙へ！</span>'}</div>
            <div class="sub">あと ${next}個で 次の星座が完成</div>
            ${E.canEnterSpace(game) ? `<button class="btn" data-act="space" style="margin-top:6px">🚀 宇宙へ（星めぐり）</button>` : ""}</div>
          <div class="glass pad cons">${cs.length ? cs.map((x) => `<div>⭐ <b>${x.name}</b> ・ ${x.desc}</div>`).join("") : '<div class="sub">星を 3つたおすと、星座が 1つ完成する</div>'}</div>
          <div class="glass pad"><b>🙏 星の祈り</b>（いま +${pr * Math.round(D.PRAYER.mult * 100)}%）<div class="sub">${can ? "かけらを使って、仲間全員の掘る力とタップを +10%。何度でも祈れる" : "スキルツリーを全部開放すると祈れるようになる"}</div>
            <button class="btn" data-act="pray" ${can && game.shards >= cost ? "" : "disabled"} style="margin-top:6px">✦ ${N(cost)} で祈る</button></div>
          <div class="grow"></div>
        </div>${navHtml()}`;
    },

    records() {
      app.className = "bookbg";
      const rows = game.lives.map((l) => `<div>${l.lifeNo}回目：${l.planet != null ? `${E.planet(l.planet).icon} ${E.planet(l.planet).name} ` : ""}${M(l.maxDepth)} ・ ${mmss(l.t)} ・ ✦${N(l.shards)}</div>`).join("");
      const clears = game.clears.map((c) => `<div>🏆 ${c.lifeNo}回目の人生でクリア ・ 合計 ${hms(c.totalTime)}</div>`).join("");
      return `<div class="screen">
          <div class="hot" style="font-size:22px">📜 これまでの記録</div>
          <div class="glass pad records">${clears}${game.space.best ? `<div>🌌 いちばん遠い星：${E.planet(game.space.best).icon} ${E.planet(game.space.best).name}（${game.space.best}個の星をクリア）</div>` : ""}${rows || '<div class="sub">まだ前世はない</div>'}<div>いま：${game.lifeNo}回目 ・ ${where()}</div></div>
          ${game.cleared ? `<button class="btn dark" data-act="credits">🎬 エンドロールをもう一度</button>` : ""}
          <button class="btn dark" data-act="back">もどる</button>
        </div>`;
    },
  };

  // ---- 掘る画面の数字・お店を毎フレーム更新 ----
  const COMPS = D.COMPANIONS;
  const COMP = Object.fromEntries(COMPS.map((c) => [c.id, c]));
  const PIC = { mog: C.mog, gan: C.gan, drill: C.drill, soko: C.soko };
  const meGear = () => game.life.gear;
  const perSec = (p) => (p / E.hardNow(game) < 0.05 ? "0.1 m 未満" : M(p / E.hardNow(game)));
  function nextMilestone(n) {
    const next = D.LV_MILESTONES.find((m) => m > n);
    const prev = [0, ...D.LV_MILESTONES].filter((m) => m <= n).pop();
    return { next, prev, transform: next != null && D.LV_MILESTONES.indexOf(next) < 4 };
  }
  function compCard(c) {
    const L = game.life;
    if (c.node && !game.tree[c.node]) return `<div class="cc lock"><div class="pic">❔</div><div class="info"><b>？？？</b><small>スキルツリー「${NODE[c.node].name}」で仲間になる</small></div><span class="cost">🔒</span></div>`;
    if (!E.isUnlocked(game, c.id)) return `<div class="cc lock"><div class="pic">❔</div><div class="info"><b>？？？</b><small>${D.LAYERS.find((l) => l.id === c.layer).name}で仲間になる</small></div><span class="cost">🔒</span></div>`;
    const n = E.lv(game, c.id), st = Math.max(0, E.stage(game, c.id));
    const ms = nextMilestone(n);
    const pct = ms.next ? Math.round(((n - ms.prev) / (ms.next - ms.prev)) * 100) : 100;
    const cost = E.levelCost(game, c.id);
    const sks = D.SKILLS.filter((k) => k.comp === c.id).map((k) => {
      const have = !!L.skills[k.id], can = E.canBuySkill(game, k.id), price = E.skillCost(k.id);
      const label = have ? `✓ ${k.name}` : can ? `${k.name} ${N(price)}💰` : `Lv.${k.need} ${k.name}`;
      return `<button class="sk ${have ? "on" : can ? "can" : ""}" data-skill="${k.id}" ${have || !can ? "disabled" : ""} ${can && !have ? `data-price="${price}"` : ""} title="${k.desc}" aria-label="${k.name}：${k.desc}">${label}</button>`;
    }).join("");
    const each = n ? E.compShown(game, c.id) : E.compShown(game, c.id, c.out);
    return `<div class="cc" data-card="${c.id}"><div class="pic">${PIC[c.id](st)}</div>
      <div class="info"><b>${c.name} <span class="num">Lv.${n}</span></b>
        <small>${n ? `毎秒 +<span data-ps="${c.id}">${perSec(each)}</span>` : `${c.kind}・仲間にすると 毎秒 +${perSec(each)}`}${ms.next ? ` ・ あと${ms.next - n}で${ms.transform ? "変身！" : "パワー×2"}` : ""}</small>
        <div class="bar"><i style="width:${pct}%"></i></div><div class="sks">${sks}</div></div>
      <button class="cost num" data-lvup="${c.id}" data-price="${cost}">${N(cost)} ${UI("coin", "ico s")}<i>${n ? "強化" : "仲間にする"}</i></button></div>`;
  }
  function gearRow(line) {
    const g = D.GEAR[line], have = meGear()[line], cost = E.gearCost(game, line);
    const pips = g.tiers.map((_, k) => `<i class="${k < have ? "on" : ""}"></i>`).join("");
    const next = g.tiers[have];
    return `<div class="gr"><span class="ic" aria-hidden="true">${UI({ pick: "pick", glove: "glove", helmet: "helmet", boots: "boot" }[line]) || g.icon}</span><div class="info"><b>${g.name}<span class="pips">${pips}</span></b>
      <small>${next ? `次：${next.name}（${next.desc}）` : "最高の段階！"}</small></div>
      ${cost == null ? `<span class="cost done">最大</span>` : `<button class="cost num" data-gear="${line}" data-price="${cost}">${N(cost)} ${UI("coin", "ico s")}<i>強化</i></button>`}</div>`;
  }
  function shopSig() {
    const L = game.life;
    return [ui.tab, JSON.stringify(L.lv), Object.keys(L.skills).join(), JSON.stringify(L.gear),
      COMPS.map((c) => E.isUnlocked(game, c.id) ? 1 : 0).join(""), game.tree.f5 ? 1 : 0].join("|");
  }
  function shopHtml() {
    return ui.tab === "me" ? Object.keys(D.GEAR).map(gearRow).join("") : COMPS.map(compCard).join("");
  }

  function update(force) {
    if (ui.view !== "dig" || !$("#pit")) return;
    const L = game.life;
    const pit = $("#pit");
    $("#depth").textContent = M(L.depth);
    $("#money").textContent = N(L.money);
    $("#shards").textContent = N(game.shards);
    $("#speed").textContent = L.cleared ? "🏆 クリアずみ" : L.atWall ? "壁で止まっている" : `毎秒 +${M(E.autoSpeed(game))}`;
    if (L.cleared && !$("#cleared")) pit.insertAdjacentHTML("beforeend", `<div id="wall" class="cleared" role="status"><b class="t" style="color:var(--gold)">🏆 地球の中心にクリアずみ！</b><br>${E.canEnterSpace(game) ? `星のしずくの力で宇宙へ行ける！<button class="btn" data-act="space">🚀 宇宙へ（星めぐり）</button>` : "転生すると、もっと速いクリアに挑戦できる。"}<button class="btn dark" data-nav="rebirth">✨ 転生する</button></div><span id="cleared"></span>`);
    const layer = E.layerOf(game);
    const want = L.space ? "space" : "L-" + layer.id;
    if (!pit.classList.contains(want)) pit.className = want;
    rockBg(pit);
    const hx = E.hardNow(game) / D.LAYERS[0].hard; // 土を 1 としたかたさ
    $("#layerchip").textContent = `${layer.icon} ${layer.name} ・ かたさ ×${hx < 10 ? hx.toFixed(1).replace(/\.0$/, "") : N(hx)}`;
    $("#gdot").style.left = (L.space ? (L.depth / E.planet(L.planet).radius) * 100 : gaugePos(L.depth) * 100).toFixed(2) + "%";
    if (L.space) {
      const wt = `${game.lifeNo}回目の人生 ・ ${E.planet(L.planet).icon} ${E.planet(L.planet).name}`;
      if ($("#where").textContent !== wt) { $("#where").textContent = wt; $("#gicon").textContent = E.planet(L.planet).bossIcon; }
    }
    if (L.space) $("#speed").textContent = L.boss ? "⚔️ ボス戦！" : L.atCore ? "中心に着いた！" : `毎秒 +${M(E.autoSpeed(game))}`;
    drawBoss();
    drawCrew();
    // お店：中身が変わったときだけ作り直す
    const sig = shopSig();
    const shop = $("#shop");
    if (force || sig !== ui.shopSig) { ui.shopSig = sig; shop.innerHTML = shopHtml(); }
    shop.querySelectorAll("[data-price]").forEach((el) => el.classList.toggle("poor", L.money < +el.dataset.price));
    shop.querySelectorAll("[data-ps]").forEach((el) => { const t = perSec(E.compShown(game, el.dataset.ps)); if (el.textContent !== t) el.textContent = t; });
    // 光る鉱石
    const ore = $("#ore");
    if (L.ore && L.ore.shown && !ore) {
      pit.insertAdjacentHTML("beforeend", `<button id="ore" class="${L.ore.kind === "rainbow" ? "rainbow" : ""}" style="left:${(12 + L.ore.x * 76).toFixed(0)}%" aria-label="光る鉱石をタップ"><img src="sprites/${L.ore.kind === "rainbow" ? "ui-nugget-pearl" : "ui-nugget"}.webp" alt=""></button>`);
    } else if (ore && !(L.ore && L.ore.shown)) ore.remove();
    // 宝箱
    const chest = $("#chest");
    if (L.chest && L.chest.shown && !chest) {
      pit.insertAdjacentHTML("beforeend", `<button id="chest" style="left:${(L.chest.x * 100).toFixed(0)}%;top:${(L.chest.y * 100).toFixed(0)}%" aria-label="宝箱をタップ">🎁</button>`);
    } else if (chest && !(L.chest && L.chest.shown)) chest.remove();
    // ブースト
    const b = L.boost && L.t < L.boost.until ? L.boost : null;
    let bar = $("#boost");
    if (b) {
      if (!bar) { $("#boostslot").insertAdjacentHTML("beforeend", '<div id="boost"></div>'); if (!reduceMotion()) pit.insertAdjacentHTML("afterbegin", '<div class="rays" id="rays"></div>'); bar = $("#boost"); }
      bar.className = b.kind === "rainbow" ? "rainbow" : "";
      bar.innerHTML = `<span>${b.kind === "rainbow" ? "🌈 虹の鉱石" : "✨ 光る鉱石"} ブースト ×${b.mult}</span><span class="num">残り ${Math.ceil(b.until - L.t)}秒</span>`;
    } else if (bar) { bar.remove(); const r = $("#rays"); if (r) r.remove(); }
    // 壁
    const wall = $("#wall");
    const tool = L.cleared ? null : E.wallTool(game);
    if (tool && !wall) {
      const n = NODE[tool];
      const can = game.shards >= n.cost;
      const s = E.rebirthShards(game);
      pit.insertAdjacentHTML("beforeend", `<div id="wall" role="status"><b class="t">${D.LAYERS[L.layer + 1].icon} ${D.LAYERS[L.layer + 1].name}の壁</b><br>
        このままでは進めない。スキルツリーの <b style="color:var(--gold)">「${n.name}」</b>（✦${N(n.cost)}）が必要！<br>
        <span class="sub">いま ✦${N(game.shards)} ・ 転生すると ✦${N(s)} もらえる</span>
        <button class="btn" data-nav="${can ? "tree" : "rebirth"}">${can ? "🌳 スキルツリーで開放する" : `✨ 転生して ✦${N(s)} もらう`}</button></div><div class="wallband" id="wallband"></div>`);
    } else if (!tool && wall && !L.cleared) { wall.remove(); const wb = $("#wallband"); if (wb) wb.remove(); }
  }

  // ---- 星の中心のボス ----
  function oddsText(o) {
    return o >= 1.2 ? '<b style="color:#8fffb0">◎ 勝てそう！</b>' : o >= 0.8 ? '<b style="color:#ffd23a">○ ぎりぎり</b>' : '<b style="color:#ff9a9a">× まだ強すぎる</b>';
  }
  function drawBoss() {
    const L = game.life, pit = $("#pit");
    const core = $("#core"), bar = $("#bossbar");
    if (!L.space || !pit) { if (core) core.remove(); if (bar) bar.remove(); return; }
    const p = E.planet(L.planet);
    if (L.atCore && !L.boss) {
      const o = E.bossOdds(game, 3);
      const boosted = L.boost && L.t < L.boost.until;
      if (!core) {
        pit.insertAdjacentHTML("beforeend", `<div id="core" role="status"><span class="bicon" aria-hidden="true">${p.bossIcon}</span>
          <div class="ci"><b class="t">${p.boss}</b><br><span id="odds"></span></div><button class="btn" data-act="boss">⚔️ 挑む</button></div>`);
        ui.coreOdds = null;
      }
      const key = Math.round(o * 20) + (boosted ? "b" : "");
      if (ui.coreOdds !== key) { $("#odds").innerHTML = `${oddsText(o)}${boosted ? ' <b style="color:#ffd23a">✨今がチャンス</b>' : ""}`; ui.coreOdds = key; }
    } else if (core) core.remove();
    if (L.boss) {
      const left = Math.max(0, L.boss.until - L.t), pct = (L.boss.hp / L.boss.max) * 100;
      if (!bar) pit.insertAdjacentHTML("beforeend", `<div id="bossbar"><span class="bicon" id="bossicon" aria-hidden="true">${p.bossIcon}</span><div class="bb"><b>${p.boss}</b><div class="hp"><i id="bosshp"></i></div></div><b class="num" id="bosst"></b></div>`);
      $("#bosshp").style.width = pct.toFixed(1) + "%";
      $("#bosst").textContent = `${Math.ceil(left)}秒`;
    } else if (bar) bar.remove();
  }
  function hitBoss() {
    const ic = $("#bossicon");
    if (!ic || reduceMotion()) return;
    ic.classList.remove("hit"); void ic.offsetWidth; ic.classList.add("hit");
  }

  // ---- 穴の中の仲間たち（自分と仲間 4人が掘っている姿） ----
  const SLOT = { gan: "s1", mog: "s2", soko: "s4", drill: "s5" }; // 自分は s3（真ん中）
  function drawCrew() {
    const box = $("#crew");
    if (!box) return;
    const L = game.life;
    const members = COMPS.filter((c) => E.lv(game, c.id) > 0);
    const sig = members.map((c) => c.id + E.stage(game, c.id)).join(",") + "|" + JSON.stringify(L.gear);
    if (sig !== ui.crewSig) {
      ui.crewSig = sig;
      box.innerHTML = members.map((c) => `<div class="tun ${SLOT[c.id]}" data-comp="${c.id}" data-stage="${E.stage(game, c.id)}">
          <div class="who">${PIC[c.id](E.stage(game, c.id))}</div><span class="lvtag num" data-lvtag aria-label="${c.name}">Lv.${E.lv(game, c.id)}</span></div>`).join("")
        + `<div class="tun s3 me" data-comp="me" data-pick="${L.gear.pick}"><div class="who">${C.player(L.gear)}</div></div>`;
      if (ui.crewFx) {
        const el = box.querySelector(`[data-comp="${ui.crewFx.id}"]`);
        if (el && !reduceMotion()) el.classList.add(ui.crewFx.cls);
        ui.crewFx = null;
      }
    }
    for (const c of members) {
      const el = box.querySelector(`[data-comp="${c.id}"]`);
      if (!el) continue;
      const tag = el.querySelector("[data-lvtag]");
      const txt = `Lv.${E.lv(game, c.id)}`;
      if (tag.textContent !== txt) tag.textContent = txt;
      if (c.id === "drill") el.classList.toggle("turbo", E.turboOn(game));
    }
    const me = box.querySelector('[data-comp="me"]');
    if (me) me.classList.toggle("auto", !!game.tree.t6 && !L.cleared && !L.atWall);
  }
  // 自分・仲間の場所（何度も測ると重いので、1フレームに 1回だけ測る）
  function rectsOf(id) {
    const now = performance.now();
    if (!ui.rects || ui.rects.at !== ui.frameNo) {
      const pit = $("#pit");
      ui.rects = { at: ui.frameNo, pit: pit && pit.getBoundingClientRect(), who: {} };
    }
    if (!ui.rects.who[id]) {
      const el = $(`#pit [data-comp="${id}"] .who`);
      ui.rects.who[id] = el ? el.getBoundingClientRect() : null;
    }
    return { pr: ui.rects.pit, r: ui.rects.who[id], now };
  }
  // 穴の岩肌（地層・星ごとの色）。背景は動かさない
  function rockBg(pit) {
    const L = game.life;
    const key = L.space ? "p" + L.planet : E.layerOf(game).id;
    if (pit.dataset.bg === key || !window.Pit) return;
    pit.dataset.bg = key;
    ui.rock = Pit.rockStyle(L.space ? { planet: L.planet } : { layer: key });
    pit.style.backgroundImage = `repeating-linear-gradient(176deg, rgba(255,200,150,.05) 0 22px, rgba(0,0,0,.1) 22px 30px, rgba(255,255,255,.03) 30px 58px, rgba(0,0,0,.08) 58px 64px), url("${Pit.rockTile(ui.rock)}")`;
    pit.style.backgroundSize = "auto, 256px 256px";
  }
  // 掘った土のかけら：足もとから上へ飛び、放物線で落ちて床ではずむ
  const DIGX = { gan: 0.3, mog: 0.5, me: 0.4, soko: 0.5, drill: 0.86 }; // 絵の幅のどこを掘っているか
  const parts = [];
  let partLast = 0;
  function stepParts(now) {
    const dt = Math.min(0.05, (now - partLast) / 1000 || 0.016); partLast = now;
    for (let i = parts.length - 1; i >= 0; i--) {
      const q = parts[i];
      q.vy += 900 * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.rot += q.vr * dt; q.life -= dt;
      if (q.y > q.ground) { q.y = q.ground; q.vy *= -0.32; q.vx *= 0.6; q.vr *= 0.5; }
      q.el.style.transform = `translate(${q.x.toFixed(1)}px,${q.y.toFixed(1)}px) rotate(${q.rot.toFixed(0)}deg)`;
      q.el.style.opacity = Math.min(1, q.life * 2.5).toFixed(2);
      if (q.life <= 0 || !q.el.isConnected) { q.el.remove(); parts.splice(i, 1); }
    }
    if (parts.length) requestAnimationFrame(stepParts);
  }
  function dirt(id, n) {
    if (reduceMotion()) return;
    const dbox = $("#dirtbox");
    const { pr, r } = rectsOf(id);
    if (!r || !pr || !dbox) return;
    const colors = (ui.rock && ui.rock.chips) || ["#8a6a4a", "#6e5642", "#4a3a2c", "#7a624a", "#3a2c22"];
    const x0 = r.left - pr.left + r.width * (DIGX[id] || 0.5), ground = r.top - pr.top + r.height * 0.79;
    for (let i = 0; i < n; i++) {
      if (parts.length >= 60) { parts[0].el.remove(); parts.shift(); }
      const d = document.createElement("i");
      d.className = "dirt";
      const s = 3 + Math.random() * 4;
      d.style.width = s.toFixed(1) + "px"; d.style.height = (s * 0.8).toFixed(1) + "px";
      d.style.background = colors[Math.floor(Math.random() * colors.length)];
      dbox.appendChild(d);
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2, v = 110 + Math.random() * 130;
      parts.push({ el: d, x: x0, y: ground - 2, vx: Math.cos(a) * v, vy: Math.sin(a) * v, ground, life: 1.3, rot: 0, vr: (Math.random() - 0.5) * 720 });
    }
    if (parts.length === n) { partLast = performance.now(); requestAnimationFrame(stepParts); }
  }
  function swingMe() {
    const me = $('#pit [data-comp="me"]');
    if (!me || reduceMotion()) return;
    me.classList.remove("swing"); void me.offsetWidth; me.classList.add("swing");
  }
  function crewDirt(dt) {
    ui.dirtAcc = ui.dirtAcc || {};
    for (const c of COMPS) {
      const n = E.lv(game, c.id);
      if (!n || game.life.atWall || game.life.cleared) continue;
      const rate = 1.2 + E.stage(game, c.id) * 0.6 + (c.id === "drill" && E.turboOn(game) ? 4 : 0);
      ui.dirtAcc[c.id] = (ui.dirtAcc[c.id] || 0) + rate * dt;
      if (ui.dirtAcc[c.id] >= 1) { const k = Math.floor(ui.dirtAcc[c.id]); ui.dirtAcc[c.id] -= k; dirt(c.id, Math.min(3, k)); }
    }
  }

  // ---- 演出 ----
  function floatNum(x, y, text, cls) {
    const pit = $("#pit");
    if (!pit) return;
    if (pit.querySelectorAll(".float").length > 24) pit.querySelector(".float").remove();
    const el = document.createElement("div");
    el.className = "float " + (cls || "");
    el.style.left = x + "px"; el.style.top = y + "px";
    el.textContent = text;
    pit.appendChild(el);
    setTimeout(() => el.remove(), 1100);
  }
  // 知らせは穴の下に 1行だけ（キャラを隠さないように）。続けて来たら新しいほうを出す
  function toast(html) {
    const box = $("#toasts");
    if (!box) { ui.pending.push(html); ui.pending = ui.pending.slice(-2); return; }
    const el = document.createElement("div");
    el.className = "toast";
    el.innerHTML = html;
    box.replaceChildren(el);
    clearTimeout(ui.toastTimer);
    ui.toastTimer = setTimeout(() => el.remove(), 3000);
  }
  // 大きな知らせは 1つずつ順番に出す（続けて来たら前のが終わってから）
  function banner(s, b, d) {
    ui.bannerQ = ui.bannerQ || [];
    ui.bannerQ.push([s, b, d]);
    if (!ui.bannerOn) nextBanner();
  }
  function nextBanner() {
    const pit = $("#pit"), item = ui.bannerQ && ui.bannerQ.shift();
    if (!item || !pit) { ui.bannerOn = false; if (ui.bannerQ) ui.bannerQ.length = 0; return; }
    const [s, b, d] = item;
    const old = $("#banner"); if (old) old.remove();
    pit.insertAdjacentHTML("beforeend", `<div id="banner"><div class="s">${s}</div><div class="b hot">${b}</div>${d ? `<div class="d">${d}</div>` : ""}</div>`);
    const el = $("#banner");
    ui.bannerOn = true;
    setTimeout(() => { if (el) el.remove(); nextBanner(); }, 2600);
  }
  function confettiSmall() {
    if (reduceMotion()) return;
    const colors = ["#ffd23a", "#ff3d6e", "#3fd3ff", "#8fffb0"];
    for (let i = 0; i < 24; i++) {
      const c = document.createElement("i");
      c.className = "confetti";
      c.style.left = Math.random() * 100 + "vw";
      c.style.background = colors[i % colors.length];
      c.style.animationDuration = 1.8 + Math.random() * 1.5 + "s";
      document.body.appendChild(c);
      setTimeout(() => c.remove(), 3600);
    }
  }
  function confetti() {
    if (reduceMotion()) return;
    const colors = ["#ffd23a", "#ff3d6e", "#3fd3ff", "#8fffb0", "#fff"];
    for (let i = 0; i < 60; i++) {
      const c = document.createElement("i");
      c.className = "confetti";
      c.style.left = Math.random() * 100 + "vw";
      c.style.background = colors[i % colors.length];
      c.style.animationDuration = 2.5 + Math.random() * 2.5 + "s";
      c.style.animationDelay = Math.random() * 1.2 + "s";
      document.body.appendChild(c);
      setTimeout(() => c.remove(), 6500);
    }
  }

  function milestoneHtml(e) {
    const layer = e.planet != null ? null : LAYER_AT[e.depth];
    const what = e.planet != null ? `${E.planet(e.planet).icon} ${E.planet(e.planet).name} ${["", "1/3", "2/3", "中心"][e.part]}に到達`
      : layer ? `${layer.icon} ${layer.name}に到達` : `📍 ${M(e.depth)} 到達`;
    if (e.prev == null) return `${what} ${game.lifeNo === 1 ? `<b class="num">${mmss(e.t)}</b>` : "初めて来た！"}`;
    const t = Math.max(e.t, 0.5);
    const x = e.prev / t;
    return `${x >= 1.1 ? `<span class="x">${x >= 10 ? Math.round(x) : x.toFixed(1)}倍速！</span>` : ""}${what} 前世<b class="num">${mmss(e.prev)}</b>→<b class="num">${mmss(e.t)}</b>`;
  }

  function handleEvents(evs) {
    for (const e of evs) {
      if (e.type === "layer") {
        const l = E.layersFor(game).find((x) => x.id === e.id) || D.LAYERS.find((x) => x.id === e.id);
        banner("NEW LAYER", `${l.icon} ${l.name}`, e.bonus ? `宝の地図ボーナス 💰 +${N(e.bonus)}` : "");
        S.play("layer");
      } else if (e.type === "milestone") {
        if (e.planet != null || e.depth < D.GOAL) { toast(milestoneHtml(e)); if (e.prev != null && e.prev > e.t) S.play("fast"); }
      } else if (e.type === "fossil") {
        const f = D.FOSSILS.find((x) => x.id === e.id);
        toast(`${f.icon} 化石を見つけた！ <b>${f.name}</b>（掘る力 +${Math.round(D.FOSSIL_BONUS * 100)}%）`);
        S.play("fossil");
      } else if (e.type === "autotap") {
        if (e.gain <= 0) continue;
        const { pr, r } = rectsOf("me");
        if (r && pr && (!reduceMotion() || e.crit)) {
          floatNum(r.left - pr.left + r.width * (0.3 + Math.random() * 0.4), r.top - pr.top + 4, `${e.crit ? "会心！ " : ""}+${M(e.gain)}`, e.crit ? "crit small" : "small");
          swingMe(); dirt("me", 2);
        }
        if (e.crit) S.play("crit");
      } else if (e.type === "ore") S.play("ore");
      else if (e.type === "wall") S.play("wall");
      else if (e.type === "clear") { save(); S.play("clear"); ui.afterCredits = "clear"; go("credits"); return; }
      else if (e.type === "core") { toast(`${E.planet(e.planet).bossIcon} 星の中心に着いた！ ボスが待っている`); S.play("wall"); }
      else if (e.type === "bossWin") { save(); S.play("clear"); banner("VICTORY", `🎉 ${E.planet(e.planet).boss}をたおした！`, `ごほうび 💰 +${N(e.reward)}`); confettiSmall(); }
      else if (e.type === "bossFail") { S.play("wall"); banner("TIME UP", "時間切れ…", "仲間を強くして、もう一度挑もう"); }
      else if (e.type === "constellation") { toast(`⭐ 星座「${e.name}」が完成！ ${e.desc}`); banner("CONSTELLATION", `⭐ ${e.name} 完成！`, e.desc); }
      else if (e.type === "planet") {
        const p = E.planet(e.planet);
        save();
        banner("NEXT STAR", `🚀 ${p.icon} ${p.name}へ！`, `ボス：${p.boss}`);
      }
    }
  }

  // ---- 時間を進める（開いている間だけ） ----
  function frame(now) {
    ui.raf = null;
    if (!game || ui.view === "title" || document.hidden) return;
    const dt = Math.min(0.25, Math.max(0, (now - (ui.last || now)) / 1000));
    ui.last = now;
    ui.frameNo = (ui.frameNo || 0) + 1;
    if (dt > 0) handleEvents(E.tick(game, dt));
    if (ui.view === "dig") { update(false); if (dt > 0) crewDirt(dt); }
    else if (ui.view === "rebirth" && $("#shardGain")) {
      $("#shardGain").textContent = `✦ ${N(E.rebirthShards(game))}`;
      $("#rbDepth").textContent = where();
    }
    if (now - ui.lastSave > 5000) save();
    running();
  }
  function running() {
    if (!game || ui.view === "title" || document.hidden) { ui.last = 0; return; }
    if (ui.raf == null) ui.raf = requestAnimationFrame(frame);
  }

  // ---- 操作 ----
  function digTap(ev) {
    const pit = $("#pit");
    if (game.life.cleared) return;
    if (game.life.space && game.life.atCore && !game.life.boss) { swingMe(); dirt("me", 2); const g0 = game.life.money; E.tap(game); floatNum((ev && ev.clientX != null ? ev.clientX - pit.getBoundingClientRect().left : 100), (ev && ev.clientY != null ? ev.clientY - pit.getBoundingClientRect().top : 100) - 10, `💰+${N(game.life.money - g0)}`, "small"); update(false); return; }
    const r = E.tap(game);
    const box = pit.getBoundingClientRect();
    const x = ev && ev.clientX != null ? ev.clientX - box.left : box.width / 2;
    const y = ev && ev.clientY != null ? ev.clientY - box.top : box.height / 2;
    if (r.dmg != null) { floatNum(x + (Math.random() - 0.5) * 30, y - 10, `${r.crit ? "会心！ " : ""}-${N(r.dmg)}`, "dmg" + (r.crit ? " crit" : "")); hitBoss(); }
    else floatNum(x + (Math.random() - 0.5) * 30, y - 10, `${r.crit ? "会心！ " : ""}+${M(r.gain)}`, r.crit ? "crit" : r.combo ? "combo" : "");
    swingMe(); dirt("me", r.crit ? 6 : 3);
    const hint = $("#taphint"); if (hint && game.life.depth >= 5) hint.remove();
    S.play(r.crit ? "crit" : "tap");
    handleEvents(r.events);
    update(false);
  }

  app.addEventListener("pointerdown", (ev) => {
    if (ui.view !== "dig" || ev.button > 0) return;
    if (ev.target.closest("#ore,#chest,#wall,#core,button")) return;
    if (!ev.target.closest("#pit")) return;
    ev.preventDefault();
    digTap(ev);
  });
  app.addEventListener("keydown", (ev) => {
    if (ui.view === "dig" && ev.target.id === "pit" && (ev.key === " " || ev.key === "Enter")) { ev.preventDefault(); digTap(null); }
  });

  app.addEventListener("click", (ev) => {
    if (ui.view === "credits" && !ev.target.closest("button")) {
      const a = $(".rollin") && $(".rollin").getAnimations()[0];
      if (a) a.playbackRate = a.playbackRate === 4 ? 1 : 4;
      return;
    }
    const el = ev.target.closest("button");
    if (!el || el.disabled) return;
    const d = el.dataset;
    if (el.id === "chest") {
      const r = E.tapChest(game);
      if (r) {
        const pit = $("#pit"), pr = pit.getBoundingClientRect(), b = el.getBoundingClientRect();
        floatNum(b.left - pr.left + b.width / 2, b.top - pr.top, `💰 +${N(r.money)}`, "crit");
        S.play("fossil"); save();
      }
      update(false);
      return;
    }
    if (el.id === "ore") {
      const r = E.tapOre(game);
      if (r) { S.play(r.kind === "rainbow" ? "rainbow" : "ore"); banner(r.kind === "rainbow" ? "RAINBOW" : "BOOST", `${r.kind === "rainbow" ? "🌈" : "✨"} ×${r.mult}！`, `${r.dur}秒間 ぜんぶ ${r.mult}倍`); }
      update(false);
      return;
    }
    if (d.buyn) { ui.buyN = d.buyn; app.querySelectorAll("[data-buyn]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.buyn === ui.buyN))); return; }
    if (d.lvup) {
      const r = E.levelUpMany(game, d.lvup, ui.buyN === "max" ? Infinity : +(ui.buyN || 1));
      if (r) {
        const c = COMP[d.lvup];
        save();
        if (r.joined) { ui.crewFx = { id: c.id, cls: "join" }; banner("NEW FRIEND", `${c.name}が仲間になった！`, `${c.kind}・いっしょに掘ってくれる`); S.play("unlock"); }
        else if (r.transformed) { ui.crewFx = { id: c.id, cls: "transform" }; banner("LEVEL UP", `${c.name}が変身！`, `Lv.${r.lv} ・ 掘る力 ×2`); S.play("layer"); }
        else { S.play("buy"); const el = $(`#pit [data-comp="${c.id}"]`); if (el && !reduceMotion()) { el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump"); } }
        update(true);
        if (!r.joined && !r.transformed) dirt(c.id, 3);
      }
      return;
    }
    if (d.skill) { if (E.buySkill(game, d.skill)) { S.play("unlock"); save(); const k = D.SKILLS.find((x) => x.id === d.skill); banner("SKILL", `特技「${k.name}」`, k.desc); } update(true); return; }
    if (d.gear) { if (E.buyGear(game, d.gear)) { S.play("buy"); save(); ui.crewFx = { id: "me", cls: "transform" }; } update(true); return; }
    if (d.tab) {
      ui.tab = d.tab;
      app.querySelectorAll("[data-tab]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.tab === ui.tab)));
      update(true);
      return;
    }
    if (d.nav) { if (d.nav === "tree") ui.sel = el.closest("#wall") ? E.wallTool(game) : null; go(d.nav); return; }
    if (d.node) { ui.sel = d.node; render(); return; }
    if (d.fossil) { ui.fsel = d.fossil; render(); return; }
    act(d.act);
  });

  function act(a) {
    switch (a) {
      case "new":
        if (game || unreadable) { ui.confirm = { text: `${game ? "今のセーブ" : "読みこめなかったセーブ"}を消して、はじめから始めますか？<br><small>スキルツリーや化石もすべて消えます。</small>`, yes: "消して はじめから", run: startNew }; render(); return; }
        startNew(); return;
      case "confirm-yes": { const f = ui.confirm && ui.confirm.run; ui.confirm = null; if (f) f(); else render(); return; }
      case "confirm-no": ui.confirm = null; render(); return;
      case "continue": {
        S.unlock(); ui.note = null;
        go(game.life.cleared && !game.life.space ? "clear" : "dig");
        if (game.migrated) {
          delete game.migrated;
          save();
          banner("NEWS", "しくみが新しくなりました！", "仲間はレベルで強くなる・特技や装備も増えたよ");
        }
        return;
      }
      case "sound": {
        S.setOn(!S.isOn()); S.unlock(); S.play("buy");
        if (ui.view === "dig") { const b = $(".hud [data-act=sound]"); if (b) b.textContent = S.isOn() ? "🔊" : "🔇"; } else render();
        return;
      }
      case "unlock": {
        if (E.unlockNode(game, ui.sel)) { S.play("unlock"); save(); }
        render(); return;
      }
      case "reborn": {
        const r = E.rebirth(game);
        if (!r) return;
        save();
        S.play("reborn");
        go("dig");
        banner(`${game.lifeNo}回目の人生`, "✨ 転生！", `星のかけら ✦${N(r.shards)} を手に入れた${game.life.space ? `・${E.planet(game.life.planet).name}から` : ""}`);
        return;
      }
      case "records": ui.recordsFrom = ui.view; go("records"); return;
      case "credits": ui.afterCredits = "records"; go("credits"); return;
      case "skip-credits": go(ui.afterCredits || "clear"); return;
      case "space": {
        if (!E.enterSpace(game)) return;
        save(); S.play("reborn");
        go("dig");
        banner("SPACE", `🚀 ${E.planet(game.life.planet).icon} ${E.planet(game.life.planet).name}へ！`, "星のしずくの力で宇宙へ。星の中心のボスをたおそう");
        return;
      }
      case "boss": { if (E.startBoss(game)) { S.play("layer"); banner("BOSS", `⚔️ ${E.planet(game.life.planet).boss}`, `${D.BOSS.time}秒以内にたおせ！ タップで攻撃`); update(false); } return; }
      case "pray": { if (E.pray(game)) { S.play("unlock"); save(); } render(); return; }
      case "back": go(ui.recordsFrom && ui.recordsFrom !== "records" && ui.recordsFrom !== "credits" ? ui.recordsFrom : "dig"); return;
    }
  }

  function startNew() {
    S.unlock();
    ui.note = null;
    game = E.newGame({});
    save(true);
    ui.tab = "friends";
    go("dig");
  }

  // 閉じる・隠れるときは保存して止める（放置では進まない）。タイトル画面では遊んでいないので保存しない（別のタブのセーブを古い内容で上書きしないため）
  const saveIfPlaying = () => { if (ui.view !== "title") save(); };
  document.addEventListener("visibilitychange", () => { if (document.hidden) saveIfPlaying(); else running(); });
  window.addEventListener("pagehide", saveIfPlaying);

  render();
})();
