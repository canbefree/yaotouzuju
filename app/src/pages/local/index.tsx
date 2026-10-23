import { useEffect, useMemo, useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'

import Dice from '../../components/Dice'
import NavBar from '../../components/NavBar'
import Background from '../../components/Background'
import BidPicker from '../../components/BidPicker'
import {
  aiAction,
  challenge,
  createLocalGame,
  nextRound,
  placeBid,
  type LocalState
} from '../../game/localGame'
import { bidFull, type BidChoice } from '../../game/bid'
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
  const [rolling, setRolling] = useState(false)
  const [rollDice, setRollDice] = useState<number[]>([])
  const [records, setRecords] = useState<RecordRow[]>([])

  const me = game?.players.find((p) => p.seat === 0)
  const isMyTurn = !!game && game.status === 'playing' && game.turn === 0
  const myDice = game?.players[0]?.dice || []
  const myHiFace = game?.bid && game.bid.kind !== 'pillar' && game.status === 'playing' ? game.bid.face : 0
  const myBaozi = !!game && game.status === 'playing' && myDice.length > 1 && myDice.every((d) => d === myDice[0])

  // 新一轮摇骰动画
  useEffect(() => {
    if (!game || game.status !== 'playing') return
    const per = game.dicePerPlayer
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
  }, [game?.round])

  // AI 自动行动
  useEffect(() => {
    if (!game || game.status !== 'playing') return
    const current = game.players.find((p) => p.seat === game.turn)
    if (!current || !current.isAI) return
    const timer = setTimeout(() => {
      setGame((g) => {
        if (!g || g.status !== 'playing') return g
        const action = aiAction(g)
        return action.type === 'challenge' ? challenge(g, g.turn) : placeBid(g, g.turn, action.kind, action.quantity, action.face)
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

  const doBid = (choice: BidChoice) => {
    if (!game) return
    setGame(placeBid(game, 0, choice.kind, choice.quantity, choice.face))
    setShowBid(false)
  }

  const doChallenge = () => {
    if (game && game.bid) setGame(challenge(game, 0))
  }

  const onNext = () => {
    if (game) setGame(nextRound(game))
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
                <Dice key={i} value={game.status === 'roundEnd' ? d : 0} size={44} />
              ))}
            </View>
          </View>
        ))}
      </View>

      <View className="local-center">
        <View key={game.bid ? `${game.bid.seat}-${game.bid.kind}-${game.bid.quantity}-${game.bid.face}` : 'none'} className={`local-bid ${game.bid ? 'bid-pop' : ''}`}>
          {game.bid?.kind === 'pillar' ? <View className="pillar-badge">柱</View> : null}
          <Text className="local-bid-value">{game.bid ? bidFull(game.bid) : '等待叫点'}</Text>
        </View>
        <Text className={`local-turn ${isMyTurn ? 'turn-mine' : ''}`}>
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
          {myDice.map((d, i) => (
            <Dice
              key={i}
              value={rolling ? rollDice[i] || d : d}
              size={128}
              rolling={rolling}
              variant={myBaozi ? 'glow' : d === myHiFace ? 'selected' : 'normal'}
            />
          ))}
        </View>
      </View>

      <View className="local-actions">
        {game.status === 'playing' ? (
          <>
            <View className={`btn btn-amber local-act ${isMyTurn ? 'act-glow' : 'btn-disabled'}`} onClick={() => isMyTurn && setShowBid(true)}>
              叫点数
            </View>
            <View className={`btn btn-blue local-act ${isMyTurn && game.bid ? 'act-glow-blue' : 'btn-disabled'}`} onClick={() => isMyTurn && game.bid && doChallenge()}>
              吹牛
            </View>
          </>
        ) : (
          <View className="btn btn-primary local-act" onClick={onNext}>
            {game.winnerSeat !== null ? '再来一局' : '下一轮'}
          </View>
        )}
      </View>

      <BidPicker
        visible={showBid}
        prev={game.bid}
        playerCount={game.players.length}
        totalDice={game.players.length * game.dicePerPlayer}
        onClose={() => setShowBid(false)}
        onConfirm={doBid}
      />

      {game.status === 'roundEnd' && game.result ? (
        <View className="overlay">
          <View className="card local-result">
            <Text className="local-result-title">
              {game.winnerSeat !== null ? '本局结束' : `第 ${game.round} 轮结束`}
            </Text>
            <Text className="local-result-winner">
              🏆 {game.players.find((p) => p.seat === game.result!.winnerSeat)?.name} 胜
            </Text>
            <Text className={`local-result-line ${game.result.bidTrue ? 'good' : 'bad'}`}>
              {game.result.bid.kind === 'pillar'
                ? `全场最多 ${game.result.pillarFace} 点 ×${game.result.actual} → ${game.result.bid.quantity} 柱${game.result.bidTrue ? '成立' : '不成立'}`
                : `实际共 ${game.result.actual} 个 ${game.result.bid.face} → 叫点${game.result.bidTrue ? '成立' : '不成立'}`}
            </Text>
            {game.result.reveal.map((r) => (
              <View key={r.seat} className="local-result-row">
                <Text className="local-result-name">{r.name}</Text>
                <View className="local-result-dice">
                  {r.dice.map((d, i) => (
                    <Dice
                      key={i}
                      value={d}
                      size={55}
                      variant={
                        game.result && d === (game.result.bid.kind === 'pillar' ? game.result.pillarFace : game.result.bid.face)
                          ? 'selected'
                          : 'normal'
                      }
                    />
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
