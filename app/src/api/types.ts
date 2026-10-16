/** 与 Go 后端一致的领域类型。 */

export type ModeId = 'classic' | 'quick'

export interface ModeConfig {
  id: ModeId
  name: string
  desc: string
  dicePerPlayer: number
  targetScore: number
  minPlayers: number
  maxPlayers: number
}

export type RoomStatus = 'waiting' | 'playing' | 'roundEnd' | 'finished'

export interface Bid {
  seat: number
  quantity: number
  face: number
  at: number
}

export interface Delta {
  seat: number
  delta: number
  score: number
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
  winnerSeat: number
  loserSeat: number
  deltas: Delta[]
  reveal: Reveal[]
}

export interface RankingRow {
  seat: number
  openid: string
  nickname: string
  avatar: string
  score: number
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
  score: number
  ready: boolean
  connected: boolean
  left: boolean
  diceCount: number
  dice: number[] | null
}

export interface RoomView {
  roomId: string
  mode: ModeId
  modeName: string
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
