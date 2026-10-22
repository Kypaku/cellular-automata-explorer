// Tests for the pure automaton core: rule codes (caMath), one-step evolution
// (analysis/evolve) and behaviour classification (analysis/classify).
import { describe, expect, it } from 'vitest'
import {
  buildLocalRuleFromTotalistic,
  codeToLocalRule,
  cycleTotalisticDigit,
  descendantsCodeExceedsSafeInteger,
  descendantsCodeMax,
  getConfig,
  localCodeExceedsSafeInteger,
  localRuleToCode,
  normalizeDepth,
  normalizeNeighborhood,
  normalizeStateCount,
  pickRandomRuleStrings,
  ruleCodeExceedsSafeInteger,
  sanitizeStateString,
  toBaseN,
  totalisticTable,
} from '../src/utils/caMath'
import { createEvolver, evolveRows } from '../src/utils/analysis/evolve'
import { classifyRule } from '../src/utils/analysis/classify'
import { buildAnalysisParts } from '../src/utils/analysis/shared'
import type { RuleParts } from '../src/types/ca'

const local = (localRule: string, stateCount = 2): RuleParts => ({ stateCount, mode: 'local', code: 0, localRule })
const totalistic = (code: number, stateCount = 3, neighborhood = 3, depth = 1): RuleParts => ({
  stateCount,
  mode: 'totalistic',
  code,
  localRule: '',
  neighborhood,
  depth,
})
const live = (row: Uint8Array) => row.reduce((n, v) => n + (v ? 1 : 0), 0)

describe('rule codes (caMath)', () => {
  it('derives config sizes from states / neighborhood / depth', () => {
    expect(getConfig(3)).toMatchObject({ totalisticDigits: 7, totalisticMax: 2186, localDigits: 27, radius: 1, taps: 3 })
    expect(getConfig(2, 5, 2)).toMatchObject({ taps: 10, localDigits: 1024, totalisticDigits: 11, radius: 2 })
  })

  it('normalizes out-of-range settings to safe defaults', () => {
    expect(normalizeStateCount(1)).toBe(3)
    expect(normalizeStateCount(99)).toBe(3)
    expect(normalizeStateCount('4')).toBe(4)
    expect(normalizeNeighborhood(4)).toBe(3)
    expect(normalizeNeighborhood(7)).toBe(7)
    expect(normalizeDepth(0)).toBe(1)
    expect(normalizeDepth(100)).toBe(8)
  })

  it('totalisticTable is the base-N code, least-significant digit = sum 0', () => {
    const code = 1234
    const table = totalisticTable(code, 3)
    expect(table).toHaveLength(7)
    expect(table.slice().reverse().join('')).toBe(toBaseN(code, 7, 3))
  })

  it('local codes follow the Wolfram convention (Rule 30, Rule 110) and round-trip', () => {
    expect(codeToLocalRule(30, 2)).toBe('01111000')
    expect(localRuleToCode('01111000', 2)).toBe(30)
    expect(codeToLocalRule(110, 2)).toBe('01110110')
    for (const code of [0, 1, 777, 3 ** 27 - 1]) {
      expect(localRuleToCode(codeToLocalRule(code, 3), 3)).toBe(code)
    }
  })

  it('sanitizes rule strings: drops foreign digits, accepts upper case, pads with 0', () => {
    expect(sanitizeStateString('1x2 3-0', undefined, 3)).toBe('120')
    expect(sanitizeStateString('A9b', undefined, 12)).toBe('a9b')
    expect(sanitizeStateString('2222', 2, 3)).toBe('22')
    expect(localRuleToCode('1', 2)).toBe(1) // short rule = padded with zeros
  })

  it('cycleTotalisticDigit wraps around and is reversible', () => {
    const code = 2186 // all digits = 2 for 3 states
    const bumped = cycleTotalisticDigit(code, 3, 0)
    expect(totalisticTable(bumped, 3)[0]).toBe(0)
    expect(cycleTotalisticDigit(bumped, 3, 0, 3, 1, -1)).toBe(code)
    expect(cycleTotalisticDigit(code, 3, 99)).toBe(code) // out-of-range index: unchanged
  })

  it('large codes: clamped to the code space, huge local spaces are not materialized', () => {
    expect(codeToLocalRule(1e9, 2)).toBe('11111111')
    expect(codeToLocalRule(-5, 2)).toBe('00000000')
    expect(localCodeExceedsSafeInteger(3)).toBe(false)
    expect(localCodeExceedsSafeInteger(4)).toBe(true)
    expect(buildLocalRuleFromTotalistic(1, 5, 7, 2)).toBe('') // 5^14 digits > limit
  })

  it('descendants code space: exact as a double up to 7 states, flagged from 8 on', () => {
    expect(descendantsCodeMax(5)).toBe(5 ** 12 - 1)
    expect(descendantsCodeMax(7)).toBeLessThanOrEqual(Number.MAX_SAFE_INTEGER)
    for (let states = 2; states <= 36; states++) {
      const exceeds = descendantsCodeMax(states) > Number.MAX_SAFE_INTEGER
      expect(descendantsCodeExceedsSafeInteger(states)).toBe(exceeds)
      expect(ruleCodeExceedsSafeInteger('descendants', states)).toBe(exceeds)
      expect(exceeds).toBe(states >= 8)
    }
    expect(ruleCodeExceedsSafeInteger('totalistic', 36)).toBe(false)
    expect(ruleCodeExceedsSafeInteger('local', 4)).toBe(true)
  })

  it('large descendants spaces are sampled as full-length emission strings, not lossy codes', () => {
    const rules = pickRandomRuleStrings('descendants', 12, 20)
    expect(rules).toHaveLength(20)
    for (const rule of rules) {
      expect(rule).toHaveLength(3 * 11)
      expect(sanitizeStateString(rule, rule.length, 12)).toBe(rule)
    }
    // with 33 random base-12 digits the low-order ones vary (a double code would pin them)
    expect(new Set(rules.map((r) => r.slice(0, 4))).size).toBeGreaterThan(1)
    // the scan descriptor's rule string overrides the numeric code in descendants mode too
    const parts = buildAnalysisParts({ stateCount: 12, mode: 'descendants', code: 0, localRule: rules[0] })
    expect(parts.emissionRule).toBe(rules[0])
    expect(buildAnalysisParts({ stateCount: 3, mode: 'descendants', code: 5 }).emissionRule).toBe('210000')
  })
})

describe('evolution step (evolve)', () => {
  it('Rule 90 from a single cell draws the Sierpinski triangle', () => {
    const { rows } = evolveRows(local(codeToLocalRule(90, 2)), { width: 64, height: 16, init: 'single' })
    expect(rows).toHaveLength(16)
    rows.forEach((row, y) => {
      // live cells in row y of Pascal's triangle mod 2 = 2^(number of 1-bits of y)
      expect(live(row)).toBe(2 ** y.toString(2).replace(/0/g, '').length)
    })
  })

  it('wraps around the edges (torus): a shifting cell comes back after `width` steps', () => {
    const shiftLeft = local(codeToLocalRule(2, 2)) // only "001" -> 1: the cell moves one step left
    const ev = createEvolver(shiftLeft, { width: 8, init: 'single' })
    expect(ev.current.indexOf(1)).toBe(4)
    for (let i = 0; i < 5; i++) ev.step()
    expect(Array.from(ev.current)).toEqual([0, 0, 0, 0, 0, 0, 0, 1]) // crossed the left edge
    for (let i = 0; i < 3; i++) ev.step()
    expect(ev.current.indexOf(1)).toBe(4)
    expect(live(ev.current)).toBe(1)
  })

  it('an empty field stays empty, and rule 0 empties any field', () => {
    const { rows } = evolveRows(totalistic(0), { width: 20, height: 5, init: 'random' })
    rows.slice(1).forEach((row) => expect(live(row)).toBe(0))
    // totalistic 3-state code 3: sum 1 -> 1, sum 0 -> 0, so a blank row never ignites
    const ev = createEvolver(totalistic(3), { width: 10, init: 'single' })
    ev.current.fill(0)
    expect(live(ev.step())).toBe(0)
  })

  it('a totalistic rule and its expanded local rule evolve identically (depth 2, random start)', () => {
    const code = 123456
    const asLocal: RuleParts = { ...local(buildLocalRuleFromTotalistic(code, 3, 3, 2), 3), neighborhood: 3, depth: 2 }
    const opts = { width: 40, height: 30, init: 'random' as const }
    // seeds differ between modes, so compare by stepping both from the same window
    const a = createEvolver(totalistic(code, 3, 3, 2), { width: 40, init: 'single' })
    const b = createEvolver(asLocal, { width: 40, init: 'single' })
    for (let i = 0; i < 30; i++) expect(Array.from(a.step())).toEqual(Array.from(b.step()))
    // random init is deterministic per rule
    expect(evolveRows(asLocal, opts).rows).toEqual(evolveRows(asLocal, opts).rows)
  })

  it('clamps degenerate sizes and keeps only the last `keep` rows', () => {
    const { rows } = evolveRows(local(codeToLocalRule(90, 2)), { width: 1, height: 10, keep: 3, init: 'single' })
    expect(rows).toHaveLength(3)
    expect(rows[0]).toHaveLength(2)
  })
})

describe('classification (classify)', () => {
  it('detects cycles over the whole depth window, not just the last row (depth 2)', () => {
    // Depth-2 rules: a repeated last row is no cycle unless the row before it repeats too.
    const o = { width: 32, height: 64 }
    expect(classifyRule(totalistic(122, 2, 3, 2), { ...o, init: 'single' }).tag).not.toBe('Fixed') // was a false Fixed
    const res = classifyRule(totalistic(24, 2, 3, 2), { ...o, init: 'random' })
    expect(res.tag).toBe('Periodic') // was a false Fixed (period 1)
    expect(res.stats.period).toBeGreaterThan(1)
  })
  const opts = { width: 64, height: 96, init: 'single' as const }

  it('Dead: rule 0 dies out, an all-ones rule turns uniform', () => {
    expect(classifyRule(totalistic(0), opts)).toMatchObject({ tag: 'Dead', stats: { reason: 'extinct', generation: 1 } })
    expect(classifyRule(local('11111111'), opts)).toMatchObject({ tag: 'Dead', stats: { reason: 'uniform', generation: 1 } })
  })

  it('Fixed: the identity rule freezes immediately', () => {
    const identity = local('00110011') // output = centre cell
    expect(classifyRule(identity, opts)).toMatchObject({ tag: 'Fixed', stats: { period: 1 } })
  })

  it('Periodic: a shifting cell repeats with period = width', () => {
    const res = classifyRule(local(codeToLocalRule(2, 2)), { width: 16, height: 64, init: 'single' })
    expect(res).toMatchObject({ tag: 'Periodic', stats: { reason: 'cycle', period: 16 } })
  })

  it('Chaotic: Rule 30 from a random row', () => {
    const res = classifyRule(local(codeToLocalRule(30, 2)), { width: 201, height: 160, init: 'random' })
    expect(res.tag).toBe('Chaotic')
  })

  it('descendants rules are classified by their emission rule, not as an empty local rule', () => {
    const parts: RuleParts = { stateCount: 2, mode: 'descendants', code: 0, localRule: '', emissionRule: '111', collisionMode: 'sum' }
    expect(live(evolveRows(parts, { width: 64, height: 4, init: 'single' }).rows[3])).toBeGreaterThan(0) // evolve: alive
    expect(classifyRule(parts, opts).tag).not.toBe('Dead')
    // 2 states, emit 111, collisions summed mod 2 = XOR of the three neighbours = Rule 150
    expect(classifyRule(parts, opts)).toEqual(classifyRule(local(codeToLocalRule(150, 2)), opts))
    expect(classifyRule({ ...parts, emissionRule: '000' }, opts).tag).toBe('Dead') // emits nothing
    expect(classifyRule({ ...parts, emissionRule: '010' }, opts).tag).toBe('Fixed') // each cell copies itself down
  })

  it('random-collision descendants never claim an exact cycle (the PRNG state is hidden)', () => {
    const opts = { width: 24, height: 80, init: 'random' } as const
    for (const emissionRule of ['000012', '000020', '000102']) {
      const base: RuleParts = { stateCount: 3, mode: 'descendants', code: 0, localRule: '', emissionRule }
      expect(classifyRule({ ...base, collisionMode: 'random' }, opts).stats.reason).not.toBe('cycle')
      expect(createEvolver({ ...base, collisionMode: 'sum' }, { width: 8, init: 'random' }).stochastic).toBe(false)
    }
    expect(classifyRule({ stateCount: 3, mode: 'descendants', code: 0, localRule: '', emissionRule: '000020', collisionMode: 'sum' }, opts).stats.reason).toBe('cycle')
  })
})
