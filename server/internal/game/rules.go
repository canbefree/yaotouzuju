package game

import "math/rand"

// DiceFaces 骰子面数。
const DiceFaces = 6

// DefaultDicePerPlayer 默认每人骰子数。
const DefaultDicePerPlayer = 5

// Modes 玩法（只保留一种：吹牛骰，骰子数量可调）。
var Modes = map[ModeID]ModeConfig{
	ModeClassic: {
		ID: ModeClassic, Name: "吹牛骰", Desc: "每轮输家接受惩罚，每人骰子数量可调",
		DicePerPlayer: DefaultDicePerPlayer, MinDice: 2, MaxDice: 8,
		TargetScore: 100, MinPlayers: 2, MaxPlayers: 5,
	},
}

// Punishments 输家惩罚池（服务端随机抽一个，全场看到同一张）。
var Punishments = []string{
	"罚喝一杯（饮料也算）",
	"真心话：回答大家一个问题",
	"大冒险：做一个指定动作",
	"学三声猫叫",
	"夸一圈在场的人",
	"表演 10 秒才艺",
	"给左手边的人捶背 10 秒",
	"用方言说一句「我输了」",
}

// RandomPenalty 抽一个惩罚。
func RandomPenalty() string {
	return Punishments[rand.Intn(len(Punishments))]
}

// ClampDice 把每人骰子数限制到合法范围（0 或非法值取默认 5）。
func ClampDice(n int) int {
	cfg := Modes[ModeClassic]
	if n <= 0 {
		return cfg.DicePerPlayer
	}
	if n < cfg.MinDice {
		return cfg.MinDice
	}
	if n > cfg.MaxDice {
		return cfg.MaxDice
	}
	return n
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

// KindOf 取叫点类型，空值按普通叫点处理（兼容旧快照）。
func KindOf(b Bid) BidKind {
	if b.Kind == BidKindPillar {
		return BidKindPillar
	}
	return BidKindPoint
}

// MinFirstQuantity 首叫的最小数量：至少人数的一半（向下取整，最少 1）。
func MinFirstQuantity(playerCount int) int {
	q := playerCount / 2
	if q < 1 {
		q = 1
	}
	return q
}

// CountBid 统计叫点 face 的命中数。
// 普通叫点：1 点可当任意点数（叫 1 时只数 1）；斋：1 点不再万能，按普通骰子计。
func CountBid(all [][]int, face int, zhai bool) int {
	if zhai || face == 1 {
		return CountFace(all, face)
	}
	return CountFace(all, face) + CountFace(all, 1)
}

// MinPillarQuantity 从「N 个 X」进入「斋」的最小数量：数量减 1（斋少了 1 点万能，算补偿）。
func MinPillarQuantity(prevQuantity int) int {
	q := prevQuantity - 1
	if q < 1 {
		q = 1
	}
	return q
}

// IsValidRaise 校验新叫点是否合法。
//   - 普通叫点：数量更大（面值任意），或数量相同而面值更大；斋之后不可再叫普通点。
//   - 斋「N 个 X 斋」：必须指定点数；不能首叫；从普通叫点「Q 个 X」进入需 ≥ Q-1 个；
//     斋之后只能继续加斋：数量更大，或数量相同而点数更大。
func IsValidRaise(prev *Bid, kind BidKind, quantity, face, playerCount int) bool {
	if quantity < 1 {
		return false
	}
	if kind == BidKindPillar {
		if face < 1 || face > DiceFaces {
			return false
		}
		if prev == nil {
			return false
		}
		if KindOf(*prev) == BidKindPillar {
			if quantity > prev.Quantity {
				return true
			}
			return quantity == prev.Quantity && face > prev.Face
		}
		return quantity >= MinPillarQuantity(prev.Quantity)
	}
	// 普通叫点
	if face < 1 || face > DiceFaces {
		return false
	}
	if prev == nil {
		return quantity >= MinFirstQuantity(playerCount)
	}
	if KindOf(*prev) == BidKindPillar {
		return false
	}
	if quantity > prev.Quantity {
		return true
	}
	if quantity == prev.Quantity && face > prev.Face {
		return true
	}
	return false
}
