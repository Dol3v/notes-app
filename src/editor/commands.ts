import { EditorSelection } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'

/** Wrap/unwrap the selection in a marker like ** or `. With no selection, insert a pair. */
export function toggleWrap(view: EditorView, marker: string) {
  const { state } = view
  view.dispatch(
    state.changeByRange((range) => {
      const text = state.sliceDoc(range.from, range.to)
      const before = state.sliceDoc(range.from - marker.length, range.from)
      const after = state.sliceDoc(range.to, range.to + marker.length)
      if (before === marker && after === marker) {
        return {
          changes: [
            { from: range.from - marker.length, to: range.from },
            { from: range.to, to: range.to + marker.length },
          ],
          range: EditorSelection.range(range.from - marker.length, range.to - marker.length),
        }
      }
      return {
        changes: { from: range.from, to: range.to, insert: marker + text + marker },
        range: EditorSelection.range(range.from + marker.length, range.to + marker.length),
      }
    }),
  )
  view.focus()
}

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
