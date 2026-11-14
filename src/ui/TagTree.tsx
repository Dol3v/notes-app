import { useState } from 'preact/hooks'
import { type TagNode, buildTagTree, cleanTagName, hasTag, noteTags } from '../lib/tags'
import type { Session } from '../session'

interface Props {
  session: Session
  /** active tag filter */
  tag: string | null
  onTag: (tag: string | null) => void
}

export function TagTree({ session, tag, onTag }: Props) {
  const notes = session.notes
  const tree = buildTagTree(notes)

  const rename = async (from: string) => {
    const input = prompt(`Rename #${from} to (use an existing tag to merge):`, from)
    if (input === null) return
    const to = cleanTagName(input)
    if (!to) return alert('Tags can contain letters, numbers, - and _, with / for nesting (e.g. work/project-x).')
    if (to === from) return
    const affected = notes.filter((n) => hasTag(n, from)).length
    const prefix = `${from.toLowerCase()}/`
    const nested = notes.some((n) => noteTags(n).some((t) => t.toLowerCase().startsWith(prefix)))
      ? ' and the tags nested under it'
      : ''
    if (!confirm(`Rename #${from}${nested} to #${to} in ${affected} note${affected === 1 ? '' : 's'}?`)) return
    const changed = await session.renameTag(from, to)
    session.showToast(`Renamed #${from} → #${to} in ${changed} note${changed === 1 ? '' : 's'}`)
    // keep the filter pointing at the same notes
    if (tag) {
      const t = tag.toLowerCase()
      const f = from.toLowerCase()
      if (t === f) onTag(to)
      else if (t.startsWith(`${f}/`)) onTag(to + tag.slice(from.length))
    }
  }

  if (tree.length === 0) {
    return (
      <p class="subtle small tag-empty">
        No tags yet. Write <code>#tag</code> or <code>#parent/child</code> anywhere in a note.
      </p>
    )
  }
  return (
    <ul class="tag-list">
      <li>
        <div class={`tag-row ${tag === null ? 'active' : ''}`}>
          <button class="tag-main" onClick={() => onTag(null)}>
            <span class="tag-twisty" />
            <span class="tag-name">All notes</span>
            <span class="tag-count">{notes.length}</span>
          </button>
        </div>
      </li>
      {tree.map((n) => (
        <TagRow key={n.path} node={n} depth={0} active={tag} onTag={onTag} onRename={rename} />
      ))}
    </ul>
  )
}

interface RowProps {
  node: TagNode
  depth: number
  active: string | null
  onTag: (t: string) => void
  onRename: (path: string) => void
}

function TagRow({ node, depth, active, onTag, onRename }: RowProps) {
  const a = active?.toLowerCase()
  const p = node.path.toLowerCase()
  // open the branch that leads to the active tag
  const [open, setOpen] = useState(!!a && a.startsWith(`${p}/`))
  const hasKids = node.children.length > 0
  return (
    <li>
      <div class={`tag-row ${a === p ? 'active' : ''}`}>
        <button
          class={`tag-twisty ${hasKids ? (open ? 'open' : 'closed') : ''}`}
          style={{ marginInlineStart: `${depth * 16}px` }}
          onClick={() => hasKids && setOpen(!open)}
          tabIndex={hasKids ? 0 : -1}
          aria-label={hasKids ? (open ? 'Collapse' : 'Expand') : undefined}
          aria-hidden={!hasKids}
        />
        <button class="tag-main" onClick={() => onTag(node.path)}>
          <span class="tag-name" dir="auto">
            {node.name}
          </span>
          <span class="tag-count">{node.count}</span>
        </button>
        <button class="tag-edit" onClick={() => onRename(node.path)} title={`Rename #${node.path}`} aria-label={`Rename #${node.path}`}>
          ✎
        </button>
      </div>
      {hasKids && open && (
        <ul>
          {node.children.map((c) => (
            <TagRow key={c.path} node={c} depth={depth + 1} active={active} onTag={onTag} onRename={onRename} />
          ))}
        </ul>
      )}
    </li>
  )
}
