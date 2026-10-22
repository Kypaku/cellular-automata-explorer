import { ref, reactive, computed } from 'vue'
import { detectAgentSurvival } from '../utils/caAnalysis'
import { pickRandomCodes, pickRandomRuleStrings, ruleCodeExceedsSafeInteger } from '../utils/caMath'
import { buildAnalysisParts, buildAnalysisSnapshot } from '../utils/analysis/shared'
import type {
  AgentSurvivalResult,
  AnalysisInitMode,
  AnalysisRuleInput,
  AnalysisSourceMode,
  CollisionMode,
  RuleMode,
  RuleParts,
  RuleSnapshot,
} from '../types/ca'

/** One row of the detailed per-rule agent report. */
export interface AgentAnalysisResultRow extends AgentSurvivalResult {
  id: string
  name: string
  snapshot: RuleSnapshot
}

/** Callback invoked with the survival verdict for each scanned rule. */
export type ApplyAgent = (survived: boolean, parts: RuleParts, snapshot: RuleSnapshot) => void

/** Parameters accepted by {@link useRuleAgentAnalysis.start}. */
export interface AgentAnalysisStartParams {
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
  memorySize: number
  sequenceLength: number
  health: number
  stagnantRepeats: number
  sourceMode?: AnalysisSourceMode
  sampleCount?: number
  rules?: AnalysisRuleInput[]
  /** When true, the run keeps a per-rule report in `results`. */
  collectDetails?: boolean
  apply: ApplyAgent
}

/**
 * Drives the standalone "agent survival" test: every scanned rule is evolved row
 * by row while a memory-limited agent in the middle column tries to keep up with
 * what it reads; rules the agent outlives (reaches the last generation alive) get
 * the independent survival tag through the `apply` callback. The scan runs in
 * small batches via requestAnimationFrame so the UI stays responsive.
 */
export function useRuleAgentAnalysis() {
  const running = ref(false)
  const done = ref(0)
  const total = ref(0)
  const found = ref(0)
  const currentCode = ref(0)
  const currentName = ref('')
  const results = reactive<AgentAnalysisResultRow[]>([])

  let frame: number | null = null

  const progress = computed(() => (total.value ? Math.round((done.value / total.value) * 100) : 0))

  function stop(): void {
    running.value = false
    if (frame !== null) {
      cancelAnimationFrame(frame)
      frame = null
    }
  }

  function start(params: AgentAnalysisStartParams): void {
    if (running.value) {
      return
    }
    const { stateCount, mode, width, height, init, memorySize, sequenceLength, health, stagnantRepeats, apply } = params
    const collectDetails = params.collectDetails === true
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
    results.splice(0, results.length)
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
        let name: string
        let id: string
        if (ruleItems) {
          const item = ruleItems[index]
          parts = item.parts
          snapshot = item.snapshot
          name = item.name || `rule ${index + 1}`
          id = `agent-tag-${index}`
          currentName.value = name
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
          name = localRuleOverride
            ? `${mode === 'descendants' ? 'desc.' : 'loc.'} rand ${index + 1}`
            : mode === 'totalistic'
              ? `tot. ${code}`
              : mode === 'descendants'
                ? `desc. ${code}`
                : `loc. ${code}`
          id = localRuleOverride ? `agent-rand-${index}` : `agent-code-${code}`
        }
        const result = detectAgentSurvival(parts, {
          width,
          height,
          init,
          memorySize,
          sequenceLength,
          health,
          stagnantRepeats,
        })
        if (result.survived) {
          found.value += 1
        }
        apply(result.survived, parts, snapshot)
        if (collectDetails) {
          results.push({ id, name, snapshot, ...result })
        }
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
    results,
    progress,
    start,
    stop,
  }
}
