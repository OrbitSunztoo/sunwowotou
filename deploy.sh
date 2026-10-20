#!/usr/bin/env bash
# =========================================================
# ふわり Fuwari — 一键部署脚本（Ubuntu / Debian）
# 用法：在服务器上执行
#   sudo bash deploy.sh 你的域名
# 前提：本目录已经上传好 index.html assets server public data uploads
# =========================================================
set -euo pipefail

DOMAIN="${1:-}"
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_USER="fuwari"
PORT="8787"

if [[ $EUID -ne 0 ]]; then
  echo "请用 sudo 运行：sudo bash deploy.sh 你的域名"
  exit 1
fi

echo "==> 1/6 检查 Node"
if ! command -v node >/dev/null 2>&1; then
  echo "    未找到 node，开始安装 Node 20 …"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
node -v

echo "==> 2/6 创建运行用户与目录"
id -u "$SERVICE_USER" >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin "$SERVICE_USER"
mkdir -p "$APP_DIR/uploads"
chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_DIR/data" "$APP_DIR/uploads"

echo "==> 3/6 设置管理员口令"
if [[ ! -f "$APP_DIR/data/auth.json" ]]; then
  sudo -u "$SERVICE_USER" node "$APP_DIR/server/setup-admin.js"
else
  echo "    已存在 data/auth.json，跳过（忘记口令可运行 node server/setup-admin.js 重置）"
fi

echo "==> 4/6 写入 systemd 服务"
cat > /etc/systemd/system/fuwari.service <<EOF
[Unit]
Description=Fuwari blog
After=network.target

[Service]
Type=simple
User=$SERVICE_USER
Group=$SERVICE_USER
WorkingDirectory=$APP_DIR
Environment=NODE_ENV=production
Environment=HOST=127.0.0.1
Environment=PORT=$PORT
Environment=SITE_URL=https://$DOMAIN
ExecStart=$(command -v node) server/server.js
Restart=always
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ReadWritePaths=$APP_DIR/data $APP_DIR/uploads

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now fuwari
systemctl restart fuwari
sleep 2
systemctl --no-pager status fuwari | head -n 5

echo "==> 5/6 配置 Nginx"
if command -v nginx >/dev/null 2>&1; then
  apt-get install -y nginx >/dev/null
fi
cat > /etc/nginx/sites-available/fuwari <<EOF
server {
    listen 80;
    server_name ${DOMAIN:-_};
    client_max_body_size 12m;

    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Host              \$host;
        proxy_set_header X-Real-IP         \$remote_addr;
        proxy_set_header X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 30s;
    }
}
EOF
ln -sf /etc/nginx/sites-available/fuwari /etc/nginx/sites-enabled/fuwari
[[ -f /etc/nginx/sites-enabled/default ]] && rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo "==> 6/6 自检"
curl -fsS -o /dev/null "http://127.0.0.1:$PORT/" && echo "    本机首页 OK"
curl -fsS -o /dev/null "http://127.0.0.1:$PORT/admin.html" && echo "    本机后台 OK"

cat <<EOF

✔ 部署完成
   首页   http://${DOMAIN:-服务器IP}/
   后台   http://${DOMAIN:-服务器IP}/admin.html

下一步（可选）：
   sudo apt install -y certbot python3-certbot-nginx
   sudo certbot --nginx -d ${DOMAIN:-你的域名}

备份命令：
   tar -czf /var/backups/fuwari-\$(date +%F).tar.gz -C $APP_DIR data uploads
EOF
