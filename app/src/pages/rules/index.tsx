import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'

import NavBar from '../../components/NavBar'
import Background from '../../components/Background'
import './index.scss'

const RULES = [
  '每人摇出 5 颗骰子（大话骰为 3 颗），只有自己能看到。',
  '轮流叫点数：数量 + 点数，例如「3 个 3」「4 个 6」。',
  '每次叫点必须比上家大：数量更多，或数量相同但点数更大。',
  '普通叫点时 1 点万能，可以当任何点数；叫「1」时只数 1。',
  '喊「斋」时也要报数量和点数，但 1 点不再万能，只算普通骰子；喊过斋后只能继续加斋。',
  '轮到你时也可以「吹牛」质疑上家，翻开全部骰子查看结果。',
  '若实际数量 ≥ 叫的数量，叫点成立，质疑者受罚；否则叫点者受罚。',
  '每轮只有一个人输：输家从惩罚池随机抽一条（喝一杯、真心话、大冒险…），累计受罚次数会记在座位上。',
  '没有积分和对局结束，想玩几轮玩几轮；每轮结束所有人「准备」后开下一轮。'
]

export default function Rules() {
  return (
    <View className="page page-paper rules">
      <Background tone="paper" />
      <NavBar title="游戏玩法" />
      <View className="rules-body">
        <View className="rules-hero">
          <Text className="rules-hero-title">吹牛骰 / 大话骰</Text>
          <Text className="rules-hero-sub">猜骰子 · 叫点数 · 比心理</Text>
        </View>

        <View className="card rules-card">
          <Text className="rules-card-title">游戏简介</Text>
          <Text className="rules-text">
            每个玩家在自己的回合中摇骰子，可以选择「叫点数」或「吹牛」。其他玩家根据骰子结果判断是否质疑，
            成功则继续，失败则受罚。先达到指定分数的玩家获胜。
          </Text>
        </View>

        <View className="card rules-card">
          <Text className="rules-card-title">基本规则</Text>
          {RULES.map((r, i) => (
            <View key={i} className="rules-item">
              <View className="rules-index">{i + 1}</View>
              <Text className="rules-item-text">{r}</Text>
            </View>
          ))}
        </View>

        <View className="btn btn-primary rules-start" onClick={() => Taro.navigateTo({ url: '/pages/lobby/index' })}>
          开始游戏
        </View>
      </View>
    </View>
  )
}
