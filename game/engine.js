/* ============================================================
   engine.js —— 游戏引擎（我维护，你一般不用改）
   ------------------------------------------------------------
   流程：封面 → 视角选择 → 入场问卷 → 正文 → 结局分歧 → 结算
       封面 → 番外篇（解锁后）→ 番外正文 → 番外结算
       封面 → 图鉴 / 称号（跨周目累积）
   支持：
     - 问卷变体(qvar)、好感结算、选项分支、自动存档/继续
     - 立绘(char)、背景图(bgimg)、背景音乐(bgm)、音效(sfx)
     - 多结局分歧(endcheck)、隐藏 flag
     - 图鉴收集（场景/人物/档案/结局）、称号解锁
   操作：点击 / 空格 / 回车 推进文字（全屏任意位置可点）
   ============================================================ */

const SAVE_KEY = "xundao_demo_v1";
const COL_KEY = "xundao_collect_v1";
const AGE_KEY = "xundao_ageack_v1";      // 首屏年龄提示是否已确认（本机记忆）
let ageAcked = (function(){ try{ return localStorage.getItem(AGE_KEY) === "1"; }catch(e){ return false; } })();
let state = null;
let typingTimer = null;

/* ============================================================
   一、存档
   ============================================================ */
function save(){ if(state) { try{ localStorage.setItem(SAVE_KEY, JSON.stringify(state)); }catch(e){} } }
function load(){ try{ const s=localStorage.getItem(SAVE_KEY); return s?JSON.parse(s):null; }catch(e){ return null; } }
function hasSave(){ return !!load(); }
function clearSave(){ try{ localStorage.removeItem(SAVE_KEY); }catch(e){} state=null; showTitle(); }

/* ============================================================
   二、收集存档（图鉴 / 称号 / 结局，跨周目累积，不随「清除存档」清空）
   ============================================================ */
function blankCol(){
  return { bg:{}, char:{}, lore:{}, endings:{}, titles:{}, extras:{}, lines:{}, he:{},
           ends:{},          // 每条线分别记结局："wan:he" / "jiang:be" ……（彩蛋解锁用）
           clears:0 };
}
let progress = blankCol();
function loadCol(){
  try{
    const s = localStorage.getItem(COL_KEY);
    const raw = s ? JSON.parse(s) : null;
    progress = raw ? Object.assign(blankCol(), raw) : blankCol();
    if(raw && !raw.ends){
      // 旧存档迁移：HE 本来就是分线记的，可以无歧义补回；普通 / BE 当年没分线，只能重走
      progress.ends = {};
      for(const line of ["wan","jiang"]) if(progress.he && progress.he[line]) progress.ends[line+":he"] = true;
      saveCol();
    }
  }catch(e){ progress = blankCol(); }
}
function saveCol(){ try{ localStorage.setItem(COL_KEY, JSON.stringify(progress)); }catch(e){} }
function resetCol(){
  if(!confirm("确定清空所有收集记录？（图鉴、称号、结局解锁都会消失，剧情存档不受影响）")) return;
  progress = blankCol(); saveCol(); showTitle();
}

/* 图鉴总量 */
function galleryCount(){
  const g = STORY.gallery || {bg:{},char:{},lore:[],ending:[]};
  const bg = Object.keys(g.bg||{}).length;
  let ch = 0;
  for(const w of Object.keys(g.char||{})) ch += Object.keys(g.char[w]).length;
  return { bg, char: ch, lore: (g.lore||[]).length, ending: (g.ending||[]).length,
           total: bg + ch + (g.lore||[]).length + (g.ending||[]).length };
}
function galleryFound(){
  const g = STORY.gallery || {bg:{},char:{}};
  let ch = 0;
  for(const w of Object.keys(g.char||{})){
    for(const p of Object.keys(g.char[w])) if(progress.char[w+":"+p]) ch++;
  }
  return {
    bg: Object.keys(progress.bg||{}).length,
    char: ch,
    lore: Object.keys(progress.lore||{}).length,
    ending: Object.keys(progress.endings||{}).length
  };
}

/* 一条线能走出的结局类型（隐藏结局是番外，不算在单条线里） */
const LINE_ENDINGS = ["he", "normal", "be"];

/* 某条线的结局是否已全部走完 */
function lineEndsDone(line){
  const e = progress.ends || {};
  return LINE_ENDINGS.every(t => !!e[line + ":" + t]);
}
function lineEndsCount(line){
  const e = progress.ends || {};
  return LINE_ENDINGS.filter(t => !!e[line + ":" + t]).length;
}

/* 称号条件判定 */
function condMet(id){
  const p = progress;
  const g = galleryCount(), f = galleryFound();
  switch(id){
    case "anyEnding":  return Object.keys(p.endings||{}).length > 0;
    case "normalEnd":  return !!p.endings.normal;
    case "beEnd":      return !!p.endings.be;
    case "wanHE":      return !!p.he.wan;
    case "jiangHE":    return !!p.he.jiang;
    case "bothLines":  return !!(p.lines.wan && p.lines.jiang);
    case "lore8":      return f.lore >= 8;
    case "allGallery": return (f.bg+f.char+f.lore+f.ending) >= g.total;
    case "laowan":     return !!p.extras.laowan;
    case "jujia":      return !!p.extras.jujia;
    case "yanhua":     return !!p.extras.yanhua;
    case "rawread":    return !!(p.extras.yanhua && p.extras.jujia);
    case "allEndings": return ["he","normal","be","hidden"].every(k=>!!p.endings[k]);
    case "wanAllEnds":   return lineEndsDone("wan");
    case "jiangAllEnds": return lineEndsDone("jiang");
    default: return false;
  }
}
/* 检查称号；返回本次新解锁的称号数组 */
function checkTitles(){
  const newly = [];
  for(const t of (STORY.titles||[])){
    if(progress.titles[t.id]) continue;
    if(condMet(t.cond)){ progress.titles[t.id] = true; newly.push(t); }
  }
  if(newly.length){ saveCol(); }
  return newly;
}

/* 收录场景 / 人物 / 档案 */
function collectBg(key){
  const g = (STORY.gallery && STORY.gallery.bg) || {};
  if(!g[key] || progress.bg[key]) return;
  progress.bg[key] = true; saveCol(); checkTitles();
}
function collectChar(who, pose){
  const g = (STORY.gallery && STORY.gallery.char) || {};
  if(!g[who] || !g[who][pose]) return;
  const k = who + ":" + pose;
  if(progress.char[k]) return;
  progress.char[k] = true; saveCol(); checkTitles();
}
function collectLore(txt){
  const list = (STORY.gallery && STORY.gallery.lore) || [];
  let got = false;
  for(const e of list){
    if(progress.lore[e.id]) continue;
    if((e.kw||[]).some(k=>txt.indexOf(k) >= 0)){ progress.lore[e.id] = true; got = true; }
  }
  if(got){ saveCol(); checkTitles(); }
}

/* ============================================================
   三、门槛（固定取 story.js 的默认值）
   ============================================================ */
function getThresholds(){
  const def = STORY.thresholds || { he:12, normal:5, hidden:-1 };
  return Object.assign({ he:12, normal:5, hidden:-1 }, def);
}

function freshState(line, mode){
  return { screen:"quiz", line, mode:mode||"main", extraKey:null,
           profile:{}, favor:0, flags:{}, queue:[], idx:0, log:[], qi:0,
           ending:null, done:false };
}

/* ============================================================
   四、HUD
   ============================================================ */
function hudTitle(){
  if(!state) return "";
  if(state.mode === "extra"){
    const ex = (STORY.extras||{})[state.extraKey];
    return ex ? ("番外 · " + ex.title) : "番外";
  }
  return (STORY.meta.lineNames && STORY.meta.lineNames[state.line]) || "";
}
function setHud(){
  const hud = document.getElementById('hud');
  if(!state || (!state.line && !state.extraKey)){ hud.innerHTML=""; return; }
  // 不在 HUD 实时显示好感度数值，避免玩家盯着数值做决策；章末结算时才给反馈
  hud.innerHTML = `
    <div class="hud-left">${hudTitle()}<span class="hud-adult" title="本作含成人向内容，仅限 18 岁以上">18+</span></div>
    <div class="hud-right">
      <button class="mini" onclick="showGallery()">图鉴</button>
      <button class="mini" onclick="showTitle()">返回封面</button>
    </div>`;
}

/* ============================================================
   五、封面
   ============================================================ */
function showTitle(){
  state = null;
  typingTimer = null;
  loadCol();                                   // 每次回封面刷新收集状态
  checkTitles();                               // 顺带结算一下可能漏掉的称号
  const cont = hasSave();
  const g = galleryCount(), f = galleryFound();
  const found = f.bg + f.char + f.lore + f.ending;
  const tGot = Object.keys(progress.titles||{}).length;
  const extrasUnlocked = (STORY.extras ? Object.keys(STORY.extras).filter(k=>extraUnlocked(k)).length : 0);
  const extrasTotal = STORY.extras ? Object.keys(STORY.extras).length : 0;

  document.getElementById('stage').innerHTML = `
    <div class="cover">
      <div class="scrim"></div>
      <div class="cover-inner">
        <div class="cover-top">
          <span class="cover-kicker">${STORY.meta.subtitle}</span>
          <span class="cover-rating" title="本作含成人向内容">18+</span>
        </div>
        <h1 class="cover-title">${STORY.meta.title}</h1>
        <div class="cover-rule"></div>
        <div class="cover-quote">雾川的雪落下来，没有一个人是干干净净地走的。</div>
        <div class="cover-btns">
          ${cont ? '<button class="btn primary" onclick="startContinue()">继续上次</button>' : ''}
          <button class="btn ${cont?'':'primary'}" onclick="showLineSelect()">${cont?'新的开始':'开始'}</button>
          <button class="btn" onclick="showExtras()">番外篇<span class="btn-badge">${extrasUnlocked}/${extrasTotal}</span></button>
          <button class="btn" onclick="showGallery()">图鉴<span class="btn-badge">${found}/${g.total}</span></button>
          <button class="btn" onclick="showTitles()">称号<span class="btn-badge">${tGot}/${(STORY.titles||[]).length}</span></button>
        </div>
        <div class="cover-devlink">
          <a href="javascript:void(0)" onclick="showCredits()">鸣谢与版权</a>
          <span class="sep">·</span>
          <a href="javascript:void(0)" onclick="resetCol()">清空收集记录</a>
        </div>
      </div>
    </div>`;

  applyBgImg("title_stairs");
  applyBgm("title");
  setHud();
}
/* ---------- 首屏年龄提示（只出现一次，本机记忆） ---------- */
function ageNotice(){
  if(ageAcked) return;
  closeAgeGate();
  const m = document.createElement("div");
  m.className = "age-mask";
  m.innerHTML = `
    <div class="age-box">
      <div class="age-kicker">成人向内容</div>
      <div class="age-title">18 岁以下请勿进入</div>
      <div class="age-text">本作《驯刀》全篇为成人向作品</div>
      <div class="age-warn">继续即表示你已满 18 周岁，并自愿阅读上述内容。</div>
      <div class="age-btns">
        <button class="btn" onclick="leaveSite()">我未满 18 岁，离开</button>
        <button class="btn primary" onclick="ackAge()">我已满 18 岁，进入</button>
      </div>
    </div>`;
  document.body.appendChild(m);
}
function ackAge(){
  ageAcked = true;
  try{ localStorage.setItem(AGE_KEY, "1"); }catch(e){}
  closeAgeGate();
}
function leaveSite(){
  closeAgeGate();
  document.body.innerHTML =
    '<div class="bye-wrap"><div class="bye">' +
    '<div class="bye-t">已停止载入</div>' +
    '<div class="bye-s">本作仅面向成年读者。感谢你的克制。</div></div></div>';
}
function closeAgeGate(){
  const m = document.querySelector(".age-mask");
  if(m) m.remove();
}

function startContinue(){
  const s = load(); if(!s){ showTitle(); return; }
  state = s;
  setHud();
  if(state.screen === "story"){ renderNode(); }
  else if(state.screen === "quiz"){ renderQuiz(); }
  else { showTitle(); }
}

/* ============================================================
   六、视角选择
   ============================================================ */
function showLineSelect(){
  state = null;
  document.getElementById('stage').innerHTML = `
    <div class="ls-wrap">
      <div class="ls-title">选定你的视角</div>
      <div class="ls-cards">
        <div class="ls-card wan" onclick="startQuiz('wan')">
          <div class="ls-name">万宁</div>
          <div class="ls-tag">驯化与救赎</div>
          <div class="ls-desc">19岁复读高三。心思通透，擅长拿捏人心。她在等他来——明知是刀，也伸手接。</div>
        </div>
        <div class="ls-card jiang" onclick="startQuiz('jiang')">
          <div class="ls-name">江野</div>
          <div class="ls-tag">复仇与沦陷</div>
          <div class="ls-desc">22岁刚出狱。回雾川讨债，债主已死，恨转向仇人之女。可那把刀，怎么也落不下去。</div>
        </div>
      </div>
      <button class="btn ghost" onclick="showTitle()">返回封面</button>
    </div>`;
  setHud();
}

/* ============================================================
   七、入场问卷
   ============================================================ */
function startQuiz(line){
  state = freshState(line, "main"); save();
  renderQuiz();
}
function renderQuiz(){
  const Qs = STORY.quiz[state.line];
  const i = state.qi;
  if(i >= Qs.length){ // 问卷完成
    state.favor = sumQuizFavor();
    state.screen = "story";
    save();
    enterStory();
    return;
  }
  if(i === 0){ applyBgm("quiz_cold"); }
  const Q = Qs[i];
  const optsHtml = Q.opts.map((o,k)=>
    `<button class="q-opt" onclick="answerQuiz(${k})">
       <span class="q-opt-label">${o.label}</span>
     </button>`).join('');
  document.getElementById('stage').innerHTML = `
    <div class="quiz-wrap">
      <div class="quiz-progress">入场登记 · ${i+1} / ${Qs.length}</div>
      <div class="quiz-q">${Q.text}</div>
      <div class="quiz-opts">${optsHtml}</div>
    </div>`;
  setHud();
}
function answerQuiz(k){
  const Q = STORY.quiz[state.line][state.qi];
  const o = Q.opts[k];
  state.profile[Q.id] = String.fromCharCode(65+k); // A/B/C/D
  state.log.push({k:"quiz", id:Q.id, ans:o.label, favor:o.favor});
  state.qi++;
  save();
  renderQuiz();
}
function sumQuizFavor(){
  let f=0; const Qs = STORY.quiz[state.line];
  for(const q of Qs){
    const a = state.profile[q.id]; if(!a) continue;
    const idx = a.charCodeAt(0)-65;
    if(q.opts[idx]) f += q.opts[idx].favor||0;
  }
  return f;
}

/* ============================================================
   八、正文推进
   ============================================================ */
function enterStory(){
  state.queue = STORY.lines[state.line].slice();
  state.idx = 0;
  state.screen = "story";
  save();
  renderNode();
}

// 渲染当前节点（自动跳过 bg/qvar/bgimg/char/bgm/sfx 等非展示节点）
function renderNode(){
  while(state.idx < state.queue.length){
    const n = state.queue[state.idx];

    if(n.t==="bg"){ applyBg(n.c); state.idx++; save(); continue; }
    if(n.t==="bgimg"){ applyBgImg(n.key); state.idx++; save(); continue; }
    if(n.t==="char"){ applyChar(n.who, n.pose); state.idx++; save(); continue; }
    if(n.t==="bgm"){ if(n.stop){ stopBgm(); } else { applyBgm(n.key); } state.idx++; save(); continue; }
    if(n.t==="sfx"){ playSfx(n.key); state.idx++; save(); continue; }
    if(n.t==="flag"){
      if(!state.flags) state.flags={};
      state.flags[n.key] = (n.val===undefined?true:n.val);
      state.idx++; save(); continue;
    }
    if(n.t==="qvar"){
      const key = state.profile[n.by] || Object.keys(n.map)[0];
      const repl = n.map[key] || [];
      state.queue.splice(state.idx, 1, ...repl); // 用变体替换 qvar 节点
      save();
      continue; // 不递增 idx，处理替换进来的第一个节点
    }
    if(n.t==="endcheck"){
      // 判定顺序：ifFlag（隐藏 flag，可指定 false）→ min（好感门槛）→ else
      const thr = getThresholds();
      const flags = state.flags || {};
      let picked = null;
      for(const c of (n.cases||[])){
        if(c.ifFlag){
          const want = (c.flagVal===undefined?true:c.flagVal);
          if((!!flags[c.ifFlag]) === want){ picked = c; break; }
          continue;
        }
        if(c.else){ picked = c; continue; }
        if(state.favor >= (c.min ?? thr.he)){ picked = c; break; }
      }
      if(!picked) picked = (n.cases||[]).find(c=>c.else) || { branch:[{t:"end"}] };
      state.queue.splice(state.idx, 1, ...(picked.branch||[{t:"end"}]));
      save();
      continue; // 用分支替换 endcheck，继续处理
    }
    if(n.t==="end"){ showEnd(); return; }
    if(n.t==="text"){ renderText(n); return; }
    if(n.t==="choice"){ renderChoice(n); return; }
    state.idx++; // 未知类型，跳过
  }
  showEnd();
}

function applyBg(c){
  const el = document.getElementById('bg');
  // 底色 + 一层很淡的中心光晕：没有背景图时（审讯室、闪回）也不会是一块死黑
  el.style.backgroundColor = c || "#0a0b0d";
  el.style.backgroundImage =
    "radial-gradient(ellipse 86% 64% at 50% 36%, rgba(255,244,222,.115) 0%, rgba(255,244,222,.035) 45%, rgba(0,0,0,0) 74%)";
}

/* ---------- 背景图 ---------- */
function applyBgImg(key){
  const el = document.getElementById('bgimg');
  if(!el) return;
  const path = (STORY.assets && STORY.assets.bg && STORY.assets.bg[key]) || "";
  if(path){
    el.style.backgroundImage = `url("${path}")`;
    el.style.backgroundSize = "cover";
    el.style.backgroundPosition = "center";
    el.style.opacity = "1";
    collectBg(key);
  } else {
    el.style.backgroundImage = "none";  // 无素材时透明，露出底层背景色
    el.style.opacity = "0";
  }
}

/* ---------- 立绘 ---------- */
// who=null 清空所有立绘；who="jiang"|"wan" 显示对应角色的指定 pose
function applyChar(who, pose){
  const layer = document.getElementById('chars');
  if(!layer) return;
  if(who == null){ layer.innerHTML = ""; return; }
  const pos = pose || "normal";
  const charPath = STORY.assets && STORY.assets.char && STORY.assets.char[who] && STORY.assets.char[who][pos];
  layer.innerHTML = "";
  if(!charPath) return;  // 无素材不显示立绘，留位
  collectChar(who, pos);
  const side = (who==="jiang") ? "right" : "left";
  const div = document.createElement('div');
  div.className = `char ${side}`;
  div.style.backgroundImage = `url("${charPath}")`;
  layer.appendChild(div);
}

/* ---------- 背景音乐 ---------- */
let currentBgmKey = null;
function applyBgm(key){
  const path = (STORY.assets && STORY.assets.bgm && STORY.assets.bgm[key]) || "";
  if(!path){ stopBgm(); return; }  // 无素材静音
  if(currentBgmKey === key) return; // 已在播放，不重复
  const a = document.getElementById('bgm');
  if(!a) return;
  a.src = path;
  a.loop = true;
  a.volume = 0.38;                 // 背景乐压低，让文字在前
  a.play().catch(()=>{});          // 自动播放被浏览器拦截时静默失败
  currentBgmKey = key;
}
function stopBgm(){
  const a = document.getElementById('bgm');
  if(a){ a.pause(); a.currentTime = 0; }
  currentBgmKey = null;
}

/* ---------- 音效（单次） ---------- */
function playSfx(key){
  const path = (STORY.assets && STORY.assets.sfx && STORY.assets.sfx[key]) || "";
  if(!path) return;
  const a = document.getElementById('sfx');
  if(!a) return;
  a.src = path;
  a.loop = false;
  a.volume = 0.5;
  a.play().catch(()=>{});
}

function renderText(n){
  collectLore(n.txt || "");
  detectEnding(n.txt || "");
  const stage = document.getElementById('stage');
  const sp = n.sp ? `<div class="speaker">${n.sp}</div>` : "";
  // 不在 dialog 上绑 onclick，改由全局 click 监听统一处理（全屏可点推进）
  stage.innerHTML = `
    <div class="dialog">
      ${sp}
      <div class="text ${n.cls||""}" id="txt"></div>
      <div class="cursor">▽</div>
    </div>`;
  typewriter(n.txt);
}

/* 结局识别：靠结局标题文本判定（不用改剧情文件） */
const ENDING_MAP = [
  { re: /^HE · 《驯刀》/,        type:"he" },
  { re: /^普通结局 · 《各自过冬》/, type:"normal" },
  { re: /^BE · 《野狗的死法》/,   type:"be" },
  { re: /^隐藏结局 · 《老万的十年》/, type:"hidden" }
];
function detectEnding(txt){
  if(state.mode !== "main") return;
  for(const e of ENDING_MAP){
    if(e.re.test(txt)){ state.ending = { type: e.type, line: state.line }; return; }
  }
}

function renderChoice(n){
  const stage = document.getElementById('stage');
  // 不显示好感度数值，也不显示选项补充说明 —— 让玩家凭直觉选
  const optsHtml = n.opts.map((o,k)=>
    `<button class="c-opt" onclick="choose(${k})">
       <span class="c-opt-label">${o.label}</span>
     </button>`).join('');
  stage.innerHTML = `
    <div class="choice-wrap">
      <div class="choice-q">${n.q}</div>
      <div class="choice-opts">${optsHtml}</div>
    </div>`;
}

function choose(k){
  const n = state.queue[state.idx]; // choice 节点
  const o = n.opts[k];
  state.favor += o.favor;
  state.log.push({k:"choice", q:n.q, ans:o.label, favor:o.favor});
  // 把 branch 节点插到 choice 之后
  if(o.branch && o.branch.length){
    state.queue.splice(state.idx+1, 0, ...o.branch);
  }
  state.idx++; // 越过 choice，进入 branch
  save();
  renderNode();
}

function advance(){
  if(typingTimer){ // 正在打字 → 直接显示完整
    clearInterval(typingTimer); typingTimer=null;
    const el=document.getElementById('txt');
    if(el){ el.textContent = el.dataset.full; }
    return;
  }
  state.idx++;
  save();
  renderNode();
}

function typewriter(text){
  const el = document.getElementById('txt');
  if(!el) return;
  el.dataset.full = text;
  el.textContent = "";
  let i=0;
  typingTimer = setInterval(()=>{
    i += 2;
    el.textContent = text.slice(0, i);
    if(i >= text.length){ clearInterval(typingTimer); typingTimer=null; }
  }, 16);
}

/* ============================================================
   九、结算（正篇结局 / 番外结局）
   ============================================================ */
const ENDING_META = {
  he:     { name:"HE · 《驯刀》",        line:"郑维成落网，父亲的案子翻了。" },
  normal: { name:"普通 · 《各自过冬》",  line:"真相大白，两个人却各自走了一个方向。" },
  be:     { name:"BE · 《野狗的死法》",  line:"他一个人去把那笔债讨完了。" },
  hidden: { name:"隐藏 · 《老万的十年》", line:"一封没寄出去的信。" }
};

function logHtml(){
  // 选择回溯里只列选项本身，不暴露每个选项的好感加减
  return (state.log||[]).map(l=>{
    if(l.k==="quiz") return `<div class="log-row"><span class="log-tag">登记</span> ${l.id.toUpperCase()} → ${l.ans}</div>`;
    if(l.k==="choice") return `<div class="log-row"><span class="log-tag">选择</span> ${l.ans}</div>`;
    return "";
  }).join("");
}

function showEnd(){
  const isExtra = state.mode === "extra";
  if(isExtra) return showExtraEnd();

  state.screen = "end";
  applyChar(null);
  const e = state.ending || { type:"normal", line: state.line };
  const meta = ENDING_META[e.type] || ENDING_META.normal;

  // 收集结算
  const firstTime = !progress.endings[e.type];
  progress.endings[e.type] = true;
  progress.lines[state.line] = true;
  if(!progress.ends) progress.ends = {};
  progress.ends[state.line + ":" + e.type] = true;   // 单条线的结局进度（彩蛋解锁用）
  if(e.type === "he") progress.he[state.line] = true;
  if(!state.done){ progress.clears = (progress.clears||0) + 1; state.done = true; }
  saveCol();
  const newly = checkTitles();
  const lineDone = lineEndsDone(state.line);

  document.getElementById('stage').innerHTML = `
    <div class="end-wrap">
      <div class="end-kicker">${firstTime ? "结局解锁" : "结局回顾"}</div>
      <div class="end-title">${meta.name}</div>
      <div class="end-line">${meta.line}</div>
      ${newly.length ? `<div class="unlock-box">
          <div class="unlock-head">称号解锁</div>
          ${newly.map(t=>`<div class="unlock-row"><b>${t.name}</b><span>${t.desc}</span></div>`).join('')}
        </div>` : ''}
      <div class="end-sub">选择回溯</div>
      <div class="end-log">${logHtml() || '<div class="log-row">（本条线没有留下记录）</div>'}</div>
      <div class="end-note">${lineDone
        ? `这条线的三个结局都走完了。番外篇里多了一页手稿——${state.line === "jiang" ? "《烟花》" : "《居家情事》"}。`
        : `这条线还差 ${3 - lineEndsCount(state.line)} 个结局。HE / 普通 / BE 三个都走完，番外篇会多一页手稿。`}</div>
      <div class="btn-row">
        <button class="btn primary" onclick="showExtras()">番外篇</button>
        <button class="btn" onclick="showLineSelect()">开另一条线</button>
        <button class="btn ghost" onclick="clearSave();showLineSelect()">重玩本线</button>
        <button class="btn ghost" onclick="showTitle()">返回封面</button>
      </div>
    </div>`;
  setHud();
}

function showExtraEnd(){
  state.screen = "end";
  applyChar(null);
  const key = state.extraKey;
  const ex = (STORY.extras||{})[key] || { title:"番外" };
  progress.extras[key] = true;
  if(key === "laowan") progress.endings.hidden = true;
  saveCol();
  const newly = checkTitles();
  document.getElementById('stage').innerHTML = `
    <div class="end-wrap">
      <div class="end-kicker">番外</div>
      <div class="end-title">《${ex.title}》 · 完</div>
      <div class="end-line">${
        key==="laowan" ? "他把这十年写下来了。没寄出去。" :
        key==="yanhua" ? "爆竹还在响。雪落在两个人身上，谁也没动。" :
        key==="jujia" ? "灯一直亮着。这一次，没有人假装没看见。" :
        "刀还在。刀柄在你手里。"}</div>
      ${newly.length ? `<div class="unlock-box">
          <div class="unlock-head">称号解锁</div>
          ${newly.map(t=>`<div class="unlock-row"><b>${t.name}</b><span>${t.desc}</span></div>`).join('')}
        </div>` : ''}
      <div class="end-note">已收录到番外列表。</div>
      <div class="btn-row">
        <button class="btn primary" onclick="showExtras()">番外列表</button>
        <button class="btn ghost" onclick="showTitle()">返回封面</button>
      </div>
    </div>`;
  setHud();
}

/* ============================================================
   九·五、鸣谢与版权
   ============================================================ */
/* 素材页链接：显示成「站点 / 曲名」，完整地址仍在 href 里 */
function siteOf(u){
  if(u.includes("opengameart.org")) return "opengameart.org";
  if(u.includes("freemusicarchive.org")) return "freemusicarchive.org";
  return "";
}
function showCredits(){
  const cr = STORY.credits || {};
  const TW_ICO = `<svg class="tw-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M23.95 4.57a10 10 0 0 1-2.82.77 4.96 4.96 0 0 0 2.16-2.72 9.9 9.9 0 0 1-3.13 1.2 4.92 4.92 0 0 0-8.38 4.48A13.94 13.94 0 0 1 1.64 3.16a4.92 4.92 0 0 0 1.52 6.57 4.9 4.9 0 0 1-2.23-.61v.06a4.92 4.92 0 0 0 3.95 4.83 4.9 4.9 0 0 1-2.22.08 4.93 4.93 0 0 0 4.6 3.42A9.87 9.87 0 0 1 0 19.54a13.9 13.9 0 0 0 7.55 2.21c9.06 0 14.02-7.5 14.02-14.01 0-.21 0-.42-.02-.63a10 10 0 0 0 2.4-2.54z"/></svg>`;
  const roles = (cr.roles||[]).map(r=>{
    const tw = r.twitter
      ? `<span class="cr-tw">${TW_ICO}<span>@${r.twitter}</span></span>`
      : '';
    return `<div class="cr-row"><div class="cr-role">${r.role}</div><div class="cr-name">${r.name}${tw}</div></div>`;
  }).join('');

  const musicRow = (m)=>`
    <div class="cr-item">
      <div class="cr-item-head">
        <span class="cr-tag">${m.license}</span>
        <span class="cr-item-name">${m.name}</span>
      </div>
      <div class="cr-item-meta">
        <span>${m.author}</span><span class="dot">·</span><span>${m.use}</span>
      </div>
      ${m.edit?`<div class="cr-item-note">本作处理：${m.edit}</div>`:''}
      <a class="cr-link" href="${m.url}" target="_blank" rel="noopener">${siteOf(m.url) ? siteOf(m.url) + " / " + m.name : m.url}</a>
    </div>`;

  const music = (cr.music||[]).map(musicRow).join('');
  const sfx = (cr.sfx||[]).map(musicRow).join('');
  const texts = (cr.texts||[]).map(t=>`<li>${t}</li>`).join('');

  document.getElementById('stage').innerHTML = `
    <div class="panel-wrap">
      <div class="panel-head">
        <div class="panel-title">鸣谢与版权</div>
        <button class="mini" onclick="showTitle()">关闭</button>
      </div>
      <div class="panel-body">
        <div class="cr-sec">
          <div class="cr-h">制作</div>
          <div class="cr-list">${roles}</div>
        </div>

        <div class="cr-sec">
          <div class="cr-h">音乐 · 5 首</div>
          <div class="cr-sub">取自 Free Music Archive。四首 CC0 1.0（公有领域贡献），一首 CC BY-NC-SA 4.0（须署名、非商业、相同方式共享）。逐条列明作者与出处。</div>
          <div class="cr-items">${music}</div>
        </div>

        <div class="cr-sec">
          <div class="cr-h">音效 · 3 个</div>
          <div class="cr-items">${sfx}</div>
        </div>

        <div class="cr-sec">
          <div class="cr-h">图像</div>
          <div class="cr-note">
            立绘 8 张、背景图 8 张均由本项目使用 AI 图像生成自制，未经第三方素材库。
            背景为写实风格的雪夜老楼与室内场景，人物立绘为半写实厚涂。
          </div>
        </div>

        <div class="cr-sec">
          <div class="cr-h">声明</div>
          <ul class="cr-texts">${texts}</ul>
        </div>

        <div class="cr-foot">
          ${STORY.meta.title} · ${STORY.meta.version}<br>
          鸣谢页随素材变动更新；如发现署名错漏，请告知。
        </div>
        <div class="panel-tip">返回封面 → 左下角「鸣谢与版权」可再进</div>
      </div>
    </div>`;
  setHud();
}

/* ============================================================
   十、番外
   ============================================================ */
function extraUnlocked(key){
  const ex = (STORY.extras||{})[key];
  if(!ex) return false;
  if(ex.cond === "bothHE") return !!(progress.he.wan && progress.he.jiang);
  if(ex.cond === "anyHE")  return !!(progress.he.wan || progress.he.jiang);
  if(ex.cond === "wanAllEnds")   return lineEndsDone("wan");
  if(ex.cond === "jiangAllEnds") return lineEndsDone("jiang");
  if(ex.cond === "clear")  return (progress.clears || 0) > 0 || Object.keys(progress.endings||{}).length > 0;
  return true;
}
/* 未解锁时给玩家看条件：单线全结局类附上 0/3 进度 */
function extraCondText(key){
  const ex = (STORY.extras||{})[key] || {};
  if(ex.cond === "wanAllEnds" || ex.cond === "jiangAllEnds"){
    const line = ex.cond === "wanAllEnds" ? "wan" : "jiang";
    return `${ex.condText}（已走完 ${lineEndsCount(line)} / 3）`;
  }
  return ex.condText || "尚未解锁";
}
function showExtras(){
  loadCol();                                   // 刷新解锁状态（番外条件依赖单线结局进度）
  const list = Object.keys(STORY.extras||{});
  const items = list.map(k=>{
    const ex = STORY.extras[k];
    const ok = extraUnlocked(k);
    const read = !!progress.extras[k];
    return `
      <div class="ex-card ${ok?'':'locked'}" ${ok?`onclick="startExtra('${k}')"`:''}>
        <div class="ex-top">
          <div class="ex-name">${ok ? ex.title : "？？？"}</div>
          <div class="ex-sub">${ex.sub}${read?' · 已读':''}</div>
        </div>
        <div class="ex-desc">${ok ? ex.desc : extraCondText(k)}</div>
        ${ok ? '<div class="ex-go">进入 →</div>' : '<div class="ex-lock">未解锁</div>'}
      </div>`;
  }).join('');
  document.getElementById('stage').innerHTML = `
    <div class="panel-wrap">
      <div class="panel-head">
        <div class="panel-title">番外篇</div>
        <button class="mini" onclick="showTitle()">关闭</button>
      </div>
      <div class="panel-body">
        <div class="ex-list">${items}</div>
        <div class="panel-tip">番外不看好感度，只看你走到过哪里。</div>
      </div>
    </div>`;
  setHud();
}
function startExtra(key){
  if(!extraUnlocked(key)) return;
  const ex = STORY.extras[key];
  state = freshState("wan", "extra");
  state.extraKey = key;
  state.screen = "story";
  state.queue = (ex.nodes||[]).slice();
  state.idx = 0;
  save();
  setHud();
  renderNode();
}

/* ============================================================
   十一、图鉴
   ============================================================ */
let galleryTab = "bg";
function showGallery(tab){
  if(tab) galleryTab = tab;
  loadCol();
  const g = STORY.gallery || {bg:{},char:{},lore:[],ending:[]};
  const f = galleryFound(), c = galleryCount();
  const tabs = [
    ["bg","场景", f.bg, c.bg],
    ["char","人物", f.char, c.char],
    ["lore","档案", f.lore, c.lore],
    ["ending","结局", f.ending, c.ending]
  ];
  const tabHtml = tabs.map(t=>`<button class="tab ${galleryTab===t[0]?'on':''}" onclick="showGallery('${t[0]}')">${t[1]} <b>${t[2]}/${t[3]}</b></button>`).join('');
  let body = "";

  if(galleryTab === "bg"){
    body = `<div class="grid">` + Object.keys(g.bg).map(k=>{
      const ok = !!progress.bg[k];
      const item = g.bg[k];
      return `<div class="card ${ok?'':'locked'}">
        <div class="thumb bg" style="${ok?`background-image:url('${(STORY.assets.bg||{})[k]}')`:''}"></div>
        <div class="card-name">${ok?item.name:'？？？'}</div>
        <div class="card-desc">${ok?item.desc:'还没走到这里。'}</div>
      </div>`;
    }).join('') + `</div>`;
  }

  if(galleryTab === "char"){
    body = `<div class="grid char-grid">` + Object.keys(g.char).map(who=>
      Object.keys(g.char[who]).map(pose=>{
        const k = who + ":" + pose;
        const ok = !!progress.char[k];
        const item = g.char[who][pose];
        const src = ((STORY.assets.char||{})[who]||{})[pose] || "";
        return `<div class="card ${ok?'':'locked'}">
          <div class="thumb char" style="${ok?`background-image:url('${src}')`:''}"></div>
          <div class="card-name">${ok?item.name:'？？？'}</div>
          <div class="card-desc">${ok?item.desc:'还没见过这一面。'}</div>
        </div>`;
      }).join('')
    ).join('') + `</div>`;
  }

  if(galleryTab === "lore"){
    body = `<div class="lore-list">` + g.lore.map(e=>{
      const ok = !!progress.lore[e.id];
      return `<div class="lore-item ${ok?'':'locked'}">
        <div class="lore-name">${ok?e.name:'？？？'}</div>
        <div class="lore-desc">${ok?e.desc:'还没在故事里碰到这个词。'}</div>
      </div>`;
    }).join('') + `</div>`;
  }

  if(galleryTab === "ending"){
    body = `<div class="ex-list">` + g.ending.map(e=>{
      const ok = !!progress.endings[e.id];
      return `<div class="ex-card ${ok?'':'locked'}">
        <div class="ex-top"><div class="ex-name">${ok?e.name:'？？？'}</div>
        <div class="ex-sub">${ok?'已达成':'未达成'}</div></div>
        <div class="ex-desc">${ok?e.desc:'还没有走到这个结局。'}</div>
      </div>`;
    }).join('') + `</div>`;
  }

  document.getElementById('stage').innerHTML = `
    <div class="panel-wrap">
      <div class="panel-head">
        <div class="panel-title">图鉴 <span class="panel-sub">${f.bg+f.char+f.lore+f.ending} / ${c.total}</span></div>
        <button class="mini" onclick="showTitle()">关闭</button>
      </div>
      <div class="tabs">${tabHtml}</div>
      <div class="panel-body">${body}</div>
    </div>`;
  setHud();
}

/* ============================================================
   十二、称号
   ============================================================ */
function showTitles(){
  loadCol();
  checkTitles();
  const list = STORY.titles || [];
  const got = list.filter(t=>progress.titles[t.id]).length;
  const rows = list.map(t=>{
    const ok = !!progress.titles[t.id];
    return `<div class="title-row ${ok?'':'locked'}">
      <div class="tr-badge">${ok?'★':'·'}</div>
      <div class="tr-main">
        <div class="tr-name">${ok?t.name:'？？？'}</div>
        <div class="tr-desc">${t.desc}</div>
      </div>
    </div>`;
  }).join('');
  document.getElementById('stage').innerHTML = `
    <div class="panel-wrap">
      <div class="panel-head">
        <div class="panel-title">称号 <span class="panel-sub">${got} / ${list.length}</span></div>
        <button class="mini" onclick="showTitle()">关闭</button>
      </div>
      <div class="panel-body">
        <div class="title-list">${rows}</div>
        <div class="panel-tip">称号跨周目累积，清除存档也不会丢。</div>
      </div>
    </div>`;
  setHud();
}

/* ============================================================
   十三、键盘 / 全局点击
   ============================================================ */
document.addEventListener('keydown', e=>{
  if(!state || state.screen!=="story") return;
  if(e.code==="Space" || e.code==="Enter"){ e.preventDefault(); advance(); }
});

/* 全屏点击推进文字：
   - 仅在正文推进阶段响应
   - 选项节点不响应（避免误触跳过选项）
   - 点按钮不响应
*/
document.addEventListener('click', e=>{
  if(!state || state.screen!=="story") return;
  if(e.target.closest('button')) return;
  const n = state.queue[state.idx];
  if(!n) return;
  if(n.t==="choice") return;
  if(n.t==="end") return;
  advance();
});

/* ============================================================
   十四、启动
   ============================================================ */
window.addEventListener('load', ()=>{ loadCol(); showTitle(); ageNotice(); });

/* ---------- 自动测试用（外部读取当前状态，不在界面上露出） ---------- */
function __getState(){ return state; }
function __getProgress(){ return progress; }
