import { useState } from 'preact/hooks'
import { formatDate, noteSnippet, noteTitle, timeAgo } from '../lib/notes'
import { hasTag, matchesSearch, noteTags } from '../lib/tags'
import type { Session } from '../session'
import { IconLock, IconPin, IconPlus, IconSearch, IconSettings, IconSync } from './icons'
import { TagTree } from './TagTree'

interface Props {
  session: Session
  activeId?: string
  onOpen: (id: string) => void
  onNew: () => void
  onSettings: () => void
  tag: string | null
  onTag: (tag: string | null) => void
  /** desktop: the tag tree lives in its own sidebar — the # button toggles that instead */
  tagPane?: { open: boolean; toggle: () => void }
}

export function NoteList({ session, activeId, onOpen, onNew, onSettings, tag, onTag, tagPane }: Props) {
  const [query, setQuery] = useState('')
  const [inlineOpen, setInlineOpen] = useState(false)
  const tagsOpen = tagPane ? tagPane.open : inlineOpen
  const toggleTags = tagPane ? tagPane.toggle : () => setInlineOpen(!inlineOpen)
  const notes = session.notes.filter((n) => matchesSearch(n, query) && (!tag || hasTag(n, tag)))
  const pinnedCount = notes.filter((n) => n.pinned).length
  const sections = pinnedCount > 0 && pinnedCount < notes.length

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

      <div class="search-row">
        <label class="search">
          <IconSearch />
          <input
            id="note-search"
            type="search"
            dir="auto"
            placeholder="Search · חיפוש · #tag"
            title="Search notes (Ctrl+Shift+F). Use #tag to filter by tag."
            value={query}
            onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setQuery('')
                ;(e.target as HTMLInputElement).blur()
              }
            }}
          />
        </label>
        <button
          class={`icon-btn tags-toggle ${tagsOpen ? 'on' : ''}`}
          onClick={toggleTags}
          aria-label={tagPane ? (tagsOpen ? 'Hide tag sidebar' : 'Show tag sidebar') : 'Tags'}
          aria-expanded={tagsOpen}
          title={tagPane ? (tagsOpen ? 'Hide tag sidebar' : 'Show tag sidebar') : 'Tags'}
        >
          #
        </button>
      </div>

      {!tagPane && inlineOpen && (
        <nav class="tag-tree" aria-label="Tags">
          <TagTree session={session} tag={tag} onTag={onTag} />
        </nav>
      )}

      {tag && (
        <div class="tag-filter">
          <button class="tag-chip" onClick={() => onTag(null)} title="Clear tag filter" dir="auto">
            #{tag} <span aria-hidden="true">✕</span>
          </button>
        </div>
      )}

      <ul class="notes">
        {notes.map((n, i) => (
          <li key={n.id}>
            {sections && i === 0 && <div class="list-section">Pinned</div>}
            {sections && i === pinnedCount && <div class="list-section">Notes</div>}
            <button class={`note-item ${n.id === activeId ? 'active' : ''}`} onClick={() => onOpen(n.id)}>
              <div class="note-item-top">
                {n.pinned && (
                  <span class="pin-mark" title="Pinned">
                    <IconPin filled size={14} />
                  </span>
                )}
                <span class="note-item-title" dir="auto">
                  {noteTitle(n)}
                </span>
                <span class="note-item-date">{formatDate(n.updated)}</span>
              </div>
              <div class="note-item-snippet" dir="auto">
                {n.conflict && <span class="badge">conflict copy</span>} {noteSnippet(n)}
              </div>
              <NoteTags tags={noteTags(n)} />
            </button>
          </li>
        ))}
        {notes.length === 0 && <li class="empty">{query || tag ? 'No matching notes' : 'No notes yet — tap + to write one'}</li>}
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

const MAX_CHIPS = 3

function NoteTags({ tags }: { tags: string[] }) {
  if (!tags.length) return null
  return (
    <div class="note-item-tags">
      {tags.slice(0, MAX_CHIPS).map((t) => (
        <span class="tag-mini" dir="auto" key={t}>
          #{t}
        </span>
      ))}
      {tags.length > MAX_CHIPS && <span class="tag-mini more">+{tags.length - MAX_CHIPS}</span>}
    </div>
  )
}
