/* ============================================================
   可玩性体检（静态遍历版，不依赖引擎/DOM）
   输出：单周目阅读量、决策密度、主干/分支文本占比、结局分布、结局间文本重合度
   用法：node scripts/playtest.js
   ============================================================ */
const fs = require("fs"), vm = require("vm"), path = require("path");
const GAME = path.join(process.cwd(), "game");
const ctx = { console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(GAME, "story.js"), "utf8") + "\n;globalThis.STORY=STORY;", ctx);
const S = ctx.STORY;

const FAVOR_MAX = 100, DANGER_MAX = 100, CLUE_MAX = 5, DANGER_BASE = 20;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const cn = s => String(s).replace(/\s/g, "").length;
const LINES = ["wan", "jiang"];

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

/* ---------- 走一条路径（纯数据） ---------- */
function walk(line, quizPick, choicePick){
  const Qs = S.quiz[line];
  const st = { favor:0, danger:DANGER_BASE, clue:0, flags:{}, profile:{} };
  Qs.forEach((q, i) => {
    const o = q.opts[quizPick[i] || 0] || q.opts[0];
    st.profile[q.id] = String.fromCharCode(65 + (quizPick[i] || 0));
    st.favor  += o.favor  || 0;
    st.danger += o.danger || 0;
    st.clue   += o.clue   || 0;
  });
  st.favor = clamp(st.favor, 0, FAVOR_MAX);
  st.danger = clamp(st.danger, 0, DANGER_MAX);
  st.clue = clamp(st.clue, 0, CLUE_MAX);

  const queue = S.lines[line].slice();
  const texts = [];
  const stats = [];     // 每段正文累计字数，用来算决策密度
  let idx = 0, ci = 0, guard = 0, wordsSinceChoice = 0;
  let ending = null;

  while (idx < queue.length && guard++ < 20000){
    const n = queue[idx];
    if (n.t === "text"){
      texts.push(n.txt);
      wordsSinceChoice += cn(n.txt);
      idx++; continue;
    }
    if (n.t === "qvar"){
      const v = (n.map && n.map[st.profile[n.by]]) || [];
      queue.splice(idx, 1, ...v);
      continue;
    }
    if (n.t === "flag"){
      st.flags[n.key] = (n.val === undefined ? true : n.val);
      idx++; continue;
    }
    if (n.t === "choice"){
      let k = choicePick[ci++] ?? 0;
      if (k >= n.opts.length) k = n.opts.length - 1;
      const o = n.opts[k];
      st.favor  = clamp(st.favor  + (o.favor  || 0), 0, FAVOR_MAX);
      st.danger = clamp(st.danger + (o.danger || 0), 0, DANGER_MAX);
      st.clue   = clamp(st.clue   + (o.clue   || 0), 0, CLUE_MAX);
      stats.push(wordsSinceChoice); wordsSinceChoice = 0;
      if (o.branch && o.branch.length) queue.splice(idx + 1, 0, ...o.branch);
      idx++; continue;
    }
    if (n.t === "endcheck"){
      const hit = n.cases.find(c => caseMet(c, st));
      if (hit){
        if (hit.ending) ending = hit.ending.includes(":") ? hit.ending : line + ":" + hit.ending;
        if (hit.branch && hit.branch.length) queue.splice(idx + 1, 0, ...hit.branch);
      }
      idx++; continue;
    }
    if (n.t === "end"){ break; }
    idx++;
  }
  if (!ending) ending = line + ":normal";
  return { ending, favor:st.favor, danger:st.danger, clue:st.clue, texts,
           words:texts.reduce((a, s) => a + cn(s), 0),
           seg:stats, wordsSinceChoice };
}

/* ---------- 问卷策略 ---------- */
function quizPlans(line){
  const Qs = S.quiz[line];
  const pick = fn => Qs.map(q => {
    let b = 0, bv = -1e9;
    q.opts.forEach((o, i) => { const v = fn(o); if (v > bv){ bv = v; b = i; } });
    return b;
  });
  return [
    Qs.map(() => 0),
    pick(o => o.favor || 0),
    pick(o => (o.clue || 0) * 100 + (o.favor || 0)),
    pick(o => (o.danger || 0) * 100 + (o.favor || 0))
  ];
}

/* ---------- 全枚举 ---------- */
const summary = {};
const reps = {};   // line -> ending -> 最长代表路径

for (const line of LINES){
  const optsLen = S.lines[line].filter(x => x.t === "choice").map(x => x.opts.length);
  const nChoice = optsLen.length;
  const total = optsLen.reduce((a, k) => a * k, 1);   // 各点选项数不一定是 3（江野线第 5 点是 2 选）
  const seenCount = new Map();
  let runs = 0, sumW = 0, sumS = 0, minW = 1e9, maxW = 0, minS = 1e9, maxS = 0;
  const byEnding = {}, segAll = [];

  for (const qp of quizPlans(line)){
    for (let t = 0; t < total; t++){
      let x = t; const cp = [];
      for (let j = 0; j < nChoice; j++){ cp.push(x % optsLen[j]); x = Math.floor(x / optsLen[j]); }
      const r = walk(line, qp, cp);
      runs++;
      sumW += r.words; sumS += r.texts.length;
      if (r.words < minW) minW = r.words;
      if (r.words > maxW) maxW = r.words;
      if (r.texts.length < minS) minS = r.texts.length;
      if (r.texts.length > maxS) maxS = r.texts.length;
      segAll.push(...r.seg);
      const b = byEnding[r.ending] = byEnding[r.ending] || { n:0, w:0, fMin:1e9, fMax:-1, dMin:1e9, dMax:-1, cMin:9, cMax:-1 };
      b.n++; b.w += r.words;
      b.fMin = Math.min(b.fMin, r.favor); b.fMax = Math.max(b.fMax, r.favor);
      b.dMin = Math.min(b.dMin, r.danger); b.dMax = Math.max(b.dMax, r.danger);
      b.cMin = Math.min(b.cMin, r.clue);  b.cMax = Math.max(b.cMax, r.clue);
      r.texts.forEach(s => seenCount.set(s, (seenCount.get(s) || 0) + 1));
      reps[line] = reps[line] || {};
      if (!reps[line][r.ending] || reps[line][r.ending].texts.length < r.texts.length) reps[line][r.ending] = r;
    }
  }

  const trunk  = [...seenCount.values()].filter(v => v === runs).length;
  const branch = [...seenCount.values()].filter(v => v < runs).length;
  const trunkSet = new Set([...seenCount.entries()].filter(([, v]) => v === runs).map(([k]) => k));
  const uniqChars = [...seenCount.keys()].reduce((a, s) => a + cn(s), 0);
  const trunkChars = [...trunkSet].reduce((a, s) => a + cn(s), 0);

  summary[line] = {
    runs, nChoice, uniqueText: seenCount.size, trunk, branch,
    uniqueChars: uniqChars, trunkChars,
    avgW: Math.round(sumW / runs), minW, maxW,
    avgS: Math.round(sumS / runs), minS, maxS,
    avgSeg: Math.round(segAll.reduce((a, b) => a + b, 0) / segAll.length),
    byEnding
  };

  console.log("=".repeat(58));
  console.log(`${line} 线 | ${nChoice} 个选择点 | 走读 ${runs} 条路径`);
  console.log(`  正文总共 ${seenCount.size} 句 / ${uniqChars} 字`);
  console.log(`  主干（每条必读）${trunk} 句 / ${trunkChars} 字  ← 占字数 ${(trunkChars / uniqChars * 100).toFixed(0)}%`);
  console.log(`  分支旁支        ${branch} 句 / ${uniqChars - trunkChars} 字  ← 占字数 ${((1 - trunkChars / uniqChars) * 100).toFixed(0)}%`);
  console.log(`  单周目读 ${Math.round(sumW / runs)} 字（${Math.round(sumS / runs)} 句），区间 ${minW}–${maxW} 字`);
  console.log(`  决策间隔 平均每 ${Math.round(segAll.reduce((a, b) => a + b, 0) / segAll.length)} 字一个选择`);
}

/* ---------- 结局分布 ---------- */
console.log("\n" + "=".repeat(58));
console.log("结局分布");
for (const line of LINES){
  const s = summary[line];
  const rows = Object.entries(s.byEnding).sort((a, b) => b[1].n - a[1].n);
  console.log(`\n[${line}] ${rows.length} 种结局 / ${s.runs} 条路径`);
  rows.forEach(([id, b]) => {
    console.log(`  ${id.padEnd(16)} ${String(b.n).padStart(5)} 条 ${(b.n / s.runs * 100).toFixed(1).padStart(5)}% `
      + `| 单周目 ${Math.round(b.w / b.n)} 字 | 好感 ${b.fMin}–${b.fMax} 执念 ${b.dMin}–${b.dMax} 线索 ${b.cMin}–${b.cMax}`);
  });
}

/* ---------- 结局之间读到的内容重合度 ---------- */
console.log("\n" + "=".repeat(58));
console.log("换结局能读到多少新东西（同一线两个结局，读到的句子重合度）");
for (const line of LINES){
  const rep = reps[line], ids = Object.keys(rep);
  const rows = [];
  for (let i = 0; i < ids.length; i++)
    for (let k = i + 1; k < ids.length; k++){
      const A = new Set(rep[ids[i]].texts), B = new Set(rep[ids[k]].texts);
      let inter = 0; A.forEach(s => { if (B.has(s)) inter++; });
      rows.push({ a: ids[i], b: ids[k], jac: inter / (A.size + B.size - inter) });
    }
  rows.sort((x, y) => y.jac - x.jac);
  const avg = rows.reduce((a, r) => a + r.jac, 0) / rows.length;
  console.log(`\n[${line}] 平均重合 ${(avg * 100).toFixed(0)}%（越低说明换结局时新内容越多）`);
  console.log("  最像的：", rows.slice(0, 3).map(r => `${r.a}≈${r.b} ${(r.jac * 100).toFixed(0)}%`).join(" ／ "));
  console.log("  最不像：", rows.slice(-3).map(r => `${r.a}≠${r.b} ${(r.jac * 100).toFixed(0)}%`).join(" ／ "));
}

/* ---------- 汇总 ---------- */
const w = summary.wan, j = summary.jiang;
console.log("\n" + "=".repeat(58));
console.log("汇总");
console.log(`  单线通关 ${w.avgW} / ${j.avgW} 字；两条线各读一遍约 ${w.avgW + j.avgW} 字（约 ${((w.avgW + j.avgW) / 500).toFixed(0)} 分钟 @500字/分）`);
console.log(`  要看完 20 个结局需重读：主干重复 ${w.trunkChars + j.trunkChars} 字 × 每多一个结局一次`);
console.log(`  每条线平均 ${Math.round(w.avgS)} / ${Math.round(j.avgS)} 句正文`);

fs.writeFileSync("scripts/_playtest.json", JSON.stringify(summary, null, 1));
console.log("\n明细已写入 scripts/_playtest.json");
