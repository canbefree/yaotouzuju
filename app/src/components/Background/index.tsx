import { View, Image } from '@tarojs/components'

import bg from '../../assets/bg.jpg'
import './index.scss'

interface Props {
  /** wood：深色木桌页（首页/对局）；paper：浅色纸面页（大厅/设置/玩法） */
  tone?: 'wood' | 'paper'
}

/**
 * 全屏背景层：已预先虚化的素材图 + 色调遮罩，固定在最底层。
 * 预先虚化（而非 CSS filter）是为了在微信/抖音小程序里也稳定生效。
 */
export default function Background({ tone = 'wood' }: Props) {
  return (
    <View className="bg-layer">
      <Image className="bg-img" src={bg} mode="aspectFill" />
      <View className={`bg-scrim bg-scrim-${tone}`} />
    </View>
  )
}
