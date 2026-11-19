// ゲームバランスの目標（ボットで確認）：
// ・クリアまで約 1時間〜1時間半（子どもらしい遊び方で 60〜110分、よくタップする人は 50分以上、のんびりな人でも 180分以内）
// ・転生直後は「前世より速い！」がはっきり感じられる（2回目の人生で 10km に着くのが 2.5倍以上速い）
// ・同じ壁で終わる人生が 2回続かない（かけらを貯めるだけの退屈な人生を作らない）
// ・1回目の人生ではクリアできず、7分以上は遊べる
const test = require("node:test");
const assert = require("node:assert/strict");
const { playUntilClear, playSpace } = require("./bots.js");

const kinds = {
  kid: [1, 2, 3].map((s) => playUntilClear(s, { tapsPerSec: 2, oreCatch: 0.7, cheapFirst: true })),
  active: [1, 2, 3].map((s) => playUntilClear(s)),
  relaxed: [1, 2].map((s) => playUntilClear(s, { tapsPerSec: 1, oreCatch: 0.5 })),
};
const all = Object.values(kinds).flat();
const show = (rs) => rs.map((r) => `${Math.round(r.totalMin)}分/${r.lives.length}回`).join(" ");

test("子どもらしい遊び方（安いマスから開放・毎秒2タップ）：60〜110分でクリア", () => {
  for (const r of kinds.kid) assert.ok(r.cleared && r.totalMin >= 60 && r.totalMin <= 110, show(kinds.kid));
});

test("よくタップする人は 50分以上、のんびりな人も 180分以内にクリア", () => {
  for (const r of kinds.active) assert.ok(r.cleared && r.totalMin >= 50, show(kinds.active));
  for (const r of kinds.relaxed) assert.ok(r.cleared && r.totalMin <= 180, show(kinds.relaxed));
});

test("人生の回数は 5〜10回", () => {
  for (const r of all) assert.ok(r.lives.length >= 5 && r.lives.length <= 10, show(all));
});

test("2回目の人生は、10km 地点に前世の 2.5倍以上速く着く", () => {
  for (const r of all) {
    const [a, b] = r.lives;
    assert.ok(a.reach[10000] && b.reach[10000] && a.reach[10000] / b.reach[10000] >= 2.5, `${a.reach[10000]} → ${b.reach[10000]}`);
  }
});

test("同じ壁で終わる人生が 2回続かない", () => {
  for (const r of all) {
    for (let i = 1; i < r.lives.length; i++) {
      const same = r.lives[i].res === "wall" && r.lives[i - 1].res === "wall" && Math.abs(r.lives[i].depth - r.lives[i - 1].depth) < 1;
      assert.ok(!same, `${i + 1}回目が前と同じ壁 ${r.lives[i].depth}`);
    }
  }
});

test("1回目の人生ではクリアできず、7分以上は遊べる", () => {
  for (const r of all) {
    assert.notEqual(r.lives[0].res, "clear");
    assert.ok(r.lives[0].t >= 7 * 60, `${r.lives[0].t}`);
  }
});

test("星めぐり：地球クリアのあと 2時間で 5つ以上の星を進め、どの星も 45分以内。月はすぐには終わらない", () => {
  for (const r of [kinds.kid[0], kinds.active[0]]) {
    const times = playSpace(r.game, { minutes: 120, maxPlanets: 20 });
    assert.ok(times.length >= 5, `進んだ星 ${times.length}: ${times}`);
    assert.ok(times.every((t) => t <= 45), String(times));
    assert.ok(times[0] >= 3, `月 ${times[0]}分`);
  }
});
