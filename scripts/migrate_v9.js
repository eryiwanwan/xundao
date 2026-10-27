/* migrate_v9.js —— 0.8 → 0.9 数值改造（一次性脚本，跑完就作废）
   做三件事：
   1. 把 63 个选项的 favor 从「小分值」重编成 100 分制，并补上 danger（执念）/ clue（线索）
   2. 把 21 处章内 endcheck 的 min 门槛按新分值重算
   3. 每一处改动都做前置断言，对不上就中止，不会写坏文件
   用法：node scripts/migrate_v9.js
*/
const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "..", "game", "story.js");

/* ---------- 1. 选项数值表：[标签, favor, danger, clue] ---------- */
const WAN_QUIZ = [
  ["一枚旧警徽，编号磨掉半边", 6],
  ["那句『走夜路的人，得知道哪里黑』", 6],
  ["一支没送出去的生日钢笔", 3],
  ["说不出名字", 2],
  ["每晚都翻", 5, 0, 1],
  ["去过几次", 5],
  ["锁了半年，昨晚才推开", 3],
  ["替父亲把没做完的事做完", 6],
  ["看清他到底是什么东西", 4],
  ["不知道。反正他会来", 5],
  ["他的手", 5],
  ["他的眼睛", 4],
  ["逃跑路线", 2]
];
const JIANG_QUIZ = [
  ["头也不回", 5],
  ["看了很久", 3],
  ["记不清了", 2],
  ["看得很清楚：讨债", 3],
  ["其实……不确定", 6],
  ["不敢想", 4],
  ["恨", 3],
  ["母亲的信", 5, 0, 1],
  ["一个没有面孔的『好人』", 6],
  ["想过。她该过得很好", 4],
  ["没想过", 3],
  ["想过她和你一样大的时候", 5]
];

/* 选择项：favor / danger / clue */
const WAN_CHOICE = [
  ["『松手吧。』垂眼看他扣着你的手，『你的手在抖，我看得见。』", 12, -6],
  ["『我叫万宁。你查过我，这我很确定。』", 7, 4],
  ["『……你要钱的话，钱包在书包侧袋。』", -6, 8],
  ["松手。任书包滑下来，替他拉开拉链，把那沓复印件递过去。", 14, 0, 1],
  ["死死护住书包。", 2, 6],
  ["不挣了，靠在墙上看他翻。", 6, -4],
  ["「你是怕我出事，还是怕我查到不该查的？」", 10, 6, 1],
  ["「下次别跟了。再跟，我打110。」", 3, 2],
  ["不说话，从书包抽出一沓复印件晃了晃，转身就走", 13, 10, 1],
  ["问他：\"谁干的。\"", 4, 8, 1],
  ["不问。把纱布缠完，轻轻吹一下。", 12, -8],
  ["站起来：\"我走了。\"", -8, 4],
  ["把他按回墙上：\"你听我说完。\"", 13, 6],
  ["退开两步，给他空间。", 9, -6],
  ["什么都不说，转身下楼。", -5, 3],
  ["你一个人去。让他留在书房守着所有证据。", 8, 9, 1],
  ["你们一起去。\"一伙人，不分开。\"", 14, -3, 1],
  ["让他去。你留在书房守着。", 5, 2]
];
const JIANG_CHOICE = [
  ["『少装。』手上加一分力，让她闭嘴。", -6, 10],
  ["不说话，盯着她。", 4, 4],
  ["『……你什么时候查的我。』", 10, 6, 1],
  ["一把夺过来。", 2, 10],
  ["不接。『少给我设套。』", 6, 8],
  ["接过来。手在抖，没藏。", 13, -6, 1],
  ["她问\"谁干的\"，你答了。", 8, 4, 1],
  ["她没问，把纱布缠完，轻轻吹了一下。", 12, -8],
  ["她说\"我走了\"，转身下楼。", -8, 6],
  ["她按着你肩膀，把你压回墙上，要你面对。", 14, 4],
  ["她退开两步，把空间留给你。", 10, -8],
  ["你摔门冲出去。她跟出来，蹲在你旁边。", 6, 12],
  ["回去了。你说好要和她一起查。", 11, -4],
  ["在楼下站够了，一个人走了。三天没联系她。", -7, 10],
  ["你留在书房守着所有证据。让她一个人去。", 6, 6],
  ["你跟她一起去。\"一伙人，不分开。\"", 14, -3, 1],
  ["你去。你上楼问她。", 9, 8, 1]
];

/* ---------- 2. 章内门槛：行号（1 起）→ [旧 min, 新 min] ---------- */
const MINS = [
  [328, 12, 34], [332, 5, 18],
  [455, 15, 44], [460, 5, 22],
  [557, 15, 48], [563, 5, 26],
  [674, 21, 58], [680, 8, 32],
  [726, 28, 70],
  [847, 28, 72], [853, 15, 44],
  [1171, 7, 32], [1175, 3, 16],
  [1270, 10, 42], [1275, 4, 20],
  [1369, 18, 50], [1375, 8, 28],
  [1483, 22, 60], [1489, 12, 34],
  [1565, 22, 62], [1573, 12, 36]
];

/* ---------- 执行 ---------- */
let src = fs.readFileSync(FILE, "utf8");
const lines = src.split("\n");

const allOpts = [...WAN_QUIZ, ...JIANG_QUIZ, ...WAN_CHOICE, ...JIANG_CHOICE];
const done = new Set();

for (const [label, favor, danger, clue] of allOpts) {
  const needle = `label: "${label.replace(/"/g, '\\"')}"`;
  const hits = lines
    .map((l, i) => (l.includes(needle) ? i : -1))
    .filter(i => i >= 0);
  if (hits.length !== 1) throw new Error(`标签匹配到 ${hits.length} 处（应为 1）：${label}`);
  const i = hits[0];
  if (done.has(i)) throw new Error(`同一行被改了两次：${label}`);
  done.add(i);

  const line = lines[i];
  const at = line.indexOf(needle) + needle.length;
  const m = line.slice(at).match(/,\s*favor:\s*(-?\d+)/);
  if (!m) throw new Error(`没找到 favor：${label}`);

  let rep = `, favor: ${favor}`;
  if (danger) rep += `, danger: ${danger}`;
  if (clue !== undefined) rep += `, clue: ${clue}`;
  const start = at + m.index;
  const end = at + m.index + m[0].length;
  lines[i] = line.slice(0, start) + rep + line.slice(end);
}

for (const [ln, oldMin, newMin] of MINS) {
  const i = ln - 1;
  const want = `{ min: ${oldMin}, branch: [`;
  if (!lines[i].includes(want)) throw new Error(`第 ${ln} 行不是预期内容（找不到 ${want}）`);
  lines[i] = lines[i].replace(want, `{ min: ${newMin}, branch: [`);
}

fs.writeFileSync(FILE, lines.join("\n"), "utf8");
console.log(`选项改写 ${done.size} 处，门槛改算 ${MINS.length} 处`);
