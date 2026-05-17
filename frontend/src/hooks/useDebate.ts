import { useEffect, useReducer, useRef, useCallback } from 'react'
import { wsUrl } from '../lib/api'

export interface SlotInfo { name: string; connected: boolean }

export interface Speech {
  roundIndex: number
  roundId: string
  roundLabel: string
  slot: string
  agentName: string
  content: string
  timestamp: number
}

export interface DebateState {
  status: 'connecting' | 'waiting' | 'countdown' | 'active' | 'judging' | 'ended'
  topic: string
  slots: Record<string, SlotInfo>
  currentRound: { index: number; id: string; label: string; slot: string; secs: number; startedAt: number; macroRound: number; totalMacroRounds: number } | null
  speeches: Speech[]
  activeSpeech: { slot: string; content: string } | null
  result: { winner: string; scores: { pro: number; con: number }; comment: string } | null
  countdown: number | null
  viewerCount: number
}

type Action =
  | { type: 'CONNECTING' }
  | { type: 'ROSTER'; slots: Record<string, SlotInfo> }
  | { type: 'COUNTDOWN'; secs: number }
  | { type: 'DEBATE_STARTED'; topic: string }
  | { type: 'ROUND_START'; roundIndex: number; roundId: string; roundLabel: string; slot: string; secs: number; startedAt: number; macroRound: number; totalMacroRounds: number }
  | { type: 'SPEECH_CHUNK'; slot: string; content: string }
  | { type: 'SPEECH'; speech: Speech }
  | { type: 'ROUND_END' }
  | { type: 'JUDGING_STARTED' }
  | { type: 'DEBATE_ENDED'; winner: string; scores: { pro: number; con: number }; comment: string }

const initial: DebateState = {
  status: 'connecting',
  topic: '',
  slots: {},
  currentRound: null,
  speeches: [],
  activeSpeech: null,
  result: null,
  countdown: null,
  viewerCount: 0,
}

function reducer(state: DebateState, action: Action): DebateState {
  switch (action.type) {
    case 'CONNECTING':
      return { ...initial }
    case 'ROSTER':
      return {
        ...state,
        status: state.status === 'connecting' ? 'waiting'
          : state.status === 'countdown' ? 'waiting'
          : state.status,
        countdown: state.status === 'countdown' ? null : state.countdown,
        slots: action.slots,
      }
    case 'COUNTDOWN':
      return { ...state, status: 'countdown', countdown: action.secs }
    case 'DEBATE_STARTED':
      return { ...state, status: 'active', countdown: null, topic: action.topic }
    case 'ROUND_START':
      return {
        ...state,
        currentRound: {
          index: action.roundIndex,
          id: action.roundId,
          label: action.roundLabel,
          slot: action.slot,
          secs: action.secs,
          startedAt: action.startedAt,
          macroRound: action.macroRound,
          totalMacroRounds: action.totalMacroRounds,
        },
        activeSpeech: { slot: action.slot, content: '' },
      }
    case 'SPEECH_CHUNK':
      return {
        ...state,
        activeSpeech: state.activeSpeech
          ? { ...state.activeSpeech, content: state.activeSpeech.content + action.content }
          : { slot: action.slot, content: action.content },
      }
    case 'SPEECH':
      return {
        ...state,
        speeches: [...state.speeches, action.speech],
        activeSpeech: { slot: action.speech.slot, content: action.speech.content },
      }
    case 'ROUND_END':
      return { ...state, currentRound: null, activeSpeech: null }
    case 'JUDGING_STARTED':
      return { ...state, status: 'judging', currentRound: null, activeSpeech: null }
    case 'DEBATE_ENDED':
      return {
        ...state,
        status: 'ended',
        currentRound: null,
        activeSpeech: null,
        result: {
          winner: action.winner ?? 'none',
          scores: action.scores ?? { pro: 0, con: 0 },
          comment: action.comment ?? '',
        },
      }
    default:
      return state
  }
}

export function useDebate(roomId: string | undefined) {
  const [state, dispatch] = useReducer(reducer, initial)
  const wsRef = useRef<WebSocket | null>(null)

  const connect = useCallback(() => {
    if (!roomId) return
    dispatch({ type: 'CONNECTING' })

    const ws = new WebSocket(wsUrl(roomId, 'viewer', 'viewer'))
    wsRef.current = ws

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data)
      switch (msg.event) {
        case 'roster':
          dispatch({ type: 'ROSTER', slots: msg.slots })
          break
        case 'countdown':
          dispatch({ type: 'COUNTDOWN', secs: msg.secs })
          break
        case 'debate_started':
          dispatch({ type: 'DEBATE_STARTED', topic: msg.topic })
          break
        case 'round_start':
          dispatch({
            type: 'ROUND_START',
            roundIndex: msg.roundIndex,
            roundId: msg.roundId,
            roundLabel: msg.roundLabel,
            slot: msg.slot,
            secs: msg.secs,
            startedAt: msg.startedAt ?? Date.now(),
            macroRound: msg.macroRound ?? Math.min(Math.floor(msg.roundIndex / 3) + 1, 4),
            totalMacroRounds: msg.totalMacroRounds ?? 4,
          })
          break
        case 'speech_chunk':
          dispatch({ type: 'SPEECH_CHUNK', slot: msg.slot, content: msg.content })
          break
        case 'speech':
          dispatch({ type: 'SPEECH', speech: { roundIndex: msg.roundIndex, roundId: msg.roundId ?? '', roundLabel: msg.roundLabel, slot: msg.slot, agentName: msg.agentName, content: msg.content, timestamp: msg.timestamp } })
          break
        case 'round_end':
          dispatch({ type: 'ROUND_END' })
          break
        case 'judging_started':
          dispatch({ type: 'JUDGING_STARTED' })
          break
        case 'debate_ended':
          dispatch({ type: 'DEBATE_ENDED', winner: msg.winner, scores: msg.scores, comment: msg.comment })
          break
      }
    }

    ws.onclose = () => {
      setTimeout(() => { if (wsRef.current === ws) connect() }, 3000)
    }
  }, [roomId])

  useEffect(() => {
    connect()
    return () => {
      const ws = wsRef.current
      if (ws) { wsRef.current = null; ws.close() }
    }
  }, [connect])

  return state
}
