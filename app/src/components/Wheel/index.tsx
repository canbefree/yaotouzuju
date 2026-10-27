import { useEffect, useRef, useState, type ReactNode } from 'react'
import { View, ScrollView } from '@tarojs/components'

import './index.scss'

interface Props {
  items: number[]
  index: number
  onChange: (index: number) => void
  /** 单项高度（绝对像素，与容器高度保持一致） */
  itemHeight?: number
  /** 可见项数（奇数） */
  visible?: number
  /** 自定义单项渲染（如用骰子图代替数字） */
  renderItem?: (item: number) => ReactNode
}

/**
 * 滚轮选择器。
 * 用 ScrollView 实现：桌面浏览器用鼠标滚轮/点击，移动端用手指拖动，两端都能实时同步选中值。
 * （Taro 自带的 PickerView 在 H5 只监听 touch 事件，桌面鼠标滚动不会回调 onChange。）
 */
export default function Wheel({ items, index, onChange, itemHeight = 48, visible = 5, renderItem }: Props) {
  const pad = ((visible - 1) / 2) * itemHeight
  const [top, setTop] = useState(index * itemHeight)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cur = useRef(index)

  useEffect(() => {
    cur.current = index
    const target = index * itemHeight
    setTop((t) => (Math.abs(t - target) > 1 ? target : t))
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [index, itemHeight, items.length])

  const onScroll = (e: any) => {
    const st: number = e?.detail?.scrollTop ?? 0
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const n = items.length
      if (n === 0) return
      const i = Math.max(0, Math.min(n - 1, Math.round(st / itemHeight)))
      if (i !== cur.current) {
        cur.current = i
        onChange(i)
      }
      const target = i * itemHeight
      if (Math.abs(target - st) > 1) setTop(target)
    }, 130)
  }

  const pick = (i: number) => {
    if (i === cur.current) return
    cur.current = i
    onChange(i)
    setTop(i * itemHeight)
  }

  return (
    <ScrollView
      scrollY
      className="wheel"
      style={{ height: `${visible * itemHeight}px` }}
      scrollTop={top}
      scrollWithAnimation
      onScroll={onScroll}
    >
      <View style={{ height: `${pad}px` }} />
      {items.map((it, i) => (
        <View
          key={it}
          className={`wheel-item ${i === index ? 'on' : ''}`}
          style={{ height: `${itemHeight}px`, lineHeight: `${itemHeight}px` }}
          onClick={() => pick(i)}
        >
          {renderItem ? renderItem(it) : it}
        </View>
      ))}
      <View style={{ height: `${pad}px` }} />
    </ScrollView>
  )
}
