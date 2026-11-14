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

describe('search', () => {
  it('combines #tag prefixes with free text', async () => {
    const { matchesSearch } = await import('../src/lib/tags')
    const n = note('Meeting notes #work/meetings\nissue #123 discussed')
    expect(matchesSearch(n, '#wo')).toBe(true)
    expect(matchesSearch(n, '#work/meet notes')).toBe(true)
    expect(matchesSearch(n, '#home')).toBe(false)
    expect(matchesSearch(n, '#work missing')).toBe(false)
    expect(matchesSearch(n, '#123')).toBe(true)
    expect(matchesSearch(n, '')).toBe(true)
  })
})

describe('tag management', () => {
  it('renames a tag and its children, merging and leaving code alone', async () => {
    const { renameTagInBody } = await import('../src/lib/tags')
    const body = '#work and #Work/x, #workshop\n`#work` stays\n```\n#work\n```\nend #work/y/z'
    expect(renameTagInBody(body, 'work', 'job')).toBe(
      '#job and #job/x, #workshop\n`#work` stays\n```\n#work\n```\nend #job/y/z',
    )
    expect(renameTagInBody('#a #b', 'a', 'b')).toBe('#b #b') // merge
    expect(renameTagInBody('nothing here', 'a', 'b')).toBe('nothing here')
  })
  it('validates new tag names', async () => {
    const { cleanTagName } = await import('../src/lib/tags')
    expect(cleanTagName(' #work/x/ ')).toBe('work/x')
    expect(cleanTagName('עבודה')).toBe('עבודה')
    expect(cleanTagName('two words')).toBeNull()
    expect(cleanTagName('123')).toBeNull()
    expect(cleanTagName('a//b')).toBeNull()
  })
  it('lists tags by use for autocompletion', async () => {
    const { allTags } = await import('../src/lib/tags')
    expect(allTags([note('#b #a'), note('#B')])).toEqual([
      { name: 'b', count: 2 },
      { name: 'a', count: 1 },
    ])
  })
  it('sorts pinned notes first', async () => {
    const { sortNotes } = await import('../src/lib/notes')
    const old = { ...note('old'), updated: 1, pinned: true }
    const recent = { ...note('recent'), updated: 9 }
    expect(sortNotes([recent, old]).map((n) => n.body)).toEqual(['old', 'recent'])
  })
})
