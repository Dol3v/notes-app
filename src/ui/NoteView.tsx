import { indentLess, indentMore, redo, undo } from '@codemirror/commands'
import type { EditorView } from '@codemirror/view'
import { useRef, useState } from 'preact/hooks'
import { cycleHeading, insertLink, toggleLinePrefix, toggleWrap } from '../editor/commands'
import { detectDir } from '../lib/direction'
import { toggleTaskLine } from '../lib/markdown'
import { formatDate, noteTitle } from '../lib/notes'
import type { Note } from '../lib/vault'
import type { Session } from '../session'
import { Editor } from './Editor'
import { IconBack, IconEdit, IconEye, IconTrash } from './icons'
import { Preview } from './Preview'

interface Props {
  session: Session
  note: Note
  onBack: () => void
}

export function NoteView({ session, note, onBack }: Props) {
  const prefs = session.prefs
  const [mode, setMode] = useState<'edit' | 'preview'>(note.body.trim() === '' ? 'edit' : prefs.openMode)
  const [focusOnEdit, setFocusOnEdit] = useState(note.body.trim() === '')
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
            viewRef={viewRef}
          />
        ) : (
          <Preview
            body={note.body}
            direction={prefs.direction}
            onToggleTask={(line) => session.updateBody(note.id, toggleTaskLine(note.body, line))}
            onEmptyClick={toEdit}
          />
        )}
      </div>

      {mode === 'edit' && <Toolbar viewRef={viewRef} />}
    </div>
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
      {btn('B', 'Bold', (v) => toggleWrap(v, '**'), 'tb-bold')}
      {btn('I', 'Italic', (v) => toggleWrap(v, '_'), 'tb-italic')}
      {btn('☐', 'Checklist', (v) => toggleLinePrefix(v, '- [ ] '))}
      {btn('•', 'Bullet list', (v) => toggleLinePrefix(v, '- '))}
      {btn('1.', 'Numbered list', (v) => toggleLinePrefix(v, '1. '))}
      {btn('❝', 'Quote', (v) => toggleLinePrefix(v, '> '))}
      {btn('</>', 'Code', (v) => toggleWrap(v, '`'))}
      {btn('🔗', 'Link', insertLink)}
      {btn('⇤', 'Outdent', indentLess)}
      {btn('⇥', 'Indent', indentMore)}
      {btn('↶', 'Undo', undo)}
      {btn('↷', 'Redo', redo)}
    </div>
  )
}
