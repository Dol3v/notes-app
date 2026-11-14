import { useEffect, useRef, useState } from 'preact/hooks'
import type { Session } from '../session'
import { useAutoLock, useMediaQuery, useSession } from './hooks'
import { IconSidebar } from './icons'
import { NoteList } from './NoteList'
import { NoteView } from './NoteView'
import { Settings } from './Settings'
import { TagTree } from './TagTree'

type Route = { screen: 'list' } | { screen: 'note'; id: string } | { screen: 'settings' }

export function Main({ session }: { session: Session }) {
  useSession(session)
  useAutoLock(session)
  const [route, setRoute] = useState<Route>({ screen: 'list' })
  const [tag, setTag] = useState<string | null>(null)
  const wide = useMediaQuery('(min-width: 820px)')
  const paneOpen = wide && session.prefs.tagPaneOpen
  const togglePane = () => void session.updatePrefs({ tagPaneOpen: !session.prefs.tagPaneOpen })

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

  // Ctrl+Shift+F (⌘⇧F): jump to the note search. Plain Ctrl+F stays the browser's find-in-page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || !e.shiftKey || e.altKey || e.code !== 'KeyF') return
      e.preventDefault()
      if (!matchMedia('(min-width: 820px)').matches && history.state?.screen && history.state.screen !== 'list') back()
      setTimeout(() => {
        const input = document.getElementById('note-search') as HTMLInputElement | null
        input?.focus()
        input?.select()
      }, 0)
    }
    document.addEventListener('keydown', onKey, { capture: true })
    return () => document.removeEventListener('keydown', onKey, { capture: true })
  }, [])

  /** Tag clicked in a note: filter the list; on a phone, also go back to it. */
  const openTag = (t: string) => {
    setTag(t)
    if (!wide) back()
  }

  const note = session.note(openId)
  const detail =
    route.screen === 'note' && note ? (
      <NoteView key={note.id} session={session} note={note} onBack={back} onTag={openTag} />
    ) : route.screen === 'settings' ? (
      <Settings session={session} onBack={back} />
    ) : (
      <div class="placeholder">Select or create a note</div>
    )

  // A note deleted by sync while open → fall back to the list.
  const showDetail = route.screen === 'settings' || (route.screen === 'note' && !!note)

  return (
    <div class={`app ${showDetail ? 'show-detail' : ''}`} style={{ '--note-font-size': `${session.prefs.fontSize}px` }}>
      {paneOpen && (
        <aside class="tag-pane" aria-label="Tags">
          <header class="bar">
            <h2 class="tag-pane-title">Tags</h2>
            <button class="icon-btn" onClick={togglePane} aria-label="Hide tag sidebar" title="Hide tag sidebar">
              <IconSidebar />
            </button>
          </header>
          <nav class="tag-pane-body">
            <TagTree session={session} tag={tag} onTag={setTag} />
          </nav>
        </aside>
      )}
      <aside class="sidebar">
        <NoteList
          session={session}
          activeId={openId}
          onOpen={(id) => navigate({ screen: 'note', id })}
          // with a tag filter on, start the note with that tag so it shows up in the filtered list
          onNew={() => navigate({ screen: 'note', id: session.createNote(tag ? `#${tag}
` : '').id })}
          onSettings={() => navigate({ screen: 'settings' })}
          tag={tag}
          onTag={setTag}
          tagPane={wide ? { open: paneOpen, toggle: togglePane } : undefined}
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
