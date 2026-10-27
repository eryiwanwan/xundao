/* rescale_favor.js —— 把每条线的好感数值等比缩回 100 分制
   背景：v0.10 加了 4 个中期选择点，好感上限从 100 涨到 127 / 121，
        显示条一直是满的，阈值 80/55/30 的相对含义也被稀释。
   做法：按行分区（quiz.wan / quiz.jiang / lines.wan / lines.jiang），
        区内所有 favor: N 乘以 100/该区上限，四舍五入，正负保号不为 0。
*/
const fs = require("fs"), vm = require("vm"), path = require("path");
const FILE = path.join(__dirname, "..", "game", "story.js");
let src = fs.readFileSync(FILE, "utf8");

/* ---------- 括号扫描 ---------- */
function matchBrace(s, start, open = "{", close = "}") {
  let i = s.indexOf(open, start), depth = 0, inStr = false, q = "";
  for (; i < s.length; i++) {
    const ch = s[i];
    if (inStr) { if (ch === "\\") { i++; continue; } if (ch === q) inStr = false; continue; }
    if (ch === '"' || ch === "'" || ch === "`") { inStr = true; q = ch; continue; }
    if (ch === open) depth++;
    else if (ch === close) { depth--; if (depth === 0) return i; }
  }
  throw new Error("没配平");
}

/* 找到顶层 key 的块 [start,end] */
function blockOf(key) {
  const at = src.indexOf("\n  " + key + ": {");
  if (at < 0) throw new Error("找不到块: " + key);
  return { start: at, end: matchBrace(src, at) };
}

/* 在块内按 wan / jiang 切分（值为数组） */
function lineRanges(block, line) {
  const head = "\n    " + line + ": [";
  const at = src.indexOf(head, block.start);
  if (at < 0 || at > block.end) throw new Error("块内找不到 " + line);
  const end = matchBrace(src, at, "[", "]");
  return [at, end];
}

/* ---------- 统计上限 ---------- */
const ctx = { console }; vm.createContext(ctx);
vm.runInContext(src + "\n;globalThis.STORY = STORY;", ctx);
const S = ctx.STORY;

function capOf(line) {
  const qMax = S.quiz[line].reduce((a, q) => a + Math.max(...q.opts.map(o => o.favor || 0)), 0);
  const cMax = S.lines[line].filter(n => n.t === "choice")
    .reduce((a, n) => a + Math.max(...n.opts.map(o => o.favor || 0)), 0);
  return { total: qMax + cMax, qMax, cMax };
}

const quizBlock = blockOf("quiz");
const linesBlock = blockOf("lines");

const jobs = [];
for (const line of ["wan", "jiang"]) {
  const cap = capOf(line);
  const factor = 100 / cap.total;
  jobs.push({ line, where: "quiz",  range: lineRanges(quizBlock, line),  factor });
  jobs.push({ line, where: "lines", range: lineRanges(linesBlock, line), factor });
  console.log(`${line}: 好感上限 ${cap.total}（问卷 ${cap.qMax} + 选择 ${cap.cMax}）→ 缩放 ×${factor.toFixed(4)}`);
}

/* ---------- 从右往左替换，避免位移 ---------- */
jobs.sort((a, b) => b.range[0] - a.range[0]);

for (const job of jobs) {
  const [a, b] = job.range;
  const seg = src.slice(a, b);
  let changed = 0;
  const out = seg.replace(/favor:\s*(-?\d+(?:\.\d+)?)/g, (m, num) => {
    const v = parseFloat(num);
    if (!v) return m;
    let n = Math.round(v * job.factor);
    if (n === 0) n = v > 0 ? 1 : -1;
    changed++;
    return "favor: " + n;
  });
  src = src.slice(0, a) + out + src.slice(b);
  console.log(`  ${job.line}/${job.where}: 改了 ${changed} 个 favor`);
}

fs.writeFileSync(FILE, src, "utf8");

/* ---------- 复核 ---------- */
const ctx2 = { console }; vm.createContext(ctx2);
vm.runInContext(fs.readFileSync(FILE, "utf8") + "\n;globalThis.STORY = STORY;", ctx2);
const S2 = ctx2.STORY;
for (const line of ["wan", "jiang"]) {
  const qMax = S2.quiz[line].reduce((a, q) => a + Math.max(...q.opts.map(o => o.favor || 0)), 0);
  const cMax = S2.lines[line].filter(n => n.t === "choice")
    .reduce((a, n) => a + Math.max(...n.opts.map(o => o.favor || 0)), 0);
  const zeros = [];
  S2.lines[line].forEach(n => { if (n.t === "choice") n.opts.forEach(o => { if (o.favor === 0) zeros.push(o.label); }); });
  console.log(`${line}: 新上限 ${qMax + cMax} | favor=0 的选项 ${zeros.length}`);
  if (zeros.length) console.log("  ", zeros.join(" / "));
}
