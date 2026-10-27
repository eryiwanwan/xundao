# -*- coding: utf-8 -*-
"""smoke_v9.py —— 0.9 版界面冒烟测试：走完一周目 + 截关键页 + 收集控制台报错"""
import os, sys, threading, http.server, socketserver, functools
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GAME = os.path.join(ROOT, "game")
OUT = os.path.join(ROOT, "scripts", "shots")
os.makedirs(OUT, exist_ok=True)
PORT = 8791

Handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=GAME)
socketserver.TCPServer.allow_reuse_address = True
httpd = socketserver.TCPServer(("127.0.0.1", PORT), Handler)
threading.Thread(target=httpd.serve_forever, daemon=True).start()

URL = f"http://127.0.0.1:{PORT}/index.html"

PLAY = """
(best) => {
  let guard = 0;
  const step = () => {
    const st = __getState();
    if (!st) return 'no-state';
    if (st.screen === 'end') return st.ending ? st.ending.id : 'extra';
    if (st.screen === 'quiz') { answerQuiz(0); return step(); }
    const n = st.queue[st.idx];
    if (!n) return 'queue-end';
    if (n.t === 'choice') {
      let k = 0, bv = -1e9;
      n.opts.forEach((o, i) => { const v = o.favor || 0; if (v > bv) { bv = v; k = i; } });
      choose(k);
      return step();
    }
    advance();
    if (guard++ > 5000) return 'timeout';
    return step();
  };
  return step();
}
"""

errors = []
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1440, "height": 900})
    pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errors.append("pageerror: " + str(e)))
    pg.goto(URL, wait_until="load")
    pg.wait_for_timeout(1200)
    pg.evaluate("ackAge()")
    pg.wait_for_timeout(500)
    pg.screenshot(path=os.path.join(OUT, "v9_01_cover.png"))

    # 开始万宁线，答题到第一次选择
    pg.evaluate("showLineSelect()"); pg.wait_for_timeout(300)
    pg.screenshot(path=os.path.join(OUT, "v9_02_lineselect.png"))
    pg.evaluate("startQuiz('wan')")
    pg.wait_for_timeout(300)
    for _ in range(4):
        pg.evaluate("answerQuiz(0)")
        pg.wait_for_timeout(150)
    # 推进到第一个选择点
    pg.evaluate("""() => {
      let g=0;
      while (g++ < 400) {
        const st = __getState();
        const n = st.queue[st.idx];
        if (n && n.t === 'choice') break;
        advance();
      }
    }""")
    pg.wait_for_timeout(400)
    pg.screenshot(path=os.path.join(OUT, "v9_03_choice_hud.png"))

    # 跳过已读按钮态
    pg.evaluate("toggleSkip()"); pg.wait_for_timeout(300)
    pg.screenshot(path=os.path.join(OUT, "v9_04_skip_on.png"))
    pg.evaluate("toggleSkip()"); pg.wait_for_timeout(200)

    # 走完一周目（全选好感最高），看结局页复盘
    end = pg.evaluate(PLAY, True)
    print("第一周目结局:", end)
    pg.wait_for_timeout(700)
    pg.screenshot(path=os.path.join(OUT, "v9_05_ending.png"), full_page=True)

    # 图鉴结局栏 / 番外 / 称号
    pg.evaluate("showGallery('ending')"); pg.wait_for_timeout(400)
    pg.screenshot(path=os.path.join(OUT, "v9_06_gallery_ending.png"), full_page=True)
    pg.evaluate("showExtras()"); pg.wait_for_timeout(400)
    pg.screenshot(path=os.path.join(OUT, "v9_07_extras.png"), full_page=True)
    pg.evaluate("showTitles()"); pg.wait_for_timeout(400)
    pg.screenshot(path=os.path.join(OUT, "v9_08_titles.png"), full_page=True)

    # 手机尺寸：结局页
    pg.set_viewport_size({"width": 390, "height": 844})
    pg.wait_for_timeout(300)
    pg.evaluate("showGallery('ending')"); pg.wait_for_timeout(400)
    pg.screenshot(path=os.path.join(OUT, "v9_09_mobile_gallery.png"), full_page=True)

    # 存档 / 收集记录自检
    info = pg.evaluate("""() => ({
      save: !!localStorage.getItem('xundao_demo_v2'),
      col: JSON.parse(localStorage.getItem('xundao_collect_v1') || 'null'),
      read: Object.keys(JSON.parse(localStorage.getItem('xundao_read_v1') || '{}')).length
    })""")
    print("存档:", info["save"], "| 已读指纹:", info["read"])
    print("结局记录:", sorted((info["col"] or {}).get("ends", {}).keys()))
    b.close()

httpd.shutdown()
print("\n控制台报错:", len(errors))
for e in errors[:10]:
    print(" ✗", e)
sys.exit(1 if errors else 0)
