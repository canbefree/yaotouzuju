import { useState } from 'react'
import { View, Text, Input } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'

import NavBar from '../../components/NavBar'
import Background from '../../components/Background'
import { api, ApiError } from '../../api/client'
import type { ModeConfig, PublicRoom } from '../../api/types'
import { room } from '../../store/roomStore'
import './index.scss'

interface Recent {
  roomId: string
  modeName: string
}

export default function Lobby() {
  const [dice, setDice] = useState(5)
  const [modes, setModes] = useState<ModeConfig[]>([])
  const [rooms, setRooms] = useState<PublicRoom[]>([])
  const [recent, setRecent] = useState<Recent[]>([])
  const [showJoin, setShowJoin] = useState(false)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)

  const load = async () => {
    setRecent((Taro.getStorageSync('yaotou.recent') as Recent[]) || [])
    try {
      const [ms, rs] = await Promise.all([api.modes(), api.roomList()])
      setModes(ms)
      setRooms(rs)
      const cfg = ms[0]
      if (cfg) setDice((d) => Math.min(Math.max(d, cfg.minDicePerPlayer), cfg.maxDicePerPlayer))
    } catch {
      /* ignore */
    }
  }

  useDidShow(() => {
    void load()
  })

  const run = async (fn: () => Promise<unknown>) => {
    if (busy) return
    setBusy(true)
    try {
      await fn()
      Taro.navigateTo({ url: '/pages/room/index' })
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : '操作失败，请重试'
      Taro.showToast({ title: msg, icon: 'none' })
    } finally {
      setBusy(false)
    }
  }

  const onCreate = () => run(() => room.create('classic', dice))
  const onQuick = () => run(() => room.quick(dice))
  const cfg = modes[0]
  const minDice = cfg?.minDicePerPlayer ?? 2
  const maxDice = cfg?.maxDicePerPlayer ?? 8
  const onJoin = () => {
    if (code.trim().length < 4) {
      Taro.showToast({ title: '请输入房间号', icon: 'none' })
      return
    }
    void run(() => room.join(code.trim()))
  }

  return (
    <View className="page page-paper lobby">
      <Background tone="paper" />
      <NavBar title="在线游戏" />
      <View className="lobby-body">
        <View className="lobby-banner">
          <Text className="lobby-banner-title">好友组局 欢乐对战</Text>
          <Text className="lobby-banner-sub">创建房间，邀请好友，随时开一局</Text>
        </View>

        <View className="mode-pill">吹牛骰 · 先到 100 分胜</View>

        <View className="dice-set card">
          <View className="dice-set-left">
            <Text className="dice-set-title">每人骰子</Text>
            <Text className="dice-set-sub">默认为 5 颗</Text>
          </View>
          <View className="stepper stepper-small">
            <View className="stepper-btn" onClick={() => setDice((d) => Math.max(minDice, d - 1))}>
              −
            </View>
            <Text className="stepper-value">{dice}</Text>
            <View className="stepper-btn" onClick={() => setDice((d) => Math.min(maxDice, d + 1))}>
              +
            </View>
          </View>
        </View>

        <View className="lobby-actions">
          <View className="btn btn-primary lobby-btn" onClick={onCreate}>
            创建房间
          </View>
          <View className="btn btn-blue lobby-btn" onClick={() => setShowJoin((v) => !v)}>
            加入房间
          </View>
          <View className="btn btn-purple lobby-btn" onClick={onQuick}>
            快速匹配
          </View>
        </View>

        {showJoin ? (
          <View className="join-box card">
            <Input
              className="join-input"
              type="text"
              maxlength={8}
              placeholder="输入 6 位房间号"
              value={code}
              focus={showJoin}
              onInput={(e) => setCode((e.detail.value || '').toUpperCase())}
            />
            <View className="btn btn-amber btn-sm join-go" onClick={onJoin}>
              进入
            </View>
          </View>
        ) : null}

        {recent.length > 0 ? (
          <View className="lobby-section">
            <Text className="lobby-section-title">最近的房间</Text>
            {recent.map((r) => (
              <View key={r.roomId} className="room-row card" onClick={() => void run(() => room.join(r.roomId))}>
                <View className="room-avatar">🎲</View>
                <View className="room-row-body">
                  <Text className="room-row-name">房间 {r.roomId}</Text>
                  <Text className="room-row-sub">{r.modeName || '吹牛骰'}</Text>
                </View>
                <Text className="room-row-arrow">›</Text>
              </View>
            ))}
          </View>
        ) : null}

        <View className="lobby-section">
          <Text className="lobby-section-title">大厅房间</Text>
          {rooms.length === 0 ? (
            <Text className="lobby-empty">暂时没有等待中的房间，点「快速匹配」开局吧</Text>
          ) : (
            rooms.map((r) => (
              <View key={r.roomId} className="room-row card" onClick={() => void run(() => room.join(r.roomId))}>
                <View className="room-avatar">🎲</View>
                <View className="room-row-body">
                  <Text className="room-row-name">房间 {r.roomId}</Text>
                  <Text className="room-row-sub">
                    {r.count}/{r.maxPlayers} 人 · 每人 {r.dicePerPlayer} 骰
                  </Text>
                </View>
                <Text className="room-row-arrow">›</Text>
              </View>
            ))
          )}
        </View>
      </View>
    </View>
  )
}
