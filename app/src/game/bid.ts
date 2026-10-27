import type { BidKind } from '../api/types'

/** 只要具备这些字段即可（线上 Bid 与本地 Bid 通用）。 */
export interface BidLike {
  kind: BidKind
  quantity: number
  face: number
}

/** 叫点文案：`5个4` / `3个2斋`。 */
export function bidLabel(b: BidLike): string {
  return b.kind === 'pillar' ? `${b.quantity}个${b.face}斋` : `${b.quantity}个${b.face}`
}

/** 带空格的宽版文案：`5 个 4` / `3 个 2 斋`。 */
export function bidFull(b: BidLike): string {
  return b.kind === 'pillar' ? `${b.quantity} 个 ${b.face} 斋` : `${b.quantity} 个 ${b.face}`
}

export interface BidChoice {
  kind: BidKind
  quantity: number
  face: number
}

/** 首叫最小数量（与后端一致）。 */
export function minFirstQuantity(playerCount: number): number {
  return Math.max(1, Math.floor(playerCount / 2))
}

/** 斋之后不能再喊普通点。 */
export function canPoint(prev: BidLike | null): boolean {
  return !prev || prev.kind !== 'pillar'
}

/** 斋只能在上家已叫点后喊。 */
export function canPillar(prev: BidLike | null): boolean {
  return !!prev
}

/**
 * 普通叫点：可选数量（升序）。
 * 若上家叫的是「Q 个 6」，同数量已无更大的点数，只能从 Q+1 起——否则会出现空点数列表。
 * 无合法普通叫点时返回 []。
 */
export function pointQuantities(prev: BidLike | null, playerCount: number, totalDice: number): number[] {
  if (prev && prev.kind === 'pillar') return []
  let min = prev ? prev.quantity : minFirstQuantity(playerCount)
  if (prev && prev.face >= 6) min += 1
  const out: number[] = []
  for (let q = min; q <= totalDice; q++) out.push(q)
  return out
}

/** 普通叫点：某数量下可选点数（升序）。 */
export function pointFaces(prev: BidLike | null, quantity: number): number[] {
  const minFace = prev && prev.kind !== 'pillar' && prev.quantity === quantity ? prev.face + 1 : 1
  const out: number[] = []
  for (let f = minFace; f <= 6; f++) out.push(f)
  return out
}

/**
 * 斋：可选数量（升序）。普通叫点 Q 个之后从 Q-1 起（斋里少了 1 点万能）；
 * 斋之后数量更大，或数量相同再比点数，所以从当前数量起。
 */
export function pillarQuantities(prev: BidLike | null, totalDice: number): number[] {
  if (!prev) return []
  const min = prev.kind === 'pillar' ? prev.quantity : Math.max(1, prev.quantity - 1)
  const out: number[] = []
  for (let n = min; n <= totalDice; n++) out.push(n)
  return out
}

/** 斋：某数量下可选点数（升序）。斋里同数量要求点数更大。 */
export function pillarFaces(prev: BidLike | null, quantity: number): number[] {
  const minFace = prev && prev.kind === 'pillar' && prev.quantity === quantity ? prev.face + 1 : 1
  const out: number[] = []
  for (let f = minFace; f <= 6; f++) out.push(f)
  return out
}
