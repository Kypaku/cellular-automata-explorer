// "Chaos 2" test — a different principle than {@link detectChaos}. Instead of
// looking at how much the single most frequent ("dominant") pattern sticks out of
// the distribution, this test measures the DIVERSITY of the pattern set: the
// space-time diagram is tiled into M×M patterns (exactly like the "convert to
// patterns" view) and we simply count how many of the blocks carry a distinct
// pattern. A chaotic rule keeps inventing new blocks, so the share of distinct
// patterns approaches 100%; an ordered rule reuses a handful of patterns over and
// over, so the share stays low. The rule passes the test (is NOT chaotic) when the
// share of distinct patterns is no more than `maxUnique`%.
import type { AnalysisInitMode, Chaos2Options, Chaos2Result, RuleParts } from '../../types/ca'
import { evolveRows } from './evolve'
import { buildPatternMap } from './patternMap'

export function detectChaos2(parts: RuleParts, options: Chaos2Options): Chaos2Result {
  const width = Math.max(2, Math.floor(options.width))
  const height = Math.max(1, Math.floor(options.height))
  const init: AnalysisInitMode = options.init === 'single' ? 'single' : 'random'
  const cutFraction = Math.max(0, Math.min(90, Number(options.cutTop))) / 100
  const blockSize = Math.max(1, Math.floor(options.blockSize))
  const maxUnique = Math.max(0, Math.min(100, Number(options.maxUnique))) / 100

  const { rows, states } = evolveRows(parts, { width, height, keep: height, init })

  // Drop the transient top so the settled behaviour drives the verdict.
  const startRow = Math.min(height - 1, Math.floor(height * cutFraction))
  const kept = rows.slice(startRow)

  const map = buildPatternMap(kept, states, blockSize)
  const totalBlocks = map.cols * map.rows
  const distinctPatterns = map.patterns.length

  if (totalBlocks <= 0 || distinctPatterns === 0) {
    return {
      isChaotic: false,
      uniqueFraction: 0,
      distinctPatterns: 0,
      singletonPatterns: 0,
      totalBlocks: 0,
    }
  }

  // Patterns that occur exactly once — reported for insight, the verdict itself
  // uses the plain distinct-pattern share.
  let singletonPatterns = 0
  for (const pattern of map.patterns) {
    if (pattern.count === 1) {
      singletonPatterns += 1
    }
  }

  const uniqueFraction = distinctPatterns / totalBlocks
  // Chaotic ⇔ too many different patterns: the rule never settles on a small
  // vocabulary of blocks.
  const isChaotic = uniqueFraction > maxUnique

  return { isChaotic, uniqueFraction, distinctPatterns, singletonPatterns, totalBlocks }
}
