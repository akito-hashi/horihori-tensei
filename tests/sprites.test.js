// 3Dのキャラ画像の一覧（sprites/manifest.js）：全員・全段階・全装備がそろい、ファイルが実際にあること
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const S = require("../sprites/manifest.js");
const COMPS = ["mog", "gan", "drill", "soko"];
const PARTS = { mog: ["handR", "handL"], gan: ["arm"], drill: ["drill"], soko: ["orb"] };
const inPct = (p) => Array.isArray(p) && p.length === 2 && p.every((v) => typeof v === "number" && v >= 0 && v <= 100);

test("仲間 4人 × 5段階に、体・まばたきの体・動く部品がある（回す中心は画像の中）", () => {
  assert.equal(S.size, 256);
  for (const id of COMPS) {
    assert.equal(S.comp[id].length, 5, id);
    S.comp[id].forEach((st, s) => {
      assert.ok(st.base && st.blink, `${id} ${s}`);
      assert.deepEqual(st.parts.map((p) => p.name), PARTS[id], `${id} ${s}`);
      for (const p of st.parts) assert.ok(inPct(p.pivot), `${id} ${s} ${p.name} の中心 ${p.pivot}`);
    });
  }
});

test("ドリルの刃は 8コマで回る", () => {
  for (const st of S.comp.drill) {
    const d = st.parts.find((p) => p.name === "drill");
    assert.equal(d.frames.length, 8);
    assert.equal(new Set(d.frames).size, 8);
  }
});

test("自分の重ね絵：体とまばたき、長ぐつ 4・左手 4・ヘルメット 4・右腕 4・つるはし 6", () => {
  const P = S.player;
  assert.ok(P.body && P.blink);
  assert.equal(P.boots.length, 4);
  assert.equal(P.gloveL.length, 4);
  assert.equal(P.helmet.length, 4);
  assert.equal(P.arm.glove.length, 4);
  assert.equal(P.arm.pick.length, 6);
  assert.ok(inPct(P.arm.pivot), String(P.arm.pivot));
});

function listed() {
  const out = [];
  for (const id of COMPS) for (const st of S.comp[id]) {
    out.push(st.base, st.blink);
    for (const p of st.parts) out.push(...(p.frames || [p.file]));
  }
  const P = S.player;
  out.push(P.body, P.blink, ...P.boots, ...P.gloveL, ...P.helmet, ...P.arm.glove, ...P.arm.pick);
  return out;
}

test("files は一覧の中の全部の画像で、重なりがなく、全部 sprites/ に実際にある", () => {
  const all = listed();
  assert.deepEqual([...S.files].sort(), [...new Set(all)].sort());
  assert.equal(new Set(S.files).size, S.files.length, "重複がある");
  for (const f of S.files) {
    assert.match(f, /^[A-Za-z0-9-]+\.webp$/, f);
    assert.ok(fs.existsSync(path.join(ROOT, "sprites", f)), `${f} がない`);
  }
});
