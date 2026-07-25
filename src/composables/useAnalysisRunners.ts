import { ref, type Ref } from 'vue'
import type {
  AnalysisInitMode,
  AnalysisRuleInput,
  AnalysisSourceMode,
  CollisionMode,
  CustomPattern,
  GliderCondition,
  RuleMode,
  RuleParts,
  RuleSnapshot,
  SubAnalyzeOptions,
} from '../types/ca'
import { ALL_STATES_TAG, CHAOS_TAG, CUSTOM_SEARCH_TAG, FIELDS_TAG, GLIDERS_TAG, LARGE_STRUCTURES_TAG, LINES_TAG } from '../constants/ca'
import { partsFromSnapshot } from '../utils/caMath'
import type { useRuleTags } from './useRuleTags'
import type { useRuleAnalysis } from './useRuleAnalysis'
import type { useRuleFieldsAnalysis } from './useRuleFieldsAnalysis'
import type { useRuleGlidersAnalysis } from './useRuleGlidersAnalysis'
import type { useRuleCustomSearchAnalysis } from './useRuleCustomSearchAnalysis'
import type { useRuleLinesAnalysis } from './useRuleLinesAnalysis'
import type { useRuleChaosAnalysis } from './useRuleChaosAnalysis'
import type { useRuleAllStatesAnalysis } from './useRuleAllStatesAnalysis'
import type { useRuleSubAnalysis } from './useRuleSubAnalysis'

export interface AnalysisRunnersDeps {
  stateCount: Ref<number>
  mode: Ref<RuleMode>
  collisionMode: Ref<CollisionMode>
  collisionFixed: Ref<number>
  applyRuleSnapshot: (snapshot: RuleSnapshot) => void
  tags: ReturnType<typeof useRuleTags>
  analysis: ReturnType<typeof useRuleAnalysis>
  fields: ReturnType<typeof useRuleFieldsAnalysis>
  gliders: ReturnType<typeof useRuleGlidersAnalysis>
  customSearch: ReturnType<typeof useRuleCustomSearchAnalysis>
  lines: ReturnType<typeof useRuleLinesAnalysis>
  chaos: ReturnType<typeof useRuleChaosAnalysis>
  allStates: ReturnType<typeof useRuleAllStatesAnalysis>
  sub: ReturnType<typeof useRuleSubAnalysis>
}

interface FoundRule {
  parts: RuleParts
  snapshot: RuleSnapshot
  tag: string
}

/**
 * Shared bookkeeping for an orthogonal analysis run: tracks which rules the
 * CURRENT (or most recently finished) run tagged so "undo found" can untag
 * exactly them, and "clear tag" can wipe a tag off every rule regardless of
 * which run tagged them.
 */
function useFoundRulesTracker(applyOrthogonalTag: ReturnType<typeof useRuleTags>['applyOrthogonalTag'], clearTag: ReturnType<typeof useRuleTags>['clearTag'], fallbackTag: string) {
  const foundRules = ref<FoundRule[]>([])

  function reset(): void {
    foundRules.value = []
  }

  function apply(tag: string) {
    return (found: boolean, parts: RuleParts, snapshot: RuleSnapshot): void => {
      if (found) {
        foundRules.value.push({ parts, snapshot, tag })
      }
      applyOrthogonalTag(tag, found, parts, snapshot)
    }
  }

  function undo(): void {
    for (const { parts, snapshot, tag } of foundRules.value) {
      applyOrthogonalTag(tag, false, parts, snapshot)
    }
    foundRules.value = []
  }

  function clear(tagName: string): void {
    clearTag(String(tagName || '').trim() || fallbackTag)
    foundRules.value = []
  }

  return { foundRules, reset, apply, undo, clear }
}

interface RunAnalysisPayload {
  from: number
  to: number
  width: number
  height: number
  init: AnalysisInitMode
  chaosFlux: number
  sparseFill: number
  windowFraction: number
  sourceMode: AnalysisSourceMode
  sampleCount: number
  tags: string[]
}

interface RunFieldsAnalysisPayload {
  from: number
  to: number
  width: number
  height: number
  init: AnalysisInitMode
  blockWidth: number
  blockHeight: number
  minPercent: number
  sourceMode: AnalysisSourceMode
  sampleCount: number
  tags: string[]
  targetTag: string
}

interface RunGlidersAnalysisPayload {
  from: number
  to: number
  width: number
  height: number
  init: AnalysisInitMode
  blockWidth: number
  blockHeight: number
  maxPeriods: number
  minShift: number
  minMatches: number
  backgroundMin: number
  spaceshipRepeats: number
  spaceshipGap: number
  spaceshipStep: number
  spaceshipDetections: number
  condition: GliderCondition
  sourceMode: AnalysisSourceMode
  sampleCount: number
  tags: string[]
  targetTag: string
}

interface RunCustomSearchPayload {
  from: number
  to: number
  width: number
  height: number
  init: AnalysisInitMode
  negativePatterns: CustomPattern[]
  sourceMode: AnalysisSourceMode
  sampleCount: number
  tags: string[]
  targetTag: string
}

interface RunLinesAnalysisPayload {
  from: number
  to: number
  width: number
  height: number
  init: AnalysisInitMode
  cutTop: number
  minBlock: number
  maxBlock: number
  blockStep: number
  lineCount: number
  ignoreBackground: boolean
  sourceMode: AnalysisSourceMode
  sampleCount: number
  tags: string[]
  targetTag: string
}

interface RunChaosAnalysisPayload {
  from: number
  to: number
  width: number
  height: number
  init: AnalysisInitMode
  cutTop: number
  blockSize: number
  maxDominant: number
  sourceMode: AnalysisSourceMode
  sampleCount: number
  tags: string[]
  targetTag: string
}

interface RunAllStatesAnalysisPayload {
  from: number
  to: number
  width: number
  height: number
  init: AnalysisInitMode
  bottomPercent: number
  sourceMode: AnalysisSourceMode
  sampleCount: number
  tags: string[]
  targetTag: string
}

interface RunSubAnalysisPayload {
  sourceMode: AnalysisSourceMode
  from: number
  to: number
  sampleCount: number
  tags: string[]
  init: AnalysisInitMode
  height: number
  targetTag: string
  options: SubAnalyzeOptions
}

/**
 * Wires every "run analysis" panel to its composable's `start()`, resolving
 * the "tags" source mode into concrete rules, tracking which rules the found
 * (orthogonal) analyses tag so they can be undone/cleared, and dispatching
 * "select rule" from the sub-analysis results list back into the rule editor.
 */
export function useAnalysisRunners(deps: AnalysisRunnersDeps) {
  const { stateCount, mode, collisionMode, collisionFixed, applyRuleSnapshot, tags, analysis, fields, gliders, customSearch, lines, chaos, allStates, sub } = deps

  /** Resolves the union of saved rules carrying any of the given tags into
   * classifier-ready inputs (parts + snapshot + display name). */
  function rulesForTags(tagNames: string[]): AnalysisRuleInput[] {
    const selected = new Set(tagNames)
    if (!selected.size) {
      return []
    }
    return tags.rules
      .filter((rule) => Array.isArray(rule.tags) && rule.tags.some((t) => selected.has(t)))
      .map((rule) => ({
        parts: partsFromSnapshot(rule.snapshot),
        snapshot: rule.snapshot,
        name: rule.name,
      }))
  }

  function onRunAnalysis({
    from,
    to,
    width,
    height,
    init: analysisInit,
    chaosFlux,
    sparseFill,
    windowFraction,
    sourceMode,
    sampleCount,
    tags: selectedTags,
  }: RunAnalysisPayload): void {
    analysis.start({
      stateCount: stateCount.value,
      mode: mode.value,
      collisionMode: collisionMode.value,
      collisionFixed: collisionFixed.value,
      from,
      to,
      width,
      height,
      init: analysisInit,
      chaosFlux,
      sparseFill,
      windowFraction,
      sourceMode,
      sampleCount,
      rules: sourceMode === 'tags' ? rulesForTags(selectedTags) : undefined,
      apply: tags.applyAnalysisTag,
    })
  }

  const fieldsTracker = useFoundRulesTracker(tags.applyOrthogonalTag, tags.clearTag, FIELDS_TAG)

  function onRunFieldsAnalysis({
    from,
    to,
    width,
    height,
    init: fieldsInit,
    blockWidth,
    blockHeight,
    minPercent,
    sourceMode,
    sampleCount,
    tags: selectedTags,
    targetTag,
  }: RunFieldsAnalysisPayload): void {
    const tag = String(targetTag || '').trim() || FIELDS_TAG
    fieldsTracker.reset()
    fields.start({
      stateCount: stateCount.value,
      mode: mode.value,
      collisionMode: collisionMode.value,
      collisionFixed: collisionFixed.value,
      from,
      to,
      width,
      height,
      init: fieldsInit,
      blockWidth,
      blockHeight,
      minPercent,
      sourceMode,
      sampleCount,
      rules: sourceMode === 'tags' ? rulesForTags(selectedTags) : undefined,
      apply: fieldsTracker.apply(tag),
    })
  }

  const glidersTracker = useFoundRulesTracker(tags.applyOrthogonalTag, tags.clearTag, GLIDERS_TAG)

  function onRunGlidersAnalysis({
    from,
    to,
    width,
    height,
    init: glidersInit,
    blockWidth,
    blockHeight,
    maxPeriods,
    minShift,
    minMatches,
    backgroundMin,
    spaceshipRepeats,
    spaceshipGap,
    spaceshipStep,
    spaceshipDetections,
    condition,
    sourceMode,
    sampleCount,
    tags: selectedTags,
    targetTag,
  }: RunGlidersAnalysisPayload): void {
    const tag = String(targetTag || '').trim() || GLIDERS_TAG
    glidersTracker.reset()
    gliders.start({
      stateCount: stateCount.value,
      mode: mode.value,
      collisionMode: collisionMode.value,
      collisionFixed: collisionFixed.value,
      from,
      to,
      width,
      height,
      init: glidersInit,
      blockWidth,
      blockHeight,
      maxPeriods,
      minShift,
      minMatches,
      backgroundMin,
      spaceshipRepeats,
      spaceshipGap,
      spaceshipStep,
      spaceshipDetections,
      condition,
      sourceMode,
      sampleCount,
      rules: sourceMode === 'tags' ? rulesForTags(selectedTags) : undefined,
      apply: glidersTracker.apply(tag),
    })
  }

  const customSearchTracker = useFoundRulesTracker(tags.applyOrthogonalTag, tags.clearTag, CUSTOM_SEARCH_TAG)

  function onRunCustomSearch({
    from,
    to,
    width,
    height,
    init: customInit,
    negativePatterns,
    sourceMode,
    sampleCount,
    tags: selectedTags,
    targetTag,
  }: RunCustomSearchPayload): void {
    const tag = String(targetTag || '').trim() || CUSTOM_SEARCH_TAG
    customSearchTracker.reset()
    customSearch.start({
      stateCount: stateCount.value,
      mode: mode.value,
      collisionMode: collisionMode.value,
      collisionFixed: collisionFixed.value,
      from,
      to,
      width,
      height,
      init: customInit,
      negativePatterns,
      sourceMode,
      sampleCount,
      rules: sourceMode === 'tags' ? rulesForTags(selectedTags) : undefined,
      apply: customSearchTracker.apply(tag),
    })
  }

  const linesTracker = useFoundRulesTracker(tags.applyOrthogonalTag, tags.clearTag, LINES_TAG)

  function onRunLinesAnalysis({
    from,
    to,
    width,
    height,
    init: linesInit,
    cutTop,
    minBlock,
    maxBlock,
    blockStep,
    lineCount,
    ignoreBackground,
    sourceMode,
    sampleCount,
    tags: selectedTags,
    targetTag,
  }: RunLinesAnalysisPayload): void {
    const tag = String(targetTag || '').trim() || LINES_TAG
    linesTracker.reset()
    lines.start({
      stateCount: stateCount.value,
      mode: mode.value,
      collisionMode: collisionMode.value,
      collisionFixed: collisionFixed.value,
      from,
      to,
      width,
      height,
      init: linesInit,
      cutTop,
      minBlock,
      maxBlock,
      blockStep,
      lineCount,
      ignoreBackground,
      sourceMode,
      sampleCount,
      rules: sourceMode === 'tags' ? rulesForTags(selectedTags) : undefined,
      apply: linesTracker.apply(tag),
    })
  }

  const chaosTracker = useFoundRulesTracker(tags.applyOrthogonalTag, tags.clearTag, CHAOS_TAG)

  function onRunChaosAnalysis({
    from,
    to,
    width,
    height,
    init: chaosInit,
    cutTop,
    blockSize,
    maxDominant,
    sourceMode,
    sampleCount,
    tags: selectedTags,
    targetTag,
  }: RunChaosAnalysisPayload): void {
    const tag = String(targetTag || '').trim() || CHAOS_TAG
    chaosTracker.reset()
    chaos.start({
      stateCount: stateCount.value,
      mode: mode.value,
      collisionMode: collisionMode.value,
      collisionFixed: collisionFixed.value,
      from,
      to,
      width,
      height,
      init: chaosInit,
      cutTop,
      blockSize,
      maxDominant,
      sourceMode,
      sampleCount,
      rules: sourceMode === 'tags' ? rulesForTags(selectedTags) : undefined,
      apply: chaosTracker.apply(tag),
    })
  }

  const allStatesTracker = useFoundRulesTracker(tags.applyOrthogonalTag, tags.clearTag, ALL_STATES_TAG)

  function onRunAllStatesAnalysis({
    from,
    to,
    width,
    height,
    init: allStatesInit,
    bottomPercent,
    sourceMode,
    sampleCount,
    tags: selectedTags,
    targetTag,
  }: RunAllStatesAnalysisPayload): void {
    const tag = String(targetTag || '').trim() || ALL_STATES_TAG
    allStatesTracker.reset()
    allStates.start({
      stateCount: stateCount.value,
      mode: mode.value,
      collisionMode: collisionMode.value,
      collisionFixed: collisionFixed.value,
      from,
      to,
      width,
      height,
      init: allStatesInit,
      bottomPercent,
      sourceMode,
      sampleCount,
      rules: sourceMode === 'tags' ? rulesForTags(selectedTags) : undefined,
      apply: allStatesTracker.apply(tag),
    })
  }

  const subTracker = useFoundRulesTracker(tags.applyOrthogonalTag, tags.clearTag, LARGE_STRUCTURES_TAG)

  function onRunSubAnalysis({
    sourceMode,
    from,
    to,
    sampleCount,
    tags: selectedTags,
    init: subInit,
    height,
    targetTag,
    options,
  }: RunSubAnalysisPayload): void {
    const tag = String(targetTag || '').trim() || LARGE_STRUCTURES_TAG
    subTracker.reset()
    sub.start({
      stateCount: stateCount.value,
      mode: mode.value,
      collisionMode: collisionMode.value,
      collisionFixed: collisionFixed.value,
      sourceMode,
      from,
      to,
      sampleCount,
      init: subInit,
      height,
      rules: sourceMode === 'tags' ? rulesForTags(selectedTags) : undefined,
      options,
      apply: subTracker.apply(tag),
    })
  }

  function onSelectSubRule(snapshot: RuleSnapshot): void {
    applyRuleSnapshot(snapshot)
  }

  return {
    onRunAnalysis,
    onRunFieldsAnalysis,
    onUndoFieldsFound: fieldsTracker.undo,
    onClearFieldsTag: fieldsTracker.clear,
    fieldsFoundRules: fieldsTracker.foundRules,
    onRunGlidersAnalysis,
    onUndoGlidersFound: glidersTracker.undo,
    onClearGlidersTag: glidersTracker.clear,
    glidersFoundRules: glidersTracker.foundRules,
    onRunCustomSearch,
    onUndoCustomSearchFound: customSearchTracker.undo,
    onClearCustomSearchTag: customSearchTracker.clear,
    customSearchFoundRules: customSearchTracker.foundRules,
    onRunLinesAnalysis,
    onUndoLinesFound: linesTracker.undo,
    onClearLinesTag: linesTracker.clear,
    linesFoundRules: linesTracker.foundRules,
    onRunChaosAnalysis,
    onUndoChaosFound: chaosTracker.undo,
    onClearChaosTag: chaosTracker.clear,
    chaosFoundRules: chaosTracker.foundRules,
    onRunAllStatesAnalysis,
    onUndoAllStatesFound: allStatesTracker.undo,
    onClearAllStatesTag: allStatesTracker.clear,
    allStatesFoundRules: allStatesTracker.foundRules,
    onRunSubAnalysis,
    onUndoSubFound: subTracker.undo,
    onClearSubTag: subTracker.clear,
    subFoundRules: subTracker.foundRules,
    onSelectSubRule,
  }
}
