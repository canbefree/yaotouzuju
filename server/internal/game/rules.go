package game

import "math/rand"

// DiceFaces 骰子面数。
const DiceFaces = 6

// Score 结算分值：赢家加分，其余玩家扣分（对齐设计稿 +20 / -10）。
const (
	ScoreWin  = 20
	ScoreLose = -10
)

// Modes 全部玩法。
var Modes = map[ModeID]ModeConfig{
	ModeClassic: {
		ID: ModeClassic, Name: "吹牛骰", Desc: "每人 5 颗骰子，5 人局，先到 100 分者胜",
		DicePerPlayer: 5, TargetScore: 100, MinPlayers: 2, MaxPlayers: 5,
	},
	ModeQuick: {
		ID: ModeQuick, Name: "大话骰", Desc: "每人 3 颗骰子，6 人局，快节奏先到 60 分者胜",
		DicePerPlayer: 3, TargetScore: 60, MinPlayers: 2, MaxPlayers: 6,
	},
}

// IsMode 校验玩法标识。
func IsMode(v string) bool {
	_, ok := Modes[ModeID(v)]
	return ok
}

// GetMode 取玩法配置。
func GetMode(id ModeID) ModeConfig {
	if m, ok := Modes[id]; ok {
		return m
	}
	return Modes[ModeClassic]
}

// RollDice 掷 count 颗骰子。
func RollDice(count int) []int {
	out := make([]int, count)
	for i := range out {
		out[i] = 1 + rand.Intn(DiceFaces)
	}
	return out
}

// CountFace 清点面值 face 在全部骰子里出现的次数。
func CountFace(all [][]int, face int) int {
	n := 0
	for _, dice := range all {
		for _, d := range dice {
			if d == face {
				n++
			}
		}
	}
	return n
}

// MinFirstQuantity 首叫的最小数量：至少人数的一半（向下取整，最少 1）。
func MinFirstQuantity(playerCount int) int {
	q := playerCount / 2
	if q < 1 {
		q = 1
	}
	return q
}

// IsValidRaise 校验新叫点是否合法：
// 数量更大（面值任意）；或数量相同且面值更大。
func IsValidRaise(prev *Bid, quantity, face, playerCount int) bool {
	if face < 1 || face > DiceFaces {
		return false
	}
	if quantity < 1 {
		return false
	}
	if prev == nil {
		return quantity >= MinFirstQuantity(playerCount)
	}
	if quantity > prev.Quantity {
		return true
	}
	if quantity == prev.Quantity && face > prev.Face {
		return true
	}
	return false
}
