/* policy.js —— 固定策略体检：一直点第一项 / 第二项 / 第三项，各会落到哪个结局
   用法：node scripts/policy.js
   还顺带打印「数值最优项落在第几格」的分布，用来确认选项顺序确实被打散了。
*/
const fs = require("fs"), vm = require("vm"), path = require("path");
const GAME = path.join(process.cwd(), "game");
const ctx = { console }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(GAME, "story.js"), "utf8") + "\n;globalThis.STORY=STORY;", ctx);
const S = ctx.STORY;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const score = o => (o.favor || 0) + (o.clue || 0) * 8 - (o.danger || 0) * 0.35;

function caseOk(c, st) {
  const f = st.favor, d = st.danger, cu = st.clue, fl = st.flags;
  if (c.ifFlag) { const w = c.flagVal === undefined ? true : c.flagVal; if ((!!fl[c.ifFlag]) !== w) return false; if (!c.if) return true; }
  if (c.else) return true;
  if (c.if) {
    const x = c.if;
    if (x.favorMin !== undefined && f < x.favorMin) return false;
    if (x.favorMax !== undefined && f > x.favorMax) return false;
    if (x.dangerMin !== undefined && d < x.dangerMin) return false;
    if (x.dangerMax !== undefined && d > x.dangerMax) return false;
    if (x.clueMin !== undefined && cu < x.clueMin) return false;
    if (x.clueMax !== undefined && cu > x.clueMax) return false;
    return true;
  }
  if (c.min !== undefined) return f >= c.min;
  return false;
}

function walk(line, qp, cp) {
  const Qs = S.quiz[line];
  const st = { favor: 0, danger: 20, clue: 0, flags: {}, profile: {} };
  Qs.forEach((q, i) => {
    const k = qp[i] || 0, o = q.opts[k] || q.opts[0];
    st.profile[q.id] = String.fromCharCode(65 + k);
    st.favor += o.favor || 0; st.danger += o.danger || 0; st.clue += o.clue || 0;
  });
  st.favor = clamp(st.favor, 0, 100); st.danger = clamp(st.danger, 0, 100); st.clue = clamp(st.clue, 0, 5);
  const Q = S.lines[line].slice();
  let i = 0, ci = 0, g = 0, end = null;
  while (i < Q.length && g++ < 20000) {
    const n = Q[i];
    if (n.t === "qvar") { Q.splice(i, 1, ...((n.map && n.map[st.profile[n.by]]) || [])); continue; }
    if (n.t === "vary") { const v = st[n.by] || 0; const c = n.cuts || []; let bi = 0; while (bi < c.length && v >= c[bi]) bi++; Q.splice(i, 1, ...((n.map && n.map[bi]) || [])); continue; }
    if (n.t === "flag") { st.flags[n.key] = n.val === undefined ? true : n.val; i++; continue; }
    if (n.t === "flavor") { const o = n.opts[0]; if (o.branch) Q.splice(i + 1, 0, ...o.branch); i++; continue; }
    if (n.t === "choice") {
      let k = cp[ci++] ?? 0; if (k >= n.opts.length) k = n.opts.length - 1;
      const o = n.opts[k];
      st.favor = clamp(st.favor + (o.favor || 0), 0, 100);
      st.danger = clamp(st.danger + (o.danger || 0), 0, 100);
      st.clue = clamp(st.clue + (o.clue || 0), 0, 5);
      if (o.branch) Q.splice(i + 1, 0, ...o.branch);
      i++; continue;
    }
    if (n.t === "endcheck") {
      const h = n.cases.find(c => caseOk(c, st));
      if (h) { if (h.ending) end = h.ending.includes(":") ? h.ending : line + ":" + h.ending; if (h.branch) Q.splice(i + 1, 0, ...h.branch); }
      i++; continue;
    }
    if (n.t === "end") break;
    i++;
  }
  return { id: end || line + ":normal", f: st.favor, d: st.danger, c: st.clue };
}

const nameOf = id => (S.endings[id] || {}).name || id;
const shortName = id => nameOf(id).replace(/^[^《]*《/, "").replace(/》.*$/, "") || id;
const pick = (line, fn) => S.quiz[line].map(q => {
  let b = 0, bv = -1e9;
  q.opts.forEach((o, i) => { const v = fn(o); if (v > bv) { bv = v; b = i; } });
  return b;
});
const QUIZ = {
  "问卷全 A": line => S.quiz[line].map(() => 0),
  "问卷取 favor": line => pick(line, o => o.favor || 0),
  "问卷取线索": line => pick(line, o => (o.clue || 0) * 100 + (o.favor || 0)),
  "问卷取执念": line => pick(line, o => (o.danger || 0) * 100 + (o.favor || 0)),
};

console.log("=== 固定策略体检（同一策略从头点到尾）===\n");
for (const line of ["wan", "jiang"]) {
  const n = S.lines[line].filter(x => x.t === "choice").length;
  console.log(`【${line === "wan" ? "万宁线" : "江野线"}】${n} 个选择点`);
  for (const [qname, qfn] of Object.entries(QUIZ)) {
    const qp = qfn(line);
    const row = [];
    for (let k = 0; k < 3; k++) {
      const r = walk(line, qp, Array(n).fill(k));
      row.push(`第${"一二三"[k]}项→${shortName(r.id)}(${r.f}/${r.c}/${r.d})`);
    }
    console.log("  " + qname.padEnd(6, "　") + " " + row.join("   "));
  }
  console.log("");
}

console.log("=== 最优项落点分布（0=第一格）===");
const dist = [0, 0, 0, 0];
for (const line of ["wan", "jiang"]) {
  const qs = S.lines[line].filter(x => x.t === "choice");
  const seq = qs.map(node => {
    const sc = node.opts.map(score);
    let bi = 0; sc.forEach((v, k) => { if (v > sc[bi]) bi = k; });
    dist[bi]++;
    return bi;
  });
  console.log(`  ${line === "wan" ? "万宁" : "江野"}：${seq.join(" ")}`);
}
console.log(`  合计 第1格 ${dist[0]} 次 / 第2格 ${dist[1]} 次 / 第3格 ${dist[2]} 次`);
const total = dist.reduce((a, b) => a + b, 0);
console.log(`  「一路点第一项」命中最优的比例：${(dist[0] / total * 100).toFixed(0)}%（打散前是 61%）`);
