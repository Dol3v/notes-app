import { useState } from 'preact/hooks'
import { formatDate, matchesQuery, noteSnippet, noteTitle, timeAgo } from '../lib/notes'
import type { Session } from '../session'
import { IconLock, IconPlus, IconSearch, IconSettings, IconSync } from './icons'

interface Props {
  session: Session
  activeId?: string
  onOpen: (id: string) => void
  onNew: () => void
  onSettings: () => void
}

export function NoteList({ session, activeId, onOpen, onNew, onSettings }: Props) {
  const [query, setQuery] = useState('')
  const notes = session.notes.filter((n) => matchesQuery(n, query))

  return (
    <div class="note-list">
      <header class="bar">
        <h1 class="app-title">Notes</h1>
        <SyncBadge session={session} onError={onSettings} />
        <button class="icon-btn" onClick={onSettings} aria-label="Settings" title="Settings">
          <IconSettings />
        </button>
        <button class="icon-btn" onClick={() => session.lock()} aria-label="Lock" title="Lock">
          <IconLock />
        </button>
      </header>

      <label class="search">
        <IconSearch />
        <input
          type="search"
          dir="auto"
          placeholder="Search · חיפוש"
          value={query}
          onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
        />
      </label>

      <ul class="notes">
        {notes.map((n) => (
          <li key={n.id}>
            <button class={`note-item ${n.id === activeId ? 'active' : ''}`} onClick={() => onOpen(n.id)}>
              <div class="note-item-top">
                <span class="note-item-title" dir="auto">
                  {noteTitle(n)}
                </span>
                <span class="note-item-date">{formatDate(n.updated)}</span>
              </div>
              <div class="note-item-snippet" dir="auto">
                {n.conflict && <span class="badge">conflict copy</span>} {noteSnippet(n)}
              </div>
            </button>
          </li>
        ))}
        {notes.length === 0 && <li class="empty">{query ? 'No matching notes' : 'No notes yet — tap + to write one'}</li>}
      </ul>

      {session.vault.undecryptable.length > 0 && (
        <p class="warn small">{session.vault.undecryptable.length} local file(s) could not be decrypted.</p>
      )}

      <button class="fab" onClick={onNew} aria-label="New note" title="New note">
        <IconPlus />
      </button>
    </div>
  )
}

function SyncBadge({ session, onError }: { session: Session; onError: () => void }) {
  const s = session.status
  if (s === 'off') return <span class="sync-badge off" />
  const last = session.vault.settings.lastSync
  const label =
    s === 'syncing'
      ? 'Syncing…'
      : s === 'pending'
        ? 'Unsynced'
        : s === 'error'
          ? 'Sync error'
          : last
            ? `Synced ${timeAgo(last)}`
            : 'Synced'
  return (
    <button
      class={`sync-badge ${s}`}
      title={session.error ?? 'Sync now'}
      onClick={() => (s === 'error' ? onError() : void session.syncNow())}
    >
      <span class={s === 'syncing' ? 'spin' : ''}>
        <IconSync />
      </span>
      <span>{label}</span>
    </button>
  )
}
