#!/usr/bin/env python3
"""FMA 搜索：把 freemusicarchive.org 搜索结果页里的 data-track-info 全部抓下来。
用法： python scripts/fma_search.py cantonese "hong kong" 粤语
"""
import sys, re, json, html, urllib.parse, urllib.request, time

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8"}


def get(url, timeout=40):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", "replace")


def search(q, page=1, size=40):
    url = ("https://freemusicarchive.org/search?quicksearch=" + urllib.parse.quote(q) +
           f"&pageSize={size}&page={page}&sort=_score&d=0")
    s = get(url)
    out = []
    for m in re.finditer(r"data-track-info='(\{.*?\})'", s, re.S):
        try:
            out.append(json.loads(html.unescape(m.group(1))))
        except Exception:
            pass
    return out


if __name__ == "__main__":
    terms = sys.argv[1:] or ["cantonese"]
    seen = {}
    for t in terms:
        try:
            rows = search(t)
        except Exception as e:
            print(f"[{t}] 搜索失败 {e}")
            continue
        print(f"\n### {t}  ({len(rows)} 条)")
        for r in rows:
            h = r["handle"]
            if h in seen:
                continue
            seen[h] = r
            print(f"  {r.get('title','')[:44]:44s} | {r.get('artistName','')[:22]:22s} | {r.get('albumTitle','')[:26]:26s} | {r.get('duration','')}")
        time.sleep(1)
    json.dump(list(seen.values()), open("scripts/_fma_hits.json", "w"), ensure_ascii=False, indent=1)
    print(f"\n合计 {len(seen)} 条 → scripts/_fma_hits.json")
