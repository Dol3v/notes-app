import { startCompletion } from '@codemirror/autocomplete'
import { indentLess, indentMore, redo, undo } from '@codemirror/commands'
import type { EditorView } from '@codemirror/view'
import { useRef, useState } from 'preact/hooks'
import { BOLD, ITALIC, STRIKE, cycleHeading, insertLink, toggleLinePrefix, toggleWrap } from '../editor/commands'
import { detectDir } from '../lib/direction'
import { backlinks, resolveLink } from '../lib/links'
import { toggleTaskLine } from '../lib/markdown'
import { formatDate, noteTitle } from '../lib/notes'
import { allTags } from '../lib/tags'
import type { Note } from '../lib/vault'
import type { Session } from '../session'
import { Editor } from './Editor'
import { IconBack, IconEdit, IconEye, IconPin, IconTrash } from './icons'
import { Preview } from './Preview'

interface Props {
  session: Session
  note: Note
  onBack: () => void
  onTag: (tag: string) => void
  onLink: (target: string) => void
}

const MOD = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl'

export function NoteView({ session, note, onBack, onTag, onLink }: Props) {
  const prefs = session.prefs
  // empty, untouched, or just a "# Title" (e.g. created from a [[link]]) → start in the editor
  const isNew = note.body.trim() === '' || session.isFresh(note.id) || /^#{1,6} [^\n]*$/.test(note.body.trim())
  const [mode, setMode] = useState<'edit' | 'preview'>(isNew ? 'edit' : session.openMode)
  const [focusOnEdit, setFocusOnEdit] = useState(isNew)
  const viewRef = useRef<EditorView | null>(null)

  const toEdit = () => {
    setFocusOnEdit(true)
    setMode('edit')
  }

  const onDelete = async () => {
    if (!confirm(`Delete “${noteTitle(note)}”?`)) return
    await session.deleteNote(note.id)
    onBack()
  }

  return (
    <div class="note-view">
      <header class="bar">
        <button class="icon-btn back" onClick={onBack} aria-label="Back">
          <IconBack />
        </button>
        <div class="bar-title" dir={detectDir(noteTitle(note)) ?? 'rtl'}>
          <span class="title-text">
            {noteTitle(note)}
          </span>
          <span class="subtle">
            {note.conflict && <span class="badge">conflict copy</span>} {formatDate(note.updated)}
          </span>
        </div>
        <button
          class={`icon-btn pin-btn ${note.pinned ? 'on' : ''}`}
          onClick={() => session.togglePin(note.id)}
          aria-label={note.pinned ? 'Unpin' : 'Pin to top'}
          aria-pressed={!!note.pinned}
          title={note.pinned ? 'Unpin' : 'Pin to top'}
        >
          <IconPin filled={!!note.pinned} />
        </button>
        <button
          class="icon-btn"
          onClick={() => (mode === 'edit' ? setMode('preview') : toEdit())}
          aria-label={mode === 'edit' ? 'Preview' : 'Edit'}
          title={mode === 'edit' ? 'Preview' : 'Edit'}
        >
          {mode === 'edit' ? <IconEye /> : <IconEdit />}
        </button>
        <button class="icon-btn" onClick={onDelete} aria-label="Delete" title="Delete">
          <IconTrash />
        </button>
      </header>

      <div class="note-body">
        {mode === 'edit' ? (
          <Editor
            value={note.body}
            revision={note}
            direction={prefs.direction}
            autoFocus={focusOnEdit}
            onChange={(body) => session.updateBody(note.id, body)}
            getTags={() => allTags(session.vault.notes.values())}
            getTitles={() => session.notes.filter((n) => n.id !== note.id).map(noteTitle)}
            onFollow={(t) => (t.kind === 'link' ? onLink(t.target) : onTag(t.tag))}
            viewRef={viewRef}
          />
        ) : (
          <Preview
            body={note.body}
            direction={prefs.direction}
            onToggleTask={(line) => session.updateBody(note.id, toggleTaskLine(note.body, line))}
            onEmptyClick={toEdit}
            onTag={onTag}
            linkExists={(t) => !!resolveLink(t, session.notes)}
            onLink={onLink}
          >
            <Backlinks session={session} note={note} onOpen={onLink} />
          </Preview>
        )}
      </div>

      {mode === 'edit' && <Toolbar viewRef={viewRef} />}
    </div>
  )
}

/** Insert "[[" and open the note-title suggestions. */
function linkToNote(v: EditorView) {
  const pos = v.state.selection.main.head
  v.dispatch({ changes: { from: pos, insert: '[[' }, selection: { anchor: pos + 2 } })
  startCompletion(v)
}

function Backlinks({ session, note, onOpen }: { session: Session; note: Note; onOpen: (title: string) => void }) {
  const from = backlinks(note, session.notes)
  if (!from.length) return null
  return (
    <aside class="backlinks">
      <h3>Linked from</h3>
      <ul>
        {from.map((n) => (
          <li key={n.id}>
            <button class="link-btn" dir="auto" onClick={() => onOpen(noteTitle(n))}>
              {noteTitle(n)}
            </button>
          </li>
        ))}
      </ul>
    </aside>
  )
}

function Toolbar({ viewRef }: { viewRef: { current: EditorView | null } }) {
  const run = (fn: (v: EditorView) => unknown) => (e: Event) => {
    e.preventDefault() // keep the editor focused so the phone keyboard stays open
    const v = viewRef.current
    if (v) {
      fn(v)
      v.focus()
    }
  }
  const btn = (label: string, title: string, fn: (v: EditorView) => unknown, cls = '') => (
    <button class={`tb ${cls}`} title={title} aria-label={title} onPointerDown={run(fn)} onClick={(e) => e.preventDefault()}>
      {label}
    </button>
  )
  return (
    <div class="toolbar" role="toolbar">
      {btn('H', 'Heading', cycleHeading, 'tb-bold')}
      {btn('B', `Bold (${MOD}+B)`, (v) => toggleWrap(v, BOLD), 'tb-bold')}
      {btn('I', `Italic (${MOD}+I)`, (v) => toggleWrap(v, ITALIC), 'tb-italic')}
      {btn('S', `Strikethrough (${MOD}+Shift+X)`, (v) => toggleWrap(v, STRIKE), 'tb-strike')}
      {btn('☐', 'Checklist', (v) => toggleLinePrefix(v, '- [ ] '))}
      {btn('•', 'Bullet list', (v) => toggleLinePrefix(v, '- '))}
      {btn('1.', 'Numbered list', (v) => toggleLinePrefix(v, '1. '))}
      {btn('❝', 'Quote', (v) => toggleLinePrefix(v, '> '))}
      {btn('</>', 'Code', (v) => toggleWrap(v, '`'))}
      {btn('[[', 'Link to a note', linkToNote)}
      {btn('🔗', `Web link (${MOD}+K)`, insertLink)}
      {btn('⇤', 'Outdent', indentLess)}
      {btn('⇥', 'Indent', indentMore)}
      {btn('↶', 'Undo', undo)}
      {btn('↷', 'Redo', redo)}
    </div>
  )
}
