import { ref, computed } from 'vue'
import { detectChaos } from '../utils/caAnalysis'
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

/** Callback invoked with the "no chaos" verdict for each scanned rule. */
export type ApplyChaos = (noChaos: boolean, parts: RuleParts, snapshot: RuleSnapshot) => void

/** Parameters accepted by {@link useRuleChaosAnalysis.start}. */
export interface ChaosAnalysisStartParams {
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
  cutTop: number
  blockSize: number
  maxDominant: number
  sourceMode?: AnalysisSourceMode
  sampleCount?: number
  rules?: AnalysisRuleInput[]
  apply: ApplyChaos
}

/**
 * Drives the standalone "chaos" test: it scans a range of rule codes, reduces
 * each rule's diagram to an M×M pattern map and hands the *inverse* verdict
 * (`noChaos = !isChaotic`) to an `apply` callback, which attaches or removes the
 * independent `NoChaos` tag — so the test filters chaotic rules OUT (see
 * {@link detectChaos}). Kept separate from the class analysis because the tag is
 * orthogonal and may coexist with any class. The scan runs in small batches via
 * requestAnimationFrame so the UI stays responsive and can be stopped any time.
 */
export function useRuleChaosAnalysis() {
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

  function start(params: ChaosAnalysisStartParams): void {
    if (running.value) {
      return
    }
    const { stateCount, mode, width, height, init, cutTop, blockSize, maxDominant, apply } = params
    const from = Math.max(0, Math.floor(params.from))
    const to = Math.max(from, Math.floor(params.to))
    const ruleItems = params.sourceMode === 'tags' ? params.rules || [] : null
    const randomLocalRules =
      params.sourceMode === 'random' && mode === 'local' && localCodeExceedsSafeInteger(stateCount, params.neighborhood, params.depth)
        ? pickRandomLocalRules(stateCount, params.sampleCount || 1, params.neighborhood, params.depth)
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
            depth: params.depth,
            collisionMode: params.collisionMode,
            collisionFixed: params.collisionFixed,
          }
          parts = buildAnalysisParts(descriptor)
          snapshot = buildAnalysisSnapshot(descriptor, init, height)
        }
        const { isChaotic } = detectChaos(parts, {
          width,
          height,
          init,
          cutTop,
          blockSize,
          maxDominant,
        })
        const noChaos = !isChaotic
        if (noChaos) {
          found.value += 1
        }
        apply(noChaos, parts, snapshot)
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
