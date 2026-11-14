/**
 * Obsidian-style note links: `[[Note title]]` or `[[Note title|shown text]]`.
 * Notes have no file names, so a link points at a note *title* (its first line), matched
 * case-insensitively. Like tags, links live in the note text — no storage changes.
 */
import { noteTitle } from './notes'
import { stripCode } from './tags'
import type { Note } from './vault'

/** Global regex: group 1 = target title, group 2 = optional alias. Fresh object per call. */
export const wikiLinkRegex = () => /\[\[([^[\]|\n]+?)(?:\|([^[\]\n]+?))?\]\]/g

const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase()

/** Link targets in a body (outside code), normalized for matching. */
export function extractLinks(body: string): string[] {
  return [...new Set([...stripCode(body).matchAll(wikiLinkRegex())].map((m) => norm(m[1])))]
}

/** The note a link points to: exact title match, most recently edited first if titles repeat. */
export function resolveLink(target: string, notes: Note[]): Note | undefined {
  const t = norm(target)
  let best: Note | undefined
  for (const n of notes) {
    if (norm(noteTitle(n)) === t && (!best || n.updated > best.updated)) best = n
  }
  return best
}

/** Notes that link to `note`. */
export function backlinks(note: Note, notes: Note[]): Note[] {
  const t = norm(noteTitle(note))
  return notes.filter((n) => n.id !== note.id && extractLinks(n.body).includes(t))
}
