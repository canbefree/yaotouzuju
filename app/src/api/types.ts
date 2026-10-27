/** 与 Go 后端一致的领域类型。 */

export type ModeId = 'classic' | 'quick'

export interface ModeConfig {
  id: ModeId
  name: string
  desc: string
  dicePerPlayer: number
  minDicePerPlayer: number
  maxDicePerPlayer: number
  targetScore: number
  minPlayers: number
  maxPlayers: number
}

export type RoomStatus = 'waiting' | 'playing' | 'roundEnd' | 'finished'

export type BidKind = 'point' | 'pillar'

export interface Bid {
  seat: number
  /** point＝普通叫点「N 个 X」；pillar＝叫斋「N 斋」（不限点数） */
  kind: BidKind
  quantity: number
  face: number
  at: number
}

export interface Reveal {
  seat: number
  openid: string
  nickname: string
  dice: number[]
}

export interface RoundResult {
  round: number
  bidderSeat: number
  challengerSeat: number
  bid: Bid
  actual: number
  bidTrue: boolean
  /** 斋结算时叫的点数（普通叫点时为叫的点数） */
  pillarFace: number
  winnerSeat: number
  loserSeat: number
  /** 输家本轮的惩罚内容（服务端随机） */
  penalty: string
  reveal: Reveal[]
}

export interface RankingRow {
  seat: number
  openid: string
  nickname: string
  avatar: string
  penalties: number
}

export interface MatchResult {
  winnerSeat: number
  rounds: number
  ranking: RankingRow[]
}

export interface ViewPlayer {
  openid: string
  nickname: string
  avatar: string
  seat: number
  /** 累计受罚次数 */
  penalties: number
  ready: boolean
  /** 结算后已点「下一轮/准备」 */
  nextReady?: boolean
  connected: boolean
  left: boolean
  diceCount: number
  dice: number[] | null
}

export interface RoomView {
  roomId: string
  mode: ModeId
  modeName: string
  dicePerPlayer: number
  maxPlayers: number
  hostOpenid: string
  status: RoomStatus
  round: number
  targetScore: number
  turnSeat: number
  bid: Bid | null
  mySeat: number
  myDice: number[]
  players: ViewPlayer[]
  roundResult: RoundResult | null
  matchResult: MatchResult | null
  createdAt: number
  updatedAt: number
}

export interface PublicRoom {
  roomId: string
  mode: ModeId
  modeName: string
  dicePerPlayer: number
  count: number
  maxPlayers: number
  status: RoomStatus
}

export interface ScoreRow {
  rank: number
  openid: string
  nickname: string
  avatar: string
  points: number
  wins: number
  rounds: number
  matches: number
}

export interface Profile {
  openid: string
  nickname: string
  avatar: string
}
