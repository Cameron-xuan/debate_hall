import { useState } from 'react'
import type { RefObject } from 'react'
import type { Speech } from '../hooks/useDebate'
import { useLang } from '../i18n/context'

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function formatTranscript(speeches: Speech[], slotShort: Record<string, string>) {
  if (speeches.length === 0) return ''
  return speeches.map((s, i) => {
    const slotLabel = slotShort[s.slot] ?? s.slot
    return [
      `#${i + 1} [${s.roundLabel}] ${slotLabel} ${s.agentName} ${formatTime(s.timestamp)}`,
      s.content,
    ].join('\n')
  }).join('\n\n')
}

export default function Transcript({ speeches, bodyRef }: {
  speeches: Speech[]
  bodyRef?: RefObject<HTMLDivElement>
}) {
  const { T } = useLang()
  const [copied, setCopied] = useState(false)
  const slotShort = T.slotShort as Record<string, string>

  async function copyTranscript() {
    if (speeches.length === 0) return
    await navigator.clipboard.writeText(formatTranscript(speeches, slotShort))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="transcript">
      <div className="transcript-header">
        <span>{T.transcript.title} {T.transcript.count}{speeches.length}{T.transcript.countUnit} ──</span>
        <button className="transcript-copy" onClick={copyTranscript} disabled={speeches.length === 0}>
          {copied ? '已复制' : '复制'}
        </button>
      </div>
      <div className="transcript-body" ref={bodyRef}>
        {speeches.length === 0 && (
          <div className="text-dim" style={{ fontSize: 11, padding: '8px 0' }}>{T.transcript.empty}</div>
        )}
        {speeches.map((s, i) => {
          const side = s.slot.startsWith('pro') ? 'pro' : s.slot.startsWith('con') ? 'con' : 'judge'
          const slotLabel = slotShort[s.slot] ?? s.slot
          return (
            <div key={i} className={`transcript-entry ${side}`}>
              <div className="transcript-meta">
                <span className="entry-num">#{i + 1}</span>
                <span className="entry-round">{s.roundLabel}</span>
                <span className={`entry-slot ${side}`}>{slotLabel}</span>
                <span className="entry-name">{s.agentName}</span>
                <span className="entry-time">{formatTime(s.timestamp)}</span>
              </div>
              <div className="transcript-text">{s.content}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
