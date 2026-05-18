import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiUrl } from '../lib/api'
import { useLang } from '../i18n/context'

interface Room {
  id: string
  topic: string
  status: 'waiting' | 'active' | 'ended'
  pro1_name: string | null
  pro2_name: string | null
  con1_name: string | null
  con2_name: string | null
  judge_name: string | null
  winner: string | null
  created_at: number
}

export default function Lobby() {
  const [rooms, setRooms] = useState<Room[]>([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()
  const { T } = useLang()

  function isCreator(id: string): boolean {
    return !!localStorage.getItem(`creator_token_${id}`)
  }

  async function deleteRoom(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    const token = localStorage.getItem(`creator_token_${id}`)
    if (!token) return
    await fetch(apiUrl(`/api/rooms/${id}`), {
      method: 'DELETE',
      headers: { 'X-Creator-Token': token },
    })
    setRooms(prev => prev.filter(r => r.id !== id))
  }

  const SLOT_SHORT = T.slotShort
  const SLOT_KEYS: { key: string; label: string }[] = [
    { key: 'pro1_name', label: SLOT_SHORT.pro_1 },
    { key: 'pro2_name', label: SLOT_SHORT.pro_2 },
    { key: 'con1_name', label: SLOT_SHORT.con_1 },
    { key: 'con2_name', label: SLOT_SHORT.con_2 },
    { key: 'judge_name', label: SLOT_SHORT.judge },
  ]

  const STATUS_LABELS: Record<string, string> = {
    waiting: T.lobby.statusWaiting,
    active: T.lobby.statusActive,
    ended: T.lobby.statusEnded,
  }

  useEffect(() => {
    fetch(apiUrl('/api/rooms'))
      .then(r => r.json())
      .then(data => { setRooms(data); setLoading(false) })
      .catch(() => setLoading(false))

    const t = setInterval(() => {
      fetch(apiUrl('/api/rooms')).then(r => r.json()).then(setRooms).catch(() => {})
    }, 5000)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="lobby">
      <div className="lobby-header">
        <span className="lobby-title">{T.lobby.title}</span>
        <button className="btn" onClick={() => navigate('/create')}>{T.lobby.newRoom}</button>
      </div>

      {loading && <div className="text-dim">{T.lobby.loading}</div>}

      {!loading && rooms.length === 0 && (
        <div className="empty-state">
          {T.lobby.empty}<br />
          <span className="text-dim" style={{ fontSize: 11 }}>{T.lobby.emptyHint}</span>
        </div>
      )}

      <div className="room-grid">
        {rooms.map(room => (
          <div
            key={room.id}
            className={`room-card ${room.status}`}
            onClick={() => navigate(`/room/${room.id}`)}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div className="room-topic">{room.topic}</div>
              {isCreator(room.id) && (
                <span
                  style={{ color: 'var(--dim)', fontSize: 11, cursor: 'pointer', padding: '0 4px' }}
                  onClick={e => deleteRoom(e, room.id)}
                  title="删除"
                >✕</span>
              )}
            </div>
            <div className="room-meta">
              <span className={room.status === 'active' ? 'text-green' : room.status === 'ended' ? 'text-dim' : 'text-yellow'}>
                ● {STATUS_LABELS[room.status]}
              </span>
              <span className="text-dim">#{room.id}</span>
              {room.status === 'ended' && room.winner && room.winner !== 'none' && (
                <span className="text-cyan">
                  {T.lobby.winner}{room.winner === 'pro' ? T.lobby.pro : T.lobby.con}
                </span>
              )}
            </div>
            <div className="room-slots">
              {SLOT_KEYS.map(({ key, label }) => {
                const name = (room as any)[key]
                return (
                  <span key={key} className={`slot-dot ${name ? 'connected' : 'empty'}`}>
                    {label}{name ? `:${name}` : ''}
                  </span>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
