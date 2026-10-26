# -*- coding: utf-8 -*-
"""
gen_bgm.py —— 《驯刀》配乐/音效重制（温暖向）

旧的版本用了低频嗡鸣 + 不和谐音，听感"诡异、心里发毛"。
这一版全部改成：钢琴 + 弦乐铺底、大调/自然小调走向、柔起音、无低频 drone、无不和谐音程。
风格参照"橙光音乐"那类：钢琴主旋律 + 弦乐垫底 + 轻混响。

输出：game/assets/bgm/*.mp3  game/assets/sfx/*.mp3
"""
import os, numpy as np
from scipy.signal import butter, lfilter, fftconvolve
import lameenc

SR = 44100
rng = np.random.default_rng(20261026)
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "game", "assets")

# ---------------- 基础工具 ----------------
BASE = {'C':0,'C#':1,'D':2,'D#':3,'E':4,'F':5,'F#':6,'G':7,'G#':8,'A':9,'A#':10,'B':11}

def freq(n):
    """'F4' -> 349.23Hz"""
    name, octv = n[:-1], int(n[-1])
    midi = 12 * (octv + 1) + BASE[name]
    return 440.0 * 2 ** ((midi - 69) / 12.0)

def env_atk(x, sec=0.006):
    k = max(1, int(SR * sec))
    x[:k] *= np.linspace(0, 1, k)
    return x

# 「嗡」防护：本项目所有声音都不允许在 105Hz 以下残留能量
HUM_CUT = 105.0

def hp(x, fc=HUM_CUT, order=4):
    """高通：切断胸腔压迫感的低频嗡鸣"""
    b, a = butter(order, fc / (SR / 2), 'high')
    return lfilter(b, a, x)

def raise_note(n, minf):
    """把过低的和弦音抬八度，直到基频 >= minf（保证不落在嗡鸣区）"""
    while freq(n) < minf and int(n[-1]) < 6:
        n = n[:-1] + str(int(n[-1]) + 1)
    return n

def piano(n, dur, amp=0.5, bright=1.0):
    """加法合成钢琴（带击弦噪声 + 轻微非谐性）。

    要点：纯正弦叠加听起来像风琴/簧片，那种"一条音贴着不走"的音色本身就是
    "嗡"的来源。所以这里给每个音装上：极快起音、6ms 击弦噪声（明确的起点）、
    高次谐波更快消失、以及真实钢弦的轻微非谐性。
    """
    f0 = freq(n)
    n_end = int(SR * (dur + 0.85))
    t = np.arange(n_end) / SR
    sig = np.zeros(n_end)
    B = 0.0004                              # 非谐性系数
    base_d = 1.45 + 21.0 / (f0 ** 0.5)      # 低音衰减慢、高音衰减快
    for h in range(1, 14):
        fh = f0 * h * np.sqrt(1 + B * h * h)
        if fh > 9500:
            break
        a = (1.0 / h ** 1.75) * (bright ** ((h - 1) * 0.18))
        d = base_d * (1 + 0.55 * (h - 1))   # 高次谐波掉得更快
        sig += a * np.exp(-t * d) * np.sin(2 * np.pi * fh * t + rng.uniform(0, 6.28))

    # 击弦噪声：每个音都有清晰的"起手"，不会慢慢浮起来
    k = int(SR * 0.007)
    nz = rng.normal(0, 1, k)
    b, a = butter(2, [800 / (SR / 2), 7000 / (SR / 2)], 'band')
    hammer = lfilter(b, a, nz) * np.exp(-np.arange(k) / SR * 550) * 0.30 * bright
    sig[:k] += hammer

    env_atk(sig, 0.0025)                    # 2.5ms 起音（原来 8ms，听感偏"软"）
    return sig * amp


def strings(n, dur, amp=0.28, att=0.55, rel=0.55, fc=220.0):
    """弦乐 pad：慢起音 + 缓慢衰减（绝不长时间钉在同一电平，否则就是"嗡"）
    fc 为高通频率：越高的场合（如悬疑段落）可用 300Hz+，让它只作为空气层"""
    f0 = freq(n)
    n_end = int(SR * (dur + rel))
    t = np.arange(n_end) / SR
    vib = 1.0 + 0.0022 * np.sin(2 * np.pi * 4.7 * t + rng.uniform(0, 6.28))
    sig = np.zeros(n_end)
    for h in range(1, 7):
        a = 1.0 / h ** 1.9
        sig += a * np.sin(2 * np.pi * f0 * h * t * vib + rng.uniform(0, 6.28))
    a_env = np.clip(t / att, 0, 1) ** 1.4
    a_env *= np.exp(-t * 1.20 / max(dur, 0.8))     # 持续音要衰减，和声才会"呼吸"
    r_env = np.clip((n_end / SR - t) / rel, 0, 1) ** 1.2
    sig = sig * a_env * r_env * amp
    return hp(sig, fc, 3)

def cello_line(n, dur, amp=0.30):
    """低音弦：基频强制抬到 C3(131Hz) 附近以上，绝不落在嗡鸣区"""
    n = raise_note(n, 128.0)
    return strings(n, dur, amp=amp, att=0.35, rel=0.8)

def place(mix, sig, at):
    i = int(SR * at)
    j = min(len(mix), i + len(sig))
    if i < len(mix):
        mix[i:j] += sig[:j - i]

def reverb(x, wet=0.24, decay=1.15):
    n = int(SR * 1.9)
    ir = rng.normal(0, 1, n) * np.exp(-np.arange(n) / SR / decay)
    b, a = butter(2, 3800 / (SR / 2), 'low')     # 砍掉高频"沙沙"
    ir = lfilter(b, a, ir)
    ir /= np.sqrt(np.sum(ir ** 2)) * 3.2
    w = fftconvolve(x, ir)[:len(x)]
    return x * (1 - wet * 0.45) + w * wet

def _loud(x):
    """感知响度：50ms 帧 RMS 的 90 分位（比整体 RMS 更接近"听着多大声"）"""
    n = int(SR * 0.05); m = len(x) // n * n
    e = np.sqrt((x[:m].reshape(-1, n) ** 2).mean(1))
    return float(np.percentile(e, 90))

def master(x, peak=0.72, target_loud=None):
    """target_loud：把各曲拉到同一感知响度（钢琴曲稀疏、电子铺底密，光看 RMS 会差很多）。
    不设时按峰值归一（音效走这条路）。"""
    x = hp(x, HUM_CUT, 4)            # 全局兜底：105Hz 以下一律清掉
    x = x - x.mean()                  # 去直流，避免整块信号抬高产生"嗡"
    x = np.tanh(x * 0.95)
    if target_loud:
        L = _loud(x) or 1.0
        x = x * (target_loud / L)
        m = np.abs(x).max()
        if m > 0.92:                  # 只做减法，不再二次削波
            x = x * (0.92 / m)
    else:
        m = np.max(np.abs(x)) or 1.0
        x = x / m * peak
    # 头尾各 15ms 淡入淡出，循环点不炸音
    k = int(SR * 0.015)
    x[:k] *= np.linspace(0, 1, k)
    x[-k:] *= np.linspace(1, 0, k)
    return x

def write_mp3(path, x, bitrate=160):   # 提高码率，减少编码器的低频/瞬态杂音
    pcm = (np.clip(x, -1, 1) * 32767).astype('<i2').tobytes()
    enc = lameenc.Encoder()
    enc.set_bit_rate(bitrate)
    enc.set_in_sample_rate(SR)
    enc.set_channels(1)
    enc.set_quality(2)
    data = enc.encode(pcm) + enc.flush()
    with open(path, 'wb') as f:
        f.write(data)
    print("  -> %s  %.0f KB  %.1fs" % (os.path.basename(path), len(data) / 1024, len(x) / SR))


# ---------------- 编曲工具 ----------------
class Song:
    def __init__(self, bpm, bars, beats_per_bar=4):
        self.spb = 60.0 / bpm
        self.beats = bars * beats_per_bar
        self.mix = np.zeros(int(SR * (self.beats * self.spb + 2.4)))

    def at(self, beat):
        return beat * self.spb

    def p(self, n, beat, dur_beats, amp=0.5, bright=1.0):
        # 钢琴低音也抬到 A#2(116Hz) 以上，避免长音变成低鸣
        place(self.mix, piano(raise_note(n, 110.0), dur_beats * self.spb, amp, bright), self.at(beat))

    def s(self, n, beat, dur_beats, amp=0.26, fc=220.0):
        # 弦乐垫底是"嗡"的最大来源：抬到 C3(131Hz) 以上，并高通滤掉低中频
        place(self.mix, strings(raise_note(n, 128.0), dur_beats * self.spb, amp, fc=fc), self.at(beat))

    def c(self, n, beat, dur_beats, amp=0.26):
        place(self.mix, cello_line(n, dur_beats * self.spb, amp), self.at(beat))

    def arp(self, notes, beat, step, amp=0.20, dur=1.6, pattern=None):
        """分解和弦；pattern 为音序索引"""
        seq = pattern or list(range(len(notes))) + list(range(len(notes) - 1, 0, -1))
        for i, b in enumerate(np.arange(beat, beat + step * len(seq), step)):
            self.p(notes[seq[i % len(seq)]], b, dur, amp)

    def render(self, wet=0.24, target_loud=0.20):
        # 统一响度：各曲感知响度拉到同一水平，免得某首特别轻或特别闷
        return master(reverb(self.mix, wet=wet), target_loud=target_loud)


# ================================================================
# 1. 标题《雾川的雪》—— F 大调，70BPM，钢琴+弦乐，怀旧不阴森
# ================================================================
def track_title():
    """《雾川的雪》—— F 大调，68BPM。

    旧版用长音弦乐垫底铺满整小节，整首曲子是一条不间断的和声音墙，听感就是"嗡"。
    新版原则：**不放持续音**。全靠钢琴——左手四分音符分解（每个音自然衰减），
    右手旋律。第 5 小节后仅在最上面加一点点会衰减的高音弦乐。
    """
    S = Song(68, 9)
    # 每小节 4 个音，全部落在 F3(175Hz) 以上，避开低中频的"嗡"区
    bars = [
        ["F3", "C4", "A3", "F4"],     # F
        ["G3", "C4", "E4", "G4"],     # C/G
        ["F3", "A3", "D4", "F4"],     # Dm
        ["A#3", "D4", "F4", "A#4"],   # Bb
        ["A3", "C4", "F4", "A4"],     # F/A
        ["G3", "C4", "E4", "G4"],     # C
        ["A#3", "D4", "F4", "A#4"],   # Bb
        ["G3", "C4", "E4", "G4"],     # C
        ["F3", "A3", "C4", "F4"],     # F
    ]
    for i, ch in enumerate(bars):
        b = i * 4
        for k, n in enumerate(ch):
            # 1.05 拍：音与音之间留一点空隙，声音一直是"落"下去的，不是"铺"着的
            S.p(n, b + k, 0.70, amp=0.155 if k == 0 else 0.120, bright=0.95)
        # 隔一小节在高位点一颗泛音，像雪落在窗台上
        if i % 2 == 1:
            hi = ch[3][:-1] + str(int(ch[3][-1]) + 1)
            S.p(hi, b + 3.5, 0.75, amp=0.050)

    # 右手旋律（F 大调，级进为主）
    mel = [
        (4, "A4", 2), (6, "C5", 2),
        (8, "G4", 2), (10, "E4", 2),
        (12, "F4", 3), (15, "A4", 1),
        (16, "D4", 4),
        (20, "C5", 2), (22, "A4", 2),
        (24, "G4", 2), (26, "F4", 2),
        (28, "E4", 2), (30, "D4", 2),
        (32, "C4", 4),
    ]
    for b, n, d in mel:
        S.p(n, b, d * 0.94, amp=0.330, bright=1.02)
        S.p(n[:-1] + str(int(n[-1]) + 1), b, d * 0.88, amp=0.075)   # 高八度泛音

    # 后半段只在最上面加一层很轻的弦乐（A4 / C5，带衰减，且只 3 处）
    for b in (16, 20, 24):
        S.s("A4", b, 2.6, amp=0.075, fc=340)
        S.s("C5", b, 2.6, amp=0.055, fc=340)

    return S.render(wet=0.16)


# ================================================================
# 2. 问卷《入场登记》—— A 小调但用自然小调，稀疏、安静
# ================================================================
def track_quiz():
    S = Song(62, 8)
    chords = [["A2", "E3", "A3"], ["F2", "C3", "F3"], ["C3", "G3", "C4"], ["G2", "D3", "G3"]] * 2
    for i, ch in enumerate(chords):
        b = i * 4
        S.s(ch[1], b, 2.6, amp=0.17)
        S.s(ch[2], b, 2.6, amp=0.12)
        S.c(ch[0], b, 2.6, amp=0.16)
    # 单音点缀，像登记表上逐行打勾
    mel = [(1, "E5", 1.4), (3, "A4", 1.2), (5, "C5", 1.6), (7, "B4", 1.2),
           (9, "A4", 1.4), (11, "G4", 1.6), (13, "E4", 2.0), (15.5, "A4", 1.6),
           (17, "C5", 1.2), (19, "E5", 1.6), (21, "D5", 1.4), (23, "C5", 2.0),
           (25, "A4", 1.4), (27, "G4", 1.6), (29, "A4", 3.0)]
    for b, n, d in mel:
        S.p(n, b, d, amp=0.30, bright=0.95)
    # 左手极轻的分解
    for i in range(8):
        S.arp([chords[i][1], chords[i][2]], i * 4, 1.0, amp=0.09, dur=2.0, pattern=[0, 1])
    return S.render(wet=0.30)


# ================================================================
# 3. 楼道《三楼那盏灯》—— D 小调，66BPM，靠节奏推进，不靠不和谐音
# ================================================================
def track_stairs():
    """《三楼那盏灯》—— D 小调，64BPM。

    旧版每拍一记低音 + 全程弦乐垫底，连成一条持续的"嗡"。
    新版：稀疏的"脚步"动机（短促、立刻衰减）+ 明确的留白 + 一次高音"灯亮"，
    紧张感来自停顿和上行的音型，不再依赖任何持续低音。
    """
    S = Song(64, 8)
    # 每小节的脚步音（短促，0.45 拍就收）
    roots = ["A3", "A3", "F3", "A#3", "A3", "F3", "A#3", "A3"]
    for i, r in enumerate(roots):
        b = i * 4
        # 真正的"落地感"只在 1、5、7 小节出现一次，且 0.3 拍就收，不做低音铺底
        if i in (0, 4, 6):
            S.p("D3", b, 0.30, amp=0.115, bright=0.8)
        S.p(r, b, 0.40, amp=0.190, bright=0.9)                  # 踩下去
        if i not in (3, 6):                                     # 第 4、7 小节空出来
            S.p(r, b + 2.5, 0.40, amp=0.115, bright=0.85)        # 第二下，轻一点
        if i in (5, 7):
            hi = r[:-1] + str(int(r[-1]) + 1)
            S.p(hi, b + 3.5, 0.40, amp=0.075)

    # 上行小动机（"有人在往上走"），每句之间都留空
    S.p("D4", 4, 1.6, amp=0.240); S.p("E4", 7, 1.4, amp=0.235)
    S.p("F4", 10, 2.0, amp=0.245)
    S.p("A4", 13, 1.6, amp=0.250)
    S.p("G4", 17, 1.2, amp=0.215); S.p("F4", 19, 1.4, amp=0.215)
    S.p("E4", 22, 2.2, amp=0.230)
    S.p("D4", 25, 1.4, amp=0.205); S.p("A4", 27, 1.2, amp=0.240)
    S.p("A#4", 29, 2.2, amp=0.255)
    S.p("A4", 33, 3.0, amp=0.230)

    # 只有两次高音弦乐，且都很短（像楼道里的一层混响）
    S.s("A4", 8, 2.0, amp=0.065, fc=380)
    S.s("F5", 24, 1.8, amp=0.055, fc=380)
    # "灯亮"的一声
    S.p("F5", 16, 1.8, amp=0.105)

    return S.render(wet=0.19)


# ================================================================
# 4. 章末《余韵》—— C 大调，64BPM
# ================================================================
def track_aftermath():
    S = Song(64, 8)
    chords = [["C3", "E3", "G3"], ["B2", "D3", "G3"], ["A2", "C3", "E3"], ["F2", "A2", "C3"],
              ["C3", "E3", "G3"], ["F2", "A2", "C3"], ["G2", "B2", "D3"], ["C3", "E3", "G3"]]
    for i, ch in enumerate(chords):
        b = i * 4
        for n in ch:
            S.s(n, b, 2.6, amp=0.17)
        S.c(ch[0][:-1] + str(int(ch[0][-1]) - 1), b, 2.6, amp=0.19)
    for i, ch in enumerate(chords):
        S.arp([ch[0][:-1] + str(int(ch[0][-1]) + 1), ch[1], ch[2]],
              i * 4, 0.5, amp=0.13, dur=1.5)
    mel = [(2, "G4", 2), (4, "E4", 2), (6, "C4", 2),
           (8, "D4", 3), (11, "E4", 1),
           (12, "F4", 2), (14, "A4", 2),
           (16, "G4", 4),
           (20, "E4", 2), (22, "F4", 2),
           (24, "G4", 2), (26, "A4", 2),
           (28, "G4", 4)]
    for b, n, d in mel:
        S.p(n, b, d * 0.96, amp=0.34)
    return S.render(wet=0.30)


# ================================================================
# 5. 新曲《晴天》—— D 大调，76BPM，HE / 番外用，明亮温暖
# ================================================================
def track_dawn():
    S = Song(76, 8)
    chords = [["D3", "F#3", "A3"], ["C#3", "E3", "A3"], ["B2", "D3", "F#3"], ["G2", "B2", "D3"],
              ["D3", "F#3", "A3"], ["G2", "B2", "D3"], ["A2", "C#3", "E3"], ["D3", "F#3", "A3"]]
    for i, ch in enumerate(chords):
        b = i * 4
        for n in ch:
            S.s(n, b, 2.6, amp=0.15)
        S.c(ch[0][:-1] + str(int(ch[0][-1]) - 1), b, 2.6, amp=0.19)
    # 带一点跳跃感的八分分解
    for i, ch in enumerate(chords):
        hi = [ch[0][:-1] + str(int(ch[0][-1]) + 1), ch[1], ch[2], ch[1]]
        for j in range(8):
            S.p(hi[j % 4], i * 4 + j * 0.5, 1.2, amp=0.135, bright=1.15)
    mel = [(0, "D5", 2), (2, "A4", 2),
           (4, "B4", 2), (6, "C#5", 2),
           (8, "D5", 3), (11, "F#5", 1),
           (12, "E5", 4),
           (16, "D5", 2), (18, "B4", 2),
           (20, "A4", 2), (22, "B4", 2),
           (24, "C#5", 2), (26, "D5", 2),
           (28, "A4", 3)]
    for b, n, d in mel:
        S.p(n, b, d * 0.97, amp=0.38, bright=1.1)
    return S.render(wet=0.25)


# ---------------- 音效 ----------------
def sfx_paper():
    """翻纸：两下极轻的纸页摩擦，带通噪声"""
    n = int(SR * 0.9)
    x = np.zeros(n)
    for at, dur, amp in [(0.02, 0.13, 0.5), (0.24, 0.10, 0.35)]:
        m = int(SR * dur)
        t = np.arange(m) / SR
        noise = rng.normal(0, 1, m)
        b, a = butter(2, [900 / (SR / 2), 5200 / (SR / 2)], 'band')
        noise = lfilter(b, a, noise)
        env = np.exp(-t * 22) * np.clip(t / 0.008, 0, 1)
        x[int(SR * at):int(SR * at) + m] += noise * env * amp * 3.0
    return master(reverb(x, wet=0.16), peak=0.45)

def sfx_steps():
    """脚步：三下软底鞋踩水泥地。重心放在 150Hz 以上 + 鞋底摩擦噪声，不做低频轰"""
    n = int(SR * 1.2)
    x = np.zeros(n)
    for at in [0.00, 0.34, 0.68]:
        m = int(SR * 0.20)
        t = np.arange(m) / SR
        # 木/水泥的"实"感：150Hz + 227Hz，极短衰减
        thump = (np.sin(2 * np.pi * 152 * t) * 0.55 +
                 np.sin(2 * np.pi * 228 * t) * 0.22) * np.exp(-t * 34)
        noise = rng.normal(0, 1, m)
        b, a = butter(2, [420 / (SR / 2), 3200 / (SR / 2)], 'band')
        noise = lfilter(b, a, noise) * np.exp(-t * 46) * 0.9
        seg = (thump + noise) * np.clip(t / 0.004, 0, 1)
        x[int(SR * at):int(SR * at) + m] += seg
    return master(reverb(x, wet=0.16), peak=0.58)

def sfx_door():
    """老式防盗门：锁舌"咔" + 门贴合"嗒"。
    旧版用 78/121Hz 正弦做门体，听感是"咚——嗡"，这次整体抬到 200Hz 以上。"""
    n = int(SR * 1.0)
    x = np.zeros(n)

    # 1) 锁舌：高频"咔"
    t1 = np.arange(int(SR * 0.045)) / SR
    click = (np.sin(2 * np.pi * 1900 * t1) * 0.30 +
             np.sin(2 * np.pi * 2650 * t1) * 0.16) * np.exp(-t1 * 110)
    nz = rng.normal(0, 1, len(t1))
    b, a = butter(2, [1200 / (SR / 2), 6000 / (SR / 2)], 'band')
    click += lfilter(b, a, nz) * np.exp(-t1 * 150) * 0.35
    x[:len(click)] += click

    # 2) 门体：短促木质"嗒"（基频 210Hz + 二三次谐波），0.25s 内收干净
    m = int(SR * 0.28)
    t2 = np.arange(m) / SR
    body = (np.sin(2 * np.pi * 210 * t2) * 0.55 +
            np.sin(2 * np.pi * 315 * t2) * 0.22 +
            np.sin(2 * np.pi * 470 * t2) * 0.10) * np.exp(-t2 * 26)
    nz2 = rng.normal(0, 1, m)
    b2, a2 = butter(2, [500 / (SR / 2), 2800 / (SR / 2)], 'band')
    body += lfilter(b2, a2, nz2) * np.exp(-t2 * 34) * 0.55
    body *= np.clip(t2 / 0.003, 0, 1)
    x[int(SR * 0.06):int(SR * 0.06) + m] += body * 0.85

    return master(reverb(x, wet=0.14), peak=0.66)


if __name__ == "__main__":
    os.makedirs(os.path.join(ROOT, "bgm"), exist_ok=True)
    os.makedirs(os.path.join(ROOT, "sfx"), exist_ok=True)
    jobs = [
        ("bgm/title.mp3", track_title),
        ("bgm/quiz_cold.mp3", track_quiz),
        ("bgm/stairs_tense.mp3", track_stairs),
        ("bgm/aftermath.mp3", track_aftermath),
        ("bgm/dawn.mp3", track_dawn),
        ("sfx/paper.mp3", sfx_paper),
        ("sfx/steps.mp3", sfx_steps),
        ("sfx/door.mp3", sfx_door),
    ]
    for name, fn in jobs:
        print(name)
        write_mp3(os.path.join(ROOT, name), fn())
    print("done")
