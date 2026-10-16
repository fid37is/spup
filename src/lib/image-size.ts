// src/lib/image-size.ts
//
// Reads the pixel size of a JPEG / PNG / GIF / WebP straight from the file header, with
// no image library (the server runs on Cloudflare Workers, where native libraries
// like sharp are not available). Returns null when the bytes are not one of those.

export interface ImageSize { width: number; height: number }

export function imageSize(b: Uint8Array): ImageSize | null {
  if (b.length < 12) return null
  const u16be = (o: number) => (b[o] << 8) | b[o + 1]
  const u16le = (o: number) => b[o] | (b[o + 1] << 8)
  const u24le = (o: number) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)
  const u32be = (o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0

  // PNG: 8-byte signature, then the IHDR chunk holds width and height.
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b.length >= 24) {
    return ok(u32be(16), u32be(20))
  }

  // GIF: "GIF8", then little-endian width and height.
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38 && b.length >= 10) {
    return ok(u16le(6), u16le(8))
  }

  // JPEG: walk the segments until a "start of frame" marker.
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue }
      const marker = b[i + 1]
      if (marker === 0xff) { i++; continue }
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) { i += 2; continue }
      const len = u16be(i + 2)
      const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
      if (isSof) return ok(u16be(i + 7), u16be(i + 5))
      i += 2 + len
    }
    return null
  }

  // WebP: "RIFF....WEBP" then a VP8 / VP8L / VP8X chunk.
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50 && b.length >= 30) {
    const chunk = String.fromCharCode(b[12], b[13], b[14], b[15])
    if (chunk === 'VP8 ') return ok(u16le(26) & 0x3fff, u16le(28) & 0x3fff)
    if (chunk === 'VP8L') {
      const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24)
      return ok((bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1)
    }
    if (chunk === 'VP8X') return ok(u24le(24) + 1, u24le(27) + 1)
  }
  return null
}

function ok(width: number, height: number): ImageSize | null {
  return width > 0 && height > 0 && width < 65536 && height < 65536 ? { width, height } : null
}
