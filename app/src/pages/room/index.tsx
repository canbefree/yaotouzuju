import { useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, Input, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'

import Dice from '../../components/Dice'
import NavBar from '../../components/NavBar'
import Background from '../../components/Background'
import BidPicker from '../../components/BidPicker'
import ResultReveal from '../../components/ResultReveal'
import { ApiError } from '../../api/client'
import { getProfile } from '../../store/session'
import { room, subscribeRoom, getRoom, type RoomState } from '../../store/roomStore'
import { bidFull, type BidChoice } from '../../game/bid'
import './index.scss'

export default function Room() {
  const [state, setState] = useState<RoomState>(getRoom())
  const [showBid, setShowBid] = useState(false)
  const [zhaiOnly, setZhaiOnly] = useState(false)
  const [chatText, setChatText] = useState('')
  const [rolling, setRolling] = useState(false)
  const [rollDice, setRollDice] = useState<number[]>([])
  const lastTurn = useRef<number>(-1)

  useEffect(() => subscribeRoom(setState), [])

  useDidShow(() => {
    void room.refresh()
  })

  const view = state.view
  const me = useMemo(() => view?.players.find((p) => p.seat === view.mySeat) || null, [view])
  const active = view?.players.filter((p) => !p.left) || []
  const isHost = view ? view.hostOpenid === getProfile()?.openid : false
  const isMyTurn = !!view && view.status === 'playing' && view.turnSeat === view.mySeat
  const anyNextReady = active.some((p) => p.nextReady)
  const iAmNextReady = !!me?.nextReady
  const nextLabel = iAmNextReady
    ? '已准备，等待他人'
    : anyNextReady
      ? '准备'
      : view?.status === 'finished'
        ? '再来一局'
        : '下一轮'
  const per = view?.dicePerPlayer || 5
  const totalDice = active.length * per

  // 开局/新一轮：摇骰动画
  useEffect(() => {
    if (!view || view.status !== 'playing' || view.round === 0) return
    let ticks = 0
    setRolling(true)
    const timer = setInterval(() => {
      setRollDice(Array.from({ length: per }, () => 1 + Math.floor(Math.random() * 6)))
      ticks += 1
      if (ticks >= 8) {
        clearInterval(timer)
        setRolling(false)
      }
    }, 70)
    return () => clearInterval(timer)
  }, [view?.round])

  // 轮到我：轻震动 + 提示
  useEffect(() => {
    if (!isMyTurn || !view) return
    if (lastTurn.current !== view.turnSeat) {
      lastTurn.current = view.turnSeat
      try {
        Taro.vibrateShort({ type: 'medium' })
      } catch {
        /* H5 可能不支持 */
      }
    }
  }, [isMyTurn])

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
  const onBid = async (choice: BidChoice) => {
    try {
      await room.bid(choice.kind, choice.quantity, choice.face)
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
  const isPillar = view.bid?.kind === 'pillar'
  // 高亮：叫点阶段，我的骰子里与当前叫点相同的；豹子（全同点）用加强特效
  const myHiFace = view.bid && view.status === 'playing' ? view.bid.face : 0
  const myBaozi = view.status === 'playing' && view.myDice.length > 1 && view.myDice.every((d) => d === view.myDice[0])

  return (
    <View className="page room">
      <Background />
      <NavBar
        title={`房间 ${view.roomId}`}
        onBack={onLeave}
        right={<Text className="room-menu" onClick={onLeave}>退</Text>}
      />

      <View className="room-info">
        <Text className="room-info-mode">{view.modeName} · 每人 {view.dicePerPlayer} 骰</Text>
        <Text className="room-info-dot">·</Text>
        <Text className="room-info-count">
          {active.length}/{view.maxPlayers} 人
        </Text>
        {view.round > 0 ? <Text className="tag room-info-round">第 {view.round} 轮</Text> : null}
        <View className="fill" />
      </View>

      {/* 对手 */}
      <ScrollView scrollX className="room-opponents">
        {opponents.map((p) => (
          <View key={p.seat} className={`seat ${view.turnSeat === p.seat && view.status === 'playing' ? 'seat-turn' : ''}`}>
            <View className={`seat-avatar ${p.connected ? '' : 'seat-offline'}`}>{p.avatar || '🎲'}</View>
            <Text className="seat-name">{p.nickname}</Text>
            <Text className="seat-score">{p.penalties} 罚</Text>
            <View className="seat-dice">
              {Array.from({ length: p.diceCount }).map((_, i) => (
                <Dice key={i} value={p.dice ? p.dice[i] : 0} size={44} zhai={isPillar} />
              ))}
            </View>
            {view.status === 'waiting' || view.status === 'roundEnd' || view.status === 'finished' ? (
              <Text
                className={`seat-ready ${(view.status === 'waiting' ? p.ready : p.nextReady) ? 'on' : ''}`}
              >
                {(view.status === 'waiting' ? p.ready : p.nextReady) ? '已准备' : '未准备'}
              </Text>
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
          <View key={view.bid?.at || 0} className={`room-bidcard ${view.bid ? 'bid-pop' : ''} ${isPillar ? 'bidcard-pillar' : ''}`}>
            <Text className="room-bidcard-label">{isPillar ? '当前叫斋' : '当前叫点'}</Text>
            <View className="room-bidcard-row">
              {isPillar ? <View className="pillar-badge">斋</View> : null}
              <Text className="room-bidcard-value">{view.bid ? bidFull(view.bid) : '等待叫点'}</Text>
            </View>
            <Text className="room-bidcard-by">
              {view.bid ? `${view.players.find((p) => p.seat === view.bid?.seat)?.nickname || ''} 喊的` : ''}
            </Text>
            {view.turnSeat >= 0 && view.status === 'playing' ? (
              <Text className={`room-bidcard-turn ${isMyTurn ? 'turn-mine' : ''}`}>
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
          <Text className="room-me-score">{me?.penalties ?? 0} 罚</Text>
        </View>
        <View className="room-me-dice">
          {view.status === 'waiting'
            ? Array.from({ length: per }).map((_, i) => <Dice key={i} value={0} size={128} />)
            : view.myDice.map((d, i) => (
                <Dice
                  key={i}
                  value={rolling ? rollDice[i] || d : d}
                  size={128}
                  rolling={rolling}
                  variant={myBaozi ? 'effect' : d === myHiFace ? 'pick' : 'normal'}
                  zhai={isPillar}
                />
              ))}
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
            <View
              className={`btn room-act btn-amber ${isMyTurn ? 'act-glow' : 'btn-disabled'}`}
              onClick={() => {
                if (!isMyTurn) return
                setZhaiOnly(false)
                setShowBid(true)
              }}
            >
              {isPillar ? '叫斋' : '叫点数'}
            </View>
            {!isPillar ? (
              <View
                className={`btn room-act btn-gold ${isMyTurn && view.bid ? 'act-glow' : 'btn-disabled'}`}
                onClick={() => {
                  if (!isMyTurn || !view.bid) return
                  setZhaiOnly(true)
                  setShowBid(true)
                }}
              >
                斋
              </View>
            ) : null}
            <View className={`btn room-act btn-blue ${isMyTurn && view.bid ? 'act-glow-blue' : 'btn-disabled'}`} onClick={() => isMyTurn && view.bid && onChallenge()}>
              吹牛
            </View>
          </>
        ) : null}

        {view.status === 'roundEnd' || view.status === 'finished' ? (
          <>
            <View
              className={`btn btn-primary room-act ${iAmNextReady ? 'btn-disabled' : ''}`}
              onClick={() => !iAmNextReady && onNext()}
            >
              {nextLabel}
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

      <BidPicker
        visible={showBid}
        prev={view.bid}
        playerCount={active.length}
        totalDice={totalDice}
        forcePillar={zhaiOnly}
        onClose={() => {
          setShowBid(false)
          setZhaiOnly(false)
        }}
        onConfirm={onBid}
      />

      {/* 结算 */}
      {(state.roundResult || state.matchResult || view.roundResult || view.matchResult) && !iAmNextReady ? (
        <ResultOverlay state={state} onNext={onNext} onLeave={onLeave} nextLabel={nextLabel} />
      ) : null}
    </View>
  )
}

function ResultOverlay({
  state,
  onNext,
  onLeave,
  nextLabel
}: {
  state: RoomState
  onNext: () => void
  onLeave: () => void
  nextLabel: string
}) {
  const view = state.view
  if (!view) return null
  const match = state.matchResult || view.matchResult
  const round = state.roundResult || view.roundResult

  const players = round ? round.reveal.map((r) => ({ seat: r.seat, name: r.nickname, dice: r.dice })) : []
  const loserName = round ? view.players.find((p) => p.seat === round.loserSeat)?.nickname || '' : ''
  const board = view.players
    .filter((p) => !p.left)
    .map((p) => ({ name: p.nickname, count: p.penalties, me: p.seat === view.mySeat }))

  return (
    <ResultReveal
      title={match ? '游戏结束！' : `第 ${view.round} 轮结束`}
      bid={round?.bid ?? null}
      players={players}
      actual={round?.actual ?? 0}
      bidTrue={round?.bidTrue ?? false}
      penalty={round?.penalty || ''}
      loserName={loserName}
      loserIsMe={!!round && round.loserSeat === view.mySeat}
      board={board}
      nextLabel={nextLabel}
      onNext={onNext}
      onLeave={onLeave}
      sessionKey={`${view.round}-${match ? 'm' : 'r'}`}
    />
  )
}
