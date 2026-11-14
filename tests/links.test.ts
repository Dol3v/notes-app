import { describe, expect, it } from 'vitest'
import { backlinks, extractLinks, resolveLink } from '../src/lib/links'
import { renderMarkdown } from '../src/lib/markdown'
import type { Note } from '../src/lib/vault'

const note = (body: string, updated = 0): Note => ({ id: crypto.randomUUID(), body, created: 0, updated })

describe('note links', () => {
  it('extracts targets, ignoring code and aliases', () => {
    expect(extractLinks('see [[Q4 Plan]] and [[ q4   plan |the plan]], `[[Not]]`\n```\n[[Nope]]\n```\n[[קניות]]')).toEqual([
      'q4 plan',
      'קניות',
    ])
  })
  it('resolves by title case-insensitively, newest first', () => {
    const old = note('# Plan\nold', 1)
    const fresh = note('Plan #work\nnew', 2)
    expect(resolveLink('plan', [old, fresh])).toBe(fresh)
    expect(resolveLink('missing', [old])).toBeUndefined()
  })
  it('finds backlinks', () => {
    const target = note('# Plan')
    const a = note('link to [[plan]]')
    const b = note('no link')
    expect(backlinks(target, [target, a, b])).toEqual([a])
  })
  it('renders links as escaped spans and leaves normal links alone', () => {
    const html = renderMarkdown('[[Plan|the <plan>]] and [web](https://example.com) and `[[code]]`')
    expect(html).toContain('<span class="wikilink" role="link" tabindex="0" data-target="Plan">the &lt;plan&gt;</span>')
    expect(html).toContain('<a href="https://example.com">web</a>')
    expect(html).toContain('<code>[[code]]</code>')
  })
})
