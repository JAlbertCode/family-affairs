// Generates the PWA icons at build time with no image dependencies, so no
// binaries live in the repo and CI reproduces them exactly.
// Minimal PNG encoder: raw RGBA scanlines -> zlib -> IHDR/IDAT/IEND.
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const crcTable = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let c = -1
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

function png(size, paint) {
  const px = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = paint(x, y, size)
      const o = (y * size + x) * 4
      px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = a
    }
  }
  // each scanline gets a leading filter byte (0 = none)
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8   // bit depth
  ihdr[9] = 6   // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const BG = [18, 8, 15]
const PINK = [255, 95, 162]
const GOLD = [240, 180, 41]
const PLUM = [70, 22, 58]

// A rounded plum tile, a warm glow, and three offset bars — one per family
// slot (LEFT / CENTER / RIGHT), pink over gold.
function paint(x, y, s) {
  const u = x / s, v = y / s
  const r = 0.18
  const inTile = (() => {
    const cx = Math.min(Math.max(u, r), 1 - r)
    const cy = Math.min(Math.max(v, r), 1 - r)
    return (u - cx) ** 2 + (v - cy) ** 2 <= r * r
  })()
  if (!inTile) return [0, 0, 0, 0]

  const d = Math.hypot(u - 0.5, v - 0.42)
  const glow = Math.max(0, 1 - d * 1.9)
  let col = [
    BG[0] + (PLUM[0] - BG[0]) * glow,
    BG[1] + (PLUM[1] - BG[1]) * glow,
    BG[2] + (PLUM[2] - BG[2]) * glow,
  ]

  // three slanted bars
  const bars = [
    { c: 0.30, w: 0.085, col: GOLD },
    { c: 0.50, w: 0.105, col: PINK },
    { c: 0.70, w: 0.085, col: GOLD },
  ]
  const slant = (v - 0.5) * 0.22
  for (const b of bars) {
    if (Math.abs(u - (b.c + slant)) < b.w / 2 && v > 0.20 && v < 0.80) col = b.col
  }
  return [Math.round(col[0]), Math.round(col[1]), Math.round(col[2]), 255]
}

for (const [size, path] of [
  [192, 'public/icons/icon-192.png'],
  [512, 'public/icons/icon-512.png'],
  [180, 'public/icons/apple-touch-icon.png'],
]) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, png(size, paint))
  console.log('wrote', path)
}
