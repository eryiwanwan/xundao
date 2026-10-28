# 驯刀

> 现代都市 · 双线双视角 · 文字游戏
> 她是女儿，他是刀。

**在线游玩**：`https://eryiwanwan.github.io/xundao/game/`

> ⚠️ **本作全篇为成人向作品，仅面向 18 岁以上读者。** 含暴力、犯罪、情欲与明确的成人描写，以及两篇未删改的手稿彩蛋。如果你未满 18 岁，请不要继续。

---

## 这是什么

一部用浏览器读的现代都市悬疑恋爱文字游戏。双女主视角、单一男主线，固定剧本分支，靠选择与好感推进。

- **两条线**：万宁线《驯化与救赎》 / 江野线《复仇与沦陷》
- **二十九个结局**：每条线十三个（女主线 HE《驯刀》、男主线 HE《归鞘》/ 暗结局 / 温和结局 / 线索满值结局两档《全都对上了》《查到灯灭》/ 普通结局两档《各自过冬》《到此为止》或《不了了之》/ 疏离结局＋三种 BE：《野狗的死法》《烧到自己》《没人在家》，或《野狗的死法》《刀口朝内》《无人认领》＋两种前期失败《追出去》《一条路走到黑》或《收不住》《一个人去》＋一种中期失败《查不下去》或《两条路都没走》）＋ 三个隐藏结局（《老万的十年》《同一个站台》《哥哥的柜子》）
- **三维判定**：好感 0–100 × 执念 0–100 × 线索 0–5，同一周目里怎么选，决定落进哪一个结局
- **番外 4 篇**：老万的十年、同一个站台（这两个是「番外形态的隐藏结局」）＋ 两篇 HE 彩蛋：烟花（江野线 HE）、居家情事（万宁线 HE）
- **图鉴 63 项**：场景 12 / 人物 10 / 档案 12 / 结局 29
- **称号 38 个**：含两条线各自的「十三结局全通」称号，以及数值维度（好感 100 / 线索满 5 / 执念烧 100）与全部 29 结局的对应称号
- **选项 28 个**（每线十四个），每个选项都同时影响好感、执念与线索、各带独立分支；另有「无伤选择」若干（只换旁白、不动数值、不进结算）把连续叙事切碎；正文约 3500 句 / 8.7 万字（主线，含全部分支、问卷变体与无伤选择；连同四篇番外共约 9.5 万字），单周目读 1.7 万–1.85 万字（两条线各读一遍约 70 分钟）

## 怎么玩

| 操作 | 说明 |
|---|---|
| 点击 / 空格 / 回车 | 推进文字 |
| 点选项 | 做出选择，影响好感与分支 |
| 跳过已读 | 右上角开关：读过的正文自动掠过，二周目刷结局用（选项永远不跳） |
| 结局复盘 | 结局页给出好感 / 执念 / 线索的最终值与称号解锁 |
| 自动存档 | 节流后每 400ms 落盘一次，回封面可「继续」 |
| 收集记录 | 图鉴、称号、结局跨周目累积，只有「清空收集记录」才会归零 |
| 福利码 | 封面页脚「福利码」：输入作者发放的码，一次补齐图鉴 / 番外 / 称号（剧情存档一个字不动） |

开场有一段入场问卷，答案会决定个别段落的写法（不影响主线）。

## 技术

纯静态网页，零依赖、无构建工具链。`game/index.html` 就是这个网页本身，双击也能跑。

```
story.js   ← 剧情数据（节点树：文字 / 选择 / 结局分歧 / 舞台指令）
engine.js  ← 引擎（渲染、存档、图鉴、称号、音频）
style.css  ← 样式（六档断点，桌面 / iPad / 手机）
```

节点类型：`text` `choice` `qvar` `endcheck` `bg` `bgimg` `char` `bgm` `sfx` `flag` `end`。

`endcheck` 的一条 case 可以写 `if: { favorMin, favorMax, dangerMin, dangerMax, clueMin, clueMax }`，再配 `ending: "wan:he"` 指向 `endings` 表里的结局；老写法 `min:` 仍然兼容。

存档在 `localStorage`：`xundao_demo_v2`（剧情）/ `xundao_collect_v1`（跨周目收集）/ `xundao_read_v1`（已读指纹，跳过已读用）/ `xundao_skip_v1`（跳过已读开关）/ `xundao_ageack_v1`（年龄确认）。

福利码的码表在 `story.js` 的 `gift.codes`，换码有一条命令（不用碰引擎）：

```bash
python scripts/set_gift.py 你的新码     # 设成这一个；多个码用空格隔开，都认
python scripts/set_gift.py --show      # 看现在是什么
python scripts/set_gift.py --off       # 清空码表，封面入口一起隐藏
```

脚本会顺手把 `index.html` 的 `?v=` 加一档。规则：4–24 个字符，中英文数字都行；玩家输入时不分大小写、不认空格和连字符、全角半角等价。兑换记录落在收集档的 `gift` 字段，不额外占 key。

> 改完 `game/` 里的 js / css，记得把 `game/index.html` 里那几个 `?v=011` 一起加一档——GitHub Pages 的缓存比想象中顽固，不加会出现「代码改了但玩家看到的还是旧的」。

每个脚本干什么、怎么跑、改完按什么顺序验，见 **`scripts/README.md`**。

### 本地开发

```bash
# 直接预览（需要 http 服务，file:// 下音频会被拦截）
python -m http.server 8778 --directory game
# 打开 http://127.0.0.1:8778/index.html

# 无浏览器的端到端走读：等距抽样走完两条线（全组合 480 万条，抽样 20 万/线），验证 21 个结局全部可达
node scripts/validate.js

# 全文一致性审计：称号 × 结局 × 番外条件、资源引用、时间线、重复句
node scripts/audit.js

# 可玩性体检：阅读量 / 决策密度 / 结局分布 / 换结局的新鲜度
node scripts/playtest.js

# 浏览器冒烟测试（走完一周目 + 截关键页 + 收集控制台报错）
python scripts/smoke_v10.py

# 把 story.js 的全部文本导成 03_全文文本.md
node scripts/export_text.js

# 推送到 GitHub（走 API，因为 github.com 的 git 协议在本机被拦）
GITHUB_TOKEN=xxx node scripts/gh_push.js
```

## 目录

```
game/            网页本体（改这里）：index.html + story.js + engine.js + style.css + eggs.js + assets/
index.html       仓库首页，纯跳转页（跳到 game/，GitHub Pages 从这里发布）
404.html         路径写错时回首页
chapters/        章节原稿（含 18+ 未删改版）
scripts/         校验 / 文本导出 / 素材处理 / 推送脚本
00_项目说明.md    项目总览与进度
01_剧情圣经.md    人物、世界观、线索、结局设定
02_开局问卷设计.md
03_全文文本.md    全部文本导出（自动生成）
```

## 素材与授权

| 用途 | 曲目 | 作者 | 授权 |
|---|---|---|---|
| 封面 / 标题 | Days of Being Wild | Hong Kong Express | CC BY-NC-SA 4.0 |
| 入场问卷 | Photos Of Murder | John Bartmann | CC0 1.0 |
| 楼道 / 对峙 | Hong Kong Noir | John Bartmann | CC0 1.0 |
| 章末余韵 | Floating Lanterns | John Bartmann | CC0 1.0 |
| HE / 番外 | Hopeful Start | John Bartmann | CC0 1.0 |
| 音效 ×3 | 开门 / 脚步 / 纸声 | Oiboo・mikeask・Luckius | CC0 1.0 |

- 音乐来自 [Free Music Archive](https://freemusicarchive.org)，音效来自 [OpenGameArt](https://opengameart.org)
- 均做过「截段 → 首尾交叉淡化无缝循环 → 响度归一」处理；处理后音频按原授权（含相同方式共享）使用
- 封面那首是 **NC（非商业）**：免费分享可以，**商业使用前必须先撤下它**
- 背景图 8 张、立绘 8 张由本项目使用 AI 图像生成自制

## 版权

文字、人物、剧本、美术 © 小妈不是妈（[@eryiwanwan](https://twitter.com/eryiwanwan)）。

本作是虚构作品。人物、地名（雾川）、机构、案件均为虚构，与任何真实人物、团体、事件无关。

未经许可请勿商用、二次改编或搬运；想转载片段做推荐，注明作者与出处即可。
