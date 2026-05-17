export type Slot = 'pro_1' | 'pro_2' | 'con_1' | 'con_2' | 'judge' | 'viewer'

export const SLOTS: Slot[] = ['pro_1', 'pro_2', 'con_1', 'con_2', 'judge']
export const DEBATER_SLOTS: Slot[] = ['pro_1', 'pro_2', 'con_1', 'con_2']

export const SLOT_LABELS: Record<string, string> = {
  pro_1: '正方一辩',
  pro_2: '正方二辩',
  con_1: '反方一辩',
  con_2: '反方二辩',
  judge: '评委',
  viewer: '观众',
}

export interface Round {
  id: string
  label: string
  slot: Slot
  secs: number
  macroRound: number
}

export const ROUNDS: Round[] = [
  // 第 1 回合
  { id: 'open_pro1',       label: '正方立论',        slot: 'pro_1', secs: 180, macroRound: 1 },
  { id: 'open_con1',       label: '反方立论',        slot: 'con_1', secs: 180, macroRound: 1 },
  { id: 'judge_interim_1', label: '评委点评（第一回合）', slot: 'judge', secs: 120, macroRound: 1 },
  // 第 2 回合
  { id: 'rebut_pro2',      label: '正方二辩质询反方', slot: 'pro_2', secs: 180, macroRound: 2 },
  { id: 'rebut_con2',      label: '反方二辩质询正方', slot: 'con_2', secs: 180, macroRound: 2 },
  { id: 'judge_interim_2', label: '评委点评（第二回合）', slot: 'judge', secs: 120, macroRound: 2 },
  // 第 3 回合
  { id: 'free_1',          label: '自由辩论',        slot: 'pro_2', secs: 180, macroRound: 3 },
  { id: 'free_2',          label: '自由辩论',        slot: 'con_2', secs: 180, macroRound: 3 },
  { id: 'judge_interim_3', label: '评委点评（第三回合）', slot: 'judge', secs: 120, macroRound: 3 },
  // 第 4 回合（最后由评委 judge_now 收尾给出胜负）
  { id: 'close_con1',      label: '反方总结陈词',    slot: 'con_1', secs: 180, macroRound: 4 },
  { id: 'close_pro1',      label: '正方总结陈词',    slot: 'pro_1', secs: 180, macroRound: 4 },
]

export const TOTAL_MACRO_ROUNDS = 4
export function macroRoundOf(subRoundIndex: number): number {
  return Math.min(Math.floor(subRoundIndex / 3) + 1, TOTAL_MACRO_ROUNDS)
}

export interface Speech {
  roundIndex: number
  roundId: string
  roundLabel: string
  slot: Slot
  agentName: string
  content: string
  timestamp: number
}

export interface SlotInfo {
  name: string
  connected: boolean
}

export type DebateStatus = 'waiting' | 'countdown' | 'active' | 'ended'

export interface DebateState {
  id: string
  topic: string
  status: DebateStatus
  roundIndex: number
  currentRoundStartedAt?: number
  history: Speech[]
  slots: Record<string, SlotInfo>
  winner?: string
  judgeScore?: { pro: number; con: number; comment: string }
  createdAt: number
}

// WebSocket message types (client → server)
export type ClientMsg =
  | { event: 'join'; slot: Slot; name: string }
  | { event: 'speech_chunk'; content: string }
  | { event: 'speech'; content: string }
  | { event: 'score'; winner: string; scores: { pro: number; con: number }; comment: string }

// WebSocket message types (server → client)
export type ServerMsg =
  | { event: 'roster'; slots: Record<string, SlotInfo> }
  | { event: 'countdown'; secs: number }
  | { event: 'debate_started'; topic: string }
  | { event: 'round_start'; roundIndex: number; roundId: string; roundLabel: string; slot: Slot; secs: number; startedAt: number; macroRound: number; totalMacroRounds: number }
  | { event: 'your_turn'; roundIndex: number; roundId: string; roundLabel: string; slot: Slot; secs: number; startedAt: number; macroRound: number; totalMacroRounds: number; topic: string; history: Speech[]; opponentLast: string }
  | { event: 'speech_chunk'; roundIndex: number; slot: Slot; content: string }
  | { event: 'speech'; roundIndex: number; roundId: string; roundLabel: string; slot: Slot; agentName: string; content: string; timestamp: number }
  | { event: 'round_end'; roundIndex: number; reason: 'submitted' | 'timeout' }
  | { event: 'judging_started'; secs: number; startedAt: number }
  | { event: 'judge_now'; topic: string; transcript: Speech[]; secs: number }
  | { event: 'debate_ended'; winner: string; scores: { pro: number; con: number }; comment: string }
  | { event: 'error'; message: string }

export interface Env {
  DEBATE_ROOM: DurableObjectNamespace
  DB: D1Database
  FRONTEND_URL: string
}
