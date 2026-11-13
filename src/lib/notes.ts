import type { Note } from './vault'

function cleanLine(line: string): string {
  return line
    .replace(/^\s*#{1,6}\s+/, '')
    .replace(/^\s*>\s?/, '')
    .replace(/^\s*([-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?/, '')
    .replace(/[*_`~]+/g, '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .trim()
}

export function noteTitle(note: Note): string {
  for (const line of note.body.split('\n')) {
    const t = cleanLine(line)
    if (t) return t.slice(0, 100)
  }
  return 'Untitled'
}

export function noteSnippet(note: Note): string {
  const lines = note.body.split('\n').map(cleanLine).filter(Boolean)
  return lines.slice(1).join(' · ').slice(0, 140)
}

export function sortNotes(notes: Iterable<Note>): Note[] {
  return [...notes].sort((a, b) => b.updated - a.updated)
}

export function matchesQuery(note: Note, query: string): boolean {
  const q = query.trim().toLowerCase()
  return !q || note.body.toLowerCase().includes(q)
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
