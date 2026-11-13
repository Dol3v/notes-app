// Generates the PWA PNG icons with no image dependencies (tiny PNG encoder + 4x supersampling).
import { writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const BG = [79, 70, 229], PAGE = [255, 255, 255], LINE = [79, 70, 229]

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buf) => { let c = ~0; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return ~c >>> 0 }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
function png(size, pixel) {
  const raw = Buffer.alloc(size * (size * 4 + 1))
  const S = 4
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    for (let x = 0; x < size; x++) {
      const acc = [0, 0, 0, 0]
      for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
        const p = pixel((x + (sx + 0.5) / S) / size, (y + (sy + 0.5) / S) / size)
        for (let i = 0; i < 4; i++) acc[i] += p[i]
      }
      const o = y * (size * 4 + 1) + 1 + x * 4
      for (let i = 0; i < 4; i++) raw[o + i] = Math.round(acc[i] / (S * S))
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}
const inRoundRect = (x, y, x0, y0, x1, y1, r) => {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false
  const cx = Math.min(Math.max(x, x0 + r), x1 - r), cy = Math.min(Math.max(y, y0 + r), y1 - r)
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r
}
// A page with right-aligned text lines (RTL!) on an indigo tile. `s` scales content toward the center.
function design(maskable) {
  const s = maskable ? 0.72 : 1
  const t = (v) => 0.5 + (v - 0.5) * s
  return (x, y) => {
    const bgOn = maskable || inRoundRect(x, y, 0, 0, 1, 1, 0.22)
    if (!bgOn) return [0, 0, 0, 0]
    if (inRoundRect(x, y, t(0.25), t(0.18), t(0.75), t(0.82), 0.06 * s)) {
      const lines = [[0.33, 0.36], [0.33, 0.48], [0.45, 0.60], [0.38, 0.72]]
      for (const [startX, ly] of lines) if (inRoundRect(x, y, t(startX), t(ly - 0.03), t(0.67), t(ly + 0.03), 0.03 * s)) return [...LINE, 255]
      return [...PAGE, 255]
    }
    return [...BG, 255]
  }
}
writeFileSync('public/icon-192.png', png(192, design(false)))
writeFileSync('public/icon-512.png', png(512, design(false)))
writeFileSync('public/icon-maskable-512.png', png(512, design(true)))
console.log('icons written')
