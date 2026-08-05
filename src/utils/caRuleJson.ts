// JSON view of a "by templates" (local) rule: a dictionary that maps a
// neighborhood pattern to the state it produces. Every pattern that is not
// listed produces state 0.
//
//   {
//     "111": 0,
//     "#11": 1,        // '#' matches any state
//     "123/222": 2,    // '/' separates the rows of a multi-row rule
//     "120": [1, 0]    // a list picks one of the states at random, each time
//   }
//
// The key lists the cells the rule reads, most significant (leftmost cell of
// the oldest row) first - exactly the order used by the legend captions.

import { canMaterializeLocal, getConfig, padRight, sanitizeStateString, stateChar, stateDigitFromCharCode, toBaseN } from './caMath'
import type { CaConfig } from '../types/ca'

/** Character that matches any state inside a JSON rule pattern. */
export const RULE_JSON_ANY = '#'

/** Character that visually separates the rows of a multi-row pattern (ignored when parsing). */
export const RULE_JSON_ROW_SEPARATOR = '/'

/** Largest number of entries {@link buildRuleJson} writes out before truncating. */
export const RULE_JSON_MAX_ENTRIES = 1024

/**
 * Runtime lookup used by the evolution loops: neighborhood index → the state
 * digits to pick from at random. Absent indices are deterministic.
 */
export type StochasticTable = Map<number, string>

/** Turns the stored `{ index: "digits" }` options into a lookup map (null when there is nothing random). */
export function stochasticTable(options: Record<string, string> | null | undefined): StochasticTable | null {
  if (!options) {
    return null
  }
  const table: StochasticTable = new Map()
  for (const key of Object.keys(options)) {
    const index = Number(key)
    const picks = options[key]
    if (Number.isFinite(index) && typeof picks === 'string' && picks.length > 1) {
      table.set(index, picks)
    }
  }
  return table.size > 0 ? table : null
}

export interface RuleJsonBuildResult {
  /** The generated JSON text (empty when the rule table is too large to expand). */
  text: string
  /** How many non-zero patterns the rule has in total. */
  total: number
  /** True when only the first {@link RULE_JSON_MAX_ENTRIES} patterns were written. */
  truncated: boolean
  /** False when the rule table is too large to be materialized at all. */
  supported: boolean
}

export interface RuleJsonParseResult {
  /** The resulting local rule string, or null when parsing failed. */
  rule: string | null
  /**
   * Neighborhood index (as a string key) → the state digits a list value picks
   * from at random, e.g. `{ "6": "10" }`. Only holds entries with 2+ options;
   * `rule` carries the first option of each, so consumers that ignore
   * randomness still get a valid deterministic rule.
   */
  options: Record<string, string>
  /** Human readable reason why parsing failed, or null on success. */
  error: string | null
  /** How many entries the text contained. */
  entries: number
  /** How many neighborhoods the entries covered (wildcards expand to many). */
  covered: number
}

/** Formats a neighborhood index as a pattern key, grouping the rows with '/'. */
export function formatRulePattern(index: number, config: CaConfig): string {
  const raw = toBaseN(index, config.taps, config.states)
  if (config.depth <= 1) {
    return raw
  }
  const groups: string[] = []
  for (let row = 0; row < config.depth; row++) {
    groups.push(raw.slice(row * config.neighborhood, (row + 1) * config.neighborhood))
  }
  return groups.join(RULE_JSON_ROW_SEPARATOR)
}

/** Removes `//` and block comments, leaving quoted strings untouched. */
function stripComments(text: string): string {
  let out = ''
  let quote = ''
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quote) {
      out += ch
      if (ch === '\\' && i + 1 < text.length) {
        out += text[i + 1]
        i++
        continue
      }
      if (ch === quote) {
        quote = ''
      }
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      out += ch
      continue
    }
    if (ch === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') {
        i++
      }
      out += '\n'
      continue
    }
    if (ch === '/' && text[i + 1] === '*') {
      i += 2
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) {
        i++
      }
      i++
      out += ' '
      continue
    }
    out += ch
  }
  return out
}

// Deliberately tolerant: missing commas (as in the shorthand notation users
// write by hand) still parse, because every "key": value pair is matched on
// its own instead of running the text through JSON.parse. A value is either a
// bare state digit or a bracketed list of them.
const PAIR_PATTERN = /(["'])([^"'\n]*)\1\s*:\s*(\[[^\]]*\]|[^\s,}\]]+)/g

/** Splits a raw JSON value into the state digits it offers (a list = pick one at random). */
function valueOptions(rawValue: string): string[] {
  if (rawValue.startsWith('[')) {
    return rawValue
      .slice(1, rawValue.endsWith(']') ? -1 : undefined)
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part.length > 0)
  }
  return [rawValue]
}

/** Serializes the non-zero entries of a local rule into the JSON rule format. */
export function buildRuleJson(
  rule: string,
  states: number,
  neighborhood: number = 3,
  depth: number = 1,
  options: Record<string, string> | null = null,
  maxEntries: number = RULE_JSON_MAX_ENTRIES
): RuleJsonBuildResult {
  const config = getConfig(states, neighborhood, depth)
  if (!canMaterializeLocal(config)) {
    return { text: '', total: 0, truncated: false, supported: false }
  }
  const clean = padRight(sanitizeStateString(rule, config.localDigits, states), config.localDigits)
  const lines: string[] = []
  let total = 0
  for (let index = 0; index < config.localDigits; index++) {
    const digit = stateDigitFromCharCode(clean.charCodeAt(index))
    const choices = options ? options[String(index)] : undefined
    if (digit <= 0 && !choices) {
      continue
    }
    total++
    if (lines.length < maxEntries) {
      const value = choices ? `[${choices.split('').join(', ')}]` : stateChar(digit)
      lines.push(`  "${formatRulePattern(index, config)}": ${value}`)
    }
  }
  return {
    text: `{\n${lines.join(',\n')}\n}`,
    total,
    truncated: total > lines.length,
    supported: true,
  }
}

/**
 * Parses the JSON rule format into a local rule string. Patterns may use '#'
 * for "any state" and '/' to separate the rows of a multi-row rule; a list
 * value (`[1, 0]`) makes the template pick one of those states at random every
 * time it fires. Later entries win over earlier ones and every unlisted
 * pattern produces state 0.
 */
export function parseRuleJson(
  text: string,
  states: number,
  neighborhood: number = 3,
  depth: number = 1
): RuleJsonParseResult {
  const config = getConfig(states, neighborhood, depth)
  if (!canMaterializeLocal(config)) {
    return { rule: null, options: {}, error: 'This rule table is too large to be edited as JSON.', entries: 0, covered: 0 }
  }

  const body = stripComments(String(text || ''))
  const digits = new Uint8Array(config.localDigits)
  const options: Record<string, string> = {}
  let entries = 0
  let covered = 0

  PAIR_PATTERN.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = PAIR_PATTERN.exec(body)) !== null) {
    const rawKey = match[2]
    const rawValue = match[3]
    const key = rawKey.split(RULE_JSON_ROW_SEPARATOR).join('').trim()

    if (key.length !== config.taps) {
      return {
        rule: null,
        options: {},
        error: `Pattern "${rawKey}" has ${key.length} cells, expected ${config.taps} (${config.neighborhood} cells x ${config.depth} row(s)).`,
        entries,
        covered,
      }
    }

    // A bare digit is deterministic; a list is drawn from at random each time.
    let picks = ''
    for (const choice of valueOptions(rawValue)) {
      const value = stateDigitFromCharCode(choice.charCodeAt(0))
      if (choice.length !== 1 || value < 0 || value >= config.states) {
        return {
          rule: null,
          options: {},
          error: `Value "${choice}" of pattern "${rawKey}" is not a state between 0 and ${config.maxDigit}.`,
          entries,
          covered,
        }
      }
      picks += stateChar(value)
    }
    if (!picks) {
      return {
        rule: null,
        options: {},
        error: `Pattern "${rawKey}" lists no states.`,
        entries,
        covered,
      }
    }

    let base = 0
    const wildcardWeights: number[] = []
    for (let cell = 0; cell < key.length; cell++) {
      const weight = Math.pow(config.states, key.length - 1 - cell)
      if (key[cell] === RULE_JSON_ANY) {
        wildcardWeights.push(weight)
        continue
      }
      const digit = stateDigitFromCharCode(key.charCodeAt(cell))
      if (digit < 0 || digit >= config.states) {
        return {
          rule: null,
          options: {},
          error: `Pattern "${rawKey}" contains "${key[cell]}", expected a state between 0 and ${config.maxDigit} or "${RULE_JSON_ANY}".`,
          entries,
          covered,
        }
      }
      base += digit * weight
    }

    const first = stateDigitFromCharCode(picks.charCodeAt(0))
    const combinations = Math.pow(config.states, wildcardWeights.length)
    for (let combo = 0; combo < combinations; combo++) {
      let index = base
      let remaining = combo
      for (let w = 0; w < wildcardWeights.length; w++) {
        index += (remaining % config.states) * wildcardWeights[w]
        remaining = Math.floor(remaining / config.states)
      }
      // The rule string keeps the first option, so every consumer that ignores
      // the random choices (analysis, tags, PNG export) still sees a valid rule.
      digits[index] = first
      if (picks.length > 1) {
        options[String(index)] = picks
      } else {
        delete options[String(index)]
      }
      covered++
    }
    entries++
  }

  if (entries === 0) {
    return {
      rule: null,
      options: {},
      error: 'No patterns found. Expected entries such as "110": 1 between { and }.',
      entries: 0,
      covered: 0,
    }
  }

  let rule = ''
  for (let index = 0; index < config.localDigits; index++) {
    rule += stateChar(digits[index])
  }
  return { rule, options, error: null, entries, covered }
}
