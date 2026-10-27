/* validate.js —— 无浏览器的端到端走读（0.9 版）
   1. 载入 story.js + eggs.js + engine.js 到 vm 沙箱（DOM 全部打桩）
   2. 穷举两条线的所有选择组合（3^8 / 混选项数 × 4 种问卷策略），验证 20 个结局全部可达
   3. 验证隐藏结局《老万的十年》三条路都能开
   4. 验证番外 / 图鉴 / 称号 / 跳过已读 / 数值上限
*/
const fs = require("fs");
const vm = require("vm");
const path = require("path");

const GAME = path.join(__dirname, "..", "game");

function makeEl() {
  const el = {
    style: {}, innerHTML: "", textContent: "", dataset: {},
    children: [],
    appendChild(c) { this.children.push(c); },
    closest() { return null; },
    play() { return Promise.resolve(); },
    pause() {}, currentTime: 0, src: "", loop: false, volume: 1
  };
  return el;
}

const els = {};
const store = {};
const sandbox = {
  console,
  setTimeout, clearTimeout, setInterval: () => 0, clearInterval: () => {},
  localStorage: {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; }
  },
  confirm: () => true,
  alert: () => {},
  atob: s => Buffer.from(String(s).replace(/\s+/g, ""), "base64").toString("binary"),
  TextDecoder,
  document: {
    getElementById: id => (els[id] = els[id] || makeEl()),
    createElement: () => makeEl(),
    addEventListener: () => {}
  },
  window: { addEventListener: () => {} }
};
sandbox.globalThis = sandbox;
const ctx = vm.createContext(sandbox);

vm.runInContext(fs.readFileSync(path.join(GAME, "eggs.js"), "utf8") + "\nglobalThis.EGGS = EGGS;\n", ctx, { filename: "eggs.js" });
vm.runInContext(fs.readFileSync(path.join(GAME, "story.js"), "utf8") + "\nglobalThis.STORY = STORY;\n", ctx, { filename: "story.js" });
vm.runInContext(fs.readFileSync(path.join(GAME, "engine.js"), "utf8"), ctx, { filename: "engine.js" });

const G = ctx;
const S = G.STORY;

let fail = 0;
const want = (cond, msg) => { if (!cond) { console.log(" ✗ " + msg); fail++; } };

/* ============================================================
   数据一致性
   ============================================================ */
const endings = S.endings || {};
const endIds = Object.keys(endings);
console.log(`=== 结局表 ${endIds.length} 个 ===`);
endIds.forEach(id => console.log(` ${id.padEnd(16)} ${endings[id].name}`));

want(endIds.length === 20, "结局总数应为 20，当前 " + endIds.length);
want(endIds.filter(id => id.startsWith("wan:")).length === 9, "万宁线应有 9 个结局");
want(endIds.filter(id => id.startsWith("jiang:")).length === 9, "江野线应有 9 个结局");
want(endIds.filter(id => id.startsWith("hidden:")).length === 2, "隐藏结局应有 2 个");

/* 每个结局都要有 name / desc / hint */
endIds.forEach(id => {
  const e = endings[id];
  want(!!e.name && !!e.desc && !!e.hint, `结局 ${id} 缺 name/desc/hint`);
});

/* 分支里写的 ending 必须在表中存在 */
const allEndingRefs = new Set();
function scan(nodes) {
  for (const n of nodes || []) {
    if (n.t === "endcheck") for (const c of n.cases || []) {
      if (c.ending) allEndingRefs.add(c.ending.includes(":") ? c.ending : "*:" + c.ending);
      scan(c.branch);
    }
    if (n.branch) scan(n.branch);
  }
}
scan(S.lines.wan); scan(S.lines.jiang);
for (const ref of allEndingRefs) {
  if (ref.startsWith("*:")) { const t = ref.slice(2); want(["he","normal","be","cold","ember","clean","scar","empty"].includes(t), "未知的 ending 简写: " + t); continue; }
  want(!!endings[ref], "story.js 引用了不存在的结局 id: " + ref);
}
console.log(" 引用到的 ending:", [...allEndingRefs].join(", "));

/* 选项完整：每个选项都要有 favor、branch */
let noFavor = 0, noBranch = 0, zeroFavor = 0;
for (const L of ["wan", "jiang"]) {
  for (const n of S.lines[L]) if (n.t === "choice") {
    for (const o of n.opts) {
      if (typeof o.favor !== "number") noFavor++;
      if (!o.branch || !o.branch.length) noBranch++;
      if (o.favor === 0) zeroFavor++;
    }
  }
}
want(noFavor === 0, "有选项没写 favor");
want(noBranch === 0, "有选项没写 branch");
want(zeroFavor === 0, "有选项的 favor 是 0（每个选项都该影响好感），共 " + zeroFavor);

/* ============================================================
   穷举走读
   ============================================================ */
function cartesian(n, k) {
  const out = [];
  const total = Math.pow(k, n);
  for (let i = 0; i < total; i++) {
    const arr = []; let x = i;
    for (let j = 0; j < n; j++) { arr.push(x % k); x = Math.floor(x / k); }
    out.push(arr);
  }
  return out;
}

function choiceCount(line) {
  return S.lines[line].filter(n => n.t === "choice").length;
}

/* 三种问卷策略：全 A / 好感最高 / 线索最多 */
function quizPlans(line) {
  const Qs = S.quiz[line];
  const pick = (fn) => Qs.map(q => {
    let best = 0, bv = -1e9;
    q.opts.forEach((o, i) => { const v = fn(o); if (v > bv) { bv = v; best = i; } });
    return best;
  });
  return [
    { name: "A", plan: Qs.map(() => 0) },
    { name: "high", plan: pick(o => o.favor || 0) },
    { name: "clue", plan: pick(o => (o.clue || 0) * 100 + (o.favor || 0)) }
  ];
}

/* 走一遍：返回 { id, favor, danger, clue, texts, steps } */
function run(line, quizPlan, choicePlan) {
  G.showTitle();
  G.startQuiz(line);
  let steps = 0, texts = 0, ci = 0;
  while (steps++ < 4000) {
    const st = G.__getState();
    if (!st) return { id: null, bad: "no-state", steps };
    if (st.screen === "end") {
      return { id: st.ending ? st.ending.id : "extra", favor: st.favor, danger: st.danger, clue: st.clue, texts, steps };
    }
    if (st.screen === "quiz") { G.answerQuiz(quizPlan[st.qi] || 0); continue; }
    const n = st.queue[st.idx];
    if (!n) return { id: null, bad: "queue-end", steps };
    if (n.t === "choice") {
      let k = (choicePlan && choicePlan[ci] !== undefined) ? choicePlan[ci] : 0;
      if (k >= n.opts.length) k = n.opts.length - 1;   // 有的选择只有 2 个选项
      ci++;
      G.choose(k);
      continue;
    }
    if (n.t === "text") texts++;
    G.advance();
  }
  return { id: null, bad: "timeout", steps };
}

/* ---------- 静态走读（不碰引擎/DOM，比沙箱快两个数量级） ---------- */
function caseOk(c, st){
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
const clampNum = (v, a, b) => Math.max(a, Math.min(b, v));
function swalk(line, quizPlan, choicePlan){
  const Qs = S.quiz[line];
  const st = { favor: 0, danger: 20, clue: 0, flags: {}, profile: {} };
  Qs.forEach((q, i) => {
    const k = quizPlan[i] || 0;
    const o = q.opts[k] || q.opts[0];
    st.profile[q.id] = String.fromCharCode(65 + k);
    st.favor += o.favor || 0; st.danger += o.danger || 0; st.clue += o.clue || 0;
  });
  st.favor = clampNum(st.favor, 0, 100);
  st.danger = clampNum(st.danger, 0, 100);
  st.clue = clampNum(st.clue, 0, 5);

  const queue = S.lines[line].slice();
  let idx = 0, ci = 0, guard = 0, texts = 0, ending = null;
  while (idx < queue.length && guard++ < 20000){
    const n = queue[idx];
    if (n.t === "qvar"){ queue.splice(idx, 1, ...((n.map && n.map[st.profile[n.by]]) || [])); continue; }
    if (n.t === "flag"){
      st.flags[n.key] = (n.val === undefined ? true : n.val);
      idx++; continue;
    }
    if (n.t === "text"){ texts++; idx++; continue; }
    if (n.t === "choice"){
      let k = choicePlan[ci++] ?? 0;
      if (k >= n.opts.length) k = n.opts.length - 1;
      const o = n.opts[k];
      st.favor  = clampNum(st.favor  + (o.favor  || 0), 0, 100);
      st.danger = clampNum(st.danger + (o.danger || 0), 0, 100);
      st.clue   = clampNum(st.clue   + (o.clue   || 0), 0, 5);
      if (o.branch && o.branch.length) queue.splice(idx + 1, 0, ...o.branch);
      idx++; continue;
    }
    if (n.t === "endcheck"){
      const hit = n.cases.find(c => caseOk(c, st));
      if (hit){
        if (hit.ending) ending = hit.ending.includes(":") ? hit.ending : line + ":" + hit.ending;
        if (hit.branch && hit.branch.length) queue.splice(idx + 1, 0, ...hit.branch);
      }
      idx++; continue;
    }
    if (n.t === "end") break;
    idx++;
  }
  if (!ending) ending = line + ":normal";
  return { id: ending, favor: st.favor, danger: st.danger, clue: st.clue, texts };
}

const found = { wan: new Set(), jiang: new Set() };
const statRange = { wan: {}, jiang: {} };
let crashes = 0;

for (const line of ["wan", "jiang"]) {
  const optsLen = S.lines[line].filter(n => n.t === "choice").map(n => n.opts.length);
  const total = optsLen.reduce((a, k) => a * k, 1);
  let runs = 0;
  for (const qp of quizPlans(line)) {
    for (let t = 0; t < total; t++) {
      let x = t; const cp = [];
      for (let j = 0; j < optsLen.length; j++) { cp.push(x % optsLen[j]); x = Math.floor(x / optsLen[j]); }
      const r = swalk(line, qp.plan, cp);
      runs++;
      if (!r || !r.id) { crashes++; if (crashes < 4) console.log(` ✗ ${line} 走读异常（${qp.name} / ${cp.join("")}）`); continue; }
      found[line].add(r.id);
      const key = r.id;
      const cur = statRange[line][key] || { n: 0, fMin: 1e9, fMax: -1, dMin: 1e9, dMax: -1, cMin: 1e9, cMax: -1 };
      cur.n++;
      cur.fMin = Math.min(cur.fMin, r.favor); cur.fMax = Math.max(cur.fMax, r.favor);
      cur.dMin = Math.min(cur.dMin, r.danger); cur.dMax = Math.max(cur.dMax, r.danger);
      cur.cMin = Math.min(cur.cMin, r.clue); cur.cMax = Math.max(cur.cMax, r.clue);
      statRange[line][key] = cur;
    }
  }
  console.log(`\n=== ${line} 线：${runs} 条路径，走到 ${found[line].size} 种结局 ===`);
  [...found[line]].sort().forEach(id => {
    const s2 = statRange[line][id];
    console.log(` ${id.padEnd(16)} 好感 ${String(s2.fMin).padStart(3)}–${String(s2.fMax).padEnd(3)} 执念 ${String(s2.dMin).padStart(3)}–${String(s2.dMax).padEnd(3)} 线索 ${s2.cMin}–${s2.cMax}  ${String(s2.n).padStart(4)} 条路径`);
  });
}
want(crashes === 0, "有 " + crashes + " 条路径走不到结局");

for (const line of ["wan", "jiang"]) {
  const need = endIds.filter(id => id.startsWith(line + ":"));
  need.forEach(id => want(found[line].has(id), `${line} 线走不到结局 ${id}（${endings[id].name}）`));
}
want(found.wan.has("hidden:laowan"), "万宁线正篇走不到隐藏结局《老万的十年》");
want(found.jiang.has("hidden:laowan"), "江野线正篇走不到隐藏结局《老万的十年》");

/* 好感上限 */
const peakWan = Math.max(...Object.values(statRange.wan).map(v => v.fMax));
const peakJiang = Math.max(...Object.values(statRange.jiang).map(v => v.fMax));
console.log(`\n好感峰值：万宁 ${peakWan} / 江野 ${peakJiang}`);
want(peakWan === 100, "万宁线好感峰值应为 100，实际 " + peakWan);
want(peakJiang >= 90, "江野线好感峰值应接近满分，实际 " + peakJiang);
const clueMax = Math.max(...["wan","jiang"].flatMap(L => Object.values(statRange[L]).map(v => v.cMax)));
want(clueMax === 5, "线索上限应为 5，实际 " + clueMax);

/* ============================================================
   番外与隐藏结局的三条路
   ============================================================ */
/* 注意：showTitle() 会从 localStorage 重载收集记录，progress 会被换成新对象，
   所以每次都要拿实时的那个，改完再 saveCol() 落盘 */
const P = () => G.__getProgress();
const setEnds = (obj) => { P().ends = Object.assign({}, obj); G.saveCol(); };
const setHE = (w, j) => { P().he = { wan: !!w, jiang: !!j }; G.saveCol(); };

console.log("\n=== 《老万的十年》三条路 ===");
setHE(false, false); setEnds({});
want(!G.extraUnlocked("laowan"), "一条结局都没有时，老万不该开");
const routeA = (() => { setHE(true, true); setEnds({ "wan:he": true, "jiang:he": true }); return G.extraUnlocked("laowan"); })();
const routeB = (() => { setHE(false, false); setEnds({ "wan:be": true, "jiang:be": true }); return G.extraUnlocked("laowan"); })();
/* B 路应认「任意一种 BE」，不只有《野狗的死法》 */
const routeB2 = (() => { setHE(false, false); setEnds({ "wan:burn": true, "jiang:blade": true }); return G.extraUnlocked("laowan"); })();
const routeC = (() => { setHE(false, false); setEnds({ "hidden:laowan": true }); return G.extraUnlocked("laowan"); })();
console.log(` A 双线 HE：${routeA ? "开" : "锁"} ／ B 两线 BE：${routeB ? "开" : "锁"} ／ C 正篇触发：${routeC ? "开" : "锁"}`);
want(routeA, "双线 HE 应能开《老万的十年》");
want(routeB, "两线都 BE 应能开《老万的十年》");
want(routeB2, "两线走到《烧到自己》＋《刀口朝内》也应能开《老万的十年》");
want(routeC, "正篇走到隐藏结局应能重读《老万的十年》");
setHE(false, false); setEnds({ "wan:be": true });
want(!G.extraUnlocked("laowan"), "只有一条线 BE 时不该开《老万的十年》");

console.log("\n=== 《同一个站台》 ===");
setEnds({ "wan:cold": true }); const pc1 = G.extraUnlocked("platform");
setEnds({ "wan:cold": true, "jiang:cold": true }); const pc2 = G.extraUnlocked("platform");
console.log(` 只有万宁疏离：${pc1 ? "开" : "锁"} ／ 两边都疏离：${pc2 ? "开" : "锁"}`);
want(!pc1, "只有一条线疏离时不该开《同一个站台》");
want(pc2, "两条线都疏离应能开《同一个站台》");

/* 跑番外 */
function runExtra(key) {
  G.showTitle();
  G.startExtra(key);
  let steps = 0, texts = 0;
  while (steps++ < 3000) {
    const st = G.__getState();
    if (!st) return { end: "no-state", steps };
    if (st.screen === "end") return { end: "extra", texts, steps };
    const n = st.queue[st.idx];
    if (!n) return { end: "queue-end", steps };
    if (n.t === "text") texts++;
    G.advance();
  }
  return { end: "timeout", steps };
}

setHE(true, true); setEnds({ "wan:cold": true, "jiang:cold": true, "wan:he": true, "jiang:he": true });
G.saveCol();
const exLaowan = runExtra("laowan");
const regLaowan = !!(P().ends["hidden:laowan"] && P().endings["hidden:laowan"]);
const exPlatform = runExtra("platform");
const regPlatform = !!(P().ends["hidden:platform"] && P().endings["hidden:platform"]);
const exS2 = runExtra("s2");

setEnds({ "jiang:he": true, "jiang:normal": true, "jiang:be": true, "jiang:cold": true, "jiang:ember": true, "jiang:scar": true, "jiang:empty": true, "jiang:blade": true, "jiang:nobody": true, "jiang:halt": true });
const exYanhua = runExtra("yanhua");
setEnds({ "wan:he": true, "wan:normal": true, "wan:be": true, "wan:cold": true, "wan:ember": true, "wan:clean": true, "wan:burn": true, "wan:gone": true, "wan:halt": true });
const exJujia = runExtra("jujia");

console.log("\n=== 番外 ===");
console.log(` 老万的十年 -> ${exLaowan.end} (${exLaowan.texts} 句)`);
console.log(` 同一个站台 -> ${exPlatform.end} (${exPlatform.texts} 句)`);
console.log(` 哥哥的柜子 -> ${exS2.end} (${exS2.texts} 句)`);
console.log(` 烟花       -> ${exYanhua.end} (${exYanhua.texts} 句)`);
console.log(` 居家情事   -> ${exJujia.end} (${exJujia.texts} 句)`);
want(exLaowan.end === "extra", "《老万的十年》走不完: " + exLaowan.end);
want(exLaowan.texts >= 80, "《老万的十年》正文太短: " + exLaowan.texts);
want(exPlatform.end === "extra", "《同一个站台》走不完: " + exPlatform.end);
want(exPlatform.texts >= 8, "《同一个站台》正文太短: " + exPlatform.texts);
want(exYanhua.texts >= 15, "《烟花》正文太短: " + exYanhua.texts);
want(exJujia.texts >= 55, "《居家情事》正文太短，原稿可能没接进来: " + exJujia.texts);

/* 番外读完要登记成结局（上面已即时取过值） */
want(regLaowan, "读完《老万的十年》应登记隐藏结局（ends + endings）");
want(regPlatform, "读完《同一个站台》应登记隐藏结局（ends + endings）");

/* ============================================================
   称号 / 图鉴
   ============================================================ */
const allEndsObj = {};
endIds.forEach(id => allEndsObj[id] = true);
P().ends = allEndsObj;
P().endings = Object.assign({}, allEndsObj);
P().peakFavor = 100;
P().extras = { laowan: true, jujia: true, yanhua: true, platform: true, s2: true };
P().he = { wan: true, jiang: true };
P().lines = { wan: true, jiang: true };
Object.keys(S.gallery.bg).forEach(k => P().bg[k] = true);
Object.keys(S.gallery.char).forEach(w => Object.keys(S.gallery.char[w]).forEach(p => P().char[w + ":" + p] = true));
S.gallery.lore.forEach(e => P().lore[e.id] = true);

const titleConds = [
  ["anyEnding", true], ["normalEnd", true], ["beEnd", true], ["wanHE", true], ["jiangHE", true],
  ["bothLines", true], ["lore8", true], ["allGallery", true], ["laowan", true], ["platformEnd", true],
  ["jujia", true], ["yanhua", true], ["rawread", true], ["allEndings", true], ["wanAllEnds", true],
  ["jiangAllEnds", true], ["wanEmber", true], ["wanClean", true], ["jiangScar", true],
  ["jiangEmpty", true], ["wanBurn", true], ["wanGone", true], ["jiangBlade", true], ["jiangNobody", true], ["wanHalt", true], ["jiangHalt", true], ["peakFavor", true]
];
const badConds = titleConds.filter(([c, expect]) => G.condMet(c) !== expect).map(([c]) => c);
want(badConds.length === 0, "这些称号条件在全收集下没亮: " + badConds.join(", "));

const gc = G.galleryCount(), gf = G.galleryFound();
console.log(`\n=== 图鉴 ===`);
console.log(` 场景 ${gf.bg}/${gc.bg}｜人物 ${gf.char}/${gc.char}｜档案 ${gf.lore}/${gc.lore}｜结局 ${gf.ending}/${gc.ending}｜合计 ${gf.bg+gf.char+gf.lore+gf.ending}/${gc.total}`);
want(gf.ending === 20, "图鉴结局栏应有 20 格，实际 " + gf.ending);
want(gf.bg + gf.char + gf.lore + gf.ending === gc.total, "图鉴未全满");

/* 称号表检查 */
want(S.titles.length === 27, "称号总数应为 27，当前 " + S.titles.length);
const conds = new Set(S.titles.map(t => t.cond));
const missing = [...conds].filter(c => !["anyEnding","normalEnd","beEnd","wanHE","jiangHE","bothLines","lore8","allGallery","laowan","platformEnd","jujia","yanhua","rawread","allEndings","wanAllEnds","jiangAllEnds","wanEmber","wanClean","jiangScar","jiangEmpty","wanBurn","wanGone","jiangBlade","jiangNobody","wanHalt","jiangHalt","peakFavor"].includes(c));
want(missing.length === 0, "称号用了引擎不认识的条件: " + missing.join(", "));

/* ============================================================
   跳过已读
   ============================================================ */
delete store["xundao_read_v1"];
delete store["xundao_skip_v1"];
G.showTitle();
G.startQuiz("wan");
const firstRun = run("wan", [0, 0, 0, 0], new Array(8).fill(0));
const readN = G.readCount();
console.log(`\n=== 跳过已读 ===`);
console.log(` 首跑 ${firstRun.texts} 句正文，记录 ${readN} 条已读指纹`);
want(readN >= firstRun.texts * 0.8, "已读记录太少: " + readN + " / " + firstRun.texts);

G.showTitle();
G.toggleSkip();                                  // 打开跳过已读
G.startQuiz("wan");
const skipRun = run("wan", [0, 0, 0, 0], new Array(8).fill(0));
G.toggleSkip();                                  // 关掉，别影响后面
console.log(` 二跑（跳过已读）${skipRun.texts} 句正文`);
want(skipRun.texts < firstRun.texts * 0.35, `跳过已读没生效：${skipRun.texts} / ${firstRun.texts}`);
want(skipRun.id === firstRun.id, "跳过已读后结局应一致：" + skipRun.id + " vs " + firstRun.id);

/* ============================================================
   界面函数不报错
   ============================================================ */
["showTitle", "showGallery", "showTitles", "showExtras", "showLineSelect", "showCredits"]
  .forEach(fn => { try { G[fn](); } catch (e) { console.log(" ✗ " + fn + " 报错: " + e.message); fail++; } });
try { G.showGallery("ending"); } catch (e) { console.log(" ✗ 结局图鉴报错: " + e.message); fail++; }

// 全篇不应再出现分级标记（18+ 唯一版本）
const storyText = fs.readFileSync(path.join(GAME, "story.js"), "utf8");
want(!/\ba: 1\b/.test(storyText), "story.js 里仍有 a: 1 分级标记");
want(!/\bs: 1\b/.test(storyText), "story.js 里仍有 s: 1 分级标记");

// 鸣谢页数据完整
const cr = S.credits || {};
want((cr.music || []).length === 5, "鸣谢页应列 5 首 BGM");
want((cr.sfx || []).length === 3, "鸣谢页应列 3 个音效");
want([...(cr.music || []), ...(cr.sfx || [])].every(m => m.license && m.url && m.author),
  "鸣谢页每条素材都要有 授权/作者/来源链接");

console.log(fail === 0 ? "\n全部检查通过 ✓" : `\n有 ${fail} 项未通过 ✗`);
process.exit(fail === 0 ? 0 : 1);
