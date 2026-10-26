#!/usr/bin/env python3
"""下载选定的 opengameart CC0 素材到 _oga_dl/ 并打印时长/体积，便于筛选。"""
import os, sys, json, urllib.request, subprocess

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"}
OUT = os.path.join(os.path.dirname(__file__), "_oga_dl")

PICKS = {
    # 目标名: (URL, 素材页, 标题, 作者, 授权)
    "title": ("https://opengameart.org/sites/default/files/155%20November_snow-33_tape_leveled.mp3",
              "https://opengameart.org/content/november-snow", "November Snow", "cynicmusic", "CC0"),
    "quiz_cold": ("https://opengameart.org/sites/default/files/Night%20of%20the%20Streets_0.mp3",
                  "https://opengameart.org/content/night-of-the-streets-horrorsuspense",
                  "Night of the Streets [Horror/Suspense]", "nene", "CC0"),
    "stairs_tense": ("https://opengameart.org/sites/default/files/Komiku%20-%20It%27s%20time%20for%20adventure%20vol%202%20-%2012%20Tension_0.mp3",
                     "https://opengameart.org/content/tension", "Tension", "Loyalty Freak Music", "CC0"),
    "aftermath": ("https://opengameart.org/sites/default/files/piano_nostalgia_0.mp3",
                  "https://opengameart.org/content/regret-short-emotional-piano",
                  "Regret - Short Emotional Piano", "Wolfgang_", "CC0"),
    "dawn": ("https://opengameart.org/sites/default/files/at%20the%20end%20of%20hope_0.mp3",
             "https://opengameart.org/content/at-the-end-of-hope", "At the end of hope", "Emma_MA", "CC0"),
    "door": ("https://opengameart.org/sites/default/files/door_open.wav",
             "https://opengameart.org/content/door-open-sfx", "Door Open SFX", "Oiboo", "CC0"),
    "steps": ("https://opengameart.org/sites/default/files/steps%20in%20wood%20floor.wav",
              "https://opengameart.org/content/steps-in-wood-floor", "Steps in wood floor", "mikeask", "CC0"),
    "paper_sound_1": ("https://opengameart.org/sites/default/files/paper_sound_-_1.mp3",
                      "https://opengameart.org/content/various-paper-sound-effects",
                      "Various Paper Sound Effects / paper_sound_1", "Luckius", "CC0"),
}


def probe(p):
    try:
        r = subprocess.run(["ffprobe", "-v", "error", "-show_entries",
                            "format=duration:stream=sample_rate,channels",
                            "-of", "json", p], capture_output=True, text=True)
        d = json.loads(r.stdout)
        dur = float(d["format"]["duration"])
        st = d["streams"][0]
        return f"{dur:6.2f}s  {st.get('sample_rate')}Hz  ch={st.get('channels')}"
    except Exception as e:
        return "probe fail " + str(e)[:40]


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    meta = {}
    for name, (url, page, title, author, lic) in PICKS.items():
        ext = os.path.splitext(url.split("?")[0])[1]
        p = os.path.join(OUT, name + ext)
        if not os.path.exists(p):
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=120) as r, open(p, "wb") as f:
                f.write(r.read())
        size = os.path.getsize(p) / 1024
        meta[name] = {"file": p, "page": page, "title": title, "author": author,
                      "license": lic, "size_kb": round(size)}
        print(f"{name:14s} {size:8.0f}KB  {probe(p)}  | {title} / {author}")
    json.dump(meta, open(os.path.join(OUT, "_meta.json"), "w"), ensure_ascii=False, indent=1)
