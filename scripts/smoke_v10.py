# -*- coding: utf-8 -*-
"""smoke_v10.py —— v0.10 界面冒烟：跑两条新结局 + 图鉴/称号 + 控制台报错
用法：python scripts/smoke_v10.py
"""
import os, sys, threading, http.server, socketserver, functools
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GAME = os.path.join(ROOT, "game")
OUT = os.path.join(ROOT, "scripts", "shots")
os.makedirs(OUT, exist_ok=True)
PORT = 8794

Handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=GAME)
socketserver.TCPServer.allow_reuse_address = True
httpd = socketserver.TCPServer(("127.0.0.1", PORT), Handler)
threading.Thread(target=httpd.serve_forever, daemon=True).start()
URL = f"http://127.0.0.1:{PORT}/index.html"

# 按给定计划点选，返回结局 id
PLAY = """
([quizPlan, choicePlan]) => {
  let ci = 0, guard = 0;
  const step = () => {
    const st = __getState();
    if (!st) return 'no-state';
    if (st.screen === 'end') return st.ending ? st.ending.id : 'extra';
    if (st.screen === 'quiz') { answerQuiz(quizPlan[st.qi] || 0); return step(); }
    const n = st.queue[st.idx];
    if (!n) return 'queue-end';
    if (n.t === 'choice') {
      let k = choicePlan[ci++] ?? 0;
      if (k >= n.opts.length) k = n.opts.length - 1;
      choose(k);
      return step();
    }
    advance();
    if (guard++ > 6000) return 'timeout';
    return step();
  };
  return step();
}
"""

# 由 scripts/plan.js 求出（v0.15：每线 14 个选择点）
RUNS = [
    ("wan",   [0, 0, 0, 0], [0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0], "wan:halt",   "v10_01_wan_halt"),
    ("jiang", [0, 0, 0, 0], [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], "jiang:halt", "v10_02_jiang_halt"),
    ("wan",   [0, 0, 0, 0], [0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], "wan:he",     "v10_03_wan_he"),
    ("jiang", [0, 0, 0, 0], [2, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], "jiang:he",   "v10_04_jiang_he"),
    ("wan",   [0, 0, 0, 0], [0, 1, 1, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0], "hidden:gege", "v10_08_hidden_gege"),
]

errors = []
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1440, "height": 900})
    pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errors.append("pageerror: " + str(e)))
    pg.goto(URL, wait_until="load")
    pg.wait_for_timeout(1200)
    pg.evaluate("ackAge()")
    pg.wait_for_timeout(400)

    for line, quiz, choices, expect, shot in RUNS:
        pg.evaluate(f"showTitle()")
        pg.evaluate(f"startQuiz('{line}')")
        got = pg.evaluate(PLAY, [quiz, choices])
        pg.wait_for_timeout(500)
        ok = "✓" if got == expect else "✗"
        print(f" {ok} {line:5s} 期望 {expect:12s} 实际 {got}")
        if got != expect:
            errors.append(f"结局不符: {line} 期望 {expect} 实际 {got}")
        pg.screenshot(path=os.path.join(OUT, shot + ".png"), full_page=True)

    # 图鉴（55 格）/ 称号（28 个）
    pg.evaluate("showTitle()")
    pg.evaluate("showGallery('ending')")
    pg.wait_for_timeout(500)
    pg.screenshot(path=os.path.join(OUT, "v10_05_gallery_ending.png"), full_page=True)
    pg.evaluate("showTitles()")
    pg.wait_for_timeout(400)
    pg.screenshot(path=os.path.join(OUT, "v10_06_titles.png"), full_page=True)

    # 手机尺寸下的结局图鉴
    pg.set_viewport_size({"width": 390, "height": 844})
    pg.wait_for_timeout(300)
    pg.evaluate("showGallery('ending')")
    pg.wait_for_timeout(500)
    pg.screenshot(path=os.path.join(OUT, "v10_07_mobile_gallery.png"), full_page=True)

    info = pg.evaluate("""() => {
      const col = JSON.parse(localStorage.getItem('xundao_collect_v1') || 'null');
      return { ends: Object.keys((col||{}).ends||{}).sort(),
               titles: (typeof STORY!=='undefined' ? STORY.titles.length : 0),
               endings: (typeof STORY!=='undefined' ? Object.keys(STORY.endings).length : 0) };
    }""")
    print("\n 已记录结局:", info["ends"])
    print(" 结局表", info["endings"], "个 ｜ 称号", info["titles"], "个")
    b.close()

httpd.shutdown()
print("\n控制台报错:", len(errors))
for e in errors[:10]:
    print(" ✗", e)
sys.exit(1 if errors else 0)
