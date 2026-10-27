# -*- coding: utf-8 -*-
"""shot_duel.py —— 只截「终章 · 郑维成对峙」那一段，确认选项和分支在浏览器里正常
用法：python scripts/shot_duel.py
"""
import os, threading, http.server, socketserver, functools
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GAME = os.path.join(ROOT, "game")
OUT = os.path.join(ROOT, "scripts", "shots")
os.makedirs(OUT, exist_ok=True)
PORT = 8796

Handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=GAME)
socketserver.TCPServer.allow_reuse_address = True
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
      if (ci === stopAt) return 'at-' + stopAt;
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

    for line, plan, tag in [
        ("wan",   [0, 0, 0, 0, 0, 0, 0, 0, 0], "wan"),
        ("jiang", [0, 0, 0, 0, 0, 0, 0, 0, 0], "jiang"),
    ]:
        pg.evaluate("showTitle()")
        pg.evaluate(f"startQuiz('{line}')")
        r = pg.evaluate(STOP_AT, [plan, 8])
        pg.wait_for_timeout(900)
        print(f" {line}: {r}")
        pg.screenshot(path=os.path.join(OUT, f"duel_{tag}_a_choice.png"), full_page=True)

        # 选第一个选项，往前推几屏，截分支正文
        pg.evaluate("choose(0)")
        for _ in range(6):
            pg.wait_for_timeout(120)
            pg.evaluate("advance()")
        pg.wait_for_timeout(700)
        pg.screenshot(path=os.path.join(OUT, f"duel_{tag}_b_branch.png"), full_page=True)

    print(" 控制台报错:", len(errors))
    for e in errors[:5]:
        print("  ✗", e)
    b.close()

httpd.shutdown()
