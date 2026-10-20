# ふわり Fuwari · 二次元个人博客

治愈日系画风的个人博客：**博客首页** + **VRC「砂糖情侣」子页面**，附带一个**本地编辑窗口**——双击就能改人物姓名、头像、文章、图集、合照墙、纪念日、留言，改完点一下「上传到 GitHub」，网上的博客（GitHub Pages）几分钟后自动更新。不需要服务器、不需要数据库、不用记账号口令。

- 主色：浅紫 `#b9a8e3` / 奶白 `#fbf7f4` / 淡粉 `#f3bfd1`
- 全站圆角柔和、玻璃拟态卡片、樱花 / 爱心 / 糖果粒子（canvas）、2D 原创手绘插画
- 网页本身零依赖（无框架、无构建）；只有「上传时压缩图片」用到了 `sharp`，`上传到GitHub.cmd` 会自动装好

| 首页 | 砂糖情侣 | 纪念日 |
| --- | --- | --- |
| ![首页](docs/preview/00-home.png) | ![情侣](docs/preview/01-couple.png) | ![纪念日](docs/preview/02-versary.png) |

| 留言区 | 本地编辑窗口 | 文章管理 |
| --- | --- | --- |
| ![留言](docs/preview/03-messages.png) | ![后台](docs/preview/04-admin.png) | ![文章](docs/preview/05-admin-posts.png) |

---

## 一、三分钟上手

1. 装好 **Node.js 18+**（[nodejs.org](https://nodejs.org) 下载 LTS，一路下一步）。
2. 双击 **`打开后台.cmd`**。第一次会自己建一个本机管理账号（用户名 `admin`，口令随机）并直接打开编辑窗口，**不用登录**。
3. 左边选「人物资料 / 文章 / 图集 / 留言……」改内容，右上角点 **保存修改**。
4. 点右上角 **☁ 上传到 GitHub**。第一次会弹一张设置卡片，填两样东西：
   - **仓库**：`你的用户名/仓库名`（也可以直接粘 `https://github.com/你的用户名/仓库名.git`）
   - **令牌**：按卡片里的 5 步指引，在 <https://github.com/settings/personal-access-tokens/new> 生成一串 `github_pat_...` 粘进来

   点「保存并上传」，日志区会滚出进度，最后显示「上传完成 ✿」。
5. 等 30～90 秒，打开 `https://你的用户名.github.io/仓库名/` 就是新内容了。以后每次改完只要再点一次上传。

> 以后想换电脑、换仓库、换令牌：后台右上角「账号与备份」标签页里能改仓库和令牌，也能一键「重新上传网页代码」。

### 两个 .cmd 的区别

| 文件 | 作用 |
| --- | --- |
| `打开后台.cmd` | 启动本地编辑窗口（`--app` 模式的 Edge / Chrome 窗口，没有地址栏和标签页，像个小软件）。已经在运行时再双击只会把窗口叫到前面 |
| `上传到GitHub.cmd` | 不开窗口，直接命令行上传一次（后台打不开时的备用手段），第一次还会顺手装好图片压缩用的 `sharp` |

两个脚本都优先用 `.runtime\node.exe`，没有就用系统装的 Node；找不到 Node 会提示去哪装。

### 本地直接看效果（可选）

```bash
node server/server.js      # 或 npm start
```

| 地址 | 说明 |
| --- | --- |
| <http://127.0.0.1:8787/> | 博客首页（导航里「砂糖情侣」直达情侣页） |
| `/index.html#couple` | 直接落到砂糖情侣区 |
| `/couple.html` | 情侣页独立入口（会跳转到 `/#couple`） |
| `/admin.html` | 编辑窗口网页版；`/admin.html?local=1` 免登录直接进 |

---

## 二、本地编辑窗口

### 为什么不用登录

`打开后台.cmd` 打开的地址是 `http://127.0.0.1:8787/admin.html?local=1`。服务器只在**请求确实来自本机**（Host 是 `127.0.0.1` / `localhost`，且带 `X-Fuwari-Local: 1` 头）时才认这个「本机免登录」通道，从别的机器访问一律不认。所以别人就算知道你的端口也进不去。

第一次启动生成的账号口令存在 `data/desktop-account.txt`（同时也会打印在控制台）。**想自己设口令**：后台「账号与备份」标签页 → 填新口令 → 点「更新账号」；因为是本机免登录，会先弹一次登录框让你验证旧口令。

> 忘记口令：运行 `node server/setup-admin.js 用户名 新口令`，或直接删掉 `data/auth.json` 再双击 `打开后台.cmd`（会重新生成随机口令）。

口令用 scrypt 加盐哈希存在 `data/auth.json`，不会明文落盘。

### 能改什么

| 标签页 | 内容 |
| --- | --- |
| 人物资料 | 柚子 / 星澈 / 站长的名字、昵称、@账号、VRChat ID、头像、封面、简介、标签 |
| 情侣与纪念日 | 情侣页大标题、双方头像位、开始日期（纪念日天数与「第 N 个 5·20」自动计算）、情书文案 |
| 文章 | 新增 / 编辑 / 删除 / 排序，封面、标签、日期、正文分块（段落 / 小标题 / 引用 / 列表） |
| 图集 | 图片、标题、说明、比例（宽 / 高 / 方） |
| 合照墙 | 拍立得照片与手写注释 |
| 时间线 | 情侣页时间线条目 |
| 留言 | 查看、置顶、删除访客留言 |
| 站点与页脚 | 站点名、副标题、滚动语录、关于我、技能标签、页脚链接、备案文字 |
| 账号与备份 | 改口令、更新仓库 / 令牌、导出 / 导入 `content.json` 备份 |

图片：在任意图片字段旁点「上传」，文件存进 `uploads/` 并自动填好地址；上传到 GitHub 时会自动转成 `.webp` 并改写引用，仓库不会越堆越大。

---

## 三、上传是怎么工作的

点「上传到 GitHub」后，服务器会把本地的 `data/content.json`、`uploads/` 里的图片，以及**网页代码本身**（`index.html`、`assets/`、`.github/workflows/pages.yml` 等）一起推到仓库：

1. 图片压成 webp（最长边 1600px、质量 82）；压完不比原图小就保留原样。
2. `content.json` 里的 `uploads/xxx.png` 自动改成 `uploads/xxx.webp`，并把文件放到仓库根目录（网站读的就是它）。
3. 只推有变化的文件（内容 sha1 和云端一致就跳过），所以第二次之后基本只推你改过的那几篇。被 webp 取代的旧原图会顺手从仓库删掉。
4. 推送成功后写 `data/sync-report.json`（记录提交号和时间），后台会用它判断「有没有还没上传的修改」。

GitHub 上开着 `.github/workflows/pages.yml`：每次 push 到 `main` 就重新发布一次 Pages，所以不用手动点。仓库里要是已经有同名的 `pages.yml`，注意别把它的发布目录改坏。

### 令牌（Token）怎么拿

1. 打开 <https://github.com/settings/personal-access-tokens/new>（Fine-grained token）。
2. **Token name** 随便填，例如 `fuwari-blog`；**Expiration** 建议 90 天。
3. **Repository access** 选 *Only select repositories* → 选中你的博客仓库。
4. 往下拉 **Permissions → Repository permissions → Contents** 选 **Read and write**。
5. 点 *Generate token*，复制 `github_pat_...` 那串，粘到后台设置卡片里。

令牌只保存在这台电脑的 `data/github-token.txt`（权限 600），不会写进仓库、不会出现在命令行里。令牌过期后上传会提示重新填：在「账号与备份」里点「换一个令牌」即可。

### 关于留言

本地编辑窗口里的留言是**真的留言**，存在 `data/content.json` 里，上传后所有人可见。但 GitHub Pages 只是静态托管，没办法接收新留言——所以线上页面里访客发的留言、点的赞只存在**访客自己的浏览器**里（页面上有提示）。想真正收留言，需要一个能干活的服务器，见第五节。

---

## 四、目录结构

```
.
├── index.html              # 首页（含砂糖情侣区）
├── couple.html             # 情侣页入口跳转壳（防止旧链接失效）
├── 打开后台.cmd            # 双击：启动本地编辑窗口
├── 上传到GitHub.cmd        # 双击：命令行上传一次（无窗口）
├── upload.js               # 上传到 GitHub 的实现（Git Data API，增量推送）
├── upload.config.json      # 仓库 / 分支设置（令牌不在这里）
├── content.json            # 网站读的数据文件（上传时由 data/content.json 生成）
├── assets/
│   ├── css/  style.css      首页与全站基础样式
│   │         couple.css     砂糖情侣页样式
│   │         responsive.css 响应式断点
│   ├── js/   content.js     读取数据并渲染各区块
│   │         api-config.js  后端地址（可选，默认留空走本地/静态）
│   │         main.js        粒子、阅读弹窗、搜索、灯箱、滚动动画
│   │         couple.js      倒计时、纪念日、留言区
│   └── img/  *.svg          原创手绘插画（头像、场景、logo）
├── data/
│   ├── content.json         你编辑的内容（编辑窗口读写的就是它）
│   ├── auth.json            账号口令哈希（不进版本库）
│   └── github-token.txt     GitHub 令牌（不进版本库）
├── uploads/                 上传的图片
├── public/
│   └── admin.html/.css/.js  编辑窗口单页
├── server/
│   ├── desktop.js           双击 .cmd 时真正执行：建账号、开窗口、起服务
│   ├── server.js            零依赖静态服务 + REST API + 一键上传接口
│   ├── setup-admin.js       初始化 / 重置口令的脚本
│   ├── migrate-static.js    把旧静态站的图片绝对路径改成相对路径
│   └── lib/                 auth 鉴权 · http 响应与上传 · store JSON 存储 · defaults 默认内容
├── tools/set-api-base.js    写入 / 清空 api-config.js 里的后端地址
├── .github/workflows/pages.yml  GitHub Pages 自动发布
└── DEPLOY.md                想挂到自己的服务器上时的部署指南
```

---

## 五、进阶

### 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `8787` | 端口 |
| `HOST` | `127.0.0.1` | 监听地址。想用手机在同一个 WiFi 下看，设成 `0.0.0.0`（注意：那样就不止本机能改了） |
| `FUWARI_MAX_UPLOAD_MB` | `8` | 单张图片上传上限 |
| `FUWARI_DATA_DIR` | `./data` | 数据目录 |
| `GITHUB_TOKEN` | 空 | 设了就用它，不再读 `data/github-token.txt`（CI 里用） |
| `FUWARI_ADMIN_ORIGINS` | 空 | 允许远程登录后台的前台域名，逗号分隔（只在第五节那种自建服务器方案里用） |

### 命令行上传

```bat
上传到GitHub.cmd                 :: 正常上传
node upload.js --dry-run         :: 只看会推哪些文件，不上传
node upload.js --set-token       :: 换一个 GitHub 令牌
node upload.js --repo 用户名/仓库 :: 换一个仓库
node upload.js --data-only       :: 只推内容，不推网页代码
```

### 接口一览

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/content` | 否 | 站点内容（支持 `?callback=fn` JSONP） |
| POST | `/api/notes` | 否 | 访客留言（限频） |
| POST | `/api/notes/like` | 否 | 留言点赞 |
| POST | `/api/login` | 否 | 登录，返回会话令牌 |
| POST | `/api/logout` | 是 | 退出登录 |
| GET | `/api/session` | 否 | 当前登录状态（含 `local` 标记） |
| PUT | `/api/content` | 是 | 整体保存内容 |
| POST | `/api/content/reset` | 是 | 恢复默认内容 |
| POST | `/api/image` | 是 | 上传图片（原始二进制），返回 `{url}` |
| GET | `/api/uploaded` | 是 | 列出已上传图片 |
| GET | `/api/backup` | 是 | 下载内容备份 |
| POST | `/api/password` | 是 | 修改口令 |
| GET | `/api/sync` | 是 | 上传状态（仓库、上次提交、有无未上传修改） |
| POST | `/api/sync/setup` | 是 | 保存仓库 / 令牌 |
| POST | `/api/sync` | 是 | 跑一次上传，NDJSON 流式返回日志 |

### 想挂到自己的服务器上

`DEPLOY.md` 里有 Ubuntu + systemd + Nginx + HTTPS 的完整步骤（`deploy.sh` 能一键跑完）。那样访客留言会真正落库、后台也能远程登录；不过对个人博客来说，**GitHub Pages + 本地编辑窗口**这套更省心，推荐先用它。

---

Made with 🍬 — ふわり Fuwari
