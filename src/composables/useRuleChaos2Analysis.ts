import { ref, computed } from 'vue'
import { detectChaos2 } from '../utils/caAnalysis'
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

/** Callback invoked with the "no chaos" verdict for each scanned rule. */
export type ApplyChaos2 = (noChaos: boolean, parts: RuleParts, snapshot: RuleSnapshot) => void

/** Parameters accepted by {@link useRuleChaos2Analysis.start}. */
export interface Chaos2AnalysisStartParams {
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
  maxUnique: number
  ignoreStatic?: boolean
  sourceMode?: AnalysisSourceMode
  sampleCount?: number
  rules?: AnalysisRuleInput[]
  apply: ApplyChaos2
}

/**
 * Drives the standalone "chaos 2" test: it scans a range of rule codes, tiles
 * each rule's diagram into M×M patterns and hands the *inverse* verdict
 * (`noChaos = !isChaotic`) to an `apply` callback, which attaches or removes the
 * independent `NoChaos2` tag — so the test filters chaotic rules OUT (see
 * {@link detectChaos2}). Unlike the first chaos test it judges by the share of
 * DISTINCT patterns rather than by the dominant pattern's share. The scan runs in
 * small batches via requestAnimationFrame so the UI stays responsive.
 */
export function useRuleChaos2Analysis() {
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

  function start(params: Chaos2AnalysisStartParams): void {
    if (running.value) {
      return
    }
    const { stateCount, mode, width, height, init, cutTop, blockSize, maxUnique, ignoreStatic, apply } = params
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
        const { isChaotic } = detectChaos2(parts, {
          width,
          height,
          init,
          cutTop,
          blockSize,
          maxUnique,
          ignoreStatic,
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
