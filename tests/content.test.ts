import { BlobReader, BlobWriter, type FileEntry, Uint8ArrayReader, Uint8ArrayWriter, ZipReader } from '@zip.js/zip.js'
import { describe, expect, it } from 'vitest'
import { detectDir, detectLineDir } from '../src/lib/direction'
import { buildEncryptedExport } from '../src/lib/export'
import { renderMarkdown, toggleTaskLine } from '../src/lib/markdown'
import { noteTitle } from '../src/lib/notes'
import type { Note } from '../src/lib/vault'

const note = (body: string, id = crypto.randomUUID()): Note => ({ id, body, created: 0, updated: Date.now() })

describe('direction', () => {
  it('uses the first letter', () => {
    expect(detectDir('# שלום world')).toBe('rtl')
    expect(detectDir('- [ ] buy חלב')).toBe('ltr')
    expect(detectDir('1. 2. ---')).toBeNull()
    expect(detectDir('**מודגש**')).toBe('rtl')
    expect(detectLineDir('- [x] ביצים')).toBe('rtl')
    expect(detectLineDir('> 1. [X] קפה')).toBe('rtl')
    expect(detectLineDir('- [ ] eggs')).toBe('ltr')
    expect(detectLineDir('- [x] ')).toBeNull()
  })
})

describe('markdown', () => {
  it('renders task lists with source lines and escapes HTML', () => {
    const html = renderMarkdown('# כותרת\n\n- [ ] לקנות חלב\n- [x] done\n\n<script>alert(1)</script>')
    expect(html).toContain('<input type="checkbox" class="task" data-line="2"> לקנות חלב')
    expect(html).toContain('data-line="3" checked')
    expect(html).not.toContain('<script>')
  })
  it('toggles a task line', () => {
    expect(toggleTaskLine('a\n- [ ] x\n- [x] y', 1)).toBe('a\n- [x] x\n- [x] y')
    expect(toggleTaskLine('a\n- [ ] x\n- [x] y', 2)).toBe('a\n- [ ] x\n- [ ] y')
  })
  it('derives titles', () => {
    expect(noteTitle(note('\n\n## **רשימה** חשובה\nbody'))).toBe('רשימה חשובה')
    expect(noteTitle(note('   '))).toBe('Untitled')
  })
})

describe('export', () => {
  it('produces an AES zip whose only visible name is notes.zip', async () => {
    const notes = [note('# קניות\nחלב'), note('# קניות\nלחם'), note('Plain: English / with? bad*chars')]
    const bytes = await buildEncryptedExport(notes, 'export-pass')

    // file names of the outer zip are not secret — make sure no title leaks there
    expect(Buffer.from(bytes).includes(Buffer.from('קניות'))).toBe(false)

    const outer = new ZipReader(new Uint8ArrayReader(bytes))
    const entries = (await outer.getEntries()) as FileEntry[]
    expect(entries.map((e) => e.filename)).toEqual(['notes.zip'])
    expect(entries[0].encrypted).toBe(true)
    await expect(entries[0].getData(new BlobWriter(), { password: 'wrong' })).rejects.toThrow()

    const innerBlob = await entries[0].getData(new BlobWriter(), { password: 'export-pass' })
    const inner = (await new ZipReader(new BlobReader(innerBlob)).getEntries()) as FileEntry[]
    expect(inner.map((e) => e.filename).sort()).toEqual(['Plain English with badchars.md', 'קניות (2).md', 'קניות.md'])
    const text = new TextDecoder().decode(await inner.find((e) => e.filename === 'קניות.md')!.getData(new Uint8ArrayWriter()))
    expect(text).toBe('# קניות\nחלב')
  })
})
