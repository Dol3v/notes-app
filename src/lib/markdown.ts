import MarkdownIt from 'markdown-it'

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
