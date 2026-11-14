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
