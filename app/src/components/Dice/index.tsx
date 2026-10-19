import { View } from '@tarojs/components'

import './index.scss'

export type DiceVariant = 'normal' | 'selected' | 'glow'

interface Props {
  /** 1~6；0 表示盖着（或隐藏）的骰子背面 */
  value: number
  size?: number
  /** 变暗（保留兼容） */
  dim?: boolean
  /** 滚动中：加一点旋转/抖动的动感 */
  rolling?: boolean
  /** 场景样式：普通 / 选中（金色描边 + 微浮起）/ 加强特效（彩色辉光） */
  variant?: DiceVariant
}

const FACE_PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8]
}

/** 设计稿 px（750 宽）→ rem，和 Taro 的 pxtransform 保持一致（除以 40）。 */
const rem = (px: number) => `${px / 40}rem`

export default function Dice({ value, size = 88, dim = false, rolling = false, variant = 'normal' }: Props) {
  const back = value < 1
  const pips = FACE_PIPS[value] || []
  const dot = Math.max(7, Math.round(size * 0.17))
  // 按设计稿：仅 1 点为红色，其余为黑色
  const red = value === 1
  const cls = [
    'dice',
    back ? 'dice-back' : '',
    dim ? 'dice-dim' : '',
    rolling ? 'dice-rolling' : '',
    !back && variant === 'selected' ? 'dice-sel' : '',
    !back && variant === 'glow' ? 'dice-glow' : ''
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <View
      className={cls}
      style={{
        width: rem(size),
        height: rem(size),
        borderRadius: rem(Math.round(size * 0.2)),
        padding: rem(size * 0.09)
      }}
    >
      {!back && variant === 'glow' ? (
        <>
          <View className="dice-spark s1" />
          <View className="dice-spark s2" />
          <View className="dice-spark s3" />
          <View className="dice-spark s4" />
        </>
      ) : null}
      {back ? (
        <View className="dice-emblem" style={{ width: rem(size * 0.34), height: rem(size * 0.34) }} />
      ) : (
        Array.from({ length: 9 }).map((_, i) => (
          <View key={i} className="dice-cell">
            {pips.includes(i) ? (
              <View
                className={`dice-pip ${red ? 'dice-pip-red' : ''}`}
                style={{ width: rem(dot), height: rem(dot) }}
              />
            ) : null}
          </View>
        ))
      )}
    </View>
  )
}
