<p align="center">
  <img src="app/src/assets/logo.png" alt="摇骰组局" width="380">
</p>

# 摇骰组局（吹牛骰 / 大话骰）

一个可玩通的在线小游戏：**H5 网页版 + Go 权威服务端 + SQLite 独立数据库**。
前端用 Taro（React + TypeScript）编写，一套代码可同时编译到 **H5 / 微信小程序 / 抖音小程序**。

```
┌───────────────┐   HTTP/WS   ┌──────────────────┐   SQL      ┌──────────────┐
│ Taro 前端      │ ──────────▶ │ Go 服务端         │ ─────────▶ │ SQLite       │
│ (H5/微信/抖音) │ ◀────────── │ net/http + ws     │            │ users/scores │
└───────────────┘  房间推送    │ 权威对局引擎      │            │ matches/rooms│
                              └──────────────────┘            └──────────────┘
```

## 目录

```
yao-tou-zu-ju/
├── server/                     Go 服务端
│   ├── cmd/yaotoud/main.go     入口：REST + WS + 静态托管
│   ├── internal/game/          规则 / 房间引擎 / WebSocket 推送
│   ├── internal/store/         SQLite（modernc.org/sqlite，纯 Go 免 cgo）
│   ├── internal/auth/          登录态签名 + 微信/抖音 code2session
│   ├── internal/api/           HTTP 接口（含集成测试 e2e_test.go）
│   ├── deploy/                 systemd 单元 + 部署脚本
│   └── build.sh                交叉编译 linux/amd64 单文件二进制
└── app/                        Taro 前端
    ├── src/pages/              index(首页)/lobby(大厅)/room(对局)/local(单机)/rules/settings
    ├── src/api/                请求与 WebSocket 客户端
    ├── src/game/localGame.ts   本地单机 + AI 决策
    └── src/store/              会话与房间状态
```

## 玩法

每人摇 N 颗骰子（只有自己可见）。轮流**叫点数**（数量 + 点数，必须比上家大）；
轮到你时也可以**吹牛**质疑上家，翻开全部骰子：实际数量 ≥ 叫的数量则质疑者受罚，否则叫点者受罚。
结算赢家 +20 分、其余 -10 分，先到目标分（吹牛骰 100 / 大话骰 60）者赢下整局。

- 在线游戏：创建房间 / 加入房间 / 快速匹配（服务端权威判定、WebSocket 实时推送）
- 本地单机：与 AI 对战（客户端本地运行，含自由模式与战绩记录）

## 技术栈

| 层 | 选型 | 理由 |
|---|---|---|
| 服务端 | Go 1.22+ / `net/http` / `gorilla/websocket` | 单静态二进制、高并发、部署零依赖 |
| 数据库 | SQLite（`modernc.org/sqlite`） | 独立数据库文件、免 cgo、易交叉编译；换 PG/MySQL 只改 DSN |
| 前端 | Taro 4 + React 18 + TypeScript | 一码多端，天然支持微信/抖音小程序 |
| 部署 | systemd | 保活、开机自启 |

## 本地开发

```bash
# 1) 服务端（默认 8090）
cd server
cp .env.example .env          # 联调可保留 ALLOW_DEV_LOGIN=1
go run ./cmd/yaotoud
# 或：go build -o dist/yaotoud ./cmd/yaotoud && ./dist/yaotoud

# 2) 前端 H5（开发服务器 10086，已配置代理 /api、/ws → 8090）
cd app
npm install
npm run dev:h5                 # 浏览器打开 http://localhost:10086
```

测试：

```bash
cd server && go test ./...      # 覆盖：建房/加入/准备开局/叫点/质疑/结算/排行榜/隐私/WS
```

## 生产部署（已部署到 tyun）

当前状态：`/opt/yaotou` 下的 Go 服务由 systemd（`yaotou.service`）守护，监听 **8090**，
SQLite 在 `/opt/yaotou/data/yaotou.db`，前端静态文件在 `/opt/yaotou/public`。

> ⚠️ 8090 需要在**云厂商安全组**放行（TCP 入方向）后，公网才能访问
> `http://<公网IP>:8090/`。服务器本机防火墙（ufw/nft）未拦截，仅安全组限制。

一键发布（在本机执行，需已配置 ssh 别名 `tyun`）：

```bash
./deploy.sh            # 构建 H5 + Go 二进制，上传并重启 yaotou.service
./deploy.sh tyun       # 指定主机
```

手动部署要点：

```bash
cd server && ./build.sh                                   # 交叉编译 linux/amd64
ssh tyun 'sudo mkdir -p /opt/yaotou/{public,data} && sudo chown -R ubuntu:ubuntu /opt/yaotou'
scp server/dist/yaotoud-linux-amd64 tyun:/opt/yaotou/yaotoud
scp -r app/dist/* tyun:/opt/yaotou/public/
ssh tyun 'cd /opt/yaotou && printf "PORT=8090\nDATABASE_URL=file:/opt/yaotou/data/yaotou.db\nPUBLIC_DIR=/opt/yaotou/public\nTOKEN_SECRET=%s\nALLOW_DEV_LOGIN=1\n" "$(openssl rand -base64 32)" > .env'
ssh tyun 'sudo cp server/deploy/yaotou.service /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable --now yaotou'
```

运维：

```bash
ssh tyun 'systemctl status yaotou'
ssh tyun 'journalctl -u yaotou -f'
# 备份数据库（房间/积分/战绩都在这里）
ssh tyun 'cp /opt/yaotou/data/yaotou.db ~/yaotou-$(date +%F).db'
```

## 接口一览

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 探活（无需登录） |
| GET | `/api/modes` | 玩法列表 |
| POST | `/api/login` | 登录 `{platform: dev/wechat/douyin, code}` |
| POST | `/api/room/create` `quick` `join` `ready` `start` `leave` | 房间动作 |
| GET | `/api/room/list` / `/api/room/state?roomId=` | 房间列表 / 状态 |
| POST | `/api/game/bid` `challenge` `next` | 叫点 / 吹牛 / 下一轮 |
| GET | `/api/rank?mode=` / `/api/me` | 排行榜 / 我的战绩 |
| WS | `/ws?token=` | 房间实时推送（`room_state`/`round_end`/`match_end`/`chat`） |

## 移植到微信 / 抖音小程序

前端已是 Taro 一码多端，切换到小程序只需：

```bash
cd app
npm run build:weapp     # 微信小程序，产物 dist/
npm run build:tt        # 抖音小程序
```

1. **后端域名**：小程序要求 https/wss 合法域名。构建时注入：
   `TARO_APP_BACKEND=https://your.domain npm run build:weapp`
   （服务端已支持跨域与 WSS，把域名备案 + 反代到 8090 即可）。
2. **登录**：小程序端会自动走 `Taro.login()` 取 code，平台按 `TARO_ENV` 选 `wechat`/`douyin`；
   服务端 `code2session` 只需在 `.env` 填 `WX_APPID/WX_APPSECRET` 或 `TT_APPID/TT_APPSECRET`。
3. **平台配置**：在微信/抖音后台把 request 合法域名配成后端域名、socket 合法域名配 wss 域名。

## 数据库

SQLite，四张业务表：`users`（用户）、`scores`（累计积分/胜场/场次）、
`matches` + `match_players`（对局归档）、`rooms`（未结束房间快照，进程重启自动恢复）。
建表语句内嵌在 `internal/store/store.go`，首次启动自动创建，无需手工迁移。
