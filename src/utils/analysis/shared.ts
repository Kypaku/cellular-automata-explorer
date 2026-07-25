// Shared low-level helpers used across the analysis modules: a seedable PRNG,
// a stable string hash (to derive per-rule seeds) and the initial-row builder.
import type { AnalysisInitMode, CollisionMode, RuleMode, RuleParts, RuleSnapshot } from '../../types/ca'
import {
  codeToLocalRule,
  codeToEmissionRule,
  buildLocalRuleFromTotalistic,
  clampCollisionFixed,
  DEFAULT_COLLISION_MODE,
  DEFAULT_COLLISION_FIXED,
} from '../caMath'

/** Small, fast, seedable PRNG so classification is reproducible per rule. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function random(): number {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** FNV-1a hash of a string, used to derive a stable seed for local rules. */
export function hashString(str: string): number {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function buildInitialRow(
  width: number,
  states: number,
  initMode: AnalysisInitMode,
  rand: () => number
): Uint8Array {
  const row = new Uint8Array(width)
  if (initMode === 'single') {
    row[width >> 1] = 1
    return row
  }
  for (let i = 0; i < width; i++) {
    row[i] = Math.floor(rand() * states)
  }
  return row
}

/**
 * A single candidate rule for a batch scan. `code` is the sequential/random
 * index the scan walks; the optional overrides let a caller supply a rule
 * string directly (used for large local spaces sampled as digit strings). For
 * descendants mode `collisionMode`/`collisionFixed` carry the user's selected
 * collision strategy, held fixed while the emission rule is what varies.
 */
export interface RuleDescriptor {
  stateCount: number
  mode: RuleMode
  code: number
  localRule?: string
  /** Totalistic/local mode: cells read from the previous row (3, 5 or 7; default 3). */
  neighborhood?: number
  /** Totalistic/local mode: how many previous rows the rule reads (default 1). */
  depth?: number
  collisionMode?: CollisionMode
  collisionFixed?: number
}

/** Builds the classifier `RuleParts` for one scanned candidate rule. */
export function buildAnalysisParts(d: RuleDescriptor): RuleParts {
  if (d.mode === 'descendants') {
    return {
      stateCount: d.stateCount,
      mode: 'descendants',
      code: 0,
      localRule: '',
      emissionRule: codeToEmissionRule(d.code, d.stateCount),
      collisionMode: d.collisionMode || DEFAULT_COLLISION_MODE,
      collisionFixed: clampCollisionFixed(d.collisionFixed ?? DEFAULT_COLLISION_FIXED, d.stateCount),
    }
  }
  const neighborhood = d.neighborhood ?? 3
  const depth = d.depth ?? 1
  return d.mode === 'totalistic'
    ? { stateCount: d.stateCount, mode: 'totalistic', code: d.code, localRule: '', neighborhood, depth }
    : {
        stateCount: d.stateCount,
        mode: 'local',
        code: 0,
        localRule: d.localRule ?? codeToLocalRule(d.code, d.stateCount, neighborhood, depth),
        neighborhood,
        depth,
      }
}

/** Builds the reusable `RuleSnapshot` for one scanned candidate rule. */
export function buildAnalysisSnapshot(d: RuleDescriptor, init: AnalysisInitMode, height: number): RuleSnapshot {
  const normInit: 'single' | 'random' = init === 'single' ? 'single' : 'random'
  if (d.mode === 'descendants') {
    return {
      stateCount: d.stateCount,
      mode: 'descendants',
      code: 0,
      localRule: '',
      emissionRule: codeToEmissionRule(d.code, d.stateCount),
      collisionMode: d.collisionMode || DEFAULT_COLLISION_MODE,
      collisionFixed: clampCollisionFixed(d.collisionFixed ?? DEFAULT_COLLISION_FIXED, d.stateCount),
      init: normInit,
      seed: '',
      height,
    }
  }
  const neighborhood = d.neighborhood ?? 3
  const depth = d.depth ?? 1
  const localRule =
    d.mode === 'local'
      ? d.localRule ?? codeToLocalRule(d.code, d.stateCount, neighborhood, depth)
      : buildLocalRuleFromTotalistic(d.code, d.stateCount, neighborhood, depth)
  return {
    stateCount: d.stateCount,
    mode: d.mode,
    code: d.mode === 'totalistic' ? d.code : 0,
    localRule,
    neighborhood,
    depth,
    init: normInit,
    seed: '',
    height,
  }
}
