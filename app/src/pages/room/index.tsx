import { useEffect, useMemo, useState } from 'react'
import { View, Text, Input, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'

import Dice from '../../components/Dice'
import NavBar from '../../components/NavBar'
import Background from '../../components/Background'
import { ApiError } from '../../api/client'
import { getProfile } from '../../store/session'
import { room, subscribeRoom, getRoom, type RoomState } from '../../store/roomStore'
import './index.scss'

export default function Room() {
  const [state, setState] = useState<RoomState>(getRoom())
  const [showBid, setShowBid] = useState(false)
  const [qty, setQty] = useState(1)
  const [face, setFace] = useState(1)
  const [chatText, setChatText] = useState('')

  useEffect(() => subscribeRoom(setState), [])

  useDidShow(() => {
    void room.refresh()
  })

  const view = state.view
  const me = useMemo(() => view?.players.find((p) => p.seat === view.mySeat) || null, [view])
  const active = view?.players.filter((p) => !p.left) || []
  const isHost = view ? view.hostOpenid === getProfile()?.openid : false
  const isMyTurn = !!view && view.status === 'playing' && view.turnSeat === view.mySeat
  const minQty = view?.bid ? view.bid.quantity : Math.max(1, Math.floor(active.length / 2))

  useEffect(() => {
    if (showBid) {
      const q = view?.bid ? view.bid.quantity : minQty
      const f = view?.bid ? (view.bid.face < 6 ? view.bid.face + 1 : 6) : 1
      setQty(Math.max(q, minQty))
      setFace(f)
    }
  }, [showBid])

  const toast = (e: unknown) => {
    const msg = e instanceof ApiError ? e.message : '操作失败'
    Taro.showToast({ title: msg, icon: 'none' })
  }

  const onReady = async () => {
    try {
      await room.ready(!(me?.ready))
    } catch (e) {
      toast(e)
    }
  }
  const onStart = async () => {
    try {
      await room.start()
    } catch (e) {
      toast(e)
    }
  }
  const onBid = async () => {
    try {
      await room.bid(qty, face)
      setShowBid(false)
    } catch (e) {
      toast(e)
    }
  }
  const onChallenge = async () => {
    try {
      await room.challenge()
    } catch (e) {
      toast(e)
    }
  }
  const onNext = async () => {
    try {
      await room.next()
    } catch (e) {
      toast(e)
    }
  }
  const onLeave = async () => {
    await room.leave()
    Taro.reLaunch({ url: '/pages/index/index' })
  }
  const sendChat = () => {
    const t = chatText.trim()
    if (!t) return
    room.chat(t)
    setChatText('')
  }

  if (!view) {
    return (
      <View className="page page-wood room">
        <Background />
        <NavBar title="对局" onBack={onLeave} />
        <View className="room-empty">
          <Text>还没有进入房间</Text>
          <View className="btn btn-primary room-empty-btn" onClick={() => Taro.redirectTo({ url: '/pages/lobby/index' })}>
            去在线大厅
          </View>
        </View>
      </View>
    )
  }

  const opponents = view.players.filter((p) => p.left === false && p.seat !== view.mySeat)
  const bidText = view.bid ? `${view.bid.quantity} 个 ${view.bid.face}` : '等待叫点'

  return (
    <View className="page room">
      <Background />
      <NavBar
        title={`房间 ${view.roomId}`}
        onBack={onLeave}
        right={<Text className="room-menu" onClick={onLeave}>退</Text>}
      />

      <View className="room-info">
        <Text className="room-info-mode">{view.modeName}</Text>
        <Text className="room-info-dot">·</Text>
        <Text className="room-info-count">
          {active.length}/{view.targetScore >= 100 ? 5 : 6} 人
        </Text>
        {view.round > 0 ? <Text className="tag room-info-round">第 {view.round} 轮</Text> : null}
        <View className="fill" />
        <Text className="tag room-info-target">目标 {view.targetScore} 分</Text>
      </View>

      {/* 对手 */}
      <ScrollView scrollX className="room-opponents">
        {opponents.map((p) => (
          <View key={p.seat} className={`seat ${view.turnSeat === p.seat && view.status === 'playing' ? 'seat-turn' : ''}`}>
            <View className={`seat-avatar ${p.connected ? '' : 'seat-offline'}`}>{p.avatar || '🎲'}</View>
            <Text className="seat-name">{p.nickname}</Text>
            <Text className="seat-score">{p.score} 分</Text>
            <View className="seat-dice">
              {Array.from({ length: p.diceCount }).map((_, i) => (
                <Dice key={i} value={p.dice ? p.dice[i] : 0} size={34} dim={!p.dice} />
              ))}
            </View>
            {view.status === 'waiting' ? (
              <Text className={`seat-ready ${p.ready ? 'on' : ''}`}>{p.ready ? '已准备' : '未准备'}</Text>
            ) : null}
          </View>
        ))}
      </ScrollView>

      {/* 中央信息 */}
      <View className="room-center">
        {view.status === 'waiting' ? (
          <View className="room-waitcard">
            <Text className="room-waitcard-title">等待开始</Text>
            <Text className="room-waitcard-sub">邀请好友输入房间号 {view.roomId} 加入</Text>
          </View>
        ) : (
          <View className="room-bidcard">
            <Text className="room-bidcard-label">当前叫点</Text>
            <Text className="room-bidcard-value">{bidText}</Text>
            {view.turnSeat >= 0 && view.status === 'playing' ? (
              <Text className="room-bidcard-turn">
                {isMyTurn ? '轮到你了' : `等待 ${view.players.find((p) => p.seat === view.turnSeat)?.nickname || ''} 叫点`}
              </Text>
            ) : null}
          </View>
        )}

        {state.chats.length > 0 ? (
          <View className="room-chat-line">
            <Text>{state.chats[state.chats.length - 1].nickname}：{state.chats[state.chats.length - 1].text}</Text>
          </View>
        ) : null}
      </View>

      {/* 我的区域 */}
      <View className="room-me">
        <View className="room-me-head">
          <Text className="room-me-name">{me?.nickname}（我）</Text>
          <Text className="room-me-score">{me?.score ?? 0} 分</Text>
        </View>
        <View className="room-me-dice">
          {view.status === 'waiting'
            ? Array.from({ length: view.mode === 'classic' ? 5 : 3 }).map((_, i) => <Dice key={i} value={0} size={72} dim />)
            : view.myDice.map((d, i) => <Dice key={i} value={d} size={80} />)}
        </View>
      </View>

      {/* 操作栏 */}
      <View className="room-actions">
        {view.status === 'waiting' ? (
          <>
            <View className={`btn ${me?.ready ? 'btn-ghost' : 'btn-blue'} room-act`} onClick={onReady}>
              {me?.ready ? '取消准备' : '准备'}
            </View>
            {isHost ? (
              <View className="btn btn-primary room-act" onClick={onStart}>
                开始游戏
              </View>
            ) : null}
          </>
        ) : null}

        {view.status === 'playing' ? (
          <>
            <View className={`btn room-act btn-amber ${isMyTurn ? '' : 'btn-disabled'}`} onClick={() => isMyTurn && setShowBid(true)}>
              叫点数
            </View>
            <View className={`btn room-act btn-blue ${isMyTurn && view.bid ? '' : 'btn-disabled'}`} onClick={() => isMyTurn && view.bid && onChallenge()}>
              吹牛
            </View>
          </>
        ) : null}

        {view.status === 'roundEnd' || view.status === 'finished' ? (
          <>
            <View className="btn btn-primary room-act" onClick={onNext}>
              {view.status === 'finished' ? '再来一局' : '下一轮'}
            </View>
            <View className="btn btn-ghost room-act" onClick={onLeave}>
              返回大厅
            </View>
          </>
        ) : null}
      </View>

      {/* 聊天输入（对局中） */}
      {view.status !== 'waiting' ? (
        <View className="room-chatbar">
          <Input
            className="room-chat-input"
            value={chatText}
            placeholder="来一句…"
            onInput={(e) => setChatText(e.detail.value)}
            onConfirm={sendChat}
            confirmType="send"
          />
          <View className="room-chat-send" onClick={sendChat}>
            发送
          </View>
        </View>
      ) : null}

      {/* 叫点面板 */}
      {showBid ? (
        <View className="overlay" onClick={() => setShowBid(false)}>
          <View className="sheet" onClick={(e) => e.stopPropagation()}>
            <Text className="sheet-title">叫点数</Text>
            <Text className="sheet-label">数量（至少 {minQty}）</Text>
            <View className="stepper">
              <View className="stepper-btn" onClick={() => setQty((q) => Math.max(minQty, q - 1))}>
                −
              </View>
              <Text className="stepper-value">{qty}</Text>
              <View className="stepper-btn" onClick={() => setQty((q) => Math.min(active.length * 5, q + 1))}>
                +
              </View>
            </View>
            <Text className="sheet-label">点数</Text>
            <View className="face-row">
              {[1, 2, 3, 4, 5, 6].map((f) => (
                <View key={f} className={`face-item ${f === face ? 'face-item-on' : ''}`} onClick={() => setFace(f)}>
                  <Dice value={f} size={56} />
                </View>
              ))}
            </View>
            <View className="btn btn-primary sheet-confirm" onClick={onBid}>
              确认叫 {qty} 个 {face}
            </View>
          </View>
        </View>
      ) : null}

      {/* 结算 */}
      {state.roundResult || state.matchResult ? (
        <ResultOverlay state={state} onNext={onNext} onLeave={onLeave} />
      ) : null}
    </View>
  )
}

function ResultOverlay({ state, onNext, onLeave }: { state: RoomState; onNext: () => void; onLeave: () => void }) {
  const view = state.view
  if (!view) return null
  const match = state.matchResult || view.matchResult
  const round = state.roundResult || view.roundResult

  const ranking = match
    ? match.ranking
    : (round?.deltas || [])
        .slice()
        .sort((a, b) => b.score - a.score)
        .map((d) => {
          const p = view.players.find((x) => x.seat === d.seat)
          return { seat: d.seat, openid: p?.openid || '', nickname: p?.nickname || '', avatar: p?.avatar || '', score: d.score, delta: d.delta }
        })

  const winnerName = match
    ? view.players.find((p) => p.seat === match.winnerSeat)?.nickname
    : round
      ? view.players.find((p) => p.seat === round.winnerSeat)?.nickname
      : ''

  return (
    <View className="overlay">
      <View className="result card">
        <Text className="result-title">{match ? '本局结束' : `第 ${view.round} 轮结束`}</Text>
        <Text className="result-winner">🏆 {winnerName} 胜</Text>

        {round ? (
          <View className="result-reveal">
            <Text className="result-reveal-line">
              {round.bidderSeat >= 0 ? `${view.players.find((p) => p.seat === round.bidderSeat)?.nickname} 叫 ${round.bid.quantity} 个 ${round.bid.face}` : ''}
            </Text>
            <Text className="result-reveal-line">
              实际共 {round.actual} 个 {round.bid.face} → 叫点{round.bidTrue ? '成立' : '不成立'}
            </Text>
            <View className="result-reveal-dice">
              {round.reveal.map((r) => (
                <View key={r.seat} className="result-reveal-row">
                  <Text className="result-reveal-name">{r.nickname}</Text>
                  <View className="result-reveal-diceset">
                    {r.dice.map((d, i) => (
                      <Dice key={i} value={d} size={40} />
                    ))}
                  </View>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <View className="result-list">
          {ranking.map((r, i) => (
            <View key={r.seat} className="result-row">
              <Text className="result-rank">{i + 1}</Text>
              <View className="result-avatar">{r.avatar || '🎲'}</View>
              <Text className="result-name">{r.nickname}</Text>
              <View className="fill" />
              <Text className="result-score">{r.score}</Text>
            </View>
          ))}
        </View>

        <View className="result-actions">
          <View className="btn btn-primary result-btn" onClick={onNext}>
            {match ? '再来一局' : '下一轮'}
          </View>
          <View className="btn btn-ghost result-btn" onClick={onLeave}>
            返回大厅
          </View>
        </View>
      </View>
    </View>
  )
}
