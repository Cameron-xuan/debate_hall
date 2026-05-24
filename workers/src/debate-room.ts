import {
  ROUNDS, DEBATER_SLOTS, SLOTS, TOTAL_MACRO_ROUNDS,
  type Env, type Slot, type DebateState, type Speech, type SlotInfo, type ServerMsg
} from './types'

const JUDGE_TIMEOUT_SECS = 300
const COUNTDOWN_SECS = 10
const VALID_WINNERS = new Set(['pro', 'con', 'none'])

type ConnectionAttachment = {
  slot: Slot
  name: string
  joined: boolean
}

export class DebateRoom {
  private debate: DebateState | null = null

  constructor(private ctx: DurableObjectState, private env: Env) {
    this.ctx.blockConcurrencyWhile(async () => {
      this.debate = await this.ctx.storage.get<DebateState>('debate') ?? null
    })
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    if (request.headers.get('Upgrade') === 'websocket') {
      return this.handleWebSocket(request, url)
    }

    if (url.pathname.endsWith('/state')) {
      return Response.json(this.debate ?? { status: 'not_found' })
    }

    if (request.method === 'POST' && request.headers.get('X-Internal') === '1') {
      const body = await request.json<{ id: string; topic: string; creatorToken?: string }>()
      await this.initRoom(body.id, body.topic, body.creatorToken)
      return Response.json({ ok: true })
    }

    if (url.pathname.endsWith('/verify-token') && request.method === 'POST' && request.headers.get('X-Internal') === '1') {
      const { token } = await request.json<{ token: string }>()
      const valid = !!this.debate?.creatorToken && this.debate.creatorToken === token
      return Response.json({ valid })
    }

    return new Response('Not found', { status: 404 })
  }

  private async handleWebSocket(request: Request, url: URL): Promise<Response> {
    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair)
    this.ctx.acceptWebSocket(server)

    const requestedSlot = url.searchParams.get('slot')
    const slot = this.isSlot(requestedSlot) ? requestedSlot : 'viewer'
    const name = url.searchParams.get('name') ?? 'anonymous'
    server.serializeAttachment({ slot, name, joined: slot === 'viewer' })

    if (this.debate && slot === 'viewer') {
      this.sendState(server)
    }

    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(ws: WebSocket, raw: string): Promise<void> {
    const att = ws.deserializeAttachment() as ConnectionAttachment
    let msg: any
    try { msg = JSON.parse(raw) } catch { return }

    switch (msg.event) {
      case 'join':
        await this.handleJoin(ws, att, msg)
        break
      case 'speech_chunk':
        this.handleSpeechChunk(att, msg.content)
        break
      case 'speech':
        await this.handleSpeech(ws, att, msg.content)
        break
      case 'score':
        await this.handleScore(ws, att, msg)
        break
    }
  }

  private handleSpeechChunk(att: ConnectionAttachment, content: string): void {
    if (!this.debate || this.debate.status !== 'active') return
    if (!att.joined) return
    const round = ROUNDS[this.debate.roundIndex]
    if (!round || att.slot !== round.slot) return
    if (typeof content !== 'string' || content.length === 0) return
    this.broadcast({ event: 'speech_chunk', roundIndex: this.debate.roundIndex, slot: att.slot, content })
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const att = ws.deserializeAttachment() as ConnectionAttachment | null
    if (!att || !att.joined || att.slot === 'viewer' || !this.debate) return

    this.debate.slots[att.slot] = { ...this.debate.slots[att.slot], connected: false }
    if (this.debate.status !== 'ended') {
      await this.updateSlotName(att.slot, null)
    }

    if (this.debate.status === 'countdown') {
      this.debate.status = 'waiting'
      await this.ctx.storage.deleteAlarm()
    }

    await this.saveDebate()
    this.broadcast({ event: 'roster', slots: this.getRoster() })
  }

  async alarm(): Promise<void> {
    if (!this.debate || this.debate.status === 'ended') return

    if (this.debate.status === 'active') {
      const round = ROUNDS[this.debate.roundIndex]
      if (round) {
        this.broadcast({ event: 'round_end', roundIndex: this.debate.roundIndex, reason: 'timeout' })
        await this.nextRound()
      } else {
        // judge timeout — end without score
        await this.endDebate('none', { pro: 0, con: 0 }, '评委未在时限内提交评分。')
      }
    } else if (this.debate.status === 'countdown') {
      await this.beginDebate()
    }
  }

  // ── Join ─────────────────────────────────────────

  private async handleJoin(ws: WebSocket, att: ConnectionAttachment, msg: any): Promise<void> {
    const slot = this.isSlot(msg.slot) ? msg.slot : att.slot
    const name = typeof msg.name === 'string' && msg.name.trim() ? msg.name.trim() : att.name

    if (!this.debate) {
      ws.send(JSON.stringify({ event: 'error', message: 'Room not initialized' }))
      return
    }

    if (slot !== 'viewer') {
      const existing = this.debate.slots[slot]
      if (existing?.connected) {
        ws.serializeAttachment({ slot: 'viewer', name, joined: false })
        ws.send(JSON.stringify({ event: 'error', message: 'Slot already taken' }))
        ws.close(4001, 'Slot already taken')
        return
      }
      ws.serializeAttachment({ slot, name, joined: true })
      this.debate.slots[slot] = { name, connected: true }
      await this.saveDebate()
      await this.updateSlotName(slot, name)
      this.broadcast({ event: 'roster', slots: this.getRoster() })

      if (this.debate.status === 'waiting') {
        await this.checkAllReady()
      } else if (this.debate.status === 'active') {
        this.sendState(ws)
      }
    } else {
      ws.serializeAttachment({ slot, name, joined: true })
      if (this.debate.status !== 'waiting') {
        this.sendState(ws)
      }
    }
  }

  // ── Speech ────────────────────────────────────────

  private async handleSpeech(ws: WebSocket, att: ConnectionAttachment, content: string): Promise<void> {
    if (!this.debate || this.debate.status !== 'active') return
    if (!att.joined) return

    const round = ROUNDS[this.debate.roundIndex]
    if (!round || att.slot !== round.slot) return

    await this.ctx.storage.deleteAlarm()

    const speech: Speech = {
      roundIndex: this.debate.roundIndex,
      roundId: round.id,
      roundLabel: round.label,
      slot: att.slot,
      agentName: this.debate.slots[att.slot]?.name ?? att.slot,
      content,
      timestamp: Date.now(),
    }

    await this.recordSpeech(speech)

    this.broadcast({ event: 'round_end', roundIndex: this.debate.roundIndex, reason: 'submitted' })
    await this.nextRound()
  }

  // ── Score ─────────────────────────────────────────

  private async handleScore(ws: WebSocket, att: ConnectionAttachment, msg: any): Promise<void> {
    if (!this.debate || !att.joined || att.slot !== 'judge') return
    if (this.debate.status !== 'active' || this.debate.roundIndex < ROUNDS.length) return
    const parsed = this.parseScore(msg)
    if (!parsed) {
      ws.send(JSON.stringify({ event: 'error', message: 'Invalid score payload' }))
      return
    }
    await this.ctx.storage.deleteAlarm()
    await this.endDebate(parsed.winner, parsed.scores, parsed.comment)
  }

  // ── State machine ─────────────────────────────────

  private async checkAllReady(): Promise<void> {
    if (!this.debate) return
    const debatersReady = DEBATER_SLOTS.every(s => this.debate!.slots[s]?.connected)
    const judgeReady = this.debate.slots['judge']?.connected
    if (debatersReady && judgeReady) {
      this.debate.status = 'countdown'
      await this.saveDebate()
      this.broadcast({ event: 'countdown', secs: COUNTDOWN_SECS })
      await this.ctx.storage.setAlarm(Date.now() + COUNTDOWN_SECS * 1000)
    }
  }

  private async beginDebate(): Promise<void> {
    if (!this.debate) return
    this.debate.status = 'active'
    await this.saveDebate()
    this.broadcast({ event: 'debate_started', topic: this.debate.topic })
    await this.env.DB.prepare(`UPDATE debates SET status='active', updated_at=unixepoch() WHERE id=?`)
      .bind(this.debate.id).run()
    await this.startRound()
  }

  private async startRound(): Promise<void> {
    if (!this.debate) return
    const round = ROUNDS[this.debate.roundIndex]
    if (!round) {
      await this.startJudging()
      return
    }

    const startedAt = Date.now()
    this.debate.currentRoundStartedAt = startedAt
    await this.saveDebate()

    this.broadcast({
      event: 'round_start',
      roundIndex: this.debate.roundIndex,
      roundId: round.id,
      roundLabel: round.label,
      slot: round.slot,
      secs: round.secs,
      startedAt,
      macroRound: round.macroRound,
      totalMacroRounds: TOTAL_MACRO_ROUNDS,
    })

    const opponentLast = this.getOpponentLast(round.slot)

    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() as ConnectionAttachment
      if (a?.joined && a.slot === round.slot) {
        ws.send(JSON.stringify({
          event: 'your_turn',
          roundIndex: this.debate.roundIndex,
          roundId: round.id,
          roundLabel: round.label,
          slot: round.slot,
          secs: round.secs,
          startedAt,
          macroRound: round.macroRound,
          totalMacroRounds: TOTAL_MACRO_ROUNDS,
          topic: this.debate.topic,
          history: this.debate.history,
          opponentLast,
        }))
      }
    }

    await this.ctx.storage.setAlarm(Date.now() + round.secs * 1000)
  }

  private async nextRound(): Promise<void> {
    if (!this.debate) return
    this.debate.roundIndex++
    await this.saveDebate()
    await this.startRound()
  }

  private async startJudging(): Promise<void> {
    if (!this.debate) return

    const startedAt = Date.now()
    this.debate.currentRoundStartedAt = startedAt
    await this.saveDebate()

    const judgeConnected = this.debate.slots['judge']?.connected
    if (!judgeConnected) {
      await this.endDebate('none', { pro: 0, con: 0 }, '本场辩论无评委，不计胜负。')
      return
    }

    this.broadcast({
      event: 'judging_started',
      secs: JUDGE_TIMEOUT_SECS,
      startedAt,
    })

    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() as ConnectionAttachment
      if (a?.joined && a.slot === 'judge') {
        ws.send(JSON.stringify({
          event: 'judge_now',
          topic: this.debate.topic,
          transcript: this.debate.history,
          secs: JUDGE_TIMEOUT_SECS,
        }))
      }
    }

    await this.ctx.storage.setAlarm(Date.now() + JUDGE_TIMEOUT_SECS * 1000)
  }

  private async endDebate(winner: string, scores: { pro: number; con: number }, comment: string): Promise<void> {
    if (!this.debate) return
    if (!this.debate.history.some(s => s.roundId === 'judge_final')) {
      const finalSpeech: Speech = {
        roundIndex: ROUNDS.length,
        roundId: 'judge_final',
        roundLabel: '评委点评（第四回合）',
        slot: 'judge',
        agentName: this.debate.slots['judge']?.name ?? 'judge',
        content: comment,
        timestamp: Date.now(),
      }
      await this.recordSpeech(finalSpeech)
    }

    this.debate.status = 'ended'
    this.debate.winner = winner
    this.debate.judgeScore = { ...scores, comment }
    await this.saveDebate()

    this.broadcast({ event: 'debate_ended', winner, scores, comment })

    await this.env.DB.prepare(
      `UPDATE debates SET status='ended', winner=?, judge_comment=?, updated_at=unixepoch() WHERE id=?`
    ).bind(winner, comment, this.debate.id).run()
  }

  // ── Helpers ───────────────────────────────────────

  private getRoster(): Record<string, SlotInfo> {
    const roster: Record<string, SlotInfo> = {}
    for (const slot of ['pro_1', 'pro_2', 'con_1', 'con_2', 'judge']) {
      roster[slot] = this.debate?.slots[slot] ?? { name: '', connected: false }
    }
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() as ConnectionAttachment | null
      if (a?.joined && a.slot !== 'viewer') {
        roster[a.slot] = { name: a.name, connected: true }
      }
    }
    return roster
  }

  private getOpponentLast(slot: Slot): string {
    if (!this.debate) return ''
    const side = slot.startsWith('pro') ? 'con' : 'pro'
    const last = [...this.debate.history].reverse().find(s => s.slot.startsWith(side))
    return last?.content ?? ''
  }

  private async recordSpeech(speech: Speech): Promise<void> {
    if (!this.debate) return

    this.debate.history.push(speech)
    await this.saveDebate()

    await this.env.DB.prepare(
      `INSERT INTO speeches (debate_id, round_index, round_id, round_label, slot, agent_name, content)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(this.debate.id, speech.roundIndex, speech.roundId, speech.roundLabel, speech.slot, speech.agentName, speech.content).run()

    this.broadcast({
      event: 'speech',
      roundIndex: speech.roundIndex,
      roundId: speech.roundId,
      roundLabel: speech.roundLabel,
      slot: speech.slot,
      agentName: speech.agentName,
      content: speech.content,
      timestamp: speech.timestamp,
    })
  }

  private sendState(ws: WebSocket): void {
    if (!this.debate) return
    ws.send(JSON.stringify({ event: 'roster', slots: this.getRoster() }))
    if (this.debate.status === 'active') {
      ws.send(JSON.stringify({ event: 'debate_started', topic: this.debate.topic }))
      for (const speech of this.debate.history) {
        ws.send(JSON.stringify({ event: 'speech', ...speech }))
      }
      const round = ROUNDS[this.debate.roundIndex]
      if (round) {
        const startedAt = this.debate.currentRoundStartedAt ?? Date.now()
        ws.send(JSON.stringify({
          event: 'round_start',
          roundIndex: this.debate.roundIndex,
          roundId: round.id,
          roundLabel: round.label,
          slot: round.slot,
          secs: round.secs,
          startedAt,
          macroRound: round.macroRound,
          totalMacroRounds: TOTAL_MACRO_ROUNDS,
        }))
      } else {
        ws.send(JSON.stringify({
          event: 'judging_started',
          secs: JUDGE_TIMEOUT_SECS,
          startedAt: this.debate.currentRoundStartedAt ?? Date.now(),
        }))
      }
    }
    if (this.debate.status === 'ended') {
      ws.send(JSON.stringify({ event: 'debate_started', topic: this.debate.topic }))
      for (const speech of this.debate.history) {
        ws.send(JSON.stringify({ event: 'speech', ...speech }))
      }
      ws.send(JSON.stringify({
        event: 'debate_ended',
        winner: this.debate.winner,
        scores: this.debate.judgeScore,
        comment: this.debate.judgeScore?.comment,
      }))
    }
  }

  private broadcast(msg: ServerMsg): void {
    const data = JSON.stringify(msg)
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.send(data) } catch {}
    }
  }

  private async saveDebate(): Promise<void> {
    await this.ctx.storage.put('debate', this.debate)
  }

  private isSlot(slot: unknown): slot is Slot {
    return slot === 'viewer' || SLOTS.includes(slot as Slot)
  }

  private parseScore(msg: any): { winner: string; scores: { pro: number; con: number }; comment: string } | null {
    const rawWinner = typeof msg?.winner === 'string' ? msg.winner : ''
    const winner = rawWinner === 'draw' ? 'none' : rawWinner
    const pro = Number(msg?.scores?.pro)
    const con = Number(msg?.scores?.con)
    if (!VALID_WINNERS.has(winner) || !Number.isFinite(pro) || !Number.isFinite(con)) return null
    if (pro < 0 || pro > 100 || con < 0 || con > 100) return null
    return {
      winner,
      scores: { pro, con },
      comment: typeof msg.comment === 'string' ? msg.comment : '',
    }
  }

  private slotNameColumn(slot: Slot): string | null {
    switch (slot) {
      case 'pro_1': return 'pro1_name'
      case 'pro_2': return 'pro2_name'
      case 'con_1': return 'con1_name'
      case 'con_2': return 'con2_name'
      case 'judge': return 'judge_name'
      default: return null
    }
  }

  private async updateSlotName(slot: Slot, name: string | null): Promise<void> {
    if (!this.debate) return
    const column = this.slotNameColumn(slot)
    if (!column) return
    await this.env.DB.prepare(
      `UPDATE debates SET ${column}=?, updated_at=unixepoch() WHERE id=?`
    ).bind(name, this.debate.id).run()
  }

  // Called by index.ts to initialize a new room
  async initRoom(id: string, topic: string, creatorToken?: string): Promise<void> {
    this.debate = {
      id,
      topic,
      status: 'waiting',
      roundIndex: 0,
      history: [],
      slots: {
        pro_1: { name: '', connected: false },
        pro_2: { name: '', connected: false },
        con_1: { name: '', connected: false },
        con_2: { name: '', connected: false },
        judge: { name: '', connected: false },
      },
      createdAt: Date.now(),
      creatorToken,
    }
    await this.saveDebate()
  }
}
