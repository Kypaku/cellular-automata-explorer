// Pure canvas rendering + evolution for the explorer's space-time diagram.
// Kept framework-agnostic so useCellularAutomaton only wires reactive state to it.
import { CA_COLORS, CA_PIXEL_SIZE } from '../constants/ca'
import { sanitizeStateString } from './caMath'
import type { CaConfig, CollisionMode, InitMode, RuleMode } from '../types/ca'

/** Builds the first row from the chosen init mode (single / random / custom seed). */
export function buildInitialRow(
  width: number,
  config: CaConfig,
  stateCount: number,
  init: InitMode,
  seedInput: string
): Uint8Array {
  const row = new Uint8Array(width)
  if (init === 'single') {
    row[Math.floor(width / 2)] = 1
    return row
  }
  if (init === 'custom') {
    const seed = sanitizeStateString(seedInput, width, stateCount)
    if (!seed.length) {
      row[Math.floor(width / 2)] = 1
      return row
    }
    const offset = Math.max(0, Math.floor((width - seed.length) / 2))
    for (let i = 0; i < seed.length && i < width; i++) {
      row[offset + i] = seed.charCodeAt(i) - 48
    }
    return row
  }
  for (let j = 0; j < width; j++) {
    row[j] = Math.floor(Math.random() * config.states)
  }
  return row
}

export interface RenderDiagramParams {
  ctx: CanvasRenderingContext2D
  width: number
  height: number
  config: CaConfig
  mode: RuleMode
  /** Totalistic sum → state table (mode === 'totalistic'), else null. */
  sums: number[] | null
  /** Explicit local rule string (mode === 'local'), else ''. */
  explicitRule: string
  /** Emission lookup of length `3 * (states - 1)` (mode === 'descendants'), else null. */
  emission?: number[] | null
  /** How colliding signals are merged (mode === 'descendants'). */
  collisionMode?: CollisionMode
  /** Constant used when `collisionMode === 'fixed'`. */
  collisionFixed?: number
  /** Fraction 0..1 of cells forced to a rule-defying value each step. */
  noiseP: number
  initialRow: Uint8Array
  /**
   * The `depth - 1` rows that sit ABOVE the initial row (the "prehistory"),
   * ordered oldest → newest. Used only when `config.depth > 1`; missing entries
   * default to an empty (all-zero) row.
   */
  priorRows?: Uint8Array[]
}

/**
 * Computes the next row from the recent history using the shared
 * totalistic/local/descendants rule + noise logic. `history` holds the last
 * `config.depth` rows, ordered oldest → newest (so `history[history.length - 1]`
 * is the current row). Totalistic sums, and local encodes as a base-`states`
 * index, all `config.neighborhood` cells across every one of those `depth`
 * rows; descendants mode only ever reads the current (newest) row.
 */
export function evolveStep(
  history: Uint8Array[],
  width: number,
  config: CaConfig,
  mode: RuleMode,
  sums: number[] | null,
  explicitRule: string,
  noiseP: number,
  emission?: number[] | null,
  collisionMode?: CollisionMode,
  collisionFixed?: number
): Uint8Array {
  const nextRow = new Uint8Array(width)
  const states = config.states
  const radius = config.radius
  const depth = config.depth
  const base = history.length - depth
  const cur = history[history.length - 1]
  const merge: CollisionMode = collisionMode || 'sum'
  const fixed = collisionFixed || 0
  for (let k = 0; k < width; k++) {
    let value: number
    if (mode === 'totalistic') {
      // Sum the `neighborhood` cells centered on k across the last `depth` rows.
      let sum = 0
      for (let t = 0; t < depth; t++) {
        const rowT = history[base + t] || cur
        for (let d = -radius; d <= radius; d++) {
          sum += rowT[(k + d + width) % width]
        }
      }
      value = (sums as number[])[sum]
    } else if (mode === 'local') {
      // Encode the `neighborhood * depth` cells (oldest row first, leftmost cell
      // most-significant) as a base-`states` index into the local rule string.
      let index = 0
      for (let t = 0; t < depth; t++) {
        const rowT = history[base + t] || cur
        for (let d = -radius; d <= radius; d++) {
          index = index * states + rowT[(k + d + width) % width]
        }
      }
      const ch = explicitRule.charCodeAt(index)
      // Unfilled / out-of-range neighborhoods (e.g. an un-materialized huge rule) are state 0.
      value = ch >= 48 ? ch - 48 : 0
    } else {
      // Descendants: each child gathers up to 3 emitted contributions from the
      // current row. Background (state 0) emits nothing; a live parent's triple
      // lives at (state-1)*3 in `emission`. a = right-child of the left parent,
      // b = center-child of the center parent, c = left-child of the right parent.
      const left = cur[(k - 1 + width) % width]
      const center = cur[k]
      const right = cur[(k + 1) % width]
      const em = emission as number[]
      const a = left === 0 ? 0 : em[(left - 1) * 3 + 2]
      const b = center === 0 ? 0 : em[(center - 1) * 3 + 1]
      const c = right === 0 ? 0 : em[(right - 1) * 3 + 0]
      value = resolveCollision(a, b, c, states, merge, fixed)
    }
    if (noiseP > 0 && Math.random() < noiseP) {
      // Force a value different from the one the rule dictates, so the
      // deviation is guaranteed to go "against" the rule, not just be noisy.
      let deviation = Math.floor(Math.random() * (config.states - 1))
      if (deviation >= value) {
        deviation += 1
      }
      value = deviation
    }
    nextRow[k] = value
  }
  return nextRow
}

/**
 * Merges up to three emitted contributions (0 = no emission) into a single
 * child state. No live signal → 0; a single live signal passes through; 2+
 * live signals collide and are resolved by `mode`:
 *   sum → (a+b+c) mod states, random → a fully random state, fixed → `fixed`.
 */
export function resolveCollision(
  a: number,
  b: number,
  c: number,
  states: number,
  mode: CollisionMode,
  fixed: number
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
  // random: on any collision emit a fully random state (0..states-1), so it is
  // visibly stochastic even for 2 colors where all live contributions are equal.
  return Math.floor(Math.random() * states)
}

// Descendants "energy" mode (per-cell conserved energy shown as colour
// brightness) lives in its own module; re-exported here so existing imports
// from '../utils/caRender' keep working.
export {
  evolveStepDescendantsEnergy,
  renderDiagramEnergy,
  extendDiagramEnergy,
  type EnergyDiagramResult,
  type RenderEnergyDiagramParams,
  type ExtendEnergyDiagramParams,
} from './caRenderEnergy'

/** Draws a single already-computed row of cells at row index `y` onto `ctx`. */
function paintRow(ctx: CanvasRenderingContext2D, row: Uint8Array, width: number, y: number): void {
  for (let x = 0; x < width; x++) {
    const state = row[x]
    if (state) {
      ctx.fillStyle = CA_COLORS[state]
      ctx.fillRect(x * CA_PIXEL_SIZE, y * CA_PIXEL_SIZE, CA_PIXEL_SIZE, CA_PIXEL_SIZE)
    }
  }
}

/**
 * Draws the full H×W space-time diagram onto `ctx` and returns every rendered
 * row so callers can reuse the exact pixels (e.g. the "convert to patterns" view)
 * without re-evolving. The background is painted first; only non-zero cells are
 * stroked on top.
 */
export function renderDiagram(params: RenderDiagramParams): Uint8Array[] {
  const { ctx, width, height, config, mode, sums, explicitRule, emission, collisionMode, collisionFixed, noiseP } =
    params

  ctx.fillStyle = CA_COLORS[0]
  ctx.fillRect(0, 0, width * CA_PIXEL_SIZE, height * CA_PIXEL_SIZE)

  // Rolling window of the last `depth` rows (oldest → newest). It is primed with
  // the prehistory rows above the diagram, then the visible initial row on top.
  const priors = params.priorRows || []
  const window: Uint8Array[] = []
  for (let i = 0; i < config.depth - 1; i++) {
    window.push(priors[i] || new Uint8Array(width))
  }
  window.push(params.initialRow)

  const rowsData: Uint8Array[] = new Array(height)
  for (let y = 0; y < height; y++) {
    const row = window[window.length - 1]
    rowsData[y] = row.slice()
    paintRow(ctx, row, width, y)
    const next = evolveStep(window, width, config, mode, sums, explicitRule, noiseP, emission, collisionMode, collisionFixed)
    window.push(next)
    window.shift()
  }
  return rowsData
}

export interface ExtendDiagramParams {
  ctx: CanvasRenderingContext2D
  width: number
  config: CaConfig
  mode: RuleMode
  sums: number[] | null
  explicitRule: string
  emission?: number[] | null
  collisionMode?: CollisionMode
  collisionFixed?: number
  noiseP: number
  /** Rows already rendered/kept from a previous run() or extendDiagram() call. */
  previousRows: Uint8Array[]
  /** How many additional generations to simulate past `previousRows`. */
  extraRows: number
}

/**
 * Continues simulating a diagram that was already drawn by `renderDiagram`
 * (or a prior `extendDiagram` call), instead of restarting from the initial
 * row. Assumes `ctx`'s canvas has already been resized to fit
 * `(previousRows.length + extraRows)` rows and repaints the whole thing
 * (canvas resizing clears pixel contents), reusing the already-known rows
 * so nothing is re-evolved. Returns the full row set (previous + new).
 */
export function extendDiagram(params: ExtendDiagramParams): Uint8Array[] {
  const { ctx, width, config, mode, sums, explicitRule, emission, collisionMode, collisionFixed, noiseP, previousRows, extraRows } =
    params
  const totalHeight = previousRows.length + extraRows

  ctx.fillStyle = CA_COLORS[0]
  ctx.fillRect(0, 0, width * CA_PIXEL_SIZE, totalHeight * CA_PIXEL_SIZE)

  const rowsData: Uint8Array[] = new Array(totalHeight)
  for (let y = 0; y < previousRows.length; y++) {
    rowsData[y] = previousRows[y]
    paintRow(ctx, previousRows[y], width, y)
  }
  // Seed the rolling window from the last `depth` already-known rows so the
  // continuation reads the same history the interrupted run would have.
  const window: Uint8Array[] = []
  for (let i = config.depth; i >= 1; i--) {
    const idx = previousRows.length - i
    window.push(idx >= 0 ? previousRows[idx] : new Uint8Array(width))
  }
  for (let i = 0; i < extraRows; i++) {
    const y = previousRows.length + i
    const next = evolveStep(window, width, config, mode, sums, explicitRule, noiseP, emission, collisionMode, collisionFixed)
    window.push(next)
    window.shift()
    rowsData[y] = next
    paintRow(ctx, next, width, y)
  }
  return rowsData
}
