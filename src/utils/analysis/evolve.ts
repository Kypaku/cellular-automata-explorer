// Evolves a rule and returns the last `keep` rows of the space-time diagram.
import {
  getConfig,
  totalisticTable,
  padRight,
  sanitizeStateString,
  normalizeStateCount,
  emissionTable,
  clampCollisionFixed,
  stateDigitFromCharCode,
} from '../caMath'
import type { AnalysisInitMode, CollisionMode, EvolveOptions, EvolveResult, RuleParts } from '../../types/ca'
import { buildInitialRow, hashString, mulberry32 } from './shared'

/**
 * Evolves a rule and returns the last `keep` rows of the space-time diagram.
 * Deterministic per rule (noise is ignored) so results are reproducible.
 */
export function evolveRows(parts: RuleParts, options: EvolveOptions): EvolveResult {
  const width = Math.max(2, Math.floor(options.width))
  const height = Math.max(1, Math.floor(options.height))
  const keep = Math.max(1, Math.min(height, Math.floor(options.keep || height)))
  const init: AnalysisInitMode = options.init === 'single' ? 'single' : 'random'
  const states = normalizeStateCount(parts.stateCount)
  const config = getConfig(states, parts.neighborhood, parts.depth)
  const radius = config.radius
  const depth = config.depth

  const sums = parts.mode === 'totalistic' ? totalisticTable(parts.code, states, config.neighborhood, config.depth) : null
  const ruleStr =
    parts.mode === 'local'
      ? padRight(sanitizeStateString(parts.localRule, config.localDigits, states), config.localDigits)
      : null

  // Descendants: emission triple per live state + collision resolution matching
  // whatever the user selected in the rule settings.
  const emission = parts.mode === 'descendants' ? emissionTable(parts.emissionRule || '', states) : null
  const collisionMode: CollisionMode = parts.collisionMode || 'sum'
  const collisionFixed = clampCollisionFixed(parts.collisionFixed ?? 0, states)

  const seedSource =
    parts.mode === 'totalistic'
      ? parts.code >>> 0
      : parts.mode === 'descendants'
        ? hashString(`${parts.emissionRule || ''}|${collisionMode}|${collisionFixed}`)
        : hashString(parts.localRule || '')
  const rand = mulberry32(Math.imul(seedSource + 1, 2654435761))

  let row = buildInitialRow(width, states, init, rand)
  const rows: Uint8Array[] = []
  const firstKept = height - keep

  // Rolling window of the last `depth` rows (oldest first, newest last). Prior
  // rows above the diagram are zeros for single-cell seeds and random rows for
  // random seeds, matching the interactive renderer.
  const window: Uint8Array[] = []
  for (let i = 0; i < depth - 1; i++) {
    window.push(init === 'single' ? new Uint8Array(width) : buildInitialRow(width, states, 'random', rand))
  }
  window.push(row)

  for (let y = 0; y < height; y++) {
    const cur = window[window.length - 1]
    if (y >= firstKept) {
      rows.push(cur.slice())
    }
    if (y === height - 1) {
      break
    }
    const next = new Uint8Array(width)
    for (let k = 0; k < width; k++) {
      const left = cur[(k - 1 + width) % width]
      const center = cur[k]
      const right = cur[(k + 1) % width]
      if (sums) {
        let sum = 0
        for (let t = 0; t < depth; t++) {
          const r = window[t]
          for (let d = -radius; d <= radius; d++) {
            sum += r[(k + d + width) % width]
          }
        }
        next[k] = sums[sum]
      } else if (ruleStr) {
        let index = 0
        for (let t = 0; t < depth; t++) {
          const r = window[t]
          for (let d = -radius; d <= radius; d++) {
            index = index * states + r[(k + d + width) % width]
          }
        }
        const digit = stateDigitFromCharCode(ruleStr.charCodeAt(index))
        next[k] = digit >= 0 ? digit : 0
      } else {
        const em = emission as number[]
        const a = left === 0 ? 0 : em[(left - 1) * 3 + 2]
        const b = center === 0 ? 0 : em[(center - 1) * 3 + 1]
        const c = right === 0 ? 0 : em[(right - 1) * 3 + 0]
        next[k] = resolveCollision(a, b, c, states, collisionMode, collisionFixed, rand)
      }
    }
    window.push(next)
    window.shift()
  }
  return { rows, states }
}

/**
 * Merges up to three emitted contributions (0 = no emission) into a single
 * child state, mirroring the interactive renderer. No live signal → 0; a single
 * live signal passes through; 2+ live signals collide and are resolved by
 * `mode`: sum → (a+b+c) mod states, random → a random state (seeded here for
 * reproducible analysis), fixed → `fixed`.
 */
function resolveCollision(
  a: number,
  b: number,
  c: number,
  states: number,
  mode: CollisionMode,
  fixed: number,
  rand: () => number
): number {
  let live = 0
  let single = 0
  if (a) {
    live++
    single = a
  }
  if (b) {
    live++
    single = b
  }
  if (c) {
    live++
    single = c
  }
  if (live === 0) {
    return 0
  }
  if (live === 1) {
    return single
  }
  if (mode === 'sum') {
    return (a + b + c) % states
  }
  if (mode === 'fixed') {
    return fixed
  }
  return Math.floor(rand() * states)
}
