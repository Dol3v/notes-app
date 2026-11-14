import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { useEffect, useRef } from 'preact/hooks'
import { directionExtension } from '../editor/direction'
import type { FollowTarget } from '../editor/links'
import { directionCompartment, editorExtensions } from '../editor/setup'
import type { Direction } from '../lib/vault'

interface Props {
  value: string
  /**
   * Identity of the source object. Typing mutates the same note object; a sync pull replaces it.
   * Only a new revision may overwrite the editor — comparing against `value` alone would push
   * stale render-time text back into the editor while the user types faster than renders.
   */
  revision: object
  direction: Direction
  autoFocus: boolean
  onChange: (value: string) => void
  /** existing tags, for autocompletion */
  getTags: () => { name: string; count: number }[]
  /** note titles, for [[link]] autocompletion */
  getTitles: () => string[]
  /** Ctrl+click on a [[link]] or #tag */
  onFollow: (t: FollowTarget) => void
  viewRef: { current: EditorView | null }
}

export function Editor({ value, revision, direction, autoFocus, onChange, getTags, getTitles, onFollow, viewRef }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const getTagsRef = useRef(getTags)
  getTagsRef.current = getTags
  const getTitlesRef = useRef(getTitles)
  getTitlesRef.current = getTitles
  const onFollowRef = useRef(onFollow)
  onFollowRef.current = onFollow

  useEffect(() => {
    const view = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: editorExtensions(
          direction,
          (doc) => onChangeRef.current(doc),
          () => getTagsRef.current(),
          () => getTitlesRef.current(),
          (t) => onFollowRef.current(t),
        ),
      }),
    })
    viewRef.current = view
    if (autoFocus) {
      view.dispatch({ selection: { anchor: view.state.doc.length } })
      view.focus()
    }
    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [])

  useEffect(() => {
    viewRef.current?.dispatch({ effects: directionCompartment.reconfigure(directionExtension(direction)) })
  }, [direction])

  // The note was replaced underneath us (pulled by sync) — show the new text.
  const lastRevision = useRef(revision)
  useEffect(() => {
    if (lastRevision.current === revision) return
    lastRevision.current = revision
    const view = viewRef.current
    if (view && view.state.doc.toString() !== value) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } })
    }
  }, [revision])

  return <div class="editor" ref={host} />
}
