# -*- coding: utf-8 -*-
"""smoke_live.py —— 线上验收：直接打 GitHub Pages，确认发上去的就是本地这一版
用法：python scripts/smoke_live.py [url]
默认 https://eryiwanwan.github.io/xundao/game/index.html
"""
import os, sys
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "scripts", "shots")
os.makedirs(OUT, exist_ok=True)
URL = sys.argv[1] if len(sys.argv) > 1 else "https://eryiwanwan.github.io/xundao/game/index.html"

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

# 由 scripts/plan.js 求出：一条 HE，方便顺便看结局页
RUN = ("wan", [0, 0, 0, 0], [2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], "wan:he")

errors, failed = [], []
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1440, "height": 900})
    pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errors.append("pageerror: " + str(e)))
    pg.on("requestfailed", lambda r: None if r.failure == "net::ERR_ABORTED" and "/assets/" in r.url else failed.append(f"{r.url} :: {r.failure}"))
    pg.on("response", lambda r: failed.append(f"{r.status} {r.url}") if r.status >= 400 else None)

    pg.goto(URL, wait_until="load", timeout=60000)
    pg.wait_for_timeout(1500)

    ver = pg.evaluate("() => (typeof STORY !== 'undefined' && STORY.meta ? STORY.meta.version : 'STORY 未加载')")
    print(" 线上版本:", ver)

    pg.evaluate("ackAge()")
    pg.wait_for_timeout(400)

    line, quiz, choices, expect = RUN
    pg.evaluate("showTitle()")
    pg.evaluate(f"startQuiz('{line}')")
    got = pg.evaluate(PLAY, [quiz, choices])
    pg.wait_for_timeout(600)
    ok = "✓" if got == expect else "✗"
    print(f" {ok} {line:5s} 期望 {expect:12s} 实际 {got}")
    if got != expect:
        errors.append(f"结局不符: 期望 {expect} 实际 {got}")
    pg.screenshot(path=os.path.join(OUT, "live_01_ending.png"), full_page=True)

    info = pg.evaluate("""() => ({
      endings: Object.keys(STORY.endings).length,
      titles: STORY.titles.length,
      choices: STORY.lines.wan.filter(n => n.t === 'choice').length
                  + STORY.lines.jiang.filter(n => n.t === 'choice').length
    })""")
    print(" 结局", info["endings"], "个 ｜ 称号", info["titles"], "个 ｜ 选择点", info["choices"], "个")
    b.close()

print("\n控制台报错:", len(errors))
for e in errors[:10]:
    print("  ✗", e)
print("请求失败/4xx-5xx:", len(failed))
for f in failed[:10]:
    print("  ✗", f)
sys.exit(1 if (errors or failed) else 0)
