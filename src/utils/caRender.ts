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
}

/** Computes the next row from `row` using the shared totalistic/local/descendants rule + noise logic. */
export function evolveStep(
  row: Uint8Array,
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
  const merge: CollisionMode = collisionMode || 'sum'
  const fixed = collisionFixed || 0
  for (let k = 0; k < width; k++) {
    const left = row[(k - 1 + width) % width]
    const center = row[k]
    const right = row[(k + 1) % width]
    let value: number
    if (mode === 'totalistic') {
      // Sum the `neighborhood` cells centered on k (radius on each side).
      let sum = 0
      for (let d = -radius; d <= radius; d++) {
        sum += row[(k + d + width) % width]
      }
      value = (sums as number[])[sum]
    } else if (mode === 'local') {
      // Encode the `neighborhood` cells as a base-`states` index, leftmost cell
      // most-significant (radius === 1 reduces to left*states^2+center*states+right).
      let index = 0
      for (let d = -radius; d <= radius; d++) {
        index = index * states + row[(k + d + width) % width]
      }
      value = explicitRule.charCodeAt(index) - 48
    } else {
      // Descendants: each child gathers up to 3 emitted contributions. Background
      // (state 0) emits nothing; a live parent's triple lives at (state-1)*3 in
      // `emission`. a = right-child of the left parent, b = center-child of the
      // center parent, c = left-child of the right parent.
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
function resolveCollision(
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

// ---------------------------------------------------------------------------
// Energy mode (descendants only)
// ---------------------------------------------------------------------------
// In energy mode every live cell also carries a scalar "energy". A parent's
// energy is split evenly among the descendants it emits; the indivisible
// remainder is handed to random distinct descendants. Descendants that end up
// with 0 energy are not born (their slot is zeroed). Energies from colliding
// contributions add up on the target cell, so the total energy of a row is
// conserved from one generation to the next (aside from the rare case of a
// live parent whose emission rule emits no children at all). The cell colour
// then encodes energy as brightness: the state's hue blended toward the
// background in proportion to how much energy the cell holds.

/** Parses a `#rrggbb` colour into an `[r, g, b]` triple (0-255). */
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

const STATE_RGB = CA_COLORS.map(hexToRgb)
const BG_RGB = STATE_RGB[0]

/** Blends state `s`'s colour toward the background by `t` (0 = background, 1 = full colour). */
function energyFill(s: number, t: number): string {
  const c = STATE_RGB[s] || STATE_RGB[STATE_RGB.length - 1]
  const r = Math.round(BG_RGB[0] + (c[0] - BG_RGB[0]) * t)
  const g = Math.round(BG_RGB[1] + (c[1] - BG_RGB[1]) * t)
  const b = Math.round(BG_RGB[2] + (c[2] - BG_RGB[2]) * t)
  return `rgb(${r},${g},${b})`
}

/** Picks the state of whichever colliding contribution carries the most energy. */
function strongestState(aS: number, aE: number, bS: number, bE: number, cS: number, cE: number): number {
  let st = aS
  let best = aE
  if (bE > best) {
    best = bE
    st = bS
  }
  if (cE > best) {
    st = cS
  }
  return st
}

/**
 * One generation of the descendants rule with energy tracking. Returns the next
 * state row plus its per-cell energy. Each live parent divides its energy among
 * the descendants its emission rule produces (remainder to random distinct
 * descendants); zero-energy descendants are dropped. Colliding contributions'
 * energies add on the target cell and their states are merged by `collisionMode`.
 */
export function evolveStepDescendantsEnergy(
  stateRow: Uint8Array,
  energyRow: Float64Array,
  width: number,
  config: CaConfig,
  emission: number[],
  collisionMode: CollisionMode,
  collisionFixed: number
): { states: Uint8Array; energy: Float64Array } {
  const states = config.states
  const merge: CollisionMode = collisionMode || 'sum'
  const fixed = collisionFixed || 0
  // Positional contributions per target cell, in the a/b/c convention used by
  // resolveCollision: a = right-child of the left parent, b = center-child of
  // the center parent, c = left-child of the right parent. Each (letter, cell)
  // pair is fed by exactly one parent, so no summing is needed within a letter.
  const aS = new Uint8Array(width)
  const bS = new Uint8Array(width)
  const cS = new Uint8Array(width)
  const aE = new Float64Array(width)
  const bE = new Float64Array(width)
  const cE = new Float64Array(width)

  const liveSlots: number[] = []
  const slotEnergy: number[] = []
  for (let p = 0; p < width; p++) {
    const s = stateRow[p]
    if (s === 0) {
      continue
    }
    const e = energyRow[p]
    if (e <= 0) {
      continue
    }
    // Gather the parent's live emission slots (0 = left child @p-1, 1 = center
    // @p, 2 = right child @p+1); a slot value of 0 means "no child".
    liveSlots.length = 0
    for (let slot = 0; slot < 3; slot++) {
      if (emission[(s - 1) * 3 + slot] !== 0) {
        liveSlots.push(slot)
      }
    }
    const d = liveSlots.length
    if (d === 0) {
      continue
    }
    // Split energy evenly, then hand the remainder to random distinct slots.
    const base = Math.floor(e / d)
    const rem = e - base * d
    slotEnergy.length = d
    for (let i = 0; i < d; i++) {
      slotEnergy[i] = base
    }
    for (let i = 0; i < rem; i++) {
      const j = i + Math.floor(Math.random() * (d - i))
      const tmp = liveSlots[i]
      liveSlots[i] = liveSlots[j]
      liveSlots[j] = tmp
      slotEnergy[i] += 1
    }
    // Scatter each surviving descendant into the next row.
    for (let i = 0; i < d; i++) {
      const ee = slotEnergy[i]
      if (ee <= 0) {
        continue
      }
      const slot = liveSlots[i]
      const st = emission[(s - 1) * 3 + slot]
      const pos = (p - 1 + slot + width) % width
      if (slot === 0) {
        cS[pos] = st
        cE[pos] = ee
      } else if (slot === 1) {
        bS[pos] = st
        bE[pos] = ee
      } else {
        aS[pos] = st
        aE[pos] = ee
      }
    }
  }

  const nextStates = new Uint8Array(width)
  const nextEnergy = new Float64Array(width)
  for (let t = 0; t < width; t++) {
    const te = aE[t] + bE[t] + cE[t]
    if (te <= 0) {
      continue
    }
    let st = resolveCollision(aS[t], bS[t], cS[t], states, merge, fixed)
    if (st === 0) {
      // The cell holds energy, so it must stay visible: fall back to the hue of
      // its strongest contribution instead of collapsing to the dead state.
      st = strongestState(aS[t], aE[t], bS[t], bE[t], cS[t], cE[t])
    }
    nextStates[t] = st
    nextEnergy[t] = te
  }
  return { states: nextStates, energy: nextEnergy }
}

/** Paints an already-evolved energy diagram, mapping energy to colour brightness. */
function paintEnergyDiagram(
  ctx: CanvasRenderingContext2D,
  width: number,
  states: Uint8Array[],
  energy: Float64Array[]
): void {
  const height = states.length
  ctx.fillStyle = CA_COLORS[0]
  ctx.fillRect(0, 0, width * CA_PIXEL_SIZE, height * CA_PIXEL_SIZE)

  let maxEnergy = 0
  for (let y = 0; y < height; y++) {
    const er = energy[y]
    for (let x = 0; x < width; x++) {
      if (er[x] > maxEnergy) {
        maxEnergy = er[x]
      }
    }
  }
  const inv = maxEnergy > 0 ? 1 / maxEnergy : 0
  for (let y = 0; y < height; y++) {
    const sr = states[y]
    const er = energy[y]
    for (let x = 0; x < width; x++) {
      const s = sr[x]
      const e = er[x]
      if (!s || e <= 0) {
        continue
      }
      // Keep even the faintest live cell visible (floor at 25% brightness).
      const t = 0.25 + 0.75 * e * inv
      ctx.fillStyle = energyFill(s, t)
      ctx.fillRect(x * CA_PIXEL_SIZE, y * CA_PIXEL_SIZE, CA_PIXEL_SIZE, CA_PIXEL_SIZE)
    }
  }
}

export interface EnergyDiagramResult {
  states: Uint8Array[]
  energy: Float64Array[]
}

export interface RenderEnergyDiagramParams {
  ctx: CanvasRenderingContext2D
  width: number
  height: number
  config: CaConfig
  emission: number[]
  collisionMode: CollisionMode
  collisionFixed: number
  initialRow: Uint8Array
  /** Energy handed to every live cell of the initial row. */
  initialEnergy: number
}

/**
 * Renders a descendants-mode diagram with energy tracking. Every live cell of
 * the initial row starts with `initialEnergy`; energy then flows and is
 * conserved per generation. The returned states/energy rows are kept so the
 * "continue simulation" flow can extend from the exact last state.
 */
export function renderDiagramEnergy(params: RenderEnergyDiagramParams): EnergyDiagramResult {
  const { ctx, width, height, config, emission, collisionMode, collisionFixed, initialRow, initialEnergy } = params
  const states: Uint8Array[] = new Array(height)
  const energy: Float64Array[] = new Array(height)

  let stateRow: Uint8Array = initialRow
  let energyRow: Float64Array = new Float64Array(width)
  for (let j = 0; j < width; j++) {
    energyRow[j] = stateRow[j] ? initialEnergy : 0
  }
  for (let y = 0; y < height; y++) {
    states[y] = stateRow
    energy[y] = energyRow
    const next = evolveStepDescendantsEnergy(stateRow, energyRow, width, config, emission, collisionMode, collisionFixed)
    stateRow = next.states
    energyRow = next.energy
  }
  paintEnergyDiagram(ctx, width, states, energy)
  return { states, energy }
}

export interface ExtendEnergyDiagramParams {
  ctx: CanvasRenderingContext2D
  width: number
  config: CaConfig
  emission: number[]
  collisionMode: CollisionMode
  collisionFixed: number
  previousStates: Uint8Array[]
  previousEnergy: Float64Array[]
  extraRows: number
}

/** Energy-aware counterpart of {@link extendDiagram} for the descendants mode. */
export function extendDiagramEnergy(params: ExtendEnergyDiagramParams): EnergyDiagramResult {
  const { ctx, width, config, emission, collisionMode, collisionFixed, previousStates, previousEnergy, extraRows } =
    params
  const total = previousStates.length + extraRows
  const states: Uint8Array[] = new Array(total)
  const energy: Float64Array[] = new Array(total)
  for (let y = 0; y < previousStates.length; y++) {
    states[y] = previousStates[y]
    energy[y] = previousEnergy[y]
  }
  let stateRow: Uint8Array = previousStates[previousStates.length - 1] || new Uint8Array(width)
  let energyRow: Float64Array = previousEnergy[previousEnergy.length - 1] || new Float64Array(width)
  for (let i = 0; i < extraRows; i++) {
    const next = evolveStepDescendantsEnergy(stateRow, energyRow, width, config, emission, collisionMode, collisionFixed)
    stateRow = next.states
    energyRow = next.energy
    const y = previousStates.length + i
    states[y] = stateRow
    energy[y] = energyRow
  }
  paintEnergyDiagram(ctx, width, states, energy)
  return { states, energy }
}

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

  let row = params.initialRow
  const rowsData: Uint8Array[] = new Array(height)
  for (let y = 0; y < height; y++) {
    rowsData[y] = row.slice()
    paintRow(ctx, row, width, y)
    row = evolveStep(row, width, config, mode, sums, explicitRule, noiseP, emission, collisionMode, collisionFixed)
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
  let row = previousRows[previousRows.length - 1] || new Uint8Array(width)
  for (let y = 0; y < previousRows.length; y++) {
    rowsData[y] = previousRows[y]
    paintRow(ctx, previousRows[y], width, y)
  }
  for (let i = 0; i < extraRows; i++) {
    const y = previousRows.length + i
    row = evolveStep(row, width, config, mode, sums, explicitRule, noiseP, emission, collisionMode, collisionFixed)
    rowsData[y] = row
    paintRow(ctx, row, width, y)
  }
  return rowsData
}
