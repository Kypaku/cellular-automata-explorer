import { ref, reactive, computed } from 'vue'
import { subAnalyzeRule } from '../utils/caAnalysis'
import { pickRandomCodes, pickRandomLocalRules, localCodeExceedsSafeInteger } from '../utils/caMath'
import { buildAnalysisParts, buildAnalysisSnapshot } from '../utils/analysis/shared'
import type {
  AnalysisInitMode,
  AnalysisRuleInput,
  AnalysisSourceMode,
  CollisionMode,
  RuleMode,
  RuleParts,
  RuleSnapshot,
  SubAnalyzeOptions,
  SubAnalyzeResult,
} from '../types/ca'

/** One row of sub-analysis output. */
export interface SubAnalysisResultRow extends SubAnalyzeResult {
  id: string
  name: string
  snapshot: RuleSnapshot
}

/** Callback invoked with the "has large structures" verdict (no fitting width
 * found) for each scanned rule. */
export type ApplySub = (hasLargeStructures: boolean, parts: RuleParts, snapshot: RuleSnapshot) => void

/** Parameters accepted by {@link useRuleSubAnalysis.start}. */
export interface SubAnalysisStartParams {
  stateCount: number
  mode: RuleMode
  neighborhood?: number
  collisionMode?: CollisionMode
  collisionFixed?: number
  from: number
  to: number
  init: AnalysisInitMode
  height: number
  sourceMode?: AnalysisSourceMode
  sampleCount?: number
  rules?: AnalysisRuleInput[]
  options: SubAnalyzeOptions
  apply: ApplySub
}

/**
 * Drives the per-rule sub-analysis. Just like the other batch analyses it can
 * draw its rules from a sequential code range, a fixed-size random sample of
 * that range, or the union of rules already carrying selected tags. Each rule
 * is run through `subAnalyzeRule`, collecting the smallest width at which the
 * pattern becomes spatially uniform. Rules are processed one per animation
 * frame so the UI stays responsive and the run can be stopped at any time.
 */
export function useRuleSubAnalysis() {
  const running = ref(false)
  const done = ref(0)
  const total = ref(0)
  const found = ref(0)
  const results = reactive<SubAnalysisResultRow[]>([])
  const currentName = ref('')

  let frame: number | null = null

  const progress = computed(() => (total.value ? Math.round((done.value / total.value) * 100) : 0))

  function stop(): void {
    running.value = false
    if (frame !== null) {
      cancelAnimationFrame(frame)
      frame = null
    }
  }

  function start(params: SubAnalysisStartParams): void {
    if (running.value) {
      return
    }
    const { stateCount, mode, init, height, options, apply } = params
    const from = Math.max(0, Math.floor(params.from))
    const to = Math.max(from, Math.floor(params.to))
    const ruleItems = params.sourceMode === 'tags' ? params.rules || [] : null
    const randomLocalRules =
      params.sourceMode === 'random' && mode === 'local' && localCodeExceedsSafeInteger(stateCount, params.neighborhood)
        ? pickRandomLocalRules(stateCount, params.sampleCount || 1, params.neighborhood)
        : null
    const randomCodes =
      params.sourceMode === 'random' && !randomLocalRules
        ? pickRandomCodes(from, to, params.sampleCount || 1)
        : null

    results.splice(0, results.length)
    done.value = 0
    found.value = 0
    currentName.value = ''
    total.value = ruleItems
      ? ruleItems.length
      : randomLocalRules
        ? randomLocalRules.length
        : randomCodes
          ? randomCodes.length
          : to - from + 1

    if (!total.value) {
      return
    }
    running.value = true

    let index = 0
    const step = () => {
      if (!running.value) {
        return
      }
      let parts: RuleParts
      let snapshot: RuleSnapshot
      let name: string
      let id: string
      if (ruleItems) {
        const item = ruleItems[index]
        parts = item.parts
        snapshot = item.snapshot
        name = item.name || `rule ${index + 1}`
        id = `sub-tag-${index}`
      } else {
        const localRuleOverride = randomLocalRules ? randomLocalRules[index] : undefined
        const code = randomCodes ? randomCodes[index] : from + index
        const descriptor = {
          stateCount,
          mode,
          code,
          localRule: localRuleOverride,
          neighborhood: params.neighborhood,
          collisionMode: params.collisionMode,
          collisionFixed: params.collisionFixed,
        }
        parts = buildAnalysisParts(descriptor)
        snapshot = buildAnalysisSnapshot(descriptor, init, height)
        name = localRuleOverride
          ? `loc. rand ${index + 1}`
          : mode === 'totalistic'
            ? `tot. ${code}`
            : mode === 'descendants'
              ? `desc. ${code}`
              : `loc. ${code}`
        id = localRuleOverride ? `sub-rand-${index}` : `sub-code-${code}`
      }
      currentName.value = name
      const res = subAnalyzeRule(parts, options)
      // Tag rules that never homogenize (no fitting width found) — i.e. rules
      // that keep large, non-uniform structures.
      const hasLargeStructures = res.foundWidth === null
      if (hasLargeStructures) {
        found.value += 1
      }
      apply(hasLargeStructures, parts, snapshot)
      results.push({ id, name, snapshot, ...res })
      done.value += 1
      index += 1
      if (index >= total.value) {
        running.value = false
        currentName.value = ''
        frame = null
        return
      }
      frame = requestAnimationFrame(step)
    }

    frame = requestAnimationFrame(step)
  }

  return {
    running,
    done,
    total,
    found,
    results,
    currentName,
    progress,
    start,
    stop,
  }
}
