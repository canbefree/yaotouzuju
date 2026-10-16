import type { ReactNode } from 'react'
import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'

import './index.scss'

interface Props {
  title: string
  back?: boolean
  light?: boolean
  right?: ReactNode
  onBack?: () => void
}

export default function NavBar({ title, back = true, light = false, right, onBack }: Props) {
  const info = Taro.getSystemInfoSync()
  const statusBar = info.statusBarHeight || 20

  const handleBack = () => {
    if (onBack) {
      onBack()
      return
    }
    const pages = Taro.getCurrentPages()
    if (pages.length > 1) Taro.navigateBack()
    else Taro.reLaunch({ url: '/pages/index/index' })
  }

  return (
    <View className={`navbar ${light ? 'navbar-light' : ''}`} style={{ paddingTop: `${statusBar}px` }}>
      <View className="navbar-bar">
        <View className="navbar-side" onClick={handleBack}>
          {back ? <Text className="navbar-back">‹</Text> : null}
        </View>
        <Text className="navbar-title">{title}</Text>
        <View className="navbar-side navbar-right">{right}</View>
      </View>
    </View>
  )
}
