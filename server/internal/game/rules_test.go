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
	// 柱不能首叫
	if IsValidRaise(nil, BidKindPillar, 1, 0, 4) {
		t.Fatalf("柱不能首叫")
	}
	prev := &Bid{Kind: BidKindPoint, Quantity: 4, Face: 2}
	// 现在是 4 个 → 可喊 3 柱（数量-1）
	if !IsValidRaise(prev, BidKindPillar, 3, 0, 4) {
		t.Fatalf("4 个之后应可喊 3 柱")
	}
	if !IsValidRaise(prev, BidKindPillar, 4, 0, 4) {
		t.Fatalf("4 个之后喊 4 柱也应合法")
	}
	if IsValidRaise(prev, BidKindPillar, 2, 0, 4) {
		t.Fatalf("低于 数量-1 的柱应不合法")
	}
	// 现在是 5 个 → 可喊 4 柱
	prev5 := &Bid{Kind: BidKindPoint, Quantity: 5, Face: 1}
	if !IsValidRaise(prev5, BidKindPillar, 4, 0, 4) {
		t.Fatalf("5 个之后应可喊 4 柱")
	}
	if IsValidRaise(prev5, BidKindPillar, 3, 0, 4) {
		t.Fatalf("5 个之后 3 柱应不合法")
	}

	// 柱之后只能继续加柱
	pillar := &Bid{Kind: BidKindPillar, Quantity: 3}
	if !IsValidRaise(pillar, BidKindPillar, 4, 0, 4) {
		t.Fatalf("柱之后应可加柱")
	}
	if IsValidRaise(pillar, BidKindPillar, 3, 0, 4) {
		t.Fatalf("柱数未增加应不合法")
	}
	if IsValidRaise(pillar, BidKindPoint, 9, 6, 4) {
		t.Fatalf("柱之后不能回普通叫点")
	}
}

func TestMaxFaceCount(t *testing.T) {
	all := [][]int{{2, 2, 5}, {2, 6, 6}, {6, 1}}
	face, count := MaxFaceCount(all)
	if face != 2 && face != 6 {
		t.Fatalf("最多的点数应为 2 或 6，得到 %d", face)
	}
	if count != 3 {
		t.Fatalf("最大同点数应为 3，得到 %d", count)
	}
}

func TestMinPillarQuantity(t *testing.T) {
	if got := MinPillarQuantity(4); got != 3 {
		t.Fatalf("4 → 3 柱，得到 %d", got)
	}
	if got := MinPillarQuantity(5); got != 4 {
		t.Fatalf("5 → 4 柱，得到 %d", got)
	}
	if got := MinPillarQuantity(1); got != 1 {
		t.Fatalf("1 → 1 柱，得到 %d", got)
	}
}
