import { ref, reactive, computed } from 'vue'
import { classifyRule } from '../utils/caAnalysis'
import { pickRandomCodes, pickRandomRuleStrings, ruleCodeExceedsSafeInteger } from '../utils/caMath'
import { buildAnalysisParts, buildAnalysisSnapshot } from '../utils/analysis/shared'
import type {
  AnalysisInitMode,
  AnalysisRuleInput,
  AnalysisSourceMode,
  CollisionMode,
  RuleMode,
  RuleParts,
  RuleSnapshot,
} from '../types/ca'

/** Callback invoked with the classification result for each scanned rule. */
export type ApplyAnalysis = (tag: string, parts: RuleParts, snapshot: RuleSnapshot) => void

/** Parameters accepted by {@link useRuleAnalysis.start}. */
export interface AnalysisStartParams {
  stateCount: number
  mode: RuleMode
  neighborhood?: number
  depth?: number
  collisionMode?: CollisionMode
  collisionFixed?: number
  from: number
  to: number
  width: number
  height: number
  init: AnalysisInitMode
  chaosFlux?: number
  sparseFill?: number
  windowFraction?: number
  sourceMode?: AnalysisSourceMode
  sampleCount?: number
  rules?: AnalysisRuleInput[]
  apply: ApplyAnalysis
}

/**
 * Drives the automatic rule analysis: it scans a range of rule codes, classifies
 * each one with `classifyRule` and hands the result to an `apply` callback (which
 * normally attaches the resulting class tag to the rule library). The scan runs in
 * small batches via requestAnimationFrame so the UI stays responsive and can be
 * stopped at any time.
 */
export function useRuleAnalysis() {
  const running = ref(false)
  const done = ref(0)
  const total = ref(0)
  const counts = reactive<Record<string, number>>({})
  const currentCode = ref(0)
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

  function start(params: AnalysisStartParams): void {
    if (running.value) {
      return
    }
    const { stateCount, mode, width, height, init, chaosFlux, sparseFill, windowFraction, apply } = params
    const from = Math.max(0, Math.floor(params.from))
    const to = Math.max(from, Math.floor(params.to))
    const ruleItems = params.sourceMode === 'tags' ? params.rules || [] : null
    const randomLocalRules =
      params.sourceMode === 'random' && ruleCodeExceedsSafeInteger(mode, stateCount, params.neighborhood, params.depth)
        ? pickRandomRuleStrings(mode, stateCount, params.sampleCount || 1, params.neighborhood, params.depth)
        : null
    const randomCodes =
      params.sourceMode === 'random' && !randomLocalRules
        ? pickRandomCodes(from, to, params.sampleCount || 1)
        : null

    Object.keys(counts).forEach((key) => delete counts[key])
    done.value = 0
    currentName.value = ''
    total.value = ruleItems
      ? ruleItems.length
      : randomLocalRules
        ? randomLocalRules.length
        : randomCodes
          ? randomCodes.length
          : to - from + 1
    running.value = true

    let index = 0
    const batchSize = 25

    const step = () => {
      if (!running.value) {
        return
      }
      const batchEnd = Math.min(total.value - 1, index + batchSize - 1)
      while (index <= batchEnd) {
        let parts: RuleParts
        let snapshot: RuleSnapshot
        if (ruleItems) {
          const item = ruleItems[index]
          parts = item.parts
          snapshot = item.snapshot
          currentName.value = item.name || ''
        } else {
          const localRuleOverride = randomLocalRules ? randomLocalRules[index] : undefined
          const code = randomCodes ? randomCodes[index] : from + index
          currentCode.value = code
          const descriptor = {
            stateCount,
            mode,
            code,
            localRule: localRuleOverride,
            neighborhood: params.neighborhood,
            depth: params.depth,
            collisionMode: params.collisionMode,
            collisionFixed: params.collisionFixed,
          }
          parts = buildAnalysisParts(descriptor)
          snapshot = buildAnalysisSnapshot(descriptor, init, height)
        }
        const { tag } = classifyRule(parts, { width, height, init, chaosFlux, sparseFill, windowFraction })
        counts[tag] = (counts[tag] || 0) + 1
        apply(tag, parts, snapshot)
        done.value += 1
        index += 1
      }
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
    counts,
    currentCode,
    currentName,
    progress,
    start,
    stop,
  }
}
