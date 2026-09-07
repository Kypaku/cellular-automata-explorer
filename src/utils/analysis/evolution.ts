// Evolutionary (genetic) rule search.
//
// A rule is treated as a GENOME: a plain digit string in base `states` where
// every character is one GENE — the output of a single rule condition.
//   - local mode:       one gene per neighborhood pattern (`states ^ taps`).
//   - totalistic mode:  one gene per neighbour sum (`taps * (states - 1) + 1`).
//   - descendants mode: one gene per emitted child (`3 * (states - 1)`).
// The rule *shape* (states / neighborhood / depth / collision) is fixed for a
// whole run, so genomes always have the same length and can be crossed over
// gene by gene.
import type {
  AgentSurvivalResult,
  AnalysisInitMode,
  EvolutionRanked,
  EvolutionSettings,
  RuleGenomeContext,
  RuleParts,
  RuleSnapshot,
} from '../../types/ca'
import {
  DEFAULT_COLLISION_FIXED,
  DEFAULT_COLLISION_MODE,
  LOCAL_MATERIALIZE_LIMIT,
  buildLocalRuleFromTotalistic,
  clampCollisionFixed,
  emissionDigits,
  getConfig,
  normalizeDepth,
  normalizeNeighborhood,
  normalizeStateCount,
  padRight,
  sanitizeStateString,
  stateChar,
  stateDigitAt,
  totalisticTable,
} from '../caMath'

/** Number of genes (rule conditions) a genome holds for the given rule shape. */
export function genomeLength(ctx: RuleGenomeContext): number {
  const states = normalizeStateCount(ctx.stateCount)
  if (ctx.mode === 'descendants') {
    return emissionDigits(states)
  }
  const config = getConfig(states, ctx.neighborhood, ctx.depth)
  return ctx.mode === 'totalistic' ? config.totalisticDigits : Math.min(config.localDigits, LOCAL_MATERIALIZE_LIMIT)
}

/** A uniformly random genome for the given rule shape. */
export function randomGenome(ctx: RuleGenomeContext, rand: () => number = Math.random): string {
  const states = normalizeStateCount(ctx.stateCount)
  const length = genomeLength(ctx)
  let genome = ''
  for (let i = 0; i < length; i++) {
    genome += stateChar(Math.floor(rand() * states))
  }
  return genome
}

/** Cleans/pads an arbitrary digit string into a valid genome for `ctx`. */
export function sanitizeGenome(genome: string, ctx: RuleGenomeContext): string {
  const states = normalizeStateCount(ctx.stateCount)
  const length = genomeLength(ctx)
  return padRight(sanitizeStateString(genome, length, states), length)
}

/**
 * Compact identity of a genome, used to remember every rule the run has already
 * tried. Genomes can be up to `LOCAL_MATERIALIZE_LIMIT` characters long, so the
 * whole string is never kept — the key is the length plus two independent
 * hashes, which makes an accidental clash vanishingly unlikely (and harmless:
 * the only effect would be skipping one candidate rule).
 */
export function genomeKey(genome: string): string {
  let fnv = 0x811c9dc5
  let djb = 5381
  for (let i = 0; i < genome.length; i++) {
    const code = genome.charCodeAt(i)
    fnv = Math.imul(fnv ^ code, 16777619)
    djb = (Math.imul(djb, 33) + code) | 0
  }
  return `${genome.length}:${fnv >>> 0}:${djb >>> 0}`
}

/**
 * Copies a genome, redrawing every gene with probability `rate`. A mutated gene
 * is always *different* from the one it replaces, so the rate is the real rate
 * of change rather than the rate of attempts.
 */
export function mutateGenome(genome: string, ctx: RuleGenomeContext, rate: number, rand: () => number = Math.random): string {
  const states = normalizeStateCount(ctx.stateCount)
  if (states < 2 || rate <= 0) {
    return genome
  }
  let mutated = ''
  for (let i = 0; i < genome.length; i++) {
    if (rand() < rate) {
      const current = stateDigitAt(genome, i)
      const shift = 1 + Math.floor(rand() * (states - 1))
      mutated += stateChar((current + shift) % states)
    } else {
      mutated += genome[i]
    }
  }
  return mutated
}

/**
 * Redraws exactly `count` random genes. Used to push a child away from a genome
 * the run has already tested instead of burning a population slot on a repeat.
 */
export function jitterGenome(genome: string, ctx: RuleGenomeContext, count: number, rand: () => number = Math.random): string {
  const states = normalizeStateCount(ctx.stateCount)
  if (states < 2 || !genome.length) {
    return genome
  }
  const genes = genome.split('')
  const rounds = Math.max(1, Math.min(genes.length, Math.floor(count)))
  for (let i = 0; i < rounds; i++) {
    const at = Math.floor(rand() * genes.length)
    const current = stateDigitAt(genes[at], 0)
    const shift = 1 + Math.floor(rand() * (states - 1))
    genes[at] = stateChar((current + shift) % states)
  }
  return genes.join('')
}

/** How many times a mutation is retried before a genome is declared a dead end. */
const MUTATION_ATTEMPTS = 64

/** Extra knobs of {@link mutateNovelGenome}. */
export interface NovelMutationOptions {
  /** True for every genome that must not be produced again (already tested). */
  isTaken?: (genome: string) => boolean
  rand?: () => number
}

/**
 * Mutates `genome` into a child that is BOTH different from its parent and new
 * to the search. Each failed attempt pushes the child further away (more forced
 * gene flips), so a crowded neighbourhood is escaped instead of re-drawn. Returns
 * `null` when no unseen mutation could be produced — the genome is a dead end.
 */
export function mutateNovelGenome(
  genome: string,
  ctx: RuleGenomeContext,
  rate: number,
  options: NovelMutationOptions = {}
): string | null {
  const rand = options.rand || Math.random
  const isTaken = options.isTaken || (() => false)
  const acceptable = (child: string): boolean => child !== genome && !isTaken(child)
  for (let attempt = 0; attempt < MUTATION_ATTEMPTS; attempt++) {
    const child = mutateGenome(genome, ctx, rate, rand)
    if (acceptable(child)) {
      return child
    }
    const nudged = jitterGenome(child, ctx, 1 + Math.floor(attempt / 8), rand)
    if (acceptable(nudged)) {
      return nudged
    }
  }
  return null
}

/** Uniform crossover: every gene is taken from either parent with equal odds. */
export function crossoverGenomes(a: string, b: string, rand: () => number = Math.random): string {
  const length = Math.min(a.length, b.length)
  let child = ''
  for (let i = 0; i < length; i++) {
    child += rand() < 0.5 ? a[i] : b[i]
  }
  return child
}

/**
 * Tournament selection: `size` random candidates compete, the fittest wins.
 * Keeps the search from collapsing onto the single best genome too early.
 */
export function tournamentPick<T extends EvolutionRanked>(population: T[], size: number, rand: () => number = Math.random): T {
  const rounds = Math.max(1, Math.min(population.length, Math.floor(size)))
  let best = population[Math.floor(rand() * population.length)]
  for (let i = 1; i < rounds; i++) {
    const challenger = population[Math.floor(rand() * population.length)]
    if (challenger.fitness > best.fitness) {
      best = challenger
    }
  }
  return best
}

/** How many times a child is re-bred / re-drawn before a slot is given up on. */
const NOVELTY_ATTEMPTS = 64

/** Extra knobs of {@link breedPopulation}. */
export interface BreedOptions {
  /** True for every genome the run has already tested; such children are re-bred. */
  isKnown?: (genome: string) => boolean
  rand?: () => number
}

/** Breeds one child that is neither in the next population nor already tested. */
function breedNovelChild<T extends EvolutionRanked & { genome: string }>(
  ranked: T[],
  ctx: RuleGenomeContext,
  settings: EvolutionSettings,
  rand: () => number,
  isTaken: (genome: string) => boolean
): string | null {
  for (let attempt = 0; attempt < NOVELTY_ATTEMPTS; attempt++) {
    let child = tournamentPick(ranked, settings.tournamentSize, rand).genome
    if (rand() < settings.crossoverRate) {
      child = crossoverGenomes(child, tournamentPick(ranked, settings.tournamentSize, rand).genome, rand)
    }
    child = mutateGenome(child, ctx, settings.mutationRate, rand)
    if (!isTaken(child)) {
      return child
    }
    // Bred a rule that was already tested: nudge it further away, harder on
    // every failed attempt, rather than trying the same neighbourhood again.
    child = jitterGenome(child, ctx, 1 + Math.floor(attempt / 8), rand)
    if (!isTaken(child)) {
      return child
    }
  }
  // The neighbourhood of the population is used up — look for fresh blood.
  for (let attempt = 0; attempt < NOVELTY_ATTEMPTS; attempt++) {
    const fresh = randomGenome(ctx, rand)
    if (!isTaken(fresh)) {
      return fresh
    }
  }
  return null
}

/**
 * Builds the next generation: the elites unchanged plus crossed/mutated
 * children. Every genome is unique inside the returned population, and — when
 * `isKnown` is given — one the run has never tested before, so no rule is ever
 * simulated twice. If no novel child can be found any more, the population is
 * returned short: the reachable search space is exhausted.
 */
export function breedPopulation<T extends EvolutionRanked & { genome: string }>(
  population: T[],
  ctx: RuleGenomeContext,
  settings: EvolutionSettings,
  options: BreedOptions = {}
): string[] {
  const rand = options.rand || Math.random
  const isKnown = options.isKnown || (() => false)
  const size = Math.max(2, Math.floor(settings.populationSize))
  const ranked = population.slice().sort((a, b) => b.fitness - a.fitness)
  const elites = Math.max(0, Math.min(size - 1, Math.floor(settings.eliteCount)))
  const genomes: string[] = []
  const taken = new Set<string>()
  const claim = (genome: string): boolean => {
    const key = genomeKey(genome)
    if (taken.has(key)) {
      return false
    }
    taken.add(key)
    genomes.push(genome)
    return true
  }
  // The elites are the only genomes carried over; they are not re-simulated,
  // they just keep the score they already have.
  for (let i = 0; i < ranked.length && genomes.length < elites; i++) {
    claim(ranked[i].genome)
  }
  while (genomes.length < size) {
    const child = breedNovelChild(ranked, ctx, settings, rand, (genome) => taken.has(genomeKey(genome)) || isKnown(genome))
    if (child === null || !claim(child)) {
      break
    }
  }
  return genomes
}

/** Numeric totalistic code of a genome (gene i = output for neighbour sum i). */
export function genomeToTotalisticCode(genome: string, states: number): number {
  let code = 0
  for (let i = genome.length - 1; i >= 0; i--) {
    code = code * states + stateDigitAt(genome, i)
  }
  return code
}

/** Turns a genome back into the rule identity used by every analysis. */
export function genomeToParts(genome: string, ctx: RuleGenomeContext): RuleParts {
  const stateCount = normalizeStateCount(ctx.stateCount)
  if (ctx.mode === 'descendants') {
    return {
      stateCount,
      mode: 'descendants',
      code: 0,
      localRule: '',
      emissionRule: genome,
      collisionMode: ctx.collisionMode || DEFAULT_COLLISION_MODE,
      collisionFixed: clampCollisionFixed(ctx.collisionFixed ?? DEFAULT_COLLISION_FIXED, stateCount),
    }
  }
  const neighborhood = normalizeNeighborhood(ctx.neighborhood)
  const depth = normalizeDepth(ctx.depth)
  return ctx.mode === 'totalistic'
    ? {
        stateCount,
        mode: 'totalistic',
        code: genomeToTotalisticCode(genome, stateCount),
        localRule: '',
        neighborhood,
        depth,
      }
    : { stateCount, mode: 'local', code: 0, localRule: genome, neighborhood, depth }
}

/** Turns a genome into a reusable snapshot (so the rule can be opened/tagged). */
export function genomeToSnapshot(
  genome: string,
  ctx: RuleGenomeContext,
  init: AnalysisInitMode,
  height: number
): RuleSnapshot {
  const stateCount = normalizeStateCount(ctx.stateCount)
  const normInit: 'single' | 'random' = init === 'single' ? 'single' : 'random'
  if (ctx.mode === 'descendants') {
    return {
      stateCount,
      mode: 'descendants',
      code: 0,
      localRule: '',
      emissionRule: genome,
      collisionMode: ctx.collisionMode || DEFAULT_COLLISION_MODE,
      collisionFixed: clampCollisionFixed(ctx.collisionFixed ?? DEFAULT_COLLISION_FIXED, stateCount),
      init: normInit,
      seed: '',
      height,
    }
  }
  const neighborhood = normalizeNeighborhood(ctx.neighborhood)
  const depth = normalizeDepth(ctx.depth)
  const code = ctx.mode === 'totalistic' ? genomeToTotalisticCode(genome, stateCount) : 0
  return {
    stateCount,
    mode: ctx.mode,
    code,
    localRule: ctx.mode === 'totalistic' ? buildLocalRuleFromTotalistic(code, stateCount, neighborhood, depth) : genome,
    neighborhood,
    depth,
    init: normInit,
    seed: '',
    height,
  }
}

/** Reads the genome (one gene per rule condition) out of a saved rule snapshot. */
export function snapshotToGenome(snapshot: RuleSnapshot, ctx: RuleGenomeContext): string {
  const states = normalizeStateCount(ctx.stateCount)
  if (ctx.mode === 'descendants') {
    return sanitizeGenome(snapshot.emissionRule || '', ctx)
  }
  if (ctx.mode === 'totalistic') {
    const table = totalisticTable(snapshot.code || 0, states, ctx.neighborhood, ctx.depth)
    return table.map((digit) => stateChar(digit)).join('')
  }
  return sanitizeGenome(snapshot.localRule || '', ctx)
}

/**
 * Fitness of one agent-survival run, following the selection rule: the agent
 * must NOT survive, the rule must not freeze, and the agent should die as LATE
 * as possible. So the score is simply how long the run lasted, scaled down by
 * `frozenPenalty` when the rule froze (an empty or endlessly repeating
 * generation) — those runs say nothing about the agent. A run the agent
 * survives scores highest and is the signal to raise H (see the calibration in
 * `useAgentEvolution`), because at this height the rule can no longer be told
 * apart from a better one.
 */
export function agentFitness(result: AgentSurvivalResult, frozenPenalty: number): number {
  const frozen = result.stopReason === 'dead' || result.stopReason === 'stagnant'
  return frozen ? result.generations * Math.max(0, frozenPenalty) : result.generations
}
