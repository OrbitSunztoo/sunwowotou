# 部署指南 · ふわり Fuwari

> **先看这里**：个人博客最常见的做法是 **GitHub Pages + 本地编辑窗口**——双击 `打开后台.cmd` 改内容，点「☁ 上传到 GitHub」，网站自动更新，不用买服务器。
> 这份文档写的是「**确实要一台 VPS**」的情况（想真正接收访客留言、想要自己的域名等等）。第 10 节有两条路线的对比。

这套站点是「零依赖 Node 程序 + 一个 JSON 数据文件 + uploads 图片目录」，没有数据库、没有构建步骤。
上线只需要三件事：**把文件传上去 → 用守护进程跑起来 → 前面挂 Nginx + HTTPS**。

---

## 0. 先想清楚：你现在的数据怎么带走

本地 `E:\dsh工作区\博客` 里可以直接搬走的只有：

| 路径 | 是否必须 | 说明 |
| --- | --- | --- |
| `index.html` `couple.html` `package.json` | ✅ | 前台页面 |
| `assets/` | ✅ | CSS / JS / SVG 插画 |
| `server/` `public/` | ✅ | 服务端与后台界面 |
| `data/content.json` | ✅ | **你所有改过的内容都在这里**，别用仓库里的默认版覆盖它 |
| `data/auth.json` | ⚠️ | 管理员口令。带上去就能直接用现在的账号；不想带就删掉，上线后重新设置 |
| `data/github-token.txt` `upload.config.json` | ❌ | 这是本地「一键上传」用的，服务器上不需要，也别传 |
| `uploads/` | ✅ | 编辑窗口里上传过的照片（现在本地是原图，服务器上直接用也行） |
| `docs/` `README.md` `.gitignore` | 可选 | 截图和说明，不影响运行 |

> 口令与内容都属于隐私，用 `scp` / 压缩包上传，别提交到公开仓库。

---

## 1. 准备服务器

以 **Ubuntu 22.04 / 24.04** 为例（Debian 同理），root 或有 sudo 的账号：

```bash
sudo apt update
sudo apt install -y curl
# Node 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v      # v20.x
```

建运行用户与目录（用专门账号跑，权限最小化）：

```bash
sudo useradd --system --create-home --shell /usr/sbin/nologin fuwari
sudo mkdir -p /opt/fuwari
sudo chown -R fuwari:fuwari /opt/fuwari
```

---

## 2. 上传文件

### 方式 A：打包上传（最简单）

本地 Windows PowerShell：

```powershell
cd "E:\dsh工作区\博客"
# 不带上临时/调试文件
tar -czf fuwari.tar.gz index.html couple.html package.json assets server public data uploads
scp fuwari.tar.gz root@你的服务器IP:/tmp/
```

服务器上：

```bash
sudo tar -xzf /tmp/fuwari.tar.gz -C /opt/fuwari
sudo chown -R fuwari:fuwari /opt/fuwari
ls /opt/fuwari        # assets  couple.html  data  index.html  package.json  public  server  uploads
```

### 方式 B：Git（方便以后更新）

```bash
# 服务器上
sudo -u fuwari git clone 你的仓库地址 /opt/fuwari
```

> 记得 `.gitignore` 已排除 `data/auth.json`（口令不进仓库）；`data/content.json` 也建议排除，用后台「导出备份」单独同步。

---

## 3. 首次启动前：设置管理员口令

生产环境**不要**沿用本地编辑窗口里那套随机口令（它在 `data/desktop-account.txt`）。

```bash
cd /opt/fuwari

# 情况一：上传了 data/content.json（保留你改过的内容），但不想带本地口令
sudo rm -f data/auth.json data/desktop-account.txt
sudo -u fuwari node server/setup-admin.js
#   交互输入用户名 + 8 位以上口令，或直接：
#   sudo -u fuwari node server/setup-admin.js 你的用户名 你的口令

# 情况二：先不清空，启动后用 desktop-account.txt 里的口令登录，再在后台改口令
```

> 服务器上打开 `/admin.html` 是要登录的（只有本机 `127.0.0.1` 才走「免登录」通道），记得把这个口令记好。

---

## 4. 用 systemd 跑起来（开机自启 + 崩溃自动重启）

```bash
sudo nano /etc/systemd/system/fuwari.service
```

```ini
[Unit]
Description=Fuwari blog (ふわり)
After=network.target

[Service]
Type=simple
User=fuwari
Group=fuwari
WorkingDirectory=/opt/fuwari
Environment=NODE_ENV=production
Environment=HOST=127.0.0.1
Environment=PORT=8787
Environment=SITE_URL=https://你的域名
ExecStart=/usr/bin/node server/server.js
Restart=always
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ReadWritePaths=/opt/fuwari/data /opt/fuwari/uploads

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now fuwari
sudo systemctl status fuwari --no-pager
curl -I http://127.0.0.1:8787/        # 应返回 HTTP/1.1 200
journalctl -u fuwari -f                # 看日志
```

> `HOST=127.0.0.1` 表示只允许本机访问，外网一律走 Nginx（推荐）。
> `ProtectSystem=full` 让 `/opt/fuwari` 整体只读、只放开 `data/` 和 `uploads/`，代码被篡改的风险更低。

### 不想装 systemd？用 pm2 也行

```bash
sudo npm i -g pm2
cd /opt/fuwari && pm2 start server/server.js --name fuwari
pm2 save && pm2 startup
```

---

## 5. Nginx 反代 + HTTPS

```bash
sudo apt install -y nginx
sudo nano /etc/nginx/sites-available/fuwari
```

```nginx
server {
    listen 80;
    server_name 你的域名;

    client_max_body_size 12m;          # 留出后台传图的空间（程序默认单张 8MB）

    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 30s;
    }

    # 上传的图片可以给长缓存，交给程序自己发缓存头也行
    location /uploads/ {
        proxy_pass http://127.0.0.1:8787;
        proxy_cache_valid 200 30d;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/fuwari /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

免费证书：

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d 你的域名
```

自动续期由 certbot 的 timer 负责，可用 `sudo certbot renew --dry-run` 验证。

**重要**：程序自己会读 `X-Forwarded-Proto` / `X-Forwarded-For`，所以登录 Cookie 的 `Secure` 标记和留言限流都能在 HTTPS 反代下正确工作——前提是上面那两个 header 别删。

---

## 6. 域名与防火墙

- 域名 A 记录指向服务器 IP（IPv6 可选），等 DNS 生效后再跑 certbot。
- 只开放 22 / 80 / 443：

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

- 云厂商（阿里云/腾讯云/AWS）记得在**安全组**里同样放行 80、443。

---

## 7. 上线后自检清单

```bash
# 1) 首页和后台能打开
curl -I https://你的域名/
curl -I https://你的域名/admin.html

# 2) 接口正常
curl https://你的域名/api/content | head -c 200

# 3) 内容接口没被缓存成旧数据（应返回 no-store）
curl -I https://你的域名/api/content

# 4) 后台上传一张图，确认 uploads 里有文件
ls -l /opt/fuwari/uploads
```

浏览器里再确认：

- [ ] 首页文章卡片、图集、合照墙都有内容（不是骨架屏、没有浏览器控制台红字）
- [ ] 导航「砂糖情侣」能直达情侣页，纪念日天数正确
- [ ] 情侣页留言能提交、点赞能 +1、刷新后仍在
- [ ] 后台登录正常，改个名字保存后前台刷新能看到
- [ ] 手机打开一次，检查导航和卡片排版
- [ ] **已把默认口令换掉**

---

## 8. 日常运维

### 备份（最重要）

```bash
# 内容 + 口令 + 图片，一条命令打包
sudo tar -czf /var/backups/fuwari-$(date +%F).tar.gz -C /opt/fuwari data uploads
```

建议加到 crontab（每天 3 点）：

```bash
sudo crontab -e
# 0 3 * * * tar -czf /var/backups/fuwari-$(date +\%F).tar.gz -C /opt/fuwari data uploads
```

后台「账号与备份」里也能随时**导出 content.json**，适合做快照。

### 更新代码（不动数据）

```bash
cd /opt/fuwari
sudo tar -czf /tmp/fuwari-before-update.tar.gz -C /opt/fuwari data uploads   # 先备份
# 覆盖上传新的 index.html / assets / server / public
sudo chown -R fuwari:fuwari /opt/fuwari
sudo systemctl restart fuwari
```

`data/content.json` 只在第一次初始化时生成，之后不会被代码覆盖；服务端支持外部修改后自动重读，所以直接用后台改就够。

### 改端口 / 换数据目录

改 systemd 里的 `Environment=PORT=...`，或 `Environment=FUWARI_DATA_DIR=/data/fuwari`（记得同步改 `ReadWritePaths`），然后 `systemctl daemon-reload && systemctl restart fuwari`。

---

## 9. 常见问题

| 现象 | 排查 |
| --- | --- |
| 502 Bad Gateway | `systemctl status fuwari`；`journalctl -u fuwari -n 50`；多半是 Node 没起来或端口不对 |
| 后台上传图片失败 / 413 | Nginx `client_max_body_size` 调大；或 `FUWARI_MAX_UPLOAD_MB` 调整后重启 |
| 登录后马上掉线 | 反代漏了 `X-Forwarded-Proto`，导致 Secure Cookie 在 http 下不被保存 |
| 首页能开，后台打不开 | `/admin.html` 走的是 `public/` 目录，确认 `public/` 整个上传了 |
| 留言总提示「放太多糖啦」 | 程序按 IP 限流（20 条/小时），走反代时请保留 `X-Forwarded-For` |
| 忘记后台口令 | `cd /opt/fuwari && sudo -u fuwari node server/setup-admin.js 用户名 新口令 && sudo systemctl restart fuwari` |
| 页面显示数据加载失败（离线） | `/api/content` 不通：检查反代规则，或 `curl http://127.0.0.1:8787/api/content` |

---

## 10. 只想放静态页（推荐：GitHub Pages + 本地编辑窗口）

个人博客大多数时候**根本不需要服务器**。这套代码已经内置了「本地改 + 一键上传」的工作流：

1. 双击 `打开后台.cmd`，在本地编辑窗口里改内容（免登录）；
2. 点右上角 **☁ 上传到 GitHub**，内容、图片、网页代码一起推到仓库；
3. `.github/workflows/pages.yml` 会自动把网站发布到 `https://你的用户名.github.io/仓库名/`。

详细步骤（含 GitHub 令牌怎么拿）见 README 的「三分钟上手」。这个方案下：

- **留言 / 点赞**：GitHub Pages 是纯静态的，收不到新留言。访客发的留言和赞只存在访客自己的浏览器里（页面会提示“糖先放进本地罐子啦”）。你在编辑窗口里写/删的留言会随着上传发布出去，所有人可见。
- **图片**：上传时自动转 webp 并改写引用，仓库不会越堆越大。

### 只是把静态文件放到自己的主机上

同样不用改任何配置——前台发现没有 `/api/content` 就会改读站点根目录的 `content.json`：

1. 在编辑窗口里点「下载内容备份（JSON）」，或直接复制仓库根的 `content.json`；
2. 上传这些文件到网站根目录：

```
index.html
assets/
uploads/          ← 上传过的图片，路径要和 content.json 里一致
content.json      ← 第 1 步得到的文件
```

3. 打开站点即可：文章、图集、合照墙、角色卡、纪念日全部正常读取，`body` 会带上 `is-static` 标记。

想显式指定数据文件位置，也可以在 `index.html` 里把 `<!--FUWARI:CONFIG-->` 换成：

```html
<script>window.FUWARI_CONFIG = { apiBase: "", dataUrl: "./content.json" };</script>
```

以后换成 VPS，把 `data/content.json` 一并传上去、跑 `npm start`，留言就自动回到服务端保存，接口路径无需改代码。

> 如果图片在子目录部署时 404，说明 `content.json` 里存的是 `/uploads/...` 这类以斜杠开头的绝对路径。
> 用 `node server/migrate-static.js 旧的content.json` 跑一遍，会写成 `uploads/...` 的相对路径（原文件自动备份）。

> 结论：只做个人博客 → **GitHub Pages + 本地编辑窗口**最省心；想真正接收访客留言 → 用第 4、5 节的 VPS + systemd + Nginx，或者直接跑 `deploy.sh`（见第 11 节）。

---

## 11. 一键部署脚本

仓库根目录有 `deploy.sh`（Ubuntu / Debian），它会帮你装 Node、建 systemd 服务、配 Nginx、做自检：

```bash
# 先把文件传到服务器，例如
scp -r "E:\dsh工作区\博客\." root@你的服务器IP:/opt/fuwari/
# 登录服务器后
cd /opt/fuwari
sudo bash deploy.sh 你的域名
```

脚本执行过程中会提示你设置管理员口令（只有第一次需要）。它做的事和上面第 1–7 节完全一样，看不懂脚本的话按上面的手动步骤走更踏实。

