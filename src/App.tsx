import { useEffect, useRef, useState, type ChangeEvent, type MouseEvent } from 'react'
import { io } from 'socket.io-client'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import './App.css'

// ============================================
// CREATOR — your name, visible in every new note
// ============================================
const CREATOR_NAME = 'Abhinav Shukla'

// ============================================
// STARTER TEXT — what appears when someone opens a new note
// This is your signature inside the canvas
// ============================================
const STARTER_TEXT = `# A notepad by ${CREATOR_NAME}

Welcome. This is a live, collaborative space — whatever you type here
will sync in real time with anyone who has this link open.

Your writing saves itself.

---

Start by deleting this and writing something of your own.
`

// ============================================
// SOCKET CONNECTION
// ============================================
const socket = io('https://synsia.fourrnexus.com')

// ============================================
// USER IDENTITIES
// Each visitor gets a random animal name + color
// ============================================
const USER_IDENTITIES = [
  { name: 'Anon',         color: '#9B5FAA' },
  { name: 'Phantom',      color: '#DC8296' },
  { name: 'Shadow',       color: '#7B7590' },
  { name: 'Cipher',       color: '#7B9BC0' },
  { name: 'Specter',      color: '#9B87C9' },
  { name: 'Wraith',       color: '#B88A6B' },
  { name: 'Vagrant',      color: '#C09960' },
  { name: 'Drifter',      color: '#A67B5B' },
  { name: 'Nomad',        color: '#7B9B82' },
  { name: 'Ghost',        color: '#C49B8B' },
]

type User = {
  id: string
  name: string
  color: string
}

function generateUser(): User {
  const pick = USER_IDENTITIES[Math.floor(Math.random() * USER_IDENTITIES.length)]
  return {
    id: Math.random().toString(36).slice(2, 10),
    ...pick,
  }
}

// ============================================
// THROTTLE — for cursor broadcasts (max 20/sec)
// ============================================
function throttle<TArgs extends unknown[]>(
  fn: (...args: TArgs) => void,
  ms: number
): (...args: TArgs) => void {
  let last = 0
  return (...args: TArgs) => {
    const now = Date.now()
    if (now - last >= ms) {
      last = now
      fn(...args)
    }
  }
}

function App() {
  // ============================================
  // STATE
  // ============================================
  const [text, setText] = useState('')
  const [isPreview, setIsPreview] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [isConnected, setIsConnected] = useState(socket.connected)
  const [onlineUsers, setOnlineUsers] = useState<User[]>([])
  const [copied, setCopied] = useState(false)
  const [remoteCursors, setRemoteCursors] = useState<Record<string, { x: number; y: number }>>({})
  const [sidebarOpen, setSidebarOpen] = useState(false) // mobile only

  // Current user
  const [me] = useState<User>(generateUser)

  // Document ID from URL
  const [documentId] = useState(() => {
    const path = window.location.pathname.replace(/^\/+/, '').trim()
    if (path) return path
    const newId = `note-${Date.now().toString(36)}`
    window.history.replaceState(null, '', `/${newId}`)
    return newId
  })

  // ============================================
  // REFS
  // ============================================
  const saveTimeoutRef = useRef<number | null>(null)
  const latestTextRef = useRef<string>('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const lineNumbersRef = useRef<HTMLDivElement>(null)

  // ============================================
  // EFFECT: Socket setup
  // ============================================
  useEffect(() => {
    socket.emit('join-document', { documentId, user: me })

    const handleConnect = () => setIsConnected(true)
    const handleDisconnect = () => setIsConnected(false)

    const handleLoad = (content: string) => {
      // Empty document → seed with starter text (Abhinav's signature)
      if (!content || !content.trim()) {
        setText(STARTER_TEXT)
        latestTextRef.current = STARTER_TEXT
        socket.emit('save-document', { documentId, content: STARTER_TEXT })
      } else {
        setText(content)
        latestTextRef.current = content
      }
    }

    const handleReceive = (content: string) => {
      setText(content)
      latestTextRef.current = content
    }

    const handleUsers = (users: User[]) => {
      setOnlineUsers(users)
    }

    const handleSaveSuccess = () => {
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 2200)
    }

    const handleSaveError = () => {
      setSaveStatus('error')
      setTimeout(() => setSaveStatus('idle'), 3000)
    }

    const handleRemoteCursor = ({ userId, x, y }: { userId: string; x: number; y: number }) => {
      setRemoteCursors(prev => ({ ...prev, [userId]: { x, y } }))
    }

    const handleCursorLeave = ({ userId }: { userId: string }) => {
      setRemoteCursors(prev => {
        const next = { ...prev }
        delete next[userId]
        return next
      })
    }

    socket.on('connect', handleConnect)
    socket.on('disconnect', handleDisconnect)
    socket.on('load-content', handleLoad)
    socket.on('receive-changes', handleReceive)
    socket.on('users-update', handleUsers)
    socket.on('save-success', handleSaveSuccess)
    socket.on('save-error', handleSaveError)
    socket.on('cursor-move', handleRemoteCursor)
    socket.on('cursor-leave', handleCursorLeave)

    return () => {
      socket.off('connect', handleConnect)
      socket.off('disconnect', handleDisconnect)
      socket.off('load-content', handleLoad)
      socket.off('receive-changes', handleReceive)
      socket.off('users-update', handleUsers)
      socket.off('save-success', handleSaveSuccess)
      socket.off('save-error', handleSaveError)
      socket.off('cursor-move', handleRemoteCursor)
      socket.off('cursor-leave', handleCursorLeave)
    }
  }, [documentId, me])

  // ============================================
  // EFFECT: 🔥 Save on refresh/close
  // ============================================
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
      socket.emit('save-document', {
        documentId,
        content: latestTextRef.current,
      })
      socket.emit('cursor-leave', { documentId, userId: me.id })
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [documentId, me])

  // ============================================
  // HANDLER: Typing in editor
  // ============================================
  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value
    setText(newText)
    latestTextRef.current = newText

    socket.emit('send-changes', { documentId, content: newText })

    setSaveStatus('saving')
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = window.setTimeout(() => {
      socket.emit('save-document', { documentId, content: newText })
    }, 1000)
  }

  // ============================================
  // HANDLER: Sync line numbers with textarea scroll
  // ============================================
  const handleScroll = () => {
    if (lineNumbersRef.current && textareaRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop
    }
  }

  // ============================================
  // HANDLER: Mouse move → broadcast cursor position
  // ============================================
  const handleMouseMove = useRef(
    throttle((e: MouseEvent<HTMLDivElement>) => {
      if (!canvasRef.current) return
      const rect = canvasRef.current.getBoundingClientRect()
      const x = ((e.clientX - rect.left) / rect.width) * 100
      const y = ((e.clientY - rect.top) / rect.height) * 100
      socket.emit('cursor-move', {
        documentId,
        userId: me.id,
        x,
        y,
      })
    }, 50)
  ).current

  // ============================================
  // DERIVED VALUES
  // ============================================
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0
  const charCount = text.length
  const lines = text ? text.split('\n') : ['']
  const lineCount = lines.length

  const othersOnline = onlineUsers.filter(u => u.id !== me.id)
  const totalHere = onlineUsers.length || 1

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setSidebarOpen(false) // auto-close on mobile
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // silent
    }
  }

  const downloadMarkdown = () => {
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' })
    const href = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = href
    a.download = `${documentId}.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(href)
    setSidebarOpen(false) // auto-close on mobile
  }

  // Map userId → User for cursor colors
  const userById = Object.fromEntries(onlineUsers.map(u => [u.id, u]))

  // ============================================
  // RENDER
  // ============================================
  return (
    <div className={`app ${sidebarOpen ? 'app--sidebar-open' : ''}`}>
      {/* Aurora background */}
      <div className="aurora" aria-hidden />
      <div className="grain" aria-hidden />

      {/* Mobile backdrop (tap to close sidebar) */}
      <div
        className="sidebar-backdrop"
        onClick={() => setSidebarOpen(false)}
        aria-hidden
      />

      {/* ============ SIDEBAR ============ */}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">§</div>
          <div className="brand-name">Synsia</div>
        </div>

        <div className="side-section">
          <div className="side-label">
            <span>Document</span>
          </div>
          <div className="nav-item nav-item--active">
            <span className="bullet" />
            <span className="nav-text">{documentId}</span>
          </div>
        </div>

        <div className="side-section">
          <div className="side-label">
            <span>Here now</span>
            <span className="count-pill">{totalHere}</span>
          </div>
          <div className="user-card">
            <div className="user-row">
              <div className="user-avatar" style={{ background: me.color }}>
                {me.name[0]}
              </div>
              <span className="user-name">{me.name}</span>
              <span className="user-badge">you</span>
            </div>
            {othersOnline.slice(0, 5).map(u => (
              <div key={u.id} className="user-row">
                <div className="user-avatar" style={{ background: u.color }}>
                  {u.name[0]}
                </div>
                <span className="user-name">{u.name}</span>
              </div>
            ))}
            {othersOnline.length > 5 && (
              <div className="user-row">
                <div className="user-avatar user-avatar--more">+{othersOnline.length - 5}</div>
                <span className="user-name">more</span>
              </div>
            )}
          </div>
        </div>

        <div className="side-section">
          <div className="side-label">
            <span>Actions</span>
          </div>
          <button className="side-action" onClick={copyLink}>
            {copied ? (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 1 0 7.07 7.07l1.71-1.71" />
              </svg>
            )}
            <span>{copied ? 'Link copied' : 'Copy link'}</span>
          </button>
          <button className="side-action" onClick={downloadMarkdown}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>Download .md</span>
          </button>
        </div>

        <div className="side-foot">
          <span className={`foot-dot ${saveStatus === 'error' ? 'foot-dot--error' : ''}`} />
          <span>
            {saveStatus === 'saving' ? 'Saving…' :
             saveStatus === 'error' ? 'Connection lost' :
             'All changes saved'}
          </span>
        </div>
      </aside>

      {/* ============ MAIN ============ */}
      <div className="main">
        {/* TOPBAR */}
        <header className="topbar">
          <button
            className="menu-btn"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label="Toggle sidebar"
          >
            <span /><span /><span />
          </button>

          <nav className="crumbs">
            <span className="crumbs-root">Workspace</span>
            <span className="crumbs-sep">/</span>
            <span className="crumbs-current">{documentId}</span>
          </nav>

          <div className="tools">
            <div className={`status-chip ${isConnected ? 'status-chip--on' : 'status-chip--off'}`}>
              <span className="status-dot" />
              {isConnected ? 'Live' : 'Offline'}
            </div>

            <button className="btn-mono" onClick={() => setIsPreview(!isPreview)}>
              {isPreview ? 'Edit' : 'Preview'}
            </button>
          </div>
        </header>

        {/* DOCUMENT HEADER */}
        <div className="dochead">
          <div className="eyebrow">
            <span className="eyebrow-line" />
            <span>A notepad · {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}</span>
          </div>
          <h1 className="doc-title">
            A small place to <em>think</em> out loud
          </h1>
          <div className="doc-meta">
            <span className="meta-chip">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              Fresh page
            </span>
            <span className="meta-dot" />
            <span className="meta-chip">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
              </svg>
              {totalHere > 1 ? `${totalHere} writing together` : 'Just you'}
            </span>
            <span className="meta-dot" />
            <span className="meta-chip">Syncs live</span>
          </div>
        </div>

        {/* CANVAS */}
        <main
          className="canvas"
          ref={canvasRef}
          onMouseMove={handleMouseMove}
        >
          {isPreview ? (
            <article className="preview">
              {text.trim() ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
              ) : (
                <p className="preview-empty">Nothing to preview yet.</p>
              )}
            </article>
          ) : (
            <div className="edit-wrap">
              <div ref={lineNumbersRef} className="line-col" aria-hidden>
                {lines.map((_, i) => (
                  <div key={i} className="line-num">{i + 1}</div>
                ))}
              </div>
              <textarea
                ref={textareaRef}
                className="editor"
                value={text}
                onChange={handleChange}
                onScroll={handleScroll}
                placeholder="Begin wherever you like. It saves itself."
                spellCheck={false}
                autoFocus
              />
            </div>
          )}

          {/* Remote cursors */}
          {Object.entries(remoteCursors).map(([uid, pos]) => {
            const u = userById[uid]
            if (!u || uid === me.id) return null
            return (
              <div
                key={uid}
                className="remote-cursor"
                style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
              >
                <svg
                  className="cursor-arrow"
                  width="18"
                  height="18"
                  viewBox="0 0 16 16"
                  fill={u.color}
                >
                  <path d="M1 1 L1 12 L4.5 9 L7 14.5 L9.5 13.5 L7 8 L11.5 8 Z" />
                </svg>
                <span className="cursor-label" style={{ background: u.color }}>
                  {u.name}
                </span>
              </div>
            )
          })}
        </main>

        {/* COLOPHON (your signature) */}
        <footer className="colophon">
          <div className="col-l">
            <span className="col-stat">{wordCount}</span> words
            <span className="col-sep">·</span>
            <span className="col-stat">{charCount}</span> chars
            <span className="col-sep">·</span>
            <span className="col-stat">{lineCount}</span> lines
          </div>

          <div className="col-c">
            <span className="col-italic">a small tool</span>
            <span className="col-accent-dot" />
            <span className="col-italic">made by</span>
            <span className="col-name">{CREATOR_NAME}</span>
            <span className="col-accent-dot" />
            <span className="col-italic">with care</span>
          </div>

          <div className="col-r">
            Markdown<span className="col-sep">·</span>UTF-8
          </div>
        </footer>
      </div>
    </div>
  )
}

export default App