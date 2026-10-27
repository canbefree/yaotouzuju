import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { View, Text } from '@tarojs/components'

import Dice from '../Dice'
import { bidFull, type BidLike } from '../../game/bid'
import './index.scss'

export interface RevealPlayer {
  seat: number
  name: string
  dice: number[]
}

interface Props {
  /** 弹窗标题：游戏结束！/ 第 3 轮结束 */
  title: string
  /** 本轮叫点（为空时直接显示结局） */
  bid?: BidLike | null
  players: RevealPlayer[]
  actual: number
  bidTrue: boolean
  winnerName: string
  /** 赢家是不是自己：名字后加「（你）」 */
  winnerIsMe?: boolean
  nextLabel: string
  onNext: () => void
  onLeave?: () => void
  leaveLabel?: string
  /** 揭晓完成后追加的内容（排行榜、分数变化） */
  footer?: ReactNode
  /** 换局时重置揭晓流程 */
  sessionKey?: string | number
}

/**
 * 逐人揭晓：先弹出「结束」，再一位一位翻开骰子并累加命中数，
 * 全部翻完才公布成立与否、赢家和分数。
 */
export default function ResultReveal({
  title,
  bid,
  players,
  actual,
  bidTrue,
  winnerName,
  winnerIsMe = false,
  nextLabel,
  onNext,
  onLeave,
  leaveLabel = '返回大厅',
  footer,
  sessionKey
}: Props) {
  const [shown, setShown] = useState(0)
  const [done, setDone] = useState(false)

  const zhai = bid?.kind === 'pillar'
  const face = bid?.face ?? 0

  useEffect(() => {
    setShown(0)
    setDone(false)
    if (players.length === 0) {
      setDone(true)
      return
    }
    const t = setTimeout(() => setShown(1), 1000)
    return () => clearTimeout(t)
  }, [sessionKey, players.length])

  useEffect(() => {
    if (players.length === 0 || shown <= 0) return
    if (shown < players.length) {
      const t = setTimeout(() => setShown(shown + 1), 950)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => setDone(true), 700)
    return () => clearTimeout(t)
  }, [shown, players.length])

  /** 普通叫点里 1 点万能，也算命中 */
  const isHit = (d: number) => d === face || (!zhai && face !== 1 && d === 1)

  const visible = players.slice(0, shown)
  const total = useMemo(
    () => visible.reduce((sum, p) => sum + p.dice.filter((d) => d === face || (!zhai && face !== 1 && d === 1)).length, 0),
    [visible, face, zhai]
  )

  const tap = () => {
    if (done) return
    if (shown < players.length) setShown(shown + 1)
    else setDone(true)
  }

  return (
    <View className="overlay rr-overlay" onClick={tap}>
      <View className="card rr-card" onClick={(e) => e.stopPropagation()}>
        <Text className="rr-title">{title}</Text>
        {bid ? <Text className="rr-sub">喊 {bidFull(bid)}</Text> : null}

        {players.length > 0 ? (
          <>
            <View className="rr-rows">
              {visible.map((p) => {
                const hit = p.dice.filter(isHit).length
                return (
                  <View key={p.seat} className="rr-row">
                    <View className="rr-row-head">
                      <Text className="rr-name">{p.name}</Text>
                      <Text className={`rr-count ${hit > 0 ? 'on' : ''}`}>+{hit}</Text>
                    </View>
                    <View className="rr-dice">
                      {p.dice.map((d, k) => (
                        <Dice key={k} value={d} size={44} variant={isHit(d) ? 'pick' : 'normal'} zhai={zhai} />
                      ))}
                    </View>
                  </View>
                )
              })}
            </View>

            <View className="rr-total">
              <Text className="rr-total-label">累计命中</Text>
              <Text key={total} className="rr-total-num">
                {total}
              </Text>
              <Text className="rr-total-label">
                个 {face}
                {zhai ? '（斋）' : ''}
              </Text>
            </View>
          </>
        ) : null}

        {done ? (
          <View className="rr-result">
            <Text className={`rr-verdict ${bidTrue ? 'good' : 'bad'}`}>
              {bid ? (bidTrue ? '叫点成立！' : '叫点不成立！') : '本局结束'}
            </Text>
            {bid ? (
              <Text className="rr-actual">
                实际 {actual} 个，喊 {bid.quantity} 个
              </Text>
            ) : null}
            <Text className="rr-winner">
              🏆 {winnerName}
              {winnerIsMe ? '（你）' : ''} 胜
            </Text>
            {footer}
            <View className="rr-actions">
              <View className="btn btn-primary rr-btn" onClick={onNext}>
                {nextLabel}
              </View>
              {onLeave ? (
                <View className="btn btn-ghost rr-btn" onClick={onLeave}>
                  {leaveLabel}
                </View>
              ) : null}
            </View>
          </View>
        ) : (
          <Text className="rr-tip">点击加速</Text>
        )}
      </View>
    </View>
  )
}
