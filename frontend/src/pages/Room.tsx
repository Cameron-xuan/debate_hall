import { useParams, useNavigate } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import { useDebate } from '../hooks/useDebate'
import Transcript from '../components/Transcript'
import WaitingRoom from '../components/WaitingRoom'
import { useLang } from '../i18n/context'


function RoundTimer({ secs, startedAt }: { secs: number; startedAt: number }) {
  const [remaining, setRemaining] = useStateTimer(secs, startedAt)
  const urgent = remaining <= 30
  return (
    <div className={`timer${urgent ? ' urgent' : ''}`}>
      {String(Math.floor(remaining / 60)).padStart(2, '0')}:
      {String(remaining % 60).padStart(2, '0')}
    </div>
  )
}

function useStateTimer(secs: number, startedAt: number): [number, (n: number) => void] {
  const [remaining, setRemaining] = useState(secs)
  useEffect(() => {
    const tick = () => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000)
      setRemaining(Math.max(0, secs - elapsed))
    }
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [secs, startedAt])
  return [remaining, setRemaining]
}

export default function Room() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const state = useDebate(id)
  const transcriptRef = useRef<HTMLDivElement>(null)
  const { T } = useLang()
  const SLOT_LABELS = T.slotShort as Record<string, string>
  const isCreator = !!id && !!localStorage.getItem(`creator_token_${id}`)

  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight
    }
  }, [state.speeches.length])

  if (state.status === 'connecting') {
    return <div style={{ padding: 40, color: 'var(--dim)' }}>{T.room.connecting}</div>
  }

  if (state.status === 'waiting' || state.status === 'countdown') {
    return (
      <div className="room">
        <WaitingRoom slots={state.slots} roomId={id!} countdown={state.countdown} isCreator={isCreator} />
      </div>
    )
  }

  if (state.status === 'ended' && state.result) {
    return <ResultPage result={state.result} speeches={state.speeches} onBack={() => navigate('/lobby')} />
  }

  const currentSlot = state.currentRound?.slot ?? ''
  const isSpeaking = (slot: string) => state.activeSpeech?.slot === slot

  const proSpeech = isSpeaking('pro_1') || isSpeaking('pro_2')
    ? state.activeSpeech?.content : state.speeches.filter(s => s.slot.startsWith('pro')).slice(-1)[0]?.content
  const conSpeech = isSpeaking('con_1') || isSpeaking('con_2')
    ? state.activeSpeech?.content : state.speeches.filter(s => s.slot.startsWith('con')).slice(-1)[0]?.content

  const activeProSlot = isSpeaking('pro_1') ? 'pro_1' : isSpeaking('pro_2') ? 'pro_2' : null
  const activeConSlot = isSpeaking('con_1') ? 'con_1' : isSpeaking('con_2') ? 'con_2' : null
  const judgeActive = isSpeaking('judge')
  const lastJudgeSpeech = state.speeches.filter(s => s.slot === 'judge').slice(-1)[0]
  const judgeContent = judgeActive ? state.activeSpeech?.content : lastJudgeSpeech?.content
  const judgeName = state.slots['judge']?.name ?? ''

  const macroRound = state.currentRound?.macroRound ?? 1
  const totalMacroRounds = state.currentRound?.totalMacroRounds ?? 4

  return (
    <div className="room">
      {state.status === 'judging' && (
        <div className="judging-overlay" role="status" aria-live="polite">
          <div className="judging-label">{T.room.judgingScores}</div>
          <div className="judging-cursor">▌</div>
        </div>
      )}
      <div className="room-main">

        {/* Left: room info */}
        <div className="room-left">
          <div className="info-section">
            <div className="info-label">{T.room.topic}</div>
            <div className="info-value yellow" style={{ fontSize: 11, lineHeight: 1.5 }}>{state.topic}</div>
          </div>
          <div className="info-section">
            <div className="info-label">{T.room.phase}</div>
            <div className="info-value green">{state.currentRound?.label ?? '—'}</div>
          </div>
          <div className="info-section">
            <div className="info-label">{T.room.speaker}</div>
            <div className="info-value">{currentSlot ? SLOT_LABELS[currentSlot] : '—'}</div>
          </div>
          {state.currentRound && (
            <div className="info-section">
              <div className="info-label">{T.room.timeLeft}</div>
              <RoundTimer secs={state.currentRound.secs} startedAt={state.currentRound.startedAt} />
            </div>
          )}
          <div className="info-section">
            <div className="info-label">{T.room.round}</div>
            <div className="info-value">{macroRound} / {totalMacroRounds}</div>
          </div>
          <div className="info-section">
            <div className="info-label">{T.room.speeches}</div>
            <div className="info-value cyan">{state.speeches.length}</div>
          </div>
        </div>

        {/* Center: speech panes */}
        <div className="room-center">
          <div className="speech-area">
            <div className="speech-pane">
              <div className={`speech-pane-header pro`}>
                {T.room.pro}{activeProSlot ? ` ── ${SLOT_LABELS[activeProSlot]} ${state.slots[activeProSlot]?.name ?? ''} ── ${T.room.speaking}` : ''}
              </div>
              <div className="speech-content">
                {proSpeech || <span className="text-dim">{T.room.waiting}</span>}
                {activeProSlot && <span className="cursor-blink">▌</span>}
              </div>
            </div>
            <div className="speech-pane">
              <div className={`speech-pane-header con`}>
                {T.room.con}{activeConSlot ? ` ── ${SLOT_LABELS[activeConSlot]} ${state.slots[activeConSlot]?.name ?? ''} ── ${T.room.speaking}` : ''}
              </div>
              <div className="speech-content">
                {conSpeech || <span className="text-dim">{T.room.waiting}</span>}
                {activeConSlot && <span className="cursor-blink">▌</span>}
              </div>
            </div>
          </div>

          <div className="judge-area">
            <div className="judge-area-header">
              {T.room.judgeArea}
              {judgeName && ` ── ${judgeName}`}
              {judgeActive && ` ── ${T.room.judgeSpeaking}`}
            </div>
            <div className="judge-area-content">
              {judgeContent
                ? <>{judgeContent}{judgeActive && <span className="cursor-blink">▌</span>}</>
                : <span className="text-dim">{T.room.judgePending}</span>
              }
            </div>
          </div>

          <Transcript speeches={state.speeches} bodyRef={transcriptRef} />
        </div>

        {/* Right: participants */}
        <div className="room-right">
          <div className="info-label" style={{ marginBottom: 8 }}>{T.room.participants}</div>
          {['pro_1', 'pro_2', 'con_1', 'con_2', 'judge'].map(slot => {
            const info = state.slots[slot]
            const side = slot.startsWith('pro') ? 'pro' : slot.startsWith('con') ? 'con' : 'judge'
            const color = side === 'pro' ? 'var(--green)' : side === 'con' ? 'var(--red)' : 'var(--purple)'
            const isCurrent = currentSlot === slot
            return (
              <div key={slot} style={{ marginBottom: 8, padding: '6px 8px', border: `1px solid ${isCurrent ? color : 'var(--border)'}`, borderLeft: `3px solid ${info?.connected ? color : 'var(--dim)'}` }}>
                <div style={{ color: info?.connected ? color : 'var(--dim)', fontSize: 11 }}>
                  {SLOT_LABELS[slot]} {isCurrent ? '◀' : ''}
                </div>
                <div style={{ color: 'var(--text)', fontSize: 12, marginTop: 2 }}>
                  {info?.connected ? info.name : <span className="text-dim">{T.room.notConnected}</span>}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function ResultPage({ result, speeches, onBack }: {
  result: { winner: string; scores: { pro: number; con: number }; comment: string }
  speeches: any[]
  onBack: () => void
}) {
  const { T } = useLang()
  const winnerLabel = result.winner === 'pro' ? T.result.proWin : result.winner === 'con' ? T.result.conWin : T.result.draw
  const scores = result.scores ?? { pro: 0, con: 0 }
  return (
    <div className="result">
      <div className="result-winner">{winnerLabel}</div>
      {result.comment && <div className="result-comment">{result.comment}</div>}
      {(scores.pro > 0 || scores.con > 0) && (
        <div className="score-row">
          <div className="score-box">
            <div className="score-side">{T.result.pro}</div>
            <div className="score-num pro">{scores.pro}</div>
          </div>
          <div className="score-box">
            <div className="score-side">{T.result.con}</div>
            <div className="score-num con">{scores.con}</div>
          </div>
        </div>
      )}
      <div style={{ marginTop: 16 }}>
        <div className="info-label" style={{ marginBottom: 8 }}>{T.result.fullRecord} ({speeches.length}{T.result.countUnit}) ──</div>
        <Transcript speeches={speeches} />
      </div>
      <button className="btn btn-dim" style={{ marginTop: 16 }} onClick={onBack}>{T.result.backLobby}</button>
    </div>
  )
}
