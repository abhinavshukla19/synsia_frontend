import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { io } from 'socket.io-client'
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import './App.css'

const socket = io('https://synsiabackend-production.up.railway.app')

function App() {
  const [text, settext] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const [connected, setConnected] = useState(socket.connected)  // fix: init from actual state
  const [previewMode, setPreviewMode] = useState(false)
  const documentId = window.location.pathname.slice(1) || 'untitled'
  const lastSaved = useRef<number>(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const lineNumbersRef = useRef<HTMLDivElement>(null)  // for scroll sync

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

  // Sync line numbers scroll with textarea scroll
  const handleScroll = () => {
    if (lineNumbersRef.current && textareaRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop
    }
  }

  const lines = text ? text.split('\n') : ['']
  const characterCount = text.length
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0
  const lineCount = lines.length

  const prettyDocumentId = documentId
  const compactDocumentId =
    prettyDocumentId.length > 22
      ? `${prettyDocumentId.slice(0, 14)}…${prettyDocumentId.slice(-5)}`
      : prettyDocumentId

  const lastSavedLabel =
    lastSaved.current === 0
      ? 'Not saved yet'
      : `Saved at ${new Date(lastSaved.current).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    settext(val)
    socket.emit('send-changes', { documentId, content: val })
    const now = Date.now()
    if (now - lastSaved.current > 2000) {
      setIsSaving(true)
      socket.emit('save-document', { documentId, content: val })     // for save document
      lastSaved.current = now
      setTimeout(() => {
        setIsSaving(false)
        setJustSaved(true)
        setTimeout(() => setJustSaved(false), 2000)
      }, 700)
    }
  }

  const saveStatus = isSaving ? 'saving' : justSaved ? 'saved' : 'idle'

  return (
    <div className="shell">

      {/* ── SIDEBAR ── */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <img src="/favicon.svg" alt="Synsia icon" className="sidebar-logo-mark" />
          <div className="sidebar-logo-copy">
            <span className="sidebar-logo-text">Synsia</span>
            <span className="sidebar-logo-sub">Live Notepad</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="sidebar-section-label">Workspace</div>
          <button className="sidebar-item sidebar-item--active">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            {compactDocumentId}
          </button>
        </nav>

        <div className="sidebar-bottom">
          <div className={`conn-status ${connected ? 'conn-status--on' : 'conn-status--off'}`}>
            <span className="conn-dot" />
            {connected ? 'Connected' : 'Disconnected'}
          </div>
          <div className="sidebar-endpoint">192.168.1.10:3000</div>
        </div>
      </aside>

      {/* ── MAIN CONTENT ── */}
      <div className="main">

        {/* topbar */}
        <header className="topbar">
          <div className="topbar-left">
            <span className="topbar-breadcrumb">
              <span className="breadcrumb-dim">workspace</span>
              <span className="breadcrumb-sep">/</span>
              <span className="breadcrumb-doc">{compactDocumentId}</span>
            </span>
          </div>
          <div className="topbar-center">
            <div className="live-pill">
              <span className="live-pulse" />
              LIVE SYNC
            </div>
          </div>
          <div className="topbar-right">
            <button className="preview-toggle" onClick={() => setPreviewMode(!previewMode)}>
              {previewMode ? "Edit Mode" : "Preview Mode"}
            </button>
            <span className={`save-badge save-badge--${saveStatus}`}>
              {saveStatus === 'saving' && (
                <><span className="save-spinner" />Saving…</>
              )}
              {saveStatus === 'saved' && (
                <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>Saved</>
              )}
              {saveStatus === 'idle' && (
                <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>{lastSavedLabel}</>
              )}
            </span>
          </div>
        </header>

        {/* document header */}
        <div className="doc-header">
          <div className="doc-title-row">
            <h1 className="doc-title">{compactDocumentId}</h1>
            <span className="doc-ext">.txt</span>
          </div>
          <div className="doc-meta-row">
            <span className="doc-meta-item">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </span>
            <span className="doc-meta-sep">·</span>
            <span className="doc-meta-item">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              Collaborative document
            </span>
          </div>
        </div>

        {/* editor area */}
        <div className="editor-area">
          {previewMode ? (
            // ── PREVIEW MODE ──
            <div className="markdown-preview">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {text}
              </ReactMarkdown>
            </div>
          ) : (
            // ── EDIT MODE ──
            <>
              <div
                ref={lineNumbersRef}
                className="line-numbers"
                aria-hidden="true"
              >
                {lines.map((_, i) => (
                  <div key={i} className="line-number">{i + 1}</div>
                ))}
              </div>

              <textarea
                ref={textareaRef}
                className="editor"
                value={text}
                onChange={handleChange}
                onScroll={handleScroll}
                spellCheck={false}
                placeholder={"Start writing…\n\nYour words will sync in real time to everyone\nwho has this document open."}
              />
            </>
          )}
        </div>

        {/* statusbar */}
        <footer className="statusbar">
          <div className="statusbar-left">
            <span className="stat">
              <strong>{lineCount}</strong> {lineCount === 1 ? 'line' : 'lines'}
            </span>
            <span className="stat-div" />
            <span className="stat">
              <strong>{wordCount}</strong> {wordCount === 1 ? 'word' : 'words'}
            </span>
            <span className="stat-div" />
            <span className="stat">
              <strong>{characterCount}</strong> {characterCount === 1 ? 'char' : 'chars'}
            </span>
          </div>
          <div className="statusbar-right">
            <span className="stat">Plain Text</span>
            <span className="stat-div" />
            <span className="stat">UTF-8</span>
            <span className="stat-div" />
            <span className="stat">LF</span>
          </div>
        </footer>

      </div>
    </div>
  )
}

export default App