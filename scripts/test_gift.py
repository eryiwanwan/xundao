# -*- coding: utf-8 -*-
"""test_gift.py —— 福利码验收：错码不给、对码全开、刷新后仍在、剧情存档不动
用法：python scripts/test_gift.py
"""
import os, sys, threading, http.server, socketserver, functools
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GAME = os.path.join(ROOT, "game")
OUT = os.path.join(ROOT, "scripts", "shots")
os.makedirs(OUT, exist_ok=True)
PORT = 8795

Handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=GAME)
socketserver.TCPServer.allow_reuse_address = True

# 传 URL 就测线上那份，不传就起本地服务
if len(sys.argv) > 1:
    URL = sys.argv[1]
    httpd = None
else:
    httpd = socketserver.TCPServer(("127.0.0.1", PORT), Handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    URL = f"http://127.0.0.1:{PORT}/index.html"

STATE = """() => {
  const col = JSON.parse(localStorage.getItem('xundao_collect_v1') || '{}');
  const f = galleryFound(), g = galleryCount();
  return {
    ends:      Object.keys(col.ends || {}).length,
    endings:   Object.keys(col.endings || {}).length,
    titles:    Object.keys(col.titles || {}).length,
    gallery:   f.bg + f.char + f.lore + f.ending,
    galleryAll: g.total,
    extras:    Object.keys(STORY.extras || {}).filter(k => extraUnlocked(k)).length,
    extrasAll: Object.keys(STORY.extras || {}).length,
    gift:      col.gift || 0,
    save:      !!localStorage.getItem('xundao_demo_v2')
  };
}"""

fails = []
errors = []
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1440, "height": 900})
    pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errors.append("pageerror: " + str(e)))
    pg.goto(URL, wait_until="load")
    pg.wait_for_timeout(1000)
    pg.evaluate("ackAge()")
    pg.evaluate("localStorage.removeItem('xundao_collect_v1')")   # 从零开始
    pg.reload(wait_until="load")
    pg.wait_for_timeout(800)
    pg.evaluate("ackAge()")
    pg.wait_for_timeout(300)

    before = pg.evaluate(STATE)
    print(" 兑换前:", before)

    # 1) 打开弹窗
    pg.click('.cover-devlink a:has-text("福利码")')
    pg.wait_for_timeout(400)
    print(" 输入框出现:", pg.is_visible("#gift-input"))
    pg.screenshot(path=os.path.join(OUT, "gift_01_input.png"))

    # 2) 错码
    pg.fill("#gift-input", "XUNDAO2025")
    pg.click('#gift-mask button:has-text("兑换")')
    pg.wait_for_timeout(300)
    msg = pg.inner_text("#gift-err")
    after_bad = pg.evaluate(STATE)
    print(f" 错码提示: {msg!r}  仍解锁结局 {after_bad['ends']} 个")
    if "不对" not in msg:
        fails.append("错码没有给出提示")
    if after_bad["ends"] != 0:
        fails.append("错码居然解锁了内容")
    pg.screenshot(path=os.path.join(OUT, "gift_02_wrong.png"))

    # 3) 对码（故意打小写 + 连字符，验证归一化）
    pg.fill("#gift-input", " xundao-2026 ")
    pg.click('#gift-mask button:has-text("兑换")')
    pg.wait_for_timeout(600)
    after = pg.evaluate(STATE)
    print(" 兑换后:", after)
    if after["ends"] != after["endings"]:
        fails.append(f"ends({after['ends']}) 与 endings({after['endings']}) 不一致")
    if after["gallery"] != after["galleryAll"]:
        fails.append(f"图鉴未满 {after['gallery']}/{after['galleryAll']}")
    if after["titles"] != 27:
        fails.append(f"称号 {after['titles']}/27")
    if after["extras"] != after["extrasAll"]:
        fails.append(f"番外 {after['extras']}/{after['extrasAll']}")
    if after["save"]:
        fails.append("福利码不该写剧情存档，但 xundao_demo_v2 出现了")
    result_txt = pg.inner_text("#gift-mask")
    print(" 结果弹窗:", " / ".join(result_txt.split("\n")))
    pg.screenshot(path=os.path.join(OUT, "gift_03_done.png"))
    pg.click('#gift-mask button:has-text("好")')
    pg.wait_for_timeout(400)
    pg.screenshot(path=os.path.join(OUT, "gift_04_cover.png"))

    # 4) 番外页应该没有一张锁着
    pg.evaluate("showExtras()")
    pg.wait_for_timeout(500)
    locked = pg.eval_on_selector_all(".ex-card.locked", "els => els.length")
    print(" 番外未解锁卡片:", locked)
    if locked != 0:
        fails.append(f"番外仍有 {locked} 张未解锁")
    pg.screenshot(path=os.path.join(OUT, "gift_05_extras.png"), full_page=True)
    pg.evaluate("showGallery('ending')")
    pg.wait_for_timeout(400)
    pg.screenshot(path=os.path.join(OUT, "gift_06_gallery.png"), full_page=True)

    # 5) 刷新后仍在
    pg.reload(wait_until="load")
    pg.wait_for_timeout(800)
    pg.evaluate("ackAge()")
    after2 = pg.evaluate(STATE)
    print(" 刷新后:", after2)
    if after2 != after:
        fails.append("刷新后收集记录变了")

    # 6) 手机宽度下的弹窗
    pg.set_viewport_size({"width": 390, "height": 844})
    pg.evaluate("openGift()")
    pg.wait_for_timeout(400)
    pg.screenshot(path=os.path.join(OUT, "gift_07_mobile.png"))
    b.close()

if httpd: httpd.shutdown()
print("\n控制台报错:", len(errors))
for e in errors[:10]:
    print("  ✗", e)
print("失败项:", len(fails))
for f in fails:
    print("  ✗", f)
sys.exit(1 if (errors or fails) else 0)
