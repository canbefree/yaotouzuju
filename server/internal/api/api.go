// Package api 提供 REST 动作接口。
package api

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gorilla/websocket"

	"yaotou/internal/auth"
	"yaotou/internal/config"
	"yaotou/internal/game"
	"yaotou/internal/store"
)

// Server 聚合依赖。
type Server struct {
	Engine *game.Engine
	Hub    *game.Hub
	Store  *store.Store
	Cfg    *config.Config
}

// New 创建 API 服务。
func New(engine *game.Engine, hub *game.Hub, st *store.Store, cfg *config.Config) *Server {
	return &Server{Engine: engine, Hub: hub, Store: st, Cfg: cfg}
}

var avatars = []string{"😀", "😎", "🤠", "🐱", "🐶", "🦊", "🐼", "🐯", "🐸", "🦄"}

// PickAvatar 依据种子选一个头像。
func PickAvatar(seed string) string {
	var h uint32
	for _, ch := range seed {
		h = h*31 + uint32(ch)
	}
	return avatars[h%uint32(len(avatars))]
}

// Handler 返回注册好路由的 mux。
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	s.Register(mux)
	return mux
}

// Register 把 API 路由注册到给定 mux。
func (s *Server) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/health", s.handleHealth)
	mux.HandleFunc("GET /api/modes", s.handleModes)
	mux.HandleFunc("POST /api/login", s.handleLogin)
	mux.HandleFunc("POST /api/profile", s.authed(s.handleProfile))

	mux.HandleFunc("POST /api/room/create", s.authed(s.handleRoomCreate))
	mux.HandleFunc("POST /api/room/quick", s.authed(s.handleRoomQuick))
	mux.HandleFunc("POST /api/room/join", s.authed(s.handleRoomJoin))
	mux.HandleFunc("GET /api/room/list", s.handleRoomList)
	mux.HandleFunc("GET /api/room/state", s.authed(s.handleRoomState))
	mux.HandleFunc("POST /api/room/ready", s.authed(s.handleRoomReady))
	mux.HandleFunc("POST /api/room/start", s.authed(s.handleRoomStart))
	mux.HandleFunc("POST /api/room/leave", s.authed(s.handleRoomLeave))

	mux.HandleFunc("POST /api/game/bid", s.authed(s.handleBid))
	mux.HandleFunc("POST /api/game/challenge", s.authed(s.handleChallenge))
	mux.HandleFunc("POST /api/game/next", s.authed(s.handleNext))

	mux.HandleFunc("GET /api/rank", s.handleRank)
	mux.HandleFunc("GET /api/me", s.authed(s.handleMe))
}

// ---------------------------------------------------------------- 中间件/工具

func (s *Server) authed(h func(w http.ResponseWriter, r *http.Request, openid string)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		openid, ok := auth.Bearer(r.Header.Get("Authorization"))
		if !ok {
			fail(w, &game.Error{Code: "UNAUTHORIZED", Msg: "登录态无效，请重新登录", Status: 401})
			return
		}
		h(w, r, openid)
	}
}

func ok(w http.ResponseWriter, data any) {
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "data": data})
}

func fail(w http.ResponseWriter, err error) {
	var ge *game.Error
	if errors.As(err, &ge) {
		writeJSON(w, ge.Status, map[string]any{"ok": false, "code": ge.Code, "msg": ge.Msg})
		return
	}
	writeJSON(w, http.StatusInternalServerError, map[string]any{"ok": false, "code": "INTERNAL", "msg": err.Error()})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func readJSON(r *http.Request, dst any) error {
	defer r.Body.Close()
	body, err := io.ReadAll(io.LimitReader(r.Body, 128*1024))
	if err != nil {
		return errors.New("请求体读取失败")
	}
	if len(body) == 0 {
		return nil
	}
	return json.Unmarshal(body, dst)
}

// profile 取当前用户资料（昵称/头像来自数据库）。
func (s *Server) profile(openid string) (nickname, avatar string) {
	if nick, av, ok := s.Store.GetUser(openid); ok {
		if nick == "" {
			nick = localName(openid)
		}
		if av == "" {
			av = PickAvatar(openid)
		}
		return nick, av
	}
	return localName(openid), PickAvatar(openid)
}

func localName(openid string) string {
	parts := strings.Split(openid, ":")
	if len(parts) > 1 && parts[len(parts)-1] != "" {
		return parts[len(parts)-1]
	}
	if len(openid) > 6 {
		return openid[:6]
	}
	return "玩家"
}

// ---------------------------------------------------------------- 基础

func (s *Server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	ok(w, map[string]any{
		"service": "yaotou-server",
		"version": "1.0.0",
		"time":    nowMilli(),
		"rooms":   s.Engine.Count(),
		"online":  s.Hub.OnlineCount(),
		"matches": s.Store.MatchCount(),
		"modes":   modeList(),
	})
}

func (s *Server) handleModes(w http.ResponseWriter, _ *http.Request) {
	ok(w, modeList())
}

func modeList() []game.ModeConfig {
	return []game.ModeConfig{game.Modes[game.ModeClassic], game.Modes[game.ModeQuick]}
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Platform string `json:"platform"`
		Code     string `json:"code"`
		Nickname string `json:"nickname"`
		Avatar   string `json:"avatar"`
	}
	if err := readJSON(r, &body); err != nil {
		fail(w, &game.Error{Code: "BAD_PARAM", Msg: err.Error(), Status: 400})
		return
	}
	if body.Code == "" {
		fail(w, &game.Error{Code: "BAD_PARAM", Msg: "缺少 code", Status: 400})
		return
	}
	session, err := auth.Login(s.Cfg, body.Platform, body.Code, body.Nickname, body.Avatar)
	if err != nil {
		fail(w, &game.Error{Code: "LOGIN_FAILED", Msg: err.Error(), Status: 400})
		return
	}
	name := firstNonEmpty(body.Nickname, session.Nickname, localName(session.OpenID))
	if len([]rune(name)) > 12 {
		name = string([]rune(name)[:12])
	}
	av := firstNonEmpty(body.Avatar, session.Avatar, PickAvatar(session.OpenID))
	s.Store.UpsertUser(session.OpenID, name, av)
	ok(w, map[string]any{
		"token": auth.Issue(session.OpenID), "openid": session.OpenID,
		"nickname": name, "avatar": av, "platform": body.Platform,
	})
}

func (s *Server) handleProfile(w http.ResponseWriter, r *http.Request, openid string) {
	var body struct {
		Nickname string `json:"nickname"`
		Avatar   string `json:"avatar"`
	}
	_ = readJSON(r, &body)
	name, av := s.profile(openid)
	if body.Nickname != "" {
		name = string([]rune(body.Nickname)[:min(len([]rune(body.Nickname)), 12)])
	}
	if body.Avatar != "" {
		av = body.Avatar
	}
	s.Store.UpsertUser(openid, name, av)
	ok(w, map[string]any{"openid": openid, "nickname": name, "avatar": av})
}

// ---------------------------------------------------------------- 房间

type roomBody struct {
	RoomID string `json:"roomId"`
}

func (s *Server) handleRoomCreate(w http.ResponseWriter, r *http.Request, openid string) {
	var body struct {
		Mode string `json:"mode"`
	}
	_ = readJSON(r, &body)
	mode := game.ModeID(body.Mode)
	if !game.IsMode(body.Mode) {
		mode = game.ModeClassic
	}
	nick, av := s.profile(openid)
	roomID, err := s.Engine.Create(mode, game.UserInfo{OpenID: openid, Nickname: nick, Avatar: av})
	if err != nil {
		fail(w, err)
		return
	}
	s.view(w, roomID, openid)
}

func (s *Server) handleRoomQuick(w http.ResponseWriter, r *http.Request, openid string) {
	var body struct {
		Mode string `json:"mode"`
	}
	_ = readJSON(r, &body)
	nick, av := s.profile(openid)
	var mode game.ModeID
	if game.IsMode(body.Mode) {
		mode = game.ModeID(body.Mode)
	}
	roomID, err := s.Engine.QuickMatch(game.UserInfo{OpenID: openid, Nickname: nick, Avatar: av}, mode)
	if err != nil {
		fail(w, err)
		return
	}
	s.view(w, roomID, openid)
}

func (s *Server) handleRoomJoin(w http.ResponseWriter, r *http.Request, openid string) {
	var body roomBody
	_ = readJSON(r, &body)
	roomID := strings.ToUpper(strings.TrimSpace(body.RoomID))
	if roomID == "" {
		fail(w, &game.Error{Code: "BAD_PARAM", Msg: "请输入房间号", Status: 400})
		return
	}
	nick, av := s.profile(openid)
	id, err := s.Engine.Join(roomID, game.UserInfo{OpenID: openid, Nickname: nick, Avatar: av})
	if err != nil {
		fail(w, err)
		return
	}
	s.view(w, id, openid)
}

func (s *Server) handleRoomList(w http.ResponseWriter, _ *http.Request) {
	ok(w, s.Engine.PublicRooms())
}

func (s *Server) handleRoomState(w http.ResponseWriter, r *http.Request, openid string) {
	roomID := strings.ToUpper(strings.TrimSpace(r.URL.Query().Get("roomId")))
	if roomID == "" {
		fail(w, &game.Error{Code: "BAD_PARAM", Msg: "缺少 roomId", Status: 400})
		return
	}
	s.view(w, roomID, openid)
}

func (s *Server) handleRoomReady(w http.ResponseWriter, r *http.Request, openid string) {
	var body struct {
		RoomID string `json:"roomId"`
		Ready  bool   `json:"ready"`
	}
	_ = readJSON(r, &body)
	id := strings.ToUpper(strings.TrimSpace(body.RoomID))
	roomID, err := s.Engine.SetReady(id, openid, body.Ready)
	if err != nil {
		fail(w, err)
		return
	}
	s.view(w, roomID, openid)
}

func (s *Server) handleRoomStart(w http.ResponseWriter, r *http.Request, openid string) {
	var body roomBody
	_ = readJSON(r, &body)
	id := strings.ToUpper(strings.TrimSpace(body.RoomID))
	roomID, err := s.Engine.Start(id, openid)
	if err != nil {
		fail(w, err)
		return
	}
	s.view(w, roomID, openid)
}

func (s *Server) handleRoomLeave(w http.ResponseWriter, r *http.Request, openid string) {
	var body roomBody
	_ = readJSON(r, &body)
	id := strings.ToUpper(strings.TrimSpace(body.RoomID))
	deleted, err := s.Engine.Leave(id, openid)
	if err != nil {
		fail(w, err)
		return
	}
	if deleted {
		s.Store.DeleteRoom(id)
	}
	ok(w, map[string]any{"left": true, "roomId": id})
}

// ---------------------------------------------------------------- 对局

func (s *Server) handleBid(w http.ResponseWriter, r *http.Request, openid string) {
	var body struct {
		RoomID   string `json:"roomId"`
		Quantity int    `json:"quantity"`
		Face     int    `json:"face"`
	}
	_ = readJSON(r, &body)
	id := strings.ToUpper(strings.TrimSpace(body.RoomID))
	roomID, err := s.Engine.Bid(id, openid, body.Quantity, body.Face)
	if err != nil {
		fail(w, err)
		return
	}
	s.view(w, roomID, openid)
}

func (s *Server) handleChallenge(w http.ResponseWriter, r *http.Request, openid string) {
	var body roomBody
	_ = readJSON(r, &body)
	id := strings.ToUpper(strings.TrimSpace(body.RoomID))
	roomID, err := s.Engine.Challenge(id, openid)
	if err != nil {
		fail(w, err)
		return
	}
	s.view(w, roomID, openid)
}

func (s *Server) handleNext(w http.ResponseWriter, r *http.Request, openid string) {
	var body roomBody
	_ = readJSON(r, &body)
	id := strings.ToUpper(strings.TrimSpace(body.RoomID))
	roomID, err := s.Engine.Next(id, openid)
	if err != nil {
		fail(w, err)
		return
	}
	s.view(w, roomID, openid)
}

// ---------------------------------------------------------------- 排行

func (s *Server) handleRank(w http.ResponseWriter, r *http.Request) {
	mode := r.URL.Query().Get("mode")
	if !game.IsMode(mode) {
		mode = string(game.ModeClassic)
	}
	limit := 20
	if n, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && n > 0 {
		limit = min(n, 100)
	}
	rows := s.Store.TopScores(mode, limit)
	out := make([]map[string]any, 0, len(rows))
	for i, row := range rows {
		out = append(out, map[string]any{
			"rank": i + 1, "openid": row.OpenID, "nickname": row.Nickname, "avatar": row.Avatar,
			"points": row.Points, "wins": row.Wins, "rounds": row.Rounds, "matches": row.Matches,
		})
	}
	ok(w, out)
}

func (s *Server) handleMe(w http.ResponseWriter, r *http.Request, openid string) {
	mode := r.URL.Query().Get("mode")
	if !game.IsMode(mode) {
		mode = string(game.ModeClassic)
	}
	row, rank, found := s.Store.RankOf(mode, openid)
	if !found {
		ok(w, map[string]any{"openid": openid, "score": nil, "rank": nil})
		return
	}
	ok(w, map[string]any{
		"openid": openid, "rank": rank,
		"score": map[string]any{"points": row.Points, "wins": row.Wins, "rounds": row.Rounds, "matches": row.Matches},
	})
}

// ---------------------------------------------------------------- 内部

func (s *Server) view(w http.ResponseWriter, roomID, openid string) {
	view, err := s.Engine.View(roomID, openid)
	if err != nil {
		fail(w, err)
		return
	}
	ok(w, view)
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if v != "" {
			return v
		}
	}
	return ""
}

func nowMilli() int64 { return time.Now().UnixMilli() }

// WSHandler 处理 WebSocket 升级：token 校验后交给推送中心。
func (s *Server) WSHandler() http.HandlerFunc {
	upgrader := websocket.Upgrader{
		ReadBufferSize:  4096,
		WriteBufferSize: 4096,
		CheckOrigin:     func(*http.Request) bool { return true },
	}
	return func(w http.ResponseWriter, r *http.Request) {
		openid, valid := auth.Verify(r.URL.Query().Get("token"))
		if !valid {
			http.Error(w, "invalid token", http.StatusUnauthorized)
			return
		}
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		s.Hub.Hello(openid)
		s.Hub.Attach(conn, openid)
	}
}
