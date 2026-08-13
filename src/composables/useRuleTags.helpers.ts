// Pure, non-reactive helpers backing useRuleTags: localStorage (de)serialization,
// id generation, record normalization and rule identity/name derivation.
import type { RuleParts, TaggedRule } from '../types/ca'
import { trySetItem } from './useStorageWarning'

export const TAGS_STORAGE_KEY = 'ca-rule-tags'
export const RULES_STORAGE_KEY = 'ca-tagged-rules'

let uidCounter = 0
export function nextId(): string {
  uidCounter += 1
  return `${Date.now()}-${uidCounter}`
}

export function loadJSON(key: string, fallback: unknown[]): unknown[] {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) {
      return fallback
    }
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : fallback
  } catch {
    return fallback
  }
}

export function saveJSON(key: string, value: unknown): void {
  try {
    trySetItem(key, JSON.stringify(value))
  } catch {
    // ignore serialization errors (circular refs, etc.) - the storage warning
    // only concerns localStorage.setItem itself
  }
}

export function normalizeRule(rule: unknown): TaggedRule | null {
  if (!rule || typeof rule !== 'object') {
    return null
  }
  const candidate = rule as Partial<TaggedRule>
  if (!candidate.snapshot) {
    return null
  }
  return {
    id: typeof candidate.id === 'string' ? candidate.id : nextId(),
    name: typeof candidate.name === 'string' && candidate.name.trim() ? candidate.name : 'rule',
    signature: typeof candidate.signature === 'string' ? candidate.signature : null,
    tags: Array.isArray(candidate.tags) ? candidate.tags.filter((t): t is string => typeof t === 'string') : [],
    snapshot: candidate.snapshot,
    createdAt: typeof candidate.createdAt === 'number' ? candidate.createdAt : Date.now(),
  }
}

/** Canonical string identifying "the same rule" regardless of init/seed/height. */
export function signatureOf(parts: RuleParts): string {
  if (parts.mode === 'descendants') {
    return `${parts.stateCount}|descendants|${parts.emissionRule || ''}|${parts.collisionMode || 'sum'}|${parts.collisionFixed ?? 0}`
  }
  // The neighborhood/depth suffix is appended only when it differs from the
  // classic 3-cell single-row rule, so signatures saved before those features
  // existed stay valid.
  const shape = shapeSuffix(parts)
  return parts.mode === 'totalistic'
    ? `${parts.stateCount}|totalistic|${parts.code}${shape}`
    : `${parts.stateCount}|local|${parts.localRule}${shape}`
}

/** `|neighborhood|depth` suffix, empty for the default 3-cell / 1-row shape. */
function shapeSuffix(parts: RuleParts): string {
  const neighborhood = parts.neighborhood ?? 3
  const depth = parts.depth ?? 1
  return neighborhood === 3 && depth === 1 ? '' : `|${neighborhood}|${depth}`
}

export function defaultRuleName(parts: RuleParts): string {
  if (parts.mode === 'descendants') {
    const collision = parts.collisionMode === 'fixed' ? `fixed ${parts.collisionFixed ?? 0}` : parts.collisionMode || 'sum'
    return `${parts.stateCount} states, descendants ${parts.emissionRule || ''} (${collision})`
  }
  const neighborhood = parts.neighborhood ?? 3
  const depth = parts.depth ?? 1
  const shape = neighborhood === 3 && depth === 1 ? '' : `, ${neighborhood} cells x ${depth} rows`
  return parts.mode === 'totalistic'
    ? `${parts.stateCount} states, totalistic ${parts.code}${shape}`
    : `${parts.stateCount} states, local ${parts.localRule}${shape}`
}
