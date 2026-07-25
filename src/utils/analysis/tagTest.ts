// "Test the current rule against every analysis" helper. Runs all the
// individual analyses (class, Fields, Gliders, custom search, NoLines, NoChaos,
// LargeStructures) on ONE rule using each analysis' default parameters and
// reports which tag every test would assign — a quick, single-rule preview of
// what the batch analyses would tag this rule with, without scanning a range.
import {
  ANALYSIS_DEFAULTS,
  FIELDS_DEFAULTS,
  GLIDERS_DEFAULTS,
  CUSTOM_SEARCH_DEFAULTS,
  LINES_DEFAULTS,
  CHAOS_DEFAULTS,
  ALL_STATES_DEFAULTS,
  SUBANALYSIS_DEFAULTS,
  FIELDS_TAG,
  GLIDERS_TAG,
  CUSTOM_SEARCH_TAG,
  LINES_TAG,
  CHAOS_TAG,
  ALL_STATES_TAG,
  LARGE_STRUCTURES_TAG,
  CUSTOM_ANY,
} from '../../constants/ca'
import type { CustomPattern, RuleParts } from '../../types/ca'
import { classifyRule } from './classify'
import { detectFields } from './fields'
import { detectGliders } from './gliders'
import { detectCustomSearch } from './customSearch'
import { detectLines } from './lines'
import { detectChaos } from './chaos'
import { detectAllStates } from './allStates'
import { subAnalyzeRule } from './subAnalysis'

/** One line of the "test current rule against all analyses" result. */
export interface TagTestResult {
  /** The tag this analysis would assign when the rule passes. */
  tag: string
  /** True when the rule passed this analysis (would receive the tag). */
  passed: boolean
  /** `class` = the mutually-exclusive class assignment; `orthogonal` = an independent flag. */
  kind: 'class' | 'orthogonal'
}

/**
 * Runs every analysis on a single rule (using each one's default parameters)
 * and returns, per analysis, the tag it would assign plus whether the rule
 * passed. The class analysis always yields exactly one tag (the rule's class);
 * the orthogonal analyses each yield a boolean flag. The custom-search test is
 * only included when at least one usable template is supplied (otherwise there
 * is nothing to search for).
 */
export function testRuleAgainstAllTags(parts: RuleParts, customPatterns: CustomPattern[] = []): TagTestResult[] {
  const results: TagTestResult[] = []

  // Class analysis — always assigns exactly one class tag.
  const classResult = classifyRule(parts, {
    width: ANALYSIS_DEFAULTS.width,
    height: ANALYSIS_DEFAULTS.height,
    init: ANALYSIS_DEFAULTS.init,
    chaosFlux: ANALYSIS_DEFAULTS.chaosFlux,
    sparseFill: ANALYSIS_DEFAULTS.sparseFill,
    windowFraction: ANALYSIS_DEFAULTS.windowFraction,
  })
  results.push({ tag: classResult.tag, passed: true, kind: 'class' })

  // Fields.
  const fields = detectFields(parts, { ...FIELDS_DEFAULTS })
  results.push({ tag: FIELDS_TAG, passed: fields.hasFields, kind: 'orthogonal' })

  // Gliders.
  const gliders = detectGliders(parts, { ...GLIDERS_DEFAULTS })
  results.push({ tag: GLIDERS_TAG, passed: gliders.hasGliders, kind: 'orthogonal' })

  // Custom search — only meaningful when the user has drawn at least one template.
  const usablePatterns = customPatterns.filter(
    (p) => !!p && p.width >= 1 && p.height >= 1 && Array.isArray(p.cells) && p.cells.some((c) => c !== CUSTOM_ANY)
  )
  if (usablePatterns.length) {
    const cs = detectCustomSearch(parts, {
      width: CUSTOM_SEARCH_DEFAULTS.width,
      height: CUSTOM_SEARCH_DEFAULTS.height,
      init: CUSTOM_SEARCH_DEFAULTS.init,
      negativePatterns: usablePatterns,
    })
    results.push({ tag: CUSTOM_SEARCH_TAG, passed: cs.passes, kind: 'orthogonal' })
  }

  // Absence of lines (tag applied on absence).
  const lines = detectLines(parts, { ...LINES_DEFAULTS })
  results.push({ tag: LINES_TAG, passed: !lines.hasLines, kind: 'orthogonal' })

  // Absence of chaos (tag applied on absence).
  const chaos = detectChaos(parts, { ...CHAOS_DEFAULTS })
  results.push({ tag: CHAOS_TAG, passed: !chaos.isChaotic, kind: 'orthogonal' })

  // All states present in the bottom part of the diagram.
  const allStates = detectAllStates(parts, { ...ALL_STATES_DEFAULTS })
  results.push({ tag: ALL_STATES_TAG, passed: allStates.hasAllStates, kind: 'orthogonal' })

  // Large structures (tag applied when the diagram never homogenizes).
  const sub = subAnalyzeRule(parts, { ...SUBANALYSIS_DEFAULTS })
  results.push({ tag: LARGE_STRUCTURES_TAG, passed: sub.foundWidth === null, kind: 'orthogonal' })

  return results
}
