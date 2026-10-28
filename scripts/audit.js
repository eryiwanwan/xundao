/* ============================================================
   audit.js —— 全文一致性审计（v0.15 新增）
   三块：
     A 称号 × 结局 × 番外：条件是否有引擎实现、描述里的书名是否真实存在、
       有没有哪个结局一个称号都不给
     B 资源：正文引用的 bgimg / char / bgm / sfx 是否在 assets 里、文件是否真在
     C 文本：跨节点重复长句、时间线 § 标记顺序、选项缺字段
   用法：node scripts/audit.js
   ============================================================ */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const eggs = fs.readFileSync(path.join(ROOT, "game/eggs.js"), "utf8");
const EGGS = (0, eval)("(function(){" + eggs + ";return EGGS;})()");
const src = fs.readFileSync(path.join(ROOT, "game/story.js"), "utf8");
const ctx = { console }; vm.createContext(ctx);
vm.runInContext("var EGGS=" + JSON.stringify(EGGS) + ";" + src + "\n;globalThis.STORY=STORY;", ctx);
const S = ctx.STORY;

let bad = 0;
const say = (ok, msg) => { console.log(` ${ok ? "✓" : "✗"} ${msg}`); if (!ok) bad++; };
const note = (msg) => console.log(`   · ${msg}`);

/* ---------------- 收集正文 ---------------- */
function walk(nodes, cb, line) {
  for (const n of nodes || []) {
    if (!n || typeof n !== "object") continue;
    cb(n, line);
    if (n.opts) for (const o of n.opts) walk(o.branch, cb, line);
    if (n.cases) for (const c of n.cases) walk(c.branch, cb, line);
    if (n.map) for (const k of Object.keys(n.map)) walk(n.map[k], cb, line);
  }
}

const nodes = [];
walk(S.lines.wan, (n) => nodes.push({ ...n, __line: "wan" }));
walk(S.lines.jiang, (n) => nodes.push({ ...n, __line: "jiang" }));

/* ============================================================
   A. 称号
   ============================================================ */
console.log("=== A. 称号 / 结局 / 番外 ===");
const endIds = Object.keys(S.endings);
const endNames = endIds.map(id => S.endings[id].name);
const titleConds = new Set(S.titles.map(t => t.cond));
const engineSrc = fs.readFileSync(path.join(ROOT, "game/engine.js"), "utf8");
const condCases = new Set([...engineSrc.matchAll(/case "([A-Za-z0-9_]+)":/g)].map(m => m[1]));
const extraConds = new Set(Object.values(S.extras).map(e => e.cond));

const missingImpl = [...titleConds].filter(c => !condCases.has(c));
say(missingImpl.length === 0, `称号条件都有引擎实现${missingImpl.length ? "（缺：" + missingImpl.join(", ") + "）" : ""}`);
const extraMissing = [...extraConds].filter(c => !condCases.has(c));
say(extraMissing.length === 0, `番外条件都有引擎实现${extraMissing.length ? "（缺：" + extraMissing.join(", ") + "）" : ""}`);

/* 描述里提到的《书名》必须真实存在（称号 / 结局 / 番外 / 彩蛋） */
const knownBooks = new Set([
  ...endNames.map(n => (n.match(/《([^》]+)》/) || [])[1]).filter(Boolean),
  ...Object.values(S.extras).map(e => e.title),
  ...S.titles.map(t => t.name)
]);
const bookRefs = [];
for (const t of S.titles) {
  for (const m of (t.desc || "").matchAll(/《([^》]+)》/g)) bookRefs.push([`称号「${t.name}」`, m[1]]);
}
for (const id of endIds) {
  for (const m of ((S.endings[id].desc || "") + (S.endings[id].brief || "")).matchAll(/《([^》]+)》/g))
    bookRefs.push([`结局 ${id}`, m[1]]);
}
const ghost = bookRefs.filter(([, name]) => !knownBooks.has(name));
say(ghost.length === 0, `称号/结局描述里引用的书名都存在${ghost.length ? "（幽灵引用：" + ghost.map(([a, b]) => a + "→《" + b + "》").join("；") + "）" : ""}`);

/* 每个结局至少有一个称号指向它（或由「全结局」类兜底） */
const condToEnd = {
  wanEmber: "wan:ember", wanClean: "wan:clean", jiangScar: "jiang:scar", jiangEmpty: "jiang:empty",
  wanBurn: "wan:burn", wanGone: "wan:gone", jiangBlade: "jiang:blade", jiangNobody: "jiang:nobody",
  wanHalt: "wan:halt", jiangHalt: "jiang:halt", gege: "hidden:gege",
  wanHE: "wan:he", jiangHE: "jiang:he",
  wanClear: "wan:clear", jiangClear: "jiang:clear",
  wanLost: "wan:lost", wanFall: "wan:fall", jiangFang: "jiang:fang", jiangGou: "jiang:gou",
  wanLost2: "wan:lost2", jiangLost2: "jiang:lost2",
  laowan: "hidden:laowan", platformEnd: "hidden:platform"
};
const covered = new Set(Object.values(condToEnd));
const uncovered = endIds.filter(id => !covered.has(id));
note(`没有专属称号、靠通用称号兜底的结局 ${uncovered.length} 个：${uncovered.join(", ") || "无"}`);

/* 称号数量 = 结局数 + 通用项，粗略校验有没有漏 */
note(`结局 ${endIds.length} 个 / 番外 ${Object.keys(S.extras).length} 篇 / 称号 ${S.titles.length} 个`);

/* 描述里出现「二十个结局」这类数字，必须和真实数量一致 */
const numWord = { "二十": 20, "二十一": 21, "二十二": 22 };
for (const t of S.titles) {
  for (const [w, v] of Object.entries(numWord)) {
    if ((t.desc || "").includes(w + "个结局")) say(v === endIds.length, `称号「${t.name}」写的${w}个结局与实际 ${endIds.length} 个一致`);
  }
}

/* ============================================================
   B. 资源
   ============================================================ */
console.log("\n=== B. 资源引用 ===");
const A = S.assets || {};
for (const kind of ["bgimg", "char", "bgm", "sfx"]) {
  const used = new Set();
  walk(S.lines.wan, n => { if (n.t === kind && n.key) used.add(n.key); });
  walk(S.lines.jiang, n => { if (n.t === kind && n.key) used.add(n.key); });
  for (const e of Object.values(S.extras)) walk(e.nodes, n => { if (n.t === kind && n.key) used.add(n.key); });
  for (const n of nodes) if (n.t === kind && n.key) used.add(n.key);
  const table = kind === "char" ? null : (A[kind === "bgimg" ? "bg" : kind] || {});
  if (kind === "char") {
    const who = new Set();
    const check = (arr) => arr.forEach(n => { if (n.t === "char" && n.who) who.add(n.who); });
    check(nodes); for (const e of Object.values(S.extras)) check(e.nodes);
    for (const w of who) say(!!(A.char || {})[w], `立绘角色 ${w} 在 assets.char 里`);
    for (const w of Object.keys(A.char || {})) {
      for (const [pose, p] of Object.entries(A.char[w])) {
        const f = path.join(ROOT, "game", p);
        say(fs.existsSync(f), `立绘文件存在：${w}/${pose}`);
      }
    }
    const missingGallery = Object.keys(A.char || {}).flatMap(w => Object.keys(A.char[w]).map(p => w + ":" + p))
      .filter(k => { const [w, p] = k.split(":"); return !((S.gallery.char || {})[w] || {})[p]; });
    say(missingGallery.length === 0, `立绘都进了图鉴${missingGallery.length ? "（缺：" + missingGallery.join(", ") + "）" : ""}`);
    continue;
  }
  for (const k of used) {
    if (kind === "bgimg") {
      const has = !!table[k];
      say(has, `背景 ${k} 在 assets.bg 里`);
      if (has) say(fs.existsSync(path.join(ROOT, "game", table[k])), `背景文件存在：${k}`);
      say(!!((S.gallery.bg || {})[k]), `背景 ${k} 进了图鉴`);
    } else {
      say(!!table[k], `${kind} ${k} 在 assets.${kind} 里`);
    }
  }
}

/* ============================================================
   C. 文本
   ============================================================ */
console.log("\n=== C. 文本 ===");
/* 重复长句：同一句话（≥14 字）在正文里出现两次以上 */
const seenText = new Map();
const seenObj = new Set();
const dups = [];
for (const line of ["wan", "jiang"]) {
  walk(S.lines[line], (n) => {
    if (n.t !== "text" || (n.txt || "").length < 14) return;
    if (seenObj.has(n)) return;            // 同一条分支被多个结局复用，只算一次
    seenObj.add(n);
    const k = n.txt;
    if (seenText.has(k)) dups.push([k, seenText.get(k), line]);
    else seenText.set(k, line);
  });
}
/* 两条线讲的是同一段故事的两个视角，同一句台词在两边出现是设定，不是撞车；
   BE 分支被两个判定档位共用，源码里也是两份。所以这里只报数，不算问题。 */
const crossLine = dups.filter(([, a, b]) => a !== b);
const sameLine = dups.length - crossLine.length;
note(`重复长句（≥14 字）：同线 ${sameLine} 处（BE 两档共用）｜跨线 ${crossLine.length} 处（双视角重述同一场景）`);
crossLine.slice(0, 3).forEach(([t, a, b]) => note(`  例：${a}→${b}: ${t.slice(0, 26)}…`));
/* 双档共用会产生 2 次；同一句在同一条线里出现 3 次以上，就是复制粘贴没改干净 */
const freq = new Map();
for (const [t, , b] of dups) freq.set(b + "|" + t, (freq.get(b + "|" + t) || 1) + 1);
const thrice = [...freq.entries()].filter(([, c]) => c >= 3);
say(thrice.length === 0, `没有同一句被复用 3 次以上${thrice.length ? "：" + thrice.slice(0, 3).map(([k]) => k.split("|")[0] + " " + k.split("|")[1].slice(0, 18)).join(" / ") : ""}`);

/* 选项字段完整性（flavor 无伤选择故意没有 favor；带 ending 的暗门选项直接跳结局、也不计 favor） */
let optBad = 0;
walk(S.lines.wan, n => { if (n.t === "choice") n.opts.forEach(o => { if (!o.ending && (!o.branch || !o.branch.length || typeof o.favor !== "number")) optBad++; }); });
walk(S.lines.jiang, n => { if (n.t === "choice") n.opts.forEach(o => { if (!o.ending && (!o.branch || !o.branch.length || typeof o.favor !== "number")) optBad++; }); });
say(optBad === 0, `所有选项都有 favor 与 branch${optBad ? "（异常 " + optBad + " 个）" : ""}`);

/* 时间线：§ 标记按出现顺序列出，人工看有没有倒流 */
for (const line of ["wan", "jiang"]) {
  const marks = [];
  walk(S.lines[line], n => { if (n.t === "text" && n.cls === "letter" && /^§.*§$/.test((n.txt || "").trim())) marks.push(n.txt.trim()); });
  console.log(`\n[${line}] 时间线标记 ${marks.length} 个：`);
  console.log("   " + marks.join(" → "));
}

/* 人称：第二人称线里，旁白用「他/她」指代主角的嫌疑句（人工抽查用） */
for (const line of ["wan", "jiang"]) {
  const self = line === "wan" ? "她" : "他";
  const susp = [];
  walk(S.lines[line], (n) => {
    if (n.t !== "text" || n.sp) return;
    if (n.txt.includes("你" + self) ) susp.push(n.txt);
  });
  console.log(`\n[${line}] 旁白里「你${self}」这种可能串视角的句子：${susp.length} 处`);
  susp.slice(0, 5).forEach(t => note(t.slice(0, 40)));
}

console.log(`\n${bad === 0 ? "审计通过 ✓" : "审计发现 " + bad + " 项问题 ✗"}`);
