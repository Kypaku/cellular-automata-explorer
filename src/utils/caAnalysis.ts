// Barrel module for the pure, framework-agnostic cellular-automaton analysis
// helpers. The implementation lives in ./analysis/*; this file re-exports the
// public API so existing imports (`from '../utils/caAnalysis'`) keep working.
export { classifyRule } from './analysis/classify'
export { evolveRows } from './analysis/evolve'
export { subAnalyzeRule } from './analysis/subAnalysis'
export { detectFields } from './analysis/fields'
export { detectGliders } from './analysis/gliders'
export { detectCustomSearch } from './analysis/customSearch'
export { buildPatternMap } from './analysis/patternMap'
export { detectLines } from './analysis/lines'
export { detectChaos } from './analysis/chaos'
export { testRuleAgainstAllTags } from './analysis/tagTest'
export type { TagTestResult } from './analysis/tagTest'
