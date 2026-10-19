import { useEffect, useMemo, useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'

import Dice from '../../components/Dice'
import NavBar from '../../components/NavBar'
import Background from '../../components/Background'
import {
  aiAction,
  challenge,
  createLocalGame,
  isValidRaise,
  minFirstQuantity,
  nextRound,
  placeBid,
  type LocalState
} from '../../game/localGame'
import './index.scss'

type Phase = 'menu' | 'game' | 'records'

interface RecordRow {
  at: number
  players: number
  dice: number
  win: boolean
  score: number
}

const REC_KEY = 'yaotou.local.records'

export default function Local() {
  const [phase, setPhase] = useState<Phase>('menu')
  const [game, setGame] = useState<LocalState | null>(null)
  const [players, setPlayers] = useState(2)
  const [dice, setDice] = useState(5)
  const [target, setTarget] = useState(100)
  const [showBid, setShowBid] = useState(false)
  const [qty, setQty] = useState(1)
  const [face, setFace] = useState(1)
  const [records, setRecords] = useState<RecordRow[]>([])

  const me = game?.players.find((p) => p.seat === 0)
  const isMyTurn = !!game && game.status === 'playing' && game.turn === 0
  const minQty = game?.bid ? game.bid.quantity : game ? minFirstQuantity(game.players.length) : 1

  // AI 自动行动
  useEffect(() => {
    if (!game || game.status !== 'playing') return
    const current = game.players.find((p) => p.seat === game.turn)
    if (!current || !current.isAI) return
    const timer = setTimeout(() => {
      setGame((g) => {
        if (!g || g.status !== 'playing') return g
        const action = aiAction(g)
        return action.type === 'challenge' ? challenge(g, g.turn) : placeBid(g, g.turn, action.quantity, action.face)
      })
    }, 900 + Math.random() * 700)
    return () => clearTimeout(timer)
  }, [game])

  // 记录本地战绩
  useEffect(() => {
    if (!game || game.winnerSeat === null) return
    const row: RecordRow = {
      at: Date.now(),
      players: game.players.length,
      dice: game.dicePerPlayer,
      win: game.winnerSeat === 0,
      score: me?.score ?? 0
    }
    const list: RecordRow[] = Taro.getStorageSync(REC_KEY) || []
    const next = [row, ...list].slice(0, 20)
    Taro.setStorageSync(REC_KEY, next)
  }, [game?.winnerSeat])

  const openRecords = () => {
    setRecords((Taro.getStorageSync(REC_KEY) as RecordRow[]) || [])
    setPhase('records')
  }

  const start = (pc: number, d: number, t: number) => {
    setGame(createLocalGame(pc, d, t))
    setPhase('game')
  }

  const doBid = () => {
    if (!game) return
    if (!isValidRaise(game.bid, qty, face, game.players.length)) {
      Taro.showToast({ title: '叫点要大于上家', icon: 'none' })
      return
    }
    setGame(placeBid(game, 0, qty, face))
    setShowBid(false)
  }

  const doChallenge = () => {
    if (game && game.bid) setGame(challenge(game, 0))
  }

  const onNext = () => {
    if (game) setGame(nextRound(game))
  }

  const openBid = () => {
    if (!game) return
    setQty(game.bid ? game.bid.quantity : minQty)
    setFace(game.bid ? (game.bid.face < 6 ? game.bid.face + 1 : 6) : 1)
    setShowBid(true)
  }

  const opponents = useMemo(() => (game ? game.players.filter((p) => p.seat !== 0) : []), [game])

  if (phase === 'menu') {
    return (
      <View className="page page-paper local">
        <Background tone="paper" />
        <NavBar title="本地单机" />
        <View className="local-body">
          <View className="local-hero">
            <Text className="local-hero-title">一个人也能玩</Text>
            <Text className="local-hero-sub">练习技巧 · 挑战 AI · 自由畅玩</Text>
          </View>

          <View className="local-item card" onClick={() => start(2, 5, 100)}>
            <View className="local-item-icon">🤖</View>
            <View className="local-item-body">
              <Text className="local-item-title">单人挑战</Text>
              <Text className="local-item-sub">与 AI 对战，提升骰技</Text>
            </View>
            <Text className="local-item-arrow">›</Text>
          </View>

          <View className="card local-config">
            <Text className="local-config-title">自由模式</Text>
            <Row label="玩家人数" value={players} min={2} max={5} onChange={setPlayers} />
            <Row label="每人骰子" value={dice} min={2} max={5} onChange={setDice} />
            <Row label="目标分数" value={target} min={20} max={200} step={20} onChange={setTarget} />
            <View className="btn btn-primary local-start" onClick={() => start(players, dice, target)}>
              开始自由模式
            </View>
          </View>

          <View className="local-item card" onClick={openRecords}>
            <View className="local-item-icon">🏆</View>
            <View className="local-item-body">
              <Text className="local-item-title">游戏记录</Text>
              <Text className="local-item-sub">查看本地战绩</Text>
            </View>
            <Text className="local-item-arrow">›</Text>
          </View>
        </View>
      </View>
    )
  }

  if (phase === 'records') {
    return (
      <View className="page page-paper local">
        <Background tone="paper" />
        <NavBar title="游戏记录" onBack={() => setPhase('menu')} />
        <View className="local-body">
          {records.length === 0 ? (
            <Text className="local-empty">还没有本地对局记录</Text>
          ) : (
            records.map((r, i) => (
              <View key={i} className="card local-rec">
                <View className="fill">
                  <Text className="local-rec-title">
                    {r.win ? '胜利' : '未获胜'} · {r.players}人 / {r.dice}骰
                  </Text>
                  <Text className="local-rec-sub">{new Date(r.at).toLocaleString()}</Text>
                </View>
                <Text className={`local-rec-score ${r.win ? 'win' : ''}`}>{r.score} 分</Text>
              </View>
            ))
          )}
        </View>
      </View>
    )
  }

  if (!game) return null

  return (
    <View className="page local local-table">
      <Background />
      <NavBar title="本地对局" onBack={() => setPhase('menu')} />

      <View className="local-opps">
        {opponents.map((p) => (
          <View key={p.seat} className={`local-seat ${game.turn === p.seat && game.status === 'playing' ? 'on' : ''}`}>
            <View className="local-seat-avatar">{p.avatar}</View>
            <Text className="local-seat-name">{p.name}</Text>
            <Text className="local-seat-score">{p.score}</Text>
            <View className="local-seat-dice">
              {p.dice.map((d, i) => (
                <Dice key={i} value={game.status === 'roundEnd' ? d : 0} size={32} dim={game.status !== 'roundEnd'} />
              ))}
            </View>
          </View>
        ))}
      </View>

      <View className="local-center">
        <Text className="local-bid-value">{game.bid ? `${game.bid.quantity} 个 ${game.bid.face}` : '等待叫点'}</Text>
        <Text className="local-turn">
          {game.status === 'playing'
            ? isMyTurn
              ? '轮到你了'
              : `等待 ${game.players.find((p) => p.seat === game.turn)?.name} 思考…`
            : '本轮结束'}
        </Text>
      </View>

      <View className="local-me">
        <View className="local-me-head">
          <Text>我（{me?.score ?? 0} 分）</Text>
        </View>
        <View className="local-me-dice">
          {game.players[0].dice.map((d, i) => (
            <Dice key={i} value={d} size={78} />
          ))}
        </View>
      </View>

      <View className="local-actions">
        {game.status === 'playing' ? (
          <>
            <View className={`btn btn-amber local-act ${isMyTurn ? '' : 'btn-disabled'}`} onClick={() => isMyTurn && openBid()}>
              叫点数
            </View>
            <View className={`btn btn-blue local-act ${isMyTurn && game.bid ? '' : 'btn-disabled'}`} onClick={() => isMyTurn && game.bid && doChallenge()}>
              吹牛
            </View>
          </>
        ) : (
          <View className="btn btn-primary local-act" onClick={onNext}>
            {game.winnerSeat !== null ? '再来一局' : '下一轮'}
          </View>
        )}
      </View>

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
              <View className="stepper-btn" onClick={() => setQty((q) => q + 1)}>
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
            <View className="btn btn-primary sheet-confirm" onClick={doBid}>
              确认叫 {qty} 个 {face}
            </View>
          </View>
        </View>
      ) : null}

      {game.status === 'roundEnd' && game.result ? (
        <View className="overlay">
          <View className="card local-result">
            <Text className="local-result-title">
              {game.winnerSeat !== null ? '本局结束' : `第 ${game.round} 轮结束`}
            </Text>
            <Text className="local-result-winner">
              🏆 {game.players.find((p) => p.seat === game.result!.winnerSeat)?.name} 胜
            </Text>
            <Text className="local-result-line">
              实际共 {game.result.actual} 个 {game.result.bid.face} → 叫点{game.result.bidTrue ? '成立' : '不成立'}
            </Text>
            {game.result.reveal.map((r) => (
              <View key={r.seat} className="local-result-row">
                <Text className="local-result-name">{r.name}</Text>
                <View className="local-result-dice">
                  {r.dice.map((d, i) => (
                    <Dice key={i} value={d} size={36} />
                  ))}
                </View>
              </View>
            ))}
            <View className="btn btn-primary local-result-btn" onClick={onNext}>
              {game.winnerSeat !== null ? '再来一局' : '下一轮'}
            </View>
            <View className="btn btn-ghost local-result-btn" onClick={() => setPhase('menu')}>
              返回
            </View>
          </View>
        </View>
      ) : null}
    </View>
  )
}

function Row({
  label,
  value,
  min,
  max,
  step = 1,
  onChange
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
}) {
  return (
    <View className="local-row">
      <Text className="local-row-label">{label}</Text>
      <View className="stepper stepper-small">
        <View className="stepper-btn" onClick={() => onChange(Math.max(min, value - step))}>
          −
        </View>
        <Text className="stepper-value">{value}</Text>
        <View className="stepper-btn" onClick={() => onChange(Math.min(max, value + step))}>
          +
        </View>
      </View>
    </View>
  )
}
