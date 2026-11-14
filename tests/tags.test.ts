import { describe, expect, it } from 'vitest'
import { renderMarkdown } from '../src/lib/markdown'
import { noteSnippet, noteTitle } from '../src/lib/notes'
import { buildTagTree, extractTags, hasTag } from '../src/lib/tags'
import type { Note } from '../src/lib/vault'

const note = (body: string): Note => ({ id: crypto.randomUUID(), body, created: 0, updated: 0 })

describe('tags', () => {
  it('extracts nested, Hebrew and English tags', () => {
    expect(extractTags('#work/project-x and #עבודה/דחוף, (#ideas) #Work/Project-X')).toEqual([
      'work/project-x',
      'עבודה/דחוף',
      'ideas',
    ])
  })
  it('ignores headings, numbers, URLs, mid-word # and code', () => {
    const body = [
      '# Heading',
      '## #notatag-heading-is-fine', // a tag inside a heading still counts
      'issue #123, C# and a#b',
      'https://x.com/page#anchor',
      '`#inline`',
      '```',
      '#include <stdio.h>',
      '```',
      'end #real/',
    ].join('\n')
    expect(extractTags(body)).toEqual(['notatag-heading-is-fine', 'real'])
  })
  it('matches parent tags and builds a counted tree', () => {
    const a = note('#work/project-x')
    const b = note('#work #work/meetings')
    const c = note('#home')
    expect(hasTag(a, 'work')).toBe(true)
    expect(hasTag(a, 'WORK/project-x')).toBe(true)
    expect(hasTag(a, 'wor')).toBe(false)
    const tree = buildTagTree([a, b, c])
    expect(tree.map((n) => [n.path, n.count])).toEqual([
      ['home', 1],
      ['work', 2],
    ])
    expect(tree[1].children.map((n) => [n.path, n.count])).toEqual([
      ['work/meetings', 1],
      ['work/project-x', 1],
    ])
  })
  it('skips tag-only lines for titles and snippets', () => {
    const n = note('#work #ideas\n# Real title\nbody text')
    expect(noteTitle(n)).toBe('Real title')
    expect(noteSnippet(n)).toBe('body text')
    expect(noteTitle(note('#work'))).toBe('#work')
  })
  it('renders tags as escaped spans, not inside code or links', () => {
    const html = renderMarkdown('hi #a/b `#c` [#d](https://x.y) #e')
    expect(html).toContain('<span class="tag" data-tag="a/b">#a/b</span>')
    expect(html).toContain('<code>#c</code>')
    expect(html).toContain('>#d</a>')
    expect(html).toContain('data-tag="e"')
    expect(html).not.toContain('data-tag="c"')
    expect(html).not.toContain('data-tag="d"')
  })
})
