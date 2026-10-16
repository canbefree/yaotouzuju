import Taro from '@tarojs/taro'

import { api } from '../api/client'
import { IS_H5, PLATFORM } from '../api/config'
import type { Profile } from '../api/types'

const TOKEN_KEY = 'yaotou.token'
const PROFILE_KEY = 'yaotou.profile'
const NAME_KEY = 'yaotou.devname'

let token: string = Taro.getStorageSync(TOKEN_KEY) || ''
let profile: Profile | null = Taro.getStorageSync(PROFILE_KEY) || null
let inflight: Promise<Profile> | null = null
const listeners = new Set<(p: Profile | null) => void>()

function emit(): void {
  listeners.forEach((fn) => fn(profile))
}

export function subscribeSession(fn: (p: Profile | null) => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function getToken(): string {
  return token
}

export function getProfile(): Profile | null {
  return profile
}

const ADJ = ['机灵', '快活', '淡定', '豪爽', '神秘', '幸运', '潇洒', '酷炫']
const NOUN = ['骰子王', '小狮子', '柯基', '狐狸', '熊猫', '老虎', '青蛙', '独角兽']

export function devName(): string {
  let name: string = Taro.getStorageSync(NAME_KEY)
  if (!name) {
    name = `${ADJ[Math.floor(Math.random() * ADJ.length)]}${NOUN[Math.floor(Math.random() * NOUN.length)]}`
    Taro.setStorageSync(NAME_KEY, name)
  }
  return name
}

export function setDevName(name: string): void {
  Taro.setStorageSync(NAME_KEY, name)
}

function loginPlatform(): 'dev' | 'wechat' | 'douyin' {
  if (IS_H5) return 'dev'
  if (PLATFORM === 'weapp') return 'wechat'
  if (PLATFORM === 'tt') return 'douyin'
  return 'dev'
}

async function loginCode(platform: 'dev' | 'wechat' | 'douyin'): Promise<string> {
  if (platform === 'dev') return `dev:${devName()}`
  const res = await Taro.login()
  return res.code
}

async function doLogin(): Promise<Profile> {
  const platform = loginPlatform()
  const code = await loginCode(platform)
  const res = await api.login(platform, code, platform === 'dev' ? devName() : undefined)
  token = res.token
  profile = { openid: res.openid, nickname: res.nickname, avatar: res.avatar }
  Taro.setStorageSync(TOKEN_KEY, token)
  Taro.setStorageSync(PROFILE_KEY, profile)
  emit()
  return profile
}

export function ensureLogin(): Promise<Profile> {
  if (token && profile) return Promise.resolve(profile)
  if (inflight) return inflight
  inflight = doLogin().finally(() => {
    inflight = null
  })
  return inflight
}

export function logout(): void {
  token = ''
  profile = null
  Taro.removeStorageSync(TOKEN_KEY)
  Taro.removeStorageSync(PROFILE_KEY)
  emit()
}

export async function updateNickname(nickname: string): Promise<Profile> {
  await ensureLogin()
  const res = await api.updateProfile(token, nickname, profile?.avatar || '')
  profile = { openid: res.openid, nickname: res.nickname, avatar: res.avatar }
  Taro.setStorageSync(PROFILE_KEY, profile)
  emit()
  return profile
}
