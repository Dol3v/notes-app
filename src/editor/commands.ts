import { EditorSelection } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'

/**
 * Wrap/unwrap the selection in a marker like ** or `. With no selection, insert a pair.
 * Returns true so it can be bound directly as a keyboard command.
 */
export function toggleWrap(view: EditorView, marker: string): boolean {
  const { state } = view
  const n = marker.length
  view.dispatch(
    state.changeByRange((range) => {
      const text = state.sliceDoc(range.from, range.to)
      // the selection itself includes the markers ("**bold**" selected) → strip them
      if (text.length >= 2 * n && text.startsWith(marker) && text.endsWith(marker)) {
        return {
          changes: { from: range.from, to: range.to, insert: text.slice(n, -n) },
          range: EditorSelection.range(range.from, range.to - 2 * n),
        }
      }
      // already wrapped, possibly inside other formatting: "**~~_word_~~**" + Ctrl+B → "~~_word_~~"
      const layer = findLayer(state.sliceDoc(Math.max(0, range.from - 16), range.from), state.sliceDoc(range.to, range.to + 16), marker)
      if (layer) {
        return {
          changes: [
            { from: range.from - layer.left - n, to: range.from - layer.left },
            { from: range.to + layer.right, to: range.to + layer.right + n },
          ],
          range: EditorSelection.range(range.from - n, range.to - n),
        }
      }
      return {
        changes: { from: range.from, to: range.to, insert: marker + text + marker },
        range: EditorSelection.range(range.from + marker.length, range.to + marker.length),
      }
    }),
  )
  view.focus()
  return true
}

const MARKERS = ['**', '~~', '_', '*', '`']

/** Split a run of formatting markers into layers, innermost first. */
function layers(run: string, fromEnd: boolean): string[] {
  const out: string[] = []
  while (run) {
    const m = MARKERS.find((k) => (fromEnd ? run.endsWith(k) : run.startsWith(k)))
    if (!m) break
    out.push(m)
    run = fromEnd ? run.slice(0, -m.length) : run.slice(m.length)
  }
  return out
}

/** Where `marker` wraps the selection at the same nesting depth on both sides (offsets = chars of inner layers). */
function findLayer(before: string, after: string, marker: string): { left: number; right: number } | null {
  const l = layers(/[*_~`]*$/.exec(before)![0], true)
  const r = layers(/^[*_~`]*/.exec(after)![0], false)
  let left = 0
  let right = 0
  for (let i = 0; i < Math.min(l.length, r.length); i++) {
    if (l[i] === marker && r[i] === marker) return { left, right }
    left += l[i].length
    right += r[i].length
  }
  return null
}

export const BOLD = '**'
export const ITALIC = '_'
export const STRIKE = '~~'

const PREFIX_RE = /^(\s*)(#{1,6}\s+|>\s?|[-*+]\s+\[[ xX]\]\s+|[-*+]\s+|\d+[.)]\s+)?/

/** Set (or remove, if already set) a block prefix on every selected line. */
export function toggleLinePrefix(view: EditorView, prefix: string) {
  const { state } = view
  const lines = new Set<number>()
  for (const r of state.selection.ranges) {
    for (let n = state.doc.lineAt(r.from).number; n <= state.doc.lineAt(r.to).number; n++) lines.add(n)
  }
  const changes = [...lines].map((n) => {
    const line = state.doc.line(n)
    const m = PREFIX_RE.exec(line.text)!
    const indent = m[1]
    const current = m[2] ?? ''
    const same = current.trim() === prefix.trim()
    return { from: line.from + indent.length, to: line.from + indent.length + current.length, insert: same ? '' : prefix }
  })
  view.dispatch({ changes })
  view.focus()
}

/** Cycle # → ## → ### → none */
export function cycleHeading(view: EditorView) {
  const { state } = view
  const line = state.doc.lineAt(state.selection.main.head)
  const m = /^(#{1,6})\s+/.exec(line.text)
  const level = m ? m[1].length : 0
  const next = level >= 3 ? '' : '#'.repeat(level + 1) + ' '
  view.dispatch({ changes: { from: line.from, to: line.from + (m ? m[0].length : 0), insert: next } })
  view.focus()
}

export function insertLink(view: EditorView) {
  const { state } = view
  const r = state.selection.main
  const text = state.sliceDoc(r.from, r.to)
  const insert = `[${text}](https://)`
  const cursor = r.from + text.length + 3 + 'https://'.length
  view.dispatch({ changes: { from: r.from, to: r.to, insert }, selection: { anchor: cursor } })
  view.focus()
}
