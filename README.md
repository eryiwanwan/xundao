# 驯刀

> 现代都市 · 双线双视角 · 文字游戏
> 她是女儿，他是刀。

**在线游玩**：`https://eryiwanwan.github.io/xundao/game/`

> ⚠️ **本作全篇为成人向作品，仅面向 18 岁以上读者。** 含暴力、犯罪、情欲与明确的成人描写，以及两篇未删改的手稿彩蛋。如果你未满 18 岁，请不要继续。

---

## 这是什么

一部用浏览器读的现代都市悬疑恋爱文字游戏。双女主视角、单一男主线，固定剧本分支，靠选择与好感推进。

- **两条线**：万宁线《驯化与救赎》 / 江野线《复仇与沦陷》
- **二十个结局**：每条线九个（HE《驯刀》/ 暗结局 / 温和结局 / 普通结局两档《各自过冬》《到此为止》或《不了了之》/ 疏离结局＋三种 BE：《野狗的死法》《烧到自己》《没人在家》，或《野狗的死法》《刀口朝内》《无人认领》）＋ 两个隐藏结局（《老万的十年》《同一个站台》）
- **三维判定**：好感 0–100 × 执念 0–100 × 线索 0–5，同一周目里怎么选，决定落进哪一个结局
- **番外 5 篇**：老万的十年、同一个站台、哥哥的柜子、烟花、居家情事
- **图鉴 48 项**：场景 8 / 人物 8 / 档案 12 / 结局 20
- **称号 27 个**：含两条线各自的「九结局全通」称号
- **选项 16 个**（每线八个），每个选项都同时影响好感、执念与线索、各带独立分支；正文约 1585 句 / 41021 字（含全部分支与问卷变体），单周目读 8.7k–9.2k 字

## 怎么玩

| 操作 | 说明 |
|---|---|
| 点击 / 空格 / 回车 | 推进文字 |
| 点选项 | 做出选择，影响好感与分支 |
| 跳过已读 | 右上角开关：读过的正文自动掠过，二周目刷结局用（选项永远不跳） |
| 结局复盘 | 结局页给出好感 / 执念 / 线索的最终值与称号解锁 |
| 自动存档 | 节流后每 400ms 落盘一次，回封面可「继续」 |
| 收集记录 | 图鉴、称号、结局跨周目累积，只有「清空收集记录」才会归零 |

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

### 本地开发

```bash
# 直接预览（需要 http 服务，file:// 下音频会被拦截）
python -m http.server 8778 --directory game
# 打开 http://127.0.0.1:8778/index.html

# 无浏览器的端到端走读：穷举两条线共 32805 条路径，验证 20 个结局全部可达
node scripts/validate.js

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
