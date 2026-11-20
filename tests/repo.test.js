// リポジトリ全体の決まりごと（公開しても困らない・CSS の名前がかぶらない）
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");

test("公開するファイルに、このパソコンのホームフォルダの場所が書かれていない", () => {
  const files = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" }).split("\n")
    .filter((f) => /\.(js|mjs|py|css|html|json|md)$/.test(f));
  const bad = files.filter((f) => /\/Users\/[^/\s"']+\//.test(fs.readFileSync(path.join(ROOT, f), "utf8")));
  assert.deepEqual(bad, []);
});

test("style.css の @keyframes の名前がかぶっていない（あとの定義が前のを上書きしてしまう）", () => {
  const css = fs.readFileSync(path.join(ROOT, "style.css"), "utf8");
  const names = [...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]);
  const dup = names.filter((n, i) => names.indexOf(n) !== i);
  assert.deepEqual(dup, []);
});
