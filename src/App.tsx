import { useEffect, useRef, useState, type ChangeEvent, type CSSProperties } from 'react'
import { io } from 'socket.io-client'
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import './App.css'

const socket = io('https://synsia.fourrnexus.com')

const DEFAULT_ACCENT = { r: 245, g: 158, b: 11 }

function extractVibrantAccentFromImageData(data: Uint8ClampedArray): { r: number; g: number; b: number } {
  let wr = 0
  let wg = 0
  let wb = 0
  let wsum = 0
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const a = data[i + 3]
    if (a < 90) continue
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const sat = max === min ? 0 : (max - min) / 255
    const w = sat * sat * (a / 255) + 0.015
    wr += r * w
    wg += g * w
    wb += b * w
    wsum += w
  }
  if (wsum < 1e-6) return DEFAULT_ACCENT
  const r = Math.min(255, Math.max(24, Math.round(wr / wsum)))
  const g = Math.min(255, Math.max(24, Math.round(wg / wsum)))
  const b = Math.min(255, Math.max(24, Math.round(wb / wsum)))
  return { r, g, b }
}

function accentCssVars(r: number, g: number, b: number): Record<string, string> {
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  const ink =
    lum < 0.52
      ? {
          r: Math.min(255, Math.round(r + (255 - r) * 0.48)),
          g: Math.min(255, Math.round(g + (255 - g) * 0.48)),
          b: Math.min(255, Math.round(b + (255 - b) * 0.48)),
        }
      : { r, g, b }
  return {
    '--custom-accent-rgb': `${r}, ${g}, ${b}`,
    '--accent': `rgb(${r} ${g} ${b})`,
    '--accent-soft': `rgb(${r} ${g} ${b} / 0.24)`,
    '--accent-ink': `rgb(${ink.r} ${ink.g} ${ink.b})`,
  }
}

function App() {
  const [text, settext] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)
  const [connected, setConnected] = useState(socket.connected)
  const [previewMode, setPreviewMode] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [docStatsExpanded, setDocStatsExpanded] = useState(false)
  const [uiTheme, setUiTheme] = useState<'synsia' | 'zen' | 'noir' | 'custom'>('synsia')
  const [customBgUrl, setCustomBgUrl] = useState('')
  const [customAccentStyle, setCustomAccentStyle] = useState<Record<string, string> | null>(null)
  const [documentId] = useState(() => {
    const currentPath = window.location.pathname.replace(/^\/+/, '').trim()
    if (currentPath) return currentPath

    const generatedId = `note-${Date.now().toString(36)}`
    window.history.replaceState(null, '', `/${generatedId}`)
    return generatedId
  })
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
  const estimatedPages = Math.max(1, Math.ceil(wordCount / 500))
  const writingGoal = 500
  const goalProgress = Math.min(100, Math.round((wordCount / writingGoal) * 100))
  const completionTone =
    goalProgress >= 100 ? 'Great pace' : goalProgress >= 60 ? 'On track' : 'Keep writing'
  const logoByTheme = {
    synsia: '/logo-synsia-theme.svg',
    zen: '/logo-zen-theme.svg',
    noir: '/logo-noir-theme.svg',
    custom: '/logo-synsia-theme.svg',
  } as const
  const topbarLogoByTheme = {
    synsia: '/logo-synsia-header.svg',
    zen: '/logo-zen-theme.svg',
    noir: '/logo-noir-theme.svg',
    custom: '/logo-synsia-header.svg',
  } as const
  const currentLogo = logoByTheme[uiTheme]
  const currentTopbarLogo = topbarLogoByTheme[uiTheme]

  const trimmedCustomBg = customBgUrl.trim()

  useEffect(() => {
    if (uiTheme !== 'custom') {
      setCustomAccentStyle(null)
      return
    }
    if (!trimmedCustomBg) {
      setCustomAccentStyle(null)
      return
    }
    const handle = window.setTimeout(() => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.referrerPolicy = 'no-referrer'
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas')
          const side = 96
          canvas.width = side
          canvas.height = side
          const ctx = canvas.getContext('2d', { willReadFrequently: true })
          if (!ctx) {
            setCustomAccentStyle(null)
            return
          }
          ctx.drawImage(img, 0, 0, side, side)
          const { data } = ctx.getImageData(0, 0, side, side)
          const { r, g, b } = extractVibrantAccentFromImageData(data)
          setCustomAccentStyle(accentCssVars(r, g, b))
        } catch {
          setCustomAccentStyle(null)
        }
      }
      img.onerror = () => setCustomAccentStyle(null)
      img.src = trimmedCustomBg
    }, 420)
    return () => window.clearTimeout(handle)
  }, [uiTheme, trimmedCustomBg])

  const shellStyle: CSSProperties & Record<string, string> =
    uiTheme === 'custom' && customAccentStyle ? { ...customAccentStyle } : {}

  const copyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopiedLink(true)
      setTimeout(() => setCopiedLink(false), 1600)
    } catch {
      setCopiedLink(false)
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
  }

  return (
    <div className={`shell theme-${uiTheme} ${sidebarOpen ? '' : 'sidebar-collapsed'}`} style={shellStyle}>
      {uiTheme === 'custom' && trimmedCustomBg ? (
        <div className="custom-bg-stack" aria-hidden>
          <img className="custom-bg-fill" src={trimmedCustomBg} alt="" decoding="async" />
          <div className="custom-bg-scrim" />
          <img className="custom-bg-fit" src={trimmedCustomBg} alt="" decoding="async" />
        </div>
      ) : null}

      {/* SIDEBAR */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <img className="sidebar-logo-img" src={currentLogo} alt="Synsia – Live Notepad" />
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

        <div className="sidebar-tools">
          <p className="nav-label">Quick Actions</p>
          <button className="side-action-btn" onClick={copyShareLink}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 1 0 7.07 7.07l1.71-1.71"/>
            </svg>
            <span>{copiedLink ? 'Link copied' : 'Copy share link'}</span>
          </button>
          <button className="side-action-btn" onClick={downloadMarkdown}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            <span>Download .md</span>
          </button>
        </div>

        <div className="sidebar-progress">
          <p className="nav-label">Writing Goal</p>
          <div className="goal-head">
            <span>{wordCount.toLocaleString()} / {writingGoal} words</span>
            <span>{goalProgress}%</span>
          </div>
          <div className="goal-track" aria-hidden="true">
            <span className="goal-fill" style={{ width: `${goalProgress}%` }} />
          </div>
          <p className="goal-sub">{completionTone}</p>
        </div>

        <div className="sidebar-stats-panel">
          <p className="nav-label">Document</p>
          <div className="stat-grid stat-grid--primary">
            <div className="stat-cell">
              <span className="stat-num">{wordCount.toLocaleString()}</span>
              <span className="stat-lbl">words</span>
            </div>
            <div className="stat-cell">
              <span className="stat-num">{lineCount}</span>
              <span className="stat-lbl">lines</span>
            </div>
            <div className="stat-cell">
              <span className="stat-num">{readTime}m</span>
              <span className="stat-lbl">read</span>
            </div>
          </div>
          <button
            type="button"
            className="doc-stats-toggle"
            onClick={() => setDocStatsExpanded((v) => !v)}
            aria-expanded={docStatsExpanded}
            aria-controls="doc-stats-more"
          >
            <span>{docStatsExpanded ? 'Less stats' : 'More stats'}</span>
            <svg
              className={`doc-stats-chevron ${docStatsExpanded ? 'doc-stats-chevron--open' : ''}`}
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              aria-hidden
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          <div
            id="doc-stats-more"
            className={`doc-stats-more ${docStatsExpanded ? 'doc-stats-more--open' : ''}`}
            aria-hidden={!docStatsExpanded}
          >
            <div className="stat-cell stat-cell--wide">
              <span className="stat-num">{characterCount.toLocaleString()}</span>
              <span className="stat-lbl">chars</span>
            </div>
            <div className="doc-snaps">
              <div className="snap-row">
                <span className="snap-k">Pages</span>
                <span className="snap-v">~{estimatedPages}</span>
              </div>
              <div className="snap-row">
                <span className="snap-k">Readability</span>
                <span className="snap-v">{wordCount > 1000 ? 'Long form' : wordCount > 350 ? 'Balanced' : 'Quick read'}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="sidebar-foot">
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
              <img src={currentTopbarLogo} alt="Synsia – Live Notepad" />
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
            <div className="theme-switcher" role="group" aria-label="Theme selector">
              <button
                className={`theme-btn ${uiTheme === 'synsia' ? 'theme-btn--active' : ''}`}
                onClick={() => setUiTheme('synsia')}
              >
                Synsia
              </button>
              <button
                className={`theme-btn ${uiTheme === 'zen' ? 'theme-btn--active' : ''}`}
                onClick={() => setUiTheme('zen')}
              >
                Zen
              </button>
              <button
                className={`theme-btn ${uiTheme === 'noir' ? 'theme-btn--active' : ''}`}
                onClick={() => setUiTheme('noir')}
              >
                Noir
              </button>
              <button
                className={`theme-btn ${uiTheme === 'custom' ? 'theme-btn--active' : ''}`}
                onClick={() => setUiTheme('custom')}
              >
                Custom
              </button>
            </div>
            {uiTheme === 'custom' && (
              <input
                className="custom-bg-input"
                type="url"
                value={customBgUrl}
                onChange={(e) => setCustomBgUrl(e.target.value)}
                placeholder="Paste background image URL"
              />
            )}
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