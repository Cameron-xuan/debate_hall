import { Routes, Route, useLocation, useNavigate } from 'react-router-dom'
import { useLang } from './i18n/context'
import Lobby from './pages/Lobby'
import Create from './pages/Create'
import Room from './pages/Room'
import HowTo from './pages/HowTo'

function TopBar() {
  const location = useLocation()
  const navigate = useNavigate()
  const { lang, setLang, T } = useLang()
  const roomMatch = location.pathname.match(/^\/room\/([a-z0-9]+)/)
  const roomId = roomMatch?.[1]

  const TABS = [
    { label: `[0] ${T.nav.lobby}`,  path: '/lobby' },
    { label: `[1] ${T.nav.create}`, path: '/create' },
    { label: `[2] ${T.nav.howto}`,  path: '/how-to' },
  ]

  return (
    <div className="topbar">
      <div className="topbar-left">
        <span className="topbar-brand">debate-hall</span>
        {TABS.map(tab => (
          <span
            key={tab.path}
            className={`topbar-tab${location.pathname.startsWith(tab.path) ? ' active' : ''}`}
            onClick={() => navigate(tab.path)}
          >
            {tab.label}
          </span>
        ))}
      </div>
      <div className="topbar-right" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {roomId && <span className="text-green">▶ room:{roomId}</span>}
        <span
          style={{ cursor: 'pointer', color: lang === 'zh' ? 'var(--cyan)' : 'var(--dim)', fontSize: 11 }}
          onClick={() => setLang('zh')}
        >中文</span>
        <span style={{ color: 'var(--border)' }}>|</span>
        <span
          style={{ cursor: 'pointer', color: lang === 'en' ? 'var(--cyan)' : 'var(--dim)', fontSize: 11 }}
          onClick={() => setLang('en')}
        >EN</span>
        <span style={{ color: 'var(--dim)', fontSize: 11 }}>
          {new Date().toISOString().slice(0, 10)}
        </span>
      </div>
    </div>
  )
}

function StatusBar() {
  const location = useLocation()
  const { T } = useLang()
  const isLobby = location.pathname === '/lobby' || location.pathname === '/'
  return (
    <div className="statusbar">
      <span>
        <span className="green">debate-hall</span>
        {isLobby && <span className="dim"> — {T.status.lobby}</span>}
      </span>
      <span className="dim">{new Date().toUTCString().slice(17, 25)} UTC</span>
    </div>
  )
}

export default function App() {
  return (
    <div className="app">
      <TopBar />
      <div className="page-content">
        <Routes>
          <Route path="/" element={<Lobby />} />
          <Route path="/lobby" element={<Lobby />} />
          <Route path="/create" element={<Create />} />
          <Route path="/room/:id" element={<Room />} />
          <Route path="/how-to" element={<HowTo />} />
          <Route path="*" element={<div style={{ padding: 40, color: 'var(--dim)' }}>404 — Page not found</div>} />
        </Routes>
      </div>
      <StatusBar />
    </div>
  )
}
