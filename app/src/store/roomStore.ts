import Taro from '@tarojs/taro'

import { api, ApiError, connectWs, type Socket } from '../api/client'
import type { MatchResult, RoomView, RoundResult } from '../api/types'
import { ensureLogin, getToken } from './session'

export interface ChatMsg {
  seat: number
  openid: string
  nickname: string
  text: string
  at: number
}

export interface RoomState {
  view: RoomView | null
  connected: boolean
  chats: ChatMsg[]
  roundResult: RoundResult | null
  matchResult: MatchResult | null
}

const LAST_ROOM_KEY = 'yaotou.lastRoom'

let state: RoomState = { view: null, connected: false, chats: [], roundResult: null, matchResult: null }
const listeners = new Set<(s: RoomState) => void>()
let socket: Socket | null = null

function emit(): void {
  listeners.forEach((fn) => fn(state))
}

function setState(patch: Partial<RoomState>): void {
  state = { ...state, ...patch }
  emit()
}

export function subscribeRoom(fn: (s: RoomState) => void): () => void {
  listeners.add(fn)
  fn(state)
  return () => listeners.delete(fn)
}

export function getRoom(): RoomState {
  return state
}

function ensureSocket(): void {
  if (socket) return
  const token = getToken()
  if (!token) return
  void connectWs(
    token,
    (msg) => {
      if (msg.type === 'room_state' && msg.data) {
        setState({ view: msg.data as RoomView })
      } else if (msg.type === 'round_end' && msg.data) {
        setState({ roundResult: msg.data as RoundResult })
      } else if (msg.type === 'match_end' && msg.data) {
        setState({ matchResult: msg.data as MatchResult })
      } else if (msg.type === 'chat' && msg.data) {
        setState({ chats: [...state.chats.slice(-60), msg.data as ChatMsg] })
      }
    },
    (open) => setState({ connected: open })
  ).then((s) => {
    socket = s
  })
}

async function afterEnter(view: RoomView): Promise<RoomView> {
  Taro.setStorageSync(LAST_ROOM_KEY, view.roomId)
  const list: { roomId: string; modeName: string }[] = Taro.getStorageSync('yaotou.recent') || []
  const next = [{ roomId: view.roomId, modeName: view.modeName }, ...list.filter((r) => r.roomId !== view.roomId)].slice(0, 5)
  Taro.setStorageSync('yaotou.recent', next)
  setState({ view, roundResult: view.roundResult, matchResult: view.matchResult, chats: [] })
  ensureSocket()
  return view
}

export const room = {
  lastRoomId(): string {
    return Taro.getStorageSync(LAST_ROOM_KEY) || ''
  },
  recentRooms(): string[] {
    const list: string[] = Taro.getStorageSync('yaotou.recent') || []
    return list
  },
  rememberRoom(roomId: string, modeName = ''): void {
    const list: { roomId: string; modeName: string }[] = Taro.getStorageSync('yaotou.recent') || []
    const next = [{ roomId, modeName }, ...list.filter((r) => r.roomId !== roomId)].slice(0, 5)
    Taro.setStorageSync('yaotou.recent', next)
  },

  async create(mode: string, dicePerPlayer: number): Promise<RoomView> {
    await ensureLogin()
    return afterEnter(await api.createRoom(getToken(), mode, dicePerPlayer))
  },
  async quick(dicePerPlayer: number): Promise<RoomView> {
    await ensureLogin()
    return afterEnter(await api.quickMatch(getToken(), dicePerPlayer))
  },
  async join(roomId: string): Promise<RoomView> {
    await ensureLogin()
    return afterEnter(await api.joinRoom(getToken(), roomId.toUpperCase()))
  },
  async refresh(): Promise<void> {
    const id = state.view?.roomId
    if (!id) return
    await ensureLogin()
    try {
      const view = await api.roomState(getToken(), id)
      setState({ view })
    } catch (e) {
      if (e instanceof ApiError && e.code === 'ROOM_NOT_FOUND') {
        setState({ view: null })
      }
    }
  },
  async ready(ready: boolean): Promise<void> {
    const id = state.view?.roomId
    if (!id) return
    setState({ view: await api.ready(getToken(), id, ready) })
  },
  async start(): Promise<void> {
    const id = state.view?.roomId
    if (!id) return
    setState({ view: await api.start(getToken(), id) })
  },
  async bid(kind: 'point' | 'pillar', quantity: number, face: number): Promise<void> {
    const id = state.view?.roomId
    if (!id) return
    setState({ view: await api.bid(getToken(), id, kind, quantity, face) })
  },
  async challenge(): Promise<void> {
    const id = state.view?.roomId
    if (!id) return
    setState({ view: await api.challenge(getToken(), id) })
  },
  async next(): Promise<void> {
    const id = state.view?.roomId
    if (!id) return
    setState({ view: await api.next(getToken(), id), roundResult: null, matchResult: null })
  },
  async leave(): Promise<void> {
    const id = state.view?.roomId
    if (id) {
      try {
        await api.leave(getToken(), id)
      } catch {
        /* ignore */
      }
    }
    Taro.removeStorageSync(LAST_ROOM_KEY)
    setState({ view: null, roundResult: null, matchResult: null, chats: [] })
  },
  chat(text: string): void {
    socket?.send({ type: 'chat', text })
  },
  clearOverlays(): void {
    setState({ roundResult: null, matchResult: null })
  }
}
