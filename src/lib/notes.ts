import { isTagOnlyLine, tagRegex } from './tags'
import type { Note } from './vault'

function cleanLine(line: string): string {
  return line
    .replace(/^\s*#{1,6}\s+/, '')
    .replace(/^\s*>\s?/, '')
    .replace(/^\s*([-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?/, '')
    .replace(/[*_`~]+/g, '')
    .replace(/\[\[([^[\]|\n]+?)(?:\|([^[\]\n]+?))?\]\]/g, (_, target: string, alias?: string) => alias ?? target)
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .trim()
}

const withoutTags = (t: string) => t.replace(tagRegex(), '').replace(/s{2,}/g, ' ').trim()

export function noteTitle(note: Note): string {
  let tagLine = ''
  for (const line of note.body.split('\n')) {
    const t = cleanLine(line)
    if (!t) continue
    if (isTagOnlyLine(line)) {
      tagLine ||= t // a "#work #ideas" line is metadata, not a title — unless it's all there is
      continue
    }
    // tags are shown as chips next to the title — leave them out of the title itself
    return (withoutTags(t) || t).slice(0, 100)
  }
  return tagLine.slice(0, 100) || 'Untitled'
}

export function noteSnippet(note: Note): string {
  const title = noteTitle(note)
  const lines = note.body
    .split('\n')
    .filter((l) => !isTagOnlyLine(l))
    .map(cleanLine)
    .filter(Boolean)
  if (lines[0] && (withoutTags(lines[0]) || lines[0]).slice(0, 100) === title) lines.shift()
  return lines.join(' · ').slice(0, 140)
}

export function sortNotes(notes: Iterable<Note>): Note[] {
  return [...notes].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.updated - a.updated)
}

export function formatDate(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  })
}

export function timeAgo(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000)
  if (s < 45) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  return formatDate(ts)
}

/** Filesystem-safe name that keeps Hebrew letters. */
export function safeFilename(title: string): string {
  const s = title
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
    .replace(/[. ]+$/, '')
  return s || 'Untitled'
}
