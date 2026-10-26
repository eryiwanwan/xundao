#!/usr/bin/env python3
"""把 opengameart 下载的原曲处理成游戏用素材：
- 解码 → 去掉首尾静音 → 截取可用段落
- 无缝循环（首尾等功率交叉淡化）
- 感知响度归一
- lameenc 编码 MP3

用法： python scripts/process_audio.py
"""
import os, json
import numpy as np
import soundfile as sf
import lameenc

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DL = os.path.join(ROOT, "scripts/_oga_dl")
OUT_BGM = os.path.join(ROOT, "game/assets/bgm")
OUT_SFX = os.path.join(ROOT, "game/assets/sfx")

SR = 44100

# key: (源文件, 目标时长秒, 起始偏移秒, 类型)
JOBS = {
    "title":        ("title.mp3",         88, 22, "bgm"),
    "quiz_cold":    ("quiz_cold.mp3",     76, 12, "bgm"),
    "stairs_tense": ("chamber_piano.mp3", 62,  0, "bgm"),
    "aftermath":    ("aftermath.mp3",     46,  0, "bgm"),
    "dawn":         ("dawn.mp3",          82, 14, "bgm"),
    "door":         ("door.wav",           0,  0, "sfx"),
    "paper":        ("paper_sound_1.mp3",  0,  0, "sfx"),
    "steps":        ("steps.wav",          0,  0, "sfx"),
}


def load(p, off=0.0, dur=None):
    info = sf.info(p)
    start = int(off * info.samplerate)
    stop = info.frames if not dur else min(info.frames, start + int(dur * info.samplerate))
    x, sr = sf.read(p, start=start, stop=stop, always_2d=True, dtype="float32")
    if sr != SR:
        n = int(len(x) * SR / sr)
        idx = np.linspace(0, len(x) - 1, n)
        x = np.stack([np.interp(idx, np.arange(len(x)), x[:, c]) for c in range(x.shape[1])], axis=1)
    return x.astype("float32")


def trim(x, thr_db=-45, pad=0.15):
    """掐掉首尾静音。"""
    mono = np.abs(x).max(axis=1)
    thr = 10 ** (thr_db / 20)
    nz = np.where(mono > thr)[0]
    if not len(nz):
        return x
    a = max(0, nz[0] - int(pad * SR))
    b = min(len(x), nz[-1] + int(pad * SR))
    return x[a:b]


def loud_norm(x, target=0.11):
    """按 50ms 帧 RMS 的 90 分位归一（比峰值归一更贴近听感）。"""
    hop = int(SR * 0.05)
    n = len(x) // hop * hop
    fr = np.sqrt((x[:n].reshape(-1, hop, x.shape[1]) ** 2).mean(axis=(1, 2)))
    ref = np.percentile(fr, 90) + 1e-9
    x = x * (target / ref)
    peak = np.abs(x).max()
    if peak > 0.95:
        x *= 0.95 / peak
    return x


def loop_xfade(x, dur_sec, xf_sec=2.2):
    """取 dur 秒并做首尾等功率交叉淡化，得到可无缝循环的一段。"""
    need = int(dur_sec * SR)
    if len(x) < need + int(xf_sec * SR):
        k = int(np.ceil((need + xf_sec * SR) / len(x))) + 1
        x = np.tile(x, (k, 1))
    seg = x[:need].copy()
    xf = int(xf_sec * SR)
    t = np.linspace(0, np.pi / 2, xf)[:, None]
    head = seg[:xf] * np.sin(t)
    tail = seg[need - xf:need] * np.cos(t)
    out = np.concatenate([head + tail, seg[xf:need - xf]], axis=0)
    return out.astype("float32")


def edge_fade(x, fin=0.05, fout=0.15):
    n = len(x)
    a, b = int(fin * SR), int(fout * SR)
    if a: x[:a] *= np.linspace(0, 1, a)[:, None]
    if b: x[-b:] *= np.linspace(1, 0, b)[:, None]
    return x


def encode(x, path, kbps=128, mono=False):
    if mono and x.ndim == 2:
        x = x.mean(axis=1, keepdims=True)
    pcm = np.clip(x, -1, 1)
    pcm = (pcm * 32767).astype("<i2")
    enc = lameenc.Encoder()
    enc.set_bit_rate(kbps)
    enc.set_in_sample_rate(SR)
    enc.set_channels(1 if pcm.shape[1] == 1 else 2)
    enc.set_quality(2)
    data = enc.encode(pcm.tobytes()) + enc.flush()
    open(path, "wb").write(data)
    return data


if __name__ == "__main__":
    os.makedirs(OUT_BGM, exist_ok=True)
    os.makedirs(OUT_SFX, exist_ok=True)
    log = {}
    for key, (src, dur, off, kind) in JOBS.items():
        p = os.path.join(DL, src)
        if not os.path.exists(p) or os.path.getsize(p) == 0:
            print(f"!! 缺素材 {key} <- {src}")
            continue
        x = load(p, off)
        if kind == "bgm":
            x = trim(x)
            x = loop_xfade(x, dur)
            x = loud_norm(x, 0.105)
            dst = os.path.join(OUT_BGM, key + ".mp3")
            data = encode(x, dst, 128)
        else:
            x = trim(x, thr_db=-50, pad=0.04)
            if key == "steps":
                x = x[: int(2.9 * SR)]          # 只留一次走上台阶的几步
            if key == "door":
                x = x[: int(2.2 * SR)]
            x = loud_norm(x, 0.30)
            x = edge_fade(x, 0.004, 0.12)
            dst = os.path.join(OUT_SFX, key + ".mp3")
            data = encode(x, dst, 112, mono=True)
        log[key] = {"src": src, "sec": round(len(x) / SR, 2),
                    "kb": round(len(data) / 1024)}
        print(f"{key:14s} {len(x)/SR:6.2f}s  {len(data)/1024:7.1f}KB  {dst}")
    json.dump(log, open(os.path.join(ROOT, "scripts/_audio_log.json"), "w"),
              ensure_ascii=False, indent=1)
