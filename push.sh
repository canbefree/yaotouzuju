#!/usr/bin/env bash
# 推送代码到 GitHub。本机直连不稳时，自动借用 SSH 主机做 SOCKS 隧道再推。
# 用法：./push.sh [git push 的其它参数]     隧道主机默认 tyun，可用 PUSH_TUNNEL_HOST 覆盖
set -uo pipefail

HOST="${PUSH_TUNNEL_HOST:-tyun}"
PORT="${PUSH_TUNNEL_PORT:-11080}"

echo "==> 先尝试直连推送"
if git push "$@"; then
  echo "==> 直连推送成功"
  exit 0
fi

echo "==> 直连失败，改用 ${HOST} 的 SOCKS5 隧道（:${PORT}）"
pkill -f "ssh -f -N -D ${PORT}" 2>/dev/null || true
ssh -f -N -D "${PORT}" "${HOST}"
cleanup() { pkill -f "ssh -f -N -D ${PORT}" 2>/dev/null || true; }
trap cleanup EXIT
sleep 3

# 用 api.github.com 探活（github.com 根路径在国内常超时，不代表隧道不通）
ready=""
for i in 1 2 3 4 5; do
  if curl -x "socks5h://127.0.0.1:${PORT}" -s -m 15 -o /dev/null https://api.github.com; then
    ready="yes"
    break
  fi
  echo "   隧道未就绪，重试 ${i}/5 …"
  sleep 3
done
if [ -z "${ready}" ]; then
  echo "!! 隧道不通，请检查 ${HOST} 的网络" >&2
  exit 1
fi

if git -c http.proxy="socks5h://127.0.0.1:${PORT}" \
       -c https.proxy="socks5h://127.0.0.1:${PORT}" \
       push "$@"; then
  echo "==> 隧道推送完成"
else
  echo "!! 推送失败" >&2
  exit 1
fi
