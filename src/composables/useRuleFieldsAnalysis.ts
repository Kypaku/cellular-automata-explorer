import { ref, computed } from 'vue'
import { detectFields } from '../utils/caAnalysis'
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
} from '../types/ca'

/** Callback invoked with the fields verdict for each scanned rule. */
export type ApplyFields = (hasFields: boolean, parts: RuleParts, snapshot: RuleSnapshot) => void

/** Parameters accepted by {@link useRuleFieldsAnalysis.start}. */
export interface FieldsAnalysisStartParams {
  stateCount: number
  mode: RuleMode
  neighborhood?: number
  collisionMode?: CollisionMode
  collisionFixed?: number
  from: number
  to: number
  width: number
  height: number
  init: AnalysisInitMode
  blockWidth: number
  blockHeight: number
  minPercent: number
  sourceMode?: AnalysisSourceMode
  sampleCount?: number
  rules?: AnalysisRuleInput[]
  apply: ApplyFields
}

/**
 * Drives the standalone "fields" test: it scans a range of rule codes, runs
 * `detectFields` on each one and hands the boolean verdict to an `apply` callback
 * (which attaches or removes the independent `Fields` tag). Kept separate from the
 * class analysis because the `Fields` tag is orthogonal and may coexist with any
 * class. The scan runs in small batches via requestAnimationFrame so the UI stays
 * responsive and can be stopped at any time.
 */
export function useRuleFieldsAnalysis() {
  const running = ref(false)
  const done = ref(0)
  const total = ref(0)
  const found = ref(0)
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

  function start(params: FieldsAnalysisStartParams): void {
    if (running.value) {
      return
    }
    const { stateCount, mode, width, height, init, blockWidth, blockHeight, minPercent, apply } = params
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
            collisionMode: params.collisionMode,
            collisionFixed: params.collisionFixed,
          }
          parts = buildAnalysisParts(descriptor)
          snapshot = buildAnalysisSnapshot(descriptor, init, height)
        }
        const { hasFields } = detectFields(parts, {
          width,
          height,
          blockWidth,
          blockHeight,
          minPercent,
          init,
        })
        if (hasFields) {
          found.value += 1
        }
        apply(hasFields, parts, snapshot)
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
    found,
    currentCode,
    currentName,
    progress,
    start,
    stop,
  }
}
