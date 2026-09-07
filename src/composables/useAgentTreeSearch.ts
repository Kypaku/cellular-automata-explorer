import { ref, reactive, computed, shallowRef } from 'vue'
import { detectAgentSurvival } from '../utils/caAnalysis'
import {
  agentFitness,
  genomeKey,
  genomeToParts,
  genomeToSnapshot,
  mutateNovelGenome,
  randomGenome,
  sanitizeGenome,
} from '../utils/analysis/evolution'
import type {
  AgentStopReason,
  AgentSurvivalResult,
  AnalysisInitMode,
  CollisionMode,
  RuleGenomeContext,
  RuleMode,
  RuleParts,
  RuleSnapshot,
} from '../types/ca'

/** How many of the best rules found so far are exposed to the UI. */
export const AGENT_TREE_TOP_ROWS = 50

/** Hard cap on the number of log events one run keeps in memory. */
export const AGENT_TREE_LOG_LIMIT = 200000

/** Longest rule string written into the log; longer ones are logged by hash. */
const LOG_RULE_LIMIT = 2048

/** What happened at one step of the walk. */
export type TreeLogEvent =
  /** A new tree was started from a random (or the current) rule. */
  | 'root'
  /** A mutated child was spawned and tested. */
  | 'child'
  /** An already tested rule was re-tested after the height was raised. */
  | 'remeasure'
  /** The height was raised because too many children survived it. */
  | 'calibrate'
  /** The walk moved down into a child. */
  | 'descend'
  /** No child of this node is usable — the branch is abandoned. */
  | 'dead-end'
  /** The walk stepped back to the parent. */
  | 'back'
  /** The whole tree was used up. */
  | 'restart'
  /** The run finished. */
  | 'stop'

/** One line of the traversal log. */
export interface TreeLogEntry {
  /** Position of the line in the log, starting at 1. */
  seq: number
  event: TreeLogEvent
  /** Sequential id of the rule this line is about (0 = none). */
  node: number
  /** Id of the rule it was mutated from (0 = none). */
  parent: number
  root: number
  depth: number
  height: number
  reason: AgentStopReason | ''
  generations: number
  healthLeft: number
  unknownHits: number
  learned: number
  fitness: number
  /** Rule as written into the text file (a hash for very large rule tables). */
  rule: string
  /** Full rule string, so the line can be opened in the editor ('' = none). */
  genome: string
  note: string
}

/** One of the best rules the tree search has met, ready to open or tag. */
export interface AgentTreeRow extends AgentSurvivalResult {
  id: string
  name: string
  genome: string
  fitness: number
  /** How deep in the mutation tree the rule was found. */
  depth: number
  parts: RuleParts
  snapshot: RuleSnapshot
}

/** Parameters accepted by {@link useAgentTreeSearch.start}. */
export interface AgentTreeStartParams {
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
  /** % of one child set that must survive the whole height to trigger a raise. */
  survivorPercent: number
  memorySize: number
  sequenceLength: number
  health: number
  stagnantRepeats: number
  /** N: how many mutated children every node spawns. */
  branching: number
  /** Per-gene mutation probability of a child (0..1). */
  mutationRate: number
  /** Fraction of the score a frozen rule keeps (0..1). */
  frozenPenalty: number
  /** Deepest branch the walk may reach. */
  maxDepth: number
  /** Total budget of rules one run may test. */
  maxRules: number
  /** Start over from another random rule once a tree is used up. */
  restart: boolean
  /** How many random starting rules one run may use. */
  maxRoots: number
  /** Optional genome the first tree starts from (the current rule). */
  seedGenome?: string
}

/** One tested rule inside the mutation tree. */
interface TreeNode {
  genome: string
  fitness: number
  result: AgentSurvivalResult
  /** Height the fitness was measured at. */
  height: number
  depth: number
  /** Sequential id, used to tie the log lines together. */
  id: number
  /** Which starting rule this node descends from (1-based). */
  root: number
  parent: TreeNode | null
  /** Children worth descending into, best first. */
  candidates: TreeNode[]
  /** Index of the next candidate to walk into. */
  cursor: number
}

/** A remembered result, kept light: the row itself is built only when published. */
interface BestRecord {
  genome: string
  fitness: number
  result: AgentSurvivalResult
  depth: number
  height: number
  root: number
}

/**
 * Tree search driven by the agent-survival test.
 *
 * The run starts from a random (or the current) rule and spawns `branching`
 * children from it, each carrying its own unique mutation. Every child is scored
 * exactly like the evolutionary hunt — the agent must NOT survive, the rule must
 * not freeze, and the agent should die as LATE as possible — and the walk
 * descends into the best usable child, spawning its children in turn.
 *
 * A node whose children all survive or freeze is a dead end: the walk steps back
 * and takes the next best sibling instead. Once it has stepped back past the
 * starting rule the tree is used up, and the run either stops or starts over
 * from another random rule (up to `maxRoots` of them).
 *
 * NO REPEATS: every genome the run has ever produced is remembered, so no rule is
 * ever tested twice — a mutation that lands on a known rule is redrawn, and a
 * node that cannot produce any unseen mutation is treated as a dead end.
 *
 * CALIBRATION: like the evolutionary hunt, once at least `survivorPercent` of a
 * child set survives the whole height the children can no longer be told apart,
 * so the height is multiplied by `heightGrowth` (up to `maxHeight`) and that
 * child set is re-measured.
 *
 * The walk runs inside a requestAnimationFrame loop with a time budget so the UI
 * stays responsive.
 */
export function useAgentTreeSearch() {
  const running = ref(false)
  const evaluations = ref(0)
  const uniqueRules = ref(0)
  const ruleBudget = ref(0)
  const height = ref(0)
  const calibrations = ref(0)
  const currentDepth = ref(0)
  const deepestDepth = ref(0)
  const rootCount = ref(0)
  const backtracks = ref(0)
  const exhausted = ref(false)
  const bestFitness = ref(0)
  const rows = reactive<AgentTreeRow[]>([])
  /** How many events the traversal log of the current run holds. */
  const logSize = ref(0)
  /** The traversal log as the UI sees it (refreshed at most a few times a second). */
  const logEntries = shallowRef<TreeLogEntry[]>([])

  let frame: number | null = null
  let log: TreeLogEntry[] = []
  let logHeader: string[] = []
  let logTruncated = false
  let logPublishedAt = 0
  /** Rule shape of the last started run, so a log line can be reopened. */
  let logContext: { ctx: RuleGenomeContext; init: AnalysisInitMode; height: number } | null = null

  const progress = computed(() =>
    ruleBudget.value ? Math.min(100, Math.round((evaluations.value / ruleBudget.value) * 100)) : 0
  )

  /** Stop reason of the best rule found so far ('' before the first test). */
  const bestReason = computed<AgentStopReason | ''>(() => (rows.length ? rows[0].stopReason : ''))

  /** Turns the rule of a log line back into a snapshot the editor can open. */
  function snapshotForGenome(genome: string, entryHeight = 0): RuleSnapshot | null {
    if (!genome || !logContext) {
      return null
    }
    return genomeToSnapshot(genome, logContext.ctx, logContext.init, entryHeight || logContext.height)
  }

  /**
   * Copies the log into the UI-facing array. Sorting/filtering a long log is not
   * free, so during a run it is refreshed a few times a second only; `force`
   * flushes the last events when the run ends.
   */
  function publishLog(force: boolean): void {
    logSize.value = log.length
    const now = performance.now()
    if (!force && (log.length === logEntries.value.length || now - logPublishedAt < 400)) {
      return
    }
    logPublishedAt = now
    logEntries.value = log.slice()
  }

  /** Appends one line to the traversal log (silently truncated once it is full). */
  function logEvent(entry: Partial<TreeLogEntry> & { event: TreeLogEvent }): void {
    if (log.length >= AGENT_TREE_LOG_LIMIT) {
      logTruncated = true
      return
    }
    log.push({
      seq: log.length + 1,
      node: 0,
      parent: 0,
      root: 0,
      depth: 0,
      height: 0,
      reason: '',
      generations: 0,
      healthLeft: 0,
      unknownHits: 0,
      learned: 0,
      fitness: 0,
      rule: '',
      genome: '',
      note: '',
      ...entry,
    })
  }

  const LOG_COLUMNS = [
    '#',
    'event',
    'rule#',
    'from#',
    'tree',
    'depth',
    'H',
    'result',
    'generations',
    'health_left',
    'unknown',
    'learned',
    'score',
    'rule',
    'note',
  ]

  /**
   * The whole traversal as tab-separated text: a commented header with the rule
   * shape and the settings of the run, then one line per event (every rule that
   * was tested, every height raise, every step down and back).
   */
  function buildLogText(): string {
    const lines = logHeader.slice()
    lines.push(`# events: ${log.length}${logTruncated ? ` (truncated at ${AGENT_TREE_LOG_LIMIT})` : ''}`)
    lines.push('#')
    lines.push(LOG_COLUMNS.join('\t'))
    for (const entry of log) {
      lines.push(
        [
          entry.seq,
          entry.event,
          entry.node || '',
          entry.parent || '',
          entry.root || '',
          entry.depth,
          entry.height || '',
          entry.reason,
          entry.generations || '',
          entry.healthLeft || '',
          entry.unknownHits || '',
          entry.learned || '',
          entry.fitness ? Math.round(entry.fitness * 10) / 10 : '',
          entry.rule,
          entry.note,
        ].join('\t')
      )
    }
    return lines.join('\n')
  }

  function stop(): void {
    if (running.value) {
      logEvent({ event: 'stop', note: 'stopped by the user' })
      publishLog(true)
    }
    running.value = false
    if (frame !== null) {
      cancelAnimationFrame(frame)
      frame = null
    }
  }

  function start(params: AgentTreeStartParams): void {
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
    const width = Math.max(2, Math.floor(params.width))
    const init: AnalysisInitMode = params.init === 'single' ? 'single' : 'random'
    const maxHeight = Math.max(1, Math.floor(params.maxHeight))
    const heightGrowth = Math.max(1, params.heightGrowth)
    const survivorPercent = Math.max(0, Math.min(100, params.survivorPercent))
    const frozenPenalty = Math.max(0, Math.min(1, params.frozenPenalty))
    const branching = Math.max(1, Math.floor(params.branching))
    const mutationRate = Math.max(0, Math.min(1, params.mutationRate))
    const maxDepth = Math.max(1, Math.floor(params.maxDepth))
    const maxRules = Math.max(1, Math.floor(params.maxRules))
    const maxRoots = params.restart ? Math.max(1, Math.floor(params.maxRoots)) : 1
    const survivalOptions = {
      memorySize: Math.max(1, Math.floor(params.memorySize)),
      sequenceLength: Math.max(1, Math.floor(params.sequenceLength)),
      health: Math.max(1, Math.floor(params.health)),
      stagnantRepeats: Math.max(0, Math.floor(params.stagnantRepeats)),
    }

    // Identity of every rule this run has produced, so nothing is tested twice.
    const tested = new Set<string>()
    const isKnown = (genome: string): boolean => tested.has(genomeKey(genome))
    const best: BestRecord[] = []
    let current: TreeNode | null = null
    let finished = false
    let rowsDirty = false
    let nodeSeq = 0

    log = []
    logTruncated = false
    logSize.value = 0
    logEntries.value = []
    logPublishedAt = 0
    logContext = { ctx, init, height: Math.min(maxHeight, Math.max(1, Math.floor(params.height))) }
    logHeader = [
      '# Tree search log \u2014 agent survival',
      `# started: ${new Date().toISOString()}`,
      `# rule shape: ${params.mode}, ${params.stateCount} states` +
        (params.mode === 'descendants'
          ? `, collision ${params.collisionMode || 'sum'}${params.collisionMode === 'fixed' ? ` ${params.collisionFixed}` : ''}`
          : `, neighborhood ${params.neighborhood ?? 3}, previous rows ${params.depth ?? 1}`),
      `# field: W ${width}, init ${init}, H ${Math.min(maxHeight, Math.max(1, Math.floor(params.height)))}\u2192${maxHeight} (\u00d7${heightGrowth} once \u2265${survivorPercent}% of a child set survives)`,
      `# search: ${branching} children per node, mutation ${Math.round(mutationRate * 1000) / 10}%, frozen keeps ${Math.round(frozenPenalty * 1000) / 10}% of the score, max depth ${maxDepth}, budget ${maxRules} rules, ${params.restart ? `up to ${maxRoots} starting rules` : 'no restarts'}`,
      `# agent: memory ${survivalOptions.memorySize}, sequence ${survivalOptions.sequenceLength}, health ${survivalOptions.health}, repeats to stop ${survivalOptions.stagnantRepeats}`,
      '#',
    ]

    evaluations.value = 0
    uniqueRules.value = 0
    ruleBudget.value = maxRules
    height.value = Math.min(maxHeight, Math.max(1, Math.floor(params.height)))
    calibrations.value = 0
    currentDepth.value = 0
    deepestDepth.value = 0
    rootCount.value = 0
    backtracks.value = 0
    exhausted.value = false
    bestFitness.value = 0
    rows.splice(0, rows.length)
    running.value = true

    /** Keeps the best results of the whole run, best first. */
    function remember(node: TreeNode): void {
      if (best.length >= AGENT_TREE_TOP_ROWS && node.fitness <= best[best.length - 1].fitness) {
        return
      }
      const record: BestRecord = {
        genome: node.genome,
        fitness: node.fitness,
        result: node.result,
        depth: node.depth,
        height: node.height,
        root: node.root,
      }
      let at = best.findIndex((entry) => entry.fitness < record.fitness)
      if (at < 0) {
        at = best.length
      }
      best.splice(at, 0, record)
      if (best.length > AGENT_TREE_TOP_ROWS) {
        best.length = AGENT_TREE_TOP_ROWS
      }
      rowsDirty = true
    }

    /** Runs the agent test on a genome at the current height. */
    function measure(node: TreeNode, event: TreeLogEvent): void {
      const parts = genomeToParts(node.genome, ctx)
      const result = detectAgentSurvival(parts, { width, height: height.value, init, ...survivalOptions })
      node.result = result
      node.fitness = agentFitness(result, frozenPenalty)
      node.height = height.value
      evaluations.value += 1
      remember(node)
      logEvent({
        event,
        node: node.id,
        parent: node.parent ? node.parent.id : 0,
        root: node.root,
        depth: node.depth,
        height: node.height,
        reason: result.stopReason,
        generations: result.generations,
        healthLeft: result.healthLeft,
        unknownHits: result.unknownHits,
        learned: result.learned,
        fitness: node.fitness,
        // Huge rule tables would bloat the file; those are logged by identity.
        rule: node.genome.length <= LOG_RULE_LIMIT ? node.genome : genomeKey(node.genome),
        genome: node.genome,
      })
    }

    function makeNode(genome: string, parent: TreeNode | null, depth: number, event: TreeLogEvent): TreeNode {
      nodeSeq += 1
      const node: TreeNode = {
        genome,
        fitness: 0,
        result: { survived: false, stopReason: 'died', generations: 0, healthLeft: 0, unknownHits: 0, learned: 0 },
        height: 0,
        depth,
        id: nodeSeq,
        root: rootCount.value,
        parent,
        candidates: [],
        cursor: 0,
      }
      tested.add(genomeKey(genome))
      uniqueRules.value = tested.size
      measure(node, event)
      return node
    }

    /** A random rule the run has not tried yet, or null when none is left. */
    function freshGenome(): string | null {
      for (let attempt = 0; attempt < 64; attempt++) {
        const genome = randomGenome(ctx, Math.random)
        if (!isKnown(genome)) {
          return genome
        }
      }
      return null
    }

    /** Begins a new tree from a random (or, the first time, the seeded) rule. */
    function startTree(): void {
      if (rootCount.value >= maxRoots) {
        finished = true
        logEvent({ event: 'stop', note: `all ${maxRoots} starting rule(s) used up` })
        return
      }
      let genome: string | null = null
      let source = 'random rule'
      if (!rootCount.value && params.seedGenome) {
        const seed = sanitizeGenome(params.seedGenome, ctx)
        genome = isKnown(seed) ? null : seed
        source = 'the current rule'
      }
      if (genome === null) {
        genome = freshGenome()
        source = 'random rule'
      }
      if (genome === null) {
        exhausted.value = true
        finished = true
        logEvent({ event: 'stop', note: 'no untested rule of this shape is left' })
        return
      }
      rootCount.value += 1
      current = makeNode(genome, null, 0, 'root')
      currentDepth.value = 0
      const line = log[log.length - 1]
      if (line && line.event === 'root') {
        line.note = `new tree from a ${source}`
      }
    }

    /**
     * Raises the height once a child set starts surviving it: at that point the
     * survivors are indistinguishable, so a longer run is needed to rank them.
     * The whole set is re-measured at the new height.
     */
    function calibrate(children: TreeNode[]): void {
      for (let round = 0; round < 8 && children.length && height.value < maxHeight; round++) {
        const survivors = children.filter((child) => child.result.stopReason === 'survived').length
        if (survivors * 100 < survivorPercent * children.length) {
          return
        }
        const previous = height.value
        height.value = Math.min(maxHeight, Math.max(height.value + 1, Math.round(height.value * heightGrowth)))
        calibrations.value += 1
        logEvent({
          event: 'calibrate',
          height: height.value,
          note: `${survivors} of ${children.length} children survived H ${previous} \u2014 raised to ${height.value}`,
        })
        for (const child of children) {
          measure(child, 'remeasure')
        }
      }
    }

    /** Spawns and scores the children of a node, keeping the usable ones. */
    function expand(node: TreeNode): void {
      const children: TreeNode[] = []
      if (node.depth < maxDepth) {
        for (let i = 0; i < branching && evaluations.value < maxRules; i++) {
          const child = mutateNovelGenome(node.genome, ctx, mutationRate, { isTaken: isKnown })
          if (child === null) {
            // Every mutation of this rule has been tested already.
            logEvent({
              event: 'dead-end',
              node: node.id,
              root: node.root,
              depth: node.depth,
              note: 'no untested mutation of this rule is left',
            })
            break
          }
          children.push(makeNode(child, node, node.depth + 1, 'child'))
        }
        calibrate(children)
      }
      children.sort((a, b) => b.fitness - a.fitness)
      // Only a rule the agent actually died on carries the search forward: a
      // survived or frozen child says nothing about how late the agent can die.
      node.candidates = children.filter((child) => child.result.stopReason === 'died')
      node.cursor = 0
      if (!node.candidates.length) {
        const survived = children.filter((child) => child.result.stopReason === 'survived').length
        logEvent({
          event: 'dead-end',
          node: node.id,
          root: node.root,
          depth: node.depth,
          height: height.value,
          note: children.length
            ? `all ${children.length} children unusable (${survived} survived, ${children.length - survived} frozen)`
            : 'no children could be spawned',
        })
      }
    }

    /** Walks into the best untried child, stepping back through dead ends. */
    function descend(): void {
      let node: TreeNode | null = current
      while (node) {
        if (node.cursor < node.candidates.length) {
          const next = node.candidates[node.cursor]
          node.cursor += 1
          current = next
          currentDepth.value = next.depth
          deepestDepth.value = Math.max(deepestDepth.value, next.depth)
          logEvent({
            event: 'descend',
            node: next.id,
            parent: node.id,
            root: next.root,
            depth: next.depth,
            height: next.height,
            reason: next.result.stopReason,
            generations: next.result.generations,
            fitness: next.fitness,
            genome: next.genome,
            note: `child ${node.cursor} of ${node.candidates.length} by score`,
          })
          return
        }
        // Nothing left under this node — drop the branch and step back.
        node.candidates = []
        const from = node
        node = node.parent
        backtracks.value += 1
        logEvent({
          event: 'back',
          node: node ? node.id : 0,
          parent: from.id,
          root: from.root,
          depth: node ? node.depth : 0,
          note: node ? `back to depth ${node.depth}` : 'back at the starting rule',
        })
      }
      // Back at the starting rule: this tree is used up.
      current = null
      currentDepth.value = 0
      if (params.restart) {
        logEvent({ event: 'restart', root: rootCount.value, note: 'tree used up' })
      } else {
        finished = true
        logEvent({ event: 'stop', root: rootCount.value, note: 'tree used up, restarts are off' })
      }
    }

    function advance(): void {
      if (!current) {
        startTree()
        return
      }
      expand(current)
      descend()
    }

    /** Publishes the best rules found so far to the UI. */
    function publish(): void {
      publishLog(false)
      bestFitness.value = best.length ? Math.round(best[0].fitness * 10) / 10 : 0
      if (!rowsDirty) {
        return
      }
      rowsDirty = false
      rows.splice(0, rows.length)
      for (let i = 0; i < best.length; i++) {
        const record = best[i]
        rows.push({
          id: `tree-${i}`,
          name: `rule ${record.root}, depth ${record.depth}`,
          genome: record.genome,
          fitness: Math.round(record.fitness * 10) / 10,
          depth: record.depth,
          parts: genomeToParts(record.genome, ctx),
          snapshot: genomeToSnapshot(record.genome, ctx, init, record.height),
          ...record.result,
        })
      }
    }

    const step = () => {
      if (!running.value) {
        return
      }
      // Walk as many nodes as fit into one frame, always at least one.
      const started = performance.now()
      do {
        advance()
      } while (running.value && !finished && evaluations.value < maxRules && performance.now() - started < 24)
      publish()
      if (finished || evaluations.value >= maxRules) {
        if (!finished) {
          logEvent({ event: 'stop', note: `budget of ${maxRules} rules is used up` })
        }
        publishLog(true)
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
    progress,
    evaluations,
    uniqueRules,
    ruleBudget,
    height,
    calibrations,
    currentDepth,
    deepestDepth,
    rootCount,
    backtracks,
    exhausted,
    bestFitness,
    bestReason,
    rows,
    logSize,
    logEntries,
    snapshotForGenome,
    buildLogText,
    start,
    stop,
  }
}
