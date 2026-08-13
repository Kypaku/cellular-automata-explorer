// "Agent survival" test — how predictable a rule looks to an observer with a
// limited memory. The rule is evolved generation by generation up to `height`
// rows; an agent sits in the MIDDLE column and reads exactly one cell (its own)
// per generation. The last `sequenceLength` readings form a temporal sequence;
// the agent can hold `memorySize` such sequences at once (the least recently
// seen one is forgotten when the memory is full) and loses one health point
// every time the sequence it has just read is not in its memory. When the health
// runs out the run stops — the rule is too unpredictable for this agent. A rule
// passes only when the agent is still alive after the last generation.
//
// Optimization: dead rules (an empty row) and rules whose generation repeats
// `stagnantRepeats` times in a row are considered finished as well — nothing new
// can happen, so the remaining generations are not simulated. Such runs do NOT
// count as survival: they say more about the rule freezing than about the agent.
import type { AgentStopReason, AgentSurvivalOptions, AgentSurvivalResult, AnalysisInitMode, RuleParts } from '../../types/ca'
import { createEvolver } from './evolve'

/** True when every cell of the row holds the background state 0. */
function isEmptyRow(row: Uint8Array): boolean {
  for (let i = 0; i < row.length; i++) {
    if (row[i] !== 0) {
      return false
    }
  }
  return true
}

/** True when both rows hold exactly the same states. */
function rowsEqual(a: Uint8Array, b: Uint8Array): boolean {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false
    }
  }
  return true
}

export function detectAgentSurvival(parts: RuleParts, options: AgentSurvivalOptions): AgentSurvivalResult {
  const width = Math.max(2, Math.floor(options.width))
  const height = Math.max(1, Math.floor(options.height))
  const init: AnalysisInitMode = options.init === 'single' ? 'single' : 'random'
  const memorySize = Math.max(1, Math.floor(options.memorySize))
  const sequenceLength = Math.max(1, Math.floor(options.sequenceLength))
  const maxHealth = Math.max(1, Math.floor(options.health))
  const stagnantRepeats = Math.max(0, Math.floor(options.stagnantRepeats))

  const evolver = createEvolver(parts, { width, init })
  const center = width >> 1

  // Insertion-ordered map used as an LRU cache: re-inserting a known sequence
  // moves it to the end, so the first key is always the least recently seen one.
  const memory = new Map<string, number>()
  let health = maxHealth
  let unknownHits = 0
  let sequence = ''
  let repeats = 0
  let generations = 0
  let stopReason: AgentStopReason = 'survived'

  for (let y = 0; y < height; y++) {
    const row = evolver.current
    generations = y + 1

    sequence = (sequence + String.fromCharCode(row[center])).slice(-sequenceLength)
    if (sequence.length === sequenceLength) {
      if (memory.has(sequence)) {
        // Known — refresh its position so it is forgotten last.
        memory.delete(sequence)
        memory.set(sequence, y)
      } else {
        unknownHits += 1
        health -= 1
        memory.set(sequence, y)
        if (memory.size > memorySize) {
          const oldest = memory.keys().next().value
          if (oldest !== undefined) {
            memory.delete(oldest)
          }
        }
        if (health <= 0) {
          health = 0
          stopReason = 'died'
          break
        }
      }
    }

    if (y === height - 1) {
      break
    }

    const next = evolver.step()
    if (isEmptyRow(next)) {
      stopReason = 'dead'
      break
    }
    if (rowsEqual(next, row)) {
      repeats += 1
      if (stagnantRepeats > 0 && repeats >= stagnantRepeats) {
        stopReason = 'stagnant'
        break
      }
    } else {
      repeats = 0
    }
  }

  return {
    survived: stopReason === 'survived',
    stopReason,
    generations,
    healthLeft: health,
    unknownHits,
    learned: memory.size,
  }
}
