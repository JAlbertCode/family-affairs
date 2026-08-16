/**
 * Fit a picture to the deck.
 *
 * Every card in the base game is a 600x900 webp, cover-fitted and centre
 * cropped, and the pack format has to carry its art inside itself - there is
 * no server to upload to and a pack that references files somebody else does
 * not have is a pack of grey rectangles. So the image becomes a data URL and
 * travels with the card.
 *
 * That makes size a real constraint rather than a nicety. A phone photo is
 * three megabytes; base64 adds a third again; and the whole pack has to fit
 * through a WebRTC data channel to five other people. Cropping to 600x900 and
 * re-encoding as webp puts a portrait at roughly 120KB, which is a pack of
 * twenty for under three megabytes.
 */
const W = 600
const H = 900

export async function fitArt(file: File, quality = 0.82): Promise<string> {
  const bitmap = await loadBitmap(file)
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no canvas')

  // Cover fit: fill the frame on the shorter side, then centre crop. Matches
  // what the base deck's art went through, so a pack card sits next to a
  // shipped one without looking like it came from somewhere else.
  const s = Math.max(W / bitmap.width, H / bitmap.height)
  const dw = bitmap.width * s
  const dh = bitmap.height * s
  ctx.drawImage(bitmap, (W - dw) / 2, (H - dh) / 2, dw, dh)

  // webp where the browser has it, jpeg as the fallback. Not png: a photo as
  // png is four times the size and there is no transparency to preserve.
  const webp = canvas.toDataURL('image/webp', quality)
  if (webp.startsWith('data:image/webp')) return webp
  return canvas.toDataURL('image/jpeg', quality)
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file) } catch { /* fall through */ }
  }
  return await new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('bad image'))
    img.src = URL.createObjectURL(file)
  })
}

/** Art may be a filename in the shipped deck or a data URL from a pack. */
export function artSrc(art?: string): string | undefined {
  if (!art) return undefined
  if (art.startsWith('data:') || art.startsWith('http')) return art
  return `${import.meta.env.BASE_URL}art/${art}`
}
