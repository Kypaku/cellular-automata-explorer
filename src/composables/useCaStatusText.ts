import { ref, type Ref } from 'vue'
import { stateColor } from '../constants/ca'
import { sanitizeStateString, stateChar, stateDigitAt, toBaseN, totalisticTable } from '../utils/caMath'
import type { CaConfig, LegendItem, RuleMode } from '../types/ca'

/** Upper bound on legend squares drawn, so a huge multi-row local rule can't freeze the DOM. */
const LEGEND_ITEM_CAP = 4096

export interface CaStatusTextDeps {
  mode: Ref<RuleMode>
  stateCount: Ref<number>
  W: Ref<number>
  ruleInputValue: Ref<string>
  seedInputValue: Ref<string>
  localRules: Record<number, string>
  seedValues: Record<number, string>
  totalisticCodes: Record<number, number>
  activeConfig: () => CaConfig
  currentLocalRule: () => string
  currentEmissionTable: () => number[]
}

/**
 * Builds the derived, human-readable text/legend data shown around the rule
 * editor: the legend squares (neighbor-sum map / local digit map / descendants
 * emission map), and the "N/M positions filled" status lines for the rule and
 * seed inputs.
 */
export function useCaStatusText(deps: CaStatusTextDeps) {
  const { mode, stateCount, W, ruleInputValue, seedInputValue, localRules, seedValues, totalisticCodes, activeConfig, currentLocalRule, currentEmissionTable } = deps

  const ruleLabelText = ref('')
  const ruleStatusText = ref('')
  const seedLabelText = ref('')
  const seedStatusText = ref('')
  const legendItems: Ref<LegendItem[]> = ref([])
  const keyText = ref('neighbor sum map -> new state')

  function updateRuleStatus(): void {
    const config = activeConfig()
    const clean = sanitizeStateString(ruleInputValue.value, config.localDigits, stateCount.value)
    if (ruleInputValue.value !== clean) {
      ruleInputValue.value = clean
    }
    localRules[stateCount.value] = clean
    ruleLabelText.value =
      'Local rule: ' +
      config.localDigits +
      ' digits from 0 to ' +
      config.maxDigit +
      ' in order ' +
      toBaseN(0, config.taps, config.states) +
      '..' +
      toBaseN(config.localDigits - 1, config.taps, config.states)
    ruleStatusText.value =
      clean.length === config.localDigits
        ? `${config.localDigits}/${config.localDigits} positions filled`
        : `${clean.length}/${config.localDigits} positions, the rest are treated as 0`
  }

  function updateSeedStatus(): void {
    const config = activeConfig()
    const clean = sanitizeStateString(seedInputValue.value, W.value, stateCount.value)
    if (seedInputValue.value !== clean) {
      seedInputValue.value = clean
    }
    seedValues[stateCount.value] = clean
    seedLabelText.value = `Initial row: digits 0-${config.maxDigit}, the row is centered`
    seedStatusText.value = clean.length
      ? `${clean.length}/${W.value} cells, the row will be centered`
      : 'if left empty, "custom field" mode will use a single central cell'
  }

  function drawLegend(depth: number): void {
    const config = activeConfig()
    const items: LegendItem[] = []
    if (mode.value === 'totalistic') {
      keyText.value = depth > 1 ? `neighbor sum map (over last ${depth} rows) -> new state` : 'neighbor sum map -> new state'
      const sums = totalisticTable(totalisticCodes[stateCount.value], stateCount.value, config.neighborhood, config.depth)
      for (let sum = 0; sum < config.totalisticDigits; sum++) {
        items.push({ color: stateColor(sums[sum]), caption: `S=${sum}` })
      }
    } else if (mode.value === 'descendants') {
      keyText.value = 'descendants: live parent state -> (L,C,R) children, collisions merged by the collision rule'
      const emission = currentEmissionTable()
      const slots = ['L', 'C', 'R']
      for (let s = 1; s < config.states; s++) {
        for (let slot = 0; slot < 3; slot++) {
          const out = emission[(s - 1) * 3 + slot]
          items.push({ color: stateColor(out), caption: `${stateChar(s)}${slots[slot]}->${stateChar(out)}` })
        }
      }
    } else {
      keyText.value =
        depth > 1 ? `local map of ${config.taps} cells (over last ${depth} rows) -> new state` : 'local left-center-right map -> new state'
      const rule = currentLocalRule()
      // Cap the number of squares so a huge multi-row rule can't freeze the DOM.
      const shown = Math.min(config.localDigits, LEGEND_ITEM_CAP)
      for (let index = 0; index < shown; index++) {
        const digit = stateDigitAt(rule, index)
        items.push({
          color: stateColor(digit),
          caption: `${toBaseN(index, config.taps, config.states)}->${stateChar(digit)}`,
        })
      }
    }
    legendItems.value = items
  }

  return {
    ruleLabelText,
    ruleStatusText,
    seedLabelText,
    seedStatusText,
    legendItems,
    keyText,
    updateRuleStatus,
    updateSeedStatus,
    drawLegend,
  }
}
