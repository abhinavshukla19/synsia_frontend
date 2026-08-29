import { useCallback, useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'

const KEY = 'synsia-theme'

function initial(): Theme {
  try {
    const stored = localStorage.getItem(KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    /* private mode */
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/** One source of truth: a data-theme attribute on <html>. */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(initial)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try {
      localStorage.setItem(KEY, theme)
    } catch {
      /* private mode */
    }
  }, [theme])

  // Follow the system only while the writer hasn't expressed a preference.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e: MediaQueryListEvent) => {
      try {
        if (localStorage.getItem(KEY)) return
      } catch {
        /* ignore */
      }
      setTheme(e.matches ? 'dark' : 'light')
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const toggle = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), [])

  return { theme, toggle } as const
}
