import { View, Image } from '@tarojs/components'

import normalSheet from '../../assets/dice/normal-v3.png'
import goldSheet from '../../assets/dice/gold-v3.png'
import rainbowSheet from '../../assets/dice/rainbow-v3.png'
import normalZhaiSheet from '../../assets/dice/normal-zhai.png'
import goldZhaiSheet from '../../assets/dice/gold-zhai.png'
import rainbowZhaiSheet from '../../assets/dice/rainbow-zhai.png'
import './index.scss'

export type DiceVariant = 'normal' | 'pick' | 'effect'

interface Props {
  /** 1~6；0 表示盖着（或隐藏）的骰子背面 */
  value: number
  size?: number
  /** 变暗（保留兼容） */
  dim?: boolean
  /** 滚动中：轻微抖动 */
  rolling?: boolean
  /** 场景样式：普通 / 命中（彩虹环）/ 豹子特效（金色描边） */
  variant?: DiceVariant
  /** 斋局：1 点不再是万能，画成黑色 */
  zhai?: boolean
}

// 样式对应：pick（命中的骰子）用彩虹环，effect（豹子特效）用金色描边
const SHEETS: Record<DiceVariant, string> = {
  normal: normalSheet,
  pick: rainbowSheet,
  effect: goldSheet
}

// 斋局：1 点画成黑色（不再万能）
const ZHAI_SHEETS: Record<DiceVariant, string> = {
  normal: normalZhaiSheet,
  pick: rainbowZhaiSheet,
  effect: goldZhaiSheet
}

/** 设计稿 px（750 宽）→ rem，和 Taro 的 pxtransform 保持一致（除以 40）。 */
const rem = (px: number) => `${px / 40}rem`

/** 精灵图里骰子本体约占帧的 2/3，背面按同样比例做，保证大小一致。 */
const BODY_RATIO = 0.67

/**
 * 骰子：使用 dice_assets_rainbow 的三张精灵图（普通/选中/加强特效），按帧偏移取点数。
 * 盖着的骰子用暖木色背面 + 菱形徽记。
 */
export default function Dice({ value, size = 88, dim = false, rolling = false, variant = 'normal', zhai = false }: Props) {
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
          src={zhai ? ZHAI_SHEETS[variant] : SHEETS[variant]}
          mode="scaleToFill"
          style={{ width: '600%', height: '100%', marginLeft: `-${(value - 1) * 100}%` }}
        />
      )}
    </View>
  )
}
