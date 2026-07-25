// "All states present" test: evolves the full W×H space-time diagram and looks
// only at the BOTTOM `bottomPercent`% of rows (the settled part, past any
// initial transient). The rule is tagged when every possible state value
// (0..states-1) appears at least once among the cells of those bottom rows —
// i.e. no state is "missing" once the automaton has settled.
import type { AllStatesOptions, AllStatesResult, AnalysisInitMode, RuleParts } from '../../types/ca'
import { evolveRows } from './evolve'

export function detectAllStates(parts: RuleParts, options: AllStatesOptions): AllStatesResult {
  const width = Math.max(2, Math.floor(options.width))
  const height = Math.max(1, Math.floor(options.height))
  const init: AnalysisInitMode = options.init === 'single' ? 'single' : 'random'
  const bottomPercent = Math.max(1, Math.min(100, Number(options.bottomPercent)))

  const { rows, states } = evolveRows(parts, { width, height, keep: height, init })

  const bottomRows = Math.max(1, Math.round(height * (bottomPercent / 100)))
  const startRow = Math.max(0, height - bottomRows)

  const present = new Set<number>()
  for (let y = startRow; y < height; y++) {
    const row = rows[y]
    for (let x = 0; x < width; x++) {
      present.add(row[x])
    }
    if (present.size >= states) {
      break
    }
  }

  const missingStates: number[] = []
  for (let s = 0; s < states; s++) {
    if (!present.has(s)) {
      missingStates.push(s)
    }
  }

  return {
    hasAllStates: missingStates.length === 0,
    presentStates: present.size,
    missingStates,
    totalStates: states,
  }
}
