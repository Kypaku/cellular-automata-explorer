// Edge cases of the automaton core: single rule steps checked cell by cell,
// rule-code helpers that tests/caCore.test.ts does not cover, and the
// statistical (no-cycle) branch of the classifier.
import { describe, expect, it } from 'vitest'
import {
  buildLocalRuleFromTotalistic,
  clampCollisionFixed,
  codeToEmissionRule,
  codeToLocalRule,
  cycleEmissionDigit,
  cycleLocalRuleDigit,
  defaultEmissionRule,
  emissionTable,
  getConfig,
  localRuleToCode,
  partsFromSnapshot,
  pickRandomCodes,
  sanitizeEmissionRule,
  stateChar,
  toBaseN,
  totalisticTable,
} from '../src/utils/caMath'
import { createEvolver, evolveRows } from '../src/utils/analysis/evolve'
import { classifyRule } from '../src/utils/analysis/classify'
import type { CollisionMode, RuleParts } from '../src/types/ca'

const local = (localRule: string, stateCount = 2, neighborhood = 3, depth = 1): RuleParts => ({
  stateCount,
  mode: 'local',
  code: 0,
  localRule,
  neighborhood,
  depth,
})
const totalistic = (code: number, stateCount = 3, neighborhood = 3, depth = 1): RuleParts => ({
  stateCount,
  mode: 'totalistic',
  code,
  localRule: '',
  neighborhood,
  depth,
})
const descendants = (emissionRule: string, stateCount: number, collisionMode: CollisionMode, collisionFixed = 0): RuleParts => ({
  stateCount,
  mode: 'descendants',
  code: 0,
  localRule: '',
  emissionRule,
  collisionMode,
  collisionFixed,
})

/** Runs one step of `parts` from the given row (depth 1 rules). */
function stepFrom(parts: RuleParts, cells: number[]): number[] {
  const ev = createEvolver(parts, { width: cells.length, init: 'single' })
  ev.current.set(cells)
  return Array.from(ev.step())
}

/** Reference step for a depth-1 local rule (Wolfram index, torus). */
function referenceLocalStep(rule: string, states: number, radius: number, cells: number[]): number[] {
  const w = cells.length
  return cells.map((_, k) => {
    let index = 0
    for (let d = -radius; d <= radius; d++) index = index * states + cells[(k + d + w) % w]
    return Number.parseInt(rule[index] ?? '0', 36)
  })
}

describe('rule step, cell by cell', () => {
  it('totalistic: the output is the table digit of the neighbour sum', () => {
    const code = 1234 // 3 states, digits (low first) = 1,0,2,0,2,1,0
    const table = totalisticTable(code, 3)
    const row = [0, 1, 2, 2, 0, 1, 0, 2]
    const expected = row.map((_, k) => table[row[(k + 7) % 8] + row[k] + row[(k + 1) % 8]])
    expect(stepFrom(totalistic(code), row)).toEqual(expected)
  })

  it('totalistic with a 5-cell neighbourhood sums radius-2 windows', () => {
    const code = 987654321
    const table = totalisticTable(code, 3, 5)
    expect(table).toHaveLength(getConfig(3, 5).totalisticDigits) // 11 sums: 0..10
    const row = [2, 2, 0, 1, 2, 0, 0, 1, 2, 1]
    const w = row.length
    const expected = row.map((_, k) => {
      let s = 0
      for (let d = -2; d <= 2; d++) s += row[(k + d + w) % w]
      return table[s]
    })
    expect(stepFrom(totalistic(code, 3, 5), row)).toEqual(expected)
  })

  it('local rules (3 and 5 cells) match a reference implementation of the Wolfram index', () => {
    const rule3 = codeToLocalRule(5_000_000_000_000, 3) // 27 digits, 3 states
    const row3 = [0, 2, 1, 1, 0, 2, 2, 1, 0]
    expect(stepFrom(local(rule3, 3), row3)).toEqual(referenceLocalStep(rule3, 3, 1, row3))
    const rule5 = Array.from({ length: 32 }, (_, i) => String((i * 7 + 3) % 2)).join('') // 2 states, 5 cells
    const row5 = [1, 0, 0, 1, 1, 1, 0, 1, 0, 0, 0, 1]
    expect(stepFrom(local(rule5, 2, 5), row5)).toEqual(referenceLocalStep(rule5, 2, 2, row5))
  })

  it('totalistic and expanded local rules agree for 5-cell neighbourhoods too', () => {
    const code = 424242
    const a = createEvolver(totalistic(code, 3, 5), { width: 30, init: 'single' })
    const b = createEvolver(local(buildLocalRuleFromTotalistic(code, 3, 5), 3, 5), { width: 30, init: 'single' })
    for (let i = 0; i < 20; i++) expect(Array.from(a.step())).toEqual(Array.from(b.step()))
  })

  it('depth 2 reads the older row too (older row = most significant digits)', () => {
    // 2 states, 3 cells, depth 2: the output is the centre cell of the OLDER row.
    const rule = Array.from({ length: 64 }, (_, i) => String((i >> 4) & 1)).join('')
    const ev = createEvolver(local(rule, 2, 3, 2), { width: 8, init: 'single' })
    const row0 = Array.from(ev.current)
    expect(Array.from(ev.step())).toEqual(new Array(8).fill(0)) // row 1 = pre-history (zeros)
    expect(Array.from(ev.step())).toEqual(row0) // row 2 = row 0
  })

  it('descendants: a lone emitter passes its children through unchanged', () => {
    // 3 states: state 1 emits (left 2, centre 0, right 1), state 2 emits nothing.
    const parts = descendants('201000', 3, 'sum')
    expect(stepFrom(parts, [0, 0, 0, 1, 0, 0, 0, 0])).toEqual([0, 0, 2, 0, 1, 0, 0, 0])
  })

  it('descendants: collisions are merged by sum mod states, a fixed state or a seeded random state', () => {
    // state 1 emits 1 into all three children; neighbours 1_1 collide in the middle.
    const row = [0, 1, 0, 1, 0, 0]
    expect(stepFrom(descendants('111111', 3, 'sum'), row)).toEqual([1, 1, 2, 1, 1, 0])
    expect(stepFrom(descendants('111111', 3, 'fixed', 2), row)).toEqual([1, 1, 2, 1, 1, 0])
    expect(stepFrom(descendants('111111', 3, 'fixed', 0), row)).toEqual([1, 1, 0, 1, 1, 0])
    // three live signals: 1+1+1 = 3 = 0 mod 3
    expect(stepFrom(descendants('111111', 3, 'sum'), [0, 1, 1, 1, 0, 0])).toEqual([1, 2, 0, 2, 1, 0])
    // random: only collision cells draw, and the result is reproducible
    const ev = createEvolver(descendants('111111', 3, 'random'), { width: 6, init: 'single' })
    ev.current.set(row)
    const next = Array.from(ev.step())
    expect(ev.draws).toBe(1)
    expect([next[0], next[1], next[3], next[4], next[5]]).toEqual([1, 1, 1, 1, 0])
    expect(stepFrom(descendants('111111', 3, 'random'), row)).toEqual(next)
  })

  it('evolveRows keeps the newest rows, oldest first', () => {
    const parts = local(codeToLocalRule(90, 2))
    const all = evolveRows(parts, { width: 32, height: 12, init: 'single' }).rows
    const tail = evolveRows(parts, { width: 32, height: 12, keep: 4, init: 'single' }).rows
    expect(tail).toEqual(all.slice(-4))
    expect(evolveRows(parts, { width: 32, height: 0, init: 'single' }).rows).toHaveLength(1) // height clamps to 1
  })
})

describe('rule-code helpers', () => {
  it('toBaseN pads and uses base-36 digits', () => {
    expect(toBaseN(0, 3, 2)).toBe('000')
    expect(toBaseN(35, 2, 36)).toBe('0z')
    expect(toBaseN(5, 2, 2)).toBe('01') // too narrow: the high digits are cut off
    expect(stateChar(10)).toBe('a')
    expect(stateChar(99)).toBe('0')
  })

  it('totalistic code 0 / max produce all-zero / all-max tables; higher digits are ignored', () => {
    expect(totalisticTable(0, 4)).toEqual(new Array(10).fill(0))
    const max = getConfig(4).totalisticMax
    expect(totalisticTable(max, 4)).toEqual(new Array(10).fill(3))
    expect(totalisticTable(max + 1, 4)).toEqual(new Array(10).fill(0))
  })

  it('cycleLocalRuleDigit steps one digit both ways and ignores bad indices', () => {
    expect(cycleLocalRuleDigit('00000000', 2, 3)).toBe('00010000')
    expect(cycleLocalRuleDigit('00000000000000000000000000', 3, 26, 3, 1, -1)).toBe('000000000000000000000000002')
    expect(cycleLocalRuleDigit('0110', 2, -1)).toBe('01100000') // padded, unchanged
    expect(cycleLocalRuleDigit('0110', 2, 8)).toBe('01100000')
  })

  it('local code <-> string round-trips for 5-cell and depth-2 spaces', () => {
    for (const code of [0, 1, 2 ** 31 + 7, 2 ** 32 - 1]) {
      expect(localRuleToCode(codeToLocalRule(code, 2, 5), 2, 5)).toBe(code)
    }
    for (const code of [0, 12345, 2 ** 40 + 3]) {
      expect(localRuleToCode(codeToLocalRule(code, 2, 3, 2), 2, 3, 2)).toBe(code)
    }
  })

  it('emission rules: default, sanitize/pad, table, code round-trip, digit cycling', () => {
    expect(defaultEmissionRule(4)).toBe('111222333')
    expect(sanitizeEmissionRule('2x9', 3)).toBe('200000')
    expect(emissionTable('12', 3)).toEqual([1, 2, 0, 0, 0, 0])
    expect(codeToEmissionRule(1, 3)).toBe('100000') // low-order digit first
    expect(codeToEmissionRule(-1, 3)).toBe('000000')
    expect(codeToEmissionRule(1e20, 3)).toBe('222222') // clamped to the code space
    expect(cycleEmissionDigit('222222', 3, 5)).toBe('222220')
    expect(cycleEmissionDigit('000000', 3, 0, -1)).toBe('200000')
    expect(cycleEmissionDigit('000000', 3, 6)).toBe('000000')
  })

  it('clampCollisionFixed keeps the value inside 0..states-1', () => {
    expect(clampCollisionFixed(5, 3)).toBe(2)
    expect(clampCollisionFixed(-1, 3)).toBe(0)
    expect(clampCollisionFixed('x', 3)).toBe(0)
    expect(clampCollisionFixed(1.9, 4)).toBe(1)
  })

  it('partsFromSnapshot normalizes old / partial snapshots', () => {
    const base = { code: 0, localRule: '' }
    expect(partsFromSnapshot({ ...base, stateCount: 99, mode: 'totalistic', code: 5 } as never)).toEqual(totalistic(5, 3, 3, 1))
    expect(partsFromSnapshot({ ...base, stateCount: 2, mode: 'local', localRule: '0110', neighborhood: 4, depth: 0 } as never)).toEqual(
      local('0110', 2, 3, 1)
    )
    expect(partsFromSnapshot({ ...base, stateCount: 3, mode: 'descendants', collisionFixed: 9 } as never)).toEqual(
      descendants('111222', 3, 'sum', 2)
    )
  })

  it('pickRandomCodes: the whole range when it is small, unique sorted samples otherwise', () => {
    expect(pickRandomCodes(5, 8, 10)).toEqual([5, 6, 7, 8])
    expect(pickRandomCodes(3, 1, 10)).toEqual([3]) // inverted range collapses to `from`
    const sample = pickRandomCodes(0, 1e9, 50)
    expect(sample).toHaveLength(50)
    expect(new Set(sample).size).toBe(50)
    expect(sample).toEqual(sample.slice().sort((a, b) => a - b))
    sample.forEach((c) => expect(c >= 0 && c <= 1e9).toBe(true))
  })
})

describe('classification: statistics branch', () => {
  it('Stable: a drifting cell that cannot repeat within the height', () => {
    const res = classifyRule(local(codeToLocalRule(2, 2)), { width: 64, height: 32, init: 'single' })
    expect(res).toMatchObject({ tag: 'Stable', stats: { reason: 'window', generation: 32 } })
  })

  it('threshold options override the defaults', () => {
    const rule30 = local(codeToLocalRule(30, 2))
    const opts = { width: 201, height: 160, init: 'random' as const }
    expect(classifyRule(rule30, opts).tag).toBe('Chaotic')
    // flux can never reach 2, and with fill <= 0 nothing is sparse enough: Undefined
    expect(classifyRule(rule30, { ...opts, chaosFlux: 2, sparseFill: 0 }).tag).toBe('Undefined')
    // flux can never reach 2, but every fill counts as sparse: Complex
    expect(classifyRule(rule30, { ...opts, chaosFlux: 2, sparseFill: 1 }).tag).toBe('Complex')
  })

  it('is deterministic: the same rule gives the same result', () => {
    const parts = totalistic(777, 3)
    const opts = { width: 80, height: 120, init: 'random' as const }
    expect(classifyRule(parts, opts)).toEqual(classifyRule(parts, opts))
  })

  it('clamps tiny sizes to at least 8 x 8', () => {
    const shift = local(codeToLocalRule(2, 2))
    expect(classifyRule(shift, { width: 1, height: 100, init: 'single' })).toMatchObject({ tag: 'Periodic', stats: { period: 8 } })
    expect(classifyRule(shift, { width: 100, height: 1, init: 'single' })).toMatchObject({ tag: 'Stable', stats: { generation: 8 } })
  })
})
