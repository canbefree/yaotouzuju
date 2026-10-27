package game

import "testing"

func TestIsValidRaisePoints(t *testing.T) {
	// 首叫：至少人数一半
	if !IsValidRaise(nil, BidKindPoint, 2, 1, 4) {
		t.Fatalf("首叫 2 个应合法（4 人）")
	}
	if IsValidRaise(nil, BidKindPoint, 1, 1, 4) {
		t.Fatalf("首叫 1 个在 4 人局应不合法")
	}
	prev := &Bid{Kind: BidKindPoint, Quantity: 3, Face: 4}
	if !IsValidRaise(prev, BidKindPoint, 4, 1, 4) {
		t.Fatalf("数量更大应合法")
	}
	if !IsValidRaise(prev, BidKindPoint, 3, 5, 4) {
		t.Fatalf("同数量点数更大应合法")
	}
	if IsValidRaise(prev, BidKindPoint, 3, 4, 4) {
		t.Fatalf("同数量同点数应不合法")
	}
	if IsValidRaise(prev, BidKindPoint, 3, 2, 4) {
		t.Fatalf("同数量点数更小应不合法")
	}
	if IsValidRaise(prev, BidKindPoint, 2, 6, 4) {
		t.Fatalf("数量更小应不合法")
	}
}

func TestPillarEntryAndLadder(t *testing.T) {
	// 斋必须带点数，且不能首叫
	if IsValidRaise(nil, BidKindPillar, 1, 3, 4) {
		t.Fatalf("斋不能首叫")
	}
	if IsValidRaise(nil, BidKindPillar, 1, 0, 4) {
		t.Fatalf("没有点数的斋应不合法")
	}
	prev := &Bid{Kind: BidKindPoint, Quantity: 4, Face: 2}
	// 现在是 4 个 → 可喊 3 个 X 斋（数量-1）
	if !IsValidRaise(prev, BidKindPillar, 3, 5, 4) {
		t.Fatalf("4 个之后应可喊 3 个 5 斋")
	}
	if !IsValidRaise(prev, BidKindPillar, 4, 1, 4) {
		t.Fatalf("4 个之后喊 4 个 1 斋也应合法")
	}
	if IsValidRaise(prev, BidKindPillar, 2, 5, 4) {
		t.Fatalf("低于 数量-1 的斋应不合法")
	}
	// 现在是 5 个 → 可喊 4 个斋
	prev5 := &Bid{Kind: BidKindPoint, Quantity: 5, Face: 1}
	if !IsValidRaise(prev5, BidKindPillar, 4, 6, 4) {
		t.Fatalf("5 个之后应可喊 4 个 6 斋")
	}
	if IsValidRaise(prev5, BidKindPillar, 3, 6, 4) {
		t.Fatalf("5 个之后 3 个斋应不合法")
	}

	// 斋之后只能继续加斋：数量更大，或同数量点数更大
	pillar := &Bid{Kind: BidKindPillar, Quantity: 3, Face: 4}
	if !IsValidRaise(pillar, BidKindPillar, 4, 1, 4) {
		t.Fatalf("斋之后数量更大应合法")
	}
	if !IsValidRaise(pillar, BidKindPillar, 3, 5, 4) {
		t.Fatalf("斋之后同数量点数更大应合法")
	}
	if IsValidRaise(pillar, BidKindPillar, 3, 4, 4) {
		t.Fatalf("斋之后同数量同点数应不合法")
	}
	if IsValidRaise(pillar, BidKindPillar, 3, 3, 4) {
		t.Fatalf("斋之后点数更小应不合法")
	}
	if IsValidRaise(pillar, BidKindPoint, 9, 6, 4) {
		t.Fatalf("斋之后不能回普通叫点")
	}
}

// 普通叫点里 1 点万能；斋里 1 点只是普通骰子。
func TestCountBid(t *testing.T) {
	all := [][]int{{1, 2, 2, 5}, {3, 2, 6, 6}, {6, 1}}
	if got := CountBid(all, 2, false); got != 5 {
		t.Fatalf("普通叫点 2：3 颗 2 + 2 颗万能 1，应为 5，得到 %d", got)
	}
	if got := CountBid(all, 6, false); got != 5 {
		t.Fatalf("普通叫点 6：3 颗 6 + 2 颗万能 1，应为 5，得到 %d", got)
	}
	if got := CountBid(all, 2, true); got != 3 {
		t.Fatalf("斋 2：只数 2，应为 3，得到 %d", got)
	}
	if got := CountBid(all, 1, false); got != 2 {
		t.Fatalf("普通叫 1：只数 1，应为 2，得到 %d", got)
	}
}

func TestMinPillarQuantity(t *testing.T) {
	if got := MinPillarQuantity(4); got != 3 {
		t.Fatalf("4 → 3 斋，得到 %d", got)
	}
	if got := MinPillarQuantity(5); got != 4 {
		t.Fatalf("5 → 4 斋，得到 %d", got)
	}
	if got := MinPillarQuantity(1); got != 1 {
		t.Fatalf("1 → 1 斋，得到 %d", got)
	}
}
