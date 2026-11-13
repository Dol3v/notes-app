import { useEffect, useRef, useState } from 'preact/hooks'
import type { Session } from '../session'
import { useAutoLock, useSession } from './hooks'
import { NoteList } from './NoteList'
import { NoteView } from './NoteView'
import { Settings } from './Settings'

type Route = { screen: 'list' } | { screen: 'note'; id: string } | { screen: 'settings' }

export function Main({ session }: { session: Session }) {
  useSession(session)
  useAutoLock(session)
  const [route, setRoute] = useState<Route>({ screen: 'list' })

  // Hook into browser history so Android's back button/gesture returns to the list.
  useEffect(() => {
    history.replaceState({ screen: 'list' }, '')
    const onPop = (e: PopStateEvent) => setRoute((e.state as Route) ?? { screen: 'list' })
    window.addEventListener('popstate', onPop)
    void session.syncNow()
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const navigate = (r: Route) => {
    if (route.screen === 'list') history.pushState(r, '')
    else history.replaceState(r, '')
    setRoute(r)
  }
  const back = () => {
    if (history.state?.screen && history.state.screen !== 'list') history.back()
    else setRoute({ screen: 'list' })
  }

  // Leaving a note: throw it away if it's blank.
  const openId = route.screen === 'note' ? route.id : undefined
  const prevOpen = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (prevOpen.current && prevOpen.current !== openId) void session.discardIfEmpty(prevOpen.current)
    prevOpen.current = openId
  }, [openId])

  const note = session.note(openId)
  const detail =
    route.screen === 'note' && note ? (
      <NoteView key={note.id} session={session} note={note} onBack={back} />
    ) : route.screen === 'settings' ? (
      <Settings session={session} onBack={back} />
    ) : (
      <div class="placeholder">Select or create a note</div>
    )

  // A note deleted by sync while open → fall back to the list.
  const showDetail = route.screen === 'settings' || (route.screen === 'note' && !!note)

  return (
    <div class={`app ${showDetail ? 'show-detail' : ''}`} style={{ '--note-font-size': `${session.prefs.fontSize}px` }}>
      <aside class="sidebar">
        <NoteList
          session={session}
          activeId={openId}
          onOpen={(id) => navigate({ screen: 'note', id })}
          onNew={() => navigate({ screen: 'note', id: session.createNote().id })}
          onSettings={() => navigate({ screen: 'settings' })}
        />
      </aside>
      <main class="detail">{detail}</main>
      {session.toast && (
        <div class="toast" role="status" onClick={() => (session.toast = undefined)}>
          {session.toast}
        </div>
      )}
    </div>
  )
}
