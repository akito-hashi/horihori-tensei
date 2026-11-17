// ほりほり転生 — 画面（ルールは engine.js、数値は data.js）
(function () {
  "use strict";
  const D = window.GameData, E = window.Engine;
  const S = window.Sfx || { play() {}, setOn() {}, isOn: () => false, unlock() {} };
  const KEY = "horihori-tensei-v1";
  const app = document.getElementById("app");
  const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

  let stamp = 0; // 読みこんだ・保存したセーブの時刻（別のタブが新しく保存したかを見分ける）
  let game = load();
  const ui = { view: "title", prev: null, tab: "friends", sel: null, fsel: null, confirm: null, shopSig: "", lastSave: 0, raf: null, last: 0, pending: [], note: null };

  // ---- 保存 ----
  function readStored() {
    try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; }
  }
  function load() {
    const s = readStored();
    if (s && s.v === 1 && E.sanitize(s.game)) { stamp = s.savedAt || 0; return s.game; }
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
  const BRANCHES = [["tap", "⛏️ 掘る力"], ["friend", "🧑‍🔧 仲間"], ["treasure", "💎 お宝"], ["tool", "🔑 道具"]];
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
    if (ui.view === "dig") { update(true); const p = ui.pending; ui.pending = []; p.forEach(toast); }
    if (ui.view !== "clear") document.querySelectorAll(".confetti").forEach((c) => c.remove());
    running();
  }
  const navHtml = () => `<nav class="nav">${[["dig", "⛏️", "掘る"], ["tree", "🌳", "ツリー"], ["book", "📖", "図鑑"], ["rebirth", "✨", "転生"]]
    .map(([v, i, l]) => `<button data-nav="${v}" ${ui.view === v ? 'aria-current="page"' : ""}><i aria-hidden="true">${i}</i>${l}${v === "tree" && affordableNode() ? '<span class="dot" aria-label="開放できるマスあり"></span>' : ""}</button>`).join("")}</nav>`;

  const VIEWS = {
    title() {
      app.className = "titlebg";
      const L = game && game.life;
      return `<div class="screen">
        <div class="logo"><h1 class="big hot">ほりほり<br>転生</h1><div class="s">めざせ 地球の中心 6,371km</div></div>
        <div class="titlepick" aria-hidden="true">⛏️</div>
        <div class="center sub" style="opacity:.95">掘って、転生して、もっと深く。</div>
        ${ui.note ? `<div class="center sub" style="opacity:1;color:#fff6c4">${ui.note}</div>` : ""}
        <div class="grow"></div>
        <button class="btn" data-act="new">はじめから</button>
        ${game ? `<button class="btn dark" data-act="continue">つづきから ・ ${game.lifeNo}回目の人生 ・ ${M(L.depth)}</button>` : ""}
        <button class="sub" data-act="sound" style="padding:6px">${S.isOn() ? "🔊 音あり" : "🔇 音なし"}</button>
      </div>`;
    },

    dig() {
      const L = game.life;
      const marks = D.LAYERS.filter((l) => l.wall).map((l) => `<span class="w ${game.tree[l.wall] ? "ok" : ""}" style="top:${(gaugePos(l.from) * 100).toFixed(1)}%"></span>`).join("");
      return `<header class="hud">
          <div class="top"><span>${game.lifeNo}回目の人生</span><span class="sh">✦ <b class="num" id="shards">${N(game.shards)}</b>
            <button data-act="sound" class="snd" aria-label="効果音のオンオフ">${S.isOn() ? "🔊" : "🔇"}</button></span></div>
          <div id="depth" class="depth num">${M(L.depth)}</div>
          <div class="row2"><span>💰 <b class="num" id="money">${N(L.money)}</b></span><span id="speed"></span></div>
        </header>
        <section id="pit" class="L-${E.layerOf(game).id}" tabindex="0" role="button" aria-label="タップで掘る">
          <span class="chip layerchip" id="layerchip"></span>
          <div class="gauge" aria-hidden="true"><i id="gdot"></i>${marks}<b>💎</b></div>
          <div class="shaft" aria-hidden="true"><div class="miner" id="miner">⛏️</div></div>
          <div class="taphint">タップで掘る！</div>
          <div id="toasts" aria-live="polite"></div>
        </section>
        <section class="dock">
          <div class="tabs"><button data-tab="friends" aria-pressed="${ui.tab === "friends"}">仲間</button><button data-tab="tools" aria-pressed="${ui.tab === "tools"}">道具</button></div>
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
            <div class="rowx"><span>いちばん深いところ</span><b class="num" id="rbDepth">${M(L.depth)}</b></div>
            <div class="rowx"><span>この人生で遊んだ時間</span><b class="num">${mmss(L.t)}</b></div>
            <div class="rowx"><span>見つけた化石</span><b class="num">${fossilsNow} 個</b></div></div>
          <div class="glass pad" style="font-size:12px;line-height:1.7">リセット：深さ・お金・仲間・道具<br>ずっと残る：<b style="color:var(--gold)">スキルツリー・星のかけら・化石・前世の記録</b></div>
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
          <button class="btn" data-act="records">記録を見る</button>
          <button class="btn dark" data-nav="rebirth">転生して、もっと速いクリアに挑戦</button>
          <button class="sub" data-nav="dig" style="padding:2px">地底にもどる</button>
        </div>`;
    },

    records() {
      app.className = "bookbg";
      const rows = game.lives.map((l) => `<div>${l.lifeNo}回目：${M(l.maxDepth)} ・ ${mmss(l.t)} ・ ✦${N(l.shards)}</div>`).join("");
      const clears = game.clears.map((c) => `<div>🏆 ${c.lifeNo}回目の人生でクリア ・ 合計 ${hms(c.totalTime)}</div>`).join("");
      return `<div class="screen">
          <div class="hot" style="font-size:22px">📜 これまでの記録</div>
          <div class="glass pad records">${clears}${rows || '<div class="sub">まだ前世はない</div>'}<div>いま：${game.lifeNo}回目 ・ ${M(game.life.depth)}</div></div>
          <button class="btn dark" data-act="back">もどる</button>
        </div>`;
    },
  };

  // ---- 掘る画面の数字・お店を毎フレーム更新 ----
  function shopItems() {
    const L = game.life;
    if (ui.tab === "friends") {
      return D.BUILDINGS.filter((b) => !b.node || game.tree[b.node]).map((b) => {
        if (!E.isUnlocked(game, b.id)) {
          const layer = D.LAYERS.find((l) => l.id === b.layer);
          return { key: "L" + b.id, html: `<div class="it lock"><span class="ic" aria-hidden="true">❔</span><div><b>？？？</b><small>${layer.name}で解放</small></div><span class="cost">🔒</span></div>` };
        }
        const n = L.owned[b.id] || 0;
        const each = E.buildingPower({ ...game, life: { ...L, owned: { [b.id]: 1 } } }, b.id) / E.hardNow(game);
        return { key: b.id + n, cost: E.buildingCost(game, b.id),
          html: `<button class="it" data-buy="${b.id}"><span class="ic" aria-hidden="true">${b.icon}</span><div><b>${b.name} ×${n}</b><small>1${b.id === "mole" ? "匹" : b.id === "magma" ? "隻" : ["shovel", "machine"].includes(b.id) ? "台" : b.id === "jack" || b.id === "tunnel" ? "組" : "人"}で 毎秒 +${each < 0.05 ? "0.1 m 未満" : M(each)}</small></div>
            <span class="cost num" data-cost>${N(E.buildingCost(game, b.id))} 💰<i>${b.verb}</i></span></button>` };
      });
    }
    return D.UPGRADES.filter((u) => {
      if (L.upgrades[u.id]) return false;
      if (u.kind === "pick") return E.canBuyUpgrade(game, u.id);
      if (u.kind === "equip") return E.isUnlocked(game, u.building) && (L.owned[u.building] || 0) >= u.need;
      return true;
    }).map((u) => ({ key: u.id, cost: u.cost,
      html: `<button class="it" data-upg="${u.id}"><span class="ic" aria-hidden="true">${u.kind === "pick" ? "⛏️" : u.kind === "light" ? "🔦" : "🎁"}</span><div><b>${u.name}</b><small>${u.desc}</small></div>
        <span class="cost num" data-cost>${N(u.cost)} 💰<i>強化</i></span></button>` }));
  }

  function update(force) {
    if (ui.view !== "dig" || !$("#pit")) return;
    const L = game.life;
    const pit = $("#pit");
    $("#depth").textContent = M(L.depth);
    $("#money").textContent = N(L.money);
    $("#shards").textContent = N(game.shards);
    $("#speed").textContent = L.cleared ? "🏆 クリアずみ" : L.atWall ? "壁で止まっている" : `毎秒 +${M(E.autoSpeed(game))}`;
    if (L.cleared && !$("#cleared")) pit.insertAdjacentHTML("beforeend", `<div id="wall" class="cleared" role="status"><b class="t" style="color:var(--gold)">🏆 地球の中心にクリアずみ！</b><br>転生すると、もっと速いクリアに挑戦できる。<button class="btn" data-nav="rebirth">✨ 転生する</button></div><span id="cleared"></span>`);
    const layer = E.layerOf(game);
    const want = "L-" + layer.id;
    if (!pit.classList.contains(want)) { pit.className = want; }
    const hx = E.hardNow(game) / D.LAYERS[0].hard; // 土を 1 としたかたさ
    $("#layerchip").textContent = `${layer.icon} ${layer.name} ・ かたさ ×${hx < 10 ? hx.toFixed(1).replace(/\.0$/, "") : N(hx)}`;
    $("#gdot").style.top = (gaugePos(L.depth) * 100).toFixed(2) + "%";
    // お店：中身が変わったときだけ作り直す
    const items = shopItems();
    const sig = ui.tab + Math.round(Math.log10(E.hardNow(game)) * 20) + items.map((i) => i.key).join("|");
    const shop = $("#shop");
    if (force || sig !== ui.shopSig) {
      ui.shopSig = sig;
      shop.innerHTML = items.length ? items.map((i) => i.html).join("") : `<div class="empty">いま買える道具はない。仲間を 10人そろえると装備が出るよ</div>`;
    }
    shop.querySelectorAll("[data-buy],[data-upg]").forEach((el, i) => {
      const it = items.filter((x) => x.cost != null)[i];
      if (it) el.classList.toggle("poor", L.money < it.cost);
    });
    // 光る鉱石
    const ore = $("#ore");
    if (L.ore && L.ore.shown && !ore) {
      pit.insertAdjacentHTML("beforeend", `<button id="ore" class="${L.ore.kind === "rainbow" ? "rainbow" : ""}" style="left:${(L.ore.x * 100).toFixed(0)}%;top:${(L.ore.y * 100).toFixed(0)}%" aria-label="光る鉱石をタップ">💎</button>`);
    } else if (ore && !(L.ore && L.ore.shown)) ore.remove();
    // ブースト
    const b = L.boost && L.t < L.boost.until ? L.boost : null;
    let bar = $("#boost");
    if (b) {
      if (!bar) { pit.insertAdjacentHTML("beforeend", `<div id="boost"></div>${reduceMotion() ? "" : '<div class="rays" id="rays"></div>'}`); bar = $("#boost"); }
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
  function toast(html) {
    const box = $("#toasts");
    if (!box) { ui.pending.push(html); ui.pending = ui.pending.slice(-2); return; }
    const el = document.createElement("div");
    el.className = "toast";
    el.innerHTML = html;
    box.prepend(el);
    while (box.children.length > 2) box.lastChild.remove();
    setTimeout(() => el.remove(), 4000);
  }
  function banner(s, b, d) {
    const pit = $("#pit");
    if (!pit) return;
    const old = $("#banner"); if (old) old.remove();
    pit.insertAdjacentHTML("beforeend", `<div id="banner"><div class="s">${s}</div><div class="b hot">${b}</div>${d ? `<div class="d">${d}</div>` : ""}</div>`);
    const el = $("#banner");
    setTimeout(() => el && el.remove(), 2600);
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
    const layer = LAYER_AT[e.depth];
    const what = layer ? `${layer.icon} ${layer.name}に到達` : `📍 ${M(e.depth)} 到達`;
    if (e.prev == null) return `${what}<br>${game.lifeNo === 1 ? `<b class="num">${mmss(e.t)}</b>` : "初めて来た！"}`;
    const t = Math.max(e.t, 0.5);
    const x = e.prev / t;
    return `${x >= 1.1 ? `<span class="x">${x >= 10 ? Math.round(x) : x.toFixed(1)}倍速！</span>` : ""}${what}<br>前世 <b class="num">${mmss(e.prev)}</b> → 今回 <b class="num">${mmss(e.t)}</b>`;
  }

  function handleEvents(evs) {
    for (const e of evs) {
      if (e.type === "layer") {
        const l = D.LAYERS.find((x) => x.id === e.id);
        banner("NEW LAYER", `${l.icon} ${l.name}`, e.bonus ? `宝の地図ボーナス 💰 +${N(e.bonus)}` : "");
        S.play("layer");
      } else if (e.type === "milestone") {
        if (e.depth < D.GOAL) { toast(milestoneHtml(e)); if (e.prev != null && e.prev > e.t) S.play("fast"); }
      } else if (e.type === "fossil") {
        const f = D.FOSSILS.find((x) => x.id === e.id);
        toast(`${f.icon} 化石を見つけた！ <b>${f.name}</b><br>掘る力 +${Math.round(D.FOSSIL_BONUS * 100)}%（ずっと続く）`);
        S.play("fossil");
      } else if (e.type === "ore") S.play("ore");
      else if (e.type === "wall") S.play("wall");
      else if (e.type === "clear") { save(); S.play("clear"); go("clear"); return; }
    }
  }

  // ---- 時間を進める（開いている間だけ） ----
  function frame(now) {
    ui.raf = null;
    if (!game || ui.view === "title" || document.hidden) return;
    const dt = Math.min(0.25, Math.max(0, (now - (ui.last || now)) / 1000));
    ui.last = now;
    if (dt > 0) handleEvents(E.tick(game, dt));
    if (ui.view === "dig") update(false);
    else if (ui.view === "rebirth" && $("#shardGain")) {
      $("#shardGain").textContent = `✦ ${N(E.rebirthShards(game))}`;
      $("#rbDepth").textContent = M(game.life.depth);
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
    const r = E.tap(game);
    const box = pit.getBoundingClientRect();
    const x = ev && ev.clientX != null ? ev.clientX - box.left : box.width / 2;
    const y = ev && ev.clientY != null ? ev.clientY - box.top : box.height / 2;
    floatNum(x + (Math.random() - 0.5) * 30, y - 10, `${r.crit ? "会心！ " : ""}+${M(r.gain)}`, r.crit ? "crit" : r.combo ? "combo" : "");
    const miner = $("#miner");
    if (miner && !reduceMotion()) { miner.classList.remove("hit"); void miner.offsetWidth; miner.classList.add("hit"); }
    if (r.crit && !reduceMotion()) { pit.classList.remove("shake"); void pit.offsetWidth; pit.classList.add("shake"); }
    S.play(r.crit ? "crit" : "tap");
    handleEvents(r.events);
    update(false);
  }

  app.addEventListener("pointerdown", (ev) => {
    if (ui.view !== "dig" || ev.button > 0) return;
    if (ev.target.closest("#ore,#wall,button")) return;
    if (!ev.target.closest("#pit")) return;
    ev.preventDefault();
    digTap(ev);
  });
  app.addEventListener("keydown", (ev) => {
    if (ui.view === "dig" && ev.target.id === "pit" && (ev.key === " " || ev.key === "Enter")) { ev.preventDefault(); digTap(null); }
  });

  app.addEventListener("click", (ev) => {
    const el = ev.target.closest("button");
    if (!el || el.disabled) return;
    const d = el.dataset;
    if (el.id === "ore") {
      const r = E.tapOre(game);
      if (r) { S.play(r.kind === "rainbow" ? "rainbow" : "ore"); banner(r.kind === "rainbow" ? "RAINBOW" : "BOOST", `${r.kind === "rainbow" ? "🌈" : "✨"} ×${r.mult}！`, `${r.dur}秒間 ぜんぶ ${r.mult}倍`); }
      update(false);
      return;
    }
    if (d.buy) { if (E.buy(game, d.buy)) { S.play("buy"); save(); } update(true); return; }
    if (d.upg) { if (E.buyUpgrade(game, d.upg)) { S.play("buy"); save(); } update(true); return; }
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
        if (game) { ui.confirm = { text: "今のセーブを消して、はじめから始めますか？<br><small>スキルツリーや化石もすべて消えます。</small>", yes: "消して はじめから", run: startNew }; render(); return; }
        startNew(); return;
      case "confirm-yes": { const f = ui.confirm && ui.confirm.run; ui.confirm = null; if (f) f(); else render(); return; }
      case "confirm-no": ui.confirm = null; render(); return;
      case "continue": S.unlock(); ui.note = null; go(game.life.cleared ? "clear" : "dig"); return;
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
        banner(`${game.lifeNo}回目の人生`, "✨ 転生！", `星のかけら ✦${N(r.shards)} を手に入れた`);
        return;
      }
      case "records": go("records"); return;
      case "back": go(ui.prev && ui.prev !== "records" ? ui.prev : "dig"); return;
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
