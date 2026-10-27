# -*- coding: utf-8 -*-
"""shots.py —— 用 headless chromium 截几张关键界面图，人工核对排版"""
import sys, os, time, json
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = "http://127.0.0.1:8777/index.html"
OUT = os.path.join(ROOT, "scripts", "shots")
os.makedirs(OUT, exist_ok=True)

def snap(page, name):
    page.screenshot(path=os.path.join(OUT, name + ".png"))
    print("shot", name)

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1440, "height": 900}, device_scale_factor=1)
    pg.goto(URL, wait_until="load")
    pg.wait_for_timeout(900)
    snap(pg, "00_age_notice")          # 首次进入的 18+ 提示
    pg.evaluate("ackAge()")
    pg.wait_for_timeout(600)
    snap(pg, "01_cover")

    # 鸣谢页
    pg.evaluate("showCredits()"); pg.wait_for_timeout(400); snap(pg, "01b_credits")
    pg.evaluate("document.querySelector('.panel-body').scrollTop = 700")
    pg.wait_for_timeout(300); snap(pg, "01c_credits_tracks")

    # 图鉴 / 称号 / 番外
    pg.evaluate("showGallery()"); pg.wait_for_timeout(300); snap(pg, "02_gallery_bg_locked")
    pg.evaluate("showExtras()"); pg.wait_for_timeout(300); snap(pg, "06_extras_locked")

    # 解锁后：伪造收集记录
    pg.evaluate("""() => {
      const c = JSON.parse(localStorage.getItem('xundao_collect_v1')||'{}');
      c.he = {wan:true, jiang:true}; c.endings = {he:true,normal:true,be:true};
      c.bg = {title_stairs:true,stairs_night:true,wan_bedroom:true,study_night:true};
      c.char = {'jiang:normal':true,'wan:normal':true,'jiang:hurt':true};
      c.lore = {wuchuan:true,laowan:true,zheng:true,yimi:true,daoshan:true};
      localStorage.setItem('xundao_collect_v1', JSON.stringify(c));
    }""")
    pg.evaluate("showTitle()"); pg.wait_for_timeout(600); snap(pg, "07_cover_progress")
    pg.evaluate("showExtras()"); pg.wait_for_timeout(300); snap(pg, "08_extras_unlocked")

    # 彩蛋门槛进度提示：万宁线 2/3、江野线 1/3 时的未解锁文案
    pg.evaluate("""() => {
      const c = JSON.parse(localStorage.getItem('xundao_collect_v1')||'{}');
      c.ends = {'wan:he':true, 'wan:normal':true, 'jiang:he':true};
      localStorage.setItem('xundao_collect_v1', JSON.stringify(c));
    }""")
    pg.evaluate("showExtras()"); pg.wait_for_timeout(300); snap(pg, "08b_extras_progress")
    pg.evaluate("showGallery('bg')"); pg.wait_for_timeout(400); snap(pg, "02b_gallery_bg")
    pg.evaluate("showGallery('char')"); pg.wait_for_timeout(400); snap(pg, "03_gallery_char")
    pg.evaluate("showGallery('lore')"); pg.wait_for_timeout(300); snap(pg, "04_gallery_lore")
    pg.evaluate("showGallery('ending')"); pg.wait_for_timeout(300); snap(pg, "09_gallery_ending")
    pg.evaluate("showTitles()"); pg.wait_for_timeout(300); snap(pg, "05_titles")

    # 正文界面：选视角 + 问卷 + 正文
    pg.evaluate("showLineSelect()"); pg.wait_for_timeout(400); snap(pg, "10_line_select")
    pg.evaluate("startQuiz('wan')"); pg.wait_for_timeout(300); snap(pg, "11_quiz")
    for _ in range(4):
        pg.evaluate("answerQuiz(0)"); pg.wait_for_timeout(150)
    pg.wait_for_timeout(600)
    snap(pg, "12_story_start")
    # 推进到楼道场景（第1章场景2大约在前十几句）
    for _ in range(9):
        pg.evaluate("advance()"); pg.wait_for_timeout(120)
    pg.wait_for_timeout(800); snap(pg, "13_story_stairs")
    # 推进到选项
    for _ in range(20):
        st = pg.evaluate("__getState()")
        if st and st["queue"][st["idx"]]["t"] == "choice":
            break
        pg.evaluate("advance()"); pg.wait_for_timeout(80)
    pg.wait_for_timeout(400); snap(pg, "14_choice")

    # 结局结算
    pg.evaluate("""() => {
      const s = __getState();
      s.queue = [{t:'text',cls:'letter',txt:'HE · 《驯刀》'},{t:'end'}];
      s.idx = 0; s.favor = 40;
    }""")
    pg.evaluate("renderNode()"); pg.wait_for_timeout(300)
    pg.evaluate("advance()"); pg.wait_for_timeout(400); snap(pg, "15_ending")

    # 单线三结局全部走完后的结算提示（彩蛋已开）
    pg.evaluate("""() => {
      const c = JSON.parse(localStorage.getItem('xundao_collect_v1')||'{}');
      c.ends = {'wan:he':true,'wan:normal':true,'wan:be':true};
      localStorage.setItem('xundao_collect_v1', JSON.stringify(c));
      loadCol();
      const s = __getState(); s.screen = 'story'; s.ending = {type:'he', line:'wan'}; s.done = true;
      showEnd();
    }""")
    pg.wait_for_timeout(400); snap(pg, "15b_ending_line_done")

    # 番外正文
    pg.evaluate("startExtra('laowan')"); pg.wait_for_timeout(400)
    for _ in range(8):
        pg.evaluate("advance()"); pg.wait_for_timeout(100)
    pg.wait_for_timeout(500); snap(pg, "16_extra_laowan")

    # 两篇彩蛋《烟花》《居家情事》：两条线各走完三个结局才解锁
    pg.evaluate("""() => {
      const c = JSON.parse(localStorage.getItem('xundao_collect_v1')||'{}');
      c.clears = 1;
      c.ends = {'wan:he':true,'wan:normal':true,'wan:be':true,
                'jiang:he':true,'jiang:normal':true,'jiang:be':true};
      localStorage.setItem('xundao_collect_v1', JSON.stringify(c));
    }""")
    pg.evaluate("showExtras()"); pg.wait_for_timeout(400); snap(pg, "18_extras_all")
    pg.evaluate("startExtra('yanhua')"); pg.wait_for_timeout(900)
    for _ in range(8):
        pg.evaluate("advance()"); pg.wait_for_timeout(110)
    pg.wait_for_timeout(700); snap(pg, "19_egg_yanhua")
    pg.evaluate("startExtra('jujia')"); pg.wait_for_timeout(400)
    for _ in range(10):
        pg.evaluate("advance()"); pg.wait_for_timeout(110)
    pg.wait_for_timeout(500); snap(pg, "19b_egg_jujia")

    # 未满 18 岁离开页
    lp = b.new_page(viewport={"width": 1280, "height": 800}, device_scale_factor=1)
    lp.goto(URL, wait_until="load"); lp.wait_for_timeout(800)
    lp.evaluate("leaveSite()"); lp.wait_for_timeout(300)
    lp.screenshot(path=os.path.join(OUT, "20_leave.png"))
    print("shot 20_leave")

    # 手机竖屏封面
    mp = b.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    mp.goto(URL, wait_until="load"); mp.wait_for_timeout(700)
    mp.evaluate("ackAge()"); mp.wait_for_timeout(600)
    mp.screenshot(path=os.path.join(OUT, "17_cover_mobile.png"))
    print("shot 17_cover_mobile")

    b.close()
print("done")
