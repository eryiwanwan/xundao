import io, re, sys

p = 'game/story.js'
s = io.open(p, encoding='utf-8', newline='').read()
orig = s

# ---------- 1. 取出 s2 块 ----------
start_mark = '    /* ---------- HE 后番外《哥哥的柜子》（18+）'
i = s.index(start_mark)
j = s.index('    /* ---------- 第二个隐藏结局', i)
block = s[i:j]
assert 's2: {' in block, '定位失败'

# nodes: [ ... ] 之间的内容
n0 = block.index('      nodes: [') + len('      nodes: [')
n1 = block.rindex('      ]')
nodes_src = block[n0:n1]
lines = [l for l in nodes_src.split('\r\n')]
# 去掉首尾空行
while lines and not lines[0].strip(): lines.pop(0)
while lines and not lines[-1].strip(): lines.pop()

# 改名 + 加两句与 HE 钥匙呼应的收束
out = []
for l in lines:
    if '番外 · 《哥哥的柜子》' in l:
        l = l.replace('番外 · 《哥哥的柜子》', '隐藏结局 · 《哥哥的柜子》')
    out.append(l)

# 在「他站起来去开门。」之后插入三句
extra = [
    '          { t: "text", txt: "门外是她。围巾上落着雪，手里拎着两个冻硬的包子。" },',
    '          { t: "text", sp: "万宁", txt: "门开着。" },',
    '          { t: "text", txt: "她往屋里看了一眼，没问里面有什么。她把包子放在桌上，走过来，蹲在柜子前面，跟他一起看。" },',
]
for k, l in enumerate(out):
    if '他站起来去开门。' in l:
        out[k+1:k+1] = extra
        break
else:
    raise SystemExit('没找到开门那句')

# 统一缩进 +2（从 8 空格到 10 空格）
branch = []
for l in out:
    branch.append(('  ' + l) if l.strip() else l)
branch_txt = '\r\n'.join(branch)

case = ('        { if: { favorMin: 90, clueMin: 5, dangerMax: 40 }, ending: "hidden:gege", branch: [\r\n'
        + branch_txt + '\r\n'
        + '        ]},\r\n')

# ---------- 2. 插入到万宁终章 endcheck（laowan 之前） ----------
anchor = '        { if: { favorMin: 85, clueMin: 5 }, ending: "hidden:laowan", branch: ['
assert s.count(anchor) == 2, ('laowan 锚点数量异常', s.count(anchor))
# 只改第一条（万宁线）
k = s.index(anchor)
s = s[:k] + case + s[k:]

# ---------- 3. 从 extras 里删除 s2 块 ----------
i = s.index(start_mark)
j = s.index('    /* ---------- 第二个隐藏结局', i)
s = s[:i] + s[j:]

io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('ok, +%d 字符' % (len(s) - len(orig)))
