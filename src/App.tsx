import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { createRealtime, realtimeUrl, resolveDocumentId } from './lib/realtime'
import { useTheme } from './lib/theme'
import { attribute, decode, encode, toSpans, type Runs } from './lib/authorship'
import './App.css'

const CREATOR_NAME = 'Abhinav Shukla'

const STARTER_TEXT = `# A notepad by ${CREATOR_NAME}

Welcome. This is a live, collaborative space — whatever you type here
will sync in real time with anyone who has this link open.

Your writing saves itself.

---

Start by deleting this and writing something of your own.
`

// ============================================
// REALTIME CONNECTION
// One Cloudflare Durable Object per document — the id is in the URL, so it has
// to be resolved before the socket opens.
// ============================================
const DOCUMENT_ID = resolveDocumentId()
const socket = createRealtime(realtimeUrl(DOCUMENT_ID))

// Each writer keeps one colour for the session. It marks their initial in the
// masthead and, more importantly, every character they type.
const USER_IDENTITIES = [
  { name: 'Goblin', color: '#7AA2F7' },
  { name: 'Loki', color: '#FF6B6B' },
  { name: 'Cocane', color: '#38D9C4' },
  { name: 'Phantom', color: '#C07BF5' },
  { name: 'Brownie', color: '#F5B33F' },
  { name: 'Menace', color: '#FF7EB6' },
  { name: 'Aurtur', color: '#57C99A' },
  { name: 'Michel', color: '#59B8F0' },
  { name: 'Doraemon', color: '#9C8BFA' },
  { name: 'Chainsmoker', color: '#FF9147' },
]

type User = { id: string; name: string; color: string }

function generateUser(): User {
  const pick = USER_IDENTITIES[Math.floor(Math.random() * USER_IDENTITIES.length)]
  return { id: Math.random().toString(36).slice(2, 10), ...pick }
}

const Icon = {
  link: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 1 0 7.07 7.07l1.71-1.71" />
    </svg>
  ),
  check: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  down: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  ),
  sun: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  ),
  moon: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  ),
}

function App() {
  const { theme, toggle: toggleTheme } = useTheme()

  const [text, setText] = useState('')
  const [isPreview, setIsPreview] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [isConnected, setIsConnected] = useState(socket.connected)
  const [onlineUsers, setOnlineUsers] = useState<User[]>([])
  const [copied, setCopied] = useState(false)
  /** One author id per character of `text`. */
  const [authors, setAuthors] = useState<string[]>([])
  /** Everyone ever seen in this document, so text keeps its colour after
   *  its author closes the tab. */
  const [roster, setRoster] = useState<Record<string, User>>({})

  const [me] = useState<User>(generateUser)
  const documentId = DOCUMENT_ID

  const saveTimeoutRef = useRef<number | null>(null)
  const latestTextRef = useRef<string>('')
  const latestAuthorsRef = useRef<string[]>([])
  const workRef = useRef<HTMLElement>(null)

  useEffect(() => {
    socket.emit('join-document', { documentId, user: me })

    const onConnect = () => setIsConnected(true)
    const onDisconnect = () => setIsConnected(false)

    const apply = (content: string, runs: Runs | undefined) => {
      const next = decode(runs, content.length)
      setText(content)
      setAuthors(next)
      latestTextRef.current = content
      latestAuthorsRef.current = next
    }

    const onLoad = (payload: { content: string; runs?: Runs } | string) => {
      // Tolerate the old shape, in case a document predates authorship.
      const content = typeof payload === 'string' ? payload : (payload?.content ?? '')
      const runs = typeof payload === 'string' ? undefined : payload?.runs

      if (!content || !content.trim()) {
        const seeded: string[] = new Array(STARTER_TEXT.length).fill('')
        setText(STARTER_TEXT)
        setAuthors(seeded)
        latestTextRef.current = STARTER_TEXT
        latestAuthorsRef.current = seeded
        socket.emit('save-document', { documentId, content: STARTER_TEXT, runs: encode(seeded) })
      } else {
        apply(content, runs)
      }
    }

    const onReceive = (payload: { content: string; runs?: Runs } | string) => {
      if (typeof payload === 'string') apply(payload, undefined)
      else apply(payload?.content ?? '', payload?.runs)
    }

    const onUsers = (users: User[]) => {
      setOnlineUsers(users)
      setRoster((prev) => {
        const next = { ...prev }
        for (const u of users) next[u.id] = u
        return next
      })
    }

    const onSaved = () => {
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 2200)
    }
    const onSaveError = () => {
      setSaveStatus('error')
      setTimeout(() => setSaveStatus('idle'), 3000)
    }


    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('load-content', onLoad)
    socket.on('receive-changes', onReceive)
    socket.on('users-update', onUsers)
    socket.on('save-success', onSaved)
    socket.on('save-error', onSaveError)

    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('load-content', onLoad)
      socket.off('receive-changes', onReceive)
      socket.off('users-update', onUsers)
      socket.off('save-success', onSaved)
      socket.off('save-error', onSaveError)
    }
  }, [documentId, me])

  // Flush on the way out, so a refresh never costs a sentence.
  useEffect(() => {
    const onLeave = () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
      socket.emit('save-document', {
        documentId,
        content: latestTextRef.current,
        runs: encode(latestAuthorsRef.current),
      })
    }
    window.addEventListener('beforeunload', onLeave)
    return () => window.removeEventListener('beforeunload', onLeave)
  }, [documentId, me])

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value
    const nextAuthors = attribute(latestTextRef.current, latestAuthorsRef.current, next, me.id)
    const runs = encode(nextAuthors)

    setText(next)
    setAuthors(nextAuthors)
    latestTextRef.current = next
    latestAuthorsRef.current = nextAuthors

    socket.emit('send-changes', { documentId, content: next, runs })

    setSaveStatus('saving')
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = window.setTimeout(() => {
      socket.emit('save-document', { documentId, content: next, runs })
    }, 1000)
  }


  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard unavailable */
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

  /** Text split into contiguous same-author spans, for the coloured layer. */
  const spans = useMemo(() => toSpans(text, authors), [text, authors])

  const colorFor = (id: string) => {
    if (!id) return undefined // unowned text (the seeded starter) keeps the ink colour
    if (id === me.id) return me.color
    return roster[id]?.color
  }

  const words = text.trim() ? text.trim().split(/\s+/).length : 0
  const chars = text.length
  const lines = text ? text.split('\n').length : 1
  const isFresh = !text.trim() || text.trim() === STARTER_TEXT.trim()

  const others = onlineUsers.filter((u) => u.id !== me.id)
  const here = others.length + 1
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })

  return (
    <div className="app" data-surface>
      {/* ---------------- Masthead ---------------- */}
      <header className="mast" data-surface>
        <div className="logo" aria-label="Synsia">
          {/* Narrow screens get the mark rather than a clipped word — "Syn"
              reads as a bug, "§" reads as a decision. */}
          <span className="logo-mark" aria-hidden>
            §
          </span>
          <span className="logo-word" aria-hidden>
            Syn<span>sia</span>
          </span>
        </div>
        <div className="docchip">{documentId}</div>

        <div className="spacer" />

        <div className="faces" title={`${here} here now — ${[me, ...others].map((u) => u.name).join(', ')}`}>
          <span className="face" style={{ background: me.color }} aria-label={`${me.name} (you)`}>
            {me.name[0]}
          </span>
          {others.slice(0, 3).map((u) => (
            <span key={u.id} className="face" style={{ background: u.color }} aria-label={u.name}>
              {u.name[0]}
            </span>
          ))}
          {others.length > 3 ? <span className="face face--more">+{others.length - 3}</span> : null}
        </div>

        <div className={`livechip ${isConnected ? 'livechip--on' : 'livechip--off'}`}>
          <i />
          <span>{isConnected ? 'Live' : 'Offline'}</span>
        </div>

        <button
          className={`iconbtn ${copied ? 'iconbtn--done' : ''}`}
          onClick={copyLink}
          aria-label={copied ? 'Link copied' : 'Copy link'}
          title={copied ? 'Link copied' : 'Copy link'}
        >
          {copied ? Icon.check : Icon.link}
        </button>
        <button className="iconbtn" onClick={downloadMarkdown} aria-label="Download as Markdown" title="Download .md">
          {Icon.down}
        </button>
        <button
          className="iconbtn"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
          title={theme === 'dark' ? 'Light' : 'Dark'}
        >
          {theme === 'dark' ? Icon.sun : Icon.moon}
        </button>

        <div className="seg">
          <button onClick={() => setIsPreview(false)} aria-pressed={!isPreview}>
            Write
          </button>
          <button onClick={() => setIsPreview(true)} aria-pressed={isPreview}>
            Read
          </button>
        </div>
      </header>

      {/* ---------------- Headline band ---------------- */}
      {isFresh ? (
        <div className="band" data-surface>
          <div className="band-inner">
            <div>
              <div className="kicker">A shared notepad · {today}</div>
              <h1 className="headline">A small place to think out loud</h1>
            </div>
            <div className="tallies">
              <div className="tally">
                <i>Words</i>
                <b>{words.toLocaleString()}</b>
              </div>
              <div className="tally">
                <i>Here now</i>
                <b>{here}</b>
              </div>
              <div className="tally">
                <i>State</i>
                <b>{saveStatus === 'error' ? 'Unsaved' : 'Saved'}</b>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="band band--slim" data-surface>
          <div className="band-inner">
            <div className="kicker">
              {here > 1 ? `${here} writing together` : `A shared notepad · ${today}`}
            </div>
          </div>
        </div>
      )}

      {/* ---------------- Workspace ---------------- */}
      <main className="work" ref={workRef}>
        <div className="measure">
          {isPreview ? (
            <article className="reader">
              {text.trim() ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
              ) : (
                <p className="reader-empty">Nothing to read yet.</p>
              )}
            </article>
          ) : (
            /* The textarea keeps the caret, selection and IME behaviour, but
               cannot colour its own text — so its text is transparent and an
               identically-styled layer behind it does the colouring. */
            <div className="editor-stack">
              <pre className="editor-ink" aria-hidden>
                {spans.map((sp, i) => (
                  <span key={i} style={{ color: colorFor(sp.author) }}>
                    {sp.text}
                  </span>
                ))}
                {/* A <pre> drops a trailing blank line where the textarea keeps
                    one, which would drift the two layers apart by a line. */}
                {'\n'}
              </pre>
              <textarea
                className="editor"
                value={text}
                onChange={handleChange}
                placeholder="Begin wherever you like. It saves itself."
                spellCheck={false}
                autoFocus
                aria-label="Document text"
                style={{ caretColor: me.color }}
              />
            </div>
          )}
        </div>

      </main>

      {/* ---------------- Status bar ---------------- */}
      <footer className="status" data-surface>
        <div className="status-cell">
          <span
            className={`save-dot ${
              saveStatus === 'saving' ? 'save-dot--saving' : saveStatus === 'error' ? 'save-dot--error' : ''
            }`}
          />
          {saveStatus === 'saving' ? 'Saving' : saveStatus === 'error' ? 'Not saved' : 'Saved'}
        </div>
        <div className="status-cell status-cell--hide">Markdown</div>
        <div className="status-cell status-cell--hide">UTF-8</div>
        <div className="status-cell">
          {words.toLocaleString()} words · {chars.toLocaleString()} chars · {lines.toLocaleString()} lines
        </div>
        <div className="status-cell status-cell--last">
          made by{' '}
          <a href="https://abhinavshukla.me" target="_blank" rel="noopener noreferrer">
            {CREATOR_NAME}
          </a>
        </div>
      </footer>
    </div>
  )
}

export default App
