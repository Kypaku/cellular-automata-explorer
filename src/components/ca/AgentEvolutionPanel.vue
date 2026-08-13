<script setup lang="ts">
import { ref, computed } from 'vue'
import { AGENT_DEFAULTS, AGENT_EVOLUTION_DEFAULTS, AGENT_EVOLUTION_TAG } from '../../constants/ca'
import { genomeLength } from '../../utils/analysis/evolution'
import type { AgentStopReason, AnalysisInitMode, RuleMode } from '../../types/ca'
import type { AgentEvolutionRow } from '../../composables/useAgentEvolution'
import TagTargetSelector from './TagTargetSelector.vue'
import TagFoundActions from './TagFoundActions.vue'

const props = defineProps<{
  stateCount: number
  mode: RuleMode
  neighborhood: number
  depth: number
  running: boolean
  generation: number
  totalGenerations: number
  progress: number
  /** Height the population is currently measured at (raised by the calibration). */
  currentHeight: number
  calibrations: number
  evaluations: number
  /** How many distinct rules the run has tested so far (no rule is tested twice). */
  uniqueRules: number
  /** True once no rule of this shape is left to try. */
  exhausted: boolean
  bestFitness: number
  bestReason: AgentStopReason | ''
  averageFitness: number
  survivorCount: number
  frozenCount: number
  populationCount: number
  rows: AgentEvolutionRow[]
  canUndoFound?: boolean
  foundCount?: number
  tags: string[]
  tagCounts: Record<string, number>
}>()

const emit = defineEmits(['run', 'stop', 'tag-best', 'undo-found', 'clear-tag', 'select-rule'])

// Collapsed by default, like every other analysis block.
const collapsed = ref(true)

const width = ref(AGENT_EVOLUTION_DEFAULTS.width)
const height = ref(AGENT_EVOLUTION_DEFAULTS.height)
const maxHeight = ref(AGENT_EVOLUTION_DEFAULTS.maxHeight)
const heightGrowth = ref(AGENT_EVOLUTION_DEFAULTS.heightGrowth)
const survivorPercent = ref(AGENT_EVOLUTION_DEFAULTS.survivorPercent)
const init = ref<AnalysisInitMode>(AGENT_EVOLUTION_DEFAULTS.init)

const populationSize = ref(AGENT_EVOLUTION_DEFAULTS.populationSize)
const generations = ref(AGENT_EVOLUTION_DEFAULTS.generations)
const eliteCount = ref(AGENT_EVOLUTION_DEFAULTS.eliteCount)
const mutationRate = ref(AGENT_EVOLUTION_DEFAULTS.mutationRate)
const crossoverRate = ref(AGENT_EVOLUTION_DEFAULTS.crossoverRate)
const tournamentSize = ref(AGENT_EVOLUTION_DEFAULTS.tournamentSize)
const frozenPenalty = ref(AGENT_EVOLUTION_DEFAULTS.frozenPenalty)
const seedCurrent = ref(false)

const memorySize = ref(AGENT_DEFAULTS.memorySize)
const sequenceLength = ref(AGENT_DEFAULTS.sequenceLength)
const health = ref(AGENT_DEFAULTS.health)
const stagnantRepeats = ref(AGENT_DEFAULTS.stagnantRepeats)

const targetTag = ref<string>(AGENT_EVOLUTION_TAG)
const tagCount = ref(AGENT_EVOLUTION_DEFAULTS.tagCount)

const targetTagCount = computed(() => props.tagCounts[targetTag.value.trim()] || 0)

const REASON_LABEL: Record<string, string> = {
  survived: 'survived',
  died: 'died',
  dead: 'rule died out',
  stagnant: 'frozen',
}

// One gene per rule condition, so the genome length is the size of the rule table.
const geneCount = computed(() =>
  genomeLength({
    stateCount: props.stateCount,
    mode: props.mode,
    neighborhood: props.neighborhood,
    depth: props.depth,
  })
)

const geneNote = computed(() => {
  const kind =
    props.mode === 'totalistic'
      ? 'neighbour sums'
      : props.mode === 'descendants'
        ? 'emitted children'
        : 'neighborhood patterns'
  return `genome: ${geneCount.value} genes (${kind}), ${props.stateCount} states per gene`
})

const canStart = computed(() => !props.running && geneCount.value > 1)

// Once H cannot grow any further the survivors are all scored the same and the
// search stops improving — the user has to relax the agent or raise max H.
const calibrationLimited = computed(() => props.currentHeight >= maxHeight.value && props.survivorCount > 0)

function clampInt(value: number, min: number, max: number, fallback: number): number {
  const num = Math.floor(Number(value))
  if (Number.isNaN(num)) {
    return fallback
  }
  return Math.max(min, Math.min(max, num))
}

function clampFloat(value: number, min: number, max: number, fallback: number): number {
  const num = Number(value)
  if (Number.isNaN(num)) {
    return fallback
  }
  return Math.max(min, Math.min(max, num))
}

function onRun(): void {
  width.value = clampInt(width.value, 16, 1000, AGENT_EVOLUTION_DEFAULTS.width)
  height.value = clampInt(height.value, 10, 20000, AGENT_EVOLUTION_DEFAULTS.height)
  maxHeight.value = clampInt(maxHeight.value, height.value, 100000, AGENT_EVOLUTION_DEFAULTS.maxHeight)
  heightGrowth.value = clampFloat(heightGrowth.value, 1, 10, AGENT_EVOLUTION_DEFAULTS.heightGrowth)
  survivorPercent.value = clampInt(survivorPercent.value, 1, 100, AGENT_EVOLUTION_DEFAULTS.survivorPercent)
  populationSize.value = clampInt(populationSize.value, 4, 2000, AGENT_EVOLUTION_DEFAULTS.populationSize)
  generations.value = clampInt(generations.value, 1, 100000, AGENT_EVOLUTION_DEFAULTS.generations)
  eliteCount.value = clampInt(eliteCount.value, 0, populationSize.value - 1, AGENT_EVOLUTION_DEFAULTS.eliteCount)
  mutationRate.value = clampFloat(mutationRate.value, 0, 100, AGENT_EVOLUTION_DEFAULTS.mutationRate)
  crossoverRate.value = clampFloat(crossoverRate.value, 0, 100, AGENT_EVOLUTION_DEFAULTS.crossoverRate)
  tournamentSize.value = clampInt(tournamentSize.value, 1, populationSize.value, AGENT_EVOLUTION_DEFAULTS.tournamentSize)
  frozenPenalty.value = clampFloat(frozenPenalty.value, 0, 100, AGENT_EVOLUTION_DEFAULTS.frozenPenalty)
  memorySize.value = clampInt(memorySize.value, 1, 4096, AGENT_DEFAULTS.memorySize)
  sequenceLength.value = clampInt(sequenceLength.value, 1, 64, AGENT_DEFAULTS.sequenceLength)
  health.value = clampInt(health.value, 1, 10000, AGENT_DEFAULTS.health)
  stagnantRepeats.value = clampInt(stagnantRepeats.value, 0, 1000, AGENT_DEFAULTS.stagnantRepeats)

  emit('run', {
    width: width.value,
    height: height.value,
    maxHeight: maxHeight.value,
    heightGrowth: heightGrowth.value,
    survivorPercent: survivorPercent.value,
    init: init.value,
    memorySize: memorySize.value,
    sequenceLength: sequenceLength.value,
    health: health.value,
    stagnantRepeats: stagnantRepeats.value,
    populationSize: populationSize.value,
    generations: generations.value,
    eliteCount: eliteCount.value,
    mutationRate: mutationRate.value / 100,
    crossoverRate: crossoverRate.value / 100,
    tournamentSize: tournamentSize.value,
    frozenPenalty: frozenPenalty.value / 100,
    seedCurrent: seedCurrent.value,
  })
}

function onTagBest(): void {
  tagCount.value = clampInt(tagCount.value, 1, 500, AGENT_EVOLUTION_DEFAULTS.tagCount)
  emit('tag-best', { targetTag: targetTag.value.trim() || AGENT_EVOLUTION_TAG, count: tagCount.value })
}
</script>

<template>
  <div class="ca-analysis">
    <h3 class="ca-panel-title ca-panel-title--toggle" @click="collapsed = !collapsed">
      <span class="ca-panel-toggle-icon">{{ collapsed ? '▶' : '▼' }}</span> Evolutionary search (agent survival)
    </h3>

    <div class="ca-control ca-control--wide" v-show="!collapsed">
      <label class="ca-label">
        Instead of scanning a range of rules, this search EVOLVES them: a rule is a genome and every
        rule condition is a gene. A candidate is scored by how long the agent stays alive, so the
        search selects for rules the agent does NOT survive, that do not freeze (an empty or endlessly
        repeating generation keeps only {{ frozenPenalty }}% of its score) and where the agent dies as
        LATE as possible. Every generation keeps the {{ eliteCount }} best genomes, breeds the rest by
        tournament + crossover and mutates {{ mutationRate }}% of their genes.
        CALIBRATION: once at least {{ survivorPercent }}% of a generation survives the whole height,
        the survivors can no longer be told apart, so H is multiplied by {{ heightGrowth }} (up to
        {{ maxHeight }}) and the population is re-measured.
      </label>

      <div class="ca-meter">{{ geneNote }}</div>

      <div class="ca-inline">
        <label class="ca-field">
          <span class="ca-field-cap">width W</span>
          <input class="ca-number" type="number" min="16" max="1000" step="1" v-model.number="width" :disabled="running" />
        </label>
        <label class="ca-field">
          <span class="ca-field-cap">start height H</span>
          <input class="ca-number" type="number" min="10" max="20000" step="1" v-model.number="height" :disabled="running" />
        </label>
        <span class="ca-seg">
          <button type="button" :class="{ on: init === 'random' }" :disabled="running" @click="init = 'random'">random field</button>
          <button type="button" :class="{ on: init === 'single' }" :disabled="running" @click="init = 'single'">single cell</button>
        </span>
      </div>

      <div class="ca-inline">
        <label class="ca-field">
          <span class="ca-field-cap">max height</span>
          <input class="ca-number" type="number" min="10" max="100000" step="1" v-model.number="maxHeight" :disabled="running" />
        </label>
        <label class="ca-field">
          <span class="ca-field-cap">height ×</span>
          <input class="ca-number ca-number--sm" type="number" min="1" max="10" step="0.1" v-model.number="heightGrowth" :disabled="running" />
        </label>
        <label class="ca-field">
          <span class="ca-field-cap">survivors to raise H, %</span>
          <input class="ca-number ca-number--sm" type="number" min="1" max="100" step="1" v-model.number="survivorPercent" :disabled="running" />
        </label>
      </div>

      <div class="ca-inline">
        <label class="ca-field">
          <span class="ca-field-cap">population</span>
          <input class="ca-number" type="number" min="4" max="2000" step="1" v-model.number="populationSize" :disabled="running" />
        </label>
        <label class="ca-field">
          <span class="ca-field-cap">generations</span>
          <input class="ca-number" type="number" min="1" max="100000" step="1" v-model.number="generations" :disabled="running" />
        </label>
        <label class="ca-field">
          <span class="ca-field-cap">elite</span>
          <input class="ca-number ca-number--sm" type="number" min="0" max="500" step="1" v-model.number="eliteCount" :disabled="running" />
        </label>
        <label class="ca-field">
          <span class="ca-field-cap">tournament</span>
          <input class="ca-number ca-number--sm" type="number" min="1" max="100" step="1" v-model.number="tournamentSize" :disabled="running" />
        </label>
      </div>

      <div class="ca-inline">
        <label class="ca-field">
          <span class="ca-field-cap">mutation, %</span>
          <input class="ca-number ca-number--sm" type="number" min="0" max="100" step="0.5" v-model.number="mutationRate" :disabled="running" />
        </label>
        <label class="ca-field">
          <span class="ca-field-cap">crossover, %</span>
          <input class="ca-number ca-number--sm" type="number" min="0" max="100" step="1" v-model.number="crossoverRate" :disabled="running" />
        </label>
        <label class="ca-field">
          <span class="ca-field-cap">frozen keeps, %</span>
          <input class="ca-number ca-number--sm" type="number" min="0" max="100" step="1" v-model.number="frozenPenalty" :disabled="running" />
        </label>
      </div>

      <div class="ca-inline">
        <label class="ca-field">
          <span class="ca-field-cap">memory N</span>
          <input class="ca-number ca-number--sm" type="number" min="1" max="4096" step="1" v-model.number="memorySize" :disabled="running" />
        </label>
        <label class="ca-field">
          <span class="ca-field-cap">sequence L</span>
          <input class="ca-number ca-number--sm" type="number" min="1" max="64" step="1" v-model.number="sequenceLength" :disabled="running" />
        </label>
        <label class="ca-field">
          <span class="ca-field-cap">health</span>
          <input class="ca-number ca-number--sm" type="number" min="1" max="10000" step="1" v-model.number="health" :disabled="running" />
        </label>
        <label class="ca-field">
          <span class="ca-field-cap">repeats to stop</span>
          <input class="ca-number ca-number--sm" type="number" min="0" max="1000" step="1" v-model.number="stagnantRepeats" :disabled="running" />
        </label>
      </div>

      <label class="ca-check">
        <input type="checkbox" v-model="seedCurrent" :disabled="running" />
        <span>seed the first generation with the current rule</span>
      </label>

      <div class="ca-inline">
        <TagTargetSelector v-model="targetTag" :tags="tags" :default-tag="AGENT_EVOLUTION_TAG" :running="running" />
      </div>

      <div class="ca-inline">
        <button type="button" @click="onRun" :disabled="!canStart">▶ evolve rules</button>
        <button type="button" @click="emit('stop')" :disabled="!running">■ stop</button>
        <label class="ca-field">
          <span class="ca-field-cap">tag best</span>
          <input class="ca-number ca-number--sm" type="number" min="1" max="500" step="1" v-model.number="tagCount" />
        </label>
        <button type="button" @click="onTagBest" :disabled="!rows.length">＋ tag best rules</button>
      </div>

      <div class="ca-progress" v-if="totalGenerations > 0">
        <div class="ca-progress-track">
          <div class="ca-progress-fill" :style="{ width: progress + '%' }"></div>
        </div>
        <div class="ca-meter">
          generation {{ generation }} / {{ totalGenerations }} ({{ progress }}%) — height {{ currentHeight }},
          raised {{ calibrations }}×, {{ uniqueRules }} distinct rules, {{ evaluations }} runs
        </div>
        <div class="ca-meter">
          best score {{ bestFitness }}<template v-if="bestReason"> ({{ REASON_LABEL[bestReason] || bestReason }})</template> ·
          average {{ averageFitness }} · survived {{ survivorCount }} / {{ populationCount }} ·
          frozen {{ frozenCount }}
        </div>
        <div class="ca-meter" v-if="exhausted">
          No untested rule of this shape is left — the search stops here. Widen the rule shape (more
          states, wider neighborhood) to keep evolving.
        </div>
        <div class="ca-meter" v-if="calibrationLimited">
          {{ survivorCount }} rule(s) survive the maximum height — raise «max height» or make the agent
          weaker (less memory, longer sequence, less health) to keep telling them apart.
        </div>
      </div>

      <div class="ca-agent-details" v-if="rows.length">
        <div class="ca-meter">Best rules of the last generation — click one to open it.</div>
        <div class="ca-sub-results">
          <ul class="ca-count-list">
            <li
              v-for="row in rows"
              :key="row.id"
              class="ca-count-item ca-sub-result"
              role="button"
              tabindex="0"
              @click="emit('select-rule', row.snapshot)"
              @keydown.enter.prevent="emit('select-rule', row.snapshot)"
            >
              <span class="ca-count-chip" :class="row.stopReason === 'died' ? 'ca-sub-ok' : 'ca-sub-miss'">
                {{ REASON_LABEL[row.stopReason] || row.stopReason }}
              </span>
              <span class="ca-count-value">{{ row.name }}</span>
              <span class="ca-count-desc">
                score {{ row.fitness }} · generations {{ row.generations }} ·
                health left {{ row.healthLeft }} · unknown sequences {{ row.unknownHits }}
              </span>
            </li>
          </ul>
        </div>
      </div>

      <TagFoundActions
        :target-tag="targetTag.trim() || AGENT_EVOLUTION_TAG"
        :tag-count="targetTagCount"
        :found="foundCount || 0"
        :running="running"
        :can-undo-found="canUndoFound"
        @undo-found="emit('undo-found')"
        @clear-tag="(tag) => emit('clear-tag', tag)"
      />
    </div>
  </div>
</template>
