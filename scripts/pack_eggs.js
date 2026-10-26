#!/usr/bin/env node
/**
 * pack_eggs.js —— 把两篇手稿彩蛋的正文从 story.js 挪进 eggs.js（Base64 存放）
 *
 * 用途：公开仓库里不想出现露骨原文的明文，但游戏里要照常能读。
 *      story.js 只留空壳（title / cond / desc），正文在 eggs.js 里，
 *      运行时解码后接回 STORY.extras.<key>.nodes。
 *
 * 只跑一次；跑完 story.js 里的 nodes 已清空，再跑会报错退出。
 * 用法： node scripts/pack_eggs.js
 */
const fs = require("fs");
const vm = require("vm");
const path = require("path");

const GAME = path.join(__dirname, "..", "game");
const STORY_PATH = path.join(GAME, "story.js");
const EGGS_PATH = path.join(GAME, "eggs.js");
const KEYS = ["yanhua", "jujia"];

/* ---------- 1. 求值拿到两篇的节点 ---------- */
const src = fs.readFileSync(STORY_PATH, "utf8");
const ctx = vm.createContext({ console });
vm.runInContext(src + "\nglobalThis.STORY = STORY;", ctx, { filename: "story.js" });
const STORY = ctx.STORY;

const payload = {};
for (const k of KEYS) {
  const ex = STORY.extras && STORY.extras[k];
  if (!ex) throw new Error("找不到 extras." + k);
  if (!ex.nodes || !ex.nodes.length) {
    throw new Error(`extras.${k}.nodes 已经是空的——这篇似乎已经打包过了，不要重复执行`);
  }
  payload[k] = ex.nodes;
  const texts = ex.nodes.filter(n => n.t === "text").length;
  console.log(`  ${k}: ${ex.nodes.length} 个节点 / ${texts} 句`);
}

/* ---------- 2. 找出 nodes: [ ... ] 的字符区间 ---------- */
function findNodesRange(source, key) {
  const keyAt = source.indexOf("\n    " + key + ": {");
  if (keyAt < 0) throw new Error("定位不到 " + key + " 块");
  const arrAt = source.indexOf("nodes: [", keyAt);
  if (arrAt < 0) throw new Error(key + " 里找不到 nodes: [");
  let i = arrAt + "nodes: [".length - 1;      // 指向 '['
  const start = i;
  let depth = 0, quote = null;
  for (; i < source.length; i++) {
    const c = source[i];
    if (quote) {
      if (c === "\\") { i++; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
    if (c === "/" && source[i + 1] === "/") { while (i < source.length && source[i] !== "\n") i++; continue; }
    if (c === "/" && source[i + 1] === "*") { i = source.indexOf("*/", i) + 1; continue; }
    if (c === "[") depth++;
    else if (c === "]") { depth--; if (depth === 0) return { start, end: i + 1 }; }
  }
  throw new Error("括号没闭合：" + key);
}

/* ---------- 3. 写 eggs.js ---------- */
const wrap = s => s.replace(/(.{76})/g, "$1\n").trim();
const body = KEYS.map(k => {
  const b64 = Buffer.from(JSON.stringify(payload[k]), "utf8").toString("base64");
  const lines = wrap(b64).split("\n").map(l => '    "' + l + '"').join(" +\n");
  return `  ${k}: dec(\n${lines}\n  )`;
}).join(",\n");

const eggsJs = `/* ============================================================
   eggs.js —— 两篇手稿彩蛋的正文（Base64 · UTF-8 JSON）
   ------------------------------------------------------------
   正文不放在 story.js 里，是为了让源码文件里不出现明文。
   加载顺序：eggs.js → story.js → engine.js
   story.js 末尾会把解码结果接回 STORY.extras.<key>.nodes。
   改这两篇正文：先还原成普通节点数组，改完再跑 scripts/pack_eggs.js
   ============================================================ */
var EGGS = (function(){
  function dec(b64){
    var bin = atob(b64.replace(/\\s+/g, ""));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return JSON.parse(new TextDecoder("utf-8").decode(bytes));
  }
  return {
${body}
  };
})();
`;
fs.writeFileSync(EGGS_PATH, eggsJs, "utf8");
console.log(`  eggs.js  ${(Buffer.byteLength(eggsJs) / 1024).toFixed(1)} KB`);

/* ---------- 4. 清空 story.js 里的正文 ---------- */
let out = src;
for (const k of KEYS) {
  const { start, end } = findNodesRange(out, k);
  out = out.slice(0, start) + "[]" + out.slice(end);
}

const hook = `
/* ============================================================
   两篇手稿彩蛋的正文在 eggs.js（Base64），这里接回节点树
   ============================================================ */
if (typeof EGGS !== "undefined") {
  for (const _k of ["yanhua", "jujia"]) {
    if (EGGS[_k] && STORY.extras[_k]) STORY.extras[_k].nodes = EGGS[_k];
  }
}
`;
if (!out.includes("eggs.js（Base64）")) out = out.replace(/\s*$/, "\n") + hook;
fs.writeFileSync(STORY_PATH, out, "utf8");

/* ---------- 5. 复验：拼起来还能跑，节点数一致 ---------- */
const ctx2 = vm.createContext({ console, TextDecoder, atob });
vm.runInContext(fs.readFileSync(EGGS_PATH, "utf8") + "\nglobalThis.EGGS = EGGS;", ctx2);
vm.runInContext(fs.readFileSync(STORY_PATH, "utf8") + "\nglobalThis.STORY = STORY;", ctx2);
for (const k of KEYS) {
  const a = payload[k].length, b = ctx2.STORY.extras[k].nodes.length;
  if (a !== b) throw new Error(`${k} 节点数不一致：原 ${a} / 解码后 ${b}`);
  console.log(`  ✓ ${k} 解码一致（${b} 个节点）`);
}
console.log("完成。");
