import { computed, ref, type Ref } from 'vue'
import type { CustomPattern, RuleMode, RuleParts, RuleSnapshot } from '../types/ca'
import { CUSTOM_SEARCH_STORAGE_KEY } from '../constants/ca'
import { partsFromSnapshot } from '../utils/caMath'
import { testRuleAgainstAllTags, type TagTestResult } from '../utils/caAnalysis'
import type { useRuleTags } from './useRuleTags'

export interface TagInteractionsDeps {
  mode: Ref<RuleMode>
  stateCount: Ref<number>
  codeValue: Ref<number>
  ruleInputValue: Ref<string>
  captureRuleSnapshot: () => RuleSnapshot
  applyRuleSnapshot: (snapshot: RuleSnapshot | null | undefined) => void
  tags: ReturnType<typeof useRuleTags>
}

/** Reads the persisted custom-search templates (kept in sync by CustomSearchPanel). */
function loadCustomSearchPatterns(): CustomPattern[] {
  try {
    const raw = localStorage.getItem(CUSTOM_SEARCH_STORAGE_KEY)
    if (!raw) {
      return []
    }
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as CustomPattern[]) : []
  } catch {
    return []
  }
}

/**
 * Wires up the "current rule's tags" UI (toggle a tag on the current rule,
 * browse/navigate saved rules for a tag) and the "test current rule against
 * every analysis" feature (TagsPanel's test-rule button).
 */
export function useTagInteractions(deps: TagInteractionsDeps) {
  const { mode, stateCount, codeValue, ruleInputValue, captureRuleSnapshot, applyRuleSnapshot, tags } = deps

  /** Fields that identify "the same rule" for tagging, independent of init/seed/height. */
  function currentRuleParts(): RuleParts {
    return mode.value === 'totalistic'
      ? { stateCount: stateCount.value, mode: 'totalistic', code: codeValue.value, localRule: '' }
      : { stateCount: stateCount.value, mode: 'local', code: 0, localRule: ruleInputValue.value }
  }

  const currentRuleTags = computed(() => tags.tagsForRule(currentRuleParts()))

  function loadActiveTaggedRule(): void {
    if (tags.activeRule.value) {
      applyRuleSnapshot(tags.activeRule.value.snapshot)
    }
  }

  function onToggleTag(tagName: string): void {
    tags.toggleTagOnRule(tagName, currentRuleParts(), captureRuleSnapshot())
  }

  // Result of "test current rule for tags": which tag every analysis would assign.
  const tagTestResults = ref<TagTestResult[] | null>(null)

  // Runs every analysis on the current rule and records which tags it would get.
  function onTestRuleTags(): void {
    const parts = partsFromSnapshot(captureRuleSnapshot())
    tagTestResults.value = testRuleAgainstAllTags(parts, loadCustomSearchPatterns())
  }

  // Attaches a passed test's tag to the current rule (class tags replace the rule's
  // existing class; orthogonal tags are added independently), creating it if needed.
  function onApplyTestTag(result: TagTestResult): void {
    const parts = currentRuleParts()
    const snapshot = captureRuleSnapshot()
    if (result.kind === 'class') {
      tags.applyAnalysisTag(result.tag, parts, snapshot)
    } else {
      tags.applyOrthogonalTag(result.tag, true, parts, snapshot)
    }
  }

  function onBrowseTag(tagName: string): void {
    tags.selectTag(tagName)
  }

  function onNextTaggedRule(): void {
    tags.next()
    loadActiveTaggedRule()
  }

  function onPrevTaggedRule(): void {
    tags.prev()
    loadActiveTaggedRule()
  }

  function onJumpToTaggedRule(index: number): void {
    tags.jumpTo(index)
    loadActiveTaggedRule()
  }

  function onImportFile(file: File): void {
    tags.importFromFile(file)
  }

  return {
    currentRuleTags,
    onToggleTag,
    tagTestResults,
    onTestRuleTags,
    onApplyTestTag,
    onBrowseTag,
    onNextTaggedRule,
    onPrevTaggedRule,
    onJumpToTaggedRule,
    onImportFile,
  }
}
