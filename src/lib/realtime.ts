/**
 * A very small realtime client over a native WebSocket, shaped like the
 * socket.io client it replaces — `.on`, `.off`, `.emit`, `.connected` — so the
 * app code that used Socket.IO keeps working unchanged.
 *
 * Cloudflare Workers speak plain WebSockets, not the Socket.IO protocol, so
 * the transport had to change; the surface did not have to.
 */

type Handler = (payload: any) => void

const RECONNECT_BASE_MS = 600
const RECONNECT_MAX_MS = 10_000
/** The Durable Object auto-responds to this without waking, keeping idle
 *  connections alive through proxies for free. */
const PING_MS = 25_000

export type Realtime = {
  readonly connected: boolean
  on(event: string, handler: Handler): void
  off(event: string, handler: Handler): void
  emit(event: string, data?: unknown): void
  close(): void
}

export function createRealtime(url: string): Realtime {
  const handlers = new Map<string, Set<Handler>>()
  /** Emits made before the socket opened, replayed on connect. */
  let queue: string[] = []
  let ws: WebSocket | null = null
  let attempt = 0
  let closedByUs = false
  let reconnectTimer: number | undefined
  let pingTimer: number | undefined

  const fire = (event: string, payload?: unknown) => {
    const set = handlers.get(event)
    if (!set) return
    for (const h of [...set]) {
      try {
        h(payload)
      } catch (err) {
        console.error(`realtime handler for "${event}" threw`, err)
      }
    }
  }

  const open = () => {
    if (closedByUs) return
    ws = new WebSocket(url)

    ws.onopen = () => {
      attempt = 0
      for (const msg of queue) ws?.send(msg)
      queue = []
      pingTimer = window.setInterval(() => {
        if (ws?.readyState === WebSocket.OPEN) ws.send('ping')
      }, PING_MS)
      fire('connect')
    }

    ws.onmessage = (e) => {
      if (typeof e.data !== 'string') return
      // The keepalive auto-response is a bare string, not a frame.
      if (e.data === 'pong') return
      let msg: { event?: string; data?: unknown }
      try {
        msg = JSON.parse(e.data)
      } catch {
        return
      }
      if (msg.event) fire(msg.event, msg.data)
    }

    const down = () => {
      window.clearInterval(pingTimer)
      ws = null
      fire('disconnect')
      if (closedByUs) return
      // Exponential backoff, jittered so a mass reconnect does not thunder.
      const delay = Math.min(RECONNECT_BASE_MS * 2 ** attempt, RECONNECT_MAX_MS)
      attempt += 1
      reconnectTimer = window.setTimeout(open, delay + Math.random() * 250)
    }

    ws.onclose = down
    ws.onerror = () => ws?.close()
  }

  open()

  return {
    get connected() {
      return ws?.readyState === WebSocket.OPEN
    },
    on(event, handler) {
      if (!handlers.has(event)) handlers.set(event, new Set())
      handlers.get(event)!.add(handler)
      // The socket opens at module load, but React subscribes from an effect
      // after mount — so a late 'connect' listener would otherwise never hear
      // about a connection that is already up.
      if (event === 'connect' && ws?.readyState === WebSocket.OPEN) {
        queueMicrotask(() => {
          if (handlers.get('connect')?.has(handler)) handler(undefined)
        })
      }
    },
    off(event, handler) {
      handlers.get(event)?.delete(handler)
    },
    emit(event, data) {
      const payload = JSON.stringify({ event, data })
      if (ws?.readyState === WebSocket.OPEN) ws.send(payload)
      else queue.push(payload)
    },
    close() {
      closedByUs = true
      window.clearTimeout(reconnectTimer)
      window.clearInterval(pingTimer)
      ws?.close()
    },
  }
}

/** The document id is the URL path; a fresh visit mints one. */
export function resolveDocumentId(): string {
  const path = window.location.pathname.replace(/^\/+/, '').trim()
  if (path) return path
  const id = `note-${Date.now().toString(36)}`
  window.history.replaceState(null, '', `/${id}`)
  return id
}

/** Base URL of the Worker, ws:// in dev and wss:// in production. */
export function realtimeUrl(documentId: string): string {
  const base =
    (import.meta.env.VITE_REALTIME_URL as string | undefined)?.replace(/\/+$/, '') ??
    'ws://127.0.0.1:8787'
  return `${base}/doc/${encodeURIComponent(documentId)}`
}
