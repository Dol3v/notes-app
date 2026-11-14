import MarkdownIt from 'markdown-it'
import { isTagName, tagRegex } from './tags'

// Raw HTML in notes is disabled: markdown only. Output is additionally sanitized by DOMPurify.
const md = new MarkdownIt({ html: false, linkify: true, breaks: true, typographer: false })

// GitHub-style task lists: "- [ ] todo" / "- [x] done" become checkboxes that know their source line.
md.core.ruler.push('task_lists', (state) => {
  const tokens = state.tokens
  for (let i = 2; i < tokens.length; i++) {
    const inline = tokens[i]
    const item = tokens[i - 2]
    if (inline.type !== 'inline' || tokens[i - 1].type !== 'paragraph_open' || item.type !== 'list_item_open') {
      continue
    }
    const m = /^\[([ xX])\]\s+/.exec(inline.content)
    const first = inline.children?.[0]
    if (!m || !first || first.type !== 'text' || !first.content.startsWith(m[0].trimEnd())) continue
    first.content = first.content.slice(m[0].length).replace(/^\s+/, '')
    const box = new state.Token('html_inline', '', 0)
    const line = item.map?.[0] ?? -1
    box.content = `<input type="checkbox" class="task" data-line="${line}"${m[1] === ' ' ? '' : ' checked'}> `
    inline.children!.unshift(box)
    item.attrJoin('class', 'task-item')
  }
})

// #tags → <span class="tag" data-tag="…">. Code spans/blocks are separate token types, so they are
// never touched; text inside links is skipped.
const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

// [[Note title|alias]] → <span class="wikilink" data-target="Note title">alias</span>.
// Resolved (and marked broken if missing) by the Preview, which knows the notes.
md.inline.ruler.before('link', 'wikilink', (state, silent) => {
  const src = state.src
  const start = state.pos
  if (src.charCodeAt(start) !== 0x5b /* [ */ || src.charCodeAt(start + 1) !== 0x5b) return false
  const m = /^\[\[([^[\]|\n]+?)(?:\|([^[\]\n]+?))?\]\]/.exec(src.slice(start, state.posMax))
  if (!m) return false
  if (!silent) {
    const target = m[1].trim()
    const tok = state.push('html_inline', '', 0)
    tok.content = `<span class="wikilink" role="link" tabindex="0" data-target="${escapeHtml(target)}">${escapeHtml((m[2] ?? m[1]).trim())}</span>`
  }
  state.pos += m[0].length
  return true
})

md.core.ruler.push('tags', (state) => {
  for (const block of state.tokens) {
    if (block.type !== 'inline' || !block.children) continue
    const out: typeof block.children = []
    let inLink = 0
    for (const tok of block.children) {
      if (tok.type === 'link_open') inLink++
      if (tok.type === 'link_close') inLink--
      if (tok.type !== 'text' || inLink > 0 || !tok.content.includes('#')) {
        out.push(tok)
        continue
      }
      let last = 0
      for (const m of tok.content.matchAll(tagRegex())) {
        if (!isTagName(m[1])) continue
        const start = m.index!
        if (start > last) {
          const t = new state.Token('text', '', 0)
          t.content = tok.content.slice(last, start)
          out.push(t)
        }
        const span = new state.Token('html_inline', '', 0)
        span.content = `<span class="tag" data-tag="${escapeHtml(m[1])}">#${escapeHtml(m[1])}</span>`
        out.push(span)
        last = start + m[0].length
      }
      if (last === 0) {
        out.push(tok)
      } else if (last < tok.content.length) {
        const t = new state.Token('text', '', 0)
        t.content = tok.content.slice(last)
        out.push(t)
      }
    }
    block.children = out
  }
})

export function renderMarkdown(body: string): string {
  return md.render(body)
}

/** Flip the checkbox on a given (0-based) source line. */
export function toggleTaskLine(body: string, line: number): string {
  const lines = body.split('\n')
  if (line < 0 || line >= lines.length) return body
  lines[line] = lines[line].replace(/\[([ xX])\]/, (_, c: string) => (c === ' ' ? '[x]' : '[ ]'))
  return lines.join('\n')
}
