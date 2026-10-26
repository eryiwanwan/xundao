#!/usr/bin/env python3
"""Free Music Archive 曲目 → 游戏 BGM：截取 / 无缝循环 / 响度归一 / 编码。
沿用 process_audio.py 里的处理函数，只换素材与参数。

用法： python scripts/process_bgm_fma.py
"""
import os, json, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import process_audio as P

ROOT = P.ROOT
DL = os.path.join(ROOT, "scripts/_fma_dl")
OUT = os.path.join(ROOT, "game/assets/bgm")

# key: (源文件, 目标循环长度, 起始偏移)
JOBS = {
    "title":        ("dobw.mp3",            96, 52),   # 封面：港式夜雾，慢
    "quiz_cold":    ("photos_murder.mp3",   64,  2),   # 问卷：凶案照片，冷
    "stairs_tense": ("hk_noir.mp3",         84, 24),   # 楼道：港味 noir，有脉
    "aftermath":    ("floating_lanterns.mp3", 76, 40), # 章末：灯漂在水上
    "dawn":         ("hopeful.mp3",         88, 14),   # 天亮：希望
}

if __name__ == "__main__":
    log = {}
    for key, (src, dur, off) in JOBS.items():
        p = os.path.join(DL, src)
        if not os.path.exists(p):
            print(f"!! 缺素材 {key} <- {src}")
            continue
        x = P.load(p, off)
        x = P.trim(x)
        x = P.loop_xfade(x, dur)
        x = P.loud_norm(x, 0.105)
        dst = os.path.join(OUT, key + ".mp3")
        data = P.encode(x, dst, 128)
        log[key] = {"src": src, "sec": round(len(x) / P.SR, 2), "kb": round(len(data) / 1024)}
        print(f"{key:14s} {len(x)/P.SR:6.2f}s  {len(data)/1024:7.1f}KB  <- {src}")
    old = {}
    lp = os.path.join(ROOT, "scripts/_audio_log.json")
    if os.path.exists(lp):
        old = json.load(open(lp))
    old.update(log)
    json.dump(old, open(lp, "w"), ensure_ascii=False, indent=1)
    print("总大小", round(sum(v["kb"] for v in log.values()) / 1024, 2), "MB")
