// pics.js：一覧から、重ねた絵の HTML を作る
const test = require("node:test");
const assert = require("node:assert/strict");
const { make } = require("../pics.js");

const st = (id, s) => ({
  base: `${id}-${s}-base.webp`, blink: `${id}-${s}-blink.webp`,
  parts: id === "drill"
    ? [{ name: "drill", pivot: [70, 55], frames: Array.from({ length: 8 }, (_, k) => `drill-${s}-drill-${k}.webp`) }]
    : [{ name: "arm", pivot: [35.5, 47.6], file: `${id}-${s}-arm.webp` }],
});
const FAKE = {
  size: 256, files: ["a.webp", "b.webp"],
  comp: Object.fromEntries(["mog", "gan", "drill", "soko"].map((id) => [id, [0, 1, 2, 3, 4].map((s) => st(id, s))])),
  player: {
    body: "me-body.webp", blink: "me-blink.webp",
    boots: [0, 1, 2, 3].map((i) => `me-boots-${i}.webp`), gloveL: [0, 1, 2, 3].map((i) => `me-gloveL-${i}.webp`),
    helmet: [0, 1, 2, 3].map((i) => `me-helmet-${i}.webp`),
    arm: { pivot: [38.9, 50.8], glove: [0, 1, 2, 3].map((i) => `me-arm-${i}.webp`), pick: [0, 1, 2, 3, 4, 5].map((i) => `me-pick-${i}.webp`) },
  },
};
const P = make(FAKE);
const srcs = (html) => [...html.matchAll(/src="([^"]+)"/g)].map((m) => m[1]);

test("仲間の絵：段階のクラスと、体・まばたき・部品の画像が入る", () => {
  const h = P.comp("gan", 2);
  assert.match(h, /class="spr c-gan s-2"/);
  assert.deepEqual(srcs(h), ["sprites/gan-2-base.webp", "sprites/gan-2-blink.webp", "sprites/gan-2-arm.webp"]);
  assert.match(h, /class="blink"/);
  assert.match(h, /class="pt p-arm"[^>]*transform-origin:35.5% 47.6%/);
});

test("段階は 0〜4 に収まる（-1 → 0、9 → 4、なし → 0）", () => {
  assert.match(P.comp("mog", -1), /s-0"/);
  assert.match(P.comp("mog", 9), /s-4"/);
  assert.match(P.comp("mog"), /s-0"/);
  assert.match(P.comp("mog", 2.7), /s-2"/);
  assert.equal(P.comp("nobody", 1), "");
});

test("ドリルの刃は 8コマを重ね、それぞれ --k が 0〜7", () => {
  const h = P.comp("drill", 3);
  const ks = [...h.matchAll(/class="fr"[^>]*--k:(\d)"/g)].map((m) => +m[1]);
  assert.deepEqual(ks, [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.match(h, /sprites\/drill-3-drill-7\.webp/);
});

test("自分の絵：装備に合った重ね絵。重ねる順は 体→まばたき→長ぐつ→左手→ヘルメット→つるはし→右腕", () => {
  const h = P.player({ pick: 4, glove: 2, helmet: 3, boots: 1 });
  assert.deepEqual(srcs(h), ["sprites/me-body.webp", "sprites/me-blink.webp", "sprites/me-boots-1.webp", "sprites/me-gloveL-2.webp",
    "sprites/me-helmet-3.webp", "sprites/me-pick-4.webp", "sprites/me-arm-2.webp"]);
  assert.match(h, /class="pt p-arm"[^>]*transform-origin:38.9% 50.8%/);
  assert.doesNotMatch(h, /star/);
});

test("流れ星のつるはし（pick 5）は star が付く", () => {
  assert.match(P.player({ pick: 5, glove: 0, helmet: 0, boots: 0 }), /class="spr c-me star"/);
});

test("古いセーブの装備：なし・大きすぎる・数でない値でも、範囲の中の絵になる", () => {
  assert.deepEqual(srcs(P.player({})).slice(2), ["sprites/me-boots-0.webp", "sprites/me-gloveL-0.webp", "sprites/me-helmet-0.webp", "sprites/me-pick-0.webp", "sprites/me-arm-0.webp"]);
  assert.deepEqual(srcs(P.player(undefined)).slice(2, 3), ["sprites/me-boots-0.webp"]);
  const h = P.player({ pick: 99, glove: 7, helmet: -3, boots: "x" });
  assert.deepEqual(srcs(h).slice(2), ["sprites/me-boots-0.webp", "sprites/me-gloveL-3.webp", "sprites/me-helmet-0.webp", "sprites/me-pick-5.webp", "sprites/me-arm-3.webp"]);
});

test("files は sprites/ を付けた全部の画像", () => {
  assert.deepEqual(P.files, ["sprites/a.webp", "sprites/b.webp"]);
});
