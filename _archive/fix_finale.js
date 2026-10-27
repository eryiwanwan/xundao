/* fix_finale.js —— 修 0.9 迁移时被切片脚本弄重的结局判定表
   做法：从 story.js 解析出两条线的最后一个 endcheck，去重、补齐、按设计顺序重排，
   再把这两处 cases 数组原地重写成源码文本。跑一次即可。
*/
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const FILE = path.join(__dirname, "..", "game", "story.js");

const ctx = { console }; vm.createContext(ctx);
let src = fs.readFileSync(FILE, "utf8");
vm.runInContext(src + "\n;globalThis.STORY = STORY;", ctx);
const S = ctx.STORY;

/* ---------- 两种「执念烧穿」的 BE 分支（视角不同，各写一份） ---------- */
function dangerBe(line) {
  if (line === "wan") {
    return [
      { t: "bg", c: "#07070a" },
      { t: "bgm", key: "stairs_tense" },
      { t: "char", who: null },
      { t: "text", cls: "letter", txt: "BE · 《野狗的死法》" },
      { t: "text", txt: "你没拦住他。他早就查到了那两个旧部的落脚点，只是一直没告诉你。" },
      { t: "text", txt: "正月十四，他一个人去了。你收到消息赶到的时候，天台上已经打完了。" },
      { t: "text", txt: "他还有一口气。他攥着你的手，攥得很紧。" },
      { t: "text", sp: "江野", txt: "我本来……想跟你一起过年的。" },
      { t: "text", txt: "那是他最后一句话。救护车到的时候，他没撑到。" },
      { t: "text", txt: "你父亲救了他半生。你没能把他救回来。" },
      { t: "text", cls: "letter", txt: "这个冬天，比任何一个冬天，都冷。" },
      { t: "text", cls: "letter", txt: "— 完 —" },
      { t: "end" }
    ];
  }
  return [
    { t: "bg", c: "#07070a" },
    { t: "bgm", key: "stairs_tense" },
    { t: "char", who: null },
    { t: "text", cls: "letter", txt: "BE · 《野狗的死法》" },
    { t: "text", txt: "你还是没忍住。你早就查到了那两个旧部的落脚点，你只是没告诉她。" },
    { t: "text", txt: "正月十四，你一个人去了。你站在天台上。楼下是他们两个人。" },
    { t: "text", txt: "她赶到的时候，你已经动过手了。救护车来得很慢。" },
    { t: "text", txt: "你还有一口气。你把她的手攥了一下。" },
    { t: "text", sp: "江野", txt: "我本来……想跟你一起过年的。" },
    { t: "text", txt: "这句话，是你留给她的最后一句。" },
    { t: "text", cls: "letter", txt: "这个冬天，比任何一个冬天，都冷。" },
    { t: "text", cls: "letter", txt: "— 完 —" },
    { t: "end" }
  ];
}

/* ---------- 从现有 cases 里挑出需要的分支 ---------- */
function buildCases(line) {
  const all = S.lines[line].filter(n => n.t === "endcheck").pop().cases;
  const pick = (test) => all.find(test);

  const flag   = pick(c => c.ifFlag === "hiddenRevenge");
  const hidden = pick(c => c.ending && c.ending.includes("hidden:laowan"));
  const dark   = pick(c => c.ending && c.ending.includes("clean")) || pick(c => c.ending && c.ending.includes("scar"));
  const he     = pick(c => c.ending && c.ending.endsWith(":he"));
  const soft   = pick(c => c.ending && (c.ending.includes("ember") || c.ending.includes("empty")));
  const normal = pick(c => c.ending && c.ending.includes("normal"));
  const cold   = pick(c => c.ending && c.ending.includes("cold"));
  const last   = pick(c => c.else);

  const need = { flag, hidden, dark, he, soft, normal, cold, last };
  for (const k of Object.keys(need)) if (!need[k]) throw new Error(`${line} 缺少分支: ${k}`);

  return [
    Object.assign({}, flag, { ending: "be" }),
    { if: { dangerMin: 85 }, ending: "be", branch: dangerBe(line) },
    Object.assign({}, hidden, { if: { favorMin: 85, clueMin: 5 } }),
    Object.assign({}, dark,   { if: { favorMin: 80, dangerMin: 45 } }),
    Object.assign({}, he,     { if: { favorMin: 80, clueMin: 4 } }),
    Object.assign({}, soft,   { if: { favorMin: 80 } }),
    Object.assign({}, normal, { if: { favorMin: 55 } }),
    Object.assign({}, cold,   { if: { favorMin: 30 } }),
    Object.assign({}, last,   { ending: line + ":be" })
  ];
}

/* ---------- 源码输出 ---------- */
function emitNode(n, ind) {
  const p = " ".repeat(ind);
  if (n.t === "text") {
    const parts = ['t: "text"'];
    if (n.sp)  parts.push(`sp: ${JSON.stringify(n.sp)}`);
    if (n.cls) parts.push(`cls: ${JSON.stringify(n.cls)}`);
    parts.push(`txt: ${JSON.stringify(n.txt)}`);
    return `${p}{ ${parts.join(", ")} }`;
  }
  if (n.t === "bg")    return `${p}{ t: "bg", c: ${JSON.stringify(n.c)} }`;
  if (n.t === "bgimg") return `${p}{ t: "bgimg", key: ${JSON.stringify(n.key||"")} }`;
  if (n.t === "char")  return `${p}{ t: "char", who: ${n.who===null?"null":JSON.stringify(n.who)}${n.pose?`, pose: ${JSON.stringify(n.pose)}`:""} }`;
  if (n.t === "bgm")   return n.stop ? `${p}{ t: "bgm", stop: true }` : `${p}{ t: "bgm", key: ${JSON.stringify(n.key)} }`;
  if (n.t === "sfx")   return `${p}{ t: "sfx", key: ${JSON.stringify(n.key)} }`;
  if (n.t === "flag")  return `${p}{ t: "flag", key: ${JSON.stringify(n.key)}, val: ${n.val===undefined?true:JSON.stringify(n.val)} }`;
  if (n.t === "end")   return `${p}{ t: "end" }`;
  throw new Error("未知节点类型: " + n.t);
}
function emitIf(x) {
  const order = ["favorMin","favorMax","dangerMin","dangerMax","clueMin","clueMax"];
  const parts = order.filter(k => x[k] !== undefined).map(k => `${k}: ${x[k]}`);
  return `{ ${parts.join(", ")} }`;
}
function emitCases(cases, comment) {
  const out = [];
  out.push(`      { t: "endcheck", cases: [`);
  cases.forEach((c, i) => {
    let head;
    if (c.ifFlag) head = `        { ifFlag: ${JSON.stringify(c.ifFlag)}, ending: ${JSON.stringify(c.ending)}, branch: [`;
    else if (c.else) head = `        { else: true, ending: ${JSON.stringify(c.ending)}, branch: [`;
    else head = `        { if: ${emitIf(c.if)}, ending: ${JSON.stringify(c.ending)}, branch: [`;
    out.push(head);
    out.push((c.branch || []).map(n => emitNode(n, 10)).join(",\n"));
    out.push(i === cases.length - 1 ? `        ]}` : `        ]},`);
  });
  out.push(`      ]`);       // 外层的 } 和逗号留在原文件里，不重复写
  return out.join("\n");
}

/* ---------- 定位并替换最后两个 endcheck ---------- */
const MARK = `      { t: "endcheck", cases: [`;
const FINALE = `§ 正月初五 · 终章 §`;      // 两条线各有一次，终章判定就紧跟在这段之后
const marks = [];
let at = -1;
while ((at = src.indexOf(FINALE, at + 1)) !== -1) marks.push(at);
if (marks.length !== 2) throw new Error("终章标记数量异常: " + marks.length);
const positions = marks.map(m => {
  const p = src.indexOf(MARK, m);
  if (p < 0) throw new Error("终章之后没找到 endcheck");
  return p;
});

/* 从 positions[i] 起找到与之配对的 "]}（跳过字符串里的括号） */
function spanEnd(start) {
  let i = src.indexOf("[", start);
  let depth = 0, inStr = false, quote = "";
  for (; i < src.length; i++) {
    const ch = src[i];
    if (inStr) {
      if (ch === "\\") { i++; continue; }
      if (ch === quote) inStr = false;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") { inStr = true; quote = ch; continue; }
    if (ch === "[") depth++;
    else if (ch === "]") { depth--; if (depth === 0) return i + 1; }
  }
  throw new Error("括号没配平");
}

const wanStart = positions[positions.length - 2];
const wanEnd = spanEnd(wanStart);
const jiangStart = positions[positions.length - 1];
const jiangEnd = spanEnd(jiangStart);

const wanText = emitCases(buildCases("wan"));
const jiangText = emitCases(buildCases("jiang"));

// 从后往前替换，避免偏移失效
src = src.slice(0, jiangStart) + jiangText + src.slice(jiangEnd);
src = src.slice(0, wanStart) + wanText + src.slice(wanEnd);

fs.writeFileSync(FILE, src, "utf8");

/* ---------- 复核 ---------- */
const ctx2 = { console }; vm.createContext(ctx2);
vm.runInContext(fs.readFileSync(FILE, "utf8") + "\n;globalThis.STORY = STORY;", ctx2);
for (const L of ["wan", "jiang"]) {
  const c = ctx2.STORY.lines[L].filter(n => n.t === "endcheck").pop().cases;
  console.log(`${L}: ${c.length} 个分支 →`, c.map(x => x.ending + (x.if ? JSON.stringify(x.if) : x.ifFlag ? " flag" : " else")).join(" | "));
}
