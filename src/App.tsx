import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { io } from 'socket.io-client'
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import './App.css'

const socket = io('http://34.47.183.253:3000')

function App() {
  const [text, settext] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const [connected, setConnected] = useState(socket.connected)
  const [previewMode, setPreviewMode] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const documentId = window.location.pathname.slice(1) || 'untitled'
  const lastSaved = useRef<number>(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const lineNumbersRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    socket.emit('join-document', documentId)
    socket.on('connect', () => setConnected(true))
    socket.on('disconnect', () => setConnected(false))
    socket.on('receive-changes', (newtext) => { settext(newtext) })
    socket.on('load-content', (content) => { settext(content) })
    return () => {
      socket.off('receive-changes')
      socket.off('connect')
      socket.off('disconnect')
    }
  }, [documentId])

  const handleScroll = () => {
    if (lineNumbersRef.current && textareaRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop
    }
  }

  const lines = text ? text.split('\n') : ['']
  const characterCount = text.length
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0
  const lineCount = lines.length

  const compactDocumentId =
    documentId.length > 22
      ? `${documentId.slice(0, 14)}…${documentId.slice(-5)}`
      : documentId

  const lastSavedLabel =
    lastSaved.current === 0
      ? 'Not saved'
      : `${new Date(lastSaved.current).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    settext(val)
    socket.emit('send-changes', { documentId, content: val })
    const now = Date.now()
    if (now - lastSaved.current > 2000) {
      setIsSaving(true)
      socket.emit('save-document', { documentId, content: val })
      lastSaved.current = now
      setTimeout(() => {
        setIsSaving(false)
        setJustSaved(true)
        setTimeout(() => setJustSaved(false), 2000)
      }, 700)
    }
  }

  const saveStatus = isSaving ? 'saving' : justSaved ? 'saved' : 'idle'
  const readTime = Math.max(1, Math.ceil(wordCount / 200))

  return (
    <div className={`shell ${sidebarOpen ? '' : 'sidebar-collapsed'}`}>

      {/* SIDEBAR */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <img className="sidebar-logo-img" src="/logo-synsia-new.svg" alt="Synsia – Live Notepad" />
        </div>

        <div className="sidebar-nav">
          <p className="nav-label">Workspace</p>
          <button className="nav-item nav-item--active">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            <span>{compactDocumentId}</span>
            <span className="nav-pill">open</span>
          </button>
        </div>

        <div className="sidebar-stats-panel">
          <p className="nav-label">Document</p>
          <div className="stat-grid">
            <div className="stat-cell">
              <span className="stat-num">{wordCount.toLocaleString()}</span>
              <span className="stat-lbl">words</span>
            </div>
            <div className="stat-cell">
              <span className="stat-num">{lineCount}</span>
              <span className="stat-lbl">lines</span>
            </div>
            <div className="stat-cell">
              <span className="stat-num">{characterCount.toLocaleString()}</span>
              <span className="stat-lbl">chars</span>
            </div>
            <div className="stat-cell">
              <span className="stat-num">{readTime}m</span>
              <span className="stat-lbl">read</span>
            </div>
          </div>
        </div>

        <div className="sidebar-foot">
          <div className={`conn-badge ${connected ? 'conn-badge--on' : 'conn-badge--off'}`}>
            <span className="conn-dot" />
            <span>{connected ? 'Connected' : 'Disconnected'}</span>
          </div>
          <span className="sidebar-ver">UTF-8 · LF</span>
        </div>
      </aside>

      {/* MAIN */}
      <div className="main">

        {/* TOPBAR */}
        <header className="topbar">
          <div className="topbar-l">
            <button className="menu-btn" onClick={() => setSidebarOpen(!sidebarOpen)}>
              <span /><span /><span />
            </button>
            <div className="topbar-logo">
              <img src="/logo-synsia-new.svg" alt="Synsia – Live Notepad" />
            </div>
            <nav className="breadcrumb">
              <span className="bc-dim">workspace</span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
              <span className="bc-active">{compactDocumentId}</span>
            </nav>
          </div>

          <div className="topbar-c">
            <div className={`live-badge ${connected ? 'live-badge--on' : 'live-badge--off'}`}>
              <span className="live-ring" />
              <span>{connected ? 'Live Sync' : 'Offline'}</span>
            </div>
          </div>

          <div className="topbar-r">
            <div className={`save-chip save-chip--${saveStatus}`}>
              {saveStatus === 'saving' && <><span className="chip-spin" /> Saving…</>}
              {saveStatus === 'saved' && <><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg> Saved {lastSavedLabel}</>}
              {saveStatus === 'idle' && <><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> {lastSavedLabel}</>}
            </div>
            <div className="tb-sep" />
            <button className={`view-btn ${previewMode ? 'view-btn--prev' : ''}`} onClick={() => setPreviewMode(!previewMode)}>
              {previewMode
                ? <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> Edit</>
                : <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> Preview</>
              }
            </button>
          </div>
        </header>

        {/* DOC HEADER */}
        <div className="doc-head">
          <div className="doc-title-row">
            <h1 className="doc-title">{compactDocumentId}</h1>
            <span className="doc-ext">.md</span>
          </div>
          <div className="doc-meta">
            <span className="meta-chip">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </span>
            <span className="meta-dot">·</span>
            <span className="meta-chip">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
              Collaborative
            </span>
            <span className="meta-dot">·</span>
            <span className="meta-chip">{readTime} min read</span>
          </div>
        </div>

        {/* EDITOR / PREVIEW */}
        <div className="content-area">
          {previewMode ? (
            <div className="preview-wrap">
              <div className="preview-body">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
              </div>
            </div>
          ) : (
            <div className="edit-wrap">
              <div ref={lineNumbersRef} className="linum-col" aria-hidden="true">
                {lines.map((_, i) => (
                  <div key={i} className="linum">{i + 1}</div>
                ))}
              </div>
              <textarea
                ref={textareaRef}
                className="editor-ta"
                value={text}
                onChange={handleChange}
                onScroll={handleScroll}
                spellCheck={false}
                placeholder={"Start writing…\n\nYour words sync in real time with\neveryone who has this document open."}
              />
            </div>
          )}
        </div>

        {/* STATUS BAR */}
        <footer className="statusbar">
          <div className="sb-left">
            <span className="sb-item"><strong>{lineCount}</strong> lines</span>
            <span className="sb-sep" />
            <span className="sb-item"><strong>{wordCount.toLocaleString()}</strong> words</span>
            <span className="sb-sep" />
            <span className="sb-item"><strong>{characterCount.toLocaleString()}</strong> chars</span>
          </div>
          <div className="sb-right">
            <span className="sb-item">Markdown</span>
            <span className="sb-sep" />
            <span className="sb-item">UTF-8</span>
            <span className="sb-sep" />
            <span className="sb-item">LF</span>
          </div>
        </footer>

      </div>
    </div>
  )
}

export default App