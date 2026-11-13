import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { Compartment, type Extension } from '@codemirror/state'
import { EditorView, keymap, placeholder } from '@codemirror/view'
import { tags as t } from '@lezer/highlight'
import type { Direction } from '../lib/vault'
import { directionExtension } from './direction'

const highlight = HighlightStyle.define([
  { tag: t.heading1, fontSize: '1.45em', fontWeight: '700' },
  { tag: t.heading2, fontSize: '1.3em', fontWeight: '700' },
  { tag: t.heading3, fontSize: '1.15em', fontWeight: '700' },
  { tag: [t.heading4, t.heading5, t.heading6], fontWeight: '700' },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: t.link, color: 'var(--accent)' },
  { tag: t.url, color: 'var(--muted)' },
  { tag: t.monospace, fontFamily: 'var(--mono)', background: 'var(--code-bg)', borderRadius: '4px' },
  { tag: t.quote, color: 'var(--muted)', fontStyle: 'italic' },
  { tag: [t.processingInstruction, t.meta, t.contentSeparator], color: 'var(--marker)' },
])

const theme = EditorView.theme({
  '&': { height: '100%', fontSize: 'var(--note-font-size)', background: 'transparent' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'var(--font)', lineHeight: '1.65', overflow: 'auto' },
  '.cm-content': { padding: '16px 0 40vh', caretColor: 'var(--accent)' },
  '.cm-line': { padding: '0 18px' },
  '.cm-placeholder': { color: 'var(--muted)' },
  '.cm-cursor': { borderLeftColor: 'var(--accent)', borderLeftWidth: '2px' },
})

export const directionCompartment = new Compartment()

export function editorExtensions(direction: Direction, onChange: (doc: string) => void): Extension[] {
  return [
    history(),
    markdown({ base: markdownLanguage }), // includes Enter-continues-list / smart Backspace keymap
    keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
    syntaxHighlighting(highlight),
    EditorView.lineWrapping,
    theme,
    placeholder('Start writing…  ·  התחל לכתוב…'),
    EditorView.contentAttributes.of({ spellcheck: 'true', autocorrect: 'on', autocapitalize: 'sentences' }),
    directionCompartment.of(directionExtension(direction)),
    EditorView.updateListener.of((u) => {
      if (u.docChanged) onChange(u.state.doc.toString())
    }),
  ]
}
