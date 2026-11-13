/**
 * Per-line text direction for CodeMirror.
 *
 * Each line gets an explicit dir="rtl"/"ltr" from its first letter, so Hebrew paragraphs sit on
 * the right and English/code lines on the left inside the same note. Lines with no letters
 * (empty lines, "---", "- ") inherit the direction of the nearest line above, so a fresh empty
 * line under Hebrew text keeps the cursor on the right.
 */
import { Facet, RangeSetBuilder, type Text } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view'
import { type Dir, detectLineDir } from '../lib/direction'
import type { Direction } from '../lib/vault'

export const directionMode = Facet.define<Direction, Direction>({ combine: (v) => v[0] ?? 'auto' })

const lineDeco: Record<Dir, Decoration> = {
  rtl: Decoration.line({ attributes: { dir: 'rtl' } }),
  ltr: Decoration.line({ attributes: { dir: 'ltr' } }),
}

const FALLBACK: Dir = 'rtl'

function inherited(doc: Text, lineNo: number): Dir | null {
  for (let n = lineNo - 1, steps = 0; n >= 1 && steps < 200; n--, steps++) {
    const d = detectLineDir(doc.line(n).text)
    if (d) return d
  }
  return null
}

function build(view: EditorView): DecorationSet {
  const mode = view.state.facet(directionMode)
  const doc = view.state.doc
  const builder = new RangeSetBuilder<Decoration>()
  let lastLine = 0
  for (const { from, to } of view.visibleRanges) {
    let line = doc.lineAt(from)
    let prev = mode === 'auto' ? inherited(doc, line.number) : null
    for (;;) {
      if (line.number > lastLine) {
        let d: Dir
        if (mode === 'auto') {
          d = detectLineDir(line.text) ?? prev ?? FALLBACK
          prev = d
        } else d = mode
        builder.add(line.from, line.from, lineDeco[d])
        lastLine = line.number
      }
      if (line.to >= to || line.number >= doc.lines) break
      line = doc.line(line.number + 1)
    }
  }
  return builder.finish()
}

const plugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = build(view)
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged || u.startState.facet(directionMode) !== u.state.facet(directionMode)) {
        this.decorations = build(u.view)
      }
    }
  },
  { decorations: (v) => v.decorations },
)

export function directionExtension(mode: Direction) {
  return [
    directionMode.of(mode),
    plugin,
    EditorView.perLineTextDirection.of(true),
    EditorView.contentAttributes.of({ dir: mode === 'ltr' ? 'ltr' : 'rtl' }),
  ]
}
