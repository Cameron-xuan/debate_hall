import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiUrl } from '../lib/api'
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

export default function Create() {
  const [topic, setTopic] = useState('')
  const [loading, setLoading] = useState(false)
  const [roomId, setRoomId] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()
  const { T } = useLang()

  const SLOTS = [
    { slot: 'pro_1', label: T.slots.pro_1 },
    { slot: 'pro_2', label: T.slots.pro_2 },
    { slot: 'con_1', label: T.slots.con_1 },
    { slot: 'con_2', label: T.slots.con_2 },
    { slot: 'judge', label: T.slots.judge },
  ]

  const allCommands = useMemo(() => {
    if (!roomId) return ''
    const parts: string[] = []
    for (const { slot, label } of SLOTS) {
      parts.push(`# ${label} · Claude`)
      parts.push(buildClaudeCmd(roomId, slot))
      parts.push('')
      parts.push(`# ${label} · Codex`)
      parts.push(buildCodexCmd(roomId, slot))
      parts.push('')
      parts.push(`# ${label} · OpenAI SDK`)
      parts.push(buildOpenAICmd(roomId, slot))
      parts.push('')
    }
    return parts.join('\n').trimEnd()
  }, [roomId, T])

  async function handleCreate() {
    if (!topic.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(apiUrl('/api/rooms'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as any).error ?? `HTTP ${res.status}`)
      }
      const data = await res.json()
      setRoomId(data.id)
      if (data.creator_token) {
        localStorage.setItem(`creator_token_${data.id}`, data.creator_token)
      }
    } catch (e: any) {
      setError(e.message ?? 'Failed')
    } finally {
      setLoading(false)
    }
  }

  function copyAll() {
    navigator.clipboard.writeText(allCommands)
    setCopied('all')
    setTimeout(() => setCopied(null), 1500)
  }

  function copyLink() {
    if (!roomId) return
    navigator.clipboard.writeText(`${location.origin}/room/${roomId}`)
    setCopied('link')
    setTimeout(() => setCopied(null), 1500)
  }

  if (roomId) {
    return (
      <div className="create-page wide">
        <div className="create-title">{T.create.createdTitle}</div>

        <div className="create-cols">
          <div className="create-col-left">
            <div className="pane" style={{ padding: '10px 14px' }}>
              <div className="text-dim" style={{ fontSize: 11 }}>{T.create.topicField}</div>
              <div className="text-cyan" style={{ marginTop: 4 }}>{topic}</div>
              <div className="text-dim" style={{ fontSize: 11, marginTop: 8 }}>{T.create.roomId}</div>
              <div className="text-green" style={{ fontSize: 18, fontWeight: 'bold', marginTop: 4 }}>{roomId}</div>
            </div>

            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button className="btn" onClick={() => navigate(`/room/${roomId}`)}>
                {T.create.enterRoom}
              </button>
              <button className="btn btn-dim" onClick={copyLink}>
                {copied === 'link' ? T.create.linkCopied : T.create.copyLink}
              </button>
            </div>
          </div>

          <div className="create-col-right">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span className="text-dim" style={{ fontSize: 11 }}>{T.create.cmdHint}</span>
              <button className="btn" onClick={copyAll} style={{ padding: '4px 12px', fontSize: 11 }}>
                {copied === 'all' ? T.create.allCopied : T.create.copyAll}
              </button>
            </div>
            <textarea className="cmd-textarea" readOnly value={allCommands} />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="create-page">
      <div className="create-title">{T.create.title}</div>

      <div className="form-group">
        <label className="form-label">{T.create.topicLabel}</label>
        <input
          className="form-input"
          placeholder={T.create.topicPlaceholder}
          value={topic}
          onChange={e => setTopic(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleCreate()}
          autoFocus
        />
      </div>

      <button className="btn" onClick={handleCreate} disabled={!topic.trim() || loading}>
        {loading ? T.create.creating : T.create.createBtn}
      </button>

      {error && (
        <div style={{ marginTop: 12, color: 'var(--red)', fontSize: 12, border: '1px solid var(--red)', padding: '6px 10px' }}>
          ✗ {error}
        </div>
      )}

      <div style={{ marginTop: 24, color: 'var(--dim)', fontSize: 11, lineHeight: 1.8 }}>
        <div>{T.create.hint1}</div>
        <div>{T.create.hint2}</div>
        <div>{T.create.hint3}</div>
      </div>
    </div>
  )
}
