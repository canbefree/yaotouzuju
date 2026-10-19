import Taro from '@tarojs/taro'

import { HTTP_BASE, WS_BASE } from './config'
import type { ModeConfig, PublicRoom, RoomView, ScoreRow } from './types'

export class ApiError extends Error {
  code: string
  constructor(code: string, msg: string) {
    super(msg)
    this.code = code
  }
}

interface ApiResp<T> {
  ok: boolean
  data: T
  code?: string
  msg?: string
}

interface ReqOptions {
  method?: 'GET' | 'POST'
  token?: string
  data?: Record<string, unknown>
}

async function request<T>(path: string, options: ReqOptions = {}): Promise<T> {
  const { method = 'POST', token, data } = options
  const res = await Taro.request({
    url: `${HTTP_BASE}/api${path}`,
    method,
    data,
    header: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {})
    }
  })
  const body = res.data as ApiResp<T>
  if (!body || body.ok !== true) {
    throw new ApiError(body?.code || 'ERROR', body?.msg || '请求失败')
  }
  return body.data
}

export interface LoginResult {
  token: string
  openid: string
  nickname: string
  avatar: string
}

export const api = {
  health: () => request<Record<string, unknown>>('/health', { method: 'GET' }),
  modes: () => request<ModeConfig[]>('/modes', { method: 'GET' }),
  login: (platform: string, code: string, nickname?: string) =>
    request<LoginResult>('/login', { data: { platform, code, nickname } }),
  updateProfile: (token: string, nickname: string, avatar: string) =>
    request<{ openid: string; nickname: string; avatar: string }>('/profile', { token, data: { nickname, avatar } }),

  createRoom: (token: string, mode: string, dicePerPlayer: number) =>
    request<RoomView>('/room/create', { token, data: { mode, dicePerPlayer } }),
  quickMatch: (token: string, dicePerPlayer: number) =>
    request<RoomView>('/room/quick', { token, data: { dicePerPlayer } }),
  joinRoom: (token: string, roomId: string) => request<RoomView>('/room/join', { token, data: { roomId } }),
  roomList: () => request<PublicRoom[]>('/room/list', { method: 'GET' }),
  roomState: (token: string, roomId: string) =>
    request<RoomView>(`/room/state?roomId=${encodeURIComponent(roomId)}`, { method: 'GET', token }),
  ready: (token: string, roomId: string, ready: boolean) =>
    request<RoomView>('/room/ready', { token, data: { roomId, ready } }),
  start: (token: string, roomId: string) => request<RoomView>('/room/start', { token, data: { roomId } }),
  leave: (token: string, roomId: string) => request<{ left: boolean }>('/room/leave', { token, data: { roomId } }),

  bid: (token: string, roomId: string, kind: 'point' | 'pillar', quantity: number, face: number) =>
    request<RoomView>('/game/bid', { token, data: { roomId, kind, quantity, face } }),
  challenge: (token: string, roomId: string) => request<RoomView>('/game/challenge', { token, data: { roomId } }),
  next: (token: string, roomId: string) => request<RoomView>('/game/next', { token, data: { roomId } }),

  rank: (mode: string) => request<ScoreRow[]>(`/rank?mode=${mode}`, { method: 'GET' })
}

export interface ServerMessage<T = unknown> {
  type: string
  data?: T
}

export interface Socket {
  send: (msg: Record<string, unknown>) => void
  close: () => void
}

export async function connectWs(
  token: string,
  onMessage: (msg: ServerMessage) => void,
  onStatus?: (open: boolean) => void
): Promise<Socket> {
  const task = await Taro.connectSocket({ url: `${WS_BASE}/ws?token=${encodeURIComponent(token)}` })
  task.onOpen(() => onStatus?.(true))
  task.onClose(() => onStatus?.(false))
  task.onError(() => onStatus?.(false))
  task.onMessage((res) => {
    try {
      onMessage(JSON.parse(res.data as string) as ServerMessage)
    } catch {
      /* ignore */
    }
  })
  return {
    send: (msg) => task.send({ data: JSON.stringify(msg) }),
    close: () => {
      try {
        task.close({})
      } catch {
        /* ignore */
      }
    }
  }
}
