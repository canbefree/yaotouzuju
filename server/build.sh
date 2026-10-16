#!/usr/bin/env bash
# 交叉编译 Linux 静态二进制（部署到 tyun 等 x86_64 服务器）
set -euo pipefail
cd "$(dirname "$0")"

GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags "-s -w" -o dist/yaotoud-linux-amd64 ./cmd/yaotoud
echo "已生成 dist/yaotoud-linux-amd64"
ls -lh dist/yaotoud-linux-amd64
