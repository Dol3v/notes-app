export type Dir = 'rtl' | 'ltr'

const RTL_CHAR = /[֐-ࣿיִ-﷿ﹰ-﻿]/
const FIRST_LETTER = /\p{L}/u

/** Direction of the first strong (letter) character, or null if the text has none. */
export function detectDir(text: string): Dir | null {
  const m = FIRST_LETTER.exec(text)
  if (!m) return null
  return RTL_CHAR.test(m[0]) ? 'rtl' : 'ltr'
}

/** Leading markdown syntax that says nothing about direction: quotes, list bullets, task boxes. */
const LINE_MARKUP = /^\s*(?:>\s*)*(?:(?:[-*+]|\d+[.)])\s+)?(?:\[[ xX]\]\s*)?/

/** Like detectDir, but ignores a leading "> - [x] " so a checked Hebrew task stays RTL. */
export function detectLineDir(line: string): Dir | null {
  return detectDir(line.replace(LINE_MARKUP, ''))
}
