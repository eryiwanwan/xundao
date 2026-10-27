# -*- coding: utf-8 -*-
"""shot_new_be.py —— 截四条新 BE 的结局页 + 结局图鉴（18 格）"""
import os, threading, http.server, socketserver, functools
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

RUNS = [
    ("wan:burn",     "wan",   [0, 0, 0, 0], [2, 1, 0, 0, 0, 0]),
    ("wan:gone",     "wan",   [0, 0, 0, 0], [2, 2, 1, 0, 1, 0]),
    ("jiang:blade",  "jiang", [0, 0, 0, 0], [0, 0, 2, 0, 0, 0]),
    ("jiang:nobody", "jiang", [0, 0, 0, 0], [1, 0, 2, 1, 0, 0]),
]

errors = []
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1440, "height": 900})
    pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errors.append("pageerror: " + str(e)))
    pg.goto(URL, wait_until="load")
    pg.wait_for_timeout(1000)
    pg.evaluate("ackAge()")
    pg.wait_for_timeout(300)

    for i, (name, line, quiz, choices) in enumerate(RUNS, 1):
        pg.evaluate("showLineSelect()")
        pg.wait_for_timeout(150)
        pg.evaluate("startQuiz('%s')" % line)
        pg.wait_for_timeout(200)
        got = pg.evaluate(PLAY, [quiz, choices])
        pg.wait_for_timeout(900)
        # 结局页往上滚一点，让标题 + 数值复盘同时在画面里
        pg.evaluate("() => { const e = document.getElementById('stage'); if (e) e.scrollTop = 0; window.scrollTo(0, 0); }")
        pg.screenshot(path=os.path.join(OUT, "v10_%02d_%s.png" % (i, name.replace(":", "_"))))
        print(name, "->", got)

    # 结局图鉴（18 格）
    pg.evaluate("showTitle()")
    pg.wait_for_timeout(200)
    pg.evaluate("showGallery('ending')")
    pg.wait_for_timeout(500)
    pg.screenshot(path=os.path.join(OUT, "v10_05_gallery_ending.png"), full_page=True)

    # 称号页（25 个）
    pg.evaluate("showTitle()")
    pg.wait_for_timeout(200)
    pg.evaluate("showTitles()")
    pg.wait_for_timeout(400)
    pg.screenshot(path=os.path.join(OUT, "v10_06_titles.png"), full_page=True)

    # 手机端结局页
    m = b.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    m.on("console", lambda x: errors.append(x.text) if x.type == "error" else None)
    m.goto(URL, wait_until="load")
    m.wait_for_timeout(900)
    m.evaluate("ackAge()")
    m.evaluate("showLineSelect()")
    m.wait_for_timeout(150)
    m.evaluate("startQuiz('wan')")
    m.evaluate(PLAY, [[0, 0, 0, 0], [2, 1, 0, 0, 0, 0]])
    m.wait_for_timeout(900)
    m.screenshot(path=os.path.join(OUT, "v10_07_mobile_be.png"))

    b.close()

print("\n控制台报错:", len(errors))
for e in errors[:8]:
    print(" ", e)
