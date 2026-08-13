import { ref, reactive, computed } from 'vue'
import { detectAgentSurvival } from '../utils/caAnalysis'
import {
  agentFitness,
  breedPopulation,
  genomeKey,
  genomeToParts,
  genomeToSnapshot,
  randomGenome,
  sanitizeGenome,
} from '../utils/analysis/evolution'
import type {
  AgentStopReason,
  AgentSurvivalResult,
  AnalysisInitMode,
  CollisionMode,
  EvolutionSettings,
  RuleGenomeContext,
  RuleMode,
  RuleParts,
  RuleSnapshot,
} from '../types/ca'

/** How many of the best genomes of the current generation are exposed to the UI. */
export const AGENT_EVOLUTION_TOP_ROWS = 50

/** One of the best rules of the current generation, ready to open or tag. */
export interface AgentEvolutionRow extends AgentSurvivalResult {
  id: string
  name: string
  genome: string
  fitness: number
  parts: RuleParts
  snapshot: RuleSnapshot
}

/** Parameters accepted by {@link useAgentEvolution.start}. */
export interface AgentEvolutionStartParams {
  stateCount: number
  mode: RuleMode
  neighborhood?: number
  depth?: number
  collisionMode?: CollisionMode
  collisionFixed?: number
  width: number
  init: AnalysisInitMode
  /** Starting number of generations the agent has to live through. */
  height: number
  /** Upper bound for the automatic height calibration. */
  maxHeight: number
  /** Multiplier applied to the height when calibrating. */
  heightGrowth: number
  /** % of a generation that must survive the whole height to trigger a raise. */
  survivorPercent: number
  memorySize: number
  sequenceLength: number
  health: number
  stagnantRepeats: number
  populationSize: number
  /** How many generations the run evolves. */
  generations: number
  eliteCount: number
  /** Per-gene mutation probability (0..1). */
  mutationRate: number
  /** Probability a child is produced by crossover (0..1). */
  crossoverRate: number
  tournamentSize: number
  /** Fraction of the score a frozen rule keeps (0..1). */
  frozenPenalty: number
  /** Optional genome the first generation is seeded with (the current rule). */
  seedGenome?: string
}

/** One genome of the current population together with its last measurement. */
interface Individual {
  genome: string
  fitness: number
  result: AgentSurvivalResult | null
  /** Height the fitness was measured at (0 = not evaluated yet). */
  height: number
}

/**
 * Evolutionary rule search driven by the agent-survival test.
 *
 * The rule is the genome and every rule condition is a gene. A candidate is
 * scored by how long the agent stays alive before dying, so the search selects
 * for rules that the agent does NOT survive, that do not freeze (an empty or
 * endlessly repeating generation is scaled down by `frozenPenalty`) and that
 * keep the agent alive as long as possible.
 *
 * CALIBRATION: as the population gets better, rules start reaching the last
 * generation with the agent still alive — at that height they are all equally
 * "best" and the search loses its gradient. Whenever at least `survivorPercent`
 * of a generation survives, the height is multiplied by `heightGrowth` (up to
 * `maxHeight`) and the whole population is re-measured at the new height.
 *
 * NO REPEATS: every genome the run has ever put into a population is
 * remembered, so a population never holds two identical rules and breeding
 * never lands on a rule that was already tested (only the elites are carried
 * over, and they keep their score instead of being simulated again). Once no
 * novel child can be bred any more the search space is exhausted and the run
 * stops by itself.
 *
 * Generations run inside a requestAnimationFrame loop with a time budget so the
 * UI stays responsive.
 */
export function useAgentEvolution() {
  const running = ref(false)
  const generation = ref(0)
  const totalGenerations = ref(0)
  const height = ref(0)
  const calibrations = ref(0)
  const evaluations = ref(0)
  const uniqueRules = ref(0)
  const exhausted = ref(false)
  const bestFitness = ref(0)
  const averageFitness = ref(0)
  const survivorCount = ref(0)
  const frozenCount = ref(0)
  const populationCount = ref(0)
  const rows = reactive<AgentEvolutionRow[]>([])

  let frame: number | null = null

  const progress = computed(() =>
    totalGenerations.value ? Math.round((generation.value / totalGenerations.value) * 100) : 0
  )

  /** Stop reason of the current best rule ('' before the first generation). */
  const bestReason = computed<AgentStopReason | ''>(() => (rows.length ? rows[0].stopReason : ''))

  function stop(): void {
    running.value = false
    if (frame !== null) {
      cancelAnimationFrame(frame)
      frame = null
    }
  }

  function start(params: AgentEvolutionStartParams): void {
    if (running.value) {
      return
    }
    const ctx: RuleGenomeContext = {
      stateCount: params.stateCount,
      mode: params.mode,
      neighborhood: params.neighborhood,
      depth: params.depth,
      collisionMode: params.collisionMode,
      collisionFixed: params.collisionFixed,
    }
    const settings: EvolutionSettings = {
      populationSize: Math.max(4, Math.floor(params.populationSize)),
      eliteCount: Math.max(0, Math.floor(params.eliteCount)),
      mutationRate: Math.max(0, Math.min(1, params.mutationRate)),
      crossoverRate: Math.max(0, Math.min(1, params.crossoverRate)),
      tournamentSize: Math.max(1, Math.floor(params.tournamentSize)),
    }
    const width = Math.max(2, Math.floor(params.width))
    const init: AnalysisInitMode = params.init === 'single' ? 'single' : 'random'
    const maxHeight = Math.max(1, Math.floor(params.maxHeight))
    const heightGrowth = Math.max(1, params.heightGrowth)
    const survivorPercent = Math.max(0, Math.min(100, params.survivorPercent))
    const frozenPenalty = Math.max(0, Math.min(1, params.frozenPenalty))
    const survivalOptions = {
      memorySize: Math.max(1, Math.floor(params.memorySize)),
      sequenceLength: Math.max(1, Math.floor(params.sequenceLength)),
      health: Math.max(1, Math.floor(params.health)),
      stagnantRepeats: Math.max(0, Math.floor(params.stagnantRepeats)),
    }

    let population: Individual[] = []
    // Identities of every rule this run has put into a population, so nothing is
    // ever bred or simulated twice.
    const tested = new Set<string>()
    const isKnown = (genome: string): boolean => tested.has(genomeKey(genome))

    generation.value = 0
    totalGenerations.value = Math.max(1, Math.floor(params.generations))
    height.value = Math.min(maxHeight, Math.max(1, Math.floor(params.height)))
    calibrations.value = 0
    evaluations.value = 0
    uniqueRules.value = 0
    exhausted.value = false
    bestFitness.value = 0
    averageFitness.value = 0
    survivorCount.value = 0
    frozenCount.value = 0
    populationCount.value = settings.populationSize
    rows.splice(0, rows.length)
    running.value = true

    function makeIndividual(genome: string): Individual {
      return { genome, fitness: 0, result: null, height: 0 }
    }

    /** Runs the agent test on every genome that has not been measured at the current height. */
    function evaluatePopulation(): void {
      for (const individual of population) {
        if (individual.height === height.value) {
          continue
        }
        const parts = genomeToParts(individual.genome, ctx)
        const result = detectAgentSurvival(parts, { width, height: height.value, init, ...survivalOptions })
        individual.result = result
        individual.fitness = agentFitness(result, frozenPenalty)
        individual.height = height.value
        evaluations.value += 1
      }
    }

    /**
     * Raises the height once the population starts surviving it: at that point
     * the survivors are indistinguishable, so a longer run is needed to keep
     * ranking them. Everyone is re-measured on the next generation.
     */
    function calibrateHeight(): void {
      if (height.value >= maxHeight) {
        return
      }
      const survivors = population.filter((individual) => individual.result?.stopReason === 'survived').length
      if (survivors * 100 < survivorPercent * population.length) {
        return
      }
      height.value = Math.min(maxHeight, Math.max(height.value + 1, Math.round(height.value * heightGrowth)))
      calibrations.value += 1
    }

    function runGeneration(): void {
      if (!population.length) {
        const genomes: string[] = []
        const claim = (genome: string): boolean => {
          if (isKnown(genome)) {
            return false
          }
          tested.add(genomeKey(genome))
          genomes.push(genome)
          return true
        }
        if (params.seedGenome) {
          claim(sanitizeGenome(params.seedGenome, ctx))
        }
        let attempts = 0
        while (genomes.length < settings.populationSize && attempts < settings.populationSize * 64) {
          attempts += 1
          claim(randomGenome(ctx, Math.random))
        }
        if (genomes.length < settings.populationSize) {
          exhausted.value = true
        }
        population = genomes.map(makeIndividual)
      } else {
        // Individuals already measured at the current height (the elites) keep
        // their score so they are not simulated twice.
        const measured = new Map<string, Individual>()
        for (const individual of population) {
          if (individual.height === height.value) {
            measured.set(individual.genome, individual)
          }
        }
        const bred = breedPopulation(population, ctx, settings, { isKnown })
        if (bred.length < settings.populationSize) {
          exhausted.value = true
        }
        population = bred.map((genome) => {
          tested.add(genomeKey(genome))
          const known = measured.get(genome)
          return known ? { ...known } : makeIndividual(genome)
        })
      }
      uniqueRules.value = tested.size
      evaluatePopulation()
      population.sort((a, b) => b.fitness - a.fitness)
      generation.value += 1
      calibrateHeight()
    }

    /** Publishes the state of the last finished generation to the UI. */
    function publish(): void {
      let total = 0
      let survivors = 0
      let frozen = 0
      for (const individual of population) {
        total += individual.fitness
        const reason = individual.result?.stopReason
        if (reason === 'survived') {
          survivors += 1
        } else if (reason === 'dead' || reason === 'stagnant') {
          frozen += 1
        }
      }
      populationCount.value = population.length
      averageFitness.value = population.length ? Math.round((total / population.length) * 10) / 10 : 0
      bestFitness.value = population.length ? Math.round(population[0].fitness * 10) / 10 : 0
      survivorCount.value = survivors
      frozenCount.value = frozen

      rows.splice(0, rows.length)
      const top = population.slice(0, AGENT_EVOLUTION_TOP_ROWS)
      for (let i = 0; i < top.length; i++) {
        const individual = top[i]
        if (!individual.result) {
          continue
        }
        rows.push({
          id: `evo-${generation.value}-${i}`,
          name: `gen ${generation.value} #${i + 1}`,
          genome: individual.genome,
          fitness: Math.round(individual.fitness * 10) / 10,
          parts: genomeToParts(individual.genome, ctx),
          snapshot: genomeToSnapshot(individual.genome, ctx, init, individual.height),
          ...individual.result,
        })
      }
    }

    const step = () => {
      if (!running.value) {
        return
      }
      // Evolve as many generations as fit into one frame, always at least one.
      const started = performance.now()
      let stuck = false
      do {
        runGeneration()
        // Nothing but the elites left: every reachable rule has been tested.
        stuck = exhausted.value && population.length <= Math.min(settings.populationSize - 1, settings.eliteCount)
      } while (
        running.value &&
        !stuck &&
        generation.value < totalGenerations.value &&
        performance.now() - started < 24
      )
      publish()
      if (stuck || generation.value >= totalGenerations.value) {
        running.value = false
        frame = null
        return
      }
      frame = requestAnimationFrame(step)
    }

    frame = requestAnimationFrame(step)
  }

  return {
    running,
    generation,
    totalGenerations,
    progress,
    height,
    calibrations,
    evaluations,
    uniqueRules,
    exhausted,
    bestFitness,
    bestReason,
    averageFitness,
    survivorCount,
    frozenCount,
    populationCount,
    rows,
    start,
    stop,
  }
}
