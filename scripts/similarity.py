#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
审查《哥哥的柜子》(s2) 与《居家情事》(jujia) 的相似度
纯本地文本比对，不联网。用法：python scripts/similarity.py
"""
import io, json, re, sys, subprocess, os
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# 用 node 把 story.js + eggs.js 求值一遍，把节点树 dump 成 JSON（不落盘）
NODE_DUMP = r"""
const fs=require('fs');
const eggs=fs.readFileSync('game/eggs.js','utf8');
const EGGS=(0,eval)('(function(){'+eggs+';return EGGS;})()');
const story=fs.readFileSync('game/story.js','utf8');
const STORY=(0,eval)('(function(){var EGGS='+JSON.stringify(EGGS)+';'+story+';return STORY;})()');
function walk(n,out){
  if(!n)return;
  if(Array.isArray(n)){n.forEach(x=>walk(x,out));return;}
  if(n.t==='text')out.push({t:'text',sp:n.sp||null,txt:n.txt});
  if(n.branch)walk(n.branch,out);
  if(n.cases)n.cases.forEach(c=>{if(c.branch)walk(c.branch,out)});
  if(n.opts)n.opts.forEach(o=>{if(o.branch)walk(o.branch,out)});
  if(n.map)for(const k in n.map)walk(n.map[k],out);
}
const main=[]; walk(STORY.lines.wan,main); walk(STORY.lines.jiang,main);
const ex={};
for(const k of ['s2','jujia']){ const a=[]; walk(STORY.extras[k].nodes,a); ex[k]=a; }
process.stdout.write(JSON.stringify({main:main,ex:ex}));
"""

def dump():
    p = subprocess.run(["node", "-e", NODE_DUMP], cwd=ROOT,
                       capture_output=True, text=True, encoding="utf-8")
    if p.returncode != 0:
        print(p.stderr, file=sys.stderr)
        sys.exit(1)
    return json.loads(p.stdout)

DATA = dump()
s2 = DATA["ex"]["s2"]
jj = DATA["ex"]["jujia"]

def flatten(nodes, with_speaker=True):
    """返回 [(speaker|None, txt)]"""
    out = []
    for n in nodes:
        if n.get("t") == "text":
            out.append((n.get("sp"), n["txt"]))
    return out

A = flatten(s2)
B = flatten(jj)

def plain(rows):
    return "".join(t for _, t in rows)

ta, tb = plain(A), plain(B)
na, nb = ta.replace(" ", ""), tb.replace(" ", "")

def norm(s):
    # 只保留汉字，去掉标点空格，用于 n-gram 比对
    return re.sub(r"[^\u4e00-\u9fff]", "", s)

ca, cb = norm(ta), norm(tb)

print("=" * 68)
print("一、体量对照")
print("=" * 68)
def stats(name, rows, s, c):
    sp = sum(len(y) for x, y in rows if x)
    narr = sum(len(y) for x, y in rows if not x)
    sents = [x for x in re.split(r"[。！？…]+", s) if x.strip()]
    return {
        "篇名": name, "节点": len(rows), "汉字": len(c), "总字符": len(s),
        "对白字": sp, "旁白字": narr,
        "对白占比": round(sp / max(1, len(s)) * 100, 1),
        "句数": len(sents),
        "平均句长": round(len(c) / max(1, len(sents)), 1),
    }

sa = stats("哥哥的柜子", A, ta, ca)
sb = stats("居家情事", B, tb, cb)
keys = list(sa.keys())
hdr = "| " + " | ".join(["指标", "哥哥的柜子", "居家情事"]) + " |"
print(hdr)
print("|" + "---|" * 3)
for k in keys[1:]:
    print(f"| {k} | {sa[k]} | {sb[k]} |")

print()
print("=" * 68)
print("二、文本重合度（去掉标点后的汉字串）")
print("=" * 68)

def ngrams(s, n):
    return Counter(s[i:i + n] for i in range(len(s) - n + 1))

for n in (2, 3, 4):
    ga, gb = ngrams(ca, n), ngrams(cb, n)
    inter = sum((ga & gb).values())
    union = sum((ga | gb).values())
    # 覆盖率和 Jaccard 两个口径都看
    cov_a = inter / max(1, sum(ga.values())) * 100
    print(f"{n}-gram  共有 {inter:5d} / 甲{sum(ga.values()):5d} / 乙{sum(gb.values()):5d}   "
          f"Jaccard {inter/union*100:5.2f}%   甲被覆盖 {cov_a:5.2f}%")

def lcsubstr(a, b):
    """最长公共子串（滚动一维 DP）"""
    la, lb = len(a), len(b)
    if la == 0 or lb == 0:
        return 0, ""
    prev = [0] * (lb + 1)
    best, bi = 0, 0
    for i in range(1, la + 1):
        cur = [0] * (lb + 1)
        ai = a[i - 1]
        for j in range(1, lb + 1):
            if ai == b[j - 1]:
                v = prev[j - 1] + 1
                cur[j] = v
                if v > best:
                    best, bi = v, i
        prev = cur
    return best, a[bi - best:bi]

L, sub = lcsubstr(ca, cb)
print(f"\n全文最长公共子串：{L} 字 —— 「{sub}」")

# 句级：拆句，找每句在另一篇里的最长命中
print()
print("=" * 68)
print("三、逐句撞车清单（句子在另一篇里能找到 ≥8 字的连续重合）")
print("=" * 68)

def split_sents(rows):
    out = []
    for sp, t in rows:
        for p in re.split(r"(?<=[。！？…])", t):
            p = p.strip()
            if len(norm(p)) >= 4:
                out.append((sp, p))
    return out

SA, SB = split_sents(A), split_sents(B)

def best_hit(s, other):
    n = norm(s)
    if len(n) < 4:
        return 0, ""
    # 在另一篇汉字串上找最长公共子串（用后缀暴力但限制长度）
    best, bstr = 0, ""
    step = 3
    for L0 in range(len(n), 7, -1):
        found = False
        for i in range(0, len(n) - L0 + 1, 1):
            if n[i:i + L0] in other:
                best, bstr = L0, n[i:i + L0]
                found = True
                break
        if found:
            break
    return best, bstr

hits = []
for sp, s in SA:
    L0, frag = best_hit(s, cb)
    if L0 >= 8:
        hits.append((L0, "甲→乙", sp or "旁白", s))
for sp, s in SB:
    L0, frag = best_hit(s, ca)
    if L0 >= 8:
        hits.append((L0, "乙→甲", sp or "旁白", s))

hits.sort(reverse=True)
print(f"甲篇 {len(SA)} 句、乙篇 {len(SB)} 句，其中命中 {len(hits)} 条：\n")
for L0, d, sp, s in hits:
    print(f"  [{L0:2d}字·{d}·{sp}] {s[:60]}")

print()
print("=" * 68)
print("四、意象/道具词频（每万字密度）")
print("=" * 68)
BAG = ["项圈", "链", "狗", "柜子", "跪", "地毯", "厨房", "做饭", "围裙", "电视",
       "综艺", "喘", "抖", "哥哥", "宝宝", "乖", "爬", "膝盖", "沙发", "衬衫",
       "空调", "澡", "头发", "刀", "雪", "冬", "夏", "笑", "羞", "脚"]
print("| 词 | 甲(次) | 甲密度/万字 | 乙(次) | 乙密度/万字 |")
print("|---|---:|---:|---:|---:|")
rows = []
for w in BAG:
    a, b = ta.count(w), tb.count(w)
    if a + b == 0:
        continue
    rows.append((w, a, a / len(ca) * 10000, b, b / len(cb) * 10000))
rows.sort(key=lambda r: -(r[2] + r[4]))
for w, a, da, b, db in rows:
    print(f"| {w} | {a} | {da:.1f} | {b} | {db:.1f} |")

print()
print("=" * 68)
print("六、番外 ↔ 正文 自我重复（同作品内部撞自己，≥9 字连续重合）")
print("=" * 68)
main = DATA["main"]
cm = norm("".join(x["txt"] for x in main))

def cross(name, rows, corpus, thresh=9):
    print(f"\n【{name} ↔ 正文】正文 {len(cm)} 汉字")
    found = []
    for sp, s in rows:
        n = norm(s)
        if len(n) < thresh:
            continue
        best, frag = 0, ""
        for L0 in range(len(n), thresh - 1, -1):
            hit = None
            for i in range(len(n) - L0 + 1):
                if n[i:i + L0] in corpus:
                    hit = n[i:i + L0]
                    break
            if hit:
                best, frag = L0, hit
                break
        if best >= thresh:
            found.append((best, sp or "旁白", s, frag))
    found.sort(reverse=True)
    if not found:
        print("  无")
    for L0, sp, s, frag in found:
        print(f"  [{L0:2d}字·{sp}] {s}")
        print(f"          ↳ 重合片段：「{frag}」")
    return found

cross("哥哥的柜子", A, cm)
cross("居家情事", B, cm)
def finger(s):
    return {
        "省略号": s.count("…"),
        "破折号": s.count("——"),
        "引号对白": s.count("「") + s.count("“") + s.count('"'),
        "逗号密度/百字": round(s.count("，") / max(1, len(s)) * 100, 1),
        "句号密度/百字": round(s.count("。") / max(1, len(s)) * 100, 1),
    }
fa, fb = finger(ta), finger(tb)
print()
print("=" * 68)
print("七、句式指纹")
print("=" * 68)
print("| 特征 | 甲 | 乙 |")
print("|---|---:|---:|")
for k in fa:
    print(f"| {k} | {fa[k]} | {fb[k]} |")
