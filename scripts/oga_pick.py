#!/usr/bin/env python3
"""在 opengameart.org 上按关键词筛选素材，输出 授权/作者/文件 清单。
用法： python scripts/oga_pick.py music "snow night piano"
      python scripts/oga_pick.py sfx  "door close"
"""
import re, sys, html, json, urllib.parse, urllib.request, os

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"}
AUDIO_EXT = (".mp3", ".ogg", ".wav", ".flac", ".m4a")


def get(url, timeout=30):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", "replace")


def field(s, name):
    m = re.search(r'field-name-' + name + r'.*?</div>\s*</div>', s, re.S)
    if not m:
        return ""
    t = re.sub(r"<[^>]+>", " ", m.group(0))
    return " ".join(html.unescape(t).split()).split(":", 1)[-1].strip()


def search(keys, kind="music"):
    tid = 12 if kind == "music" else 13
    q = urllib.parse.urlencode({"keys": keys, "field_art_type_tid[]": tid,
                                "field_art_licenses_tid[]": 4})   # 4 = CC0
    s = get("https://opengameart.org/art-search-advanced?" + q)
    out, seen = [], set()
    for u, _ in re.findall(r'<a href="(/content/[^"]+)"[^>]*>(.*?)</a>', s, re.S):
        if u in seen or u in ("/content/faq",):
            continue
        if u.count("/") != 2:
            continue
        seen.add(u)
        out.append("https://opengameart.org" + u)
    return out


def detail(url):
    s = get(url)
    title = re.search(r"<title>(.*?)</title>", s, re.S)
    title = html.unescape(title.group(1)).split("|")[0].strip() if title else ""
    files = [f for f in re.findall(r'href="(https://opengameart.org/sites/default/files/[^"]+)"', s)
             if f.lower().split("?")[0].endswith(AUDIO_EXT)]
    return {
        "url": url, "title": title,
        "author": field(s, "author-submitter") or field(s, "author"),
        "license": field(s, "field-art-licenses"),
        "attribution": field(s, "field-art-attribution")[:200],
        "files": files,
    }


if __name__ == "__main__":
    kind = sys.argv[1] if len(sys.argv) > 1 else "music"
    keys = sys.argv[2] if len(sys.argv) > 2 else "piano"
    limit = int(sys.argv[3]) if len(sys.argv) > 3 else 6
    results = []
    for u in search(keys, kind)[:limit]:
        try:
            d = detail(u)
        except Exception as e:
            print("ERR", u, e); continue
        if not d["files"]:
            continue
        results.append(d)
        print("-" * 70)
        print("TITLE :", d["title"])
        print("AUTHOR:", d["author"], "| LICENSE:", d["license"])
        if d["attribution"]:
            print("ATTR  :", d["attribution"])
        print("PAGE  :", d["url"])
        for f in d["files"][:4]:
            print("FILE  :", f)
    json.dump(results, open(os.path.join(os.path.dirname(__file__), "_oga_last.json"), "w"),
              ensure_ascii=False, indent=1)
