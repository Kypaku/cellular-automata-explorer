// Large-scale, memory-friendly PNG exporter for the space-time diagram.
//
// The interactive explorer (caRender.ts) paints every cell with a `fillRect`
// call at CA_PIXEL_SIZE (3) canvas pixels per cell — fine for a few hundred
// rows, but a <canvas> has a hard size cap (per side and per area) so a
// 10000×10000 field simply can't be drawn/exported through it.
//
// PNG the *format* has no such limit, so instead of going through a canvas we
// encode the PNG ourselves, streaming one scanline at a time:
//   • evolve the automaton row by row (never hold more than the current row),
//   • deflate the filtered scanlines with the browser's `CompressionStream`
//     ('deflate' == zlib, exactly what a PNG IDAT chunk expects),
//   • assemble signature + IHDR + IDAT + IEND into a Blob.
// This keeps memory to ~one row plus the compressed output and sidesteps the
// canvas size limit entirely. Supports both up-scaling (N pixels per cell) and
// down-scaling (N cells per pixel), the latter being what large fields need.
import { statePalette } from '../constants/ca'
import { evolveStep } from './caRender'
import type { StochasticTable } from './caRuleJson'
import type { CaConfig, CollisionMode, RuleMode } from '../types/ca'

// Above roughly this per-side size a browser can no longer *display* the
// resulting <img> (decode limit), even though the PNG file itself is valid and
// downloads fine. Used only to decide whether to show an inline preview.
export const MAX_PREVIEW_SIDE = 16384

/**
 * Immutable inputs describing the current rule, produced by the explorer
 * composable so an off-screen render can reproduce it at any size without
 * touching the interactive canvas.
 */
export interface RenderContext {
  config: CaConfig
  mode: RuleMode
  sums: number[] | null
  explicitRule: string
  emission?: number[] | null
  collisionMode?: CollisionMode
  collisionFixed?: number
  noiseP: number
  /** Local mode: neighborhood index → states to draw from at random, else null. */
  stochastic?: StochasticTable | null
  /** Filesystem-safe label describing the current rule (e.g. "3s-totalistic-12345"), used to name exported files. */
  ruleLabel: string
  /** Builds the initial row for the requested width using the current init/seed. */
  makeInitialRow: (width: number) => Uint8Array
  /** Builds the `depth - 1` prehistory rows above the initial row (multi-row rules only). */
  makePriorRows?: (width: number) => Uint8Array[]
}

export interface PngDiagramParams {
  /** Cells per row. */
  width: number
  /** Number of generations (rows). */
  height: number
  config: CaConfig
  mode: RuleMode
  sums: number[] | null
  explicitRule: string
  emission?: number[] | null
  collisionMode?: CollisionMode
  collisionFixed?: number
  noiseP: number
  /** Local mode: neighborhood index → states to draw from at random, else null. */
  stochastic?: StochasticTable | null
  initialRow: Uint8Array
  /** The `depth - 1` prehistory rows above the initial row (multi-row rules only), oldest → newest. */
  priorRows?: Uint8Array[]
  /** Scale factor (>= 1). Its meaning depends on `downscale`. */
  cellSize: number
  /** false: `cellSize` pixels per cell (enlarge). true: `cellSize` cells per pixel (shrink). */
  downscale: boolean
}

/** Output pixel dimensions for the given cell dimensions + scale mode. */
export function outputSize(
  width: number,
  height: number,
  cellSize: number,
  downscale: boolean
): { outWidth: number; outHeight: number } {
  const factor = Math.max(1, Math.floor(cellSize))
  return downscale
    ? { outWidth: Math.ceil(width / factor), outHeight: Math.ceil(height / factor) }
    : { outWidth: width * factor, outHeight: height * factor }
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

/** Builds a length-prefixed, CRC-suffixed PNG chunk. */
function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  for (let i = 0; i < 4; i++) {
    out[4 + i] = type.charCodeAt(i)
  }
  out.set(data, 8)
  const crcInput = out.subarray(4, 8 + data.length) // type + data
  view.setUint32(8 + data.length, crc32(crcInput))
  return out
}

function hexToRgb(hex: string): [number, number, number] {
  const value = parseInt(hex.slice(1), 16)
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff]
}

/** Reads a ReadableStream of byte chunks fully into one contiguous buffer. */
async function readAll(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }
    chunks.push(value)
    total += value.length
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out
}

/**
 * Renders the full `height`×`width` diagram straight into a PNG Blob, without
 * ever allocating a canvas — so the only ceiling is available memory, not the
 * browser's canvas size cap. Returns an 8-bit RGB PNG.
 */
export async function renderDiagramToPngBlob(params: PngDiagramParams): Promise<Blob> {
  if (typeof CompressionStream === 'undefined') {
    throw new Error('this browser lacks CompressionStream (needed for direct PNG export)')
  }
  const { width, height, config, mode, sums, explicitRule, emission, collisionMode, collisionFixed, noiseP, stochastic, initialRow, cellSize, downscale } =
    params
  const factor = Math.max(1, Math.floor(cellSize))
  const { outWidth, outHeight } = outputSize(width, height, factor, downscale)

  const palette = statePalette(config.states).map(hexToRgb)
  const stride = outWidth * 3
  // Reused scanline buffer: 1 filter byte (0 = "none") + RGB pixels.
  const scan = new Uint8Array(1 + stride)

  function fillScanline(row: Uint8Array): void {
    let p = 1
    if (downscale) {
      for (let ox = 0; ox < outWidth; ox++) {
        const rgb = palette[row[Math.min(width - 1, ox * factor)]] ?? palette[0]
        scan[p++] = rgb[0]
        scan[p++] = rgb[1]
        scan[p++] = rgb[2]
      }
    } else {
      for (let x = 0; x < width; x++) {
        const rgb = palette[row[x]] ?? palette[0]
        for (let s = 0; s < factor; s++) {
          scan[p++] = rgb[0]
          scan[p++] = rgb[1]
          scan[p++] = rgb[2]
        }
      }
    }
  }

  const compressor = new CompressionStream('deflate')
  const writer = compressor.writable.getWriter()
  // Drain the compressed side concurrently so the writer doesn't deadlock on
  // backpressure while we keep feeding scanlines.
  const compressedPromise = readAll(compressor.readable)

  // Rolling window of the last `depth` rows (oldest → newest): prehistory rows
  // above the diagram, then the visible initial row on top.
  const priors = params.priorRows || []
  const window: Uint8Array[] = []
  for (let i = 0; i < config.depth - 1; i++) {
    window.push(priors[i] || new Uint8Array(width))
  }
  window.push(initialRow)

  for (let y = 0; y < height; y++) {
    const row = window[window.length - 1]
    const emit = downscale ? y % factor === 0 : true
    if (emit) {
      fillScanline(row)
      // Down-scale writes one scanline per sampled row; up-scale repeats each
      // source row `factor` times to grow it vertically.
      const copies = downscale ? 1 : factor
      for (let s = 0; s < copies; s++) {
        await writer.write(scan.slice())
      }
    }
    const next = evolveStep(window, width, config, mode, sums, explicitRule, noiseP, emission, collisionMode, collisionFixed, stochastic)
    window.push(next)
    window.shift()
  }
  await writer.close()
  const compressed = await compressedPromise

  const ihdr = new Uint8Array(13)
  const ihdrView = new DataView(ihdr.buffer)
  ihdrView.setUint32(0, outWidth)
  ihdrView.setUint32(4, outHeight)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // colour type 2 = truecolour RGB
  // ihdr[10..12] compression/filter/interlace = 0 (already zero-filled)

  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
  return new Blob(
    [signature, pngChunk('IHDR', ihdr), pngChunk('IDAT', compressed), pngChunk('IEND', new Uint8Array(0))],
    { type: 'image/png' }
  )
}
