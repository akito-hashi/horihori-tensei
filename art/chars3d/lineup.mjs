// 画像を土の背景に横一列に並べて撮る：node lineup.mjs <出力.png> <画像...>
import { createRequire } from "node:module";
const puppeteer = createRequire(new URL("../../package.json", import.meta.url))("puppeteer-core");
import fs from "node:fs";
import path from "node:path";
const [out, ...imgs] = process.argv.slice(2);
const dir = path.dirname(path.resolve(out));
const W = 300;
const html = `<!doctype html><meta charset="utf-8"><style>
body{margin:0;padding:16px;background:#222;display:flex;gap:10px;font:14px sans-serif;color:#eee}
.c{width:${W}px}.b{height:${W}px;border-radius:16px;background:linear-gradient(180deg,#6b4a32,#2e1c12);overflow:hidden}
.b img{width:100%}.s{height:90px;margin-top:8px;border-radius:12px;background:linear-gradient(180deg,#7a5638,#3e2818);display:flex;justify-content:center;align-items:flex-end}
.s img{width:90px}</style>${imgs.map((f) => `<div class="c"><div class="b"><img src="file://${path.resolve(f)}"></div><div class="s"><img src="file://${path.resolve(f)}"></div><div>${path.basename(f)}</div></div>`).join("")}`;
fs.writeFileSync(path.join(dir, "lineup.html"), html);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--allow-file-access-from-files"] });
const p = await b.newPage();
await p.setViewport({ width: imgs.length * (W + 10) + 26, height: W + 140, deviceScaleFactor: 1.5 });
await p.goto(`file://${path.join(dir, "lineup.html")}`);
await new Promise((r) => setTimeout(r, 400));
await p.screenshot({ path: out });
await b.close();
console.log("ok");
