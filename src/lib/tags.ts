/**
 * Obsidian-style tags: written inline in the note body as `#tag`, nested with slashes
 * (`#work/project-x`). They live inside the (encrypted) note text, so they need no storage
 * changes and sync/merge like any other edit.
 */
import type { Note } from './vault'

const TAG_CHARS = String.raw`[\p{L}\p{M}\p{N}_\-]`
const TAG_BODY = String.raw`${TAG_CHARS}+(?:\/${TAG_CHARS}+)*`
/** Must start a word: line start, whitespace or an opening bracket/punctuation (not `a#b` or URLs). */
const BOUNDARY = String.raw`(?<=^|[\s(\[{,;:'"])`
const HAS_LETTER = /[\p{L}_\-]/u

/** Global regex matching `#tag` (the tag body without `#` in group 1). Fresh object per call. */
export const tagRegex = () => new RegExp(String.raw`${BOUNDARY}#(${TAG_BODY})`, 'gu')

/** Purely numeric "tags" (#1, #2024) are issue numbers etc., not tags — same rule as Obsidian. */
export const isTagName = (name: string) => HAS_LETTER.test(name)

/** Drop fenced code blocks and inline code — `#include` in a snippet is not a tag. */
function stripCode(body: string): string {
  const out: string[] = []
  let fence: string | null = null
  for (const line of body.split('\n')) {
    const m = /^\s{0,3}(`{3,}|~{3,})/.exec(line)
    if (fence) {
      if (m && m[1][0] === fence[0] && m[1].length >= fence.length) fence = null
      continue
    }
    if (m) {
      fence = m[1]
      continue
    }
    out.push(line.replace(/(`+)[^`]*?\1/g, ' '))
  }
  return out.join('\n')
}

/** Tags in a body, de-duplicated case-insensitively, in order of first appearance. */
export function extractTags(body: string): string[] {
  const seen = new Map<string, string>()
  for (const m of stripCode(body).matchAll(tagRegex())) {
    const name = m[1]
    if (!isTagName(name)) continue
    const key = name.toLowerCase()
    if (!seen.has(key)) seen.set(key, name)
  }
  return [...seen.values()]
}

const cache = new WeakMap<Note, { body: string; tags: string[] }>()

export function noteTags(note: Note): string[] {
  const hit = cache.get(note)
  if (hit && hit.body === note.body) return hit.tags
  const tags = extractTags(note.body)
  cache.set(note, { body: note.body, tags })
  return tags
}

/** `#work` matches notes tagged `#work` and `#work/anything`. */
export function hasTag(note: Note, tag: string): boolean {
  const t = tag.toLowerCase()
  return noteTags(note).some((x) => {
    const l = x.toLowerCase()
    return l === t || l.startsWith(`${t}/`)
  })
}

export interface TagNode {
  /** last path segment, e.g. `project-x` */
  name: string
  /** full path, e.g. `work/project-x` */
  path: string
  /** notes tagged with this tag or any tag below it */
  count: number
  children: TagNode[]
}

export function buildTagTree(notes: Iterable<Note>): TagNode[] {
  const root: TagNode = { name: '', path: '', count: 0, children: [] }
  const index = new Map<string, TagNode>()
  for (const note of notes) {
    const counted = new Set<TagNode>()
    for (const tag of noteTags(note)) {
      let parent = root
      const parts = tag.split('/')
      for (let i = 0; i < parts.length; i++) {
        const path = parts.slice(0, i + 1).join('/')
        const key = path.toLowerCase()
        let node = index.get(key)
        if (!node) {
          node = { name: parts[i], path, count: 0, children: [] }
          index.set(key, node)
          parent.children.push(node)
        }
        if (!counted.has(node)) {
          counted.add(node)
          node.count++
        }
        parent = node
      }
    }
  }
  const sort = (nodes: TagNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
    nodes.forEach((n) => sort(n.children))
  }
  sort(root.children)
  return root.children
}

/** True if a line contains nothing but tags (e.g. a `#work #ideas` line at the top of a note). */
export function isTagOnlyLine(line: string): boolean {
  const rest = line.replace(tagRegex(), '').trim()
  return rest === '' && tagRegex().test(line)
}

/**
 * Split a search query into `#tag` terms and free text. Tag terms match by prefix, so results
 * narrow while typing: `#wo` → `#work`, `#work/meetings`, …
 */
export function parseQuery(query: string): { tags: string[]; text: string } {
  const tags: string[] = []
  const text = query
    .replace(tagRegex(), (whole: string, name: string) => {
      if (!isTagName(name)) return whole // "#123" is searched as plain text
      tags.push(name.toLowerCase())
      return ' '
    })
    .replace(/\s+/g, ' ')
    .trim()
  return { tags, text }
}

export function matchesSearch(note: Note, query: string): boolean {
  const { tags, text } = parseQuery(query)
  if (text && !note.body.toLowerCase().includes(text.toLowerCase())) return false
  if (!tags.length) return true
  const mine = noteTags(note).map((t) => t.toLowerCase())
  return tags.every((q) => mine.some((t) => t.startsWith(q)))
}

const FULL_TAG = new RegExp(String.raw`^${TAG_BODY}$`, 'u')

/** Normalize user input for a tag name ("#Work/ x" → null, "#work/x/" → "work/x"). */
export function cleanTagName(input: string): string | null {
  const name = input.trim().replace(/^#+/, '').replace(/\/+$/, '')
  return FULL_TAG.test(name) && isTagName(name) ? name : null
}

/**
 * Rename `from` (and everything nested under it) to `to` in a note body, leaving code untouched.
 * Renaming onto an existing tag merges the two. Returns the body unchanged if nothing matched.
 */
export function renameTagInBody(body: string, from: string, to: string): string {
  const f = from.toLowerCase()
  const rename = (text: string) =>
    text.replace(tagRegex(), (whole: string, name: string) => {
      const l = name.toLowerCase()
      if (l === f) return `#${to}`
      if (l.startsWith(`${f}/`)) return `#${to}${name.slice(from.length)}`
      return whole
    })
  let fence: string | null = null
  return body
    .split('\n')
    .map((line) => {
      const m = /^\s{0,3}(`{3,}|~{3,})/.exec(line)
      if (fence) {
        if (m && m[1][0] === fence[0] && m[1].length >= fence.length) fence = null
        return line
      }
      if (m) {
        fence = m[1]
        return line
      }
      // odd segments of a split on code spans are code — keep them
      return line
        .split(/(`+[^`]*?`+)/)
        .map((seg, i) => (i % 2 ? seg : rename(seg)))
        .join('')
    })
    .join('\n')
}

/** All distinct tags across notes, most used first — for autocompletion. */
export function allTags(notes: Iterable<Note>): { name: string; count: number }[] {
  const counts = new Map<string, { name: string; count: number }>()
  for (const n of notes) {
    for (const t of noteTags(n)) {
      const e = counts.get(t.toLowerCase())
      if (e) e.count++
      else counts.set(t.toLowerCase(), { name: t, count: 1 })
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}
