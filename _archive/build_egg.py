#!/usr/bin/env python3
"""把 chapters/ 里两篇 18+ 原稿的正文，转成 story.js 里两篇独立彩蛋的节点块：
    extras.yanhua《烟花》(S1 新年·台阶) / extras.jujia《居家情事》(S2 哥哥的柜子)
原稿一字不改，只做分页（按句号切分，避免单页过长）。"""
import json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def section(path, head="## 完整版正文（用户原稿，18+）"):
    txt = open(path, encoding="utf-8").read()
    i = txt.index(head) + len(head)
    rest = txt[i:]
    j = rest.index("\n---")
    body = rest[:j].strip()
    paras = [p.strip() for p in re.split(r"\n\s*\n", body) if p.strip()]
    clean = []
    for p in paras:
        p = p.replace("**", "").replace("*", "")
        p = re.sub(r"^#+\s*", "", p)
        clean.append(re.sub(r"\s*\n\s*", "", p))
    return clean


def paginate(p, limit=96):
    """按句末标点切页，尽量不拆句。"""
    if len(p) <= limit:
        return [p]
    parts = re.findall(r"[^。！？…]*[。！？…]+|[^。！？…]+$", p)
    out, buf = [], ""
    for s in parts:
        if len(buf) + len(s) > limit and buf:
            out.append(buf)
            buf = s
        else:
            buf += s
    if buf:
        out.append(buf)
    # 极端长句兜底硬切
    final = []
    for s in out:
        while len(s) > limit * 1.8:
            final.append(s[:limit])
            s = s[limit:]
        final.append(s)
    return final


def node(**kw):
    return "{ " + ", ".join(f'{k}: {json.dumps(v, ensure_ascii=False)}'
                            if isinstance(v, str) else f"{k}: {v}"
                            for k, v in kw.items()) + " },"


def build_one(key, title, desc, privacy, scene_bg, scene_img, lead, paragraphs):
    """生成一篇彩蛋的完整对象文本。"""
    L = []
    a = L.append
    a("")
    a(f"    /* ---------- 彩蛋《{title}》（通关任意结局后解锁） ---------- */")
    a(f"    {key}: {{")
    a(f'      title: "{title}",')
    a('      sub: "彩蛋 · 作者手稿",')
    a('      cond: "clear",')
    a('      condText: "通关任意一个结局后，这一页才会出现",')
    a(f'      desc: "{desc}",')
    a("      nodes: [")
    a('        { t: "bg", c: "#07070a" },')
    a('        { t: "bgimg", key: "" },')
    a('        { t: "char", who: null },')
    a('        { t: "bgm", key: "aftermath" },')
    a(f'        {{ t: "text", cls: "letter", txt: "彩蛋 · {title}" }},')
    for t in ["这一页不是正文。", privacy]:
        a(node(t="text", txt=t))

    a(f'        {{ t: "bg", c: "{scene_bg}" }},')
    if scene_img:
        a(f'        {{ t: "bgimg", key: "{scene_img}" }},')
    for t in lead:
        a(node(t="text", txt=t))
    for p in paragraphs:
        for seg in paginate(p):
            a(node(t="text", txt=seg))

    a('        { t: "bg", c: "#07070a" },')
    a('        { t: "char", who: null },')
    a('        { t: "text", cls: "letter", txt: "— 原稿完 —" },')
    a(node(t="text", txt="手稿到此为止。正式稿在这里收了声——因为故事要继续往下走。"))
    a(node(t="text", txt="谢谢你读到这一页。"))
    a("      ]")
    a("    },")
    return "\n".join(L)


def build():
    s1 = section(os.path.join(ROOT, "chapters/S1_新年_台阶_18plus.md"))
    s2 = section(os.path.join(ROOT, "chapters/S2_哥哥的柜子_18plus.md"))

    yanhua = build_one(
        key="yanhua", title="烟花",
        desc="新年那晚，台阶上的另一段。作者原稿，一字未删。",
        privacy="看完不用告诉别人。这是给你的。",
        scene_bg="#0b0c11", scene_img=None,
        lead=[
            "正式稿里，这一段缩成了一句「你伸手，捧住他的脸」。",
            "原稿不是。原稿写的是雪、爆竹、台阶，和一个冻得没有知觉的人。",
        ],
        paragraphs=s1,
    )
    jujia = build_one(
        key="jujia", title="居家情事",
        desc="那个夏天，灯是亮的，人也醒着。作者原稿，一字未删。",
        privacy="这一页也不必告诉别人。这是给你的。",
        scene_bg="#141110", scene_img="wan_bedroom",
        lead=[
            "正式稿里，那个夏天被写成了灯亮着、没有人去看它。",
            "原稿里，灯是亮的，人也醒着。下面这一整段，正式稿里没有。",
        ],
        paragraphs=s2,
    )
    return yanhua + "\n\n" + jujia, len(s1), len(s2)


if __name__ == "__main__":
    block, n1, n2 = build()
    p = os.path.join(ROOT, "game/story.js")
    src = open(p, encoding="utf-8").read()
    for key in ("yanhua: {", "jujia: {"):
        if key in src:
            sys.exit(f"已存在 {key[:-3]} 块，先手动删除再跑")
    anchor = "\n  },\n\n  /* ============================================================\n     图鉴"
    assert anchor in src, "找不到 extras 结束锚点"
    src = src.replace(anchor, "\n" + block.rstrip().rstrip(",") + "\n" + anchor, 1)
    open(p, "w", encoding="utf-8").write(src)
    print(f"S1 {n1} 段 -> extras.yanhua《烟花》 / S2 {n2} 段 -> extras.jujia《居家情事》")
