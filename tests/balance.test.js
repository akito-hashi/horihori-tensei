// ゲームバランスの目標（ボットで確認）：
// クリアまで約 2時間（よくタップする人で 80〜130分、のんびりな人でも 200分以内）、転生はおよそ 8〜12回。
// 1回目の人生ではクリアできず、7分以上は遊べる。
const test = require("node:test");
const assert = require("node:assert/strict");
const { playUntilClear } = require("./bots.js");

const active = [1, 2, 3, 4].map((s) => playUntilClear(s));
const relaxed = [1, 2, 3].map((s) => playUntilClear(s, { tapsPerSec: 1, oreCatch: 0.5 }));
const show = (rs) => rs.map((r) => `${Math.round(r.totalMin)}分/${r.lives.length}回`).join(" ");

test("よくタップする人：80〜130分でクリア", () => {
  for (const r of active) assert.ok(r.cleared && r.totalMin >= 80 && r.totalMin <= 130, show(active));
});

test("のんびりな人（毎秒 1タップ・光る鉱石は半分だけ）：200分以内にクリア", () => {
  for (const r of relaxed) assert.ok(r.cleared && r.totalMin <= 200, show(relaxed));
});

test("人生の回数はおよそ 8〜12回", () => {
  for (const r of [...active, ...relaxed]) assert.ok(r.lives.length >= 8 && r.lives.length <= 12, show([...active, ...relaxed]));
});

test("1回目の人生ではクリアできず、7分以上は遊べる", () => {
  for (const r of active) {
    assert.notEqual(r.lives[0].res, "clear");
    assert.ok(r.lives[0].t >= 7 * 60, `${r.lives[0].t}`);
  }
});

test("転生するたびに前より深く行けるか、壁まで行ける（後戻りしない）", () => {
  for (const r of active) {
    let best = 0;
    for (const L of r.lives) {
      assert.ok(L.depth >= best * 0.5, `急に浅くなった ${best} → ${L.depth}`);
      best = Math.max(best, L.depth);
    }
  }
});
