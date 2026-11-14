import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { Compartment, type Extension, Prec } from '@codemirror/state'
import { EditorView, keymap, placeholder } from '@codemirror/view'
import { tags as t } from '@lezer/highlight'
import type { Direction } from '../lib/vault'
import { BOLD, ITALIC, STRIKE, insertLink, toggleWrap } from './commands'
import { directionExtension } from './direction'
import { tagCompletion, tagHighlight } from './tags'

/**
 * Formatting shortcuts. High precedence: the default keymap binds Mod-i to "select parent syntax".
 * Bindings are by key position as well, so they also work with the Hebrew keyboard layout.
 */
export const formattingKeymap = Prec.high(
  keymap.of([
    { key: 'Mod-b', run: (v) => toggleWrap(v, BOLD) },
    { key: 'Mod-i', run: (v) => toggleWrap(v, ITALIC) },
    { key: 'Mod-Shift-x', run: (v) => toggleWrap(v, STRIKE) },
    { key: 'Mod-k', run: (v) => (insertLink(v), true) },
  ]),
)

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
  '.cm-tooltip': { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' },
  '.cm-tooltip.cm-tooltip-autocomplete > ul': { fontFamily: 'var(--font)', maxHeight: '14em' },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li': { padding: '4px 10px', color: 'var(--accent)' },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]': { background: 'var(--active)', color: 'var(--accent)' },
  '.cm-completionDetail': { color: 'var(--muted)', fontStyle: 'normal', marginInlineStart: '0.8em' },
  '.cm-completionMatchedText': { textDecoration: 'none', fontWeight: '700' },
  '.cm-tag': { color: 'var(--accent)', background: 'var(--tag-bg)', borderRadius: '4px' },
  '.cm-cursor': { borderLeftColor: 'var(--accent)', borderLeftWidth: '2px' },
})

export const directionCompartment = new Compartment()

export function editorExtensions(
  direction: Direction,
  onChange: (doc: string) => void,
  getTags: () => { name: string; count: number }[],
): Extension[] {
  return [
    history(),
    markdown({ base: markdownLanguage }), // includes Enter-continues-list / smart Backspace keymap
    formattingKeymap,
    keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
    syntaxHighlighting(highlight),
    tagHighlight,
    tagCompletion(getTags),
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
