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
