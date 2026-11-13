/**
 * Encrypted export, built entirely in memory — no plaintext file is ever written.
 *
 * Standard encrypted zips leave *file names* readable. Our file names are note titles, so the
 * export is nested: an inner (unencrypted, in-memory) zip with `Title.md` files, stored inside
 * an AES-256 encrypted outer zip whose only entry is `notes.zip`.
 */
import { Uint8ArrayReader, Uint8ArrayWriter, TextReader, ZipWriter, configure } from '@zip.js/zip.js'
import wasmURI from '@zip.js/zip.js/dist/zip-module.wasm?url'
import { noteTitle, safeFilename } from './notes'
import type { Note } from './vault'

// Serve zip.js' WASM from our own origin so the strict CSP (no data: fetches) is satisfied.
configure({ useWebWorkers: false, useCompressionStream: true, wasmURI })

export async function buildEncryptedExport(notes: Note[], password: string): Promise<Uint8Array<ArrayBuffer>> {
  const inner = new ZipWriter(new Uint8ArrayWriter())
  const used = new Set<string>()
  for (const note of notes) {
    const base = safeFilename(noteTitle(note))
    let name = base
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base} (${n})`
    used.add(name.toLowerCase())
    await inner.add(`${name}.md`, new TextReader(note.body), { lastModDate: new Date(note.updated) })
  }
  const innerBytes = await inner.close()

  const outer = new ZipWriter(new Uint8ArrayWriter(), { password, encryptionStrength: 3, zipCrypto: false })
  await outer.add('notes.zip', new Uint8ArrayReader(innerBytes), { level: 0 })
  const result = (await outer.close()) as Uint8Array<ArrayBuffer>
  innerBytes.fill(0)
  return result
}

export function exportFilename(): string {
  return `notes-export-${new Date().toISOString().slice(0, 10)}.zip`
}
