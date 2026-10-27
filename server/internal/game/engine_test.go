package game

import "testing"

// TestPillarSettlement 端到端验证「斋」的叫点、结算与判定。
func TestPillarSettlement(t *testing.T) {
	e := NewEngine()
	id, err := e.Create(ModeClassic, 5, UserInfo{OpenID: "a", Nickname: "A"})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if _, err := e.Join(id, UserInfo{OpenID: "b", Nickname: "B"}); err != nil {
		t.Fatalf("join: %v", err)
	}
	if _, err := e.SetReady(id, "a", true); err != nil {
		t.Fatalf("ready a: %v", err)
	}
	if _, err := e.SetReady(id, "b", true); err != nil {
		t.Fatalf("ready b: %v", err)
	}

	// 固定骰子：点数 2 共 4 颗
	room := e.rooms[id]
	if room.Status != StatusPlaying {
		t.Fatalf("两人准备后应自动开局，当前 %s", room.Status)
	}
	room.Players[0].Dice = []int{2, 2, 2, 1, 1}
	room.Players[1].Dice = []int{2, 3, 4, 5, 6}
	room.TurnSeat = 0

	if _, err := e.Bid(id, "a", BidKindPoint, 4, 2); err != nil {
		t.Fatalf("point bid: %v", err)
	}
	// 4 个 → 可喊 3 个 X 斋（斋里 1 点不再万能）
	if _, err := e.Bid(id, "b", BidKindPillar, 3, 2); err != nil {
		t.Fatalf("pillar bid: %v", err)
	}
	if _, err := e.Challenge(id, "a"); err != nil {
		t.Fatalf("challenge: %v", err)
	}

	rr := e.rooms[id].RoundResult
	if rr == nil {
		t.Fatalf("应有结算结果")
	}
	if KindOf(rr.Bid) != BidKindPillar || rr.Bid.Quantity != 3 || rr.Bid.Face != 2 {
		t.Fatalf("结算叫点应为 3 个 2 斋，得到 %+v", rr.Bid)
	}
	if rr.Actual != 4 || rr.PillarFace != 2 {
		t.Fatalf("斋只数 2（不走 1 万能）：应为 2 点 ×4，得到 face=%d count=%d", rr.PillarFace, rr.Actual)
	}
	if !rr.BidTrue {
		t.Fatalf("4 ≥ 3，斋应成立（质疑者输）")
	}
	if rr.WinnerSeat != 1 || rr.LoserSeat != 0 {
		t.Fatalf("赢家应为叫斋者(seat1)，得到 winner=%d loser=%d", rr.WinnerSeat, rr.LoserSeat)
	}
}

// TestPillarTooHigh 斋数高于全场最大同点数时应不成立。
func TestPillarTooHigh(t *testing.T) {
	e := NewEngine()
	id, _ := e.Create(ModeClassic, 5, UserInfo{OpenID: "a"})
	_, _ = e.Join(id, UserInfo{OpenID: "b"})
	_, _ = e.SetReady(id, "a", true)
	_, _ = e.SetReady(id, "b", true)

	room := e.rooms[id]
	room.Players[0].Dice = []int{1, 2, 3, 4, 5}
	room.Players[1].Dice = []int{1, 2, 3, 4, 5}
	room.TurnSeat = 0

	// 两边都没有 6 → 喊 4 个 6 斋必输
	if _, err := e.Bid(id, "a", BidKindPoint, 5, 1); err != nil {
		t.Fatalf("point bid: %v", err)
	}
	if _, err := e.Bid(id, "b", BidKindPillar, 4, 6); err != nil {
		t.Fatalf("pillar bid: %v", err)
	}
	if _, err := e.Challenge(id, "a"); err != nil {
		t.Fatalf("challenge: %v", err)
	}
	rr := e.rooms[id].RoundResult
	if rr.BidTrue {
		t.Fatalf("全场 6 点 0 颗 < 4，斋应不成立")
	}
	if rr.Actual != 0 || rr.PillarFace != 6 {
		t.Fatalf("应为 6 点 ×0，得到 face=%d count=%d", rr.PillarFace, rr.Actual)
	}
	if rr.WinnerSeat != 0 {
		t.Fatalf("质疑者(seat0)应赢，得到 winner=%d", rr.WinnerSeat)
	}
}
