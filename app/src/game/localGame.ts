/** 本地单机玩法（客户端权威）：与线上同一套吹牛骰规则（含叫斋），含 AI 决策。 */

export type BidKind = 'point' | 'pillar'

export interface LocalPlayer {
  seat: number
  name: string
  avatar: string
  dice: number[]
  score: number
  isAI: boolean
}

export interface Bid {
  seat: number
  kind: BidKind
  quantity: number
  /** 斋时为 0 */
  face: number
}

export interface RoundResult {
  bidderSeat: number
  challengerSeat: number
  bid: Bid
  actual: number
  bidTrue: boolean
  pillarFace: number
  winnerSeat: number
  loserSeat: number
  deltas: { seat: number; delta: number; score: number }[]
  reveal: { seat: number; name: string; dice: number[] }[]
}

export type LocalStatus = 'playing' | 'roundEnd'

export interface LocalState {
  players: LocalPlayer[]
  turn: number
  bid: Bid | null
  round: number
  status: LocalStatus
  result: RoundResult | null
  targetScore: number
  dicePerPlayer: number
  winnerSeat: number | null
}

const AVATARS = ['😀', '😎', '🤠', '🐱', '🐶', '🦊', '🐼', '🐯']
const AI_NAMES = ['阿宝', '小美', '阿杰', '小林', '大力']

const SCORE_WIN = 20
const SCORE_LOSE = -10

export function rollDice(count: number): number[] {
  const out: number[] = []
  for (let i = 0; i < count; i += 1) out.push(1 + Math.floor(Math.random() * 6))
  return out
}

function countFace(players: LocalPlayer[], face: number): number {
  let n = 0
  for (const p of players) for (const d of p.dice) if (d === face) n += 1
  return n
}

/** 叫点命中数：普通叫点 1 点万能；斋里 1 点只是普通骰子。 */
function countBid(players: LocalPlayer[], face: number, zhai: boolean): number {
  if (zhai || face === 1) return countFace(players, face)
  return countFace(players, face) + countFace(players, 1)
}

export function minFirstQuantity(playerCount: number): number {
  return Math.max(1, Math.floor(playerCount / 2))
}

export function minPillarQuantity(prevQuantity: number): number {
  return Math.max(1, prevQuantity - 1)
}

export function isValidRaise(bid: Bid | null, kind: BidKind, q: number, f: number, playerCount: number): boolean {
  if (q < 1) return false
  if (kind === 'pillar') {
    if (f < 1 || f > 6) return false
    if (!bid) return false
    if (bid.kind === 'pillar') {
      if (q > bid.quantity) return true
      return q === bid.quantity && f > bid.face
    }
    return q >= minPillarQuantity(bid.quantity)
  }
  if (f < 1 || f > 6) return false
  if (!bid) return q >= minFirstQuantity(playerCount)
  if (bid.kind === 'pillar') return false
  if (q > bid.quantity) return true
  if (q === bid.quantity && f > bid.face) return true
  return false
}

export function createLocalGame(playerCount: number, dicePerPlayer: number, targetScore = 100, myName = '我'): LocalState {
  const players: LocalPlayer[] = []
  for (let i = 0; i < playerCount; i += 1) {
    players.push({
      seat: i,
      name: i === 0 ? myName : AI_NAMES[(i - 1) % AI_NAMES.length],
      avatar: i === 0 ? '😀' : AVATARS[(i + 1) % AVATARS.length],
      dice: [],
      score: 0,
      isAI: i !== 0
    })
  }
  return startRound({
    players,
    turn: 0,
    bid: null,
    round: 0,
    status: 'playing',
    result: null,
    targetScore,
    dicePerPlayer,
    winnerSeat: null
  })
}

export function startRound(s: LocalState): LocalState {
  const round = s.round + 1
  const players = s.players.map((p) => ({ ...p, dice: rollDice(s.dicePerPlayer) }))
  return {
    ...s,
    players,
    round,
    bid: null,
    result: null,
    status: 'playing',
    winnerSeat: null,
    turn: (round - 1) % players.length
  }
}

export function nextRound(s: LocalState): LocalState {
  if (s.winnerSeat !== null) {
    const players = s.players.map((p) => ({ ...p, score: 0 }))
    return startRound({ ...s, players, round: 0 })
  }
  return startRound(s)
}

export function placeBid(s: LocalState, seat: number, kind: BidKind, quantity: number, face: number): LocalState {
  if (s.status !== 'playing' || s.turn !== seat) return s
  if (!isValidRaise(s.bid, kind, quantity, face, s.players.length)) return s
  return {
    ...s,
    bid: { seat, kind, quantity, face },
    turn: (seat + 1) % s.players.length
  }
}

export function challenge(s: LocalState, seat: number): LocalState {
  if (s.status !== 'playing' || s.turn !== seat || !s.bid) return s
  const bid = s.bid
  const pillarFace = bid.face
  const actual = countBid(s.players, bid.face, bid.kind === 'pillar')
  const bidTrue = actual >= bid.quantity
  const winnerSeat = bidTrue ? bid.seat : seat
  const loserSeat = bidTrue ? seat : bid.seat
  const players = s.players.map((p) => {
    const delta = p.seat === winnerSeat ? SCORE_WIN : SCORE_LOSE
    return { ...p, score: p.score + delta }
  })
  const result: RoundResult = {
    bidderSeat: bid.seat,
    challengerSeat: seat,
    bid,
    actual,
    bidTrue,
    pillarFace,
    winnerSeat,
    loserSeat,
    deltas: players.map((p) => ({ seat: p.seat, delta: p.seat === winnerSeat ? SCORE_WIN : SCORE_LOSE, score: p.score })),
    reveal: players.map((p) => ({ seat: p.seat, name: p.name, dice: [...p.dice] }))
  }
  const reached = players.filter((p) => p.score >= s.targetScore)
  const winnerSeatFinal = reached.length > 0 ? players.slice().sort((a, b) => b.score - a.score)[0].seat : null
  return { ...s, players, status: 'roundEnd', result, winnerSeat: winnerSeatFinal }
}

export type AIAction =
  | { type: 'bid'; kind: BidKind; quantity: number; face: number }
  | { type: 'challenge' }

/** AI 决策：基于已知自己的骰子 + 未知骰子的期望值。 */
export function aiAction(s: LocalState): AIAction {
  const me = s.players.find((p) => p.seat === s.turn)!
  const others = s.players.filter((p) => p.seat !== s.turn).length * s.dicePerPlayer
  const bid = s.bid

  const mineZ = (face: number) => me.dice.filter((d) => d === face).length
  const mineN = (face: number) => mineZ(face) + (face === 1 ? 0 : mineZ(1))
  // 未知骰子：普通叫点时点数或 1 都算（2/6）；斋时只算点数（1/6）
  const estN = (face: number) => mineN(face) + (face === 1 ? others / 6 : others / 3)
  const estZ = (face: number) => mineZ(face) + others / 6
  const fav = favoriteFace(me.dice)

  if (bid) {
    if (bid.kind === 'pillar') {
      // 斋：先试同数量更高点数，再加数量
      for (let f = bid.face + 1; f <= 6; f += 1) {
        if (bid.quantity <= estZ(f) + 0.6) {
          return { type: 'bid', kind: 'pillar', quantity: bid.quantity, face: f }
        }
      }
      const need = bid.quantity + 1
      if (need <= estZ(fav) + 0.6) return { type: 'bid', kind: 'pillar', quantity: need, face: fav }
      return { type: 'challenge' }
    }
    if (bid.quantity > estN(bid.face) + 0.9) return { type: 'challenge' }
    // 手里同点多，转喊斋（可从 数量-1 起）
    const minPillar = minPillarQuantity(bid.quantity)
    const zFace = mineZ(fav) >= mineZ(bid.face) ? fav : bid.face
    if (mineZ(zFace) >= minPillar && estZ(zFace) >= minPillar + 0.4) {
      return { type: 'bid', kind: 'pillar', quantity: minPillar, face: zFace }
    }
    for (let f = bid.face + 1; f <= 6; f += 1) {
      if (bid.quantity <= estN(f) + 1.2) {
        return { type: 'bid', kind: 'point', quantity: bid.quantity, face: f }
      }
    }
    const q = bid.quantity + 1
    if (q <= estN(fav) + 1.2) {
      return { type: 'bid', kind: 'point', quantity: q, face: fav }
    }
    return { type: 'challenge' }
  }

  const q = Math.max(minFirstQuantity(s.players.length), Math.floor(estN(fav)))
  return { type: 'bid', kind: 'point', quantity: Math.max(1, q), face: fav }
}

function favoriteFace(dice: number[]): number {
  const counts = [0, 0, 0, 0, 0, 0, 0]
  for (const d of dice) counts[d] += 1
  let best = 1
  for (let f = 2; f <= 6; f += 1) if (counts[f] > counts[best]) best = f
  return best
}
