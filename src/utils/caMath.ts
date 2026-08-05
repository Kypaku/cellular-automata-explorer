// Pure, framework-agnostic math helpers for totalistic / local-rule
// one-dimensional cellular automata with an arbitrary number of states.

import type { CaConfig, CollisionMode, RuleParts, RuleSnapshot } from '../types/ca'

/**
 * Cell-state digits: the index is the state value, the character is how that
 * state appears inside every rule / seed / emission string. States 0-9 keep
 * their classic decimal characters, so rules saved before custom state counts
 * existed stay valid; 10+ continue into 'a'..'z'.
 */
export const STATE_DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz'

/**
 * Largest supported number of states. Every rule string stores one state per
 * character, so this is the ceiling of the base-36 digit alphabet above.
 * Anything past 5 states is experimental ("at your own risk"): the rule spaces
 * grow explosively and only random sampling stays practical.
 */
export const MAX_STATE_COUNT = STATE_DIGITS.length

/** The recommended, fully curated state counts (everything else is experimental). */
export const SAFE_STATE_COUNT = 5

// Fast char-code → state-value lookup used by the evolution hot loops.
const CHAR_TO_DIGIT = new Int8Array(128).fill(-1)
for (let i = 0; i < STATE_DIGITS.length; i++) {
  CHAR_TO_DIGIT[STATE_DIGITS.charCodeAt(i)] = i
  CHAR_TO_DIGIT[STATE_DIGITS.toUpperCase().charCodeAt(i)] = i
}

/** The character representing state `value` ('0' for out-of-range values). */
export function stateChar(value: number): string {
  return STATE_DIGITS.charAt(value) || '0'
}

/** The state value of a character code, or -1 when it is not a state digit. */
export function stateDigitFromCharCode(code: number): number {
  return code >= 0 && code < 128 ? CHAR_TO_DIGIT[code] : -1
}

/** The state value at `index` of a rule/seed string; unknown characters read as 0. */
export function stateDigitAt(text: string, index: number): number {
  const digit = stateDigitFromCharCode(text.charCodeAt(index))
  return digit >= 0 ? digit : 0
}

/** Clamps an arbitrary value to a supported state count (2..MAX_STATE_COUNT), defaulting to 3. */
export function normalizeStateCount(value: unknown): number {
  const n = Math.floor(Number(value))
  return n >= 2 && n <= MAX_STATE_COUNT ? n : 3
}

/** Clamps an arbitrary value to a supported neighborhood size (3, 5 or 7), defaulting to 3. */
export function normalizeNeighborhood(value: unknown): number {
  const n = Math.floor(Number(value))
  return n === 5 || n === 7 ? n : 3
}

/** Largest number of previous rows a totalistic/local rule may depend on. */
export const MAX_DEPTH = 8

/** Clamps an arbitrary value to a supported temporal depth (1..MAX_DEPTH), defaulting to 1. */
export function normalizeDepth(value: unknown): number {
  const n = Math.floor(Number(value))
  if (!Number.isFinite(n) || n < 1) {
    return 1
  }
  return Math.min(MAX_DEPTH, n)
}

/**
 * Above this local-rule length we no longer materialize the full digit string
 * (it would be too large to build/hold/edit). Multi-row local rules with many
 * cells can reach `states^(neighborhood*depth)` digits; past this cap the rule
 * string is left un-expanded and unfilled neighborhoods are treated as state 0.
 */
export const LOCAL_MATERIALIZE_LIMIT = 200000

/** True when a config's local rule string (`localDigits`) is small enough to build/hold. */
export function canMaterializeLocal(config: CaConfig): boolean {
  return config.localDigits <= LOCAL_MATERIALIZE_LIMIT
}

/** Builds classifier `parts` (rule identity) from a saved rule snapshot. */
export function partsFromSnapshot(snapshot: RuleSnapshot): RuleParts {
  const stateCount = normalizeStateCount(snapshot.stateCount)
  if (snapshot.mode === 'descendants') {
    return {
      stateCount,
      mode: 'descendants',
      code: 0,
      localRule: '',
      emissionRule: snapshot.emissionRule || defaultEmissionRule(stateCount),
      collisionMode: snapshot.collisionMode || DEFAULT_COLLISION_MODE,
      collisionFixed: clampCollisionFixed(snapshot.collisionFixed ?? DEFAULT_COLLISION_FIXED, stateCount),
    }
  }
  const neighborhood = normalizeNeighborhood(snapshot.neighborhood)
  const depth = normalizeDepth(snapshot.depth)
  return snapshot.mode === 'totalistic'
    ? { stateCount, mode: 'totalistic', code: snapshot.code || 0, localRule: '', neighborhood, depth }
    : { stateCount, mode: 'local', code: 0, localRule: snapshot.localRule || '', neighborhood, depth }
}

/**
 * Derives all the size/range values that depend on the number of states, the
 * neighborhood size (how many cells of each row the rule reads) and the depth
 * (how many previous rows the rule reads).
 * @param states number of cell states (2..MAX_STATE_COUNT)
 * @param neighborhood cells read from each row (3, 5 or 7; default 3)
 * @param depth previous rows the rule reads (1..MAX_DEPTH; default 1)
 */
export function getConfig(states: number, neighborhood: number = 3, depth: number = 1): CaConfig {
  const cells = normalizeNeighborhood(neighborhood)
  const d = normalizeDepth(depth)
  const taps = cells * d
  const totalisticDigits = taps * (states - 1) + 1
  return {
    states,
    maxDigit: states - 1,
    totalisticDigits,
    totalisticMax: Math.pow(states, totalisticDigits) - 1,
    localDigits: Math.pow(states, taps),
    neighborhood: cells,
    radius: (cells - 1) / 2,
    depth: d,
    taps,
  }
}

/** Keeps only valid digits (0..maxDigit) from `text`, optionally capped to `maxLen`. */
export function sanitizeStateString(text: unknown, maxLen: number | undefined, states: number): string {
  const config = getConfig(states)
  const source = String(text || '')
  let clean = ''
  for (let i = 0; i < source.length; i++) {
    const digit = stateDigitFromCharCode(source.charCodeAt(i))
    if (digit >= 0 && digit <= config.maxDigit) {
      clean += stateChar(digit)
      if (typeof maxLen === 'number' && clean.length >= maxLen) {
        break
      }
    }
  }
  return clean
}

/** Pads `text` on the right with '0' until it reaches `len` characters. */
export function padRight(text: string, len: number): string {
  let result = text
  while (result.length < len) {
    result += '0'
  }
  return result
}

/** Expands a totalistic rule code into a lookup table indexed by neighbor sum. */
export function totalisticTable(code: number, states: number, neighborhood: number = 3, depth: number = 1): number[] {
  const config = getConfig(states, neighborhood, depth)
  const table: number[] = []
  for (let sum = 0; sum < config.totalisticDigits; sum++) {
    table.push(Math.floor(code / Math.pow(config.states, sum)) % config.states)
  }
  return table
}

/** Converts `value` to a base-`base` string zero-padded to `width` characters. */
export function toBaseN(value: number, width: number, base: number): string {
  let out = ''
  let remaining = value
  while (out.length < width) {
    out = stateChar(remaining % base) + out
    remaining = Math.floor(remaining / base)
  }
  return out
}

/**
 * Builds the local rule string equivalent to a totalistic code. The string has
 * `states ^ (neighborhood * depth)` digits: the digit at index `v` is the output
 * for the neighborhood whose cells (most-significant = leftmost) encode `v` in
 * base `states`; since a totalistic rule only depends on the neighbor sum, that
 * output is `sums[sum of the cells]`. Returns '' when the string would be too
 * large to materialize (see {@link LOCAL_MATERIALIZE_LIMIT}).
 */
export function buildLocalRuleFromTotalistic(code: number, states: number, neighborhood: number = 3, depth: number = 1): string {
  const config = getConfig(states, neighborhood, depth)
  if (!canMaterializeLocal(config)) {
    return ''
  }
  const sums = totalisticTable(code, config.states, config.neighborhood, config.depth)
  let rule = ''
  for (let index = 0; index < config.localDigits; index++) {
    let remaining = index
    let sum = 0
    for (let cell = 0; cell < config.taps; cell++) {
      sum += remaining % config.states
      remaining = Math.floor(remaining / config.states)
    }
    rule += stateChar(sums[sum])
  }
  return rule
}

/**
 * Converts a local rule string into its numeric code, using the standard
 * (Wolfram) convention: the digit at string index `v` — where `v` is the
 * neighborhood value `left*states^2 + center*states + right` — is weighted
 * by `states^v`, i.e. the neighborhood "000" is the least-significant digit.
 * This mirrors `totalisticTable`, where the lowest neighbor sum is also the
 * least-significant digit, and is what makes e.g. local rule 30 (2 states)
 * match the well-known chaotic elementary CA "Rule 30".
 */
export function localRuleToCode(rule: string, states: number, neighborhood: number = 3, depth: number = 1): number {
  const config = getConfig(states, neighborhood, depth)
  const clean = padRight(sanitizeStateString(rule, config.localDigits, states), config.localDigits)
  let code = 0
  for (let i = clean.length - 1; i >= 0; i--) {
    code = code * config.states + stateDigitAt(clean, i)
  }
  return code
}

/**
 * Returns a copy of a local rule string with the digit at `index` advanced
 * to the next state (wrapping from the highest state back to 0), or to the
 * previous state when `direction` is -1. Used to let the user click (or
 * right-click) a legend cell and step its output value.
 */
export function cycleLocalRuleDigit(rule: string, states: number, index: number, neighborhood: number = 3, depth: number = 1, direction: 1 | -1 = 1): string {
  const config = getConfig(states, neighborhood, depth)
  const clean = padRight(sanitizeStateString(rule, config.localDigits, states), config.localDigits)
  if (index < 0 || index >= clean.length) {
    return clean
  }
  const current = stateDigitAt(clean, index)
  const next = (current + direction + states) % states
  return clean.slice(0, index) + stateChar(next) + clean.slice(index + 1)
}

/**
 * Returns a new totalistic rule code with the output for neighbor-sum
 * `sumIndex` advanced to the next state (wrapping from the highest state
 * back to 0), or to the previous state when `direction` is -1. Mirrors
 * `cycleLocalRuleDigit` for totalistic mode.
 */
export function cycleTotalisticDigit(code: number, states: number, sumIndex: number, neighborhood: number = 3, depth: number = 1, direction: 1 | -1 = 1): number {
  const table = totalisticTable(code, states, neighborhood, depth)
  if (sumIndex < 0 || sumIndex >= table.length) {
    return code
  }
  table[sumIndex] = (table[sumIndex] + direction + states) % states
  let newCode = 0
  for (let sum = table.length - 1; sum >= 0; sum--) {
    newCode = newCode * states + table[sum]
  }
  return newCode
}

/**
 * Picks `count` rule codes from the inclusive [from, to] range: sequentially
 * when the range is no bigger than `count` (nothing to sample), otherwise a
 * set of unique random codes drawn uniformly from the range. Used to scan a
 * fixed-size random sample instead of the full range, which matters for huge
 * ranges (e.g. local rules with many states) where a full scan is infeasible.
 */
export function pickRandomCodes(from: number, to: number, count: number): number[] {
  const lo = Math.max(0, Math.floor(from))
  const hi = Math.max(lo, Math.floor(to))
  const span = hi - lo + 1
  const n = Math.max(1, Math.floor(count))
  if (span <= n) {
    const codes: number[] = []
    for (let code = lo; code <= hi; code++) {
      codes.push(code)
    }
    return codes
  }
  const seen = new Set<number>()
  const codes: number[] = []
  const maxAttempts = n * 20 + 1000
  let attempts = 0
  while (codes.length < n && attempts < maxAttempts) {
    attempts++
    const code = lo + Math.floor(Math.random() * span)
    if (!seen.has(code)) {
      seen.add(code)
      codes.push(code)
    }
  }
  return codes.sort((a, b) => a - b)
}

/**
 * True when the local-rule code space for `states` (= `states^(states^3)`) is
 * larger than what a JS number (double) can represent exactly. Above this
 * threshold a numeric code loses its low-order base-`states` digits to
 * floating-point rounding, so sampling via `pickRandomCodes` +
 * `codeToLocalRule` would yield rules whose leading digits are always 0 (a
 * near-dead automaton). Holds for local rules with 4+ states.
 */
export function localCodeExceedsSafeInteger(states: number, neighborhood: number = 3, depth: number = 1): boolean {
  const config = getConfig(states, neighborhood, depth)
  return config.localDigits * Math.log2(config.states) > 53
}

/** Builds a uniformly random local-rule digit string of the full length for `states`. */
export function randomLocalRule(states: number, neighborhood: number = 3, depth: number = 1): string {
  const config = getConfig(states, neighborhood, depth)
  const length = Math.min(config.localDigits, LOCAL_MATERIALIZE_LIMIT)
  let rule = ''
  for (let i = 0; i < length; i++) {
    rule += stateChar(Math.floor(Math.random() * config.states))
  }
  return rule
}

/**
 * Picks `count` uniformly random local-rule digit strings. Used instead of
 * numeric codes when the code space is too large to sample precisely as
 * doubles (see {@link localCodeExceedsSafeInteger}), so every neighborhood —
 * including the low-order "000…" ones — gets a genuinely random output value.
 */
export function pickRandomLocalRules(states: number, count: number, neighborhood: number = 3, depth: number = 1): string[] {
  const n = Math.max(1, Math.floor(count))
  const rules: string[] = []
  for (let i = 0; i < n; i++) {
    rules.push(randomLocalRule(states, neighborhood, depth))
  }
  return rules
}

/** Converts a numeric local rule code back into its digit string (see `localRuleToCode`). */
export function codeToLocalRule(code: number, states: number, neighborhood: number = 3, depth: number = 1): string {
  const config = getConfig(states, neighborhood, depth)
  const normalized = Math.max(0, Math.min(Math.pow(config.states, config.localDigits) - 1, Math.floor(code)))
  let rule = ''
  let remaining = normalized
  for (let i = 0; i < config.localDigits; i++) {
    rule += stateChar(remaining % config.states)
    remaining = Math.floor(remaining / config.states)
  }
  return rule
}

// ---------------------------------------------------------------------------
// "Descendants" mode helpers.
//
// Here the rule is inverted: instead of 3 parents producing 1 child, each
// LIVE parent cell EMITS 3 children into the next row. The background state 0
// emits nothing, so only the non-background states (1..states-1) carry an
// emission triple. The emission rule maps a live parent's state to the states
// it drops into positions (k-1, k, k+1):
//
//   emission length = 3 * (states - 1), indexed  (state - 1) * 3 + slot
//   (slot 0=left, 1=center, 2=right); state 0 always emits (0, 0, 0).
//
// A child cell k therefore receives up to 3 colliding contributions:
//   a = right-child emitted by the left parent  (row[k-1])
//   b = center-child emitted by the center parent (row[k])
//   c = left-child emitted by the right parent   (row[k+1])
// When 2+ of them are live they collide and are merged by the collision mode
// (sum mod states / random one of them / a fixed constant); a single live
// contribution passes straight through and no contributions leave the cell 0.
// ---------------------------------------------------------------------------

/** Default collision merge strategy for descendants mode. */
export const DEFAULT_COLLISION_MODE: CollisionMode = 'sum'

/** Default constant used when the collision mode is 'fixed'. */
export const DEFAULT_COLLISION_FIXED = 1

/** Clamps a 'fixed' collision value into the valid state range for `states`. */
export function clampCollisionFixed(value: unknown, states: number): number {
  const count = normalizeStateCount(states)
  const n = Math.floor(Number(value))
  if (!Number.isFinite(n) || n < 0) {
    return 0
  }
  return Math.min(count - 1, n)
}

/** Number of digits in a descendants emission rule for `states` states. */
export function emissionDigits(states: number): number {
  return 3 * (normalizeStateCount(states) - 1)
}

/** Default emission: every live parent spawns 3 copies of its own state. */
export function defaultEmissionRule(states: number): string {
  const count = normalizeStateCount(states)
  let rule = ''
  for (let s = 1; s < count; s++) {
    rule += stateChar(s).repeat(3)
  }
  return rule
}

/** Sanitizes + pads an emission rule string to the full `3 * (states - 1)` length. */
export function sanitizeEmissionRule(rule: string, states: number): string {
  const count = normalizeStateCount(states)
  return padRight(sanitizeStateString(rule, emissionDigits(count), count), emissionDigits(count))
}

/** Parses an emission rule string into a numeric lookup of length `3 * (states - 1)`. */
export function emissionTable(rule: string, states: number): number[] {
  const clean = sanitizeEmissionRule(rule, states)
  const table: number[] = []
  for (let i = 0; i < clean.length; i++) {
    table.push(stateDigitAt(clean, i))
  }
  return table
}

/**
 * Advances the emission digit at `index` to the next state (wrapping), or to
 * the previous state when `direction` is -1.
 */
export function cycleEmissionDigit(rule: string, states: number, index: number, direction: 1 | -1 = 1): string {
  const clean = sanitizeEmissionRule(rule, states)
  if (index < 0 || index >= clean.length) {
    return clean
  }
  const count = normalizeStateCount(states)
  const next = (stateDigitAt(clean, index) + direction + count) % count
  return clean.slice(0, index) + stateChar(next) + clean.slice(index + 1)
}

/** A uniformly random emission rule (each of `3 * (states - 1)` digits random). */
export function randomEmissionRule(states: number): string {
  const count = normalizeStateCount(states)
  let rule = ''
  for (let i = 0; i < emissionDigits(count); i++) {
    rule += stateChar(Math.floor(Math.random() * count))
  }
  return rule
}

/**
 * Highest numeric code in the descendants emission space for `states`:
 * `states ^ (3 * (states - 1)) - 1`. Stays well within double precision for
 * all supported state counts (largest is 5^12 ≈ 2.44e8), so unlike local rules
 * the emission space can always be sampled precisely as numeric codes.
 */
export function descendantsCodeMax(states: number): number {
  const count = normalizeStateCount(states)
  return Math.pow(count, emissionDigits(count)) - 1
}

/** Converts a numeric descendants code into its emission digit string (low-order first). */
export function codeToEmissionRule(code: number, states: number): string {
  const count = normalizeStateCount(states)
  const digits = emissionDigits(count)
  const normalized = Math.max(0, Math.min(descendantsCodeMax(count), Math.floor(code)))
  let rule = ''
  let remaining = normalized
  for (let i = 0; i < digits; i++) {
    rule += stateChar(remaining % count)
    remaining = Math.floor(remaining / count)
  }
  return rule
}
