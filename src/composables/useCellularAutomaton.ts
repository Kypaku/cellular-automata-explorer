import { ref, reactive, computed } from 'vue'
import { CA_WIDTH, CA_COLORS } from '../constants/ca'
import {
  getConfig,
  sanitizeStateString,
  padRight,
  buildLocalRuleFromTotalistic,
  localRuleToCode,
  codeToLocalRule,
  normalizeStateCount,
  normalizeNeighborhood,
  normalizeDepth,
  canMaterializeLocal,
  localCodeExceedsSafeInteger,
  cycleLocalRuleDigit,
  cycleTotalisticDigit,
  defaultEmissionRule,
  sanitizeEmissionRule,
  descendantsCodeMax,
  clampCollisionFixed,
  DEFAULT_COLLISION_MODE,
  DEFAULT_COLLISION_FIXED,
} from '../utils/caMath'
import type { CaConfig, InitMode, RuleMode, RuleSnapshot } from '../types/ca'
import { useCaDescendantsRule } from './useCaDescendantsRule'
import { useCaCanvasRender } from './useCaCanvasRender'
import { useCaStatusText } from './useCaStatusText'
import { useCaSizeControls } from './useCaSizeControls'

/** Reads the current value out of an input `Event` target. */
function inputValue(event: Event): string {
  return (event.target as HTMLInputElement).value
}

/**
 * Encapsulates all state and behaviour of the 2-5 state cellular
 * automaton explorer: rule selection (totalistic or local), initial
 * conditions, canvas rendering and the derived UI text/legend data.
 */
export function useCellularAutomaton() {
  const H = ref(110)
  const W = ref(CA_WIDTH)
  const mode = ref<RuleMode>('local') // 'totalistic' | 'local'
  const stateCount = ref(2) // 2 | 3 | 4 | 5
  const neighborhood = ref(3) // 3 | 5 | 7 cells read from the previous row (totalistic/local only)
  const depth = ref(1) // how many previous rows the rule depends on (1 = classic; totalistic/local only)
  const init = ref<InitMode>('random') // 'single' | 'random' | 'custom'
  const noise = ref(0) // 0-100, % of cells on each step get a random value against the rule

  const totalisticCodes = reactive<Record<number, number>>({ 2: 6, 3: 1155, 4: 0, 5: 0 })
  const localRules = reactive<Record<number, string>>({ 2: '', 3: '', 4: '', 5: '' })
  const localRuleDirty = reactive<Record<number, boolean>>({ 2: false, 3: false, 4: false, 5: false })
  const seedValues = reactive<Record<number, string>>({ 2: '', 3: '', 4: '', 5: '' })

  const ruleInputValue = ref('')
  const seedInputValue = ref('')
  const codeValue = ref(1155)

  const sliderLabelText = ref('')
  const codeMax = ref(2186)

  // "Descendants" rule mode: per-state emission rules + collision strategy + energy toggle.
  const descendants = useCaDescendantsRule(stateCount, { mode, refresh, setMode })
  const {
    emissionRules, collisionMode, collisionFixed, energyEnabled, initialEnergy,
    emissionInputValue, emissionLabelText, emissionStatusText,
    currentEmissionRule, currentEmissionTable, currentCollisionFixed,
    storeCurrentEmission, updateDescendantsStatus, syncDescendantsInputs, setInitialEnergy,
    onRandomEmission, onLegendEmissionCellClick,
    onEmissionInput, setCollisionMode, setCollisionFixed, onCollisionFixedInput, setEnergyEnabled,
  } = descendants

  // The numeric rule code is only meaningful while it fits in a JS double.
  // For local rules with 4+ states the code space (states^(states^3)) overflows
  // that precision, so the code slider/input would show a bogus float in
  // scientific notation — hide it and let the rule string input be the editor.
  // Descendants mode has no single numeric code at all, so it hides it too.
  const showCodeControl = computed(
    () =>
      mode.value === 'totalistic' ||
      (mode.value === 'local' && !localCodeExceedsSafeInteger(stateCount.value, neighborhood.value, depth.value))
  )

  const seedPlaceholder = computed(() => {
    if (stateCount.value === 2) {
      return 'e.g. 00011100101'
    }
    let sample = ''
    for (let digit = 0; digit < stateCount.value; digit++) {
      sample += String(digit).repeat(2)
    }
    return `e.g. ${sample}0`
  })

  function activeConfig(): CaConfig {
    return getConfig(stateCount.value, neighborhood.value, depth.value)
  }

  function currentLocalRule(): string {
    const config = activeConfig()
    const clean = sanitizeStateString(ruleInputValue.value, config.localDigits, stateCount.value)
    // Only pad to the full length when it is small enough to materialize; for
    // very large multi-row rules the un-filled neighborhoods are treated as 0.
    return canMaterializeLocal(config) ? padRight(clean, config.localDigits) : clean
  }

  /** Filesystem-safe label describing the current rule, used to name exported files (e.g. large-image PNG downloads). */
  function currentRuleLabel(): string {
    const states = stateCount.value
    if (mode.value === 'totalistic') {
      return `${states}s-totalistic-${totalisticCodes[states]}`
    }
    if (mode.value === 'descendants') {
      const collision = collisionMode.value === 'fixed' ? `fixed${currentCollisionFixed()}` : collisionMode.value
      return `${states}s-descendants-${currentEmissionRule()}-${collision}`
    }
    const rule = currentLocalRule()
    const shortRule = rule.length > 40 ? `${rule.slice(0, 40)}-${rule.length}d` : rule
    return `${states}s-local-${shortRule}`
  }

  function activeCodeMax(): number {
    const config = activeConfig()
    if (mode.value === 'descendants') {
      return descendantsCodeMax(stateCount.value)
    }
    return mode.value === 'totalistic' ? config.totalisticMax : Math.pow(config.states, config.localDigits) - 1
  }

  function activeCodeValue(): number {
    return mode.value === 'totalistic'
      ? totalisticCodes[stateCount.value]
      : localRuleToCode(currentLocalRule(), stateCount.value, neighborhood.value, depth.value)
  }

  function setActiveCode(value: number): void {
    const nextValue = Math.max(0, Math.min(activeCodeMax(), Math.floor(value)))
    if (mode.value === 'totalistic') {
      totalisticCodes[stateCount.value] = nextValue
      syncLocalRule(false)
      return
    }
    localRules[stateCount.value] = codeToLocalRule(nextValue, stateCount.value, neighborhood.value, depth.value)
    localRuleDirty[stateCount.value] = true
    ruleInputValue.value = localRules[stateCount.value]
  }

  function storeCurrentRule(): void {
    localRules[stateCount.value] = sanitizeStateString(ruleInputValue.value, activeConfig().localDigits, stateCount.value)
  }

  function storeCurrentSeed(): void {
    seedValues[stateCount.value] = sanitizeStateString(seedInputValue.value, W.value, stateCount.value)
  }

  // Derived label/status text for the rule editor, seed editor and legend.
  const statusText = useCaStatusText({
    mode, stateCount, W, ruleInputValue, seedInputValue, localRules, seedValues, totalisticCodes,
    activeConfig, currentLocalRule, currentEmissionTable,
  })
  const { ruleLabelText, ruleStatusText, seedLabelText, seedStatusText, legendItems, keyText, updateRuleStatus, updateSeedStatus, drawLegend } =
    statusText

  // The on-screen canvas: rendered grid, run/continue-simulating actions and
  // the large-image export context builder.
  const canvasRender = useCaCanvasRender({
    W, H, mode, stateCount, noise, init, seedInputValue, depth, totalisticCodes,
    collisionMode, energyEnabled, initialEnergy,
    activeConfig, currentLocalRule, currentEmissionTable, currentCollisionFixed, currentRuleLabel,
  })
  const { canvasRef, extraRows, grid, run, continueSimulation, onExtraRowsInput, getRenderContext } = canvasRender

  // Height/width/noise clamping, status text and their input handlers.
  const sizeControls = useCaSizeControls({ H, W, noise, run })
  const {
    heightStatusText, widthStatusText, noiseStatusText,
    onHeightSliderInput, onHeightNumberInput, onWidthSliderInput, onWidthNumberInput,
    onNoiseSliderInput, onNoiseNumberInput, onNoisePreset,
  } = sizeControls

  function syncLocalRule(force: boolean): void {
    if (force || !localRuleDirty[stateCount.value]) {
      localRules[stateCount.value] = buildLocalRuleFromTotalistic(
        totalisticCodes[stateCount.value],
        stateCount.value,
        neighborhood.value,
        depth.value
      )
    }
    ruleInputValue.value = localRules[stateCount.value]
    updateRuleStatus()
  }

  function updateStateUI(): void {
    const config = activeConfig()
    codeMax.value = activeCodeMax()
    sliderLabelText.value =
      mode.value === 'totalistic'
        ? `Code totalistic (0-${config.totalisticMax})`
        : `Local rule code (0-${codeMax.value})`
  }

  function refresh(): void {
    updateStateUI()
    updateRuleStatus()
    updateDescendantsStatus()
    codeValue.value = activeCodeValue()
    updateSeedStatus()
    drawLegend(depth.value)
    run()
  }

  function onCodeSliderInput(event: Event): void {
    setActiveCode(parseInt(inputValue(event), 10))
    refresh()
  }

  function onCodeNumberInput(event: Event): void {
    const raw = inputValue(event)
    if (raw === '') {
      return
    }
    const nextValue = parseInt(raw, 10)
    if (isNaN(nextValue)) {
      return
    }
    setActiveCode(nextValue)
    refresh()
  }

  function onRuleInput(event: Event): void {
    ruleInputValue.value = inputValue(event)
    localRuleDirty[stateCount.value] = true
    storeCurrentRule()
    updateRuleStatus()
    if (mode.value !== 'local') {
      setMode('local')
      return
    }
    refresh()
  }

  function onSeedInput(event: Event): void {
    seedInputValue.value = inputValue(event)
    storeCurrentSeed()
    updateSeedStatus()
    init.value = 'custom'
    run()
  }

  /**
   * Clicking a legend square steps that cell's output value to the next
   * state (wrapping back to 0): the neighbor-sum output in totalistic mode,
   * or the local rule digit at that neighborhood index in local mode.
   */
  function onLegendCellClick(index: number): void {
    if (mode.value === 'totalistic') {
      totalisticCodes[stateCount.value] = cycleTotalisticDigit(
        totalisticCodes[stateCount.value],
        stateCount.value,
        index,
        neighborhood.value,
        depth.value
      )
      syncLocalRule(false)
    } else if (mode.value === 'descendants') {
      onLegendEmissionCellClick(index)
    } else {
      const nextRule = cycleLocalRuleDigit(currentLocalRule(), stateCount.value, index, neighborhood.value, depth.value)
      ruleInputValue.value = nextRule
      localRules[stateCount.value] = nextRule
      localRuleDirty[stateCount.value] = true
      updateRuleStatus()
    }
    refresh()
  }

  function onRandomRule(): void {
    const config = activeConfig()
    if (mode.value === 'totalistic') {
      totalisticCodes[stateCount.value] = Math.floor(Math.random() * (config.totalisticMax + 1))
      syncLocalRule(false)
    } else if (mode.value === 'descendants') {
      onRandomEmission()
    } else {
      let randomRule = ''
      for (let i = 0; i < config.localDigits; i++) {
        randomRule += String(Math.floor(Math.random() * config.states))
      }
      ruleInputValue.value = randomRule
      localRules[stateCount.value] = randomRule
      localRuleDirty[stateCount.value] = true
      updateRuleStatus()
    }
    refresh()
  }

  function onInitialEnergyInput(event: Event): void {
    const raw = inputValue(event)
    if (raw === '') {
      return
    }
    const nextValue = parseInt(raw, 10)
    if (isNaN(nextValue)) {
      return
    }
    setInitialEnergy(nextValue)
    run()
  }

  function setInit(nextInit: InitMode): void {
    init.value = nextInit
    run()
  }

  /**
   * Switches the neighborhood size (3, 5 or 7 cells read from the previous row)
   * for totalistic/local rules. Rebuilds the local rule from the current
   * totalistic code (unless the user has edited it by hand) and clamps the
   * totalistic code into the new range, then re-renders.
   */
  function setNeighborhood(next: number): void {
    const n = normalizeNeighborhood(next)
    if (n === neighborhood.value) {
      return
    }
    storeCurrentRule()
    neighborhood.value = n
    const config = activeConfig()
    if (totalisticCodes[stateCount.value] > config.totalisticMax) {
      totalisticCodes[stateCount.value] = config.totalisticMax
    }
    syncLocalRule(false)
    refresh()
  }

  /**
   * Switches how many previous rows the rule depends on (1 = classic; N reads
   * the last N rows). Like {@link setNeighborhood} it rebuilds the local rule
   * from the totalistic code (unless hand-edited) and clamps the totalistic code
   * into the new, larger range, then re-renders.
   */
  function setDepth(next: number): void {
    const d = normalizeDepth(next)
    if (d === depth.value) {
      return
    }
    storeCurrentRule()
    depth.value = d
    const config = activeConfig()
    if (totalisticCodes[stateCount.value] > config.totalisticMax) {
      totalisticCodes[stateCount.value] = config.totalisticMax
    }
    syncLocalRule(false)
    refresh()
  }

  function setMode(nextMode: RuleMode): void {
    mode.value = nextMode
    if (nextMode === 'descendants') {
      syncDescendantsInputs()
    }
    refresh()
  }

  function setStateCount(nextCount: number): void {
    if (nextCount === stateCount.value) {
      return
    }
    storeCurrentRule()
    storeCurrentSeed()
    storeCurrentEmission()
    stateCount.value = nextCount
    ruleInputValue.value = localRules[nextCount]
    seedInputValue.value = seedValues[nextCount]
    syncDescendantsInputs()
    syncLocalRule(false)
    refresh()
  }

  function init3AndRefresh(): void {
    ;[2, 3, 4, 5].forEach((count) => {
      localRules[count] = buildLocalRuleFromTotalistic(totalisticCodes[count], count, neighborhood.value, depth.value)
    })
    ruleInputValue.value = localRules[stateCount.value]
    emissionInputValue.value = emissionRules[stateCount.value]
    refresh()
  }

  /** Captures everything needed to reproduce the current rule/init/height later. */
  function captureRuleSnapshot(): RuleSnapshot {
    storeCurrentRule()
    storeCurrentSeed()
    storeCurrentEmission()
    return {
      stateCount: stateCount.value,
      mode: mode.value,
      code: totalisticCodes[stateCount.value],
      localRule: localRules[stateCount.value],
      neighborhood: neighborhood.value,
      depth: depth.value,
      emissionRule: emissionRules[stateCount.value],
      collisionMode: collisionMode.value,
      collisionFixed: currentCollisionFixed(),
      init: init.value,
      seed: seedValues[stateCount.value],
      height: H.value,
      width: W.value,
      noise: noise.value,
    }
  }

  /**
   * Restores a snapshot produced by `captureRuleSnapshot`, applying only the
   * rule-defining fields (state count, mode, code/local rule). Current
   * settings (init, seed, height, width, noise) are left untouched so they
   * persist across rule changes.
   */
  function applyRuleSnapshot(snapshot: RuleSnapshot | null | undefined): void {
    if (!snapshot) {
      return
    }
    const nextStateCount = normalizeStateCount(snapshot.stateCount)
    if (nextStateCount !== stateCount.value) {
      storeCurrentRule()
      storeCurrentSeed()
    }
    stateCount.value = nextStateCount
    neighborhood.value = normalizeNeighborhood(snapshot.neighborhood)
    depth.value = normalizeDepth(snapshot.depth)
    totalisticCodes[nextStateCount] = snapshot.code || 0
    localRules[nextStateCount] =
      snapshot.localRule || buildLocalRuleFromTotalistic(totalisticCodes[nextStateCount], nextStateCount, neighborhood.value, depth.value)
    localRuleDirty[nextStateCount] = true
    emissionRules[nextStateCount] = sanitizeEmissionRule(
      snapshot.emissionRule || defaultEmissionRule(nextStateCount),
      nextStateCount
    )
    collisionMode.value = snapshot.collisionMode || DEFAULT_COLLISION_MODE
    collisionFixed.value = clampCollisionFixed(snapshot.collisionFixed ?? DEFAULT_COLLISION_FIXED, nextStateCount)
    seedInputValue.value = seedValues[nextStateCount]
    ruleInputValue.value = localRules[nextStateCount]
    emissionInputValue.value = emissionRules[nextStateCount]
    mode.value =
      snapshot.mode === 'local' || snapshot.mode === 'descendants' ? snapshot.mode : 'totalistic'
    refresh()
  }

  return {
    // constants re-exported for template use
    COL: CA_COLORS,
    // dom ref
    canvasRef,
    // state
    H,
    W,
    mode,
    stateCount,
    neighborhood,
    depth,
    init,
    noise,
    extraRows,
    codeValue,
    codeMax,
    showCodeControl,
    sliderLabelText,
    ruleInputValue,
    ruleLabelText,
    ruleStatusText,
    emissionInputValue,
    emissionLabelText,
    emissionStatusText,
    collisionMode,
    collisionFixed,
    energyEnabled,
    initialEnergy,
    seedInputValue,
    seedLabelText,
    seedStatusText,
    seedPlaceholder,
    heightStatusText,
    widthStatusText,
    noiseStatusText,
    legendItems,
    keyText,
    grid,
    // actions
    run,
    refresh,
    continueSimulation,
    onExtraRowsInput,
    setInit,
    setMode,
    setStateCount,
    setNeighborhood,
    setDepth,
    onCodeSliderInput,
    onCodeNumberInput,
    onHeightSliderInput,
    onHeightNumberInput,
    onWidthSliderInput,
    onWidthNumberInput,
    onNoiseSliderInput,
    onNoiseNumberInput,
    onNoisePreset,
    onRuleInput,
    onSeedInput,
    onRandomRule,
    onEmissionInput,
    setCollisionMode,
    setCollisionFixed,
    onCollisionFixedInput,
    setEnergyEnabled,
    onInitialEnergyInput,
    onLegendCellClick,
    initialize: init3AndRefresh,
    captureRuleSnapshot,
    applyRuleSnapshot,
    getRenderContext,
  }
}
