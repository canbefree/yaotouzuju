package game

import (
	"encoding/json"
	"math/rand"
	"strings"
	"sync"
	"time"
)

// Error 业务错误（带 HTTP 状态码）。
type Error struct {
	Code   string
	Msg    string
	Status int
}

func (e *Error) Error() string { return e.Msg }

func newErr(code, msg string, status int) *Error { return &Error{Code: code, Msg: msg, Status: status} }

// EventType 引擎变更事件类型。
type EventType string

const (
	EvRoom     EventType = "room"
	EvJoin     EventType = "player_join"
	EvLeave    EventType = "player_leave"
	EvStart    EventType = "start"
	EvRoundEnd EventType = "round_end"
	EvMatchEnd EventType = "match_end"
)

// Event 变更事件。
type Event struct {
	Type   EventType
	RoomID string
}

// UserInfo 加入房间所需的最小用户信息。
type UserInfo struct {
	OpenID   string
	Nickname string
	Avatar   string
}

// Listener 房间变更回调（roomID 而非房间指针，避免数据竞争）。
type Listener func(roomID string, ev Event)

// Engine 房间与对局引擎。
type Engine struct {
	mu        sync.Mutex
	rooms     map[string]*Room
	listeners []Listener
}

// NewEngine 创建引擎。
func NewEngine() *Engine {
	return &Engine{rooms: make(map[string]*Room)}
}

// OnChange 注册变更回调。回调在锁外触发。
func (e *Engine) OnChange(fn Listener) { e.listeners = append(e.listeners, fn) }

func (e *Engine) emit(roomID string, ev Event) {
	for _, fn := range e.listeners {
		fn(roomID, ev)
	}
}

func nowMs() int64 { return time.Now().UnixMilli() }

const codeAlphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"

func (e *Engine) makeRoomIDLocked() string {
	for attempt := 0; attempt < 50; attempt++ {
		var b strings.Builder
		for i := 0; i < 6; i++ {
			b.WriteByte(codeAlphabet[rand.Intn(len(codeAlphabet))])
		}
		id := b.String()
		if _, exists := e.rooms[id]; !exists {
			return id
		}
	}
	return "R" + strings.ToUpper(time.Now().Format("150405"))
}

// Restore 用快照恢复房间（崩溃重启）。
func (e *Engine) Restore(r *Room) {
	e.mu.Lock()
	defer e.mu.Unlock()
	if r.Players == nil {
		r.Players = []*Player{}
	}
	if r.BidHistory == nil {
		r.BidHistory = []Bid{}
	}
	r.DicePerPlayer = ClampDice(r.DicePerPlayer)
	e.rooms[r.RoomID] = r
}

// ---------------------------------------------------------------- 房间操作

// Create 建房并把房主加入。dicePerPlayer 为每人骰子数（0 取默认 5）。
func (e *Engine) Create(mode ModeID, dicePerPlayer int, u UserInfo) (string, error) {
	if !IsMode(string(mode)) {
		mode = ModeClassic
	}
	cfg := GetMode(mode)
	e.mu.Lock()
	id := e.makeRoomIDLocked()
	room := &Room{
		RoomID: id, Mode: mode, DicePerPlayer: ClampDice(dicePerPlayer),
		HostOpenID: u.OpenID, Status: StatusWaiting,
		TargetScore: cfg.TargetScore, Players: []*Player{}, TurnSeat: -1,
		BidHistory: []Bid{}, CreatedAt: nowMs(), UpdatedAt: nowMs(),
	}
	e.rooms[id] = room
	if err := e.addPlayerLocked(room, u); err != nil {
		delete(e.rooms, id)
		e.mu.Unlock()
		return "", err
	}
	e.mu.Unlock()
	e.emit(id, Event{Type: EvRoom, RoomID: id})
	return id, nil
}

// Join 加入房间。
func (e *Engine) Join(roomID string, u UserInfo) (string, error) {
	e.mu.Lock()
	room, ok := e.rooms[roomID]
	if !ok {
		e.mu.Unlock()
		return "", newErr("ROOM_NOT_FOUND", "房间不存在或已解散", 404)
	}
	if room.Status != StatusWaiting && e.findActiveLocked(room, u.OpenID) == nil {
		e.mu.Unlock()
		return "", newErr("ROOM_PLAYING", "对局进行中，无法加入", 409)
	}
	if err := e.addPlayerLocked(room, u); err != nil {
		e.mu.Unlock()
		return "", err
	}
	e.mu.Unlock()
	e.emit(roomID, Event{Type: EvJoin, RoomID: roomID})
	return roomID, nil
}

// QuickMatch 快速匹配：优先加入等待中的房间，否则按给定骰子数新建。
func (e *Engine) QuickMatch(u UserInfo, dicePerPlayer int) (string, error) {
	e.mu.Lock()
	for _, room := range e.rooms {
		if room.Status != StatusWaiting {
			continue
		}
		if e.findActiveLocked(room, u.OpenID) == nil {
			active := e.activeCountLocked(room)
			if active >= GetMode(room.Mode).MaxPlayers {
				continue
			}
		}
		if err := e.addPlayerLocked(room, u); err != nil {
			continue
		}
		id := room.RoomID
		e.mu.Unlock()
		e.emit(id, Event{Type: EvJoin, RoomID: id})
		return id, nil
	}
	e.mu.Unlock()
	return e.Create(ModeClassic, dicePerPlayer, u)
}

// SetReady 设置准备状态；满员且全部准备则自动开局。
func (e *Engine) SetReady(roomID, openid string, ready bool) (string, error) {
	e.mu.Lock()
	room, ok := e.rooms[roomID]
	if !ok {
		e.mu.Unlock()
		return "", newErr("ROOM_NOT_FOUND", "房间不存在或已解散", 404)
	}
	p := e.findActiveLocked(room, openid)
	if p == nil {
		e.mu.Unlock()
		return "", newErr("NOT_IN_ROOM", "你不在这个房间里", 400)
	}
	p.Ready = ready
	if room.Status == StatusWaiting {
		e.maybeAutoStartLocked(room)
	}
	e.mu.Unlock()
	e.emit(roomID, Event{Type: EvRoom, RoomID: roomID})
	return roomID, nil
}

// Start 房主开始对局。
func (e *Engine) Start(roomID, openid string) (string, error) {
	e.mu.Lock()
	room, ok := e.rooms[roomID]
	if !ok {
		e.mu.Unlock()
		return "", newErr("ROOM_NOT_FOUND", "房间不存在或已解散", 404)
	}
	if room.HostOpenID != openid {
		e.mu.Unlock()
		return "", newErr("NOT_HOST", "只有房主可以开始", 403)
	}
	if room.Status != StatusWaiting {
		e.mu.Unlock()
		return "", newErr("BAD_STATUS", "当前状态不能开始", 400)
	}
	cfg := GetMode(room.Mode)
	if e.activeCountLocked(room) < cfg.MinPlayers {
		e.mu.Unlock()
		return "", newErr("NOT_ENOUGH", "人数不足，至少需要 2 人", 400)
	}
	e.beginMatchLocked(room)
	e.mu.Unlock()
	e.emit(roomID, Event{Type: EvStart, RoomID: roomID})
	return roomID, nil
}

// Bid 叫点。kind 为 BidKindPoint（默认）或 BidKindPillar（柱，face 忽略）。
func (e *Engine) Bid(roomID, openid string, kind BidKind, quantity, face int) (string, error) {
	e.mu.Lock()
	room, ok := e.rooms[roomID]
	if !ok {
		e.mu.Unlock()
		return "", newErr("ROOM_NOT_FOUND", "房间不存在或已解散", 404)
	}
	if room.Status != StatusPlaying {
		e.mu.Unlock()
		return "", newErr("BAD_STATUS", "当前不是叫点阶段", 400)
	}
	p := e.findActiveLocked(room, openid)
	if p == nil {
		e.mu.Unlock()
		return "", newErr("NOT_IN_ROOM", "你不在这个房间里", 400)
	}
	if room.TurnSeat != p.Seat {
		e.mu.Unlock()
		return "", newErr("NOT_YOUR_TURN", "还没轮到你", 400)
	}
	if kind != BidKindPillar {
		kind = BidKindPoint
	}
	if !IsValidRaise(room.Bid, kind, quantity, face, e.activeCountLocked(room)) {
		e.mu.Unlock()
		if kind == BidKindPillar {
			return "", newErr("BAD_BID", "柱必须比上家大（普通叫点后可从“数量-1”柱起，柱后只能继续加柱）", 400)
		}
		return "", newErr("BAD_BID", "叫点必须比上家大（数量更多，或同数量点数更大）", 400)
	}
	bid := &Bid{Seat: p.Seat, Kind: kind, Quantity: quantity, At: nowMs()}
	if kind == BidKindPoint {
		bid.Face = face
	}
	room.Bid = bid
	room.BidHistory = append(room.BidHistory, *room.Bid)
	e.nextTurnLocked(room, p.Seat)
	e.mu.Unlock()
	e.emit(roomID, Event{Type: EvRoom, RoomID: roomID})
	return roomID, nil
}

// Challenge 开（质疑）上家。
func (e *Engine) Challenge(roomID, openid string) (string, error) {
	e.mu.Lock()
	room, ok := e.rooms[roomID]
	if !ok {
		e.mu.Unlock()
		return "", newErr("ROOM_NOT_FOUND", "房间不存在或已解散", 404)
	}
	if room.Status != StatusPlaying {
		e.mu.Unlock()
		return "", newErr("BAD_STATUS", "当前不是叫点阶段", 400)
	}
	p := e.findActiveLocked(room, openid)
	if p == nil {
		e.mu.Unlock()
		return "", newErr("NOT_IN_ROOM", "你不在这个房间里", 400)
	}
	if room.TurnSeat != p.Seat {
		e.mu.Unlock()
		return "", newErr("NOT_YOUR_TURN", "还没轮到你", 400)
	}
	if room.Bid == nil {
		e.mu.Unlock()
		return "", newErr("NO_BID", "还没有人叫点，不能开", 400)
	}
	ev := e.settleLocked(room, room.Bid.Seat, p.Seat)
	e.mu.Unlock()
	e.emit(roomID, ev)
	return roomID, nil
}

// Next roundEnd → 下一轮；finished → 开新的一局。
func (e *Engine) Next(roomID, openid string) (string, error) {
	e.mu.Lock()
	room, ok := e.rooms[roomID]
	if !ok {
		e.mu.Unlock()
		return "", newErr("ROOM_NOT_FOUND", "房间不存在或已解散", 404)
	}
	if e.findActiveLocked(room, openid) == nil {
		e.mu.Unlock()
		return "", newErr("NOT_IN_ROOM", "你不在这个房间里", 400)
	}
	switch room.Status {
	case StatusFinish:
		e.beginMatchLocked(room)
	case StatusRound:
		e.startRoundLocked(room)
	default:
		e.mu.Unlock()
		return "", newErr("BAD_STATUS", "当前不能开下一轮", 400)
	}
	e.mu.Unlock()
	e.emit(roomID, Event{Type: EvRoom, RoomID: roomID})
	return roomID, nil
}

// Leave 离开房间；返回是否已解散。
func (e *Engine) Leave(roomID, openid string) (deleted bool, err error) {
	e.mu.Lock()
	room, ok := e.rooms[roomID]
	if !ok {
		e.mu.Unlock()
		return true, nil
	}
	p := e.findActiveLocked(room, openid)
	if p != nil {
		if room.Status == StatusPlaying {
			p.Left = true
			p.Dice = nil
			p.Connected = false
			if room.TurnSeat == p.Seat {
				e.nextTurnLocked(room, p.Seat)
			}
			if e.activeCountLocked(room) < 2 {
				room.Status = StatusWaiting
				room.Round = 0
				room.Bid = nil
				room.RoundResult = nil
				for _, q := range room.Players {
					if !q.Left {
						q.Score = 0
						q.Dice = nil
					}
				}
			}
		} else {
			filtered := room.Players[:0]
			for _, x := range room.Players {
				if x.OpenID != openid {
					filtered = append(filtered, x)
				}
			}
			room.Players = filtered
		}
	}
	remaining := 0
	for _, x := range room.Players {
		if !x.Left {
			remaining++
		}
	}
	if remaining == 0 {
		delete(e.rooms, roomID)
		e.mu.Unlock()
		return true, nil
	}
	if room.HostOpenID == openid {
		for _, x := range room.Players {
			if !x.Left {
				room.HostOpenID = x.OpenID
				break
			}
		}
	}
	e.mu.Unlock()
	e.emit(roomID, Event{Type: EvLeave, RoomID: roomID})
	return false, nil
}

// MarkConnected 标记某用户在各房间的在线状态，返回受影响的房间号。
func (e *Engine) MarkConnected(openid string, connected bool) []string {
	e.mu.Lock()
	var ids []string
	for _, room := range e.rooms {
		for _, p := range room.Players {
			if p.OpenID == openid && !p.Left {
				if p.Connected != connected {
					p.Connected = connected
					ids = append(ids, room.RoomID)
				}
			}
		}
	}
	e.mu.Unlock()
	return ids
}

// ---------------------------------------------------------------- 内部（需持锁）

func (e *Engine) findActiveLocked(room *Room, openid string) *Player {
	for _, p := range room.Players {
		if p.OpenID == openid && !p.Left {
			return p
		}
	}
	return nil
}

func (e *Engine) activeCountLocked(room *Room) int {
	n := 0
	for _, p := range room.Players {
		if !p.Left {
			n++
		}
	}
	return n
}

func (e *Engine) addPlayerLocked(room *Room, u UserInfo) error {
	if existing := e.findActiveLocked(room, u.OpenID); existing != nil {
		existing.Connected = true
		if u.Nickname != "" {
			existing.Nickname = u.Nickname
		}
		if u.Avatar != "" {
			existing.Avatar = u.Avatar
		}
		return nil
	}
	// 复用已离开的座位
	for _, p := range room.Players {
		if p.OpenID == u.OpenID && p.Left {
			p.Left = false
			p.Connected = true
			p.Ready = false
			if u.Nickname != "" {
				p.Nickname = u.Nickname
			}
			if u.Avatar != "" {
				p.Avatar = u.Avatar
			}
			return nil
		}
	}
	cfg := GetMode(room.Mode)
	used := map[int]bool{}
	for _, p := range room.Players {
		if !p.Left {
			used[p.Seat] = true
		}
	}
	seat := 0
	for used[seat] {
		seat++
	}
	if seat >= cfg.MaxPlayers {
		return newErr("ROOM_FULL", "房间已满", 409)
	}
	nick := u.Nickname
	if nick == "" {
		nick = "玩家"
	}
	room.Players = append(room.Players, &Player{
		OpenID: u.OpenID, Nickname: nick, Avatar: u.Avatar, Seat: seat, Connected: true,
	})
	e.sortPlayersLocked(room)
	return nil
}

func (e *Engine) sortPlayersLocked(room *Room) {
	for i := 1; i < len(room.Players); i++ {
		for j := i; j > 0 && room.Players[j-1].Seat > room.Players[j].Seat; j-- {
			room.Players[j-1], room.Players[j] = room.Players[j], room.Players[j-1]
		}
	}
}

func (e *Engine) maybeAutoStartLocked(room *Room) {
	cfg := GetMode(room.Mode)
	active := 0
	allReady := true
	for _, p := range room.Players {
		if p.Left {
			continue
		}
		active++
		if !p.Ready {
			allReady = false
		}
	}
	if active >= cfg.MinPlayers && allReady {
		e.beginMatchLocked(room)
	}
}

func (e *Engine) beginMatchLocked(room *Room) {
	for _, p := range room.Players {
		p.Score = 0
		p.Ready = false
		p.Left = false
	}
	room.Round = 0
	room.MatchResult = nil
	room.RoundResult = nil
	room.BidHistory = []Bid{}
	e.startRoundLocked(room)
}

func (e *Engine) startRoundLocked(room *Room) {
	room.Round++
	room.Status = StatusPlaying
	room.Bid = nil
	room.BidHistory = []Bid{}
	room.RoundResult = nil
	for _, p := range room.Players {
		if p.Left {
			p.Dice = nil
			continue
		}
		p.Dice = RollDice(ClampDice(room.DicePerPlayer))
	}
	seats := e.activeSeatsLocked(room)
	if len(seats) > 0 {
		room.TurnSeat = seats[(room.Round-1)%len(seats)]
	}
}

func (e *Engine) activeSeatsLocked(room *Room) []int {
	seats := []int{}
	for _, p := range room.Players {
		if !p.Left {
			seats = append(seats, p.Seat)
		}
	}
	for i := 1; i < len(seats); i++ {
		for j := i; j > 0 && seats[j-1] > seats[j]; j-- {
			seats[j-1], seats[j] = seats[j], seats[j-1]
		}
	}
	return seats
}

func (e *Engine) nextTurnLocked(room *Room, from int) {
	seats := e.activeSeatsLocked(room)
	if len(seats) == 0 {
		room.TurnSeat = -1
		return
	}
	idx := -1
	for i, s := range seats {
		if s == from {
			idx = i
			break
		}
	}
	room.TurnSeat = seats[(idx+1)%len(seats)]
}

func (e *Engine) settleLocked(room *Room, bidderSeat, challengerSeat int) Event {
	bid := *room.Bid
	active := []*Player{}
	for _, p := range room.Players {
		if !p.Left {
			active = append(active, p)
		}
	}
	allDice := make([][]int, 0, len(active))
	for _, p := range active {
		allDice = append(allDice, p.Dice)
	}
	pillarFace := bid.Face
	actual := CountFace(allDice, bid.Face)
	if KindOf(bid) == BidKindPillar {
		pillarFace, actual = MaxFaceCount(allDice)
	}
	bidTrue := actual >= bid.Quantity
	winnerSeat := challengerSeat
	loserSeat := bidderSeat
	if bidTrue {
		winnerSeat = bidderSeat
		loserSeat = challengerSeat
	}

	deltas := make([]Delta, 0, len(active))
	reveal := make([]Reveal, 0, len(active))
	for _, p := range active {
		delta := ScoreLose
		if p.Seat == winnerSeat {
			delta = ScoreWin
		}
		p.Score += delta
		deltas = append(deltas, Delta{Seat: p.Seat, Delta: delta, Score: p.Score})
		reveal = append(reveal, Reveal{Seat: p.Seat, OpenID: p.OpenID, Nickname: p.Nickname, Dice: append([]int{}, p.Dice...)})
	}
	room.RoundResult = &RoundResult{
		Round: room.Round, BidderSeat: bidderSeat, ChallengerSeat: challengerSeat, Bid: bid,
		Actual: actual, BidTrue: bidTrue, PillarFace: pillarFace, WinnerSeat: winnerSeat, LoserSeat: loserSeat,
		Deltas: deltas, Reveal: reveal,
	}
	room.Status = StatusRound

	for _, p := range active {
		if p.Score >= room.TargetScore {
			ranking := make([]RankingRow, 0, len(active))
			sorted := append([]*Player{}, active...)
			for i := 1; i < len(sorted); i++ {
				for j := i; j > 0 && (sorted[j-1].Score < sorted[j].Score || (sorted[j-1].Score == sorted[j].Score && sorted[j-1].Seat > sorted[j].Seat)); j-- {
					sorted[j-1], sorted[j] = sorted[j], sorted[j-1]
				}
			}
			for _, q := range sorted {
				ranking = append(ranking, RankingRow{Seat: q.Seat, OpenID: q.OpenID, Nickname: q.Nickname, Avatar: q.Avatar, Score: q.Score})
			}
			room.MatchResult = &MatchResult{WinnerSeat: sorted[0].Seat, Rounds: room.Round, Ranking: ranking}
			room.Status = StatusFinish
			return Event{Type: EvMatchEnd, RoomID: room.RoomID}
		}
	}

	seats := e.activeSeatsLocked(room)
	room.TurnSeat = seats[room.Round%len(seats)]
	return Event{Type: EvRoundEnd, RoomID: room.RoomID}
}

// ---------------------------------------------------------------- 只读查询

// View 生成面向单个玩家的隐私视图。
func (e *Engine) View(roomID, openid string) (*View, error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	room, ok := e.rooms[roomID]
	if !ok {
		return nil, newErr("ROOM_NOT_FOUND", "房间不存在或已解散", 404)
	}
	return e.viewLocked(room, openid), nil
}

func (e *Engine) viewLocked(room *Room, openid string) *View {
	cfg := GetMode(room.Mode)
	reveal := room.Status == StatusRound || room.Status == StatusFinish
	mySeat := -1
	var myDice []int
	for _, p := range room.Players {
		if p.OpenID == openid {
			mySeat = p.Seat
			myDice = append([]int{}, p.Dice...)
		}
	}
	players := make([]ViewPlayer, 0, len(room.Players))
	for _, p := range room.Players {
		diceCount := len(p.Dice)
		if p.Left {
			diceCount = 0
		} else if diceCount == 0 {
			diceCount = ClampDice(room.DicePerPlayer)
		}
		var dice []int
		if reveal && !p.Left {
			dice = append([]int{}, p.Dice...)
		}
		players = append(players, ViewPlayer{
			OpenID: p.OpenID, Nickname: p.Nickname, Avatar: p.Avatar, Seat: p.Seat,
			Score: p.Score, Ready: p.Ready, Connected: p.Connected, Left: p.Left,
			DiceCount: diceCount, Dice: dice,
		})
	}
	return &View{
		RoomID: room.RoomID, Mode: room.Mode, ModeName: cfg.Name, DicePerPlayer: ClampDice(room.DicePerPlayer),
		MaxPlayers: cfg.MaxPlayers, HostOpenID: room.HostOpenID,
		Status: room.Status, Round: room.Round, TargetScore: room.TargetScore, TurnSeat: room.TurnSeat,
		Bid: room.Bid, MySeat: mySeat, MyDice: myDice, Players: players,
		RoundResult: room.RoundResult, MatchResult: room.MatchResult,
		CreatedAt: room.CreatedAt, UpdatedAt: room.UpdatedAt,
	}
}

// Snapshot 返回房间深拷贝（持久化用）。
func (e *Engine) Snapshot(roomID string) (*Room, bool) {
	e.mu.Lock()
	defer e.mu.Unlock()
	room, ok := e.rooms[roomID]
	if !ok {
		return nil, false
	}
	return deepCopyRoom(room), true
}

// PublicRooms 大厅房间列表。
func (e *Engine) PublicRooms() []PublicRoom {
	e.mu.Lock()
	defer e.mu.Unlock()
	out := []PublicRoom{}
	for _, room := range e.rooms {
		if room.Status != StatusWaiting {
			continue
		}
		cfg := GetMode(room.Mode)
		out = append(out, PublicRoom{
			RoomID: room.RoomID, Mode: room.Mode, ModeName: cfg.Name, DicePerPlayer: ClampDice(room.DicePerPlayer),
			Count: e.activeCountLocked(room), MaxPlayers: cfg.MaxPlayers, Status: room.Status,
		})
	}
	sortPublicRooms(out)
	return out
}

// RoomOf 返回某用户当前所在房间号。
func (e *Engine) RoomOf(openid string) (string, bool) {
	e.mu.Lock()
	defer e.mu.Unlock()
	for id, room := range e.rooms {
		if e.findActiveLocked(room, openid) != nil {
			return id, true
		}
	}
	return "", false
}

// RoomIDs 所有房间号。
func (e *Engine) RoomIDs() []string {
	e.mu.Lock()
	defer e.mu.Unlock()
	ids := make([]string, 0, len(e.rooms))
	for id := range e.rooms {
		ids = append(ids, id)
	}
	return ids
}

// Count 房间数。
func (e *Engine) Count() int {
	e.mu.Lock()
	defer e.mu.Unlock()
	return len(e.rooms)
}

func deepCopyRoom(room *Room) *Room {
	data, err := json.Marshal(room)
	if err != nil {
		return room
	}
	var cp Room
	if err := json.Unmarshal(data, &cp); err != nil {
		return room
	}
	return &cp
}

func sortPublicRooms(rooms []PublicRoom) {
	for i := 1; i < len(rooms); i++ {
		for j := i; j > 0 && rooms[j-1].RoomID > rooms[j].RoomID; j-- {
			rooms[j-1], rooms[j] = rooms[j], rooms[j-1]
		}
	}
}
