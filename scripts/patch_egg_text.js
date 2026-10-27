/* ============================================================
   patch_egg_text.js —— 改两篇手稿彩蛋的正文，改完重新编码进 eggs.js
   ------------------------------------------------------------
   用法：node scripts/patch_egg_text.js '<JSON>'
     JSON 形如 {"jujia":[["旧句子","新句子"],["旧2","新2"]],"yanhua":[["…","…"]]}
   只做纯文本替换，替换不到会报错（防止改错版本）。
   ============================================================ */
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
const P = path.join(ROOT, "game/eggs.js");

const src = fs.readFileSync(P, "utf8");
const EGGS = (0, eval)("(function(){" + src + ";return EGGS;})()");

const patch = JSON.parse(process.argv[2] || "{}");
let n = 0;
for (const key of Object.keys(patch)) {
  if (!EGGS[key]) throw new Error("没有这篇：" + key);
  for (const [from, to] of patch[key]) {
    let hit = 0;
    for (const node of EGGS[key]) {
      if (node.t === "text" && node.txt.includes(from)) {
        node.txt = node.txt.replace(from, to);
        hit++;
      }
    }
    if (!hit) throw new Error(`${key} 里找不到：${from}`);
    n += hit;
  }
}

function wrap(b64) {
  const lines = [];
  for (let i = 0; i < b64.length; i += 76) lines.push(b64.slice(i, i + 76));
  return lines.map((l, i) => "    " + JSON.stringify(l) + (i === lines.length - 1 ? "" : " +")).join("\n");
}

const head = src.slice(0, src.indexOf("  return {") + "  return {".length);
const body = Object.keys(EGGS).map(k => {
  const b64 = Buffer.from(JSON.stringify(EGGS[k]), "utf8").toString("base64");
  return `\n  ${k}: dec(\n${wrap(b64)}\n  )`;
}).join(",");
fs.writeFileSync(P, head + body + "\n  };\n})();\n", "utf8");

const back = (0, eval)("(function(){" + fs.readFileSync(P, "utf8") + ";return EGGS;})()");
for (const k of Object.keys(patch)) {
  if (JSON.stringify(back[k]) !== JSON.stringify(EGGS[k])) throw new Error(k + " 回转校验失败");
}
console.log(`替换 ${n} 处，已重写 eggs.js（${Object.keys(EGGS).join(" / ")} 两篇回转校验通过）`);
