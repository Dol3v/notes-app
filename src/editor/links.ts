import { type Completion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete'
import { Decoration, type DecorationSet, EditorView, MatchDecorator, ViewPlugin, type ViewUpdate } from '@codemirror/view'
import { wikiLinkRegex } from '../lib/links'
import { isTagName, tagRegex } from '../lib/tags'

const linkMark = Decoration.mark({ class: 'cm-wikilink' })
const matcher = new MatchDecorator({ regexp: wikiLinkRegex(), decoration: linkMark })

/** Highlights [[note links]] while editing. */
export const linkHighlight = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = matcher.createDeco(view)
    }
    update(u: ViewUpdate) {
      this.decorations = matcher.updateDeco(u, this.decorations)
    }
  },
  { decorations: (v) => v.decorations },
)

/** After `[[`, suggest note titles; picking one inserts `[[Title]]`. */
export function linkSource(getTitles: () => string[]) {
  return (ctx: CompletionContext): CompletionResult | null => {
    const word = ctx.matchBefore(/\[\[[^[\]|\n]*/)
    if (!word) return null
    // replace a "]]" the user (or a previous completion) already typed after the cursor
    const closing = ctx.state.sliceDoc(ctx.pos, ctx.pos + 2) === ']]' ? 2 : 0
    const options: Completion[] = getTitles().map((title) => ({
      label: title,
      type: 'text',
      apply: (view, _c, from, to) => {
        // `from` is just after the typed "[[" — replace that too
        const insert = `[[${title}]]`
        view.dispatch({ changes: { from: from - 2, to: to + closing, insert }, selection: { anchor: from - 2 + insert.length } })
      },
    }))
    return options.length ? { from: word.from + 2, to: word.to, options, filter: true, validFor: /^[^[\]|\n]*$/ } : null
  }
}

export type FollowTarget = { kind: 'link'; target: string } | { kind: 'tag'; tag: string }

/** The [[link]] or #tag at a document position, if any. */
export function targetAt(view: EditorView, pos: number): FollowTarget | null {
  const line = view.state.doc.lineAt(pos)
  const col = pos - line.from
  for (const m of line.text.matchAll(wikiLinkRegex())) {
    if (col >= m.index! && col <= m.index! + m[0].length) return { kind: 'link', target: m[1].trim() }
  }
  for (const m of line.text.matchAll(tagRegex())) {
    if (isTagName(m[1]) && col >= m.index! && col <= m.index! + m[0].length) return { kind: 'tag', tag: m[1] }
  }
  return null
}

/** Ctrl/⌘+click a [[link]] or #tag to follow it. */
export function followOnModClick(follow: (t: FollowTarget) => void) {
  return EditorView.domEventHandlers({
    mousedown(e, view) {
      if (!(e.ctrlKey || e.metaKey) || e.button !== 0) return false
      const pos = view.posAtCoords({ x: e.clientX, y: e.clientY })
      const t = pos === null ? null : targetAt(view, pos)
      if (!t) return false
      e.preventDefault()
      follow(t)
      return true
    },
  })
}
