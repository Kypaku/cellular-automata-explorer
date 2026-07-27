// Pure, framework-agnostic classifier for one-dimensional cellular-automaton
// rules. Given a rule (totalistic code or explicit local rule) it evolves a
// W-wide row for up to H generations and assigns the rule one of the classes
// defined in constants/ca.ts (ANALYSIS_TAGS).
//
// The classification loosely follows Wolfram's four classes:
//   Dead     -> class 1 (homogeneous / extinction)
//   Fixed    -> class 2 (frozen still life: two equal rows in a row)
//   Periodic -> class 2 (repeating cycle of rows)
//   Stable   -> class 2 (constant live-cell count, pattern keeps drifting)
//   Chaotic  -> class 3 (sustained high-flux, space-filling activity)
//   Complex  -> class 4 (sparse localized persistent structures)
//   Undefined-> nothing conclusive within H generations
import { ANALYSIS_TAGS } from '../../constants/ca'
import { getConfig, totalisticTable, padRight, sanitizeStateString, normalizeStateCount, stateDigitFromCharCode } from '../caMath'
import type { AnalysisInitMode, ClassifyOptions, ClassifyResult, ClassifyStats, RuleParts } from '../../types/ca'
import { buildInitialRow, hashString, mulberry32 } from './shared'

// Fraction-of-cells-changed threshold above which behaviour is deemed chaotic.
const CHAOS_FLUX = 0.12
// Fill fraction below which persistent activity is deemed localized/complex.
const SPARSE_FILL = 0.14
// Fallback-statistics window = height / WINDOW_FRACTION (min 8 rows).
const WINDOW_FRACTION = 3

function makeResult(tag: string, stats: ClassifyStats): ClassifyResult {
  return { tag, stats }
}

/**
 * Classifies a single rule.
 */
export function classifyRule(parts: RuleParts, options: ClassifyOptions): ClassifyResult {
  const width = Math.max(8, Math.floor(options.width))
  const height = Math.max(8, Math.floor(options.height))
  const init: AnalysisInitMode = options.init === 'single' ? 'single' : 'random'
  const states = normalizeStateCount(parts.stateCount)
  const config = getConfig(states, parts.neighborhood, parts.depth)
  const radius = config.radius
  const depth = config.depth

  const sums = parts.mode === 'totalistic' ? totalisticTable(parts.code, states, config.neighborhood, config.depth) : null
  const ruleStr =
    parts.mode === 'totalistic'
      ? null
      : padRight(sanitizeStateString(parts.localRule, config.localDigits, states), config.localDigits)

  const seedSource = parts.mode === 'totalistic' ? parts.code >>> 0 : hashString(parts.localRule || '')
  const rand = mulberry32(Math.imul(seedSource + 1, 2654435761))

  let row = buildInitialRow(width, states, init, rand)
  let prevRow: Uint8Array | null = null
  // Rolling window of the last `depth` rows (oldest first). Prior rows are zeros
  // for single seeds and random rows for random seeds.
  const window: Uint8Array[] = []
  for (let i = 0; i < depth - 1; i++) {
    window.push(init === 'single' ? new Uint8Array(width) : buildInitialRow(width, states, 'random', rand))
  }
  window.push(row)
  const seen = new Map<string, number>()
  const densities = new Array<number>(height)
  const fluxes = new Array<number>(height)

  for (let y = 0; y < height; y++) {
    let live = 0
    const first = row[0]
    let uniform = true
    for (let x = 0; x < width; x++) {
      if (row[x] !== 0) live++
      if (row[x] !== first) uniform = false
    }
    densities[y] = live

    if (prevRow) {
      let diff = 0
      for (let x = 0; x < width; x++) {
        if (row[x] !== prevRow[x]) diff++
      }
      fluxes[y] = diff / width
    } else {
      fluxes[y] = 1
    }

    if (live === 0) {
      return makeResult(ANALYSIS_TAGS.DEAD, { reason: 'extinct', generation: y, period: 0, density: 0, flux: 0 })
    }
    if (uniform) {
      return makeResult(ANALYSIS_TAGS.DEAD, { reason: 'uniform', generation: y, period: 0, density: live, flux: 0 })
    }

    const key = String.fromCharCode.apply(null, Array.from(row))
    if (seen.has(key)) {
      const period = y - (seen.get(key) as number)
      const tag = period === 1 ? ANALYSIS_TAGS.FIXED : ANALYSIS_TAGS.PERIODIC
      return makeResult(tag, { reason: 'cycle', generation: y, period, density: live, flux: fluxes[y] })
    }
    seen.set(key, y)

    const next = new Uint8Array(width)
    for (let k = 0; k < width; k++) {
      if (sums) {
        let sum = 0
        for (let t = 0; t < depth; t++) {
          const r = window[t]
          for (let d = -radius; d <= radius; d++) {
            sum += r[(k + d + width) % width]
          }
        }
        next[k] = sums[sum]
      } else {
        let index = 0
        for (let t = 0; t < depth; t++) {
          const r = window[t]
          for (let d = -radius; d <= radius; d++) {
            index = index * states + r[(k + d + width) % width]
          }
        }
        const digit = stateDigitFromCharCode((ruleStr as string).charCodeAt(index))
        next[k] = digit >= 0 ? digit : 0
      }
    }
    prevRow = row
    row = next
    window.push(next)
    if (window.length > depth) {
      window.shift()
    }
  }

  // No exact repeat within H: fall back to statistics over the last window.
  const windowFraction = Number(options.windowFraction) > 0 ? Number(options.windowFraction) : WINDOW_FRACTION
  const chaosFlux = Number.isFinite(options.chaosFlux) ? (options.chaosFlux as number) : CHAOS_FLUX
  const sparseFill = Number.isFinite(options.sparseFill) ? (options.sparseFill as number) : SPARSE_FILL
  const windowSize = Math.max(8, Math.floor(height / windowFraction))
  const start = height - windowSize
  let minD = Infinity
  let maxD = -Infinity
  let sumD = 0
  let sumFlux = 0
  for (let y = start; y < height; y++) {
    const d = densities[y]
    if (d < minD) minD = d
    if (d > maxD) maxD = d
    sumD += d
    sumFlux += fluxes[y]
  }
  const meanDensity = sumD / windowSize
  const fill = meanDensity / width
  const densityRange = (maxD - minD) / width
  const avgFlux = sumFlux / windowSize

  let tag: string
  if (densityRange === 0) {
    tag = ANALYSIS_TAGS.STABLE
  } else if (avgFlux >= chaosFlux) {
    tag = ANALYSIS_TAGS.CHAOTIC
  } else if (fill <= sparseFill && avgFlux > 0) {
    tag = ANALYSIS_TAGS.COMPLEX
  } else {
    tag = ANALYSIS_TAGS.UNDEFINED
  }

  return makeResult(tag, {
    reason: 'window',
    generation: height,
    period: 0,
    density: Math.round(meanDensity),
    flux: avgFlux,
    fill,
  })
}
