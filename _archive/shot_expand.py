# -*- coding: utf-8 -*-
"""shot_expand.py —— 截 A 档扩章新增的三处场景，确认背景和排版在浏览器里正常
用法：python scripts/shot_expand.py [URL]
"""
import os, sys, threading, http.server, socketserver, functools
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GAME = os.path.join(ROOT, "game")
OUT = os.path.join(ROOT, "scripts", "shots")
os.makedirs(OUT, exist_ok=True)
PORT = 8797

Handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=GAME)
socketserver.TCPServer.allow_reuse_address = True

if len(sys.argv) > 1:
    URL = sys.argv[1]
    httpd = None
else:
    httpd = socketserver.TCPServer(("127.0.0.1", PORT), Handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    URL = f"http://127.0.0.1:{PORT}/index.html"

STOP_AT = """
([choicePlan, stopAt]) => {
  let ci = 0, guard = 0;
  const step = () => {
    const st = __getState();
    if (!st) return 'no-state';
    if (st.screen === 'end') return 'end';
    if (st.screen === 'quiz') { answerQuiz(0); return step(); }
    const n = st.queue[st.idx];
    if (!n) return 'queue-end';
    if (n.t === 'choice') {
      if (ci === stopAt) return 'at-' + stopAt + ' :: ' + (n.q || '');
      let k = choicePlan[ci++] ?? 0;
      if (k >= n.opts.length) k = n.opts.length - 1;
      choose(k);
      return step();
    }
    advance();
    if (guard++ > 8000) return 'timeout';
    return step();
  };
  return step();
}
"""

errors = []
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1200, "height": 900})
    pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errors.append("pageerror: " + str(e)))
    pg.goto(URL, wait_until="load")
    pg.wait_for_timeout(1200)
    pg.evaluate("ackAge()")
    pg.wait_for_timeout(400)

    # ---- 江野第2章 · 修车行（选择点索引 3）----
    pg.evaluate("showTitle()")
    pg.evaluate("startQuiz('jiang')")
    r = pg.evaluate(STOP_AT, [[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 2])
    pg.wait_for_timeout(900)
    print(" 江野 修车行 →", r)
    pg.screenshot(path=os.path.join(OUT, "exp_01_garage_choice.png"), full_page=True)

    pg.evaluate("choose(0)")
    for _ in range(4):
        pg.wait_for_timeout(120)
        pg.evaluate("advance()")
    pg.wait_for_timeout(700)
    pg.screenshot(path=os.path.join(OUT, "exp_02_garage_branch.png"), full_page=True)

    # ---- 万宁第3章 · 包扎（选择点索引 4）----
    pg.evaluate("showTitle()")
    pg.evaluate("startQuiz('wan')")
    r = pg.evaluate(STOP_AT, [[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 4])
    pg.wait_for_timeout(900)
    print(" 万宁 包扎 →", r)
    pg.screenshot(path=os.path.join(OUT, "exp_03_bandage_choice.png"), full_page=True)

    pg.evaluate("choose(1)")
    for _ in range(5):
        pg.wait_for_timeout(120)
        pg.evaluate("advance()")
    pg.wait_for_timeout(700)
    pg.screenshot(path=os.path.join(OUT, "exp_04_bandage_branch.png"), full_page=True)

    print(" 控制台报错:", len(errors))
    for e in errors[:5]:
        print("  ✗", e)
    b.close()

if httpd: httpd.shutdown()
