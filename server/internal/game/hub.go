package game

import (
	"encoding/json"
	"log"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

// Hub WebSocket 推送中心：按 openid 维护连接，房间变化时下发个性化视图。
type Hub struct {
	engine  *Engine
	mu      sync.Mutex
	clients map[string]map[*client]struct{}
}

type client struct {
	conn   *websocket.Conn
	openid string
	send   chan []byte
}

// NewHub 创建推送中心。
func NewHub(engine *Engine) *Hub {
	h := &Hub{engine: engine, clients: make(map[string]map[*client]struct{})}
	engine.OnChange(h.onRoomChange)
	return h
}

// OnlineCount 在线连接用户数。
func (h *Hub) OnlineCount() int {
	h.mu.Lock()
	defer h.mu.Unlock()
	return len(h.clients)
}

// Attach 接管一条已鉴权的连接。
func (h *Hub) Attach(conn *websocket.Conn, openid string) {
	c := &client{conn: conn, openid: openid, send: make(chan []byte, 64)}
	h.mu.Lock()
	if h.clients[openid] == nil {
		h.clients[openid] = make(map[*client]struct{})
	}
	h.clients[openid][c] = struct{}{}
	h.mu.Unlock()

	go h.writePump(c)
	h.readPump(c)

	h.mu.Lock()
	if set := h.clients[openid]; set != nil {
		delete(set, c)
		if len(set) == 0 {
			delete(h.clients, openid)
		}
	}
	h.mu.Unlock()
	h.engine.MarkConnected(openid, false)
}

func (h *Hub) writePump(c *client) {
	ticker := time.NewTicker(30 * time.Second)
	defer func() {
		ticker.Stop()
		_ = c.conn.Close()
	}()
	for {
		select {
		case msg, ok := <-c.send:
			if !ok {
				return
			}
			_ = c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				return
			}
		case <-ticker.C:
			_ = c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func (h *Hub) readPump(c *client) {
	defer func() {
		h.mu.Lock()
		if set := h.clients[c.openid]; set != nil {
			delete(set, c)
			if len(set) == 0 {
				delete(h.clients, c.openid)
			}
		}
		h.mu.Unlock()
		close(c.send)
	}()
	c.conn.SetReadLimit(8 * 1024)
	_ = c.conn.SetReadDeadline(time.Now().Add(90 * time.Second))
	c.conn.SetPongHandler(func(string) error {
		return c.conn.SetReadDeadline(time.Now().Add(90 * time.Second))
	})
	for {
		_, data, err := c.conn.ReadMessage()
		if err != nil {
			return
		}
		_ = c.conn.SetReadDeadline(time.Now().Add(90 * time.Second))
		h.onMessage(c, data)
	}
}

func (h *Hub) onMessage(c *client, raw []byte) {
	var msg struct {
		Type string `json:"type"`
		Text string `json:"text"`
	}
	if err := json.Unmarshal(raw, &msg); err != nil {
		return
	}
	switch msg.Type {
	case "ping":
		h.sendRaw(c, mustJSON(map[string]any{"type": "pong"}))
	case "chat":
		text := msg.Text
		if len([]rune(text)) > 80 {
			text = string([]rune(text)[:80])
		}
		if text == "" {
			return
		}
		roomID, ok := h.engine.RoomOf(c.openid)
		if !ok {
			return
		}
		view, err := h.engine.View(roomID, c.openid)
		if err != nil {
			return
		}
		seat, nick := -1, "玩家"
		for _, p := range view.Players {
			if p.OpenID == c.openid {
				seat, nick = p.Seat, p.Nickname
			}
		}
		h.Broadcast(roomID, map[string]any{
			"type": "chat",
			"data": map[string]any{"seat": seat, "openid": c.openid, "nickname": nick, "text": text, "at": time.Now().UnixMilli()},
		})
	}
}

// onRoomChange 引擎变更 → 向每位玩家下发个性化视图。
func (h *Hub) onRoomChange(roomID string, ev Event) {
	snap, ok := h.engine.Snapshot(roomID)
	if !ok {
		return
	}
	for _, p := range snap.Players {
		if p.Left {
			continue
		}
		view, err := h.engine.View(roomID, p.OpenID)
		if err != nil {
			continue
		}
		h.SendTo(p.OpenID, map[string]any{"type": "room_state", "data": view})
	}
	switch ev.Type {
	case EvRoundEnd:
		if snap.RoundResult != nil {
			h.Broadcast(roomID, map[string]any{"type": "round_end", "data": snap.RoundResult})
		}
	case EvMatchEnd:
		if snap.MatchResult != nil {
			h.Broadcast(roomID, map[string]any{"type": "match_end", "data": snap.MatchResult})
		}
	}
}

// Broadcast 向房间内所有玩家推送。
func (h *Hub) Broadcast(roomID string, message any) {
	snap, ok := h.engine.Snapshot(roomID)
	if !ok {
		return
	}
	for _, p := range snap.Players {
		h.SendTo(p.OpenID, message)
	}
}

// SendTo 向某个 openid 的所有连接推送。
func (h *Hub) SendTo(openid string, message any) {
	data := mustJSON(message)
	h.mu.Lock()
	set := h.clients[openid]
	targets := make([]*client, 0, len(set))
	for c := range set {
		targets = append(targets, c)
	}
	h.mu.Unlock()
	for _, c := range targets {
		h.sendRaw(c, data)
	}
}

func (h *Hub) sendRaw(c *client, data []byte) {
	defer func() { _ = recover() }()
	select {
	case c.send <- data:
	default:
		log.Printf("[hub] %s 发送缓冲已满，丢弃一条消息", c.openid)
	}
}

// Hello 连接建立时的欢迎帧。
func (h *Hub) Hello(openid string) {
	h.SendTo(openid, map[string]any{"type": "hello", "openid": openid, "time": time.Now().UnixMilli()})
	if roomID, ok := h.engine.RoomOf(openid); ok {
		h.engine.MarkConnected(openid, true)
		if view, err := h.engine.View(roomID, openid); err == nil {
			h.SendTo(openid, map[string]any{"type": "room_state", "data": view})
		}
	}
}

func mustJSON(v any) []byte {
	data, err := json.Marshal(v)
	if err != nil {
		return []byte(`{"type":"error"}`)
	}
	return data
}
