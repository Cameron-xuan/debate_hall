import { useEffect, useState } from 'react'
import type { SlotInfo } from '../hooks/useDebate'
import { useLang } from '../i18n/context'

const API_HOST = (import.meta.env.VITE_API_URL ?? '').replace(/^https?:\/\//, '').replace(/\/$/, '') || 'localhost:8787'

function buildClaudeCmd(roomId: string, slot: string) {
  return `debate join --room ${roomId} --slot ${slot} --host ${API_HOST} --cmd "claude --print"`
}

function buildCodexCmd(roomId: string, slot: string) {
  return `debate join --room ${roomId} --slot ${slot} --host ${API_HOST} --cmd "debate-codex-bridge"`
}

function buildOpenAICmd(roomId: string, slot: string) {
  return `debate join --room ${roomId} --slot ${slot} --host ${API_HOST} --cmd "debate-openai-stream"`
}

function Countdown({ from }: { from: number }) {
  const [n, setN] = useState(from)
  useEffect(() => {
    setN(from)
    const t = setInterval(() => setN(v => (v > 0 ? v - 1 : 0)), 1000)
    return () => clearInterval(t)
  }, [from])
  return (
    <div className="countdown-overlay">
      <div className="countdown-label">辩论即将开始</div>
      <div className="countdown-num">{n}</div>
    </div>
  )
}

function CmdLine({ cmd, kind, copyKey, copied, onCopy }: {
  cmd: string
  kind: 'claude' | 'codex' | 'openai'
  copyKey: string
  copied: string | null
  onCopy: (key: string, cmd: string) => void
}) {
  const isCopied = copied === copyKey
  return (
    <div className={`cmd-line ${kind}`} onClick={() => onCopy(copyKey, cmd)}>
      {isCopied ? '已复制 ✓' : cmd}
    </div>
  )
}

export default function WaitingRoom({ slots, roomId, countdown }: {
  slots: Record<string, SlotInfo>
  roomId: string
  countdown?: number | null
}) {
  const { T } = useLang()
  const [copied, setCopied] = useState<string | null>(null)
  const connected = Object.values(slots).filter(s => s.connected).length
  const debaters = ['pro_1', 'pro_2', 'con_1', 'con_2'].filter(s => slots[s]?.connected).length
  const allReady = debaters === 4 && slots['judge']?.connected

  const SLOT_LIST = [
    { slot: 'pro_1', label: T.slots.pro_1 },
    { slot: 'pro_2', label: T.slots.pro_2 },
    { slot: 'con_1', label: T.slots.con_1 },
    { slot: 'con_2', label: T.slots.con_2 },
    { slot: 'judge', label: T.slots.judge },
  ]

  function copy(key: string, cmd: string) {
    navigator.clipboard.writeText(cmd)
    setCopied(key)
    setTimeout(() => setCopied(null), 1200)
  }

  return (
    <div style={{ padding: 24, height: '100%', overflowY: 'auto' }}>
      {countdown != null && <Countdown from={countdown} />}
      <div className="waiting-title">{T.waiting.title} ({connected}/5)</div>

      <div className="waiting-slots">
        {SLOT_LIST.map(({ slot, label }) => {
          const info = slots[slot]
          const on = info?.connected
          const side = slot.startsWith('pro') ? 'var(--green)' : slot.startsWith('con') ? 'var(--red)' : 'var(--purple)'
          return (
            <div key={slot} className="waiting-slot" style={{ borderLeft: `3px solid ${on ? side : 'var(--border)'}` }}>
              <span className={`dot ${on ? 'on' : 'off'}`} style={{ color: on ? side : undefined }}>●</span>
              <span className="slot-name" style={{ color: on ? side : 'var(--dim)' }}>{label}</span>
              {on
                ? <span className="agent-name">{info.name}</span>
                : <span className="slot-empty">{T.waiting.notConnected}</span>
              }
            </div>
          )
        })}
      </div>

      {allReady
        ? <div className="text-green" style={{ fontSize: 12 }}>{T.waiting.allReady}</div>
        : <div className="waiting-msg">{T.waiting.waitMsg}</div>
      }

      <div style={{ marginTop: 24 }}>
        <div className="text-dim" style={{ fontSize: 11, marginBottom: 8 }}>{T.waiting.cmdHint}</div>
        {SLOT_LIST.filter(({ slot }) => !slots[slot]?.connected).map(({ slot, label }) => (
          <div key={slot} style={{ marginBottom: 12 }}>
            <div className="cmd-comment"># {label} · Claude</div>
            <CmdLine
              cmd={buildClaudeCmd(roomId, slot)}
              kind="claude"
              copyKey={`${slot}-claude`}
              copied={copied}
              onCopy={copy}
            />
            <div className="cmd-comment"># {label} · Codex</div>
            <CmdLine
              cmd={buildCodexCmd(roomId, slot)}
              kind="codex"
              copyKey={`${slot}-codex`}
              copied={copied}
              onCopy={copy}
            />
            <div className="cmd-comment"># {label} · OpenAI SDK</div>
            <CmdLine
              cmd={buildOpenAICmd(roomId, slot)}
              kind="openai"
              copyKey={`${slot}-openai`}
              copied={copied}
              onCopy={copy}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
