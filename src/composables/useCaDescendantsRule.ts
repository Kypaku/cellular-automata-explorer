import { reactive, ref, type Ref } from 'vue'
import {
  clampCollisionFixed,
  cycleEmissionDigit,
  defaultEmissionRule,
  DEFAULT_COLLISION_FIXED,
  DEFAULT_COLLISION_MODE,
  emissionDigits,
  emissionTable,
  randomEmissionRule,
  sanitizeEmissionRule,
  sanitizeStateString,
} from '../utils/caMath'
import type { CollisionMode, RuleMode } from '../types/ca'

/** Reads the current value out of an input `Event` target. */
function inputValue(event: Event): string {
  return (event.target as HTMLInputElement).value
}

export interface CaDescendantsRuleContext {
  mode: Ref<RuleMode>
  /** Re-derives all status text + re-renders (called after every change while already in descendants mode). */
  refresh: () => void
  /** Switches the active rule mode (used to auto-switch into descendants mode when its inputs are edited). */
  setMode: (mode: RuleMode) => void
}

/**
 * Owns the "descendants" rule-mode state that is orthogonal to the
 * totalistic/local rule editor: the per-state-count emission rule strings,
 * the (global, not per-state) collision strategy/constant, and the energy-mode
 * toggle + initial energy value. Kept separate from `useCellularAutomaton`
 * because it is a self-contained slice of state read/written by its own
 * inputs (RuleControls' emission/collision/energy fields).
 */
export function useCaDescendantsRule(stateCount: Ref<number>, ctx: CaDescendantsRuleContext) {
  const { mode, refresh, setMode } = ctx
  // Descendants-mode rules, kept per state count like the local/totalistic ones.
  const emissionRules = reactive<Record<number, string>>({
    2: defaultEmissionRule(2),
    3: defaultEmissionRule(3),
    4: defaultEmissionRule(4),
    5: defaultEmissionRule(5),
  })
  // Collision resolution is a single strategy (+ constant for the 'fixed' mode),
  // shared across state counts rather than a per-state lookup table.
  const collisionMode = ref<CollisionMode>(DEFAULT_COLLISION_MODE)
  const collisionFixed = ref(DEFAULT_COLLISION_FIXED)

  // Descendants energy mode: every live cell carries a conserved scalar energy.
  // Global UI toggle (only meaningful in descendants mode) + the energy handed
  // to each live cell of the initial row.
  const energyEnabled = ref(false)
  const initialEnergy = ref(10)

  const emissionInputValue = ref('')
  const emissionLabelText = ref('')
  const emissionStatusText = ref('')

  function currentEmissionRule(): string {
    return sanitizeEmissionRule(emissionInputValue.value, stateCount.value)
  }

  function currentEmissionTable(): number[] {
    return emissionTable(emissionInputValue.value, stateCount.value)
  }

  function currentCollisionFixed(): number {
    return clampCollisionFixed(collisionFixed.value, stateCount.value)
  }

  function storeCurrentEmission(): void {
    emissionRules[stateCount.value] = sanitizeStateString(
      emissionInputValue.value,
      emissionDigits(stateCount.value),
      stateCount.value
    )
  }

  function updateDescendantsStatus(): void {
    const states = stateCount.value
    const emLen = emissionDigits(states)
    const emClean = sanitizeStateString(emissionInputValue.value, emLen, states)
    if (emissionInputValue.value !== emClean) {
      emissionInputValue.value = emClean
    }
    emissionRules[states] = emClean
    // Keep the fixed-collision value inside the valid range for the state count.
    collisionFixed.value = clampCollisionFixed(collisionFixed.value, states)
    emissionLabelText.value = `Emission: ${emLen} digits, each live state (1..${states - 1}) → (left, center, right) child`
    emissionStatusText.value =
      emClean.length === emLen
        ? `${emLen}/${emLen} positions filled`
        : `${emClean.length}/${emLen} positions, the rest are treated as 0`
  }

  function syncDescendantsInputs(): void {
    const states = stateCount.value
    if (!emissionRules[states]) {
      emissionRules[states] = defaultEmissionRule(states)
    }
    emissionInputValue.value = emissionRules[states]
    collisionFixed.value = clampCollisionFixed(collisionFixed.value, states)
  }

  function clampInitialEnergy(value: number): number {
    return Math.max(1, Math.min(1000000, Math.floor(value)))
  }

  function setInitialEnergy(value: number): void {
    if (isNaN(value)) {
      return
    }
    initialEnergy.value = clampInitialEnergy(value)
  }

  function onRandomEmission(): void {
    const randomEmission = randomEmissionRule(stateCount.value)
    emissionInputValue.value = randomEmission
    emissionRules[stateCount.value] = randomEmission
    updateDescendantsStatus()
  }

  function onLegendEmissionCellClick(index: number, direction: 1 | -1 = 1): void {
    const nextEmission = cycleEmissionDigit(currentEmissionRule(), stateCount.value, index, direction)
    emissionInputValue.value = nextEmission
    emissionRules[stateCount.value] = nextEmission
    updateDescendantsStatus()
  }

  /** Switches to descendants mode (if needed) whenever one of its own inputs is edited, then re-renders. */
  function switchInAndRefresh(): void {
    if (mode.value !== 'descendants') {
      setMode('descendants')
      return
    }
    refresh()
  }

  function onEmissionInput(event: Event): void {
    emissionInputValue.value = (event.target as HTMLInputElement).value
    storeCurrentEmission()
    updateDescendantsStatus()
    switchInAndRefresh()
  }

  function setCollisionMode(nextMode: CollisionMode): void {
    collisionMode.value = nextMode
    switchInAndRefresh()
  }

  function setCollisionFixed(value: number): void {
    if (isNaN(value)) {
      return
    }
    collisionFixed.value = clampCollisionFixed(value, stateCount.value)
    switchInAndRefresh()
  }

  function onCollisionFixedInput(event: Event): void {
    const raw = inputValue(event)
    if (raw === '') {
      return
    }
    setCollisionFixed(parseInt(raw, 10))
  }

  function setEnergyEnabled(value: boolean): void {
    energyEnabled.value = value
    switchInAndRefresh()
  }

  return {
    emissionRules,
    collisionMode,
    collisionFixed,
    energyEnabled,
    initialEnergy,
    emissionInputValue,
    emissionLabelText,
    emissionStatusText,
    currentEmissionRule,
    currentEmissionTable,
    currentCollisionFixed,
    storeCurrentEmission,
    updateDescendantsStatus,
    syncDescendantsInputs,
    clampInitialEnergy,
    setInitialEnergy,
    onRandomEmission,
    onLegendEmissionCellClick,
    onEmissionInput,
    setCollisionMode,
    setCollisionFixed,
    onCollisionFixedInput,
    setEnergyEnabled,
  }
}
