// pit.js：穴の岩肌の色（地層ごと・星ごと）と、岩肌の模様
const test = require("node:test");
const assert = require("node:assert/strict");
const Pit = require("../pit.js");
const D = require("../data.js");

const HEX = /^#[0-9a-f]{6}$/i;
const okStyle = (st, label) => {
  assert.match(st.light, HEX, label);
  const nums = st.matrix.trim().split(/\s+/).map(Number);
  assert.equal(nums.length, 20, label);
  assert.ok(nums.every((n) => Number.isFinite(n) && n >= 0 && n <= 1.2), `${label} ${st.matrix}`);
  assert.equal(st.chips.length, 5, label);
  for (const c of st.chips) assert.match(c, HEX, label);
};

test("7つの地層すべてに岩肌の色があり、地層ごとにちがう", () => {
  const seen = new Set();
  for (const l of D.LAYERS) {
    const st = Pit.rockStyle({ layer: l.id });
    okStyle(st, l.id);
    seen.add(st.matrix);
  }
  assert.equal(seen.size, D.LAYERS.length);
});

test("星 1〜300 でも色が決まり、同じ星はいつも同じ色", () => {
  for (let k = 1; k <= 300; k++) {
    const a = Pit.rockStyle({ planet: k });
    okStyle(a, `planet ${k}`);
    assert.deepEqual(Pit.rockStyle({ planet: k }), a);
  }
  assert.notDeepEqual(Pit.rockStyle({ planet: 1 }), Pit.rockStyle({ planet: 2 }));
});

test("知らない地層でも、ふつうの土の色になる（こわれない）", () => {
  assert.deepEqual(Pit.rockStyle({ layer: "nope" }), Pit.rockStyle({ layer: "soil" }));
  assert.deepEqual(Pit.rockStyle(), Pit.rockStyle({ layer: "soil" }));
});

test("岩肌の模様は SVG の画像で、色の指定が入っている", () => {
  const st = Pit.rockStyle({ layer: "mantle" });
  const url = Pit.rockTile(st);
  assert.ok(url.startsWith("data:image/svg+xml,"));
  const svg = decodeURIComponent(url.slice("data:image/svg+xml,".length));
  assert.ok(svg.includes(st.matrix));
  assert.ok(svg.includes(st.light));
});

test("星は、その地層に決めてある色（#rgb か hsl）で岩肌を作る。月は灰色、火星は赤茶", () => {
  const m = (st) => st.matrix.split(/\s+/).map(Number);
  const moon = m(Pit.rockStyle({ color: "#cfd3da" })), mars = m(Pit.rockStyle({ color: "#e07a4a" }));
  assert.ok(Math.abs(moon[0] - moon[12]) < 0.08, "月はほぼ灰色");
  assert.ok(mars[0] > mars[6] && mars[6] > mars[12], "火星は 赤 > 緑 > 青");
  const g = m(Pit.rockStyle({ color: "hsl(120 50% 48%)" }));
  assert.ok(g[6] > g[0] && g[6] > g[12], "hsl も読める");
  okStyle(Pit.rockStyle({ color: "hsl(300 55% 28%)" }), "hsl");
  assert.deepEqual(Pit.rockStyle({ color: "へんな色" }), Pit.rockStyle({ layer: "soil" }));
  okStyle(Pit.rockStyle({ planet: 0 }), "planet 0");
});
