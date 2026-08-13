// Per-rule sub-analysis: searches ascending widths for the smallest one at which
// the space-time diagram is spatially uniform across horizontal chunks.
import type { AnalysisInitMode, RuleParts, SubAnalyzeOptions, SubAnalyzeResult } from '../../types/ca'
import { evolveRows } from './evolve'
import { buildPatternMap } from './patternMap'

/** Sums raw cell values per horizontal chunk. */
function cellChunkSums(rows: Uint8Array[], chunkWidth: number, numChunks: number): number[] {
  const chunkSums = new Array<number>(numChunks)
  for (let ci = 0; ci < numChunks; ci++) {
    const x0 = ci * chunkWidth
    const x1 = x0 + chunkWidth
    let sum = 0
    for (let r = 0; r < rows.length; r++) {
      const rowData = rows[r]
      for (let x = x0; x < x1; x++) {
        sum += rowData[x]
      }
    }
    chunkSums[ci] = sum
  }
  return chunkSums
}

/**
 * Weighs patterns by rarity per horizontal chunk. The kept rows are tiled into
 * M×M blocks exactly like the "convert to patterns" view; every block then
 * contributes `1 - count / maxCount`, so the most frequent (background) pattern
 * scores 0 and singleton patterns score close to 1. Returns null when the map is
 * too small to be split into at least two chunks.
 */
function patternChunkSums(
  rows: Uint8Array[],
  states: number,
  blockSize: number,
  chunkPercent: number,
): number[] | null {
  const map = buildPatternMap(rows, states, blockSize)
  if (map.cols < 2 || map.rows < 1) {
    return null
  }
  const chunkCols = Math.max(1, Math.round((chunkPercent / 100) * map.cols))
  const numChunks = Math.floor(map.cols / chunkCols)
  if (numChunks < 2) {
    return null
  }
  // Patterns are sorted by descending frequency, so patterns[0] is the most
  // common one and defines the reference count for the rarity weights.
  const maxCount = map.patterns[0]?.count || 1
  const weights = new Float64Array(map.patterns.length)
  for (let i = 0; i < map.patterns.length; i++) {
    weights[i] = 1 - map.patterns[i].count / maxCount
  }

  const chunkSums = new Array<number>(numChunks)
  for (let ci = 0; ci < numChunks; ci++) {
    const c0 = ci * chunkCols
    const c1 = c0 + chunkCols
    let sum = 0
    for (let by = 0; by < map.rows; by++) {
      const rowOffset = by * map.cols
      for (let bx = c0; bx < c1; bx++) {
        sum += weights[map.cellIndex[rowOffset + bx]]
      }
    }
    chunkSums[ci] = sum
  }
  return chunkSums
}

/**
 * Per-rule sub-analysis. Searches ascending widths for the smallest one at which
 * the pattern is spatially uniform: the sum of all cell values over the last K
 * rows, computed for every horizontal chunk (chunk width = N% of the width),
 * deviates from the mean chunk sum by at most R% for EVERY chunk.
 *
 * With `usePatterns` the chunk measure switches from raw cell values to the
 * rarity weight of the M×M patterns (frequent patterns ≈ 0, rare ones ≈ 1), so
 * uniformity is judged by structure composition rather than cell density.
 */
export function subAnalyzeRule(parts: RuleParts, options: SubAnalyzeOptions): SubAnalyzeResult {
  const keep = Math.max(1, Math.floor(options.keep))
  const chunkPercent = Math.max(0.1, Number(options.chunkPercent))
  const tolerance = Math.max(0, Number(options.tolerance)) / 100
  const height = Math.max(keep, Math.floor(options.height))
  const init: AnalysisInitMode = options.init === 'single' ? 'single' : 'random'
  const minWidth = Math.max(4, Math.floor(options.minWidth))
  const maxWidth = Math.max(minWidth, Math.floor(options.maxWidth))
  const step = Math.max(1, Math.floor(options.step))
  const usePatterns = options.usePatterns === true
  const patternSize = Math.max(1, Math.min(64, Math.floor(options.patternSize ?? 4)))

  let bestWidth: number | null = null
  let bestDev: number | null = null
  let tested = 0

  for (let width = minWidth; width <= maxWidth; width += step) {
    let chunkSums: number[] | null
    if (usePatterns) {
      const { rows, states } = evolveRows(parts, { width, height, keep, init })
      chunkSums = patternChunkSums(rows, states, patternSize, chunkPercent)
    } else {
      const chunkWidth = Math.max(1, Math.round((chunkPercent / 100) * width))
      const numChunks = Math.floor(width / chunkWidth)
      if (numChunks < 2) {
        continue
      }
      const { rows } = evolveRows(parts, { width, height, keep, init })
      chunkSums = cellChunkSums(rows, chunkWidth, numChunks)
    }
    if (!chunkSums) {
      continue
    }
    tested += 1

    const numChunks = chunkSums.length
    let grandTotal = 0
    for (let ci = 0; ci < numChunks; ci++) {
      grandTotal += chunkSums[ci]
    }

    const mean = grandTotal / numChunks
    let maxDev = 0
    if (mean > 0) {
      for (let ci = 0; ci < numChunks; ci++) {
        const dev = Math.abs(chunkSums[ci] - mean) / mean
        if (dev > maxDev) {
          maxDev = dev
        }
      }
    }

    if (bestDev === null || maxDev < bestDev) {
      bestDev = maxDev
      bestWidth = width
    }

    if (maxDev <= tolerance) {
      return { foundWidth: width, foundDev: maxDev, bestWidth: width, bestDev: maxDev, tested }
    }
  }

  return { foundWidth: null, foundDev: null, bestWidth, bestDev, tested }
}
