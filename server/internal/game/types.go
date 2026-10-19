// Package game 实现「吹牛骰 / 大话骰」的领域模型与权威状态引擎。
package game

// ModeID 玩法标识。
type ModeID string

const (
	// ModeClassic 唯一的玩法「吹牛骰」，每人骰子数量可调。
	ModeClassic ModeID = "classic"
)

// ModeConfig 玩法配置。
type ModeConfig struct {
	ID            ModeID `json:"id"`
	Name          string `json:"name"`
	Desc          string `json:"desc"`
	DicePerPlayer int    `json:"dicePerPlayer"`
	MinDice       int    `json:"minDicePerPlayer"`
	MaxDice       int    `json:"maxDicePerPlayer"`
	TargetScore   int    `json:"targetScore"`
	MinPlayers    int    `json:"minPlayers"`
	MaxPlayers    int    `json:"maxPlayers"`
}

// RoomStatus 房间阶段。
type RoomStatus string

const (
	StatusWaiting RoomStatus = "waiting"
	StatusPlaying RoomStatus = "playing"
	StatusRound   RoomStatus = "roundEnd"
	StatusFinish  RoomStatus = "finished"
)

// Player 房间内的一位玩家。Dice 仅服务端可见。
type Player struct {
	OpenID    string `json:"openid"`
	Nickname  string `json:"nickname"`
	Avatar    string `json:"avatar"`
	Seat      int    `json:"seat"`
	Score     int    `json:"score"`
	Ready     bool   `json:"ready"`
	Connected bool   `json:"connected"`
	Left      bool   `json:"left"`
	Dice      []int  `json:"dice"`
}

// BidKind 叫点类型。
type BidKind string

const (
	// BidKindPoint 普通叫点「N 个 X」：全场至少 N 颗点数 X。
	BidKindPoint BidKind = "point"
	// BidKindPillar 叫柱「N 柱」：全场至少 N 颗同点（不限点数），即“豹子型”。
	BidKindPillar BidKind = "pillar"
)

// Bid 一次叫点。柱时 Face 为 0（无点数）。
type Bid struct {
	Seat     int     `json:"seat"`
	Kind     BidKind `json:"kind"`
	Quantity int     `json:"quantity"`
	Face     int     `json:"face"`
	At       int64   `json:"at"`
}

// Delta 单轮结算里某位玩家的分数变化。
type Delta struct {
	Seat  int `json:"seat"`
	Delta int `json:"delta"`
	Score int `json:"score"`
}

// Reveal 结算时亮出的某位玩家的骰子。
type Reveal struct {
	Seat     int    `json:"seat"`
	OpenID   string `json:"openid"`
	Nickname string `json:"nickname"`
	Dice     []int  `json:"dice"`
}

// RoundResult 单轮结算结果。
type RoundResult struct {
	Round          int      `json:"round"`
	BidderSeat     int      `json:"bidderSeat"`
	ChallengerSeat int      `json:"challengerSeat"`
	Bid            Bid      `json:"bid"`
	Actual         int      `json:"actual"`
	BidTrue        bool     `json:"bidTrue"`
	// PillarFace 柱结算时出现次数最多的点数（普通叫点时等于叫的点数）。
	PillarFace int      `json:"pillarFace"`
	WinnerSeat int      `json:"winnerSeat"`
	LoserSeat  int      `json:"loserSeat"`
	Deltas     []Delta  `json:"deltas"`
	Reveal     []Reveal `json:"reveal"`
}

// RankingRow 一局结束的名次行。
type RankingRow struct {
	Seat     int    `json:"seat"`
	OpenID   string `json:"openid"`
	Nickname string `json:"nickname"`
	Avatar   string `json:"avatar"`
	Score    int    `json:"score"`
}

// MatchResult 整局结果。
type MatchResult struct {
	WinnerSeat int          `json:"winnerSeat"`
	Rounds     int          `json:"rounds"`
	Ranking    []RankingRow `json:"ranking"`
}

// Room 房间完整状态（服务端权威）。
type Room struct {
	RoomID        string     `json:"roomId"`
	Mode          ModeID     `json:"mode"`
	DicePerPlayer int        `json:"dicePerPlayer"`
	MaxPlayers    int        `json:"maxPlayers"`
	HostOpenID    string     `json:"hostOpenid"`
	Status      RoomStatus   `json:"status"`
	Round       int          `json:"round"`
	TargetScore int          `json:"targetScore"`
	Players     []*Player    `json:"players"`
	TurnSeat    int          `json:"turnSeat"`
	Bid         *Bid         `json:"bid"`
	BidHistory  []Bid        `json:"bidHistory"`
	RoundResult *RoundResult `json:"roundResult"`
	MatchResult *MatchResult `json:"matchResult"`
	CreatedAt   int64        `json:"createdAt"`
	UpdatedAt   int64        `json:"updatedAt"`
}

// ViewPlayer 推送给单个玩家的玩家视图（别人的骰子隐藏）。
type ViewPlayer struct {
	OpenID    string `json:"openid"`
	Nickname  string `json:"nickname"`
	Avatar    string `json:"avatar"`
	Seat      int    `json:"seat"`
	Score     int    `json:"score"`
	Ready     bool   `json:"ready"`
	Connected bool   `json:"connected"`
	Left      bool   `json:"left"`
	DiceCount int    `json:"diceCount"`
	Dice      []int  `json:"dice"`
}

// View 面向单个玩家的房间视图。
type View struct {
	RoomID        string     `json:"roomId"`
	Mode          ModeID     `json:"mode"`
	ModeName      string     `json:"modeName"`
	DicePerPlayer int        `json:"dicePerPlayer"`
	MaxPlayers    int        `json:"maxPlayers"`
	HostOpenID    string     `json:"hostOpenid"`
	Status      RoomStatus   `json:"status"`
	Round       int          `json:"round"`
	TargetScore int          `json:"targetScore"`
	TurnSeat    int          `json:"turnSeat"`
	Bid         *Bid         `json:"bid"`
	MySeat      int          `json:"mySeat"`
	MyDice      []int        `json:"myDice"`
	Players     []ViewPlayer `json:"players"`
	RoundResult *RoundResult `json:"roundResult"`
	MatchResult *MatchResult `json:"matchResult"`
	CreatedAt   int64        `json:"createdAt"`
	UpdatedAt   int64        `json:"updatedAt"`
}

// PublicRoom 大厅可见的房间摘要。
type PublicRoom struct {
	RoomID        string   `json:"roomId"`
	Mode          ModeID   `json:"mode"`
	ModeName      string   `json:"modeName"`
	DicePerPlayer int      `json:"dicePerPlayer"`
	Count      int        `json:"count"`
	MaxPlayers int        `json:"maxPlayers"`
	Status     RoomStatus `json:"status"`
}
