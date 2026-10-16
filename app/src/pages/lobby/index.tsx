import { useState } from 'react'
import { View, Text, Input } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'

import NavBar from '../../components/NavBar'
import { api, ApiError } from '../../api/client'
import type { ModeConfig, ModeId, PublicRoom } from '../../api/types'
import { room } from '../../store/roomStore'
import './index.scss'

interface Recent {
  roomId: string
  modeName: string
}

export default function Lobby() {
  const [mode, setMode] = useState<ModeId>('classic')
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

  const onCreate = () => run(() => room.create(mode))
  const onQuick = () => run(() => room.quick(mode))
  const onJoin = () => {
    if (code.trim().length < 4) {
      Taro.showToast({ title: '请输入房间号', icon: 'none' })
      return
    }
    void run(() => room.join(code.trim()))
  }

  const modeInfo = modes.find((m) => m.id === mode)

  return (
    <View className="page page-paper lobby">
      <NavBar title="在线游戏" />
      <View className="lobby-body">
        <View className="lobby-banner">
          <Text className="lobby-banner-title">好友组局 欢乐对战</Text>
          <Text className="lobby-banner-sub">创建房间，邀请好友，随时开一局</Text>
        </View>

        <View className="seg">
          {(['classic', 'quick'] as ModeId[]).map((m) => (
            <View key={m} className={`seg-item ${m === mode ? 'seg-item-on' : ''}`} onClick={() => setMode(m)}>
              {m === 'classic' ? '吹牛骰 · 5骰' : '大话骰 · 3骰'}
            </View>
          ))}
        </View>
        {modeInfo ? <Text className="lobby-mode-desc">{modeInfo.desc}</Text> : null}

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
                    {r.count}/{r.maxPlayers} 人 · {r.modeName}
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
