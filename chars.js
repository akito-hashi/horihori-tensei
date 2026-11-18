// ほりほり転生のキャラクター（SVG）。stage: 0=Lv1, 1=Lv10, 2=Lv25, 3=Lv50, 4=Lv100
// 動く部品には class をつけている（.arm .drill .claw .beam .dirt）。CSS で動きをつける。
(function (root) {
  const metal = ["#9a6a3a", "#9aa3ad", "#7fa7d9", "#7ff0ff", "#ffd23a"]; // 木・鉄・鋼・ダイヤ・金
  const glow = (on, col) => (on ? `<circle cx="50" cy="55" r="46" fill="${col}" opacity=".18"/><circle cx="50" cy="55" r="36" fill="${col}" opacity=".16"/>` : "");
  const sparkle = (on) => on ? `<g fill="#fff6c4"><path d="M14 20l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/><path d="M84 14l1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5z"/><path d="M88 70l1.5 3.5 3.5 1.5-3.5 1.5-1.5 3.5-1.5-3.5-3.5-1.5 3.5-1.5z"/></g>` : "";
  const crown = (on) => on ? `<path d="M37 12l5 8 8-10 8 10 5-8 2 14H35z" fill="#ffd23a" stroke="#b8860b" stroke-width="1.5"/>` : "";

  // 自分（タップで掘る子ども）。gear: { pick 0-4, glove 0-3, helmet 0-3, boots 0-3 }
  function player(g = {}) {
    const pick = metal[g.pick || 0];
    const glove = ["#f2c9a0", "#e9e2d0", "#3fa0ff", "#ffd23a"][g.glove || 0];
    const boots = ["#6b4a2b", "#7a3b1a", "#2f6fd6", "#ffd23a"][g.boots || 0];
    const hel = g.helmet || 0;
    const hat = hel === 0 ? `<path d="M30 34c2-12 38-12 40 0z" fill="#ff7a3d"/><rect x="26" y="32" width="30" height="5" rx="2" fill="#e5602a"/>`
      : `<path d="M28 36c0-16 44-16 44 0z" fill="${hel >= 3 ? "#ffd23a" : "#ffcf3a"}" stroke="#c79a1a" stroke-width="1.5"/><rect x="26" y="34" width="48" height="5" rx="2.5" fill="#e0a800"/>`
        + (hel >= 2 ? `<rect x="45" y="24" width="10" height="7" rx="2" fill="#555"/><circle cx="50" cy="27.5" r="3" fill="#fff6a0"/>` : "")
        + (hel >= 2 ? `<path class="beam" d="M50 27l-14-14h28z" fill="#fff6a0" opacity=".35"/>` : "");
    return `<svg viewBox="0 0 100 100" class="ch player">${sparkle((g.pick || 0) >= 4)}
      <ellipse cx="50" cy="94" rx="24" ry="4" fill="#000" opacity=".25"/>
      <rect x="38" y="78" width="9" height="14" rx="3" fill="#3a5a8a"/><rect x="53" y="78" width="9" height="14" rx="3" fill="#3a5a8a"/>
      <rect x="35" y="88" width="14" height="7" rx="3" fill="${boots}"/><rect x="51" y="88" width="14" height="7" rx="3" fill="${boots}"/>
      <rect x="34" y="54" width="32" height="28" rx="9" fill="#4f9de8"/><rect x="42" y="56" width="16" height="10" rx="3" fill="#3a86d4"/>
      <circle cx="50" cy="42" r="15" fill="#ffd9b3"/><circle cx="44.5" cy="43" r="2" fill="#2a1a0c"/><circle cx="55.5" cy="43" r="2" fill="#2a1a0c"/>
      <path d="M45 49q5 4 10 0" stroke="#2a1a0c" stroke-width="1.8" fill="none" stroke-linecap="round"/><circle cx="40" cy="47" r="2.5" fill="#ff9a9a" opacity=".6"/><circle cx="60" cy="47" r="2.5" fill="#ff9a9a" opacity=".6"/>
      ${hat}
      <g class="arm" style="transform-origin:62px 60px">
        <rect x="58" y="57" width="20" height="7" rx="3.5" fill="#4f9de8"/><circle cx="79" cy="60" r="4.5" fill="${glove}"/>
        <rect x="77" y="30" width="4" height="40" rx="2" fill="#8a5a2a" transform="rotate(20 79 60)"/>
        <path d="M66 32q14-8 28 2l-3 4q-11-7-22-2z" fill="${pick}" stroke="#333" stroke-width="1" transform="rotate(20 79 60)"/>
      </g>
      <circle cx="33" cy="66" r="4.5" fill="${glove}"/></svg>`;
  }

  // モグ（モグラ）
  function mog(s = 0) {
    const body = s >= 3 ? "#e8b84a" : "#8a5a3a";
    const belly = s >= 3 ? "#fff0b0" : "#c8946a";
    const claw = s >= 2 ? (s >= 3 ? "#ffd23a" : "#b8c2cc") : "#f0d0b0";
    return `<svg viewBox="0 0 100 100" class="ch mog">${glow(s >= 4, "#ffd23a")}${sparkle(s >= 3)}
      <ellipse cx="50" cy="94" rx="26" ry="4" fill="#000" opacity=".25"/>
      <ellipse cx="50" cy="66" rx="28" ry="26" fill="${body}"/><ellipse cx="50" cy="74" rx="17" ry="15" fill="${belly}"/>
      <circle cx="41" cy="56" r="2.6" fill="#1a0f06"/><circle cx="59" cy="56" r="2.6" fill="#1a0f06"/>
      <circle cx="42" cy="55" r=".9" fill="#fff"/><circle cx="60" cy="55" r=".9" fill="#fff"/>
      <ellipse cx="50" cy="64" rx="7" ry="5" fill="#ff8fb0"/><circle cx="48" cy="63" r="1.4" fill="#fff" opacity=".7"/>
      <path d="M44 70q6 4 12 0" stroke="#5a3a2a" stroke-width="1.6" fill="none" stroke-linecap="round"/>
      ${s >= 1 ? `<path d="M28 50c2-20 42-20 44 0z" fill="#ffcf3a" stroke="#c79a1a" stroke-width="1.5"/><rect x="26" y="48" width="48" height="5" rx="2.5" fill="#e0a800"/>` : `<path d="M33 46q4-6 8 0M59 46q4-6 8 0" stroke="${body}" stroke-width="6" stroke-linecap="round"/>`}
      ${crown(s >= 4)}
      <g class="claw cl-l" style="transform-origin:30px 74px"><ellipse cx="24" cy="78" rx="9" ry="7" fill="${body}"/>
        <path d="M14 82l-3 5M18 84l-1 6M22 85l1 6" stroke="${claw}" stroke-width="3" stroke-linecap="round"/></g>
      <g class="claw cl-r" style="transform-origin:70px 74px"><ellipse cx="76" cy="78" rx="9" ry="7" fill="${body}"/>
        <path d="M86 82l3 5M82 84l1 6M78 85l-1 6" stroke="${claw}" stroke-width="3" stroke-linecap="round"/></g></svg>`;
  }

  // ガンさん（ベテラン掘り師）
  function gan(s = 0) {
    const pick = metal[Math.min(4, [1, 1, 2, 4, 4][s])];
    const shirt = s >= 3 ? "#ffd23a" : "#c8462a";
    return `<svg viewBox="0 0 100 100" class="ch gan">${glow(s >= 4, "#ffb000")}${sparkle(s >= 3)}
      <ellipse cx="50" cy="94" rx="24" ry="4" fill="#000" opacity=".25"/>
      <rect x="37" y="80" width="10" height="13" rx="3" fill="#4a3a2a"/><rect x="53" y="80" width="10" height="13" rx="3" fill="#4a3a2a"/>
      <rect x="31" y="54" width="38" height="30" rx="10" fill="${shirt}"/><rect x="31" y="70" width="38" height="5" fill="#5a3a1a"/>
      <circle cx="50" cy="40" r="15" fill="#f2c08a"/>
      <path d="M36 44q14 24 28 0q-2 14-14 16q-12-2-14-16z" fill="#f4f4f4"/><path d="M42 47q8 3 16 0" stroke="#f4f4f4" stroke-width="4" stroke-linecap="round"/>
      <path d="M41 37h6M53 37h6" stroke="#2a1a0c" stroke-width="2.2" stroke-linecap="round"/><path d="M40 33l7 1M53 34l7-1" stroke="#ddd" stroke-width="2.5" stroke-linecap="round"/>
      <circle cx="50" cy="42" r="3" fill="#e0a070"/>
      ${s >= 1 ? `<path d="M33 32c0-16 34-16 34 0z" fill="#ffcf3a" stroke="#c79a1a" stroke-width="1.5"/><rect x="31" y="30" width="38" height="5" rx="2.5" fill="#e0a800"/><circle cx="50" cy="25" r="3" fill="#fff6a0"/>` : `<rect x="34" y="28" width="32" height="6" rx="3" fill="#2a6fd6"/>`}
      ${crown(s >= 4)}
      <g class="arm swing" style="transform-origin:66px 60px">
        <rect x="62" y="56" width="18" height="8" rx="4" fill="#f2c08a"/>
        <rect x="76" y="18" width="5" height="50" rx="2.5" fill="#7a4a1a"/>
        <path d="M60 22q18-12 38 0l-4 6q-15-8-30 0z" fill="${pick}" stroke="#333" stroke-width="1.2"/>
      </g></svg>`;
  }

  // ドリルン（掘削ロボ）
  function drill(s = 0) {
    const shell = ["#c8d0d8", "#ffb02e", "#4f9de8", "#ffd23a", "#ffd23a"][s];
    const bit = metal[[1, 1, 2, 3, 4][s]];
    return `<svg viewBox="0 0 100 100" class="ch drillun">${glow(s >= 4, "#7ff0ff")}${sparkle(s >= 3)}
      <ellipse cx="50" cy="94" rx="26" ry="4" fill="#000" opacity=".25"/>
      <rect x="30" y="82" width="40" height="10" rx="5" fill="#444"/><circle cx="36" cy="87" r="3.5" fill="#888"/><circle cx="50" cy="87" r="3.5" fill="#888"/><circle cx="64" cy="87" r="3.5" fill="#888"/>
      <rect x="28" y="44" width="44" height="40" rx="10" fill="${shell}" stroke="#555" stroke-width="1.5"/>
      <rect x="35" y="52" width="30" height="18" rx="5" fill="#1a2a3a"/><circle class="eye" cx="44" cy="61" r="3.4" fill="#7ff0ff"/><circle class="eye" cx="56" cy="61" r="3.4" fill="#7ff0ff"/>
      <rect x="47" y="34" width="6" height="10" fill="#666"/><circle cx="50" cy="32" r="4" fill="${s >= 2 ? "#ff3d6e" : "#ffcf3a"}"/>
      ${s >= 1 ? `<path d="M30 76h40" stroke="#333" stroke-width="3" stroke-dasharray="5 4"/>` : ""}
      ${crown(s >= 4)}
      <rect x="70" y="58" width="10" height="8" rx="2" fill="#666"/>
      <g class="drill" style="transform-origin:86px 62px"><path d="M80 52l18 10-18 10z" fill="${bit}" stroke="#333" stroke-width="1"/>
        <path d="M84 55l3 14M89 58l2 8" stroke="#333" stroke-width="1" opacity=".5"/></g></svg>`;
  }

  // ソコ（地底人）
  function soko(s = 0) {
    const skin = s >= 3 ? "#b8ffcf" : "#7ee08a";
    const robe = ["#6b4bd8", "#6b4bd8", "#3a2a8a", "#ffd23a", "#ffd23a"][s];
    return `<svg viewBox="0 0 100 100" class="ch soko">${glow(s >= 2, "#b48cff")}${sparkle(s >= 3)}
      <ellipse cx="50" cy="94" rx="22" ry="4" fill="#000" opacity=".25"/>
      <path d="M32 92q18-46 36 0z" fill="${robe}"/>
      ${s >= 1 ? `<path d="M36 72h28" stroke="#ffd23a" stroke-width="3"/>` : ""}
      <ellipse cx="50" cy="44" rx="18" ry="20" fill="${skin}"/>
      <ellipse cx="42" cy="44" rx="6" ry="8" fill="#1a0f2a"/><ellipse cx="58" cy="44" rx="6" ry="8" fill="#1a0f2a"/>
      <circle cx="40" cy="41" r="2" fill="#fff"/><circle cx="56" cy="41" r="2" fill="#fff"/>
      <path d="M46 56q4 2 8 0" stroke="#2a4a2a" stroke-width="1.6" fill="none" stroke-linecap="round"/>
      <path d="M40 26q-6-12-10-14M60 26q6-12 10-14" stroke="${skin}" stroke-width="3" fill="none"/><circle cx="30" cy="12" r="4" fill="${s >= 2 ? "#ff6ad5" : "#ffd23a"}"/><circle cx="70" cy="12" r="4" fill="${s >= 2 ? "#ff6ad5" : "#ffd23a"}"/>
      ${crown(s >= 4)}
      <g class="hand"><circle cx="72" cy="68" r="5" fill="${skin}"/>
        <path class="beam" d="M76 66l22-8v20z" fill="${s >= 2 ? "#ff9af0" : "#b8fff0"}" opacity=".7"/><circle class="orb" cx="76" cy="67" r="4" fill="#fff"/></g>
      <circle cx="28" cy="68" r="5" fill="${skin}"/></svg>`;
  }

  root.Chars = { player, mog, gan, drill, soko };
})(typeof self !== "undefined" ? self : this);
