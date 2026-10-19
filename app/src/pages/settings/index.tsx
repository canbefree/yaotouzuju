import { useState } from 'react'
import { View, Text, Input, Switch } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'

import NavBar from '../../components/NavBar'
import Background from '../../components/Background'
import { api } from '../../api/client'
import type { ScoreRow } from '../../api/types'
import { getProfile, logout, updateNickname } from '../../store/session'
import './index.scss'

const SETTINGS_KEY = 'yaotou.settings'

interface Prefs {
  sound: boolean
  music: boolean
  vibrate: boolean
  hd: boolean
}

const DEFAULT_PREFS: Prefs = { sound: true, music: true, vibrate: true, hd: false }

export default function Settings() {
  const [prefs, setPrefs] = useState<Prefs>({ ...DEFAULT_PREFS, ...(Taro.getStorageSync(SETTINGS_KEY) || {}) })
  const [nickname, setNickname] = useState(getProfile()?.nickname || '')
  const [version, setVersion] = useState('')
  const [online, setOnline] = useState<number | null>(null)
  const [rank, setRank] = useState<ScoreRow[]>([])

  useDidShow(() => {
    void (async () => {
      try {
        const h = await api.health()
        setVersion(String(h.version || ''))
        setOnline(Number(h.online || 0))
        setRank(await api.rank('classic'))
      } catch {
        /* 离线时忽略 */
      }
    })()
    const p = getProfile()
    if (p) setNickname(p.nickname)
  })

  const save = (patch: Partial<Prefs>) => {
    const next = { ...prefs, ...patch }
    setPrefs(next)
    Taro.setStorageSync(SETTINGS_KEY, next)
  }

  const onSaveName = async () => {
    const name = nickname.trim()
    if (!name) return
    try {
      await updateNickname(name)
      Taro.showToast({ title: '已保存', icon: 'success' })
    } catch {
      Taro.showToast({ title: '保存失败', icon: 'none' })
    }
  }

  const onLogout = () => {
    logout()
    Taro.reLaunch({ url: '/pages/index/index' })
  }

  return (
    <View className="page page-paper settings">
      <Background tone="paper" />
      <NavBar title="设置" />
      <View className="settings-body">
        <View className="card settings-card">
          <Text className="settings-label">昵称</Text>
          <View className="settings-name-row">
            <Input className="settings-input" value={nickname} onInput={(e) => setNickname(e.detail.value)} maxlength={12} />
            <View className="btn btn-amber btn-sm settings-save" onClick={onSaveName}>
              保存
            </View>
          </View>
        </View>

        <View className="card settings-card">
          <Toggle label="声音效果" value={prefs.sound} onChange={(v) => save({ sound: v })} />
          <Toggle label="背景音乐" value={prefs.music} onChange={(v) => save({ music: v })} />
          <Toggle label="振动反馈" value={prefs.vibrate} onChange={(v) => save({ vibrate: v })} />
          <Toggle label="高清画面" value={prefs.hd} onChange={(v) => save({ hd: v })} />
        </View>

        <View className="card settings-card">
          <View className="settings-line">
            <Text className="settings-label">语言</Text>
            <Text className="settings-value">简体中文</Text>
          </View>
          <View className="settings-line">
            <Text className="settings-label">服务器</Text>
            <Text className="settings-value">{version ? `在线 ${online ?? 0} 人 · ${version}` : '未连接'}</Text>
          </View>
          <View className="settings-line">
            <Text className="settings-label">关于我们</Text>
            <Text className="settings-value">摇骰组局 v1.0</Text>
          </View>
        </View>

        <View className="card settings-card">
          <Text className="settings-label">排行榜 · 吹牛骰</Text>
          {rank.length === 0 ? (
            <Text className="settings-empty">暂无战绩，快去开一局</Text>
          ) : (
            rank.slice(0, 5).map((r) => (
              <View key={r.openid} className="settings-rank">
                <Text className="settings-rank-no">{r.rank}</Text>
                <Text className="settings-rank-name">{r.nickname}</Text>
                <View className="fill" />
                <Text className="settings-rank-points">{r.points} 分</Text>
              </View>
            ))
          )}
        </View>

        <View className="btn btn-ghost settings-logout" onClick={onLogout}>
          退出登录
        </View>
      </View>
    </View>
  )
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View className="settings-line">
      <Text className="settings-label">{label}</Text>
      <Switch checked={value} color="#f5a623" onChange={(e) => onChange(e.detail.value)} />
    </View>
  )
}
