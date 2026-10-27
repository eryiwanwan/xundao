# v0.11 数据层：新增《到此为止》《不了了之》两个结局 + 重写全部 hint + 两个称号 + 引擎条件
import io

p = "game/story.js"
s = io.open(p, encoding="utf-8").read()

# ---------- 1. 结局 hint 全部按新阈值重写 ----------
HINT = {
    "wan:he":     "好感 72 以上、线索 4 条以上，执念压在 40 以下",
    "wan:clean":  "好感 72 以上，同时把执念烧到 40 以上",
    "wan:ember":  "好感 72 以上，线索只到 3 条以内，执念压在 40 以下",
    "wan:normal": "好感 50–71，线索查到 4 条以上——案子有了说法，人还是走了",
    "wan:cold":   "好感 28–49，执念 36–51——散了，但还有火气",
    "wan:burn":   "好感 50–71 或 28–49，执念烧到 52 以上——她不等证据链，自己动手",
    "wan:gone":   "好感 28–49 且执念低于 36，或好感不到 28——两个人都没为对方做过什么",
    "jiang:he":   "好感 72 以上、线索 3 条以上，执念压在 40 以下",
    "jiang:scar": "好感 72 以上，同时把执念烧到 40 以上",
    "jiang:empty":"好感 72 以上，线索只到 2 条以内，执念压在 40 以下",
    "jiang:normal":"好感 50–71，线索查到 3 条以上——案子有了说法，人还是走了",
    "jiang:cold": "好感 28–49，执念 42–65——散了，但还有火气",
    "jiang:blade":"好感 50–71 或 28–49，执念烧到 66 以上——他把杀心走到底",
    "jiang:nobody":"好感 28–49 且执念低于 42，或好感不到 28——他连自己算她的谁都说不清",
}
OLD = {
    "wan:he": "好感 80 以上、线索 4 条以上，执念压在 40 以下",
    "wan:clean": "好感 80 以上，同时把执念烧到 40 以上",
    "wan:ember": "好感 80 以上，线索没查满（3 条以下），执念压在 40 以下",
    "wan:cold": "好感 30–54，执念也烧过了 40（40–54）",
    "wan:burn": "好感 30–54，同时把执念烧到 55 以上——她不等证据链，自己动手",
    "wan:gone": "好感 30–54，且执念压在 40 以下——两个人都没为对方做过什么",
    "jiang:he": "好感 80 以上、线索 4 条以上，执念压在 40 以下",
    "jiang:scar": "好感 80 以上，同时把执念烧到 40 以上",
    "jiang:empty": "好感 80 以上，线索没查满（3 条以下），执念压在 40 以下",
    "jiang:cold": "好感 30–54，执念也烧过了 40（40–54）",
    "jiang:burn": None,
    "jiang:blade": "好感 30–54，同时把执念烧到 55 以上——他把杀心走到底",
    "jiang:nobody": "好感 55 以下，执念也没烧起来（40 以下）——他连自己算她的谁都说不清",
}
# 直接整体重写：按 "name" 定位每个结局块里的 hint 行
import re
blocks = re.finditer(r'(\s*)"(wan|jiang):(\w+)": \{\n(.*?)\n    \},', s, re.S)
edits = []
for m in blocks:
    eid = f"{m.group(2)}:{m.group(3)}"
    if eid in HINT:
        body = m.group(4)
        new_body = re.sub(r'hint: "[^"]*"', 'hint: ' + repr(HINT[eid]).replace("'", '"'), body)
        edits.append((m.start(4), m.end(4), new_body))
for a, b, new in reversed(edits):
    s = s[:a] + new + s[b:]
print("hint 重写", len(edits), "处")

# ---------- 2. 两个新结局 ----------
WAN_HALT = '''
    "wan:halt": {
      line: "wan", type: "halt",
      name: "普通结局 · 《到此为止》",
      brief: "案子和人，一起停在正月十五。",
      desc: "材料够让郑维成难受一阵，不够让他坐进去。她把纸箱搬到柜子最上层，没锁。四月修车行换了老板。她再去那条后街时，走得快一点。",
      hint: "好感 50–71，线索只到 3 条以内——案子停了，人也停了"
    },'''
JIANG_HALT = '''
    "jiang:halt": {
      line: "jiang", type: "halt",
      name: "普通结局 · 《不了了之》",
      brief: "阿灿出来了，仇留下了，人走了。",
      desc: "他看见报纸中缝那则「因病退休」的公告，折起来塞进工具箱最下面。第二年冬天他把那把刀扔进江里。他没变成好人，只是没变成那个人。",
      hint: "好感 50–71，线索只到 2 条以内——仇没报，人也没留"
    },'''

# 插在各自 cold 结局之前（键名不受 hint 重写影响）
for key, block in (('    "wan:cold": {', WAN_HALT), ('    "jiang:cold": {', JIANG_HALT)):
    assert s.count(key) == 1, (key, s.count(key))
    s = s.replace(key, block.lstrip("\n") + "\n" + key, 1)
print("两个新结局已插入")

# ---------- 3. 两个称号 ----------
a = '    { id: "empty",    name: "空房间",   cond: "jiangEmpty",  desc: "走到《空房间》。「我不去」是他说过最难的一句话。" },\n'
assert s.count(a) == 1
s = s.replace(a, a +
  '    { id: "halt",     name: "到此为止", cond: "wanHalt",     desc: "走到《到此为止》。案子停在那儿，人也停在那儿。" },\n'
  '    { id: "unsolved", name: "不了了之", cond: "jiangHalt",   desc: "走到《不了了之》。仇没报，人没留，日子照过。" },\n')

# ---------- 4. 版本号 ----------
s = s.replace(
  'version: "Demo 0.9.1（18+ 正式版 · 18 结局 · 好感 100 分制 × 执念 × 线索 · 跳过已读）"',
  'version: "Demo 0.10（18+ 正式版 · 20 结局 · 8 个选择点 · 好感 100 分制 × 执念 × 线索）"')
s = s.replace('desc: "十八个结局全部解锁。"', 'desc: "二十个结局全部解锁。"')
s = s.replace('走完江野线全部八个结局后解锁', '走完江野线全部九个结局后解锁')
s = s.replace('走完万宁线全部八个结局后解锁', '走完万宁线全部九个结局后解锁')
s = s.replace('万宁线的八个结局全部走完。', '万宁线的九个结局全部走完。')
s = s.replace('江野线的八个结局全部走完。', '江野线的九个结局全部走完。')

# ---------- 5. 头注释 ----------
s = s.replace('''  /* ================= 结局表（18 个） =================
     一条线的八个结局 = 好感 × 执念 × 线索 三个数一起判：''',
'''  /* ================= 结局表（20 个） =================
     一条线的九个结局 = 好感 × 执念 × 线索 三个数一起判：''')
s = s.replace('''       好感 55–79                   → 普通结局《各自过冬》''',
'''       好感 50–71 + 线索够          → 普通结局《各自过冬》
       好感 50–71 + 线索不够        → 普通结局《到此为止》/《不了了之》''')

io.open(p, "w", encoding="utf-8").write(s)
print("story.js 数据层改完")

# ---------- 6. 引擎称号条件 ----------
p2 = "game/engine.js"
e = io.open(p2, encoding="utf-8").read()
a = '    case "jiangNobody":return !!e["jiang:nobody"];'
assert e.count(a) == 1
e = e.replace(a, a + '\n    case "wanHalt":    return !!e["wan:halt"];\n    case "jiangHalt":  return !!e["jiang:halt"];')
io.open(p2, "w", encoding="utf-8").write(e)
print("engine.js 条件改完")
