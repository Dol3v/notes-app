import { useState } from 'preact/hooks'
import { Session } from '../session'
import { LockScreen } from './LockScreen'
import { Main } from './Main'

export function App() {
  const [session, setSession] = useState<Session | null>(null)
  return session ? <Main session={session} /> : <LockScreen onUnlocked={(v) => setSession(new Session(v))} />
}
