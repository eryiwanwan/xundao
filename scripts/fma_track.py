#!/usr/bin/env python3
"""FMA 曲目信息 / 下载：
  python scripts/fma_track.py info  <track_url> [track_url...]
  python scripts/fma_track.py album <album_url>          # 列出专辑内所有曲目
  python scripts/fma_track.py get   <track_url> <outname>  # 下载全曲（走 /stream/ 直链）
"""
import sys, re, json, html, os, urllib.request, urllib.parse

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8"}
DL = os.path.join(os.path.dirname(__file__), "_fma_dl")


def get(url, binary=False, timeout=180):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        data = r.read()
    return data if binary else data.decode("utf-8", "replace")


def plain(s):
    t = re.sub(r"<script.*?</script>", "", s, flags=re.S)
    t = re.sub(r"<style.*?</style>", "", t, flags=re.S)
    t = re.sub(r"<[^>]+>", "\n", t)
    t = html.unescape(t)
    return [l.strip() for l in t.split("\n") if l.strip()]


LIC_RE = re.compile(r"is licensed under a\s*(?:\|\s*)?(CC0 [0-9.]+[^.|]*|Attribution[^.|]*|Creative Commons[^.|]*?)\s*(?:\||)")


def track_info(url):
    s = get(url)
    lines = plain(s)
    txt = " | ".join(lines)
    m = LIC_RE.search(txt)
    lic = m.group(1).strip() if m else "?"
    inst = ""
    for i, l in enumerate(lines):
        if l == "Instrumental" and i + 1 < len(lines):
            inst = lines[i + 1]
    dur = ""
    for l in lines:
        if re.fullmatch(r"\d{1,2}:\d{2}", l):
            dur = l
            break
    album = ""
    for i, l in enumerate(lines):
        if l == "Album" and i + 1 < len(lines):
            album = lines[i + 1]
            break
    # 曲目页里的 data-track-info 含 stream 直链所需的 handle
    mh = re.search(r'"handle":"([^"]+)"', s)
    st = re.search(r'"playbackUrl":"(https:[^"]+)"', s)
    return {"url": url, "license": lic, "instrumental": inst, "duration": dur,
            "album": album, "handle": mh.group(1) if mh else "",
            "stream": (st.group(1).replace("\\/", "/") if st else "")}


def album_tracks(url):
    s = get(url)
    out, seen = [], set()
    for m in re.finditer(r'data-track-info=\'(\{.*?\})\'', s, re.S):
        d = json.loads(html.unescape(m.group(1)))
        if d["url"] in seen:
            continue
        seen.add(d["url"])
        out.append(d)
    return out


if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "album":
        rows = album_tracks(sys.argv[2])
        print(f"{len(rows)} 首")
        for d in rows:
            print(" ", d["title"][:52])
    elif cmd == "info":
        for u in sys.argv[2:]:
            i = track_info(u)
            print(f"{i['duration']:>6s} | inst={i['instrumental'] or '?':3s} | {i['license'][:44]:44s} | {u.split('/music/')[-1]}")
    elif cmd == "get":
        url, name = sys.argv[2], sys.argv[3]
        i = track_info(url)
        os.makedirs(DL, exist_ok=True)
        p = os.path.join(DL, name + ".mp3")
        data = get(i["stream"], binary=True)
        open(p, "wb").write(data)
        print(f"{name}: {len(data)/1024/1024:.1f}MB -> {p}")
