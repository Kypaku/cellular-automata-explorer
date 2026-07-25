import { ref, shallowRef, type Ref } from 'vue'
import { CA_PIXEL_SIZE } from '../constants/ca'
import { totalisticTable } from '../utils/caMath'
import {
  buildInitialRow,
  extendDiagram,
  extendDiagramEnergy,
  renderDiagram,
  renderDiagramEnergy,
} from '../utils/caRender'
import type { RenderContext } from '../utils/caLargeRender'
import type { CaConfig, CollisionMode, InitMode, RuleMode } from '../types/ca'

/** Reads the current value out of an input `Event` target. */
function inputValue(event: Event): string {
  return (event.target as HTMLInputElement).value
}

export interface CaCanvasRenderDeps {
  W: Ref<number>
  H: Ref<number>
  mode: Ref<RuleMode>
  stateCount: Ref<number>
  noise: Ref<number>
  init: Ref<InitMode>
  seedInputValue: Ref<string>
  depth: Ref<number>
  totalisticCodes: Record<number, number>
  collisionMode: Ref<CollisionMode>
  energyEnabled: Ref<boolean>
  initialEnergy: Ref<number>
  activeConfig: () => CaConfig
  currentLocalRule: () => string
  currentEmissionTable: () => number[]
  currentCollisionFixed: () => number
  currentRuleLabel: () => string
}

/**
 * Owns the on-screen canvas and everything needed to (re-)draw it: the
 * rendered space-time diagram (`grid`/`energyGrid`), the "run" / "continue
 * simulating" actions, and the export-ready `RenderContext` builder used by
 * the large-image render panel.
 */
export function useCaCanvasRender(deps: CaCanvasRenderDeps) {
  const {
    W,
    H,
    mode,
    stateCount,
    noise,
    init,
    seedInputValue,
    depth,
    totalisticCodes,
    collisionMode,
    energyEnabled,
    initialEnergy,
    activeConfig,
    currentLocalRule,
    currentEmissionTable,
    currentCollisionFixed,
    currentRuleLabel,
  } = deps

  const canvasRef = ref<HTMLCanvasElement | null>(null)
  const extraRows = ref(50) // how many more generations "continue simulation" adds

  // Last rendered space-time diagram (H rows × W cells), kept so the "convert to
  // patterns" view can reduce exactly what is on screen without re-evolving.
  const grid = shallowRef<Uint8Array[]>([])
  // Per-cell energy for the last render, aligned row-for-row with `grid` while
  // energy mode is active (empty otherwise). Used to extend the simulation.
  const energyGrid = shallowRef<Float64Array[]>([])

  function currentSums(config: CaConfig): number[] | null {
    return mode.value === 'totalistic'
      ? totalisticTable(totalisticCodes[stateCount.value], stateCount.value, config.neighborhood, config.depth)
      : null
  }

  function buildInitialRowForState(): Uint8Array {
    return buildInitialRow(W.value, activeConfig(), stateCount.value, init.value, seedInputValue.value)
  }

  /**
   * Builds the `depth - 1` prehistory rows that sit above the initial row.
   * Per the chosen init mode: 'random' fills them with random cells, everything
   * else (single/custom) leaves them empty (all background). Returns [] for depth 1.
   */
  function buildPriorRowsForState(width: number): Uint8Array[] {
    const count = depth.value - 1
    const rows: Uint8Array[] = []
    for (let i = 0; i < count; i++) {
      const row = new Uint8Array(width)
      if (init.value === 'random') {
        for (let j = 0; j < width; j++) {
          row[j] = Math.floor(Math.random() * stateCount.value)
        }
      }
      rows.push(row)
    }
    return rows
  }

  function run(): void {
    const canvas = canvasRef.value
    if (!canvas) {
      return
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      return
    }
    canvas.width = W.value * CA_PIXEL_SIZE
    canvas.height = H.value * CA_PIXEL_SIZE
    const config = activeConfig()
    const sums = currentSums(config)
    const explicitRule = mode.value === 'local' ? currentLocalRule() : ''
    const emission = mode.value === 'descendants' ? currentEmissionTable() : null
    const collisionModeValue = collisionMode.value
    const collisionFixedValue = currentCollisionFixed()

    if (mode.value === 'descendants' && energyEnabled.value) {
      const result = renderDiagramEnergy({
        ctx,
        width: W.value,
        height: H.value,
        config,
        emission: emission as number[],
        collisionMode: collisionModeValue,
        collisionFixed: collisionFixedValue,
        initialRow: buildInitialRowForState(),
        initialEnergy: initialEnergy.value,
      })
      grid.value = result.states
      energyGrid.value = result.energy
      return
    }

    grid.value = renderDiagram({
      ctx,
      width: W.value,
      height: H.value,
      config,
      mode: mode.value,
      sums,
      explicitRule,
      emission,
      collisionMode: collisionModeValue,
      collisionFixed: collisionFixedValue,
      noiseP: noise.value / 100,
      initialRow: buildInitialRowForState(),
      priorRows: buildPriorRowsForState(W.value),
    })
    energyGrid.value = []
  }

  function clampExtraRows(value: number): number {
    return Math.max(1, Math.min(5000, value))
  }

  function setExtraRows(value: number): void {
    if (isNaN(value)) {
      return
    }
    extraRows.value = clampExtraRows(value)
  }

  function onExtraRowsInput(event: Event): void {
    const raw = inputValue(event)
    if (raw === '') {
      return
    }
    const nextValue = parseInt(raw, 10)
    if (isNaN(nextValue)) {
      return
    }
    setExtraRows(nextValue)
  }

  /**
   * Continues the current diagram past its last generation instead of
   * re-simulating from the initial row: keeps every already-rendered row and
   * evolves `extraRows` more generations on top of the last one, growing the
   * canvas and `H` to fit. No-op fallback to a full `run()` if nothing has
   * been rendered yet.
   */
  function continueSimulation(): void {
    const canvas = canvasRef.value
    if (!canvas || grid.value.length === 0) {
      run()
      return
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      return
    }
    const addRows = clampExtraRows(extraRows.value)
    const config = activeConfig()
    const sums = currentSums(config)
    const explicitRule = mode.value === 'local' ? currentLocalRule() : ''
    const emission = mode.value === 'descendants' ? currentEmissionTable() : null
    const collisionModeValue = collisionMode.value
    const collisionFixedValue = currentCollisionFixed()

    const newHeight = grid.value.length + addRows
    canvas.width = W.value * CA_PIXEL_SIZE
    canvas.height = newHeight * CA_PIXEL_SIZE

    if (mode.value === 'descendants' && energyEnabled.value && energyGrid.value.length === grid.value.length) {
      const result = extendDiagramEnergy({
        ctx,
        width: W.value,
        config,
        emission: emission as number[],
        collisionMode: collisionModeValue,
        collisionFixed: collisionFixedValue,
        previousStates: grid.value,
        previousEnergy: energyGrid.value,
        extraRows: addRows,
      })
      grid.value = result.states
      energyGrid.value = result.energy
      H.value = newHeight
      return
    }

    grid.value = extendDiagram({
      ctx,
      width: W.value,
      config,
      mode: mode.value,
      sums,
      explicitRule,
      emission,
      collisionMode: collisionModeValue,
      collisionFixed: collisionFixedValue,
      noiseP: noise.value / 100,
      previousRows: grid.value,
      extraRows: addRows,
    })
    H.value = newHeight
  }

  /**
   * Bundles the immutable inputs needed to render the current rule at any
   * width/height off-screen (used by the large-scale image renderer). The
   * rule/mode/noise reflect the current UI state; the initial row is rebuilt
   * for the requested width so the export can use dimensions that differ from
   * the on-screen diagram without touching the interactive canvas.
   */
  function getRenderContext(): RenderContext {
    const config = activeConfig()
    const sums = currentSums(config)
    const explicitRule = mode.value === 'local' ? currentLocalRule() : ''
    const emission = mode.value === 'descendants' ? currentEmissionTable() : null
    return {
      config,
      mode: mode.value,
      sums,
      explicitRule,
      emission,
      collisionMode: collisionMode.value,
      collisionFixed: currentCollisionFixed(),
      noiseP: noise.value / 100,
      ruleLabel: currentRuleLabel(),
      makeInitialRow: (width: number) => buildInitialRow(width, config, stateCount.value, init.value, seedInputValue.value),
      makePriorRows: (width: number) => buildPriorRowsForState(width),
    }
  }

  return {
    canvasRef,
    extraRows,
    grid,
    energyGrid,
    run,
    continueSimulation,
    onExtraRowsInput,
    getRenderContext,
  }
}
