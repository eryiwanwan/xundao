/* ============================================================
   分章体检：每章的体量 / 选择点 / 主干与分支比例
   ------------------------------------------------------------
   做法：给 story.js 的每个节点注入 __ln（源码行号），再用章注释的
   行号划区间，于是每个节点都能准确归属到某一章——包括嵌在
   choice.opts.branch 里、qvar.map 里的节点。

   用法：node scripts/outline.js
   ============================================================ */
const fs = require("fs"), vm = require("vm"), path = require("path");
const GAME = path.join(process.cwd(), "game");
const SRC = fs.readFileSync(path.join(GAME, "story.js"), "utf8");

/* ---------- 注入行号 ---------- */
const patched = SRC.split("\n").map((ln, i) =>
  ln.replace(/\{ t:(\s*)"/g, (m, sp) => `{ __ln: ${i + 1}, t:${sp}"`)
).join("\n");

const ctx = { console };
vm.createContext(ctx);
vm.runInContext(patched + "\n;globalThis.STORY=STORY;", ctx);
const S = ctx.STORY;

const cn = s => String(s).replace(/\s/g, "").length;
const LINES = ["wan", "jiang"];
const LINE_CN = { wan: "万宁线", jiang: "江野线" };

/* ---------- 章表：从源码注释抓 ---------- */
/* 章注释有两种写法，线名可能在章名前也可能在后：
      /* ---------- 万宁线 · 第1章《楼道里的刀》 ---------- *\/
      /* ============ 第2章《尾随者》· 万宁线 ============ *\/
   所以先看整行属于哪条线，再单独取章号与章名。 */
const marks = [];
SRC.split("\n").forEach((ln, i) => {
  if (!/\/\*/.test(ln)) return;                       // 只认块注释行
  const who = ln.includes("江野线") ? "jiang" : ln.includes("万宁线") ? "wan" : null;
  if (!who) return;
  const m = ln.match(/第(\d)章《([^》]+)》/);
  if (!m) return;
  marks.push({ ln: i + 1, line: who, no: +m[1], name: m[2] });
});
marks.sort((a, b) => a.ln - b.ln);

/* 每条线的章区间 */
const chapters = { wan: [], jiang: [] };
for (const line of LINES) {
  const own = marks.filter(m => m.line === line);
  own.forEach((m, i) => {
    const end = i + 1 < own.length ? own[i + 1].ln : Infinity;
    chapters[line].push({ no: m.no, name: m.name, from: m.ln, to: end });
  });
}

/* ---------- 收集每条线的全部节点（含嵌套分支） ---------- */
function flatten(arr, out){
  for (const n of arr){
    if (!n || typeof n !== "object") continue;
    out.push(n);
    if (n.t === "choice") for (const o of (n.opts || [])) if (o.branch) flatten(o.branch, out);
    if (n.t === "flavor") for (const o of (n.opts || [])) if (o.branch) flatten(o.branch, out);
    if (n.t === "endcheck") for (const c of (n.cases || [])) if (c.branch) flatten(c.branch, out);
    if (n.t === "qvar") for (const k of Object.keys(n.map || {})) flatten(n.map[k], out);
    if (n.t === "vary") for (const k of Object.keys(n.map || {})) flatten(n.map[k], out);
  }
  return out;
}

/* ---------- 判定（与 engine.caseMet 一致） ---------- */
function caseMet(c, st){
  const f = st.favor, d = st.danger, cu = st.clue, fl = st.flags;
  if (c.ifFlag){
    const want = (c.flagVal === undefined ? true : c.flagVal);
    if ((!!fl[c.ifFlag]) !== want) return false;
    if (!c.if) return true;
  }
  if (c.else) return true;
  if (c.if){
    const x = c.if;
    if (x.favorMin  !== undefined && f  < x.favorMin)  return false;
    if (x.favorMax  !== undefined && f  > x.favorMax)  return false;
    if (x.dangerMin !== undefined && d  < x.dangerMin) return false;
    if (x.dangerMax !== undefined && d  > x.dangerMax) return false;
    if (x.clueMin   !== undefined && cu < x.clueMin)   return false;
    if (x.clueMax   !== undefined && cu > x.clueMax)   return false;
    return true;
  }
  if (c.min !== undefined) return f >= c.min;
  return false;
}

/* ---------- 主干走读（全取第 1 个选项，记每段的章归属） ---------- */
function trunk(line){
  const st = { favor: 0, danger: 20, clue: 0, flags: {}, profile: {} };
  (S.quiz[line] || []).forEach(q => {
    const o = q.opts[0];
    st.profile[q.id] = "A";
    st.favor += o.favor || 0; st.danger += o.danger || 0; st.clue += o.clue || 0;
  });
  const q = S.lines[line].slice();
  const seg = [];       // {ln, words} / {ln, choice}
  let i = 0, guard = 0;
  while (i < q.length && guard++ < 20000){
    const n = q[i];
    if (n.t === "text"){ seg.push({ ln: n.__ln, words: cn(n.txt) }); i++; continue; }
    if (n.t === "qvar"){
      const v = (n.map && n.map[st.profile[n.by]]) || [];
      q.splice(i, 1, ...v); continue;
    }
    if (n.t === "vary"){
      const v = st[n.by] || 0; const c = n.cuts || []; let bi = 0;
      while (bi < c.length && v >= c[bi]) bi++;
      q.splice(i, 1, ...((n.map && n.map[bi]) || [])); continue;
    }
    if (n.t === "flag"){ st.flags[n.key] = (n.val === undefined ? true : n.val); i++; continue; }
    if (n.t === "flavor"){
      const o = n.opts[0];
      if (o.branch) q.splice(i + 1, 0, ...o.branch);
      i++; continue;
    }
    if (n.t === "choice"){
      const o = n.opts[0];
      st.favor += o.favor || 0; st.danger += o.danger || 0; st.clue += o.clue || 0;
      if (o.branch) q.splice(i + 1, 0, ...o.branch);
      seg.push({ ln: n.__ln, choice: true });
      i++; continue;
    }
    if (n.t === "endcheck"){
      const hit = (n.cases || []).find(c => caseMet(c, st));
      q.splice(i, 1, ...((hit && hit.branch) || []));
      continue;
    }
    if (n.t === "end") break;
    i++;
  }
  return seg;
}

const chapOf = (line, ln) => {
  const cs = chapters[line];
  for (let i = 0; i < cs.length; i++) if (ln >= cs[i].from && ln < cs[i].to) return cs[i];
  return cs[cs.length - 1];
};

/* ---------- 汇总 ---------- */
const report = {};
for (const line of LINES){
  const all = flatten(S.lines[line], []);
  const cs = chapters[line].map(c => ({ ...c, sentences: 0, words: 0,
    choiceNodes: [], bgScenes: new Set(), trunkWords: 0, trunkSent: 0, trunkChoices: 0 }));

  for (const n of all){
    const c = cs.find(x => n.__ln >= x.from && n.__ln < x.to) || cs[cs.length - 1];
    if (!c) continue;
    if (n.t === "text" && n.txt){ c.sentences++; c.words += cn(n.txt); }
    if (n.t === "choice") c.choiceNodes.push(n);
    if (n.t === "bgimg" && n.key) c.bgScenes.add(n.key);
  }
  for (const s of trunk(line)){
    const c = chapOf(line, s.ln);
    const cc = cs.find(x => x.no === c.no);
    if (!cc) continue;
    if (s.choice) cc.trunkChoices++;
    else { cc.trunkWords += s.words; cc.trunkSent++; }
  }
  report[line] = cs;
}

/* ---------- 打印 ---------- */
for (const line of LINES){
  const cs = report[line];
  const totalW = cs.reduce((a, c) => a + c.words, 0);
  const totalTrunk = cs.reduce((a, c) => a + c.trunkWords, 0);
  console.log(`\n${"=".repeat(78)}`);
  console.log(`${LINE_CN[line]}｜${cs.length} 章｜全部分支 ${totalW} 字｜主干 ${totalTrunk} 字`);
  console.log("=".repeat(78));
  console.log("  章  标题                    场景  选择点   主干字   分支字   章总字  占全线  决策间隔");
  let i = 0;
  for (const c of cs){
    i++;
    const branchW = c.words - c.trunkWords;
    const pct = (c.words / totalW * 100).toFixed(1) + "%";
    const nch = c.choiceNodes.length;
    const gap = nch ? Math.round(c.trunkWords / nch) : "—";
    console.log(
      `  ${String(c.no).padStart(2)}  ${c.name.padEnd(20, "　").slice(0, 20)}` +
      `  ${String(c.bgScenes.size).padStart(3)}  ${String(nch).padStart(5)}` +
      `  ${String(c.trunkWords).padStart(7)}  ${String(branchW).padStart(7)}` +
      `  ${String(c.words).padStart(7)}  ${pct.padStart(6)}  ${String(gap).padStart(7)}`
    );
  }
  const avgGap = Math.round(totalTrunk / cs.reduce((a, c) => a + c.choiceNodes.length, 0));
  console.log(`  ${"".padEnd(2)}  ${"合计".padEnd(20, "　")}  ${""}`.slice(0, 40) +
    `       ${String(cs.reduce((a, c) => a + c.choiceNodes.length, 0)).padStart(5)}` +
    `  ${String(totalTrunk).padStart(7)}  ${String(totalW - totalTrunk).padStart(7)}` +
    `  ${String(totalW).padStart(7)}    100%   ${String(avgGap).padStart(7)}`);

  /* 每个选择点的三选项字数（找"回报与内容倒挂"） */
  console.log(`\n  选择点明细（选项字数 / 数值）`);
  for (const c of cs){
    for (const n of c.choiceNodes){
      const parts = n.opts.map(o => {
        const w = (o.branch || []).reduce((a, x) => a + cn(x.txt || ""), 0);
        const f = o.favor || 0, d = o.danger || 0, cu = o.clue || 0;
        return `${w}字(${f >= 0 ? "+" : ""}${f}/${d >= 0 ? "+" : ""}${d}${cu ? "/线+" + cu : ""})`;
      });
      const W = n.opts.map(o => (o.branch || []).reduce((a, x) => a + cn(x.txt || ""), 0));
      const flag = (Math.max(...W) >= 60 && Math.min(...W) <= 25) ? "  ← 长短差很大" : "";
      console.log(`  第${c.no}章 ${String(n.__ln).padStart(5)}行  ${parts.join("  ")}${flag}`);
    }
  }
}
