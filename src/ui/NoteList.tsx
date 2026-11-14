import { useState } from 'preact/hooks'
import { formatDate, matchesQuery, noteSnippet, noteTitle, timeAgo } from '../lib/notes'
import { type TagNode, buildTagTree, hasTag } from '../lib/tags'
import type { Session } from '../session'
import { IconLock, IconPlus, IconSearch, IconSettings, IconSync } from './icons'

interface Props {
  session: Session
  activeId?: string
  onOpen: (id: string) => void
  onNew: () => void
  onSettings: () => void
  tag: string | null
  onTag: (tag: string | null) => void
}

export function NoteList({ session, activeId, onOpen, onNew, onSettings, tag, onTag }: Props) {
  const [query, setQuery] = useState('')
  const [tagsOpen, setTagsOpen] = useState(false)
  const all = session.notes
  const notes = all.filter((n) => matchesQuery(n, query) && (!tag || hasTag(n, tag)))
  const tree = tagsOpen ? buildTagTree(all) : []

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
            type="search"
            dir="auto"
            placeholder="Search · חיפוש"
            value={query}
            onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
          />
        </label>
        <button
          class={`icon-btn tags-toggle ${tagsOpen ? 'on' : ''}`}
          onClick={() => setTagsOpen(!tagsOpen)}
          aria-label="Tags"
          aria-expanded={tagsOpen}
          title="Tags"
        >
          #
        </button>
      </div>

      {tagsOpen && (
        <nav class="tag-tree" aria-label="Tags">
          {tree.length === 0 ? (
            <p class="subtle small">
              No tags yet. Write <code>#tag</code> or <code>#parent/child</code> anywhere in a note.
            </p>
          ) : (
            <ul>
              <li>
                <button class={`tag-row ${tag === null ? 'active' : ''}`} onClick={() => onTag(null)}>
                  <span class="tag-twisty" />
                  <span class="tag-name">All notes</span>
                  <span class="tag-count">{all.length}</span>
                </button>
              </li>
              {tree.map((n) => (
                <TagRow key={n.path} node={n} depth={0} active={tag} onTag={onTag} />
              ))}
            </ul>
          )}
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

function TagRow({ node, depth, active, onTag }: { node: TagNode; depth: number; active: string | null; onTag: (t: string) => void }) {
  const a = active?.toLowerCase()
  const p = node.path.toLowerCase()
  // open the branch that leads to the active tag
  const [open, setOpen] = useState(!!a && a.startsWith(`${p}/`))
  const hasKids = node.children.length > 0
  return (
    <li>
      <button class={`tag-row ${a === p ? 'active' : ''}`} style={{ paddingInlineStart: `${8 + depth * 16}px` }} onClick={() => onTag(node.path)}>
        <span
          class={`tag-twisty ${hasKids ? (open ? 'open' : 'closed') : ''}`}
          onClick={(e) => {
            if (!hasKids) return
            e.stopPropagation()
            setOpen(!open)
          }}
          aria-hidden="true"
        />
        <span class="tag-name" dir="auto">
          {node.name}
        </span>
        <span class="tag-count">{node.count}</span>
      </button>
      {hasKids && open && (
        <ul>
          {node.children.map((c) => (
            <TagRow key={c.path} node={c} depth={depth + 1} active={active} onTag={onTag} />
          ))}
        </ul>
      )}
    </li>
  )
}
