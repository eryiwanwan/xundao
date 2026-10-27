/* ============================================================
   engine.js —— 游戏引擎（我维护，你一般不用改）
   ------------------------------------------------------------
   流程：封面 → 视角选择 → 入场问卷 → 正文 → 结局分歧 → 结算
       封面 → 番外篇（解锁后）→ 番外正文 → 番外结算
       封面 → 图鉴 / 称号（跨周目累积）
   0.9 版新增：
     - 三维数值：好感 favor（0–100）／执念 danger（0–100）／线索 clue（0–5）
     - 结局改由 story.js 的 endings 表登记，endcheck 的 case 直接写 ending
     - 同一段正文只播一次：读过就记下，「跳过已读」可一键掠过旧剧情
     - 结局页复盘三个数值
   ============================================================ */

const SAVE_KEY = "xundao_demo_v2";
const COL_KEY  = "xundao_collect_v1";
const AGE_KEY  = "xundao_ageack_v1";      // 首屏年龄提示是否已确认（本机记忆）
const READ_KEY = "xundao_read_v1";        // 已读正文指纹（跳过已读用）
const SKIP_KEY = "xundao_skip_v1";        // 「跳过已读」开关（本机记忆）

const FAVOR_MAX  = 100;
const DANGER_MAX = 100;
const DANGER_BASE = 20;                   // 起手执念：他本来就带着火
const CLUE_MAX   = 5;

let ageAcked = (function(){ try{ return localStorage.getItem(AGE_KEY) === "1"; }catch(e){ return false; } })();
let skipRead = (function(){ try{ return localStorage.getItem(SKIP_KEY) === "1"; }catch(e){ return false; } })();
let state = null;
let typingTimer = null;

function clampNum(v, lo, hi){ return Math.max(lo, Math.min(hi, v|0)); }

/* ============================================================
   一、存档
   ============================================================ */
/* 存档节流：每推一句都写一次整条队列会卡（尤其手机）。
   现在最多 400ms 落盘一次，离开页面前强制 flush。 */
let saveTimer = null, saveDirty = false;
function save(){
  if(!state) return;
  saveDirty = true;
  if(saveTimer) return;
  saveTimer = setTimeout(()=>{ saveTimer = null; flushSave(); }, 400);
}
function flushSave(){
  if(saveTimer){ clearTimeout(saveTimer); saveTimer = null; }
  if(!saveDirty || !state) return;
  saveDirty = false;
  try{ localStorage.setItem(SAVE_KEY, JSON.stringify(state)); }catch(e){}
}
function saveNow(){ saveDirty = true; flushSave(); }
function load(){ try{ const s=localStorage.getItem(SAVE_KEY); return s?JSON.parse(s):null; }catch(e){ return null; } }
function hasSave(){ return !!load(); }
function clearSave(){
  if(saveTimer){ clearTimeout(saveTimer); saveTimer=null; }
  saveDirty = false;
  try{ localStorage.removeItem(SAVE_KEY); }catch(e){}
  state=null; showTitle();
}

/* ============================================================
   二、收集存档（图鉴 / 称号 / 结局，跨周目累积，不随「清除存档」清空）
   ============================================================ */
const COL_VERSION = 9;
function blankCol(){
  return { v: COL_VERSION,
           bg:{}, char:{}, lore:{}, endings:{}, titles:{}, extras:{}, lines:{}, he:{},
           ends:{},          // 每条线分别记结局："wan:he" / "hidden:platform" ……（彩蛋与称号判定用）
           clears:0, peakFavor:0,
           gift:0 };         // 福利码兑换过就记一笔（封面页脚显示「已兑换」）
}
let progress = blankCol();

function loadCol(){
  try{
    const raw = JSON.parse(localStorage.getItem(COL_KEY) || "null");
    if(!raw){ progress = blankCol(); return; }
    progress = Object.assign(blankCol(), raw);
    if(raw.v !== COL_VERSION) migrateCol(raw);
  }catch(e){ progress = blankCol(); }
}
/* 0.8 → 0.9：结局从「he/normal/be/hidden 四个」变成「wan:he 这样的 14 个」 */
function migrateCol(raw){
  const ends = {};
  const oldEnds = (raw && raw.ends) || {};
  for(const k of Object.keys(oldEnds)) if(oldEnds[k]) ends[k] = true;
  if(raw && raw.he){                     // 早期只记了 HE，按线补回
    for(const line of ["wan","jiang"]) if(raw.he[line]) ends[line + ":he"] = true;
  }
  progress.ends = ends;

  const ne = {};
  const oe = (raw && raw.endings) || {};
  for(const k of Object.keys(oe)){
    if(!oe[k]) continue;
    if(k.includes(":")){ ne[k] = true; continue; }          // 已经是新键名
    if(k === "hidden"){ ne["hidden:laowan"] = true; continue; }
    if(ends["wan:" + k]) ne["wan:" + k] = true;             // 旧键分不清线，按线的记录还原
    if(ends["jiang:" + k]) ne["jiang:" + k] = true;
  }
  progress.endings = ne;
  progress.v = COL_VERSION;
  saveCol();
}
function saveCol(){ try{ localStorage.setItem(COL_KEY, JSON.stringify(progress)); }catch(e){} }
function resetCol(){
  if(!confirm("确定清空所有收集记录？（图鉴、称号、结局解锁都会消失，剧情存档不受影响）")) return;
  progress = blankCol(); saveCol(); showTitle();
}

/* ============================================================
   二·五、福利码（封面页脚入口）
   ------------------------------------------------------------
   码表写在 story.js 的 gift.codes 里，这里只负责比对与发放。
   发的是「收集记录」：图鉴 48 项、番外 5 篇、称号 27 个。
   剧情存档（SAVE_KEY）一个字都不动，所以兑完还能自己从头走一遍。
   ============================================================ */
/* 归一化：全角转半角、去空格与连字符、统一大写 */
function normCode(str){
  let t = String(str || "");
  try{ t = t.normalize("NFKC"); }catch(e){}
  return t.replace(/[\s\-_\.·。、]/g, "").toUpperCase();
}
function giftCodes(){
  return ((STORY.gift && STORY.gift.codes) || []).map(normCode);
}
function openGift(){
  if(!giftCodes().length) return;          // 作者没设码，就当没这个功能
  closeGift();
  const tip = (STORY.gift && STORY.gift.tip) || "输入福利码，解锁全部图鉴、番外与称号。";
  const m = document.createElement("div");
  m.className = "age-mask";
  m.id = "gift-mask";
  m.innerHTML = `
    <div class="age-box">
      <div class="age-kicker">福利码</div>
      <div class="age-title">兑换</div>
      <div class="age-text">${tip}</div>
      <input class="gift-input" id="gift-input" type="text" inputmode="text"
             autocomplete="off" autocapitalize="characters" spellcheck="false"
             maxlength="40" placeholder="输入福利码">
      <div class="gift-err" id="gift-err"></div>
      <div class="age-btns">
        <button class="btn" onclick="closeGift()">取消</button>
        <button class="btn primary" onclick="submitGift()">兑换</button>
      </div>
    </div>`;
  document.body.appendChild(m);
  const inp = document.getElementById("gift-input");
  if(inp){
    inp.addEventListener("keydown", e=>{
      if(e.key === "Enter"){ e.preventDefault(); submitGift(); }
      if(e.key === "Escape"){ e.preventDefault(); closeGift(); }
    });
    setTimeout(()=>{ try{ inp.focus(); }catch(e){} }, 30);
  }
}
function closeGift(){
  const m = document.getElementById("gift-mask");
  if(m) m.remove();
}
function submitGift(){
  const inp = document.getElementById("gift-input");
  const err = document.getElementById("gift-err");
  const code = normCode(inp ? inp.value : "");
  if(!code){ if(err) err.textContent = "先输入福利码。"; return; }
  if(giftCodes().indexOf(code) < 0){
    if(err) err.textContent = "这个码不对。看看大小写以外有没有多打空格？";
    const box = document.querySelector("#gift-mask .age-box");
    if(box){ box.classList.remove("shake"); void box.offsetWidth; box.classList.add("shake"); }
    return;
  }
  closeGift();
  unlockAll();
}
/* 一次性发齐：图鉴 / 番外 / 称号 */
function unlockAll(){
  loadCol();
  const g = STORY.gallery || {};
  /* 图鉴·场景 */
  for(const k of Object.keys(g.bg || {})) progress.bg[k] = true;
  /* 图鉴·人物（键是「谁:姿势」） */
  for(const w of Object.keys(g.char || {}))
    for(const pose of Object.keys(g.char[w])) progress.char[w + ":" + pose] = true;
  /* 图鉴·档案 */
  for(const e of (g.lore || [])) progress.lore[e.id] = true;
  /* 结局：图鉴读 endings，彩蛋与称号判定读 ends，两处都写 */
  for(const id of Object.keys(STORY.endings || {})){
    progress.endings[id] = true;
    progress.ends[id] = true;
  }
  progress.he    = { wan: true, jiang: true };
  progress.lines = { wan: true, jiang: true };
  progress.peakFavor = FAVOR_MAX;
  progress.clears = Math.max(progress.clears || 0, 1);
  /* 称号：全点亮（含「原稿」这种要靠读彩蛋才给的） */
  for(const t of (STORY.titles || [])) progress.titles[t.id] = true;
  /* 番外：解锁靠结局进度自动成立；「已读」标记故意不写，留给玩家自己看 */
  progress.gift = 1;
  progress.v = COL_VERSION;
  saveCol();
  showTitle();                 // 先重渲染封面，把 48/48、5/5、27/27 刷上去
  showGiftResult();
}
function showGiftResult(){
  const g = galleryCount(), f = galleryFound();
  const found = f.bg + f.char + f.lore + f.ending;
  const tGot  = Object.keys(progress.titles || {}).length;
  const exAll = Object.keys(STORY.extras || {});
  const exN   = exAll.filter(k=>extraUnlocked(k)).length;
  closeGift();
  const m = document.createElement("div");
  m.className = "age-mask";
  m.id = "gift-mask";
  m.innerHTML = `
    <div class="age-box">
      <div class="age-kicker">福利码已生效</div>
      <div class="age-title">全部收录</div>
      <div class="gift-rows">
        <div class="gift-row"><span>图鉴</span><b>${found} / ${g.total}</b></div>
        <div class="gift-row"><span>番外</span><b>${exN} / ${exAll.length}</b></div>
        <div class="gift-row"><span>称号</span><b>${tGot} / ${(STORY.titles || []).length}</b></div>
      </div>
      <div class="age-warn">剧情存档一个字没动，想自己走一遍随时可以开始。想退回原样，封面页脚「清空收集记录」即可。</div>
      <div class="age-btns"><button class="btn primary" onclick="closeGift()">好</button></div>
    </div>`;
  document.body.appendChild(m);
}

/* ---------- 结局表 ---------- */
function endingList(){
  const t = STORY.endings || {};
  return Object.keys(t).map(id => Object.assign({ id }, t[id]));
}
function endingOf(id){
  if(!id) return null;
  return (STORY.endings || {})[id] || null;
}
function lineEndingIds(line){
  return endingList().filter(e => e.line === line).map(e => e.id);
}

/* ---------- 图鉴总量 ---------- */
function galleryCount(){
  const g = STORY.gallery || {bg:{},char:{},lore:[]};
  const bg = Object.keys(g.bg||{}).length;
  let ch = 0;
  for(const w of Object.keys(g.char||{})) ch += Object.keys(g.char[w]).length;
  return { bg, char: ch, lore: (g.lore||[]).length, ending: endingList().length,
           total: bg + ch + (g.lore||[]).length + endingList().length };
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
    ending: endingList().filter(e => !!progress.endings[e.id]).length
  };
}

/* 某条线的结局是否已全部走完 */
function lineEndsDone(line){
  return lineEndingIds(line).every(id => !!progress.ends[id]);
}
function lineEndsCount(line){
  return lineEndingIds(line).filter(id => !!progress.ends[id]).length;
}
function allEndsDone(){
  return endingList().every(e => !!progress.ends[e.id]);
}
/* 某条线是否走到过任意一个 BE（BE 有《野狗的死法》《烧到自己》等好几种） */
function lineBeDone(line){
  return endingList().some(e => e.line === line && e.type === "be" && !!progress.ends[e.id]);
}

/* 称号条件判定 */
function condMet(id){
  const p = progress;
  const g = galleryCount(), f = galleryFound();
  const e = p.ends || {};
  switch(id){
    case "anyEnding":  return Object.keys(p.endings||{}).length > 0;
    case "normalEnd":  return !!(e["wan:normal"] || e["jiang:normal"]);
    case "beEnd":      return !!(e["wan:be"] || e["jiang:be"]);
    case "wanHE":      return !!p.he.wan;
    case "jiangHE":    return !!p.he.jiang;
    case "bothLines":  return !!(p.lines.wan && p.lines.jiang);
    case "lore8":      return f.lore >= 8;
    case "allGallery": return (f.bg+f.char+f.lore+f.ending) >= g.total;
    case "laowan":     return !!p.extras.laowan;
    case "platformEnd":return !!p.extras.platform;
    case "jujia":      return !!p.extras.jujia;
    case "yanhua":     return !!p.extras.yanhua;
    case "rawread":    return !!(p.extras.yanhua && p.extras.jujia);
    case "allEndings": return allEndsDone();
    case "wanAllEnds":   return lineEndsDone("wan");
    case "jiangAllEnds": return lineEndsDone("jiang");
    case "wanEmber":   return !!e["wan:ember"];
    case "wanClean":   return !!e["wan:clean"];
    case "jiangScar":  return !!e["jiang:scar"];
    case "jiangEmpty": return !!e["jiang:empty"];
    case "wanBurn":    return !!e["wan:burn"];
    case "wanGone":    return !!e["wan:gone"];
    case "jiangBlade": return !!e["jiang:blade"];
    case "jiangNobody":return !!e["jiang:nobody"];
    case "wanHalt":    return !!e["wan:halt"];
    case "jiangHalt":  return !!e["jiang:halt"];
    case "peakFavor":  return (p.peakFavor || 0) >= FAVOR_MAX;
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
   三、已读记录（跳过已读）
   ============================================================ */
let readSet = {};
let readDirty = 0;
(function loadRead(){
  try{ readSet = JSON.parse(localStorage.getItem(READ_KEY) || "{}") || {}; }catch(e){ readSet = {}; }
})();
function hashText(t){
  let h = 2166136261;
  for(let i=0;i<t.length;i++){ h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}
function isRead(txt){ return !!readSet[hashText(txt)]; }
function markRead(txt){
  const h = hashText(txt);
  if(readSet[h]) return;
  readSet[h] = 1;
  if(++readDirty >= 12) flushRead();
}
function flushRead(){
  if(!readDirty) return;
  readDirty = 0;
  try{ localStorage.setItem(READ_KEY, JSON.stringify(readSet)); }catch(e){}
}
function readCount(){ return Object.keys(readSet).length; }
function toggleSkip(){
  skipRead = !skipRead;
  try{ localStorage.setItem(SKIP_KEY, skipRead ? "1" : "0"); }catch(e){}
  setHud();
  if(state && state.screen === "story" && !state.extraFreeze) renderNode();
}

/* ============================================================
   四、新建一局
   ============================================================ */
function getThresholds(){
  return Object.assign({ he:80, normal:55, cold:30 }, STORY.thresholds || {});
}

function freshState(line, mode){
  return { v: 2, screen:"quiz", line, mode:mode||"main", extraKey:null,
           profile:{}, favor:0, danger:DANGER_BASE, clue:0,
           flags:{}, queue:[], idx:0, log:[], qi:0,
           ending:null, done:false };
}
/* 老存档（0.8 的 34 分制）直接不认，重开一局 */
function loadState(){
  const s = load();
  if(!s) return null;
  if(s.v !== 2 || typeof s.favor !== "number") return null;
  return s;
}

/* ============================================================
   五、HUD
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
  // 数值不上 HUD：好感/执念/线索只在结局页复盘
  hud.innerHTML = `
    <div class="hud-left">${hudTitle()}<span class="hud-adult" title="本作含成人向内容，仅限 18 岁以上">18+</span></div>
    <div class="hud-right">
      <button class="mini skip ${skipRead?'on':''}" onclick="toggleSkip()" title="读过的正文自动掠过，选项不会跳过">跳过<span class="only-wide">已读</span></button>
      <button class="mini" onclick="showGallery()">图鉴</button>
      <button class="mini" onclick="showTitle()">返回封面</button>
    </div>`;
}

/* ============================================================
   六、封面
   ============================================================ */
function showTitle(){
  flushSave();                                 // 回封面前把进度落盘
  state = null;
  typingTimer = null;
  flushRead();
  loadCol();                                   // 每次回封面刷新收集状态
  checkTitles();                               // 顺带结算一下可能漏掉的称号
  const cont = !!loadState();
  const g = galleryCount(), f = galleryFound();
  const found = f.bg + f.char + f.lore + f.ending;
  const tGot = Object.keys(progress.titles||{}).length;
  const extrasUnlockedN = (STORY.extras ? Object.keys(STORY.extras).filter(k=>extraUnlocked(k)).length : 0);
  const extrasTotal = STORY.extras ? Object.keys(STORY.extras).length : 0;
  const hasGift = ((STORY.gift && STORY.gift.codes) || []).length > 0;   // 码表空 = 入口隐藏

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
          <button class="btn" onclick="showExtras()">番外篇<span class="btn-badge">${extrasUnlockedN}/${extrasTotal}</span></button>
          <button class="btn" onclick="showGallery()">图鉴<span class="btn-badge">${found}/${g.total}</span></button>
          <button class="btn" onclick="showTitles()">称号<span class="btn-badge">${tGot}/${(STORY.titles||[]).length}</span></button>
        </div>
        <div class="cover-devlink">
          <a href="javascript:void(0)" onclick="showCredits()">鸣谢与版权</a>
          <span class="sep">·</span>
          ${hasGift ? `<a href="javascript:void(0)" onclick="openGift()">福利码${progress.gift ? "（已兑换）" : ""}</a>
          <span class="sep">·</span>` : ""}
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
  const s = loadState(); if(!s){ showTitle(); return; }
  state = s;
  setHud();
  if(state.screen === "story"){ renderNode(); }
  else if(state.screen === "quiz"){ renderQuiz(); }
  else { showTitle(); }
}

/* ============================================================
   七、视角选择
   ============================================================ */
function showLineSelect(){
  state = null;
  const rows = ["wan","jiang"].map(L=>{
    const done = lineEndsCount(L), total = lineEndingIds(L).length;
    return `<div class="ls-prog">已走完 ${done} / ${total} 个结局</div>`;
  });
  document.getElementById('stage').innerHTML = `
    <div class="ls-wrap">
      <div class="ls-title">选定你的视角</div>
      <div class="ls-cards">
        <div class="ls-card wan" onclick="startQuiz('wan')">
          <div class="ls-name">万宁</div>
          <div class="ls-tag">驯化与救赎</div>
          <div class="ls-desc">19岁复读高三。心思通透，擅长拿捏人心。她在等他来——明知是刀，也伸手接。</div>
          ${rows[0]}
        </div>
        <div class="ls-card jiang" onclick="startQuiz('jiang')">
          <div class="ls-name">江野</div>
          <div class="ls-tag">复仇与沦陷</div>
          <div class="ls-desc">22岁刚出狱。回雾川讨债，债主已死，恨转向仇人之女。可那把刀，怎么也落不下去。</div>
          ${rows[1]}
        </div>
      </div>
      <button class="btn ghost" onclick="showTitle()">返回封面</button>
    </div>`;
  setHud();
}

/* ============================================================
   八、入场问卷
   ============================================================ */
function startQuiz(line){
  state = freshState(line, "main"); save();
  renderQuiz();
}
function renderQuiz(){
  const Qs = STORY.quiz[state.line];
  const i = state.qi;
  if(i >= Qs.length){ // 问卷完成
    const s = sumQuizStats();
    state.favor = clampNum(s.favor, 0, FAVOR_MAX);
    state.danger = clampNum(DANGER_BASE + s.danger, 0, DANGER_MAX);
    state.clue = clampNum(s.clue, 0, CLUE_MAX);
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
function sumQuizStats(){
  let favor=0, danger=0, clue=0;
  const Qs = STORY.quiz[state.line];
  for(const q of Qs){
    const a = state.profile[q.id]; if(!a) continue;
    const idx = a.charCodeAt(0)-65;
    const o = q.opts[idx]; if(!o) continue;
    favor  += o.favor||0;
    danger += o.danger||0;
    clue   += o.clue||0;
  }
  return { favor, danger, clue };
}

/* ============================================================
   九、正文推进
   ============================================================ */
function enterStory(){
  state.queue = STORY.lines[state.line].slice();
  state.idx = 0;
  state.screen = "story";
  save();
  renderNode();
}

/* endcheck 单条 case 是否成立 */
function caseMet(c){
  const f = state.favor||0, d = state.danger||0, cu = state.clue||0;
  const fl = state.flags||{};
  if(c.ifFlag){
    const want = (c.flagVal===undefined?true:c.flagVal);
    if((!!fl[c.ifFlag]) !== want) return false;
    if(!c.if) return true;               // 只判 flag
  }
  if(c.else) return true;
  if(c.if){
    const x = c.if;
    if(x.favorMin  !== undefined && f  < x.favorMin)  return false;
    if(x.favorMax  !== undefined && f  > x.favorMax)  return false;
    if(x.dangerMin !== undefined && d  < x.dangerMin) return false;
    if(x.dangerMax !== undefined && d  > x.dangerMax) return false;
    if(x.clueMin   !== undefined && cu < x.clueMin)   return false;
    if(x.clueMax   !== undefined && cu > x.clueMax)   return false;
    return true;
  }
  if(c.min !== undefined) return f >= c.min;   // 老写法
  return false;
}
/* case 上写的 ending 可以是 "wan:he"，也可以只写 "he"（自动补当前线） */
function caseEndingId(c){
  if(!c || !c.ending) return null;
  return c.ending.includes(":") ? c.ending : (state.line + ":" + c.ending);
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
      const cases = n.cases || [];
      let picked = null;
      for(const c of cases){ if(caseMet(c)){ picked = c; break; } }
      if(!picked) picked = cases.find(c=>c.else) || { branch:[{t:"end"}] };
      const eid = caseEndingId(picked);
      if(eid) state.ending = { id: eid, line: state.line };
      state.queue.splice(state.idx, 1, ...(picked.branch||[{t:"end"}]));
      save();
      continue; // 用分支替换 endcheck，继续处理
    }
    if(n.t==="end"){ showEnd(); return; }
    if(n.t==="text"){
      // 读过就掠过（选项永远不跳）
      if(skipRead && isRead(n.txt)){ state.idx++; save(); continue; }
      renderText(n); return;
    }
    if(n.t==="choice"){ renderChoice(n); return; }
    state.idx++; // 未知类型，跳过
  }
  showEnd();
}

function applyBg(c){
  const el = document.getElementById('bg');
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
function applyChar(who, pose){
  const layer = document.getElementById('chars');
  if(!layer) return;
  if(who == null){ layer.innerHTML = ""; return; }
  const pos = pose || "normal";
  const charPath = STORY.assets && STORY.assets.char && STORY.assets.char[who] && STORY.assets.char[who][pos];
  layer.innerHTML = "";
  if(!charPath) return;
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
  if(!path){ stopBgm(); return; }
  if(currentBgmKey === key) return;
  const a = document.getElementById('bgm');
  if(!a) return;
  a.src = path;
  a.loop = true;
  a.volume = 0.38;
  a.play().catch(()=>{});
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
  markRead(n.txt || "");
  detectEnding(n.txt || "");
  const stage = document.getElementById('stage');
  const sp = n.sp ? `<div class="speaker">${n.sp}</div>` : "";
  stage.innerHTML = `
    <div class="dialog">
      ${sp}
      <div class="text ${n.cls||""}" id="txt"></div>
      <div class="cursor">▽</div>
    </div>`;
  typewriter(n.txt);
}

/* 兜底：万一某条分支忘了写 ending，就靠标题文字认（正常情况用不到） */
const ENDING_TEXT_MAP = [
  { re: /^HE · 《驯刀》/,              id: "he" },
  { re: /^普通结局 · 《各自过冬》/,     id: "normal" },
  { re: /^BE · 《野狗的死法》/,         id: "be" },
  { re: /^暗结局 · 《没有一个人是干净的》/, id: "wan:clean" },
  { re: /^暗结局 · 《手上有雪》/,        id: "jiang:scar" },
  { re: /^温和结局 · 《灯亮着》/,        id: "wan:ember" },
  { re: /^温和结局 · 《空房间》/,        id: "jiang:empty" },
  { re: /^疏离结局 · 《雪停之前》/,      id: "wan:cold" },
  { re: /^疏离结局 · 《往北的路》/,      id: "jiang:cold" },
  { re: /^隐藏结局 · 《老万的十年》/,    id: "hidden:laowan" },
  { re: /^隐藏结局 · 《同一个站台》/,    id: "hidden:platform" }
];
function detectEnding(txt){
  if(state.mode !== "main" || state.ending) return;
  for(const e of ENDING_TEXT_MAP){
    if(e.re.test(txt)){
      const id = e.id.includes(":") ? e.id : (state.line + ":" + e.id);
      state.ending = { id, line: state.line };
      save();
      return;
    }
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
  state.favor  = clampNum((state.favor||0)  + (o.favor||0),  0, FAVOR_MAX);
  state.danger = clampNum((state.danger||0) + (o.danger||0), 0, DANGER_MAX);
  state.clue   = clampNum((state.clue||0)   + (o.clue||0),   0, CLUE_MAX);
  state.log.push({k:"choice", q:n.q, ans:o.label, favor:o.favor});
  // 把 branch 节点插到 choice 之后
  if(o.branch && o.branch.length){
    state.queue.splice(state.idx+1, 0, ...o.branch);
  }
  state.idx++; // 越过 choice，进入 branch
  saveNow();   // 选项是节点，立刻落盘
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
   十、结算（正篇结局 / 番外结局）
   ============================================================ */
function logHtml(){
  return (state.log||[]).map(l=>{
    if(l.k==="quiz") return `<div class="log-row"><span class="log-tag">登记</span> ${l.id.toUpperCase()} → ${l.ans}</div>`;
    if(l.k==="choice") return `<div class="log-row"><span class="log-tag">选择</span> ${l.ans}</div>`;
    return "";
  }).join("");
}

/* 结局页的三个数值复盘 */
function statBlock(){
  const f = state.favor||0, d = state.danger||0, c = state.clue||0;
  const dots = [0,1,2,3,4].map(i=>`<b class="${i<c?'on':''}"></b>`).join("");
  return `
    <div class="end-sub">这一周目的账</div>
    <div class="end-stats">
      <div class="es-row"><span class="es-k">好感</span><span class="es-bar"><i style="width:${f}%"></i></span><span class="es-v">${f} / ${FAVOR_MAX}</span></div>
      <div class="es-row"><span class="es-k">执念</span><span class="es-bar"><i class="hot" style="width:${d}%"></i></span><span class="es-v">${d} / ${DANGER_MAX}</span></div>
      <div class="es-row"><span class="es-k">线索</span><span class="es-dots">${dots}</span><span class="es-v">${c} / ${CLUE_MAX}</span></div>
    </div>`;
}

function showEnd(){
  if(state.mode === "extra") return showExtraEnd();

  state.screen = "end";
  applyChar(null);
  const id = (state.ending && state.ending.id) || (state.line + ":normal");
  const meta = endingOf(id) || { name:"结局", brief:"", desc:"", type:"normal", line:state.line };
  const type = meta.type || "normal";

  // 收集结算
  const firstTime = !progress.endings[id];
  progress.endings[id] = true;
  progress.lines[state.line] = true;
  if(!progress.ends) progress.ends = {};
  progress.ends[id] = true;
  if(type === "he") progress.he[state.line] = true;
  progress.peakFavor = Math.max(progress.peakFavor||0, state.favor||0);
  if(!state.done){ progress.clears = (progress.clears||0) + 1; state.done = true; }
  saveCol(); flushRead();
  const newly = checkTitles();
  const done = lineEndsCount(state.line), total = lineEndingIds(state.line).length;
  const lineDone = lineEndsDone(state.line);
  const extraHint = state.line === "jiang" ? "《烟花》" : "《居家情事》";

  document.getElementById('stage').innerHTML = `
    <div class="end-wrap">
      <div class="end-kicker">${firstTime ? "新结局解锁" : "结局回顾"} · ${done} / ${total}</div>
      <div class="end-title">${meta.name}</div>
      <div class="end-line">${meta.desc || meta.brief || ""}</div>
      ${newly.length ? `<div class="unlock-box">
          <div class="unlock-head">称号解锁</div>
          ${newly.map(t=>`<div class="unlock-row"><b>${t.name}</b><span>${t.desc}</span></div>`).join('')}
        </div>` : ''}
      ${statBlock()}
      <div class="end-sub">选择回溯</div>
      <div class="end-log">${logHtml() || '<div class="log-row">（本条线没有留下记录）</div>'}</div>
      <div class="end-note">${lineDone
        ? `这条线的九个结局都走完了。番外篇里多了一页手稿——${extraHint}。`
        : `这条线还差 ${total - done} 个结局。九个结局不是靠一个数值分的：好感、执念、线索三条一起决定。`}</div>
      <div class="btn-row">
        ${id === "hidden:laowan" ? '<button class="btn primary" onclick="startExtra(\'laowan\')">读那封信 · 《老万的十年》</button>' : ''}
        <button class="btn ${id==='hidden:laowan'?'':'primary'}" onclick="showExtras()">番外篇</button>
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
  // 两个隐藏结局是「番外形态的结局」，读完登记进结局表
  if(key === "laowan")  progress.ends["hidden:laowan"] = true;
  if(key === "platform") progress.ends["hidden:platform"] = true;
  if(key === "laowan")  progress.endings["hidden:laowan"] = true;
  if(key === "platform") progress.endings["hidden:platform"] = true;
  saveCol(); flushRead();
  const newly = checkTitles();
  const tail = {
    laowan: "他把这十年写下来了。没寄出去。",
    platform: "她往南，他往北。谁也没认出谁。",
    yanhua: "爆竹还在响。雪落在两个人身上，谁也没动。",
    jujia: "灯一直亮着。这一次，没有人假装没看见。",
    s2: "柜子里那一条，终于戴上了。"
  }[key] || "刀还在。刀柄在你手里。";
  document.getElementById('stage').innerHTML = `
    <div class="end-wrap">
      <div class="end-kicker">番外</div>
      <div class="end-title">《${ex.title}》 · 完</div>
      <div class="end-line">${tail}</div>
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
   十·五、鸣谢与版权
   ============================================================ */
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
   十一、番外
   ============================================================ */
function extraUnlocked(key){
  const ex = (STORY.extras||{})[key];
  if(!ex) return false;
  const e = progress.ends || {};
  switch(ex.cond){
    case "bothHE":  return !!(progress.he.wan && progress.he.jiang);
    case "anyHE":   return !!(progress.he.wan || progress.he.jiang);
    /* 《老万的十年》三条路：双线 HE ／ 两线都 BE ／ 正篇里线索查满好感 85+ */
    case "hiddenLaowan":
      return !!( (progress.he.wan && progress.he.jiang) || (lineBeDone("wan") && lineBeDone("jiang")) || e["hidden:laowan"] );
    case "bothCold":
      return !!(e["wan:cold"] && e["jiang:cold"]);
    case "wanAllEnds":   return lineEndsDone("wan");
    case "jiangAllEnds": return lineEndsDone("jiang");
    case "clear":  return (progress.clears || 0) > 0 || Object.keys(progress.endings||{}).length > 0;
    default: return true;
  }
}
/* 老万那条「三条路」走了几条 */
function laowanRoutes(){
  const e = progress.ends || {};
  let n = 0;
  if(progress.he.wan && progress.he.jiang) n++;
  if(lineBeDone("wan") && lineBeDone("jiang")) n++;
  if(e["hidden:laowan"]) n++;
  return n;
}
function extraCondText(key){
  const ex = (STORY.extras||{})[key] || {};
  if(ex.cond === "wanAllEnds" || ex.cond === "jiangAllEnds"){
    const line = ex.cond === "wanAllEnds" ? "wan" : "jiang";
    return `${ex.condText}（已走完 ${lineEndsCount(line)} / ${lineEndingIds(line).length}）`;
  }
  if(ex.cond === "hiddenLaowan"){
    return `${ex.condText}（三条路已达成 ${laowanRoutes()} / 3）`;
  }
  if(ex.cond === "bothCold"){
    const e = progress.ends || {};
    const a = e["wan:cold"] ? "✓" : "·", b = e["jiang:cold"] ? "✓" : "·";
    return `${ex.condText}（万宁 ${a} / 江野 ${b}）`;
  }
  return ex.condText || "尚未解锁";
}
function showExtras(){
  loadCol();                                   // 刷新解锁状态（番外条件依赖结局进度）
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
   十二、图鉴
   ============================================================ */
let galleryTab = "bg";
function showGallery(tab){
  if(tab) galleryTab = tab;
  loadCol();
  const g = STORY.gallery || {bg:{},char:{},lore:[]};
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
    const lineName = { wan:"万宁线", jiang:"江野线", hidden:"隐藏" };
    body = `<div class="ex-list">` + endingList().map(e=>{
      const ok = !!progress.endings[e.id];
      return `<div class="ex-card ${ok?'':'locked'}">
        <div class="ex-top"><div class="ex-name">${ok?e.name:'？？？'}</div>
        <div class="ex-sub">${lineName[e.line] || ""}${ok?' · 已达成':' · 未达成'}</div></div>
        <div class="ex-desc">${ok?e.desc:'解锁条件：'+e.hint}</div>
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
   十三、称号
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
   十四、键盘 / 全局点击
   ============================================================ */
document.addEventListener('keydown', e=>{
  if(e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
  if(!state || state.screen!=="story") return;
  if(e.code==="Space" || e.code==="Enter"){ e.preventDefault(); advance(); }
});

/* 全屏点击推进文字：选项与结算页不响应（避免误触跳过选项） */
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
   十五、启动
   ============================================================ */
window.addEventListener('load', ()=>{ loadCol(); showTitle(); ageNotice(); });
window.addEventListener('beforeunload', ()=>{ flushSave(); flushRead(); });

/* ---------- 自动测试用（外部读取当前状态，不在界面上露出） ---------- */
function __getState(){ return state; }
function __getProgress(){ return progress; }
