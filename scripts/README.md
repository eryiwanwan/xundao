# scripts 索引

这里只放**还会用**的工具。历史改造脚本已移到项目根下的 `_archive/`。

> 所有脚本都靠自身位置定位项目根（`path.join(__dirname, "..")` / `dirname(dirname(__file__))`），
> 所以它们只能待在 `scripts/` 或项目根下的一级目录。**不要再往深一层挪**，挪下去全部路径会指向错的地方。
> 运行方式一律在项目根执行：`node scripts/xxx.js`、`python scripts/xxx.py`。

---

## 一、校验与体检

改完剧情、数值、结局判定之后跑这一组。

| 脚本 | 作用 | 命令 |
|---|---|---|
| `validate.js` | 无浏览器的端到端走读。等距抽样 20 万条路径/线，验证 21 个结局全部可达、图鉴 55/55、称号 28/28、番外 4 篇全开、跳过已读 0 句 | `node scripts/validate.js` |
| `audit.js` | 三块一致性审计：① 称号/结局/番外的条件在引擎里有没有实现 ② 立绘/背景/音频引用是否注册且文件存在 ③ 时间线顺序、人称串视角、重复长句 | `node scripts/audit.js` |
| `playtest.js` | 可玩性体检：单周目阅读量、决策密度、主干与分支占比、结局分布、结局间文本重合度。明细写 `scripts/_playtest.json` | `node scripts/playtest.js` |
| `policy.js` | 固定策略体检：一直点第 N 项 × 四种问卷，直接看落到哪个结局、什么数值；顺带打印「最优项落在第几格」的分布 | `node scripts/policy.js` |
| `outline.js` | 分章体检：每章字数、选择点数、主干与分支比例，看体量分布是否头重脚轻 | `node scripts/outline.js` |
| `tune.js` | 阈值搜索：枚举所有路径的（好感/执念/线索/flag），在内存里试判定阈值，调数值前先用它看候选 | `node scripts/tune.js` |
| `similarity.py` | 番外与正文的自我重复审查（两篇互相 + 与主线比对） | `python scripts/similarity.py` |
| `export_text.js` | 把 `story.js` 的全部文本导出成 `03_全文文本.md`（含每章句数/字数统计） | `node scripts/export_text.js` |

## 二、冒烟测试（真实浏览器）

三条从轻到重，发布前后各跑一遍。

| 脚本 | 覆盖 | 命令 |
|---|---|---|
| `smoke_v10.py` | 5 条结局路径（含隐藏结局 `hidden:gege`）走完 + 关键页截图 + 收集控制台报错 | `python scripts/smoke_v10.py` |
| `smoke_v14.py` | 四篇番外（老万 / 站台 / 烟花 / 居家）能否从头读到尾 | `python scripts/smoke_v14.py` |
| `smoke_live.py` | 线上验收：直接打 GitHub Pages，确认发上去的就是本地这一版 | `python scripts/smoke_live.py` |
| `test_gift.py` | 福利码验收：错码不给、对码全开、刷新后仍在、剧情存档不动 | `python scripts/test_gift.py` |

> 冒烟脚本里写死了点击序列（`RUNS`）。每次改章节导致**选择点数量变化**、或用 `story.js` 里的 `PLAN` 重排了选项顺序，都要重新求路径：
> `node scripts/plan.js wan:he`（也可以 `hidden:gege`），把输出的 `choices` 数组粘回去。

## 三、内容维护

| 脚本 | 作用 | 命令 |
|---|---|---|
| `set_gift.py` | 改福利码，顺手把 `index.html` 的 `?v=` 加一档 | `python scripts/set_gift.py 新码` / `--show` / `--off` |
| `patch_egg_text.js` | 改彩蛋正文，改完自动重新做回转校验并重编码进 `eggs.js` | `node scripts/patch_egg_text.js '{"jujia":[["旧","新"]]}'` |
| `pack_eggs.js` | 把 `story.js` 里两篇手稿的正文挪进 `eggs.js`（Base64 存放）。**已跑过一次，别覆盖** | `node scripts/pack_eggs.js` |
| `finale_v11.js` | 幂等重建两条线的终章 `endcheck`（判定顺序 + 阈值表），会保留隐藏在万宁终章的 `hidden:gege` | `node scripts/finale_v11.js` |
| `gh_push.js` | 走 GitHub REST API 推送（本机的 git 协议连不上 github.com） | `GITHUB_TOKEN=xxx node scripts/gh_push.js` |

## 四、素材生产

配乐与图片的处理链。都是「跑一次就够」，但换素材时还要用，所以留在这一层。

| 脚本 | 作用 |
|---|---|
| `fma_search.py` / `fma_track.py` | Free Music Archive 搜曲目、抓信息、下载 |
| `oga_pick.py` / `oga_pool.py` / `oga_fetch.py` | OpenGameArt 按关键词筛 CC0 素材、批量收集候选、下载 |
| `audio_probe.py` | 音频客观体检：时长 / 响度 / 亮度 / 估计速度 / 是否近似静音 |
| `process_audio.py` | 原曲 → 游戏素材：解码、去首尾静音、截段、编码 |
| `process_bgm_fma.py` | 同上的 FMA 版：截取 / 无缝循环 / 响度归一，并累加写 `_audio_log.json` |
| `gen_bgm.py` | 配乐/音效重制（温暖向），输出到 `game/assets/` |
| `make_site_images.py` | 生成发布用的站点图 |

## 五、本目录下的两个子目录

| 目录 | 内容 |
|---|---|
| `shots/` | 冒烟与截图脚本的输出（`*.png` / `*.jpg`），可随时清空 |
| `_bgm_backup/` | 上一版 BGM 的备份，5 首共 5.2 MB。确认不再回滚就可以删 |

---

## 六、`_archive/` 里是什么

项目根下的 `_archive/`（24 项），是**已经跑完、只作留档**的历史改造脚本与中间数据：

- **版本迁移**：`migrate_v9.js`（0.8→0.9 数值改造）、`rebe_v10.js`（拆 BE）、`fix_finale.js`（修 0.9 迁移留下的重复判定）、`patch_v11.py`（v0.11 数据层）、`rescale_favor.js`（好感缩回 100 分制）
- **扩章**：`add_expand_A1.py` / `add_expand_A2.py`（A 档扩章）、`add_mid_choices.py`（插 4 个中期选择点）、`add_finale_duel.py`（插终章对峙）、`_move_s2.py`（把《哥哥的柜子》移成隐藏结局）
- **旧截图脚本**：`shots.py` / `shot_duel.py` / `shot_expand.py` / `shot_new_be.py`
- **旧冒烟**：`smoke_v9.py`（已被 `smoke_v10.py` 取代）
- **历史数据与草稿**：`_audio_log.json`、`_fma_manifest.json`、`_playtest.json`、`_strat.js`、`_ch_*.txt`（四份扩章草稿）
- **旧转换器**：`build_egg.py`（`chapters/` 原稿 → 彩蛋节点，已被 `pack_eggs.js` 接手）

> 这些脚本**仍能正常跑**（路径逻辑与 `scripts/` 下一样），但都是针对旧版本数据的改造动作，
> 在现在的 `story.js` 上重跑会**改坏数据**。要回顾某次改动怎么做的，读代码即可，别执行。

---

## 改完东西按这个顺序验

```bash
node scripts/validate.js      # 21 个结局还都到得了吗
node scripts/audit.js         # 条件、资源、时间线有没有断
node scripts/policy.js        # 默认点法有没有意外拿到隐藏结局
node scripts/playtest.js      # 体量和结局分布还合不合理
python scripts/smoke_v10.py   # 浏览器里真的能走完吗
python scripts/smoke_v14.py   # 番外没被改坏吧
```

发布后：

```bash
GITHUB_TOKEN=xxx node scripts/gh_push.js
python scripts/smoke_live.py
```

发布前记得把 `game/index.html` 里的 `?v=` 加一档（`set_gift.py` 会顺手做，其他改动要手动）。
