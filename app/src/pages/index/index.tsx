import { View, Text } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'

import Dice from '../../components/Dice'
import './index.scss'

export default function Home() {
  useDidShow(() => {
    // 进入首页时若无登录态则触发一次（静默）
    void import('../../store/session').then((m) => m.ensureLogin())
  })

  const go = (url: string) => Taro.navigateTo({ url })

  return (
    <View className="page page-wood home">
      <View className="home-settings" onClick={() => go('/pages/settings/index')}>
        <Text>⚙️</Text>
      </View>

      <View className="home-hero">
        <View className="home-logo">
          <Text className="home-logo-text">摇骰组局</Text>
          <View className="home-dice-row">
            <Dice value={2} size={64} />
            <Dice value={5} size={64} />
          </View>
        </View>
        <View className="home-slogan">吹牛骰 · 大话骰</View>
      </View>

      <View className="home-cards">
        <View className="home-card home-card-online" onClick={() => go('/pages/lobby/index')}>
          <View className="home-card-icon">🌐</View>
          <View className="home-card-body">
            <Text className="home-card-title">在线游戏</Text>
            <Text className="home-card-sub">和好友 / 陌生人，快乐组局</Text>
          </View>
          <Text className="home-card-arrow">›</Text>
        </View>

        <View className="home-card home-card-local" onClick={() => go('/pages/local/index')}>
          <View className="home-card-icon">🎮</View>
          <View className="home-card-body">
            <Text className="home-card-title">本地单机</Text>
            <Text className="home-card-sub">无需网络，随时随地畅玩</Text>
          </View>
          <Text className="home-card-arrow">›</Text>
        </View>

        <View className="home-card home-card-rules" onClick={() => go('/pages/rules/index')}>
          <View className="home-card-icon">📖</View>
          <View className="home-card-body">
            <Text className="home-card-title">游戏玩法</Text>
            <Text className="home-card-sub">规则说明 · 新手教程 · 胜负条件</Text>
          </View>
          <Text className="home-card-arrow">›</Text>
        </View>
      </View>

      <View className="home-footer">
        <Text>叫上好友，一起摇骰子吧！</Text>
      </View>
    </View>
  )
}
