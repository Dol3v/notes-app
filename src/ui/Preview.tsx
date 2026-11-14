import DOMPurify from 'dompurify'
import { useLayoutEffect, useRef } from 'preact/hooks'
import { detectDir } from '../lib/direction'
import { renderMarkdown } from '../lib/markdown'
import type { ComponentChildren } from 'preact'
import type { Direction } from '../lib/vault'

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank')
    node.setAttribute('rel', 'noopener noreferrer')
  }
})

const BLOCKS = 'p,h1,h2,h3,h4,h5,h6,li,blockquote,ul,ol,table,td,th,dt,dd'

function applyDirections(root: ParentNode, mode: Direction) {
  root.querySelectorAll(BLOCKS).forEach((el) => {
    const dir = mode === 'auto' ? (detectDir(el.textContent ?? '') ?? 'rtl') : mode
    el.setAttribute('dir', dir)
  })
  root.querySelectorAll('pre').forEach((el) => el.setAttribute('dir', 'ltr'))
}

interface Props {
  body: string
  direction: Direction
  onToggleTask: (line: number) => void
  onEmptyClick: () => void
  onTag: (tag: string) => void
  /** does a [[link]] target exist? */
  linkExists: (target: string) => boolean
  onLink: (target: string) => void
  children?: ComponentChildren
}

export function Preview({ body, direction, onToggleTask, onEmptyClick, onTag, linkExists, onLink, children }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const frag = DOMPurify.sanitize(renderMarkdown(body), {
      RETURN_DOM_FRAGMENT: true,
      ADD_ATTR: ['target'],
    })
    applyDirections(frag, direction)
    ref.current!.replaceChildren(frag)
  }, [body, direction])

  // Re-check on every render: other notes being created/renamed changes which links resolve.
  useLayoutEffect(() => {
    ref.current!.querySelectorAll<HTMLElement>('.wikilink').forEach((el) => {
      const ok = linkExists(el.dataset.target ?? '')
      el.classList.toggle('broken', !ok)
      el.title = ok ? `Open “${el.dataset.target}”` : `“${el.dataset.target}” doesn't exist yet — click to create it`
    })
  })

  const onClick = (e: MouseEvent) => {
    const t = e.target as HTMLElement
    if (t instanceof HTMLInputElement && t.classList.contains('task')) {
      e.preventDefault()
      onToggleTask(Number(t.dataset.line))
    } else if (t.classList.contains('tag') && t.dataset.tag) {
      onTag(t.dataset.tag)
    } else if (t.classList.contains('wikilink') && t.dataset.target) {
      onLink(t.dataset.target)
    }
  }
  const onKeyDown = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement
    if (e.key === 'Enter' && t.classList.contains('wikilink') && t.dataset.target) onLink(t.dataset.target)
  }

  return (
    <div class="preview-scroll">
      <article class="preview" ref={ref} onClick={onClick} onKeyDown={onKeyDown} />
      {children}
      {!body.trim() && (
        <button class="link-btn" onClick={onEmptyClick}>
          Empty note — tap to edit
        </button>
      )}
    </div>
  )
}
