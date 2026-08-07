// Static ("particle") analysis of a local rule: does it CONSERVE the number of
// cells in a chosen state? Such a state behaves like a particle - it can only
// move around, never appear out of nowhere and never vanish.
//
// This needs no simulation at all: conservation is a property of the rule
// table. Cell k of the next row is f(w_k), where w_k is the window of
// `neighborhood` cells centred on k, and consecutive windows overlap in all
// but one cell. So a cyclic row of any length is exactly a closed walk in the
// de Bruijn graph whose nodes are the (neighborhood - 1)-cell overlaps.
//
// Give every window w (an edge y -> z of that graph) the weight
//
//     d(w) = [f(w) is the particle] - [centre of w is the particle]
//
// i.e. how much the particle count changes at that cell. The total change over
// a row is the sum of d along the corresponding closed walk, so the rule
// conserves the particle count for every configuration exactly when every
// cycle of the de Bruijn graph sums to zero - which happens exactly when a
// potential ("flux") j with
//
//     d(w) = j(y) - j(z)
//
// exists. Finding j is a single traversal, and the same equation run backwards
// turns an arbitrary j into a brand-new conserving rule (see
// {@link buildConservingRule}). For a 2-state, 3-cell neighborhood this
// generates the classic traffic rule 184.
import type { CaConfig } from '../types/ca'
import { LOCAL_MATERIALIZE_LIMIT, stateChar, stateDigitAt } from './caMath'

/** Outcome of {@link checkConservation}. */
export interface ConservationResult {
  /** False when the rule shape is out of scope (multi-row rules, huge tables). */
  supported: boolean
  /** True when the particle count is provably the same in every generation. */
  conserves: boolean
  /** One window (rule template index) that breaks the balance, or -1. */
  conflictIndex: number
  /** Human-readable summary, safe to show in the UI. */
  detail: string
}

/**
 * Conservation is only decided for single-row rules whose template table is
 * small enough to walk; multi-row (depth > 1) rules read several generations
 * at once, so "the count of the previous row" is not the right invariant.
 */
export function canCheckConservation(config: CaConfig): boolean {
  return config.depth === 1 && config.localDigits <= LOCAL_MATERIALIZE_LIMIT
}

/** Splits window index `w` into its de Bruijn edge (prefix -> suffix) and centre state. */
interface WindowGeometry {
  states: number
  nodeCount: number
  windowCount: number
  centreDiv: number
}

function geometry(config: CaConfig): WindowGeometry {
  const states = config.states
  const nodeCount = Math.pow(states, config.neighborhood - 1)
  return {
    states,
    nodeCount,
    windowCount: nodeCount * states,
    // Window digits are written leftmost-first (see toBaseN / evolveStep), so
    // the centre cell sits `radius` digits from the left.
    centreDiv: Math.pow(states, config.neighborhood - 1 - config.radius),
  }
}

/**
 * Decides whether `rule` keeps the number of `particle` cells constant in
 * every generation, for every initial row. Pure table analysis, no evolution.
 */
export function checkConservation(rule: string, config: CaConfig, particle: number): ConservationResult {
  if (!canCheckConservation(config)) {
    return {
      supported: false,
      conserves: false,
      conflictIndex: -1,
      detail: config.depth > 1 ? 'Only rules that read a single previous row can be checked.' : 'The template table is too large to check.',
    }
  }
  const { states, nodeCount, windowCount, centreDiv } = geometry(config)
  const flux = new Int32Array(nodeCount)
  const seen = new Uint8Array(nodeCount)
  const stack: number[] = [0]
  seen[0] = 1

  while (stack.length) {
    const y = stack.pop() as number
    for (let last = 0; last < states; last++) {
      const w = y * states + last
      const z = w % nodeCount
      const centre = Math.floor(w / centreDiv) % states
      const delta = (stateDigitAt(rule, w) === particle ? 1 : 0) - (centre === particle ? 1 : 0)
      const value = flux[y] - delta
      if (!seen[z]) {
        seen[z] = 1
        flux[z] = value
        stack.push(z)
      } else if (flux[z] !== value) {
        return {
          supported: true,
          conserves: false,
          conflictIndex: w,
          detail: `State ${stateChar(particle)} is created or destroyed: template ${windowLabel(w, config)} breaks the balance.`,
        }
      }
    }
  }
  // The de Bruijn graph is strongly connected, so a single traversal covers
  // every node and therefore every one of the `windowCount` templates.
  return {
    supported: true,
    conserves: true,
    conflictIndex: -1,
    detail: `State ${stateChar(particle)} is conserved: its cells can only move, their number never changes (${windowCount} templates checked).`,
  }
}

/** The window index `w` written out as its cell states, e.g. "110". */
function windowLabel(w: number, config: CaConfig): string {
  let label = ''
  let rest = w
  for (let i = 0; i < config.neighborhood; i++) {
    label = stateChar(rest % config.states) + label
    rest = Math.floor(rest / config.states)
  }
  return label
}

/**
 * Builds a rule that provably conserves the number of `particle` cells, by
 * picking a random flux `j` and reading the rule off the balance equation
 * `[f(w) is particle] = [centre is particle] + j(y) - j(z)`.
 *
 * Only the cells where the particle must (not) be are forced; every other
 * template keeps its digit from `baseRule`, so the result stays as close to
 * the current rule as conservation allows.
 */
export function buildConservingRule(
  baseRule: string,
  config: CaConfig,
  particle: number,
  random: () => number = Math.random
): string | null {
  if (!canCheckConservation(config)) {
    return null
  }
  const { states, nodeCount, windowCount, centreDiv } = geometry(config)
  // A flux of 0/1 per node is enough for interesting motion, and it is
  // feasible exactly when it is closed under these implications:
  //   centre is a particle      -> j(prefix) = 1 implies j(suffix) = 1
  //   centre is not a particle  -> j(suffix) = 1 implies j(prefix) = 1
  const implications: number[][] = new Array(nodeCount)
  for (let n = 0; n < nodeCount; n++) {
    implications[n] = []
  }
  for (let w = 0; w < windowCount; w++) {
    const y = Math.floor(w / states)
    const z = w % nodeCount
    const centre = Math.floor(w / centreDiv) % states
    if (centre === particle) {
      implications[y].push(z)
    } else {
      implications[z].push(y)
    }
  }

  // A constant flux means "particles never move", so retry a few random seeds
  // until the closure is a proper subset of the nodes.
  let flux: Uint8Array = new Uint8Array(nodeCount)
  for (let attempt = 0; attempt < 24; attempt++) {
    const candidate = closure(implications, nodeCount, Math.floor(random() * nodeCount))
    let ones = 0
    for (let n = 0; n < nodeCount; n++) {
      ones += candidate[n]
    }
    if (ones > 0 && ones < nodeCount) {
      flux = candidate
      break
    }
  }

  const fallback = particle === 0 ? 1 : 0
  let out = ''
  for (let w = 0; w < windowCount; w++) {
    const y = Math.floor(w / states)
    const z = w % nodeCount
    const centre = Math.floor(w / centreDiv) % states
    const wanted = (centre === particle ? 1 : 0) + flux[y] - flux[z]
    if (wanted === 1) {
      out += stateChar(particle)
      continue
    }
    const current = stateDigitAt(baseRule, w)
    out += stateChar(current === particle ? fallback : current)
  }
  return out
}

/** Marks `start` and everything it implies. */
function closure(implications: number[][], nodeCount: number, start: number): Uint8Array {
  const marked = new Uint8Array(nodeCount)
  const stack = [start]
  marked[start] = 1
  while (stack.length) {
    const node = stack.pop() as number
    const next = implications[node]
    for (let i = 0; i < next.length; i++) {
      if (!marked[next[i]]) {
        marked[next[i]] = 1
        stack.push(next[i])
      }
    }
  }
  return marked
}
