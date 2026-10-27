/* finale_v11.js —— 重建两条线终章判定表（v0.10）
   新判定顺序：
     1 第5章独走 flag            → BE《野狗的死法》
     2 好感 ≥85 且线索 5         → 隐藏《老万的十年》
     3 好感 ≥high 且执念 ≥40     → 暗结局
     4 好感 ≥high 且线索 ≥heC    → HE《驯刀》
     5 好感 ≥high                → 温和结局
     6 好感 ≥normalF 且执念 ≥burnD → 《烧到自己》/《刀口朝内》（中段但烧穿了）
     7 好感 ≥normalF 且线索 ≥splitC → 普通《各自过冬》
     8 好感 ≥normalF             → 普通《到此为止》/《不了了之》  ← 新
     9 好感 ≥28 且执念 ≥burnD     → 《烧到自己》/《刀口朝内》
    10 好感 ≥28 且执念 ≥coldD     → 疏离结局
    11 其余                      → 《没人在家》/《无人认领》
*/
const fs = require("fs"), vm = require("vm"), path = require("path");
const FILE = path.join(__dirname, "..", "game", "story.js");
let src = fs.readFileSync(FILE, "utf8");
const ctx = { console }; vm.createContext(ctx);
vm.runInContext(src + "\n;globalThis.STORY=STORY;", ctx);
const S = ctx.STORY;

const T = {
  wan:   { high: 72, darkD: 40, heC: 4, normalF: 50, lowF: 28, burnD: 52, coldD: 36, splitC: 4, hiddenF: 85 },
  jiang: { high: 72, darkD: 44, heC: 3, normalF: 50, lowF: 28, burnD: 72, coldD: 46, splitC: 3, hiddenF: 85 }
};

const head = [
  { t: "bg", c: "#07070a" },
  { t: "bgm", key: "stairs_tense" },
  { t: "char", who: null }
];
const L = (txt) => ({ t: "text", cls: "letter", txt });
const Tt = (txt) => ({ t: "text", txt });
const S1 = (sp, txt) => ({ t: "text", sp, txt });
const tail = (a, b) => [L(a), L(b), { t: "end" }];

const wanHalt = [
  ...head,
  L("普通结局 · 《到此为止》"),
  Tt("正月十五，案子没有结。"),
  Tt("你手里的东西够让郑维成难受一阵，不够让他坐进去。律师看完材料，说了一句很客气的话：证据链不闭合。"),
  Tt("你把这句话在心里念了很多遍。不闭合。"),
  Tt("江野问过你一次，还查吗。"),
  Tt("你说查。他说好。"),
  Tt("然后就没有然后了。他回了修车行，你回了书房。你们都没有再提那句话。"),
  Tt("三月，你把所有材料装进一个纸箱，搬到父亲书房柜子的最上层。你没有锁——你只是想让它离你远一点。"),
  Tt("四月，修车行换了个新老板。你去过一次，站在门口看了一眼就走了。新老板问你找谁，你说走错了。"),
  Tt("后来你还是每天走那条后街。九点四十。路灯坏的那一段，你走得快一点。"),
  Tt("你父亲的照片还在书房。你偶尔跟他说两句话，说得很短。"),
  Tt("你不是很想承认，但你确实在等一个不会再响的门铃。"),
  ...tail("案子停在那儿，人也停在那儿。不是谁放弃了，是你们都以为还有明天。", "— 完 —")
];

const jiangHalt = [
  ...head,
  L("普通结局 · 《不了了之》"),
  Tt("阿灿出来了。三十七天。他瘦了一圈，出来第一件事是找你喝酒。"),
  Tt("你去了。喝到一半他问你，郑维成那边怎么办。"),
  Tt("你说，慢慢来。"),
  Tt("阿灿看了你一会儿，把杯子放下，说：行。"),
  Tt("那之后你们都没再提。他修他的车，你打你的零工。日子过得下去。"),
  Tt("三月里某一天，你在报纸中缝看到一条消息：某公司前高管因病退休，公司发了一则很短的公告。"),
  Tt("郑维成。"),
  Tt("你把那张报纸折起来，塞进工具箱最下面。你没有告诉任何人。"),
  Tt("她来过一次。站在修车行门口，问你还在查吗。"),
  Tt("你说在查。她点点头，说好。然后她走了。你们都知道这句话是空的。"),
  Tt("第二年冬天，你把那把刀扔进了江里。扔的时候你站了很久，风很大。"),
  Tt("你没有变成好人。你只是没有变成那个人。"),
  Tt("这两件事，好像都不算数。"),
  ...tail("仇没报，人没留。日子照过。这就是大多数人最后的样子。", "— 完 —")
];

function buildCases(line) {
  const t = T[line];
  const all = S.lines[line].filter(n => n.t === "endcheck").pop().cases;
  const pick = (test, label) => {
    const c = all.find(test);
    if (!c) throw new Error(`${line} 缺少分支: ${label}`);
    return c;
  };
  const flag   = pick(c => c.ifFlag === "hiddenRevenge", "flag");
  const hidden = pick(c => c.ending === "hidden:laowan", "hidden");
  /* 万宁线专属隐藏结局《哥哥的柜子》：比 HE 再多一步（线索满 + 好感 90） */
  const gege   = line === "wan" ? all.find(c => c.ending === "hidden:gege") : null;
  const dark   = pick(c => /:(clean|scar)$/.test(c.ending || ""), "dark");
  const he     = pick(c => /:he$/.test(c.ending || ""), "he");
  const soft   = pick(c => /:(ember|empty)$/.test(c.ending || ""), "soft");
  const normal = pick(c => /:normal$/.test(c.ending || ""), "normal");
  const cold   = pick(c => /:cold$/.test(c.ending || ""), "cold");
  const burn   = pick(c => /:(burn|blade)$/.test(c.ending || ""), "burn");
  const last   = pick(c => c.else, "else");

  const burnId = line === "wan" ? "wan:burn" : "jiang:blade";
  const goneId = line === "wan" ? "wan:gone" : "jiang:nobody";
  const haltId = line === "wan" ? "wan:halt" : "jiang:halt";
  const haltBranch = line === "wan" ? wanHalt : jiangHalt;

  return [
    Object.assign({}, flag,   { ending: line + ":be" }),
    ...(gege ? [{ if: { favorMin: 90, clueMin: 5, dangerMax: 40 }, ending: "hidden:gege", branch: gege.branch }] : []),
    Object.assign({}, hidden, { if: { favorMin: t.hiddenF, clueMin: 5 } }),
    Object.assign({}, dark,   { if: { favorMin: t.high, dangerMin: t.darkD } }),
    Object.assign({}, he,     { if: { favorMin: t.high, clueMin: t.heC } }),
    Object.assign({}, soft,   { if: { favorMin: t.high } }),
    { if: { favorMin: t.normalF, dangerMin: t.burnD }, ending: burnId, branch: burn.branch },
    Object.assign({}, normal, { if: { favorMin: t.normalF, clueMin: t.splitC } }),
    { if: { favorMin: t.normalF }, ending: haltId, branch: haltBranch },
    { if: { favorMin: t.lowF, dangerMin: t.burnD }, ending: burnId, branch: burn.branch },
    Object.assign({}, cold,   { if: { favorMin: t.lowF, dangerMin: t.coldD } }),
    Object.assign({}, last,   { ending: goneId })
  ];
}

/* ---------- 源码输出 ---------- */
function emitNode(n, ind) {
  const p = " ".repeat(ind);
  if (n.t === "text") {
    const parts = ['t: "text"'];
    if (n.sp) parts.push(`sp: ${JSON.stringify(n.sp)}`);
    if (n.cls) parts.push(`cls: ${JSON.stringify(n.cls)}`);
    parts.push(`txt: ${JSON.stringify(n.txt)}`);
    return `${p}{ ${parts.join(", ")} }`;
  }
  if (n.t === "bg")    return `${p}{ t: "bg", c: ${JSON.stringify(n.c)} }`;
  if (n.t === "bgimg") return `${p}{ t: "bgimg", key: ${JSON.stringify(n.key || "")} }`;
  if (n.t === "char")  return `${p}{ t: "char", who: ${n.who === null ? "null" : JSON.stringify(n.who)}${n.pose ? `, pose: ${JSON.stringify(n.pose)}` : ""} }`;
  if (n.t === "bgm")   return n.stop ? `${p}{ t: "bgm", stop: true }` : `${p}{ t: "bgm", key: ${JSON.stringify(n.key)} }`;
  if (n.t === "sfx")   return `${p}{ t: "sfx", key: ${JSON.stringify(n.key)} }`;
  if (n.t === "flag")  return `${p}{ t: "flag", key: ${JSON.stringify(n.key)}, val: ${n.val === undefined ? true : JSON.stringify(n.val)} }`;
  if (n.t === "end")   return `${p}{ t: "end" }`;
  if (n.t === "choice" || n.t === "endcheck") throw new Error("终章分支里不该再嵌套选择/判定");
  throw new Error("未知节点类型: " + n.t);
}
function emitIf(x) {
  const order = ["favorMin", "favorMax", "dangerMin", "dangerMax", "clueMin", "clueMax"];
  return `{ ${order.filter(k => x[k] !== undefined).map(k => `${k}: ${x[k]}`).join(", ")} }`;
}
function emitCases(cases) {
  const out = [`      { t: "endcheck", cases: [`];
  cases.forEach((c, i) => {
    let headLine;
    if (c.ifFlag) headLine = `        { ifFlag: ${JSON.stringify(c.ifFlag)}, ending: ${JSON.stringify(c.ending)}, branch: [`;
    else if (c.else) headLine = `        { else: true, ending: ${JSON.stringify(c.ending)}, branch: [`;
    else headLine = `        { if: ${emitIf(c.if)}, ending: ${JSON.stringify(c.ending)}, branch: [`;
    out.push(headLine);
    out.push((c.branch || []).map(n => emitNode(n, 10)).join(",\n"));
    out.push(i === cases.length - 1 ? `        ]}` : `        ]},`);
  });
  out.push(`      ]`);
  return out.join("\n");
}

/* ---------- 定位两条线终章 endcheck ---------- */
const MARK = `      { t: "endcheck", cases: [`;
const FINALE = `§ 正月初五 · 终章 §`;
const marks = [];
let at = -1;
while ((at = src.indexOf(FINALE, at + 1)) !== -1) marks.push(at);
if (marks.length !== 2) throw new Error("终章标记数量异常: " + marks.length);
const positions = marks.map(m => {
  const p = src.indexOf(MARK, m);
  if (p < 0) throw new Error("终章之后没找到 endcheck");
  return p;
});
function spanEnd(start) {
  let i = src.indexOf("[", start), depth = 0, inStr = false, quote = "";
  for (; i < src.length; i++) {
    const ch = src[i];
    if (inStr) { if (ch === "\\") { i++; continue; } if (ch === quote) inStr = false; continue; }
    if (ch === '"' || ch === "'" || ch === "`") { inStr = true; quote = ch; continue; }
    if (ch === "[") depth++;
    else if (ch === "]") { depth--; if (depth === 0) return i + 1; }
  }
  throw new Error("括号没配平");
}

const wanStart = positions[0], wanEnd = spanEnd(wanStart);
const jiangStart = positions[1], jiangEnd = spanEnd(jiangStart);
const wanText = emitCases(buildCases("wan"));
const jiangText = emitCases(buildCases("jiang"));

src = src.slice(0, jiangStart) + jiangText + src.slice(jiangEnd);
src = src.slice(0, wanStart) + wanText + src.slice(wanEnd);
fs.writeFileSync(FILE, src, "utf8");

/* ---------- 复核 ---------- */
const ctx2 = { console }; vm.createContext(ctx2);
vm.runInContext(fs.readFileSync(FILE, "utf8") + "\n;globalThis.STORY=STORY;", ctx2);
for (const L2 of ["wan", "jiang"]) {
  const c = ctx2.STORY.lines[L2].filter(n => n.t === "endcheck").pop().cases;
  console.log(`\n${L2}: ${c.length} 个分支`);
  c.forEach(x => console.log("   ", (x.ending || "").padEnd(16), x.if ? JSON.stringify(x.if) : x.ifFlag ? "flag" : "else", "|", (x.branch || []).length, "节点"));
}
