/* rebe_v10.js —— 把《野狗的死法》的三个触发点拆成三个不同的 BE
   原状：独走 flag / 执念 ≥85 / 好感 <30 全落进同一段《野狗的死法》正文，重复度太高。
   现在：
     万宁线  独走 flag → wan:be《野狗的死法》（保留）
             执念 ≥85  → wan:burn《烧到自己》   —— 她不等第 5 条线索，自己动手，烧了自己的手
             好感 <30  → wan:gone《没人在家》   —— 他退了租走了，她连一句话都没说上
     江野线  独走 flag → jiang:be《野狗的死法》（保留）
             执念 ≥85  → jiang:blade《刀口朝内》—— 他没交录音，自己动了刀
             好感 <30  → jiang:nobody《无人认领》—— 他把她填进紧急联系人，她没去
   做法与 fix_finale.js 相同：从数据层重建两条线最后一个 endcheck 的源码。
*/
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const FILE = path.join(__dirname, "..", "game", "story.js");

const ctx = { console }; vm.createContext(ctx);
let src = fs.readFileSync(FILE, "utf8");
vm.runInContext(src + "\n;globalThis.STORY = STORY;", ctx);
const S = ctx.STORY;

const head = [
  { t: "bg", c: "#07070a" },
  { t: "bgm", key: "stairs_tense" },
  { t: "char", who: null }
];
const tail = (line1, line2) => ([
  { t: "text", cls: "letter", txt: line1 },
  { t: "text", cls: "letter", txt: line2 },
  { t: "end" }
]);
const T = (txt) => ({ t: "text", txt });
const S1 = (sp, txt) => ({ t: "text", sp, txt });
const L = (txt) => ({ t: "text", cls: "letter", txt });

/* ---------- 万宁线：执念烧穿 → 《烧到自己》 ---------- */
const wanBurn = [
  ...head,
  L("BE · 《烧到自己》"),
  T("第 5 条线索，你等不到了。"),
  T("你知道它在哪里。你只是拿不到。"),
  T("你换了个办法。你把父亲留下的那套房子抵了，凑出一笔钱，给了那个已经从里面出来的旧部。他要的不多——在法庭上说一句「那天晚上，楼顶有人」。"),
  T("他收了。开庭那天，他说了。郑维成的律师当场调出转账记录。"),
  T("六个月后判决下来。郑维成无罪。你因伪造证据、行贿，判了三年。"),
  T("宣判那天，你回头看旁听席。江野坐在最后一排。他没有站起来。"),
  T("你去服刑那天，下雪。他站在看守所门口，隔着铁门看你。"),
  S1("江野", "我等你。"),
  S1("万宁", "别等。"),
  T("三年里他来过十一次。前五次你出去见他。第六次起，你不去了。"),
  T("出狱那天是春天。铁门外没有人。你早就算准了他不会来——你让他别等，他听了。这是你第一次希望他不听。"),
  T("父亲的照片还在书房。相框上落了灰。你擦了很久，没擦干净。"),
  ...tail("有些火是用来照路的。你把它扔进了柴堆。", "— 完 —")
];

/* ---------- 万宁线：低好感 → 《没人在家》 ---------- */
const wanGone = [
  ...head,
  L("BE · 《没人在家》"),
  T("你去找他的那天，修车行的卷帘门拉着。门口堆着三个空机油桶。"),
  T("隔壁的老板娘说他退了租，走得急，工具都没带走。"),
  T("你站在卷帘门前，把手机拿出来，又放回去。你不知道该说什么。你们之间，还没有一句话是能说到那个份上的。"),
  T("一个月后，你收到一个快递。没有寄件人。里面是那把书房的钥匙，用旧报纸包着。报纸是北边一个县城的。"),
  T("你查了那个县城的消息。一条本地新闻：某工地脚手架坍塌，一人死亡，身份待核实，无家属认领。"),
  T("你打了那条新闻里的电话。对方问你和他什么关系。"),
  T("你张了张嘴。你们什么关系？你甚至想不起来，自己是什么时候才知道他全名的。"),
  S1("万宁", "……我是他朋友。"),
  T("你在那个县城待了两天。殡仪馆的白墙，走廊尽头有一扇窗，窗外就是那个工地。"),
  T("你签了字。你把他的骨灰带回雾川，葬在你父亲墓的旁边。碑上你只刻了名字，没刻日期——你不知道他是哪天生的。"),
  T("郑维成还在那栋楼里。你父亲的案子，卷宗上仍写着「意外」。你什么都没能改变。"),
  T("你后来常想：如果那天你把卷帘门拉开，会不会不一样。可那天你没拉。你站在门口，站了十分钟，走了。"),
  ...tail("他不是没等。是你没敲门。", "— 完 —")
];

/* ---------- 江野线：执念烧穿 → 《刀口朝内》 ---------- */
const jiangBlade = [
  ...head,
  L("BE · 《刀口朝内》"),
  T("你没把录音交出去。你揣着它，去了郑维成的办公室。"),
  T("他给你倒了茶，说了四十分钟。他说你父亲当年也这么坐着，说他这辈子最对不起的就是你爸。"),
  T("你听完了。你说：你说得对。"),
  T("然后你把刀拿出来。"),
  T("一刀。你没给他第二刀的机会，也没给自己。"),
  T("你把刀放在桌上，坐在他对面等警车。桌上的茶还热着。"),
  T("审讯的时候你什么都认。警察问你为什么，你说：他把我爸推下去的。"),
  T("无期。后来减到二十五年。你四十岁进去，出来六十。"),
  T("她来看过你。第一次隔着玻璃，你拿起电话，说了三分钟。第二次你没出去。"),
  T("第四次她带了一张纸来，贴在玻璃上。上面写着：书房我留着。"),
  T("你把那行字看了很久。你按下挂断键的时候，她还在说话。"),
  T("后来她不再来了。你在里面学会一件事：有些人不用等，等也等不到。"),
  ...tail("你这辈子只学会了一件事，怎么杀人。这一次你杀对了。代价是你自己。", "— 完 —")
];

/* ---------- 江野线：低好感 → 《无人认领》 ---------- */
const jiangNobody = [
  ...head,
  L("BE · 《无人认领》"),
  T("你把钥匙放在她家门口的地垫下面。你没敲门。"),
  T("往北的车过收费站时，你回头看了一眼雾川。雾很大，什么也看不见。"),
  T("你在一个县城的工地上干了两年。工头问你家里有谁，你说没有。"),
  T("填表的时候，「紧急联系人」那一栏，你写了她的电话。"),
  T("写完你自己也笑了一下。你们连一顿饭都没吃完过。"),
  T("塌方是下午三点。你在下面。"),
  T("她的电话响了三次。她在开会，挂了两次。第三次她接了。"),
  T("那边是个陌生男人的声音。他问：你认识江野吗。"),
  T("她愣了很久。她说：认识。"),
  T("那边说：麻烦你来一趟。"),
  T("她没去。那天晚上她在书房坐到天亮，把六年的卷宗全部翻了一遍，想找出一个自己「该去」的理由。"),
  T("她没找到。"),
  T("一个月后，她收到一张照片。碑上刻着编号，名字在下面，小一号。碑前没有花。"),
  T("她把照片夹进父亲的笔记里，没跟任何人提过。只是从那天起，她再没开过书房那盏灯。"),
  ...tail("他到死都没弄明白，自己算她的谁。", "— 完 —")
];

/* ---------- 组装 cases ---------- */
function buildCases(line) {
  const all = S.lines[line].filter(n => n.t === "endcheck").pop().cases;
  const pick = (test) => all.find(test);

  const flag   = pick(c => c.ifFlag === "hiddenRevenge");
  const hidden = pick(c => c.ending === "hidden:laowan");
  const dark   = pick(c => /:(clean|scar)$/.test(c.ending || ""));
  const he     = pick(c => /:he$/.test(c.ending || ""));
  const soft   = pick(c => /:(ember|empty)$/.test(c.ending || ""));
  const normal = pick(c => /:normal$/.test(c.ending || ""));
  const cold   = pick(c => /:cold$/.test(c.ending || ""));
  const last   = pick(c => c.else);

  const need = { flag, hidden, dark, he, soft, normal, cold, last };
  for (const k of Object.keys(need)) if (!need[k]) throw new Error(`${line} 缺少分支: ${k}`);

  const dangerBe = line === "wan" ? wanBurn : jiangBlade;
  const goneBe   = line === "wan" ? wanGone : jiangNobody;
  const goneId   = line === "wan" ? "wan:gone" : "jiang:nobody";
  const burnId   = line === "wan" ? "wan:burn" : "jiang:blade";

  /* 阈值按真实可达区间定（穷举 2187 条路径后的实测分布）：
     好感 30–54 的段落里，执念 ≥55 是「自己动了手」，40–54 是「散了但还有火气」，
     <40 是「谁也没为对方做过什么」——三段各给一个结局。 */
  return [
    Object.assign({}, flag, { ending: line + ":be" }),
    Object.assign({}, hidden, { if: { favorMin: 85, clueMin: 5 } }),
    Object.assign({}, dark,   { if: { favorMin: 80, dangerMin: 40 } }),
    Object.assign({}, he,     { if: { favorMin: 80, clueMin: 4 } }),
    Object.assign({}, soft,   { if: { favorMin: 80 } }),
    Object.assign({}, normal, { if: { favorMin: 55 } }),
    { if: { favorMin: 30, dangerMin: 55 }, ending: burnId, branch: dangerBe },
    Object.assign({}, cold,   { if: { favorMin: 30, dangerMin: 40 } }),
    Object.assign({}, last,   { ending: goneId, branch: goneBe })
  ];
}

/* ---------- 源码输出 ---------- */
function emitNode(n, ind) {
  const p = " ".repeat(ind);
  if (n.t === "text") {
    const parts = ['t: "text"'];
    if (n.sp)  parts.push(`sp: ${JSON.stringify(n.sp)}`);
    if (n.cls) parts.push(`cls: ${JSON.stringify(n.cls)}`);
    parts.push(`txt: ${JSON.stringify(n.txt)}`);
    return `${p}{ ${parts.join(", ")} }`;
  }
  if (n.t === "bg")    return `${p}{ t: "bg", c: ${JSON.stringify(n.c)} }`;
  if (n.t === "bgimg") return `${p}{ t: "bgimg", key: ${JSON.stringify(n.key||"")} }`;
  if (n.t === "char")  return `${p}{ t: "char", who: ${n.who===null?"null":JSON.stringify(n.who)}${n.pose?`, pose: ${JSON.stringify(n.pose)}`:""} }`;
  if (n.t === "bgm")   return n.stop ? `${p}{ t: "bgm", stop: true }` : `${p}{ t: "bgm", key: ${JSON.stringify(n.key)} }`;
  if (n.t === "sfx")   return `${p}{ t: "sfx", key: ${JSON.stringify(n.key)} }`;
  if (n.t === "flag")  return `${p}{ t: "flag", key: ${JSON.stringify(n.key)}, val: ${n.val===undefined?true:JSON.stringify(n.val)} }`;
  if (n.t === "end")   return `${p}{ t: "end" }`;
  throw new Error("未知节点类型: " + n.t);
}
function emitIf(x) {
  const order = ["favorMin","favorMax","dangerMin","dangerMax","clueMin","clueMax"];
  const parts = order.filter(k => x[k] !== undefined).map(k => `${k}: ${x[k]}`);
  return `{ ${parts.join(", ")} }`;
}
function emitCases(cases) {
  const out = [];
  out.push(`      { t: "endcheck", cases: [`);
  cases.forEach((c, i) => {
    let head;
    if (c.ifFlag) head = `        { ifFlag: ${JSON.stringify(c.ifFlag)}, ending: ${JSON.stringify(c.ending)}, branch: [`;
    else if (c.else) head = `        { else: true, ending: ${JSON.stringify(c.ending)}, branch: [`;
    else head = `        { if: ${emitIf(c.if)}, ending: ${JSON.stringify(c.ending)}, branch: [`;
    out.push(head);
    out.push((c.branch || []).map(n => emitNode(n, 10)).join(",\n"));
    out.push(i === cases.length - 1 ? `        ]}` : `        ]},`);
  });
  out.push(`      ]`);
  return out.join("\n");
}

/* ---------- 定位两条线的终章 endcheck ---------- */
const MARK = `      { t: "endcheck", cases: [`;
const FINALE = `§ 正月初五 · 终章 §`;
const marks = [];
let at = -1;
while ((at = src.indexOf(FINALE, at + 1)) !== -1) marks.push(at);
if (marks.length !== 2) throw new Error("终章标记数量异常: " + marks.length);
const positions = marks.map(m => {
  const p = src.indexOf(MARK, m);
  if (p < 0) throw new Error("终章之后没找到 endcheck");
  return p;
});

function spanEnd(start) {
  let i = src.indexOf("[", start);
  let depth = 0, inStr = false, quote = "";
  for (; i < src.length; i++) {
    const ch = src[i];
    if (inStr) {
      if (ch === "\\") { i++; continue; }
      if (ch === quote) inStr = false;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") { inStr = true; quote = ch; continue; }
    if (ch === "[") depth++;
    else if (ch === "]") { depth--; if (depth === 0) return i + 1; }
  }
  throw new Error("括号没配平");
}

const wanStart = positions[0], wanEnd = spanEnd(wanStart);
const jiangStart = positions[1], jiangEnd = spanEnd(jiangStart);

const wanText = emitCases(buildCases("wan"));
const jiangText = emitCases(buildCases("jiang"));

src = src.slice(0, jiangStart) + jiangText + src.slice(jiangEnd);
src = src.slice(0, wanStart) + wanText + src.slice(wanEnd);

fs.writeFileSync(FILE, src, "utf8");

/* ---------- 复核 ---------- */
const ctx2 = { console }; vm.createContext(ctx2);
vm.runInContext(fs.readFileSync(FILE, "utf8") + "\n;globalThis.STORY = STORY;", ctx2);
for (const L2 of ["wan", "jiang"]) {
  const c = ctx2.STORY.lines[L2].filter(n => n.t === "endcheck").pop().cases;
  console.log(`${L2}: ${c.length} 个分支 →`);
  c.forEach(x => console.log("   ", x.ending.padEnd(16), x.if ? JSON.stringify(x.if) : x.ifFlag ? "flag" : "else", "|", (x.branch || []).length, "节点"));
}
