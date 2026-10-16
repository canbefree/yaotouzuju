#!/usr/bin/env bash
# 一键发布：构建 Taro H5 + Go(linux/amd64) 二进制，上传并重启 systemd 服务。
# 用法：./deploy.sh [ssh主机别名]   默认 tyun
set -euo pipefail

HOST="${1:-tyun}"
ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "==> 构建前端 H5"
cd "$ROOT/app"
npm run build:h5

echo "==> 交叉编译 Go 服务端 (linux/amd64)"
cd "$ROOT/server"
./build.sh

echo "==> 准备远端目录"
ssh "$HOST" 'sudo mkdir -p /opt/yaotou/public /opt/yaotou/data && sudo chown -R ubuntu:ubuntu /opt/yaotou'

# 二进制先传到临时名，避免「正在运行的二进制不可覆盖」
echo "==> 上传二进制（临时名）"
scp "$ROOT/server/dist/yaotoud-linux-amd64" "$HOST:/opt/yaotou/yaotoud.new"

echo "==> 上传静态资源"
ssh "$HOST" 'rm -rf /opt/yaotou/public && mkdir -p /opt/yaotou/public'
scp -r "$ROOT/app/dist/"* "$HOST:/opt/yaotou/public/"

echo "==> 停止服务、替换二进制、启动"
ssh "$HOST" 'sudo systemctl stop yaotou 2>/dev/null || true
  mv -f /opt/yaotou/yaotoud.new /opt/yaotou/yaotoud
  chmod +x /opt/yaotou/yaotoud
  sudo systemctl start yaotou
  sleep 1
  systemctl is-active yaotou
  curl -s http://127.0.0.1:8090/api/health | head -c 100; echo'

echo "==> 完成"
