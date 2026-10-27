import { useEffect, useMemo, useState } from 'react'
import { View, Text } from '@tarojs/components'

import Dice from '../Dice'
import Wheel from '../Wheel'
import {
  canPillar,
  canPoint,
  pillarQuantities,
  pointFaces,
  pointQuantities,
  type BidChoice,
  type BidLike
} from '../../game/bid'
import './index.scss'

interface Props {
  visible: boolean
  prev: BidLike | null
  playerCount: number
  totalDice: number
  /** 从行动栏的「斋」按钮进入：直接锁定斋模式 */
  forcePillar?: boolean
  onClose: () => void
  onConfirm: (choice: BidChoice) => void
}

const clamp = (i: number, n: number) => Math.max(0, Math.min(i, n - 1))

/** 滚轮单项高度（绝对像素，与 Wheel 默认值一致） */
const ITEM_H = 48

/**
 * 叫点面板：用滚动选择（PickerView 滚轮）代替加减按钮。
 * 默认喊点数；从行动栏「斋」进入（forcePillar）或上家已喊斋时，面板锁定为斋模式，
 * 只能继续加斋，无法回到点数。
 */
export default function BidPicker({ visible, prev, playerCount, totalDice, forcePillar = false, onClose, onConfirm }: Props) {
  const [mode, setMode] = useState<'point' | 'pillar'>('point')
  const [qtyIdx, setQtyIdx] = useState(0)
  const [faceIdx, setFaceIdx] = useState(0)
  const [pilIdx, setPilIdx] = useState(0)

  const qtyOptions = useMemo(() => pointQuantities(prev, playerCount, totalDice), [prev, playerCount, totalDice])
  const pillarOptions = useMemo(() => pillarQuantities(prev, totalDice), [prev, totalDice])
  const allowPoint = canPoint(prev) && qtyOptions.length > 0
  const allowPillar = canPillar(prev) && pillarOptions.length > 0

  const qty = qtyOptions[clamp(qtyIdx, qtyOptions.length)] ?? totalDice
  const faceOptions = useMemo(() => pointFaces(prev, qty), [prev, qty])
  const face = faceOptions[clamp(faceIdx, faceOptions.length)] ?? 6
  const pillar = pillarOptions[clamp(pilIdx, pillarOptions.length)] ?? 1

  useEffect(() => {
    if (!visible) return
    setMode(forcePillar || !allowPoint ? 'pillar' : 'point')
    setQtyIdx(0)
    setFaceIdx(0)
    setPilIdx(0)
  }, [visible])

  if (!visible) return null

  const confirm = () => {
    if (mode === 'point') {
      if (!allowPoint || qty == null || face == null) return
      onConfirm({ kind: 'point', quantity: qty, face })
    } else {
      if (!allowPillar) return
      onConfirm({ kind: 'pillar', quantity: pillar, face: 0 })
    }
  }

  const title = mode === 'point' ? `喊 ${qty} 个 ${face}` : `喊 ${pillar} 斋`

  return (
    <View className="overlay" onClick={onClose}>
      <View className="sheet bid-sheet" onClick={(e) => e.stopPropagation()}>
        <View className="bid-head">
          <Text className={`bid-mode-title ${mode === 'pillar' ? 'is-zhai' : ''}`}>
            {mode === 'point' ? '叫点' : '叫斋'}
          </Text>
          <View className="bid-hint">
            <Text className="bid-hint-text">
              {mode === 'point'
                ? allowPoint
                  ? '上滚＝加数量，下滚＝加点数'
                  : '已有人喊斋，只能继续加斋'
                : '全场至少有这么多骰子同点（喊斋后只能继续加斋）'}
            </Text>
          </View>
        </View>

        <View className={`bid-wheels ${mode === 'point' ? '' : 'single'}`}>
          {mode === 'point' ? (
            <>
              <View className="bid-wheel">
                <Wheel items={qtyOptions} index={clamp(qtyIdx, qtyOptions.length)} onChange={(i) => { setQtyIdx(i); setFaceIdx(0) }} />
              </View>
              <View className="bid-wheel">
                <Wheel items={faceOptions} index={clamp(faceIdx, faceOptions.length)} onChange={setFaceIdx} />
              </View>
            </>
          ) : (
            <View className="bid-wheel">
              <Wheel items={pillarOptions} index={clamp(pilIdx, pillarOptions.length)} onChange={setPilIdx} />
            </View>
          )}
          <View className="wheel-mid" style={{ height: `${ITEM_H}px`, marginTop: `${-ITEM_H / 2}px` }} />
        </View>

        <View className="bid-preview">
          {mode === 'point' ? (
            <>
              <Text className="bid-preview-num">{qty}</Text>
              <Text className="bid-preview-unit">个</Text>
              <View className="bid-preview-dice">
                <Dice value={face} size={110} variant="pick" />
              </View>
            </>
          ) : (
            <>
              <Text className="bid-preview-num gold">{pillar}</Text>
              <View className="bid-pillar-badge">斋</View>
            </>
          )}
        </View>

        <View className="btn btn-primary bid-confirm" onClick={confirm}>
          {title}
        </View>
      </View>
    </View>
  )
}
