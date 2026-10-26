/* validate.js —— 无浏览器的端到端走读
   1. 载入 story.js + engine.js 到 vm 沙箱（DOM 全部打桩）
   2. 模拟三档策略走完两条线，检查结局是否可达
   3. 检查番外解锁 / 图鉴收录 / 称号解锁
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

const storySrc = fs.readFileSync(path.join(GAME, "story.js"), "utf8") + "\nglobalThis.STORY = STORY;\n";
// eggs.js 要先跑：两篇彩蛋的正文在里面，story.js 末尾会把它接回节点树
vm.runInContext(fs.readFileSync(path.join(GAME, "eggs.js"), "utf8") + "\nglobalThis.EGGS = EGGS;\n", ctx, { filename: "eggs.js" });
vm.runInContext(storySrc, ctx, { filename: "story.js" });
vm.runInContext(fs.readFileSync(path.join(GAME, "engine.js"), "utf8"), ctx, { filename: "engine.js" });

const G = ctx;   // 引擎里的 function 声明都在全局

/* ---------- 走读 ---------- */
function walk(strategy, label, { maxSteps = 3000 } = {}) {
  let steps = 0;
  let texts = 0;
  while (steps++ < maxSteps) {
    const st = G.__getState();
    if (!st) return { end: "no-state", steps };
    if (st.screen === "end") return { end: st.ending ? st.ending.type : "extra", steps, texts, favor: st.favor };
    if (st.screen === "quiz") { G.answerQuiz(0); continue; }
    const n = st.queue[st.idx];
    if (!n) return { end: "queue-end", steps };
    if (n.t === "text") texts++;
    if (n.t === "choice") {
      let k = 0;
      if (strategy === "high") {
        let best = -1e9;
        n.opts.forEach((o, i) => { if ((o.favor || 0) > best) { best = o.favor || 0; k = i; } });
      } else if (strategy === "low") {
        let worst = 1e9;
        n.opts.forEach((o, i) => { if ((o.favor || 0) < worst) { worst = o.favor || 0; k = i; } });
      }
      G.choose(k);
      continue;
    }
    G.advance();
  }
  return { end: "timeout", steps };
}

function newRun(line) {
  G.showTitle();
  G.startQuiz(line);
}

const results = [];
for (const line of ["wan", "jiang"]) {
  for (const s of ["high", "first", "low"]) {
    newRun(line);
    const r = walk(s, `${line}-${s}`);
    results.push({ line, strategy: s, ...r });
  }
}

/* ---------- 18+ 正式版：全篇只有一条路径，下面这组就是基线 ---------- */
const heRun = results.find(r => r.line === "wan" && r.strategy === "high");

/* ---------- 番外 ---------- */
function runExtra(key) {
  G.startExtra(key);
  return walk("first", "extra-" + key);
}
// 先把双线 HE 解锁出来（直接改收集记录）
const col = JSON.parse(store["xundao_collect_v1"]);
col.he = { wan: true, jiang: true };
store["xundao_collect_v1"] = JSON.stringify(col);

const exLaowan = runExtra("laowan");
const exS2 = runExtra("s2");
const exYanhua = runExtra("yanhua");  // 彩蛋《烟花》：江野线三个结局全部走完后解锁
const exJujia  = runExtra("jujia");   // 彩蛋《居家情事》：万宁线三个结局全部走完后解锁

/* ---------- 汇总 ---------- */
const p = JSON.parse(store["xundao_collect_v1"]);
const g = G.STORY.gallery;
const totalGallery = Object.keys(g.bg).length +
  Object.values(g.char).reduce((a, c) => a + Object.keys(c).length, 0) +
  g.lore.length + g.ending.length;
const foundGallery = Object.keys(p.bg || {}).length +
  Object.values(p.char || {}).length + Object.keys(p.lore || {}).length +
  Object.keys(p.endings || {}).length;

console.log("=== 主线走读 ===");
for (const r of results) console.log(` ${r.line.padEnd(5)} ${r.strategy.padEnd(5)} -> ${r.end}  (好感 ${r.favor}, ${r.steps} 步)`);

console.log("\n=== 番外 ===");
console.log(` 老万的十年 -> ${exLaowan.end} (${exLaowan.steps} 步)`);
console.log(` 哥哥的柜子 -> ${exS2.end} (${exS2.texts} 句)`);
console.log(` 彩蛋《烟花》 -> ${exYanhua.end} (${exYanhua.texts} 句)`);
console.log(` 彩蛋《居家情事》 -> ${exJujia.end} (${exJujia.texts} 句)`);
console.log(`\n=== 18+ 正式版基线 ===`);
console.log(` 万宁线 HE：${heRun.texts} 句 / ${heRun.steps} 步；全篇无清水分支`);

console.log("\n=== 收集 ===");
console.log(` 图鉴 ${foundGallery}/${totalGallery}  (场景 ${Object.keys(p.bg||{}).length}/${Object.keys(g.bg).length}, 人物 ${Object.values(p.char||{}).length}, 档案 ${Object.keys(p.lore||{}).length}/${g.lore.length}, 结局 ${Object.keys(p.endings||{}).length}/4)`);
console.log(` 结局: ${Object.keys(p.endings||{}).join(", ")}`);
console.log(` 称号 ${Object.keys(p.titles||{}).length}/${G.STORY.titles.length}: ${Object.entries(p.titles||{}).map(([k,v])=>k).join(", ")}`);
console.log(` 番外已读: ${Object.keys(p.extras||{}).join(", ")}`);
console.log(` 通关次数: ${p.clears}`);

/* ---------- 断言 ---------- */
let fail = 0;
const want = (cond, msg) => { if (!cond) { console.log(" ✗ " + msg); fail++; } };
results.forEach(r => want(r.end !== "timeout" && r.end !== "queue-end" && r.end !== "no-state", `${r.line}/${r.strategy} 没有走到结局: ${r.end}`));
want(results.filter(r => r.line === "wan" && r.strategy === "high")[0].end === "he", "万宁线最高好感应到 HE");
want(results.filter(r => r.line === "wan" && r.strategy === "low")[0].end === "be", "万宁线最低好感应到 BE");
want(results.filter(r => r.line === "jiang" && r.strategy === "high")[0].end === "he", "江野线最高好感应到 HE");
want(results.filter(r => r.line === "jiang" && r.strategy === "low")[0].end === "be", "江野线最低好感应到 BE");
want(exLaowan.end === "extra", "番外《老万的十年》走不完: " + exLaowan.end);
want(exS2.end === "extra", "番外《哥哥的柜子》走不完: " + exS2.end);
want(exYanhua.end === "extra", "彩蛋《烟花》走不完: " + exYanhua.end);
want(exYanhua.texts >= 15, "《烟花》正文太短: " + exYanhua.texts + " 句");
want(exJujia.end === "extra", "彩蛋《居家情事》走不完: " + exJujia.end);
want(exJujia.texts >= 55, "《居家情事》正文太短，原稿可能没接进来: " + exJujia.texts + " 句");
want(!!p.extras.yanhua && !!p.extras.jujia, "两篇彩蛋都读过才点亮「原稿」称号");
want(!!p.titles.raw, "读完两篇彩蛋应解锁称号「原稿」");
want(!!p.titles.newyear, "读完《烟花》应解锁称号「新年快乐」");
want(!!p.titles.collar, "读完《居家情事》应解锁称号「项圈」");
want(!G.STORY.titles.some(t => t.id === "shadow"), "称号「影子」应已移除");
want(!G.STORY.titles.some(t => t.cond === "realHE" || t.cond === "s2"), "不应再有称号挂 realHE / s2 条件");
want(G.STORY.titles.length === 15, "称号总数应为 15，当前 " + G.STORY.titles.length);
want(!!p.endings.hidden, "读完《老万的十年》应解锁隐藏结局");

/* ---------- 彩蛋门槛：必须走完「同一条线」的三个结局 ---------- */
const P = G.__getProgress();
const endsSnapshot = JSON.stringify(P.ends || {});
const w = { "wan:he": true, "wan:normal": true, "wan:be": true };
const j = { "jiang:he": true, "jiang:normal": true, "jiang:be": true };
const gate = (ends) => { P.ends = ends; return { yanhua: G.extraUnlocked("yanhua"), jujia: G.extraUnlocked("jujia"),
  wanTitle: G.condMet("wanAllEnds"), jiangTitle: G.condMet("jiangAllEnds") }; };

let r = gate({});
want(!r.yanhua && !r.jujia, "一条结局都没走时，两篇彩蛋都不该开");
r = gate({ "wan:he": true, "jiang:he": true });
want(!r.yanhua && !r.jujia, "只有 HE 时，两篇彩蛋都不该开");
r = gate({ "wan:he": true, "wan:normal": true, "jiang:he": true, "jiang:normal": true, "jiang:be": true });
want(r.yanhua && !r.jujia, "江野线三条走完应开《烟花》且不开《居家情事》");
want(r.jiangTitle && !r.wanTitle, "江野线全结局称号应亮，万宁线不应亮");
r = gate(Object.assign({}, w, { "jiang:he": true, "jiang:normal": true }));
want(r.jujia && !r.yanhua, "万宁线三条走完应开《居家情事》，江野线没走完《烟花》不该开");
r = gate(Object.assign({}, w, j));
want(r.yanhua && r.jujia && r.wanTitle && r.jiangTitle, "两条线各三条全走完，两篇彩蛋与两个称号应全亮");
// 隐藏结局不在单线里算，混进来也不该替代普通结局
r = gate({ "wan:he": true, "wan:be": true, "wan:hidden": true });
want(!r.jujia, "隐藏结局不能顶替万宁线的普通结局");
P.ends = JSON.parse(endsSnapshot);

// 《烟花》要有自己的背景图
const yh = G.STORY.extras.yanhua.nodes;
const yhBg = yh.find(n => n.t === "bgimg" && n.key);
want(!!yhBg && !!G.STORY.assets.bg[yhBg.key], "《烟花》没有接入背景图: " + (yhBg && yhBg.key));
want(!!G.STORY.gallery.bg[yhBg.key], "《烟花》背景图没进图鉴: " + (yhBg && yhBg.key));

// 全篇不应再出现分级标记（18+ 唯一版本）
const storyText = fs.readFileSync(path.join(GAME, "story.js"), "utf8");
want(!/\ba: 1\b/.test(storyText), "story.js 里仍有 a: 1 分级标记");
want(!/\bs: 1\b/.test(storyText), "story.js 里仍有 s: 1 分级标记");

// 鸣谢页数据完整
const cr = G.STORY.credits || {};
want((cr.music || []).length === 5, "鸣谢页应列 5 首 BGM");
want((cr.sfx || []).length === 3, "鸣谢页应列 3 个音效");
want([...(cr.music || []), ...(cr.sfx || [])].every(m => m.license && m.url && m.author),
  "鸣谢页每条素材都要有 授权/作者/来源链接");

// 界面函数不报错
["showTitle", "showGallery", "showTitles", "showExtras", "showLineSelect",
 "showCredits"].forEach(fn => {
  try { G[fn](); } catch (e) { console.log(" ✗ " + fn + " 报错: " + e.message); fail++; }
});

console.log(fail === 0 ? "\n全部检查通过 ✓" : `\n有 ${fail} 项未通过 ✗`);
process.exit(fail === 0 ? 0 : 1);
