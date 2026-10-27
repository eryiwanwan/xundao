# -*- coding: utf-8 -*-
"""smoke_v14.py —— 番外冒烟：四篇番外（含 v0.15 换了归属的《烟花》《居家情事》）能不能正常读完
用法：python scripts/smoke_v14.py [URL]
检查项：① 正文中段/结尾截图 ② 控制台报错 ③ 读到多少句、多少字
注：《哥哥的柜子》v0.15 起是隐藏结局 hidden:gege，不再是番外，已由 smoke_v10.py 覆盖。
"""
import os, sys, threading, http.server, socketserver, functools, re
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GAME = os.path.join(ROOT, "game")
OUT = os.path.join(ROOT, "scripts", "shots")
os.makedirs(OUT, exist_ok=True)
PORT = 8798

Handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=GAME)
socketserver.TCPServer.allow_reuse_address = True

httpd = None
if len(sys.argv) > 1:
    URL = sys.argv[1]
else:
    httpd = socketserver.TCPServer(("127.0.0.1", PORT), Handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    URL = f"http://127.0.0.1:{PORT}/index.html"

READ_ALL = """
(key) => {
  startExtra(key);
  const seen = [];
  let last = null, idle = 0;
  for (let g = 0; g < 900; g++) {
    const el = document.getElementById('txt');
    const t = el ? el.textContent.trim() : '';
    if (t && t !== last) { seen.push(t); last = t; idle = 0; }
    else idle++;
    advance();
    if (idle > 40) break;
  }
  const stage = document.getElementById('stage');
  return { seen, tail: stage ? stage.innerText.replace(/\\s+/g,' ').slice(-90) : '' };
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
    pg.wait_for_timeout(300)

    print("页面版本：", pg.evaluate("STORY.meta.version"))

    pg.evaluate("showExtras(); openGift();")
    pg.wait_for_timeout(400)
    pg.fill("#gift-input", "雾川2026")
    pg.click("#gift-mask .btn.primary")
    pg.wait_for_timeout(700)
    # 关掉「全部收录」结果弹窗
    for sel in ("#gift-mask .btn.primary", "#gift-mask .btn"):
        try:
            if pg.locator(sel).count():
                pg.locator(sel).last.click()
                pg.wait_for_timeout(400)
                break
        except Exception:
            pass
    pg.evaluate("closeGift()")
    pg.wait_for_timeout(300)
    print("图鉴/番外/称号：", pg.evaluate("Object.keys(JSON.parse(localStorage.getItem('xundao_collect_v1')||'{}')).length") if False else "")

    for key, name in (("laowan", "老万的十年"), ("platform", "同一个站台"),
                      ("yanhua", "烟花"), ("jujia", "居家情事")):
        pg.evaluate("showExtras()")
        pg.wait_for_timeout(300)
        pg.screenshot(path=os.path.join(OUT, f"v14_{key}_door.png"))

        res = pg.evaluate(READ_ALL, key)
        pg.wait_for_timeout(300)
        pg.screenshot(path=os.path.join(OUT, f"v14_{key}_end.png"))

        txt = "".join(res["seen"])
        cn = len(re.sub(r"\s", "", txt))
        print(f"  {name}: {len(res['seen'])} 句 / {cn} 字 / 结尾「{res['tail'][-36:]}」")

        # 停在 1/3 处截一张正文图
        pg.evaluate("showExtras()")
        pg.wait_for_timeout(250)
        pg.evaluate("(k)=>startExtra(k)", key)
        for _ in range(70):
            pg.evaluate("advance()")
        pg.wait_for_timeout(500)
        pg.screenshot(path=os.path.join(OUT, f"v14_{key}_mid.png"))

    print("控制台报错：", errors if errors else "无")
    b.close()

print("截图在 scripts/shots/v14_*.png")
