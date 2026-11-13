export type Bytes = Uint8Array<ArrayBuffer>

const encoder = new TextEncoder()
const decoder = new TextDecoder()

export function utf8(s: string): Bytes {
  return encoder.encode(s) as Bytes
}

export function fromUtf8(b: Uint8Array): string {
  return decoder.decode(b)
}

export function concat(...parts: Uint8Array[]): Bytes {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let off = 0
  for (const p of parts) {
    out.set(p, off)
    off += p.length
  }
  return out
}

export function randomBytes(n: number): Bytes {
  return crypto.getRandomValues(new Uint8Array(n))
}

export function toHex(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
}

export function toBase64(b: Uint8Array): string {
  let s = ''
  for (let i = 0; i < b.length; i += 0x8000) {
    s += String.fromCharCode(...b.subarray(i, i + 0x8000))
  }
  return btoa(s)
}

export function fromBase64(s: string): Bytes {
  const bin = atob(s.replace(/\s+/g, ''))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** SHA-1 of a git blob object, identical to what `git hash-object` / GitHub report. */
export async function gitBlobSha(content: Uint8Array): Promise<string> {
  const header = utf8(`blob ${content.length}\0`)
  const digest = await crypto.subtle.digest('SHA-1', concat(header, content))
  return toHex(new Uint8Array(digest))
}
