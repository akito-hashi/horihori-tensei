// ゲーム用のキャラ画像を全部書き出して、一覧 sprites/manifest.js を作る（npm run art）
//   node art/chars3d/export.mjs            … 全部描いて一覧を作る（30分ほどかかる）
//   node art/chars3d/export.mjs --only mog  … 名前に mog を含む分だけ描き直して、一覧を作り直す
//   node art/chars3d/export.mjs --manifest  … 描かずに、書き出し済みの説明から一覧だけ作り直す
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const OUT = path.join(ROOT, "sprites");
const META = path.join(OUT, "_meta");
const BLENDER = process.env.BLENDER || "/Applications/Blender.app/Contents/MacOS/Blender";
const SAMPLES = 64, RES = 256;
const COMPS = ["mog", "gan", "drill", "soko"];
const UI = ["coin", "shard", "pick", "glove", "helmet", "boot", "tree", "book", "star", "nugget", "nugget-pearl"];

// [名前, 引数]。自分の装備は「つるはし,手袋,ヘルメット,長ぐつ」で、描く層以外はふつうの装備にしておく
export function jobs() {
  const out = [];
  for (const id of COMPS) for (let s = 0; s < 5; s++) out.push([`${id}-${s}`, [id, OUT + "/", SAMPLES, RES, s]]);
  out.push(["me-body", ["player", OUT + "/", SAMPLES, RES, "1,0,1,0", "body", 0]]);
  for (let i = 0; i < 4; i++) {
    out.push([`me-boots-${i}`, ["player", OUT + "/", SAMPLES, RES, `1,0,1,${i}`, "boots", i]]);
    out.push([`me-gloveL-${i}`, ["player", OUT + "/", SAMPLES, RES, `1,${i},1,0`, "gloveL", i]]);
    out.push([`me-helmet-${i}`, ["player", OUT + "/", SAMPLES, RES, `1,0,${i},0`, "helmet", i]]);
    out.push([`me-arm-${i}`, ["player", OUT + "/", SAMPLES, RES, `1,${i},1,0`, "arm", i]]);
  }
  for (let i = 0; i < 6; i++) out.push([`me-pick-${i}`, ["player", OUT + "/", SAMPLES, RES, `${i},0,1,0`, "pick", i]]);
  for (const n of UI) out.push([`ui-${n}`, [n, OUT + "/", 48, 128], "icons.py"]);
  return out;
}

// 書き出しの説明（_meta/*.json）から一覧を作る
export function buildManifest(metas) {
  const by = (k) => metas.find((m) => m.key === k) || (() => { throw new Error(`${k} の説明がない`); })();
  const comp = {};
  for (const id of COMPS) comp[id] = [0, 1, 2, 3, 4].map((s) => {
    const m = by(`${id}-${s}`);
    return { base: m.base, blink: m.blink, parts: m.parts };
  });
  const L = (layer, n) => Array.from({ length: n }, (_, i) => by(`me-${layer}-${i}`).file);
  const body = by("me-body-0");
  const player = { body: body.file, blink: body.blink, boots: L("boots", 4), gloveL: L("gloveL", 4), helmet: L("helmet", 4),
    arm: { pivot: body.pivot, glove: L("arm", 4), pick: L("pick", 6) } };
  const files = [];
  for (const id of COMPS) for (const st of comp[id]) {
    files.push(st.base, st.blink);
    for (const p of st.parts) files.push(...(p.frames || [p.file]));
  }
  files.push(player.body, player.blink, ...player.boots, ...player.gloveL, ...player.helmet, ...player.arm.glove, ...player.arm.pick);
  const ui = Object.fromEntries(UI.map((n) => [n, by(`ui-${n}`).file]));
  files.push(...Object.values(ui));
  return { size: RES, files, comp, player, ui };
}

function readMetas() {
  return fs.readdirSync(META).filter((f) => f.endsWith(".json")).map((f) => ({ key: f.replace(/\.json$/, ""), ...JSON.parse(fs.readFileSync(path.join(META, f), "utf8")) }));
}

export function writeManifest(S) {
  const js = `// 自動で作るファイル（npm run art）。手で直さない\n(function (root) {\n  const S = ${JSON.stringify(S)};\n  if (typeof module === "object" && module.exports) module.exports = S; else root.SPRITES = S;\n})(typeof self !== "undefined" ? self : this);\n`;
  fs.writeFileSync(path.join(OUT, "manifest.js"), js);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : null;
  fs.mkdirSync(META, { recursive: true });
  if (!process.argv.includes("--manifest")) {
    const list = jobs().filter(([name]) => !only || name.includes(only));
    list.forEach(([name, args, script = "build.py"], i) => {
      const t = Date.now();
      const log = execFileSync(BLENDER, ["-b", "-P", path.join(HERE, script), "--", ...args.map(String)], { encoding: "utf8", maxBuffer: 64 << 20 });
      if (!/DONE/.test(log) || /Traceback|Error:/.test(log)) { console.error(log.slice(-3000)); throw new Error(`${name} の書き出しに失敗`); }
      console.log(`${i + 1}/${list.length} ${name} ${((Date.now() - t) / 1000).toFixed(0)}秒`);
    });
  }
  writeManifest(buildManifest(readMetas()));
  console.log("manifest ok");
}
