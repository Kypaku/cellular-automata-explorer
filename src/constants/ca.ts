// Geometry and palette constants for the cellular automaton canvas.
export const CA_WIDTH = 401 // number of cells per row
export const CA_PIXEL_SIZE = 3 // canvas pixels per cell
export const CA_COLORS = ['#f4f7f8', '#7ba9c0', '#ca9077', '#8fbf7f', '#dba6e0'] // index 0 = dead, 1-4 = states

// Canonical tag names produced by the automatic rule analysis / classification.
export const ANALYSIS_TAGS = {
  DEAD: 'Dead',
  FIXED: 'Fixed',
  PERIODIC: 'Periodic',
  STABLE: 'Stable',
  CHAOTIC: 'Chaotic',
  COMPLEX: 'Complex',
  UNDEFINED: 'Undefined',
} as const

export type AnalysisTag = (typeof ANALYSIS_TAGS)[keyof typeof ANALYSIS_TAGS]

// Extra, non-exclusive analysis tag. Unlike the class tags above (a rule keeps
// at most one), "Fields" is an independent flag attached on top of the class
// when the rule's space-time diagram tiles into many identical W×H patches.
export const FIELDS_TAG = 'Fields'

// Extra, non-exclusive analysis tag. Like "Fields" it is orthogonal to the class
// tags and coexists with any of them. "Gliders" marks rules whose space-time
// diagram contains a localized W×H patch that reappears later, shifted sideways
// within the light cone — i.e. a translating structure (glider / spaceship).
export const GLIDERS_TAG = 'Gliders'

// Extra, non-exclusive analysis tag produced by the user-driven "custom search".
// The user draws one or more W×H templates (each cell = a specific state value or
// "any"); the rule is tagged `customSearch` only when NONE of the "negative"
// templates occur anywhere in its space-time diagram (a single match excludes it).
export const CUSTOM_SEARCH_TAG = 'customSearch'

// Extra, non-exclusive analysis tag produced by the "absence of lines" test.
// After discarding the transient top of the diagram and reducing the rest to an
// M×M pattern map, the test looks for full-height straight (vertical) or diagonal
// lines made of a single pattern colour, growing M up to Mmax. A rule is tagged
// `NoLines` when NO N-same-direction lines are ever found — i.e. lines are absent.
export const LINES_TAG = 'NoLines'

// Extra, non-exclusive analysis tag produced by the "chaos" test. The diagram is
// reduced to an M×M (default 5×5) pattern map (like "convert to patterns"); the
// rule is deemed chaotic when the single most frequent ("dominant") pattern does
// NOT stick out of the distribution (covers at most `maxDominant`% of all blocks).
// The tag is applied on the INVERSE — `NoChaos` marks rules WITHOUT chaos (used to
// filter chaotic rules out). Rule 30 (dense chaos) is NOT tagged; rules with a
// dominant repeating background (e.g. rule 110) are tagged.
export const CHAOS_TAG = 'NoChaos'

// Extra, non-exclusive analysis tag produced by the "sub-analysis" test. Each rule
// is grown across ascending widths; the tag is applied to rules for which a width
// is found where the space-time diagram becomes spatially uniform (chunk sums stay
// within R% of the mean) — i.e. the rule settles into large, homogeneous structures.
export const LARGE_STRUCTURES_TAG = 'LargeStructures'

// Extra, non-exclusive analysis tag produced by the "all states present" test. Only
// the BOTTOM `bottomPercent`% of the evolved W×H generation is inspected (the
// settled part, past the initial transient); the rule is tagged when every
// possible state value (0..states-1) shows up at least once among those rows.
export const ALL_STATES_TAG = 'AllStates'

// Sentinel cell value inside a CustomPattern meaning "match any state value".
export const CUSTOM_ANY = -1

// Template cells may also hold a "variable" (x1, x2, …). Every cell carrying the
// same variable must match the SAME (but otherwise free) state value at a given
// position — so a variable expresses an equality constraint rather than a fixed
// value. Variables are encoded as cell values <= -2: x1 = -2, x2 = -3, and so on.
export const CUSTOM_VAR_MAX = 8 // how many distinct variables a template may use
export function isCustomVar(value: number): boolean {
  return value <= -2
}
// Cell value (-2, -3, …) → zero-based variable index (0, 1, …).
export function customVarIndex(value: number): number {
  return -2 - value
}
// Zero-based variable index (0, 1, …) → cell value (-2, -3, …).
export function customVarValue(index: number): number {
  return -2 - index
}
// Human label for a variable index: 0 → "x1", 1 → "x2", …
export function customVarLabel(index: number): string {
  return `x${index + 1}`
}
// A distinct, stable colour per variable index (kept clear of the state palette).
export function customVarColor(index: number): string {
  const hue = (index * 61 + 25) % 360
  return `hsl(${hue}, 72%, 42%)`
}

export interface AnalysisClass {
  tag: AnalysisTag
  description: string
}

// Ordered list of the classes with short descriptions for the UI legend.
export const ANALYSIS_CLASSES: AnalysisClass[] = [
  { tag: ANALYSIS_TAGS.DEAD, description: 'everything dies out or turns into a uniform background' },
  { tag: ANALYSIS_TAGS.FIXED, description: 'freezes into a still image (2 identical rows in a row)' },
  { tag: ANALYSIS_TAGS.PERIODIC, description: 'settles into a repeating cycle of rows' },
  { tag: ANALYSIS_TAGS.STABLE, description: 'the number of live cells stays constant, but the pattern shifts' },
  { tag: ANALYSIS_TAGS.CHAOTIC, description: 'violent, unpredictable activity with no repeats' },
  { tag: ANALYSIS_TAGS.COMPLEX, description: 'localized stable structures on an empty background' },
  { tag: ANALYSIS_TAGS.UNDEFINED, description: 'the class did not settle within the allotted H rows' },
]

// Default "how many rule codes to sample" for the random sampling mode shared by
// all batch-analysis panels (class analysis, fields, gliders, custom search). Lets
// a run test a fixed number of random codes instead of scanning the whole [from,to]
// range — essential once the range is astronomically large (e.g. local rules with
// many states, where the full range can't be scanned in any reasonable time).
export const RANDOM_SAMPLE_DEFAULTS = {
  mode: 'range' as 'range' | 'random',
  count: 300,
}

// Default analysis run parameters.
export const ANALYSIS_DEFAULTS = {
  width: 201,
  height: 160,
  init: 'random' as 'random' | 'single', // 'random' | 'single'
  maxRuleSpan: 99999999999, // hard cap on how many rules a single run will scan
  chaosFlux: 0.12, // flux threshold above which behaviour is deemed chaotic
  sparseFill: 0.14, // fill fraction below which persistent activity is deemed localized/complex
  windowFraction: 3, // fallback-statistics window = height / windowFraction (min 8 rows)
}

// Default parameters for the standalone "fields" test (run separately from the
// class analysis, since its tag can coexist with any class). The full W×H
// space-time diagram is tiled into blockWidth×blockHeight patches; each patch is
// matched shift-invariantly, and the rule is tagged FIELDS_TAG when the dominant
// patch class covers at least `minPercent`% of all patches.
export const FIELDS_DEFAULTS = {
  width: 201, // W of the evolved generation
  height: 160, // H of the evolved generation
  init: 'random' as 'random' | 'single', // 'random' | 'single'
  blockWidth: 8, // W of each patch
  blockHeight: 8, // H of each patch
  minPercent: 50, // K: % of patches the dominant field class must cover
}

// Default parameters for the standalone "gliders" test (run separately from the
// class analysis, since its tag can coexist with any class). A reference patch
// blockWidth×blockHeight is taken at the top of the diagram; the test walks down
// in time and, for every time offset dy up to maxPeriods×blockHeight, looks for
// an identical patch shifted horizontally within the light cone (|shift| <= dy).
// A rule is tagged GLIDERS_TAG when at least `minMatches` such shifted copies
// (moving by at least `minShift` cells) are found — the signature of a glider or
// spaceship translating across the lattice.
export const GLIDERS_DEFAULTS = {
  width: 201, // W of the evolved generation
  height: 200, // H of the evolved generation
  init: 'random' as 'random' | 'single', // 'random' | 'single'
  blockWidth: 6, // W of the reference patch
  blockHeight: 6, // H of the reference patch
  maxPeriods: 6, // K: search down to y = maxPeriods × blockHeight
  minShift: 1, // minimum |horizontal shift| that counts as movement
  minMatches: 2, // shifted copies required to confirm a glider/spaceship
  backgroundMin: 70, // min % the dominant (background) value must fill — gliders live
  // on a mostly-quiescent background; space-filling fields (~50/50) are rejected.
  spaceshipRepeats: 3, // K: same-column repeats (from the bottom up) that mark a
  spaceshipGap: 12, //    stationary "spaceship" (oscillator / striped field); N = max
  //                     gap in rows between consecutive repeats. In the 'moving'
  //                     conditions such in-place repeaters are excluded (a real
  //                     glider leaves its column and never repeats in place).
  spaceshipStep: 8, // xStep: sideways stride between the columns re-checked after the
  spaceshipDetections: 3, // K2: stepped columns that must ALL repeat in place before the
  //                        gate fires — one in-place column cannot tell a lone stationary
  //                        spaceship from a space-filling field, several stepped ones can.
  // Which recurrences count: 'all' (incl. zero-shift oscillators), 'moving'
  // (nonzero shift only), 'bidirectional' (require movers both left and right).
  condition: 'moving' as 'all' | 'moving' | 'bidirectional',
}

// Default parameters for the standalone "custom search" test (run separately from
// the class analysis, since its tag is orthogonal). The full W×H space-time diagram
// is evolved once; every user-defined "negative" template is slid over it, and the
// rule is tagged CUSTOM_SEARCH_TAG only when NONE of the templates occur (the first
// match excludes the rule). Templates are edited/saved in the panel itself.
export const CUSTOM_SEARCH_DEFAULTS = {
  width: 201, // W of the evolved generation
  height: 200, // H of the evolved generation
  init: 'random' as 'random' | 'single', // 'random' | 'single'
}

// localStorage key under which the custom-search template set is persisted.
export const CUSTOM_SEARCH_STORAGE_KEY = 'ca-custom-search-patterns'

// Default parameters for the standalone "absence of lines" test (run separately
// from the class analysis, since its tag is orthogonal). The top `cutTop`% of the
// W×H diagram (transient) is discarded; the rest is reduced to an M×M pattern map
// and searched for full-height straight/diagonal single-colour lines. The pattern
// size M grows from `minBlock` to `maxBlock`; the rule is tagged LINES_TAG only
// when no direction ever reaches `lineCount` lines (i.e. lines are absent).
export const LINES_DEFAULTS = {
  width: 201, // W of the evolved generation
  height: 200, // H of the evolved generation
  init: 'random' as 'random' | 'single', // 'random' | 'single'
  cutTop: 20, // % of the top (transient) rows discarded (y0 = cutTop% of H)
  minBlock: 1, // smallest pattern size M tried
  maxBlock: 4, // Mmax: largest pattern size M tried
  blockStep: 1, // increment of M between successive tries
  lineCount: 3, // N: same-direction full-height lines needed to conclude "has lines"
  ignoreBackground: true, // skip the dominant (background) pattern when counting lines
}

// Default parameters for the standalone "chaos" test (run separately from the
// class analysis, since its tag is orthogonal). The W×H diagram (minus the top
// `cutTop`% transient) is tiled into blockSize×blockSize patterns; the rule is
// tagged CHAOS_TAG when the most frequent pattern covers no more than
// `maxDominant`% of all blocks — i.e. the "dominant" pattern does not stick out of
// the distribution. Rule 30 (dense chaos, every 5×5 block ~unique) passes; rule
// 110 (dominant repeating ether background) does not — so they get different tags.
export const CHAOS_DEFAULTS = {
  width: 201, // W of the evolved generation
  height: 200, // H of the evolved generation
  init: 'random' as 'random' | 'single', // 'random' | 'single'
  cutTop: 0, // % of the top (transient) rows discarded before tiling
  blockSize: 4, // M: 5×5 patterns, per the user's request
  maxDominant: 5, // % — max share of the most frequent pattern to still count as chaos
}

// Default parameters for the standalone "all states present" test (run separately
// from the class analysis, since its tag is orthogonal). Only the bottom
// `bottomPercent`% of rows of the evolved W×H diagram are inspected; the rule is
// tagged ALL_STATES_TAG when every state value 0..states-1 appears at least once
// among the cells of those rows.
export const ALL_STATES_DEFAULTS = {
  width: 201, // W of the evolved generation
  height: 200, // H of the evolved generation
  init: 'random' as 'random' | 'single', // 'random' | 'single'
  bottomPercent: 50, // % of rows counted from the bottom that must contain every state
}

// Default parameters for the per-rule "sub-analysis": for every rule carrying a
// selected tag we search for the smallest width at which the pattern becomes
// spatially uniform, i.e. the sum of cell values over the last K rows is nearly
// equal across all horizontal chunks (chunk width = N% of the total width) so
// that no chunk deviates from the mean by more than R%.
export const SUBANALYSIS_DEFAULTS = {
  keep: 20, // K: number of last rows sampled
  chunkPercent: 10, // N: chunk width as a percentage of the total width
  tolerance: 15, // R: allowed deviation (%) of any chunk sum from the mean
  height: 200, // generations evolved before sampling the last K rows
  init: 'random' as 'random' | 'single', // 'random' | 'single'
  minWidth: 40, // smallest width tried in the search
  maxWidth: 400, // largest width tried in the search
  step: 10, // width increment between successive tries
}
