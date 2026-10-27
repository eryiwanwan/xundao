/* export_text.js —— 把 story.js 里的全部文本导出成一份可读的 Markdown
   用法：node scripts/export_text.js

   思路：
   1. 读 story.js 源码，把「第N章」的注释行补一个 { t:"__chapter" } 节点（只在内存里改，不写回文件）
      —— 章节原本只存在于注释里，引擎不认，导出要按章分节就得先给它一个位置
   2. 在 vm 沙箱里求值，拿到 STORY
   3. 递归遍历两条线 / 番外 / 彩蛋的节点树：对白、旁白、选项、问卷变体、结局分歧全部展开
   4. 界面固定文案、图鉴、称号、鸣谢直接读数据
*/
const fs = require("fs");
const vm = require("vm");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const GAME = path.join(ROOT, "game");
const OUT = path.join(ROOT, "03_全文文本.md");

/* ---------- 1. 载入数据（章节注释 → __chapter 节点） ---------- */
let src = fs.readFileSync(path.join(GAME, "story.js"), "utf8");
let chapterHits = 0;
// 两种注释格式：
//   A) `/* ---------- 万宁线 · 第1章《楼道里的刀》 ---------- */` —— 注释在数组开口上一行，标记要塞进 `[` 之后
//   B) `/* ============ 第2章《尾随者》· 万宁线 ============ */` —— 注释夹在两个节点之间
//      第6章写作 `第6章《雾散》· 万宁线（终章）`，后缀要跟着章名一起带出来
const reA = /(\/\* -+ (?:万宁线|江野线) · (第\d+章《[^》]+》) -+ \*\/)\r?\n(\s*)(wan|jiang): \[/g;
const reB = /\/\* =+ (第\d+章《[^》]+》) ?· (?:万宁线|江野线)(（[^）]*）)? =+ \*\//g;
src = src.replace(reA, (m, comment, name, indent, arr) => {
  chapterHits++;
  return `${comment}\n${indent}${arr}: [\n${indent}  { t: "__chapter", name: "${name}" },`;
});
src = src.replace(reB, (m, name, suffix) => {
  chapterHits++;
  return `${m}\n      { t: "__chapter", name: "${name}${suffix || ""}" },`;
});
const ctx = { atob: s => Buffer.from(String(s).replace(/\s+/g, ""), "base64").toString("binary"), TextDecoder };
vm.createContext(ctx);
// 两篇手稿彩蛋的正文在 eggs.js，先加载再跑 story.js
vm.runInContext(fs.readFileSync(path.join(GAME, "eggs.js"), "utf8") + "\nglobalThis.EGGS = EGGS;", ctx, { filename: "eggs.js" });
vm.runInContext(src + "\nglobalThis.STORY = STORY;", ctx, { filename: "story.js" });
const S = ctx.STORY;

/* ---------- 2. 名字表（给舞台提示用中文） ---------- */
const BGM = {}, SFX = {};
for (const m of S.credits.music || []) BGM[m.key] = m.name;
for (const m of S.credits.sfx || []) SFX[m.key] = m.name;
function bgName(k){ return (S.gallery.bg[k] && S.gallery.bg[k].name) || k; }
function charName(who, pose){
  const c = (S.gallery.char[who] || {})[pose || "normal"];
  return c ? c.name : who + (pose ? "·" + pose : "");
}
const lineName = (l) => (S.meta.lineNames && S.meta.lineNames[l]) || l;

/* ---------- 3. 渲染 ---------- */
const stats = { text: 0, chars: 0, choice: 0 };

function pad(d){ return d <= 0 ? "" : ("> ".repeat(d)); }
/* 段落之间要留空行（否则 Markdown 会把相邻行挤成一段）；
   引用块内部的空行必须写成 ">"，不然会让整段引用断开 */
function brk(d){ return d <= 0 ? "" : ("> ".repeat(d).trimEnd()); }

function textLine(n, d){
  stats.text++;
  stats.chars += (n.txt || "").length;
  const body = n.sp ? `**${n.sp}**：${n.txt}` : n.txt;
  return pad(d) + body + "\n" + brk(d);
}

function stage(n, d){
  let t = null;
  if (n.t === "bgimg") {
    t = n.key ? `*[场景｜${bgName(n.key)}]*` : "*（画面收黑）*";
  } else if (n.t === "char") {
    t = n.who == null ? "*（立绘退场）*" : `*[立绘｜${charName(n.who, n.pose)}]*`;
  } else if (n.t === "bgm") {
    t = n.stop ? "*（音乐停）*" : `*[BGM｜${BGM[n.key] || n.key}]*`;
  } else if (n.t === "sfx") {
    t = `*[音效｜${SFX[n.key] || n.key}]*`;
  }
  return t === null ? null : pad(d) + t + "\n" + brk(d);
}

const out = [];
/* 小标题：前后都留空行，且空行要带引用标记 */
function head(d, text){ return "\n" + pad(d) + text + "\n" + brk(d); }
/* 递归渲染一段分支，并抹掉结尾多余的空引用行 */
function renderBlock(nodes, d, opt){
  render(nodes, d, opt);
  const tail = "\n" + brk(d);
  const i = out.length - 1;
  if (i >= 0 && typeof out[i] === "string" && out[i].endsWith(tail)) out[i] = out[i].slice(0, -tail.length) + "\n";
  // 末尾补一个空行：分支结束后，正文要能干净地跳出引用块
}

function render(nodes, d, opt = {}){
  for (const n of nodes || []){
    switch (n.t){
      case "__chapter":
        if (!opt.suppressChapter) out.push(`\n### ${n.name}\n`);
        break;
      case "text": out.push(textLine(n, d)); break;
      case "flag": out.push(pad(d) + `*（标记：${n.key} = ${n.val === undefined ? true : n.val}）*` + "\n" + brk(d)); break;
      case "bg": break;                       // 底色不进正文，只在没有背景图时兜底
      case "end": out.push(pad(d) + "*（本章完）*" + "\n" + brk(d)); break;
      case "bgimg": case "char": case "bgm": case "sfx": {
        const s = stage(n, d);
        if (s) out.push(s);
        break;
      }
      case "qvar": {
        const q = (S.quiz[opt.line] || []).find(x => x.id === n.by);
        out.push(head(d, `#### 〔变体〕按问卷 ${n.by.toUpperCase()}${q ? "「" + q.text + "」" : ""} 的答案切换`));
        for (const key of Object.keys(n.map)){
          const label = q && q.opts ? (q.opts["ABCD".indexOf(key)] || {}).label : "";
          out.push(head(d, `##### ${key}${label ? "｜" + label : ""}`));
          renderBlock(n.map[key], d, opt);
        }
        break;
      }
      case "choice": {
        stats.choice++;
        const opts = n.opts || [];
        out.push(head(d, `#### 〔选择〕${n.q}`));
        opts.forEach((o, i) => {
          const f = o.favor > 0 ? `好感 +${o.favor}` : (o.favor < 0 ? `好感 ${o.favor}` : "好感 ±0");
          out.push(`${pad(d)}- **${"ABCD"[i] || i + 1}**　${o.label}　\`${f}\``);
        });
        out.push(brk(d));
        opts.forEach((o, i) => {
          if (!o.branch || !o.branch.length) return;
          const f = o.favor > 0 ? `好感 +${o.favor}` : (o.favor < 0 ? `好感 ${o.favor}` : "好感 ±0");
          out.push(head(d, `##### → ${"ABCD"[i] || i + 1}｜${o.label}（${f}）`));
          renderBlock(o.branch, d + 1, opt);
        });
        break;
      }
      case "endcheck": {
        out.push(head(d, `#### 〔结局分歧〕按标记与好感分流`));
        let idx = 0;
        for (const c of n.cases || []){
          idx++;
          let cond;
          if (c.ifFlag) cond = `若标记 ${c.ifFlag} ${c.flagVal === undefined || c.flagVal === true ? "已触发" : "= " + c.flagVal}`;
          else if (c.else) cond = "其余情况";
          else if (c.if) {
            const x = c.if, bits = [];
            if (x.favorMin  !== undefined) bits.push(`好感 ≥ ${x.favorMin}`);
            if (x.favorMax  !== undefined) bits.push(`好感 ≤ ${x.favorMax}`);
            if (x.dangerMin !== undefined) bits.push(`执念 ≥ ${x.dangerMin}`);
            if (x.dangerMax !== undefined) bits.push(`执念 ≤ ${x.dangerMax}`);
            if (x.clueMin   !== undefined) bits.push(`线索 ≥ ${x.clueMin}`);
            if (x.clueMax   !== undefined) bits.push(`线索 ≤ ${x.clueMax}`);
            cond = "若 " + bits.join(" 且 ");
          }
          else cond = `若好感 ≥ ${c.min}`;
          if (c.ending) cond += `　→　${((S.endings || {})[c.ending] || {}).name || c.ending}`;
          out.push(head(d, `##### 情况 ${idx}｜${cond}`));
          renderBlock(c.branch, d + 1, opt);
        }
        break;
      }
      default:
        // 未知节点类型不静默丢弃，留个记号方便补
        out.push(pad(d) + `*（未识别节点 ${n.t}）*` + "\n" + brk(d));
    }
  }
}

/* ---------- 4. 组装文档 ---------- */
const doc = [];
function flush(){                       // 把正文缓冲并进文档
  if (!out.length) return;
  doc.push(out.join("\n"));
  out.length = 0;
}
const now = new Date();
const stamp = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")} ${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;

doc.push(`# 《${S.meta.title}》全文文本`);
doc.push("");
doc.push(`> 导出自 \`game/story.js\`（${S.meta.version}）　·　${stamp}`);
doc.push("> 这份文档由 `scripts/export_text.js` 自动生成，**改动请改 story.js 后重新导出**，不要直接编辑本文件。");
doc.push("");
doc.push("**读法**");
doc.push("");
doc.push("- 旁白直接成段；对白写成 `**角色**：台词`");
doc.push("- `*[场景｜…]*` `*[立绘｜…]*` `*[BGM｜…]*` 是舞台提示，对应游戏里的换图/换乐，不是台词");
doc.push("- `#### 〔选择〕` 是玩家要点的选项，下面是每个选项各自带出的段落（`##### → A｜…`）");
doc.push("- `#### 〔变体〕` 是按入场问卷答案替换的段落，同一个位置会走其中一支");
doc.push("- `#### 〔结局分歧〕` 是章末按标记与好感选结局，`##### 情况 N` 对应一条结局线");
doc.push("- 字数统计含所有分支与所有问卷变体，因此大于单周目实际阅读量");
doc.push("");

/* 目录 */
doc.push("## 目录");
doc.push("");
const toc = [];
toc.push("- [统计](#统计)");
  toc.push("- [一、界面文案](#一界面文案)");
toc.push(`- [二、${lineName("wan")}](#二${lineName("wan").replace(/[·\s]/g, "")})`);
toc.push(`- [三、${lineName("jiang")}](#三${lineName("jiang").replace(/[·\s]/g, "")})`);
toc.push("- [四、番外与彩蛋](#四番外与彩蛋)");
toc.push("- [五、图鉴文案](#五图鉴文案)");
toc.push("- [六、称号](#六称号)");
toc.push("- [七、鸣谢与声明](#七鸣谢与声明)");
doc.push(toc.join("\n"));
doc.push("");

/* 统计（独立走一遍树，只数不写） */
function countNodes(nodes){
  const c = { text: 0, chars: 0, choice: 0 };
  const walk = (arr) => {
    for (const n of arr || []){
      if (n.t === "text"){ c.text++; c.chars += (n.txt || "").length; }
      else if (n.t === "choice"){ c.choice++; (n.opts || []).forEach(o => walk(o.branch)); }
      else if (n.t === "qvar"){ Object.keys(n.map).forEach(k => walk(n.map[k])); }
      else if (n.t === "endcheck"){ (n.cases || []).forEach(x => walk(x.branch)); }
    }
  };
  walk(nodes);
  return c;
}
doc.push("## 统计");
doc.push("");
doc.push("| 部分 | 句 | 字 | 选择点 |");
doc.push("|---|---:|---:|---:|");
const T = { text: 0, chars: 0, choice: 0 };
const addRow = (name, c) => {
  T.text += c.text; T.chars += c.chars; T.choice += c.choice;
  doc.push(`| ${name} | ${c.text} | ${c.chars} | ${c.choice} |`);
};
addRow(lineName("wan"), countNodes(S.lines.wan));
addRow(lineName("jiang"), countNodes(S.lines.jiang));
for (const k of Object.keys(S.extras || {})) addRow(`《${S.extras[k].title}》`, countNodes(S.extras[k].nodes));
doc.push(`| **合计（含所有分支与变体）** | **${T.text}** | **${T.chars}** | **${T.choice}** |`);
doc.push("");
doc.push("---");
doc.push("");

/* 一、界面文案 */
doc.push("## 一、界面文案");
doc.push("");
doc.push("### 封面");
doc.push("");
doc.push(`- 标题：**${S.meta.title}**`);
doc.push(`- 副标题：${S.meta.subtitle}`);
doc.push("- 引语：雾川的雪落下来，没有一个人是干干净净地走的。");
doc.push("- 按钮：继续上次 / 新的开始 / 开始 / 番外篇 / 图鉴 / 称号");
doc.push("- 页脚：鸣谢与版权 · 清空收集记录");
doc.push("");
doc.push("### 首屏年龄提示");
doc.push("");
doc.push("- 眉标：成人向内容");
doc.push("- 大标题：18 岁以下请勿进入");
doc.push("- 正文：本作《驯刀》全篇为成人向作品");
doc.push("- 小字：继续即表示你已满 18 周岁，并自愿阅读上述内容。");
doc.push("- 按钮：我未满 18 岁，离开 / 我已满 18 岁，进入");
doc.push("- 离开页：已停止载入　/　本作仅面向成年读者。感谢你的克制。");
doc.push("");
doc.push("### 视角选择");
doc.push("");
doc.push("- 标题：选定你的视角");
for (const l of ["wan", "jiang"]){
  const card = {
    wan: ["万宁", "驯化与救赎", "19岁复读高三。心思通透，擅长拿捏人心。她在等他来——明知是刀，也伸手接。"],
    jiang: ["江野", "复仇与沦陷", "22岁刚出狱。回雾川讨债，债主已死，恨转向仇人之女。可那把刀，怎么也落不下去。"]
  }[l];
  doc.push(`- **${card[0]}**（${card[1]}）：${card[2]}`);
}
doc.push("");
doc.push("### 各处固定提示");
doc.push("");
doc.push("- 入场问卷页眉：入场登记 · n / 4");
doc.push("- 番外篇页脚：番外不看好感度，只看你走到过哪里。");
doc.push("- 称号页页脚：称号跨周目累积，清除存档也不会丢。");
doc.push("- 结算页：结局解锁 / 结局回顾 · 选择回溯 · 开另一条线 · 重玩本线 · 返回封面");
doc.push("- 结局提示：这条线的三个结局都走完了。番外篇里多了一页手稿——《烟花》/《居家情事》。");
doc.push("- 结局提示（未走完）：这条线还差 N 个结局。HE / 普通 / BE 三个都走完，番外篇会多一页手稿。");
doc.push("- 番外结算：已收录到番外列表。");
doc.push("");

/* 二、三、两条线 */
function lineSection(key, no){
  doc.push(`## ${no}、${lineName(key)}`);
  doc.push("");
  const qs = S.quiz[key] || [];
  if (qs.length){
    doc.push("### 入场问卷");
    doc.push("");
    qs.forEach((q, i) => {
      doc.push(`**${i + 1}. ${q.text}**`);
      doc.push("");
      q.opts.forEach((o, k) => {
        const f = o.favor > 0 ? `　\`好感 +${o.favor}\`` : "";
        doc.push(`- ${"ABCD"[k]}．${o.label}${f}`);
      });
      doc.push("");
    });
  }
  render(S.lines[key], 0, { line: key });
  flush();
  doc.push("");
  doc.push("---");
  doc.push("");
}
lineSection("wan", "二");
lineSection("jiang", "三");

/* 四、番外 */
doc.push("## 四、番外与彩蛋");
doc.push("");
for (const key of Object.keys(S.extras || {})){
  const ex = S.extras[key];
  doc.push(`### 《${ex.title}》`);
  doc.push("");
  doc.push(`- 副标题：${ex.sub}`);
  doc.push(`- 简介：${ex.desc}`);
  doc.push(`- 解锁：${ex.condText}`);
  doc.push("");
  render(ex.nodes, 0, { line: "wan", suppressChapter: true });
  flush();
  doc.push("");
}
doc.push("---");
doc.push("");

/* 五、图鉴 */
doc.push("## 五、图鉴文案");
doc.push("");
doc.push("### 场景");
doc.push("");
for (const k of Object.keys(S.gallery.bg)){
  const b = S.gallery.bg[k];
  doc.push(`- **${b.name}**：${b.desc}`);
}
doc.push("");
doc.push("### 人物");
doc.push("");
for (const who of Object.keys(S.gallery.char)){
  for (const pose of Object.keys(S.gallery.char[who])){
    const c = S.gallery.char[who][pose];
    doc.push(`- **${c.name}**：${c.desc}`);
  }
}
doc.push("");
doc.push("### 档案");
doc.push("");
for (const e of S.gallery.lore){
  doc.push(`- **${e.name}**（触发词：${e.kw.join(" / ")}）：${e.desc}`);
}
doc.push("");
doc.push("### 结局（14 个）");
doc.push("");
for (const id of Object.keys(S.endings || {})){
  const e = S.endings[id];
  doc.push(`- **${e.name}**（\`${id}\`）：${e.desc}`);
  doc.push(`  - 条件：${e.hint}`);
}
doc.push("");
doc.push("---");
doc.push("");

/* 六、称号 */
doc.push("## 六、称号");
doc.push("");
doc.push("| 称号 | 说明（即解锁条件） |");
doc.push("|---|---|");
const COND_CN = {
  anyEnding: "走完任意一个结局", normalEnd: "达成普通结局", beEnd: "达成 BE",
  wanHE: "万宁线 HE", jiangHE: "江野线 HE", bothLines: "两条线都走过",
  wanAllEnds: "万宁线六个结局走完", jiangAllEnds: "江野线六个结局走完",
  lore8: "档案 ≥ 8 条", allGallery: "图鉴全收", laowan: "读完《老万的十年》",
  platformEnd: "读完《同一个站台》", jujia: "读完《居家情事》", yanhua: "读完《烟花》",
  rawread: "两篇手稿彩蛋都读完", allEndings: "十四个结局全解锁",
  wanEmber: "走到《灯亮着》", wanClean: "走到《没有一个人是干净的》",
  jiangScar: "走到《手上有雪》", jiangEmpty: "走到《空房间》",
  peakFavor: "单周目好感推到 100"
};
for (const t of S.titles){
  doc.push(`| **${t.name}** | ${t.desc} |`);
}
doc.push("");
doc.push("---");
doc.push("");

/* 七、鸣谢 */
doc.push("## 七、鸣谢与声明");
doc.push("");
doc.push("### 制作");
doc.push("");
for (const r of S.credits.roles){
  doc.push(`- ${r.role}：${r.name}${r.twitter ? "（@" + r.twitter + "）" : ""}`);
}
doc.push("");
doc.push("### 音乐");
doc.push("");
for (const m of S.credits.music){
  doc.push(`- 《${m.name}》— ${m.author}　${m.license}　用于 ${m.use}${m.edit ? "；" + m.edit : ""}`);
  doc.push(`  ${m.url}`);
}
doc.push("");
doc.push("### 音效");
doc.push("");
for (const m of S.credits.sfx){
  doc.push(`- 《${m.name}》— ${m.author}　${m.license}　用于 ${m.use}`);
  doc.push(`  ${m.url}`);
}
doc.push("");
doc.push("### 声明");
doc.push("");
for (const t of S.credits.texts) doc.push(`- ${t}`);
doc.push("");

fs.writeFileSync(OUT, doc.join("\n"), "utf8");

/* ---------- 5. 控制台摘要 ---------- */
const kb = (fs.statSync(OUT).size / 1024).toFixed(1);
console.log(`写出 ${path.relative(ROOT, OUT)}　${kb} KB`);
console.log(`章节标记 ${chapterHits} 个　·　正文 ${stats.text} 句　·　${stats.chars} 字　·　选择 ${stats.choice} 处`);
