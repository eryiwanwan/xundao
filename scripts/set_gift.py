# -*- coding: utf-8 -*-
"""set_gift.py —— 改福利码（一条命令，不用碰代码）

用法：
    python scripts/set_gift.py 你的码                  # 设成这一个
    python scripts/set_gift.py 码A 码B                 # 多个码都认
    python scripts/set_gift.py --show                  # 看现在是什么
    python scripts/set_gift.py --off                   # 关掉入口（清空码表）
    python scripts/set_gift.py                         # 不带参数 → 问你要

它会做三件事：
    1. 改写 game/story.js 里 gift.codes
    2. 把 game/index.html 的 ?v= 缓存在版本号加一档（不然玩家还是看到旧码）
    3. 告诉你下一步怎么发

码的规则：4–24 个字符，中英文数字都行；玩家输入时大小写、空格、连字符、
全角半角都不计较。
"""
import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STORY = os.path.join(ROOT, "game", "story.js")
INDEX = os.path.join(ROOT, "game", "index.html")

MIN_LEN, MAX_LEN = 4, 24


def read(p):
    with io.open(p, encoding="utf-8") as f:
        return f.read()


def write(p, s):
    """仓库里的文件都是 CRLF，别改成 LF，否则 git diff 会整文件飘红。"""
    with io.open(p, "w", encoding="utf-8", newline="\r\n") as f:
        f.write(s)


def norm(code):
    """和引擎里 normCode() 保持一致：全角转半角、去空格连字符、大写。"""
    import unicodedata
    t = unicodedata.normalize("NFKC", str(code))
    return re.sub(r"[\s\-_.·。、]", "", t).upper()


def current_codes(text):
    m = re.search(r"gift:\s*\{(.*?)\n  \}", text, re.S)
    if not m:
        sys.exit("✗ 在 story.js 里找不到 gift: { ... } 这一段，脚本可能过期了")
    cm = re.search(r"codes:\s*\[(.*?)\]", m.group(1), re.S)
    if not cm:
        return []
    return re.findall(r'"([^"]*)"', cm.group(1))


def clean(raw_list):
    out, seen, bad = [], set(), []
    for raw in raw_list:
        code = raw.strip()
        if not code:
            continue
        if len(code) < MIN_LEN or len(code) > MAX_LEN:
            bad.append((code, "长度要在 %d–%d 之间" % (MIN_LEN, MAX_LEN)))
            continue
        if '"' in code or "\\" in code:
            bad.append((code, '不能含英文引号 " 和反斜杠'))
            continue
        k = norm(code)
        if k in seen:
            continue                      # 归一化后重复的，静默去掉
        seen.add(k)
        out.append(code)
    return out, bad


def write_codes(text, codes):
    body = ", ".join('"%s"' % c for c in codes)
    line = "    codes: [%s]," % body
    if not codes:
        line = "    codes: [],"
    # 锚到行首那 4 个空格：story.js 的注释里还有一行示例（缩进更深），别改错了
    new, n = re.subn(r"(?m)^    codes:\s*\[[^\]]*\],$", line, text, count=1)
    if n != 1:
        sys.exit("✗ 没找到 codes: [...] 那一行")
    return new


def bump_cache(text):
    m = re.search(r"\?v=(\d+)", text)
    if not m:
        return text, None
    old = m.group(1)
    new = "%03d" % (int(old) + 1)
    return text.replace("?v=" + old, "?v=" + new), (old, new)


def main():
    args = [a for a in sys.argv[1:]]

    story = read(STORY)
    cur = current_codes(story)
    print("当前福利码：%s" % (" / ".join(cur) if cur else "（未设置，入口关闭）"))

    if "--show" in args:
        return

    if "--off" in args:
        codes = []
    elif args:
        codes = args
    else:
        tip = "输入新的福利码（多个用空格或逗号隔开，直接回车取消）> "
        try:
            raw = input(tip)
        except EOFError:
            return
        codes = [x for x in re.split(r"[,\s，]+", raw) if x]
        if not codes:
            print("没输入，什么都没改。")
            return

    codes, bad = clean(codes)
    for c, why in bad:
        print("  ✗ 跳过 %r：%s" % (c, why))
    if not codes and "--off" not in args:
        sys.exit("✗ 没有一个合格的码，没改。")

    if codes and codes == cur:
        print("新码和现在一样，不用改。")
        return

    story = write_codes(story, codes)
    write(STORY, story)

    index = read(INDEX)
    index, ver = bump_cache(index)
    write(INDEX, index)

    print("新的福利码：%s" % (" / ".join(codes) if codes else "（空，入口隐藏）"))
    print("  · game/story.js → gift.codes 已更新")
    if ver:
        print("  · game/index.html 缓存版本 ?v=%s → ?v=%s" % ver)
    print("\n下一步：")
    print("  GITHUB_TOKEN=xxx node scripts/gh_push.js")
    print("  （只在本机看效果的话，跑 python scripts/test_gift.py 就行）")


if __name__ == "__main__":
    main()
