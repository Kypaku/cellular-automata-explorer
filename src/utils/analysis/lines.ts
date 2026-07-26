// "Lines" test (absence of lines): discards the transient top of the
// space-time diagram, reduces the remaining part to an M×M pattern map (exactly
// like the "convert to patterns" view) and looks for full-height lines whose
// pattern colour REPEATS WITH A TEMPORAL PERIOD p. A "line" runs the whole kept
// height (from the cut row y0 down to the bottom of the generation) and is
// either straight (vertical) or diagonal (either slant). A rule "has lines"
// (`hasLines`) when at least `lineCount` such lines share one direction; the
// pattern size M is grown from `minBlock` up to `maxBlock` until lines appear.
// Callers tag the rules where NO lines are ever found — i.e. the *absence* of
// lines.
//
// The period p exists because many rules blink: their background (and the
// domain walls running through it) repeat every p rows rather than staying
// identical, so a wall's block colour alternates down the map instead of being
// constant and a strict same-colour scan misses it entirely. For every p in
// 1..maxPeriod and every phase 0..p-1 the map is sub-sampled (only every p-th
// block-row is kept, starting at the phase) — in that slice the alternation
// disappears and the usual constant-colour scan works again. p = 1 (with phase
// 0) is the plain, non-periodic scan.
import type { AnalysisInitMode, LineDirection, LinesOptions, LinesResult, RuleParts } from '../../types/ca'
import { evolveRows } from './evolve'
import { buildPatternMap } from './patternMap'

export function detectLines(parts: RuleParts, options: LinesOptions): LinesResult {
  const width = Math.max(2, Math.floor(options.width))
  const height = Math.max(1, Math.floor(options.height))
  const init: AnalysisInitMode = options.init === 'single' ? 'single' : 'random'
  const cutFraction = Math.max(0, Math.min(90, Number(options.cutTop))) / 100
  const minBlock = Math.max(1, Math.floor(options.minBlock))
  const maxBlock = Math.max(minBlock, Math.floor(options.maxBlock))
  const blockStep = Math.max(1, Math.floor(options.blockStep))
  const lineCount = Math.max(1, Math.floor(options.lineCount))
  const ignoreBackground = options.ignoreBackground !== false
  const maxPeriod = Math.max(1, Math.floor(options.maxPeriod ?? 1))
  const maxDrift = Math.max(1, Math.floor(options.maxDrift ?? 1))

  const { rows, states } = evolveRows(parts, { width, height, keep: height, init })

  // Cut off the transient top: keep everything from y0 = cutFraction·H to the bottom.
  const startRow = Math.min(height - 1, Math.floor(height * cutFraction))
  const kept = rows.slice(startRow)

  let hasLines = false
  let direction: LineDirection | null = null
  let bestCount = 0
  let bestBlock = minBlock
  let bestPeriod = 1

  for (let M = minBlock; M <= maxBlock && !hasLines; M += blockStep) {
    const map = buildPatternMap(kept, states, M)
    const cols = map.cols
    const blockRows = map.rows
    bestBlock = M
    // A meaningful full-height line needs at least a couple of block-rows.
    if (blockRows < 2 || cols < 1) {
      continue
    }
    const cell = map.cellIndex

    for (let period = 1; period <= maxPeriod && !hasLines; period++) {
      for (let phase = 0; phase < period && !hasLines; phase++) {
        const sliceRows = Math.ceil((blockRows - phase) / period)
        if (sliceRows < 2) {
          continue
        }
        const slice = takePhaseSlice(cell, cols, blockRows, period, phase, sliceRows)
        // The dominant pattern of THIS slice is the background. It has to be
        // recomputed per phase: when p does not divide the blink period the
        // background itself splits between the phases, so the globally most
        // frequent pattern (index 0) may not be the background of the slice.
        const bg = ignoreBackground ? dominantPattern(slice, map.patterns.length) : -1

        // Full-height straight lines: a column whose pattern is constant top→bottom.
        const vertical = countVerticalLines(slice, cols, sliceRows, bg)

        // Full-height diagonal lines of ANY slope. A diagonal line is a connected
        // streak of one pattern colour that touches both the top kept row and the
        // bottom one and drifts sideways (so it is genuinely slanted, not a vertical
        // column). Cells are grouped 8-connected — the next cell of a line may be to
        // the side, below, or diagonally below/adjacent — so slopes from nearly
        // vertical to nearly horizontal are all captured, and each streak (however
        // thick) is counted once.
        const diagonal = countDiagonalStreaks(slice, cols, sliceRows, bg, maxDrift)

        const localBest = Math.max(vertical, diagonal)
        if (localBest > bestCount) {
          bestCount = localBest
          bestPeriod = period
          direction = vertical >= diagonal ? 'vertical' : 'diagonal'
        }

        if (vertical >= lineCount || diagonal >= lineCount) {
          hasLines = true
          bestCount = localBest
          bestPeriod = period
          direction = vertical >= diagonal ? 'vertical' : 'diagonal'
        }
      }
    }
  }

  return { hasLines, direction, lineCount: bestCount, blockSize: bestBlock, period: bestPeriod }
}

/**
 * Extracts every `period`-th block-row of the map, starting at `phase`. For
 * period 1 / phase 0 this is the whole map, so the periodic scan degenerates
 * into the plain one.
 */
function takePhaseSlice(
  cell: Int32Array,
  cols: number,
  blockRows: number,
  period: number,
  phase: number,
  sliceRows: number
): Int32Array {
  if (period === 1 && phase === 0 && sliceRows === blockRows) {
    return cell
  }
  const slice = new Int32Array(cols * sliceRows)
  for (let i = 0; i < sliceRows; i++) {
    const from = (phase + i * period) * cols
    slice.set(cell.subarray(from, from + cols), i * cols)
  }
  return slice
}

/** Index of the most frequent pattern inside `slice` (its background). */
function dominantPattern(slice: Int32Array, patternCount: number): number {
  const freq = new Int32Array(patternCount)
  for (let i = 0; i < slice.length; i++) {
    freq[slice[i]] += 1
  }
  let best = 0
  for (let i = 1; i < freq.length; i++) {
    if (freq[i] > freq[best]) {
      best = i
    }
  }
  return best
}

/** Counts columns whose (non-background) pattern is constant top→bottom. */
function countVerticalLines(cell: Int32Array, cols: number, blockRows: number, bg: number): number {
  let vertical = 0
  for (let bx = 0; bx < cols; bx++) {
    const p = cell[bx]
    if (p === bg) {
      continue
    }
    let ok = true
    for (let by = 1; by < blockRows; by++) {
      if (cell[by * cols + bx] !== p) {
        ok = false
        break
      }
    }
    if (ok) {
      vertical += 1
    }
  }
  return vertical
}

/**
 * Counts full-height diagonal lines of ANY slope. Each maximal 8-connected group
 * of same-colour (non-background) blocks is a candidate "streak"; it is counted
 * as one diagonal line when it touches both the top and the bottom kept row and
 * spans more than one column (so it slants rather than standing vertically — a
 * 1-column vertical line has zero drift and is handled by the vertical scan
 * instead). 8-connectivity means a line may continue to the side, below or
 * diagonally, which lets it take any slope from near-vertical to near-horizontal;
 * grouping into components makes each streak count once regardless of thickness.
 * `maxDrift` widens the sideways reach of that connectivity (1 = plain
 * 8-connectivity), which matters on a phase-sliced map where the line skips
 * `period` block-rows at a time and can therefore drift further per step.
 */
function countDiagonalStreaks(
  cell: Int32Array,
  cols: number,
  blockRows: number,
  bg: number,
  maxDrift: number
): number {
  const total = cols * blockRows
  const visited = new Uint8Array(total)
  const stack: number[] = []
  const bottom = blockRows - 1
  let count = 0

  for (let start = 0; start < total; start++) {
    if (visited[start]) {
      continue
    }
    const p = cell[start]
    visited[start] = 1
    if (p === bg) {
      continue
    }
    stack.length = 0
    stack.push(start)
    let touchesTop = false
    let touchesBottom = false
    let minC = cols
    let maxC = -1
    while (stack.length) {
      const idx = stack.pop() as number
      const r = (idx / cols) | 0
      const c = idx - r * cols
      if (r === 0) {
        touchesTop = true
      }
      if (r === bottom) {
        touchesBottom = true
      }
      if (c < minC) {
        minC = c
      }
      if (c > maxC) {
        maxC = c
      }
      for (let dr = -1; dr <= 1; dr++) {
        const nr = r + dr
        if (nr < 0 || nr >= blockRows) {
          continue
        }
        for (let dc = -maxDrift; dc <= maxDrift; dc++) {
          if (dr === 0 && dc === 0) {
            continue
          }
          const nc = c + dc
          if (nc < 0 || nc >= cols) {
            continue
          }
          const nIdx = nr * cols + nc
          if (!visited[nIdx] && cell[nIdx] === p) {
            visited[nIdx] = 1
            stack.push(nIdx)
          }
        }
      }
    }
    if (touchesTop && touchesBottom && maxC > minC) {
      count += 1
    }
  }
  return count
}
