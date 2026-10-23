import { View, Image } from '@tarojs/components'

import normalSheet from '../../assets/dice/normal.png'
import selectedSheet from '../../assets/dice/selected.png'
import glowSheet from '../../assets/dice/glow.png'
import './index.scss'

export type DiceVariant = 'normal' | 'selected' | 'glow'

interface Props {
  /** 1~6；0 表示盖着（或隐藏）的骰子背面 */
  value: number
  size?: number
  /** 变暗（保留兼容） */
  dim?: boolean
  /** 滚动中：轻微抖动 */
  rolling?: boolean
  /** 场景样式：普通 / 选中（金色描边 + 微浮起）/ 加强特效（彩色辉光） */
  variant?: DiceVariant
}

const SHEETS: Record<DiceVariant, string> = {
  normal: normalSheet,
  selected: selectedSheet,
  glow: glowSheet
}

/** 设计稿 px（750 宽）→ rem，和 Taro 的 pxtransform 保持一致（除以 40）。 */
const rem = (px: number) => `${px / 40}rem`

/** 精灵图里骰子本体约占帧的 2/3，背面按同样比例做，保证大小一致。 */
const BODY_RATIO = 0.67

/**
 * 骰子：使用 dice_assets_rainbow 的三张精灵图（普通/选中/加强特效），按帧偏移取点数。
 * 盖着的骰子用暖木色背面 + 菱形徽记。
 */
export default function Dice({ value, size = 88, dim = false, rolling = false, variant = 'normal' }: Props) {
  const back = value < 1
  const cls = [
    'dice-slot',
    dim ? 'dice-dim' : '',
    rolling ? 'dice-rolling' : ''
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <View className={cls} style={{ width: rem(size), height: rem(size) }}>
      {back ? (
        <View
          className="dice-back"
          style={{
            width: rem(size * BODY_RATIO),
            height: rem(size * BODY_RATIO),
            borderRadius: rem(size * BODY_RATIO * 0.2)
          }}
        >
          <View
            className="dice-emblem"
            style={{ width: rem(size * BODY_RATIO * 0.34), height: rem(size * BODY_RATIO * 0.34) }}
          />
        </View>
      ) : (
        <Image
          className="dice-sprite"
          src={SHEETS[variant]}
          mode="scaleToFill"
          style={{ width: '600%', height: '100%', marginLeft: `-${(value - 1) * 100}%` }}
        />
      )}
    </View>
  )
}
