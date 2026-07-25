// Shared TypeScript types for the cellular-automaton explorer.

/**
 * Rule interpretation:
 *  - `totalistic`: next cell = f(neighbour sum) — 3 parents produce 1 child.
 *  - `local`: next cell = f(left, center, right) — 3 parents produce 1 child.
 *  - `descendants`: the inverse — every parent cell (by its own state) EMITS 3
 *    children into the next row (positions k-1, k, k+1) via an emission rule, and
 *    the 3 contributions colliding on each child position are merged by a
 *    user-defined collision rule. "1 parent produces 3" + collision resolution.
 */
export type RuleMode = 'totalistic' | 'local' | 'descendants'

/**
 * How the descendants mode resolves a collision when 2+ live signals land on
 * the same child cell:
 *  - `sum`: final = (a + b + c) mod states.
 *  - `random`: final = one of the colliding (non-zero) signals, picked at random.
 *  - `fixed`: final = a user-chosen constant state.
 */
export type CollisionMode = 'sum' | 'random' | 'fixed'

/** Initial-row generation strategy for the interactive canvas. */
export type InitMode = 'random' | 'single' | 'custom'

/** Initial-row generation strategy available to the batch analysis. */
export type AnalysisInitMode = 'random' | 'single'

/** How a batch analysis picks which rule codes to scan: every code in
 * [from, to] in order, or a fixed number of random codes drawn from that
 * range (useful when the range is astronomically large, e.g. local rules
 * with many states). */
export type RuleSampleMode = 'range' | 'random'

/** Where a batch analysis gets the rules it evaluates: a sequential code
 * range, a fixed-size random sample of that range, or the union of rules that
 * already carry one of a set of selected tags. */
export type AnalysisSourceMode = 'range' | 'random' | 'tags'

/** The common run configuration produced by the shared analysis controls: the
 * shared subset every batch analysis needs (evolution size, init strategy and
 * the rule source). Each panel merges its own extra parameters on top. */
export interface AnalysisRunConfig {
  width: number
  height: number
  init: AnalysisInitMode
  sourceMode: AnalysisSourceMode
  from: number
  to: number
  sampleCount: number
  tags: string[]
}

/** Size/range values derived from the number of cell states. */
export interface CaConfig {
  states: number
  maxDigit: number
  totalisticDigits: number
  totalisticMax: number
  localDigits: number
  /** Number of cells the rule looks at in the previous row: 3, 5 or 7. */
  neighborhood: number
  /** Half-width of the neighborhood: (neighborhood - 1) / 2, i.e. 1, 2 or 3. */
  radius: number
}

/** Fields identifying "the same rule", independent of init/seed/height. */
export interface RuleParts {
  stateCount: number
  mode: RuleMode
  code: number
  localRule: string
  /** Totalistic/local mode: how many cells of the previous row the rule reads (3, 5 or 7; default 3). */
  neighborhood?: number
  /** Descendants mode: `3 * (stateCount - 1)` digits, each live state → (left, center, right) child. */
  emissionRule?: string
  /** Descendants mode: how colliding signals on a child cell are merged. */
  collisionMode?: CollisionMode
  /** Descendants mode: the constant state used when `collisionMode === 'fixed'`. */
  collisionFixed?: number
}

/** Everything needed to reproduce a rule together with its display context. */
export interface RuleSnapshot {
  stateCount: number
  mode: RuleMode
  code: number
  localRule: string
  /** Totalistic/local mode: how many cells of the previous row the rule reads (3, 5 or 7; default 3). */
  neighborhood?: number
  /** Descendants mode: each live state → (left, center, right) child emission table. */
  emissionRule?: string
  /** Descendants mode: how colliding signals on a child cell are merged. */
  collisionMode?: CollisionMode
  /** Descendants mode: the constant state used when `collisionMode === 'fixed'`. */
  collisionFixed?: number
  init: InitMode
  seed: string
  height: number
  width?: number
  noise?: number
}

/** One coloured legend entry rendered under the canvas. */
export interface LegendItem {
  color: string
  caption: string
}

/** A single rule fed into a batch analysis when the source is "tags": the
 * classifier `parts` plus the rule's own snapshot (reused when (re)tagging)
 * and an optional display name. */
export interface AnalysisRuleInput {
  parts: RuleParts
  snapshot: RuleSnapshot
  name?: string
}

/** Statistics produced while classifying a single rule. */
export interface ClassifyStats {
  reason: string
  generation: number
  period: number
  density: number
  flux: number
  fill?: number
}

/** Result of classifying a single rule. */
export interface ClassifyResult {
  tag: string
  stats: ClassifyStats
}

/** Options for {@link classifyRule}. */
export interface ClassifyOptions {
  width: number
  height: number
  init: AnalysisInitMode
  windowFraction?: number
  chaosFlux?: number
  sparseFill?: number
}

/** Options for {@link evolveRows}. */
export interface EvolveOptions {
  width: number
  height: number
  keep?: number
  init: AnalysisInitMode
}

/** Result of {@link evolveRows}. */
export interface EvolveResult {
  rows: Uint8Array[]
  states: number
}

/** Options for {@link subAnalyzeRule}. */
export interface SubAnalyzeOptions {
  keep: number
  chunkPercent: number
  tolerance: number
  height: number
  init: AnalysisInitMode
  minWidth: number
  maxWidth: number
  step: number
}

/** Result of {@link subAnalyzeRule}. */
export interface SubAnalyzeResult {
  foundWidth: number | null
  foundDev: number | null
  bestWidth: number | null
  bestDev: number | null
  tested: number
}

/** Options for {@link detectFields}. */
export interface FieldsOptions {
  width: number
  height: number
  blockWidth: number
  blockHeight: number
  minPercent: number
  init: AnalysisInitMode
}

/** Result of {@link detectFields}. */
export interface FieldsResult {
  hasFields: boolean
  dominantCount: number
  dominantFraction: number
  distinctBlocks: number
  totalBlocks: number
}

/** Movement filter for {@link detectGliders}. */
export type GliderCondition = 'all' | 'moving' | 'bidirectional'

/** Options for {@link detectGliders}. */
export interface GlidersOptions {
  width: number
  height: number
  blockWidth: number
  blockHeight: number
  maxPeriods: number
  minShift: number
  minMatches: number
  backgroundMin: number
  spaceshipRepeats: number
  spaceshipGap: number
  spaceshipStep: number
  spaceshipDetections: number
  condition: GliderCondition
  init: AnalysisInitMode
}

/** Result of {@link detectGliders}. */
export interface GlidersResult {
  hasGliders: boolean
  matches: number
  bestShift: number
  bestDy: number
  bestX0: number
}

/**
 * One user-defined template for the custom search. Every cell holds either a
 * specific state value (0..states-1), {@link CUSTOM_ANY} (-1) meaning "any
 * value" (wildcard), or a variable (values <= -2: x1 = -2, x2 = -3, …). All
 * cells sharing the same variable must match one and the same state value at a
 * given match position. Cells are row-major with length `width * height`.
 */
export interface CustomPattern {
  id: string
  width: number
  height: number
  /** Row-major cells, length width*height; -1 = wildcard "any", <= -2 = variable. */
  cells: number[]
  /** How many variables (x1..xN) the template exposes in its editor. */
  varCount?: number
}

/** Options for {@link detectCustomSearch}. */
export interface CustomSearchOptions {
  width: number
  height: number
  init: AnalysisInitMode
  /** Templates that EXCLUDE a rule when any of them occurs in the diagram. */
  negativePatterns: CustomPattern[]
}

/** Result of {@link detectCustomSearch}. */
export interface CustomSearchResult {
  /** True when the rule passes (no negative pattern occurs) → gets the tag. */
  passes: boolean
  /** Index of the negative pattern that matched, or -1 when none did. */
  matchedIndex: number
  /** Top-left column where the negative pattern matched, or -1. */
  matchedX: number
  /** Top-left row where the negative pattern matched, or -1. */
  matchedY: number
}

/** Direction bucket a detected line belongs to (see {@link detectLines}). */
export type LineDirection = 'vertical' | 'diagonal'

/** Options for {@link detectLines}. */
export interface LinesOptions {
  width: number
  height: number
  init: AnalysisInitMode
  /** Percentage of the top (transient) rows discarded before analysis. */
  cutTop: number
  /** Smallest pattern size M tried. */
  minBlock: number
  /** Mmax: largest pattern size M tried. */
  maxBlock: number
  /** Increment of M between successive tries. */
  blockStep: number
  /** N: same-direction full-height lines required to conclude "has lines". */
  lineCount: number
  /** Skip the most frequent (background) pattern when counting lines. */
  ignoreBackground: boolean
}

/** Result of {@link detectLines}. */
export interface LinesResult {
  /** True when N same-direction full-height lines were found at some M ≤ Mmax. */
  hasLines: boolean
  /** Direction of the strongest bucket found, or null when none. */
  direction: LineDirection | null
  /** Best same-direction line count observed across the tried M values. */
  lineCount: number
  /** Pattern size M at which the search stopped. */
  blockSize: number
}

/** Options for {@link detectChaos}. */
export interface ChaosOptions {
  width: number
  height: number
  init: AnalysisInitMode
  /** Percentage of the top (transient) rows discarded before analysis. */
  cutTop: number
  /** Pattern size M: the diagram is tiled into M×M blocks (user's default 5). */
  blockSize: number
  /**
   * Max share (%) of all blocks the single most frequent ("dominant") pattern may
   * occupy while the rule is still deemed chaotic. When the top pattern's share
   * exceeds this, it "sticks out" of the distribution and the rule is not chaotic.
   */
  maxDominant: number
}

/** Result of {@link detectChaos}. */
export interface ChaosResult {
  /** True when the top pattern does not stick out (its share ≤ maxDominant). */
  isChaotic: boolean
  /** Share [0..1] of all blocks covered by the most frequent pattern. */
  dominantFraction: number
  /** Raw count of the most frequent pattern. */
  dominantCount: number
  /** Mean block count per distinct pattern (totalBlocks / distinctPatterns). */
  meanCount: number
  /** Number of distinct M×M patterns found. */
  distinctPatterns: number
  /** Total number of M×M blocks the (kept) diagram was tiled into. */
  totalBlocks: number
}

/** Colour scheme used to paint distinct patterns in {@link buildPatternMap}. */
export type PatternPalette = 'color' | 'grayscale'

/** One distinct M×M patch class found by {@link buildPatternMap}. */
export interface PatternEntry {
  /** Raw cell values of the patch, row-major, length blockSize². */
  cells: Uint8Array
  /** Unique colour assigned to this pattern for the pixel map. */
  color: string
  /** How many blocks in the field carry this exact pattern. */
  count: number
  /** Stable index (0-based), assigned in descending-frequency order. */
  index: number
}

/** Result of {@link buildPatternMap}: the field reduced to one pixel per block. */
export interface PatternMap {
  /** Block edge length M. */
  blockSize: number
  /** Number of blocks horizontally. */
  cols: number
  /** Number of blocks vertically. */
  rows: number
  /** Number of cell states in the source field. */
  states: number
  /** cols×rows pattern indices, row-major (index into {@link patterns}). */
  cellIndex: Int32Array
  /** Distinct patterns, sorted by descending frequency. */
  patterns: PatternEntry[]
}

/** A saved, tag-able rule record kept in the tag library. */
export interface TaggedRule {
  id: string
  name: string
  signature: string | null
  tags: string[]
  snapshot: RuleSnapshot
  createdAt: number
}
