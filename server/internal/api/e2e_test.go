package api_test

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"

	"yaotou/internal/api"
	"yaotou/internal/auth"
	"yaotou/internal/config"
	"yaotou/internal/game"
	"yaotou/internal/store"
)

type env struct {
	ts    *httptest.Server
	store *store.Store
}

func setup(t *testing.T) *env {
	t.Helper()
	cfg := &config.Config{
		TokenSecret:   "test-secret",
		TokenTTL:      time.Hour,
		AllowDevLogin: true,
		DatabaseURL:   "file:" + filepath.Join(t.TempDir(), "test.db"),
	}
	auth.Init(cfg)
	engine := game.NewEngine()
	hub := game.NewHub(engine)
	st, err := store.Open(cfg.DatabaseURL, engine)
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(st.Close)
	engine.OnChange(st.OnChange)

	srv := api.New(engine, hub, st, cfg)
	mux := http.NewServeMux()
	srv.Register(mux)
	mux.HandleFunc("/ws", srv.WSHandler())
	ts := httptest.NewServer(mux)
	t.Cleanup(ts.Close)
	return &env{ts: ts, store: st}
}

type envelope struct {
	Ok   bool            `json:"ok"`
	Data json.RawMessage `json:"data"`
	Code string          `json:"code"`
	Msg  string          `json:"msg"`
}

func (e *env) call(t *testing.T, method, path, token string, body any) (int, envelope) {
	t.Helper()
	var reader io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		reader = bytes.NewReader(b)
	}
	req, _ := http.NewRequest(method, e.ts.URL+path, reader)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("request %s %s: %v", method, path, err)
	}
	defer res.Body.Close()
	var env envelope
	_ = json.NewDecoder(res.Body).Decode(&env)
	return res.StatusCode, env
}

type user struct {
	token  string
	openid string
	seat   int
}

func (e *env) login(t *testing.T, name string) user {
	t.Helper()
	_, env := e.call(t, "POST", "/api/login", "", map[string]any{"platform": "dev", "code": "dev:" + name, "nickname": name})
	if !env.Ok {
		t.Fatalf("login %s failed: %s", name, env.Msg)
	}
	var d struct {
		Token  string `json:"token"`
		OpenID string `json:"openid"`
	}
	_ = json.Unmarshal(env.Data, &d)
	return user{token: d.Token, openid: d.OpenID}
}

type view struct {
	RoomID      string `json:"roomId"`
	Status      string `json:"status"`
	Round       int    `json:"round"`
	HostOpenID  string `json:"hostOpenid"`
	TurnSeat    int    `json:"turnSeat"`
	MySeat      int    `json:"mySeat"`
	MyDice      []int  `json:"myDice"`
	Bid         *struct {
		Quantity int `json:"quantity"`
		Face     int `json:"face"`
		Seat     int `json:"seat"`
	} `json:"bid"`
	Players []struct {
		OpenID    string `json:"openid"`
		Seat      int    `json:"seat"`
		Score     int    `json:"score"`
		NextReady bool   `json:"nextReady"`
		DiceCount int    `json:"diceCount"`
		Dice      []int  `json:"dice"`
	} `json:"players"`
	RoundResult *struct {
		Actual    int   `json:"actual"`
		BidTrue   bool  `json:"bidTrue"`
		WinnerSeat int  `json:"winnerSeat"`
		Deltas    []struct {
			Seat  int `json:"seat"`
			Delta int `json:"delta"`
		} `json:"deltas"`
	} `json:"roundResult"`
	MatchResult *struct {
		WinnerSeat int `json:"winnerSeat"`
	} `json:"matchResult"`
}

func parseView(t *testing.T, env envelope) view {
	t.Helper()
	var v view
	if err := json.Unmarshal(env.Data, &v); err != nil {
		t.Fatalf("parse view: %v", err)
	}
	return v
}

func TestFullGameFlow(t *testing.T) {
	e := setup(t)

	// 健康检查
	if _, env := e.call(t, "GET", "/api/health", "", nil); !env.Ok {
		t.Fatalf("health not ok: %s", env.Msg)
	}

	alice := e.login(t, "alice")
	bob := e.login(t, "bob")
	carol := e.login(t, "carol")

	// 未登录被拒
	if code, _ := e.call(t, "POST", "/api/room/create", "", map[string]any{"mode": "classic"}); code != 401 {
		t.Fatalf("want 401, got %d", code)
	}

	// 建房
	_, envCreate := e.call(t, "POST", "/api/room/create", alice.token, map[string]any{"mode": "classic"})
	room := parseView(t, envCreate)
	if room.RoomID == "" || room.HostOpenID != alice.openid || len(room.Players) != 1 {
		t.Fatalf("create room unexpected: %+v", room)
	}

	// 加入
	e.call(t, "POST", "/api/room/join", bob.token, map[string]any{"roomId": room.RoomID})
	_, envJoin := e.call(t, "POST", "/api/room/join", carol.token, map[string]any{"roomId": room.RoomID})
	if v := parseView(t, envJoin); len(v.Players) != 3 {
		t.Fatalf("want 3 players, got %d", len(v.Players))
	}
	if code, _ := e.call(t, "POST", "/api/room/join", bob.token, map[string]any{"roomId": "ZZZZZZ"}); code != 404 {
		t.Fatalf("bad room want 404, got %d", code)
	}

	// 全部准备 → 自动开局
	e.call(t, "POST", "/api/room/ready", alice.token, map[string]any{"roomId": room.RoomID, "ready": true})
	e.call(t, "POST", "/api/room/ready", bob.token, map[string]any{"roomId": room.RoomID, "ready": true})
	_, envReady := e.call(t, "POST", "/api/room/ready", carol.token, map[string]any{"roomId": room.RoomID, "ready": true})
	if parseView(t, envReady).Status != "playing" {
		t.Fatalf("want playing after all ready")
	}

	// WS 监听
	wsURL := "ws" + strings.TrimPrefix(e.ts.URL, "http") + "/ws?token=" + alice.token
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("ws dial: %v", err)
	}
	defer conn.Close()
	go func() {
		for {
			if _, _, err := conn.ReadMessage(); err != nil {
				return
			}
		}
	}()
	time.Sleep(100 * time.Millisecond)

	// 隐私：自己可见 5 颗，别人不可见
	for _, u := range []*user{&alice, &bob, &carol} {
		_, env := e.call(t, "GET", "/api/room/state?roomId="+room.RoomID, u.token, nil)
		v := parseView(t, env)
		u.seat = v.MySeat
		if len(v.MyDice) != 5 {
			t.Fatalf("%s should see 5 dice, got %d", u.openid, len(v.MyDice))
		}
		for _, p := range v.Players {
			if p.Seat != v.MySeat && p.Dice != nil {
				t.Fatalf("%s should not see others' dice", u.openid)
			}
		}
	}
	users := []user{alice, bob, carol}

	turnUser := func() user {
		_, env := e.call(t, "GET", "/api/room/state?roomId="+room.RoomID, alice.token, nil)
		v := parseView(t, env)
		for _, u := range users {
			if u.seat == v.TurnSeat {
				return u
			}
		}
		t.Fatalf("no user at turnSeat %d", v.TurnSeat)
		return user{}
	}

	first := turnUser()
	// 非法叫点
	if code, _ := e.call(t, "POST", "/api/game/bid", first.token, map[string]any{"roomId": room.RoomID, "quantity": 0, "face": 1}); code == 200 {
		t.Fatalf("invalid bid should fail")
	}
	// 合法首叫
	_, envBid := e.call(t, "POST", "/api/game/bid", first.token, map[string]any{"roomId": room.RoomID, "quantity": 2, "face": 3})
	if !envBid.Ok {
		t.Fatalf("first bid failed: %s", envBid.Msg)
	}
	// 非当前玩家（刚叫过点的 first 已经不是本回合）→ 拒绝
	if _, env := e.call(t, "POST", "/api/game/bid", first.token, map[string]any{"roomId": room.RoomID, "quantity": 3, "face": 1}); env.Code != "NOT_YOUR_TURN" {
		t.Fatalf("want NOT_YOUR_TURN, got %s", env.Code)
	}

	second := turnUser()
	// 同数量更小面值被拒
	if _, env := e.call(t, "POST", "/api/game/bid", second.token, map[string]any{"roomId": room.RoomID, "quantity": 2, "face": 1}); env.Ok {
		t.Fatalf("same qty smaller face should fail")
	}
	// 加叫
	if _, env := e.call(t, "POST", "/api/game/bid", second.token, map[string]any{"roomId": room.RoomID, "quantity": 2, "face": 5}); !env.Ok {
		t.Fatalf("raise failed: %s", env.Msg)
	}

	third := turnUser()
	_, envCh := e.call(t, "POST", "/api/game/challenge", third.token, map[string]any{"roomId": room.RoomID})
	v := parseView(t, envCh)
	if v.Status != "roundEnd" || v.RoundResult == nil {
		t.Fatalf("challenge should settle: %+v", v.Status)
	}
	if v.RoundResult.Actual < 0 {
		t.Fatalf("actual count invalid")
	}
	var winDelta, loseCount int
	for _, d := range v.RoundResult.Deltas {
		if d.Seat == v.RoundResult.WinnerSeat {
			winDelta = d.Delta
		} else {
			loseCount++
			if d.Delta != -10 {
				t.Fatalf("loser delta should be -10, got %d", d.Delta)
			}
		}
	}
	if winDelta != 20 {
		t.Fatalf("winner delta should be 20, got %d", winDelta)
	}
	if loseCount != 2 {
		t.Fatalf("want 2 losers, got %d", loseCount)
	}
	for _, p := range v.Players {
		if len(p.Dice) != 5 {
			t.Fatalf("all dice should be revealed at round end")
		}
	}

	// 下一轮：需要所有人点「下一轮/准备」才开局
	_, envOne := e.call(t, "POST", "/api/game/next", alice.token, map[string]any{"roomId": room.RoomID})
	if sv := parseView(t, envOne); sv.Status != "roundEnd" || sv.Round != 1 {
		t.Fatalf("one ready should not start next round: status=%s round=%d", sv.Status, sv.Round)
	}
	var aliceReady bool
	for _, p := range parseView(t, envOne).Players {
		if p.OpenID == alice.openid {
			aliceReady = p.NextReady
		}
	}
	if !aliceReady {
		t.Fatalf("alice should be marked next-ready")
	}
	e.call(t, "POST", "/api/game/next", bob.token, map[string]any{"roomId": room.RoomID})
	_, envNext := e.call(t, "POST", "/api/game/next", carol.token, map[string]any{"roomId": room.RoomID})
	if nv := parseView(t, envNext); nv.Status != "playing" || nv.Round != 2 {
		t.Fatalf("next round unexpected: status=%s round=%d", nv.Status, nv.Round)
	}

	// 排行榜（等异步落库）
	var gotTop bool
	for i := 0; i < 20; i++ {
		_, env := e.call(t, "GET", "/api/rank?mode=classic", "", nil)
		var rows []map[string]any
		_ = json.Unmarshal(env.Data, &rows)
		if len(rows) >= 1 {
			gotTop = true
			break
		}
		time.Sleep(50 * time.Millisecond)
	}
	if !gotTop {
		t.Fatalf("rank should have entries")
	}
}

func TestQuickMatchAndDiceCount(t *testing.T) {
	e := setup(t)
	_, envMods := e.call(t, "GET", "/api/modes", "", nil)
	var modes []map[string]any
	_ = json.Unmarshal(envMods.Data, &modes)
	if len(modes) != 1 {
		t.Fatalf("want 1 mode, got %d", len(modes))
	}

	a := e.login(t, "qa")
	b := e.login(t, "qb")
	// 指定每人 3 颗骰子，快速匹配应进同一房间
	_, envA := e.call(t, "POST", "/api/room/quick", a.token, map[string]any{"dicePerPlayer": 3})
	va := parseView(t, envA)
	if va.RoomID == "" {
		t.Fatalf("quick create failed")
	}
	_, envB := e.call(t, "POST", "/api/room/quick", b.token, map[string]any{"dicePerPlayer": 3})
	vb := parseView(t, envB)
	if vb.RoomID != va.RoomID {
		t.Fatalf("quick match should join same room: %s vs %s", va.RoomID, vb.RoomID)
	}
	e.call(t, "POST", "/api/room/ready", a.token, map[string]any{"roomId": va.RoomID, "ready": true})
	_, envReady := e.call(t, "POST", "/api/room/ready", b.token, map[string]any{"roomId": va.RoomID, "ready": true})
	vr := parseView(t, envReady)
	if vr.Status != "playing" {
		t.Fatalf("room should start, status=%s", vr.Status)
	}
	if len(vr.MyDice) != 3 {
		t.Fatalf("should deal 3 dice, got %d", len(vr.MyDice))
	}
}

func TestCreateRoomDiceClamp(t *testing.T) {
	e := setup(t)
	a := e.login(t, "clamp")
	_, env := e.call(t, "POST", "/api/room/create", a.token, map[string]any{"dicePerPlayer": 99})
	va := parseView(t, env)
	if len(va.MyDice) != 0 {
		t.Fatalf("waiting room should not deal dice yet")
	}
	// 上限 8：用 ready 开局后核对骰子数
	b := e.login(t, "clamp2")
	e.call(t, "POST", "/api/room/join", b.token, map[string]any{"roomId": va.RoomID})
	e.call(t, "POST", "/api/room/ready", a.token, map[string]any{"roomId": va.RoomID, "ready": true})
	_, envR := e.call(t, "POST", "/api/room/ready", b.token, map[string]any{"roomId": va.RoomID, "ready": true})
	v := parseView(t, envR)
	if len(v.MyDice) != 8 {
		t.Fatalf("dice should clamp to 8, got %d", len(v.MyDice))
	}
}
