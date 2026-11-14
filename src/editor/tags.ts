import type { CompletionContext, CompletionResult } from '@codemirror/autocomplete'
import { Decoration, type DecorationSet, type EditorView, MatchDecorator, ViewPlugin, type ViewUpdate } from '@codemirror/view'
import { isTagName, tagRegex } from '../lib/tags'

const tagMark = Decoration.mark({ class: 'cm-tag' })

const matcher = new MatchDecorator({
  regexp: tagRegex(),
  decorate: (add, from, to, match) => {
    if (isTagName(match[1])) add(from, to, tagMark)
  },
})

/** Highlights #tags while editing. */
export const tagHighlight = ViewPlugin.fromClass(
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

/** Suggest existing tags after typing `#` and at least one character. */
export function tagSource(getTags: () => { name: string; count: number }[]) {
  return (ctx: CompletionContext): CompletionResult | null => {
    const word = ctx.matchBefore(/(?<=^|[\s(\[{,;:'"])#[\p{L}\p{M}\p{N}_\-/]*/u)
    if (!word || (word.to - word.from < 2 && !ctx.explicit)) return null
    const typed = ctx.state.sliceDoc(word.from + 1, word.to).toLowerCase()
    const options = getTags()
      .filter((t) => t.name.toLowerCase() !== typed)
      .map((t) => ({ label: `#${t.name}`, detail: String(t.count), type: 'keyword' }))
    return options.length ? { from: word.from, options, validFor: /^#[\p{L}\p{M}\p{N}_\-/]*$/u } : null
  }
}
