/* plan.js —— 求一条能走到指定结局的点击序列（给浏览器测试用）
   用法：node scripts/plan.js wan:halt
*/
const fs = require("fs"), vm = require("vm"), path = require("path");
const GAME = path.join(process.cwd(), "game");
const ctx = { console }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(GAME, "story.js"), "utf8") + "\n;globalThis.STORY=STORY;", ctx);
const S = ctx.STORY;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

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

const target = process.argv[2];
// "hidden:xxx" 不是路线名，要回到正文里搜（目前隐藏结局挂在万宁终章）
const cand = S.lines[target.split(":")[0]] ? [target.split(":")[0]] : Object.keys(S.lines);
for (const line of cand) {
  const optsLen = S.lines[line].filter(n => n.t === "choice").map(n => n.opts.length);
  const total = optsLen.reduce((a, k) => a * k, 1);
  const Qs = S.quiz[line];
  const pick = fn => Qs.map(q => { let b = 0, bv = -1e9; q.opts.forEach((o, i) => { const v = fn(o); if (v > bv) { bv = v; b = i; } }); return b; });
  const plans = [Qs.map(() => 0), pick(o => o.favor || 0), pick(o => (o.clue || 0) * 100 + (o.favor || 0)), pick(o => (o.danger || 0) * 100 + (o.favor || 0))];

  for (const qp of plans) {
    for (let t = 0; t < total; t++) {
      let x = t; const cp = [];
      for (let j = 0; j < optsLen.length; j++) { cp.push(x % optsLen[j]); x = Math.floor(x / optsLen[j]); }
      const r = walk(line, qp, cp);
      if (r.id === target) {
        console.log(JSON.stringify({ line, quiz: qp, choices: cp, stat: { f: r.f, d: r.d, c: r.c } }));
        process.exit(0);
      }
    }
  }
}
console.log("找不到路径: " + target);
process.exit(1);
