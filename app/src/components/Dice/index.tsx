import { View } from '@tarojs/components'

import './index.scss'

interface Props {
  value: number
  size?: number
  dim?: boolean
}

const FACE_PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8]
}

export default function Dice({ value, size = 88, dim = false }: Props) {
  const pips = FACE_PIPS[value] || []
  const dot = Math.max(6, Math.round(size * 0.13))
  return (
    <View className={`dice ${dim ? 'dice-dim' : ''}`} style={{ width: `${size}px`, height: `${size}px`, borderRadius: `${size * 0.22}px` }}>
      {Array.from({ length: 9 }).map((_, i) => (
        <View key={i} className="dice-cell">
          {pips.includes(i) ? (
            <View className="dice-pip" style={{ width: `${dot}px`, height: `${dot}px` }} />
          ) : null}
        </View>
      ))}
    </View>
  )
}
