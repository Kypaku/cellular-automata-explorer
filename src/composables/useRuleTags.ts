import { reactive, ref, computed, watch } from 'vue'
import { ANALYSIS_TAGS } from '../constants/ca'
import type { RuleParts, RuleSnapshot, TaggedRule } from '../types/ca'
import {
  RULES_STORAGE_KEY,
  TAGS_STORAGE_KEY,
  defaultRuleName,
  loadJSON,
  nextId,
  normalizeRule,
  saveJSON,
  signatureOf,
} from './useRuleTags.helpers'

/**
 * Manages an editable list of tags plus a library of saved CA rule
 * snapshots that can be tagged, filtered and navigated through. State is
 * persisted to localStorage and can also be exported/imported as a JSON
 * file so a tag/rule library can be shared between browsers.
 */

// Tag names owned by the automatic analysis; a rule keeps at most one of them.
const ANALYSIS_TAG_SET = new Set<string>(Object.values(ANALYSIS_TAGS))

export function useRuleTags() {
  const tags = reactive<string[]>((loadJSON(TAGS_STORAGE_KEY, []) as unknown[]).filter((t): t is string => typeof t === 'string'))
  const rules = reactive<TaggedRule[]>(
    loadJSON(RULES_STORAGE_KEY, [])
      .map(normalizeRule)
      .filter((rule): rule is TaggedRule => rule !== null)
  )

  const activeTag = ref<string | null>(null)
  const activeIndex = ref(0)

  watch(tags, () => saveJSON(TAGS_STORAGE_KEY, tags), { deep: true })
  watch(rules, () => saveJSON(RULES_STORAGE_KEY, rules), { deep: true })

  const rulesForActiveTag = computed<TaggedRule[]>(() => {
    if (!activeTag.value) {
      return []
    }
    return rules.filter((rule) => Array.isArray(rule.tags) && rule.tags.includes(activeTag.value as string))
  })

  const activeRule = computed<TaggedRule | null>(() => rulesForActiveTag.value[activeIndex.value] || null)

  const tagCounts = computed<Record<string, number>>(() => {
    const counts: Record<string, number> = {}
    for (const tag of tags) {
      counts[tag] = 0
    }
    for (const rule of rules) {
      for (const tag of rule.tags) {
        if (tag in counts) {
          counts[tag] += 1
        }
      }
    }
    return counts
  })

  const navStatusText = computed(() => {
    if (!activeTag.value) {
      return ''
    }
    const total = rulesForActiveTag.value.length
    return total ? `${activeIndex.value + 1}/${total}` : 'no rules with this tag'
  })

  function addTag(name: string): void {
    const clean = String(name || '').trim()
    if (!clean || tags.includes(clean)) {
      return
    }
    tags.push(clean)
  }

  function renameTag(oldName: string, newName: string): void {
    const clean = String(newName || '').trim()
    const idx = tags.indexOf(oldName)
    if (!clean || idx === -1 || clean === oldName || tags.includes(clean)) {
      return
    }
    tags.splice(idx, 1, clean)
    rules.forEach((rule) => {
      const tagIdx = rule.tags.indexOf(oldName)
      if (tagIdx !== -1) {
        rule.tags.splice(tagIdx, 1, clean)
      }
    })
    if (activeTag.value === oldName) {
      activeTag.value = clean
    }
  }

  function deleteTag(name: string): void {
    const idx = tags.indexOf(name)
    if (idx === -1) {
      return
    }
    tags.splice(idx, 1)
    rules.forEach((rule) => {
      const tagIdx = rule.tags.indexOf(name)
      if (tagIdx !== -1) {
        rule.tags.splice(tagIdx, 1)
      }
    })
    if (activeTag.value === name) {
      activeTag.value = null
      activeIndex.value = 0
    }
  }

  function selectTag(name: string): void {
    activeTag.value = activeTag.value === name ? null : name
    activeIndex.value = 0
  }

  function closeBrowse(): void {
    activeTag.value = null
    activeIndex.value = 0
  }

  /** Returns the tags currently attached to the rule matching `parts` (or []). */
  function tagsForRule(parts: RuleParts): string[] {
    const sig = signatureOf(parts)
    const existing = rules.find((rule) => rule.signature === sig)
    return existing ? existing.tags : []
  }

  /** Toggles `tagName` on the rule identified by `parts`, auto-creating or removing the record and persisting immediately. */
  function toggleTagOnRule(tagName: string, parts: RuleParts, snapshot: RuleSnapshot): void {
    if (!tags.includes(tagName)) {
      return
    }
    const sig = signatureOf(parts)
    const existing = rules.find((rule) => rule.signature === sig)
    if (existing) {
      const idx = existing.tags.indexOf(tagName)
      if (idx !== -1) {
        existing.tags.splice(idx, 1)
        if (!existing.tags.length) {
          rules.splice(rules.indexOf(existing), 1)
        }
      } else {
        existing.tags.push(tagName)
        existing.snapshot = snapshot
      }
      return
    }
    rules.push({
      id: nextId(),
      name: defaultRuleName(parts),
      signature: sig,
      tags: [tagName],
      snapshot,
      createdAt: Date.now(),
    })
  }

  function deleteRule(id: string): void {
    const idx = rules.findIndex((rule) => rule.id === id)
    if (idx === -1) {
      return
    }
    rules.splice(idx, 1)
    const total = rulesForActiveTag.value.length
    if (activeIndex.value >= total) {
      activeIndex.value = Math.max(0, total - 1)
    }
  }

  /**
   * Strips `tagName` from every rule that carries it (dropping the rule record
   * entirely if that was its only tag). Unlike {@link deleteTag} the tag itself
   * stays registered in `tags`, so an orthogonal analysis tag (e.g. `customSearch`)
   * keeps working afterwards with a zero count. Used for a "clear all" wipe of one
   * tag without disturbing user-created tags or other rule tags.
   */
  function clearTag(tagName: string): void {
    for (let i = rules.length - 1; i >= 0; i--) {
      const rule = rules[i]
      const idx = rule.tags.indexOf(tagName)
      if (idx === -1) {
        continue
      }
      rule.tags.splice(idx, 1)
      if (!rule.tags.length) {
        rules.splice(i, 1)
      }
    }
    if (activeTag.value === tagName) {
      const total = rulesForActiveTag.value.length
      if (activeIndex.value >= total) {
        activeIndex.value = Math.max(0, total - 1)
      }
    }
  }

  /**
   * Attaches an analysis class tag to the rule identified by `parts`, creating the
   * tag and/or the rule record if needed. Any previously assigned analysis tag on
   * that rule is replaced (a rule has at most one class), while user tags are kept.
   */
  function applyAnalysisTag(tagName: string, parts: RuleParts, snapshot: RuleSnapshot): void {
    if (!ANALYSIS_TAG_SET.has(tagName)) {
      return
    }
    if (!tags.includes(tagName)) {
      tags.push(tagName)
    }
    const sig = signatureOf(parts)
    const existing = rules.find((rule) => rule.signature === sig)
    if (existing) {
      existing.snapshot = snapshot
      existing.tags = existing.tags.filter((t) => !ANALYSIS_TAG_SET.has(t))
      existing.tags.push(tagName)
      return
    }
    rules.push({
      id: nextId(),
      name: defaultRuleName(parts),
      signature: sig,
      tags: [tagName],
      snapshot,
      createdAt: Date.now(),
    })
  }

  /**
   * (De)attaches an orthogonal (non-class) tag — `Fields`, `Gliders` or
   * `customSearch` — to the rule identified by `parts` according to `active`.
   * These tags are independent of the class tags, so any of them can coexist
   * with a class tag and with each other. When `active` is false the tag is
   * removed (and an otherwise-empty record is dropped); when true the record is
   * created if needed.
   */
  function setOrthogonalTag(tagName: string, active: boolean, parts: RuleParts, snapshot: RuleSnapshot): void {
    const sig = signatureOf(parts)
    const existing = rules.find((rule) => rule.signature === sig)
    if (active && !tags.includes(tagName)) {
      tags.push(tagName)
    }
    if (existing) {
      existing.snapshot = snapshot
      const idx = existing.tags.indexOf(tagName)
      if (active && idx === -1) {
        existing.tags.push(tagName)
      } else if (!active && idx !== -1) {
        existing.tags.splice(idx, 1)
        if (!existing.tags.length) {
          rules.splice(rules.indexOf(existing), 1)
        }
      }
      return
    }
    if (active) {
      rules.push({
        id: nextId(),
        name: defaultRuleName(parts),
        signature: sig,
        tags: [tagName],
        snapshot,
        createdAt: Date.now(),
      })
    }
  }

  /**
   * (De)attaches an arbitrary orthogonal tag (`tagName`) to the rule identified by
   * `parts` according to `active`, registering the tag if needed. Used by every
   * batch analysis (Fields/Gliders/customSearch/NoLines/NoChaos) so its found rules
   * can be tagged with a user-chosen tag instead of a hardcoded built-in one.
   */
  function applyOrthogonalTag(tagName: string, active: boolean, parts: RuleParts, snapshot: RuleSnapshot): void {
    const clean = String(tagName || '').trim()
    if (!clean) {
      return
    }
    setOrthogonalTag(clean, active, parts, snapshot)
  }

  function next(): void {
    const total = rulesForActiveTag.value.length
    if (!total) {
      return
    }
    activeIndex.value = (activeIndex.value + 1) % total
  }
  function prev(): void {
    const total = rulesForActiveTag.value.length
    if (!total) {
      return
    }
    activeIndex.value = (activeIndex.value - 1 + total) % total
  }

  function jumpTo(index: number): void {
    if (index >= 0 && index < rulesForActiveTag.value.length) {
      activeIndex.value = index
    }
  }

  function exportToFile(): void {
    const defaultName = 'ca-rule-tags'
    const entered = typeof window !== 'undefined' ? window.prompt('File name for the exported tags/rules:', defaultName) : defaultName
    if (entered === null) {
      return // user cancelled the prompt
    }
    const safeName = entered.trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || defaultName
    const fileName = safeName.toLowerCase().endsWith('.json') ? safeName : `${safeName}.json`

    const payload = { tags: [...tags], rules: JSON.parse(JSON.stringify(rules)) }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    link.click()
    URL.revokeObjectURL(url)
  }

  async function importFromFile(file: File | null | undefined): Promise<boolean> {
    if (!file) {
      return false
    }
    let data: unknown
    try {
      data = JSON.parse(await file.text())
    } catch {
      return false
    }
    if (!data || typeof data !== 'object') {
      return false
    }
    const payload = data as { tags?: unknown; rules?: unknown }
    const importedTags = Array.isArray(payload.tags)
      ? payload.tags.filter((t): t is string => typeof t === 'string')
      : []
    const importedRules = Array.isArray(payload.rules) ? payload.rules : []
    tags.splice(0, tags.length, ...Array.from(new Set(importedTags)))
    rules.splice(
      0,
      rules.length,
      ...importedRules
        .map(normalizeRule)
        .filter((rule): rule is TaggedRule => rule !== null)
        .map((rule) => ({ ...rule, tags: rule.tags.filter((t) => tags.includes(t)) }))
    )
    activeTag.value = null
    activeIndex.value = 0
    return true
  }

  return {
    tags,
    rules,
    activeTag,
    activeIndex,
    rulesForActiveTag,
    activeRule,
    navStatusText,
    tagCounts,
    addTag,
    renameTag,
    deleteTag,
    selectTag,
    closeBrowse,
    tagsForRule,
    toggleTagOnRule,
    deleteRule,
    clearTag,
    applyAnalysisTag,
    applyOrthogonalTag,
    next,
    prev,
    jumpTo,
    exportToFile,
    importFromFile,
  }
}
