import { useEffect, useState } from 'preact/hooks'
import type { Session } from '../session'

/** Re-render whenever the session changes. */
export function useSession(session: Session) {
  const [, setTick] = useState(0)
  useEffect(() => session.subscribe(() => setTick((n) => n + 1)), [session])
}

/**
 * Lock after inactivity, and after the app has been in the background for too long.
 * Timers are throttled/frozen in background tabs, so elapsed time is also checked on return.
 */
export function useAutoLock(session: Session) {
  useEffect(() => {
    let idleTimer: ReturnType<typeof setTimeout> | undefined
    let bgTimer: ReturnType<typeof setTimeout> | undefined
    let hiddenAt: number | null = null
    let lastActivity = Date.now()
    const idleMs = () => session.prefs.autoLockMinutes * 60_000

    const resetIdle = () => {
      lastActivity = Date.now()
      clearTimeout(idleTimer)
      idleTimer = setTimeout(() => void session.lock(), idleMs())
    }
    const onVisibility = () => {
      const bg = session.backgroundLockSeconds
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now()
        void session.syncNow().catch(() => {})
        void session.flush()
        clearTimeout(bgTimer)
        if (bg >= 0) bgTimer = setTimeout(() => void session.lock(), bg * 1000)
      } else {
        clearTimeout(bgTimer)
        const now = Date.now()
        // Timers are throttled in background tabs, so check the clock on return as well.
        // Time away counts as inactivity: back after an hour → locked, even if "background lock" is off.
        if ((hiddenAt !== null && bg >= 0 && now - hiddenAt >= bg * 1000) || now - lastActivity >= idleMs()) {
          void session.lock()
        } else {
          resetIdle()
          session.scheduleSync(500) // pull anything written on the other device meanwhile
        }
        hiddenAt = null
      }
    }
    const onOnline = () => session.scheduleSync(500)
    const activity = ['pointerdown', 'keydown', 'beforeinput', 'wheel']
    activity.forEach((e) => document.addEventListener(e, resetIdle, { capture: true, passive: true }))
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', () => void session.flush())
    window.addEventListener('online', onOnline)
    resetIdle()
    return () => {
      clearTimeout(idleTimer)
      clearTimeout(bgTimer)
      activity.forEach((e) => document.removeEventListener(e, resetIdle, { capture: true }))
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('online', onOnline)
    }
  }, [session])
}
