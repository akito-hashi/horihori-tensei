// 3Dのキャラ画像（sprites/manifest.js の一覧）を重ねて、絵の HTML を作る。
// 動く部品（腕・手・ドリル・光の玉）は別の画像で、CSS で回したり光らせたりする。
(function (root) {
  const DIR = "sprites/";
  const BLINK_DELAY = { mog: 0.7, gan: 2.1, drill: 1.3, soko: 3.0, me: 0 }; // まばたきがそろわないように、キャラごとにずらす（秒）
  const clamp = (v, max) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.min(max, Math.max(0, n)) : 0; };
  const img = (f, cls, style) => `<img${cls ? ` class="${cls}"` : ""} src="${DIR}${f}" alt=""${style ? ` style="${style}"` : ""}>`;
  const origin = (p) => `transform-origin:${p[0]}% ${p[1]}%`;

  function make(S) {
    function comp(id, stage) {
      const list = S.comp[id];
      if (!list) return "";
      const s = clamp(stage, list.length - 1);
      const st = list[s];
      const parts = st.parts.map((p) => p.frames
        ? `<div class="pt p-${p.name}" style="${origin(p.pivot)}">${p.frames.map((f, k) => img(f, "fr", `--k:${k}`)).join("")}</div>`
        : img(p.file, `pt p-${p.name}`, origin(p.pivot))).join("");
      return `<div class="spr c-${id} s-${s}" style="--bd:${BLINK_DELAY[id]}s"><div class="sb">${img(st.base, "base")}${img(st.blink, "blink")}${parts}</div></div>`;
    }
    function player(gear) {
      const g = gear || {};
      const P = S.player;
      const pick = clamp(g.pick, P.arm.pick.length - 1), glove = clamp(g.glove, P.arm.glove.length - 1);
      const hel = clamp(g.helmet, P.helmet.length - 1), boots = clamp(g.boots, P.boots.length - 1);
      return `<div class="spr c-me${pick >= 5 ? " star" : ""}" style="--bd:${BLINK_DELAY.me}s"><div class="sb">${img(P.body, "base")}${img(P.blink, "blink")}`
        + `${img(P.boots[boots], "ly")}${img(P.gloveL[glove], "ly")}${img(P.helmet[hel], "ly")}`
        + `<div class="pt p-arm" style="${origin(P.arm.pivot)}">${img(P.arm.pick[pick], "ly")}${img(P.arm.glove[glove], "ly")}</div></div></div>`;
    }
    return { comp, player, files: S.files.map((f) => DIR + f) };
  }

  if (typeof module === "object" && module.exports) module.exports = { make };
  else if (root.SPRITES) root.Pics = make(root.SPRITES);
})(typeof self !== "undefined" ? self : this);
