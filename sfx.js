// 効果音（WebAudio で鳴らす。音のファイルは使わない）
(function () {
  "use strict";
  const KEY = "horihori-tensei-sound";
  let ctx = null;
  let on = true;
  try { on = localStorage.getItem(KEY) !== "off"; } catch (e) { /* 保存できない環境でも鳴らせる */ }

  // [周波数Hz, 開始(秒), 長さ(秒), 波形]
  const N = { C5: 523, D5: 587, E5: 659, F5: 698, G5: 784, A5: 880, B5: 988, C6: 1047, E6: 1319, G6: 1568, C4: 262, G4: 392, E4: 330, A3: 220 };
  const SOUNDS = {
    tap: [[N.A5, 0, 0.03, "square"]],
    crit: [[N.E5, 0, 0.05, "square"], [N.C6, 0.04, 0.12, "square"]],
    buy: [[N.E6, 0, 0.05, "sine"], [N.G6, 0.05, 0.12, "sine"]],
    unlock: [[N.G5, 0, 0.08, "sine"], [N.C6, 0.08, 0.08, "sine"], [N.E6, 0.16, 0.08, "sine"], [N.G6, 0.24, 0.35, "sine"]],
    layer: [[N.C5, 0, 0.1, "square"], [N.G5, 0.1, 0.1, "square"], [N.C6, 0.2, 0.3, "square"]],
    fast: [[N.G5, 0, 0.06, "triangle"], [N.C6, 0.06, 0.06, "triangle"], [N.E6, 0.12, 0.18, "triangle"]],
    fossil: [[N.E5, 0, 0.1, "triangle"], [N.A5, 0.1, 0.1, "triangle"], [N.E6, 0.2, 0.25, "triangle"]],
    ore: [[N.C6, 0, 0.06, "sine"], [N.E6, 0.06, 0.06, "sine"], [N.G6, 0.12, 0.2, "sine"]],
    rainbow: [[N.C6, 0, 0.06, "sine"], [N.E6, 0.06, 0.06, "sine"], [N.G6, 0.12, 0.06, "sine"], [N.C6, 0.18, 0.06, "square"], [N.G6, 0.24, 0.4, "sine"]],
    wall: [[N.E4, 0, 0.15, "sawtooth"], [N.C4, 0.15, 0.3, "sawtooth"]],
    reborn: [[N.C4, 0, 0.2, "sine"], [N.G4, 0.15, 0.2, "sine"], [N.C5, 0.3, 0.2, "sine"], [N.G5, 0.45, 0.5, "sine"]],
    clear: [[N.C5, 0, 0.15, "square"], [N.E5, 0.15, 0.15, "square"], [N.G5, 0.3, 0.15, "square"], [N.C6, 0.45, 0.25, "square"],
      [N.G5, 0.75, 0.12, "square"], [N.C6, 0.9, 0.7, "square"], [N.E6, 0.9, 0.7, "triangle"]],
  };
  let lastTap = 0;


  function play(name) {
    if (!on || !SOUNDS[name]) return;
    if (name === "tap") { const now = Date.now(); if (now - lastTap < 45) return; lastTap = now; } // 連打で音が重なりすぎないように
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = ctx || new AC();
      if (ctx.state === "suspended") ctx.resume();
      const t0 = ctx.currentTime + 0.01;
      for (const [f, at, len, type] of SOUNDS[name]) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = type; o.frequency.value = name === "tap" ? f * (0.85 + Math.random() * 0.3) : f;
        g.gain.setValueAtTime(0.0001, t0 + at);
        g.gain.exponentialRampToValueAtTime(name === "tap" ? 0.05 : 0.12, t0 + at + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + len);
        o.connect(g).connect(ctx.destination);
        o.start(t0 + at); o.stop(t0 + at + len + 0.02);
      }
    } catch (e) { /* 音が出なくても遊びは止めない */ }
  }

  function setOn(v) {
    on = !!v;
    try { localStorage.setItem(KEY, on ? "on" : "off"); } catch (e) { /* 無視 */ }
  }

  window.Sfx = { play, setOn, isOn: () => on };
})();
