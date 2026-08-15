// Deterministic seeded RNG (mulberry32). The seed lives in GameState so the
// host's rolls are reproducible and the whole game is replayable from a log.

export function nextSeed(seed: number): number {
  return (seed + 0x6d2b79f5) | 0
}

export function randomFrom(seed: number): { value: number; seed: number } {
  let t = (seed + 0x6d2b79f5) | 0
  let x = t
  x = Math.imul(x ^ (x >>> 15), x | 1)
  x ^= x + Math.imul(x ^ (x >>> 7), x | 61)
  const value = ((x ^ (x >>> 14)) >>> 0) / 4294967296
  return { value, seed: t }
}

/** Roll a d6. Returns the face and the advanced seed. */
export function d6(seed: number): { face: number; seed: number } {
  const r = randomFrom(seed)
  return { face: Math.floor(r.value * 6) + 1, seed: r.seed }
}

/** Fisher-Yates using the seeded stream. */
export function shuffle<T>(arr: T[], seed: number): { arr: T[]; seed: number } {
  const out = arr.slice()
  let s = seed
  for (let i = out.length - 1; i > 0; i--) {
    const r = randomFrom(s)
    s = r.seed
    const j = Math.floor(r.value * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return { arr: out, seed: s }
}

export function pick<T>(arr: T[], seed: number): { item: T | undefined; seed: number } {
  if (arr.length === 0) return { item: undefined, seed }
  const r = randomFrom(seed)
  return { item: arr[Math.floor(r.value * arr.length)], seed: r.seed }
}
