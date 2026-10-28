/* tune.js —— 阈值搜索：枚举所有路径的 (好感, 执念, 线索, flag)，在内存里跑判定链试参数。
   两条线的阈值可以不同（终章是两个独立的 endcheck）。
   用法：node scripts/tune.js            看候选与策略落点
        node scripts/tune.js search     网格搜索最均衡的一组
*/
const fs = require("fs"), vm = require("vm"), path = require("path");
const GAME = path.join(process.cwd(), "game");
const ctx = { console }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(GAME, "story.js"), "utf8") + "\n;globalThis.STORY=STORY;", ctx);
const S = ctx.STORY;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const FAVOR_MAX = 100, DANGER_MAX = 100, CLUE_MAX = 5;

function caseMet(c, st) {
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

function walk(line, quizPick, choicePick) {
  const Qs = S.quiz[line];
  const st = { favor: 0, danger: 20, clue: 0, flags: {}, profile: {} };
  Qs.forEach((q, i) => {
    const o = q.opts[quizPick[i] || 0] || q.opts[0];
    st.profile[q.id] = String.fromCharCode(65 + (quizPick[i] || 0));
    st.favor += o.favor || 0; st.danger += o.danger || 0; st.clue += o.clue || 0;
  });
  st.favor = clamp(st.favor, 0, FAVOR_MAX);
  st.danger = clamp(st.danger, 0, DANGER_MAX);
  st.clue = clamp(st.clue, 0, CLUE_MAX);

  const queue = S.lines[line].slice();
  let idx = 0, ci = 0, guard = 0;
  while (idx < queue.length && guard++ < 20000) {
    const n = queue[idx];
    if (n.t === "qvar") { queue.splice(idx, 1, ...((n.map && n.map[st.profile[n.by]]) || [])); continue; }
    if (n.t === "vary") { const v = st[n.by] || 0; const c = n.cuts || []; let bi = 0; while (bi < c.length && v >= c[bi]) bi++; queue.splice(idx, 1, ...((n.map && n.map[bi]) || [])); continue; }
    if (n.t === "flag") { st.flags[n.key] = (n.val === undefined ? true : n.val); idx++; continue; }
    if (n.t === "flavor") { const o = n.opts[0]; if (o.branch) queue.splice(idx + 1, 0, ...o.branch); idx++; continue; }
    if (n.t === "choice") {
      let k = choicePick[ci++] ?? 0;
      if (k >= n.opts.length) k = n.opts.length - 1;
      const o = n.opts[k];
      st.favor = clamp(st.favor + (o.favor || 0), 0, FAVOR_MAX);
      st.danger = clamp(st.danger + (o.danger || 0), 0, DANGER_MAX);
      st.clue = clamp(st.clue + (o.clue || 0), 0, CLUE_MAX);
      if (o.branch) queue.splice(idx + 1, 0, ...o.branch);
      idx++; continue;
    }
    if (n.t === "endcheck") {
      const hit = n.cases.find(c => caseMet(c, st));
      if (hit && hit.branch) queue.splice(idx + 1, 0, ...hit.branch);
      idx++; continue;
    }
    if (n.t === "end") break;
    idx++;
  }
  return { favor: st.favor, danger: st.danger, clue: st.clue, flag: !!st.flags.hiddenRevenge };
}

const samples = {};
for (const line of ["wan", "jiang"]) {
  const optsLen = S.lines[line].filter(n => n.t === "choice").map(n => n.opts.length);
  const total = optsLen.reduce((a, k) => a * k, 1);
  const Qs = S.quiz[line];
  const pick = fn => Qs.map(q => { let b = 0, bv = -1e9; q.opts.forEach((o, i) => { const v = fn(o); if (v > bv) { bv = v; b = i; } }); return b; });
  const plans = [Qs.map(() => 0), pick(o => o.favor || 0), pick(o => (o.clue || 0) * 100 + (o.favor || 0)), pick(o => (o.danger || 0) * 100 + (o.favor || 0))];
  const arr = [];
  for (const qp of plans) {
    for (let t = 0; t < total; t++) {
      let x = t; const cp = [];
      for (let j = 0; j < optsLen.length; j++) { cp.push(x % optsLen[j]); x = Math.floor(x / optsLen[j]); }
      arr.push(walk(line, qp, cp));
    }
  }
  samples[line] = arr;
}

function judge(line, p, T) {
  const { favor: f, danger: d, clue: c, flag } = p;
  const W = line === "wan";
  if (flag) return line + ":be";
  if (f >= T.hiddenF && c >= 5) return "hidden:laowan";
  if (f >= T.high && d >= T.darkD) return W ? "wan:clean" : "jiang:scar";
  if (f >= T.high && c >= T.heC) return line + ":he";
  if (f >= T.high) return W ? "wan:ember" : "jiang:empty";
  if (f >= T.normalF && d >= T.burnD) return W ? "wan:burn" : "jiang:blade";
  if (f >= T.normalF) return line + ":normal";
  if (f >= T.lowF && d >= T.burnD) return W ? "wan:burn" : "jiang:blade";
  if (f >= T.lowF && d >= T.coldD) return line + ":cold";
  return W ? "wan:gone" : "jiang:nobody";
}

function dist(line, T) {
  const arr = samples[line], ct = {};
  arr.forEach(p => { const id = judge(line, p, T).split(":")[1]; ct[id] = (ct[id] || 0) + 1; });
  Object.keys(ct).forEach(k => ct[k] = ct[k] / arr.length * 100);
  return ct;
}

function score(ct) {
  const vals = Object.values(ct);
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length);
  let pen = 0;
  Object.entries(ct).forEach(([k, v]) => {
    if (v < 2) pen += (2 - v) * 3;
    if (k === "normal" && v > 34) pen += (v - 34) * 1.2;
    if (v > 25) pen += (v - 25) * 1.5;
  });
  return sd + pen;
}

if (process.argv[2] === "search") {
  const best = {};
  for (const line of ["wan", "jiang"]) {
    let top = null;
    for (const high of [72, 74, 76, 78, 80])
      for (const heC of (line === "jiang" ? [3, 4] : [4, 5]))
        for (const normalF of [46, 48, 50, 52, 54])
          for (const burnD of [44, 48, 52, 56, 60, 64, 68])
            for (const coldD of [34, 36, 38, 40, 42]) {
              if (coldD >= burnD) continue;
              const T = { hiddenF: 85, high, darkD: 40, heC, normalF, lowF: 28, burnD, coldD };
              const ct = dist(line, T);
              const sc = score(ct);
              if (!top || sc < top.sc) top = { T, sc, ct };
            }
    best[line] = top;
    console.log(`\n=== ${line} 最佳 ===`);
    console.log("  ", JSON.stringify(top.T), "score", top.sc.toFixed(2));
    console.log("  ", Object.entries(top.ct).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v.toFixed(1)}%`).join(" · "));
  }
  console.log("\n合并配置：");
  console.log(JSON.stringify({ wan: best.wan.T, jiang: best.jiang.T }, null, 1));
  process.exit(0);
}

const common = { hiddenF: 85, darkD: 40, lowF: 28 };
const cands = {
  "现行": { wan: { ...common, high: 80, heC: 4, normalF: 55, burnD: 55, coldD: 40 }, jiang: { ...common, high: 80, heC: 4, normalF: 55, burnD: 55, coldD: 40 } },
  "候选 P": { wan: { ...common, high: 76, heC: 4, normalF: 50, burnD: 48, coldD: 40 }, jiang: { ...common, high: 76, heC: 3, normalF: 50, burnD: 64, coldD: 40 } },
  "候选 Q": { wan: { ...common, high: 74, heC: 4, normalF: 52, burnD: 56, coldD: 38 }, jiang: { ...common, high: 74, heC: 3, normalF: 52, burnD: 64, coldD: 40 } },
  "候选 R": { wan: { ...common, high: 72, heC: 4, normalF: 50, burnD: 52, coldD: 36 }, jiang: { ...common, high: 72, heC: 3, normalF: 50, burnD: 66, coldD: 42 } }
};
for (const [name, cfg] of Object.entries(cands)) {
  console.log("\n=== " + name + " ===");
  for (const line of ["wan", "jiang"]) {
    const ct = dist(line, cfg[line]);
    console.log(` [${line}] ` + Object.entries(ct).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v.toFixed(0)}%`).join(" · "));
  }
}

const strat = {
  "全温柔": (n, o) => o.reduce((b, x, i) => (x.favor || 0) > (o[b].favor || 0) ? i : b, 0),
  "全狠": (n, o) => o.reduce((b, x, i) => (x.danger || 0) > (o[b].danger || 0) ? i : b, 0),
  "全查案": (n, o) => o.reduce((b, x, i) => ((x.clue || 0) * 99 + (x.favor || 0)) > ((o[b].clue || 0) * 99 + (o[b].favor || 0)) ? i : b, 0),
  "温柔不管案": (n, o) => {
    const cand = o.map((x, i) => ({ i, f: x.favor || 0, c: x.clue || 0 }));
    const noClue = cand.filter(x => x.c === 0);
    const pool = noClue.length ? noClue : cand;
    return pool.reduce((b, x) => x.f > b.f ? x : b, pool[0]).i;
  },
  "温柔且狠": (n, o) => o.reduce((b, x, i) => ((x.favor || 0) * 2 + (x.danger || 0)) > ((o[b].favor || 0) * 2 + (o[b].danger || 0)) ? i : b, 0),
  "全冷": (n, o) => o.reduce((b, x, i) => (x.favor || 0) < (o[b].favor || 0) ? i : b, 0)
};
console.log("\n=== 策略落点（候选 R） ===");
for (const line of ["wan", "jiang"]) {
  for (const [name, fn] of Object.entries(strat)) {
    const Qs = S.quiz[line];
    const p = walk(line, Qs.map(q => fn(q, q.opts)), S.lines[line].filter(n => n.t === "choice").map(n => fn(n, n.opts)));
    console.log(`  ${line} ${name.padEnd(5)} 好感 ${String(p.favor).padStart(3)} 执念 ${String(p.danger).padStart(3)} 线索 ${p.clue} → ${judge(line, p, cands["候选 R"][line])}`);
  }
}
