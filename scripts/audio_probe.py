#!/usr/bin/env python3
"""对音频做客观体检：时长 / 响度 / 亮度 / 估计速度 / 是否近似静音。
用于在没有耳朵的情况下筛掉明显不合适的曲子。"""
import sys, os, glob
import numpy as np
import soundfile as sf


def load_mono(p, max_sec=180):
    info = sf.info(p)
    stop = min(info.frames, int(max_sec * info.samplerate))
    x, sr = sf.read(p, start=0, stop=stop, always_2d=True, dtype="float32")
    x = x.mean(axis=1)
    if sr != 44100:
        n = int(len(x) * 44100 / sr)
        x = np.interp(np.linspace(0, len(x)-1, n), np.arange(len(x)), x).astype("float32")
    return x, 44100


def fft_bands(x, sr, nfft=2048, hop=1024):
    win = np.hanning(nfft).astype("float32")
    frames = np.lib.stride_tricks.sliding_window_view(x, nfft)[::hop] * win
    mag = np.abs(np.fft.rfft(frames, axis=1)) + 1e-12
    freqs = np.fft.rfftfreq(nfft, 1/sr)
    # 每一帧的谱质心
    cen = (mag * freqs).sum(1) / mag.sum(1)
    return cen, freqs, mag


def tempo(x, sr):
    """自相关估速度（60-180bpm）。"""
    hop = 512
    env = np.abs(x[: len(x)//hop*hop]).reshape(-1, hop).max(1)
    env = env - env.mean()
    if env.std() < 1e-6:
        return 0
    ac = np.correlate(env, env, "full")[len(env)-1:]
    ac /= ac[0] + 1e-9
    lo, hi = int(sr/hop/180*1.0), int(sr/hop/60)
    lo, hi = max(2, lo), min(len(ac)-1, hi*2)
    if hi <= lo:
        return 0
    lag = lo + int(np.argmax(ac[lo:hi]))
    bpm = 60.0 * (sr/hop) / lag
    while bpm < 60: bpm *= 2
    while bpm > 180: bpm /= 2
    return bpm


def report(p):
    x, sr = load_mono(p)
    if len(x) < sr * 0.2:
        return f"{os.path.basename(p):22s} 太短 {len(x)/sr:.2f}s"
    dur = len(x)/sr
    rms = 20*np.log10(np.sqrt((x**2).mean()) + 1e-9)
    cen, freqs, mag = fft_bands(x, sr)
    cen_med = float(np.median(cen))
    # 低频占比 / 高频占比
    p_tot = mag.sum()
    lo = mag[:, freqs < 120].sum()/p_tot*100
    hi = mag[:, freqs > 4000].sum()/p_tot*100
    # 响度起伏：50ms 帧 RMS 的标准差（动态越大越像“有旋律起伏”）
    hop = int(sr*0.05)
    fr = np.array([np.sqrt((x[i:i+hop]**2).mean()) for i in range(0, len(x)-hop, hop)])
    dyn = 20*np.log10(fr.std() + 1e-9)
    bpm = tempo(x, sr)
    return (f"{os.path.basename(p):22s} {dur:6.1f}s  响度{rms:6.1f}dB  亮度{cen_med:6.0f}Hz  "
            f"低频{lo:4.1f}%  高频{hi:4.1f}%  动态{dyn:5.1f}  估计{bpm:5.1f}bpm")


if __name__ == "__main__":
    d = os.path.join(os.path.dirname(__file__), "_oga_dl")
    for p in sorted(glob.glob(os.path.join(d, "*"))):
        if p.endswith(".json"):
            continue
        try:
            print(report(p))
        except Exception as e:
            print(f"{os.path.basename(p):22s} FAIL {type(e).__name__} {e}")
