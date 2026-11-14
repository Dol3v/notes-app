import DOMPurify from 'dompurify'
import { useLayoutEffect, useRef } from 'preact/hooks'
import { detectDir } from '../lib/direction'
import { renderMarkdown } from '../lib/markdown'
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
}

export function Preview({ body, direction, onToggleTask, onEmptyClick, onTag }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const frag = DOMPurify.sanitize(renderMarkdown(body), {
      RETURN_DOM_FRAGMENT: true,
      ADD_ATTR: ['target'],
    })
    applyDirections(frag, direction)
    ref.current!.replaceChildren(frag)
  }, [body, direction])

  const onClick = (e: MouseEvent) => {
    const t = e.target as HTMLElement
    if (t instanceof HTMLInputElement && t.classList.contains('task')) {
      e.preventDefault()
      onToggleTask(Number(t.dataset.line))
    } else if (t.classList.contains('tag') && t.dataset.tag) {
      onTag(t.dataset.tag)
    }
  }

  return (
    <div class="preview-scroll">
      <article class="preview" ref={ref} onClick={onClick} />
      {!body.trim() && (
        <button class="link-btn" onClick={onEmptyClick}>
          Empty note — tap to edit
        </button>
      )}
    </div>
  )
}
