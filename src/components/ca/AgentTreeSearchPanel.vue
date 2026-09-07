<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { AGENT_DEFAULTS, AGENT_TREE_DEFAULTS, AGENT_TREE_TAG } from '../../constants/ca'
import { genomeLength } from '../../utils/analysis/evolution'
import type { AgentStopReason, AnalysisInitMode, RuleMode } from '../../types/ca'
import type { AgentTreeRow, TreeLogEntry, TreeLogEvent } from '../../composables/useAgentTreeSearch'
import TagTargetSelector from './TagTargetSelector.vue'
import TagFoundActions from './TagFoundActions.vue'

const props = defineProps<{
  stateCount: number
  mode: RuleMode
  neighborhood: number
  depth: number
  running: boolean
  progress: number
  /** How many rules have been tested so far. */
  evaluations: number
  /** How many distinct rules the run has tested (no rule is tested twice). */
  uniqueRules: number
  /** Budget of rules the run may test. */
  ruleBudget: number
  /** Height the children are currently measured at (raised by the calibration). */
  currentHeight: number
  calibrations: number
  /** Depth of the branch the walk is on right now. */
  currentDepth: number
  /** Deepest branch reached so far. */
  deepestDepth: number
  /** How many starting rules the run has used. */
  rootCount: number
  /** How many times the walk had to step back out of a dead end. */
  backtracks: number
  /** True once no untested rule of this shape is left. */
  exhausted: boolean
  bestFitness: number
  bestReason: AgentStopReason | ''
  rows: AgentTreeRow[]
  /** How many events the traversal log of the current run holds. */
  logSize: number
  /** The traversal log itself, refreshed a few times a second while running. */
  log: TreeLogEntry[]
  canUndoFound?: boolean
  foundCount?: number
  tags: string[]
  tagCounts: Record<string, number>
}>()

const emit = defineEmits(['run', 'stop', 'tag-best', 'download-log', 'undo-found', 'clear-tag', 'select-entry'])

// Collapsed by default, like every other analysis block.
const collapsed = ref(true)

const width = ref(AGENT_TREE_DEFAULTS.width)
const height = ref(AGENT_TREE_DEFAULTS.height)
const maxHeight = ref(AGENT_TREE_DEFAULTS.maxHeight)
const heightGrowth = ref(AGENT_TREE_DEFAULTS.heightGrowth)
const survivorPercent = ref(AGENT_TREE_DEFAULTS.survivorPercent)
const init = ref<AnalysisInitMode>(AGENT_TREE_DEFAULTS.init)

const branching = ref(AGENT_TREE_DEFAULTS.branching)
const mutationRate = ref(AGENT_TREE_DEFAULTS.mutationRate)
const frozenPenalty = ref(AGENT_TREE_DEFAULTS.frozenPenalty)
const maxDepth = ref(AGENT_TREE_DEFAULTS.maxDepth)
const maxRules = ref(AGENT_TREE_DEFAULTS.maxRules)
const restart = ref(AGENT_TREE_DEFAULTS.restart)
const maxRoots = ref(AGENT_TREE_DEFAULTS.maxRoots)
const seedCurrent = ref(false)

const memorySize = ref(AGENT_DEFAULTS.memorySize)
const sequenceLength = ref(AGENT_DEFAULTS.sequenceLength)
const health = ref(AGENT_DEFAULTS.health)
const stagnantRepeats = ref(AGENT_DEFAULTS.stagnantRepeats)

const targetTag = ref<string>(AGENT_TREE_TAG)
const tagCount = ref(AGENT_TREE_DEFAULTS.tagCount)

const targetTagCount = computed(() => props.tagCounts[targetTag.value.trim()] || 0)

const REASON_LABEL: Record<string, string> = {
  survived: 'survived',
  died: 'died',
  dead: 'rule died out',
  stagnant: 'frozen',
}

// --- traversal log: filtering, sorting, paging ------------------------------
type EventFilter = TreeLogEvent | 'all'
type ReasonFilter = AgentStopReason | 'all'
type LogSortKey = 'seq' | 'depth' | 'generations' | 'healthLeft' | 'unknownHits' | 'learned' | 'fitness'

// Short label per event, also used by the filter buttons.
const EVENT_LABEL: Record<TreeLogEvent, string> = {
  root: 'start',
  child: 'child',
  remeasure: 're-test',
  calibrate: 'raise H',
  descend: 'down',
  'dead-end': 'dead end',
  back: 'back',
  restart: 'restart',
  stop: 'stop',
}

const EVENT_FILTERS: EventFilter[] = [
  'all',
  'child',
  'root',
  'descend',
  'back',
  'dead-end',
  'calibrate',
  'remeasure',
  'restart',
  'stop',
]
const REASON_FILTERS: ReasonFilter[] = ['all', 'survived', 'died', 'stagnant', 'dead']
const LOG_SORT_KEYS: { key: LogSortKey; label: string }[] = [
  { key: 'seq', label: 'order' },
  { key: 'depth', label: 'depth' },
  { key: 'generations', label: 'generations' },
  { key: 'healthLeft', label: 'health' },
  { key: 'unknownHits', label: 'unknown' },
  { key: 'learned', label: 'remembered' },
  { key: 'fitness', label: 'score' },
]
const PAGE_SIZES = [25, 50, 100, 250]

const eventFilter = ref<EventFilter>('all')
const reasonFilter = ref<ReasonFilter>('all')
const textFilter = ref('')
const sortKey = ref<LogSortKey>('seq')
const sortDesc = ref(false)
const pageSize = ref(50)
const page = ref(1)

const filteredLog = computed(() => {
  const query = textFilter.value.trim().toLowerCase()
  return props.log.filter(
    (entry) =>
      (eventFilter.value === 'all' || entry.event === eventFilter.value) &&
      (reasonFilter.value === 'all' || entry.reason === reasonFilter.value) &&
      (!query ||
        entry.rule.toLowerCase().includes(query) ||
        entry.note.toLowerCase().includes(query) ||
        String(entry.node) === query)
  )
})

const sortedLog = computed(() => {
  const entries = filteredLog.value.slice()
  const dir = sortDesc.value ? -1 : 1
  const key = sortKey.value
  // A stable tie-break on the log order keeps equal rows in traversal order.
  entries.sort((a, b) => (a[key] - b[key]) * dir || a.seq - b.seq)
  return entries
})

const pageCount = computed(() => Math.max(1, Math.ceil(sortedLog.value.length / pageSize.value)))
const currentPage = computed(() => Math.min(Math.max(1, page.value), pageCount.value))
const pagedLog = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return sortedLog.value.slice(start, start + pageSize.value)
})

// Any change to the filter/sort/page size starts over at page 1, and so does a
// fresh run — but NOT the log growing, so a page stays put while the walk runs.
watch([eventFilter, reasonFilter, textFilter, sortKey, sortDesc, pageSize], () => {
  page.value = 1
})
watch(
  () => props.running,
  (isRunning) => {
    if (isRunning) {
      page.value = 1
    }
  }
)

function goToPage(next: number): void {
  page.value = Math.max(1, Math.min(pageCount.value, next))
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

// Once H cannot grow any further the survivors all score the same and the walk
// keeps hitting dead ends — the user has to relax the agent or raise max H.
const calibrationLimited = computed(() => props.currentHeight >= maxHeight.value && props.bestReason === 'survived')

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
  width.value = clampInt(width.value, 16, 9999999999, AGENT_TREE_DEFAULTS.width)
  height.value = clampInt(height.value, 10, 9999999999, AGENT_TREE_DEFAULTS.height)
  maxHeight.value = clampInt(maxHeight.value, height.value, 100000, AGENT_TREE_DEFAULTS.maxHeight)
  heightGrowth.value = clampFloat(heightGrowth.value, 1, 10, AGENT_TREE_DEFAULTS.heightGrowth)
  survivorPercent.value = clampInt(survivorPercent.value, 1, 100, AGENT_TREE_DEFAULTS.survivorPercent)
  branching.value = clampInt(branching.value, 1, 500, AGENT_TREE_DEFAULTS.branching)
  mutationRate.value = clampFloat(mutationRate.value, 0, 100, AGENT_TREE_DEFAULTS.mutationRate)
  frozenPenalty.value = clampFloat(frozenPenalty.value, 0, 100, AGENT_TREE_DEFAULTS.frozenPenalty)
  maxDepth.value = clampInt(maxDepth.value, 1, 100000, AGENT_TREE_DEFAULTS.maxDepth)
  maxRules.value = clampInt(maxRules.value, 1, 1000000, AGENT_TREE_DEFAULTS.maxRules)
  maxRoots.value = clampInt(maxRoots.value, 1, 100000, AGENT_TREE_DEFAULTS.maxRoots)
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
    branching: branching.value,
    mutationRate: mutationRate.value / 100,
    frozenPenalty: frozenPenalty.value / 100,
    maxDepth: maxDepth.value,
    maxRules: maxRules.value,
    restart: restart.value,
    maxRoots: maxRoots.value,
    seedCurrent: seedCurrent.value,
  })
}

function onTagBest(): void {
  tagCount.value = clampInt(tagCount.value, 1, 500, AGENT_TREE_DEFAULTS.tagCount)
  emit('tag-best', { targetTag: targetTag.value.trim() || AGENT_TREE_TAG, count: tagCount.value })
}
</script>

<template>
  <div class="ca-analysis">
    <h3 class="ca-panel-title ca-panel-title--toggle" @click="collapsed = !collapsed">
      <span class="ca-panel-toggle-icon">{{ collapsed ? '▶' : '▼' }}</span> Tree search (agent survival)
    </h3>

    <div class="ca-control ca-control--wide" v-show="!collapsed">
      <label class="ca-label">
        Same scoring as the evolutionary hunt, a different way of walking the rule space. The search
        starts from a random (or the current) rule and spawns {{ branching }} children, each with its
        own unique mutation. They are scored by how long the agent stays alive, and the walk descends
        into the best child the agent DIED on. When every child of a node survives or freezes (a
        frozen rule keeps only {{ frozenPenalty }}% of its score) the branch is a dead end: the walk
        steps back and takes the next best sibling. Once it is back at the starting rule the tree is
        used up — the run stops, or starts over from another random rule when «start over» is on.
        No rule is ever tested twice. CALIBRATION: once at least {{ survivorPercent }}% of one child
        set survives the whole height, H is multiplied by {{ heightGrowth }} (up to {{ maxHeight }})
        and that set is re-measured.
      </label>

      <div class="ca-meter">{{ geneNote }}</div>

      <div class="ca-inline">
        <label class="ca-field">
          <span class="ca-field-cap">width W</span>
          <input class="ca-number" type="number" min="16" step="1" v-model.number="width" :disabled="running" />
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
          <span class="ca-field-cap">children N</span>
          <input class="ca-number ca-number--sm" type="number" min="1" max="500" step="1" v-model.number="branching" :disabled="running" />
        </label>
        <label class="ca-field">
          <span class="ca-field-cap">mutation, %</span>
          <input class="ca-number ca-number--sm" type="number" min="0" max="100" step="0.5" v-model.number="mutationRate" :disabled="running" />
        </label>
        <label class="ca-field">
          <span class="ca-field-cap">frozen keeps, %</span>
          <input class="ca-number ca-number--sm" type="number" min="0" max="100" step="1" v-model.number="frozenPenalty" :disabled="running" />
        </label>
        <label class="ca-field">
          <span class="ca-field-cap">max depth</span>
          <input class="ca-number ca-number--sm" type="number" min="1" max="100000" step="1" v-model.number="maxDepth" :disabled="running" />
        </label>
      </div>

      <div class="ca-inline">
        <label class="ca-field">
          <span class="ca-field-cap">rules to test</span>
          <input class="ca-number" type="number" min="1" max="1000000" step="1" v-model.number="maxRules" :disabled="running" />
        </label>
        <label class="ca-field">
          <span class="ca-field-cap">starting rules</span>
          <input class="ca-number ca-number--sm" type="number" min="1" max="100000" step="1" v-model.number="maxRoots" :disabled="running || !restart" />
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
        <input type="checkbox" v-model="restart" :disabled="running" />
        <span>start over from another random rule when a tree is used up</span>
      </label>

      <label class="ca-check">
        <input type="checkbox" v-model="seedCurrent" :disabled="running" />
        <span>start the first tree from the current rule</span>
      </label>

      <div class="ca-inline">
        <TagTargetSelector v-model="targetTag" :tags="tags" :default-tag="AGENT_TREE_TAG" :running="running" />
      </div>

      <div class="ca-inline">
        <button type="button" @click="onRun" :disabled="!canStart">▶ search the tree</button>
        <button type="button" @click="emit('stop')" :disabled="!running">■ stop</button>
        <label class="ca-field">
          <span class="ca-field-cap">tag best</span>
          <input class="ca-number ca-number--sm" type="number" min="1" max="500" step="1" v-model.number="tagCount" />
        </label>
        <button type="button" @click="onTagBest" :disabled="!rows.length">＋ tag best rules</button>
      </div>

      <div class="ca-inline">
        <button type="button" @click="emit('download-log')" :disabled="!logSize">
          ⬇ download the full log ({{ logSize }} events)
        </button>
        <span class="ca-meter">
          Every rule tested and every step of the walk (children, height raises, descents, dead ends,
          steps back), as a tab-separated text file.
        </span>
      </div>

      <div class="ca-progress" v-if="ruleBudget > 0">
        <div class="ca-progress-track">
          <div class="ca-progress-fill" :style="{ width: progress + '%' }"></div>
        </div>
        <div class="ca-meter">
          {{ evaluations }} / {{ ruleBudget }} runs ({{ progress }}%) — {{ uniqueRules }} distinct rules,
          starting rule {{ rootCount }}, depth {{ currentDepth }} (deepest {{ deepestDepth }}),
          {{ backtracks }} steps back
        </div>
        <div class="ca-meter">
          height {{ currentHeight }}, raised {{ calibrations }}× · best score {{ bestFitness }}<template
            v-if="bestReason"
          >
            ({{ REASON_LABEL[bestReason] || bestReason }})</template
          >
        </div>
        <div class="ca-meter" v-if="exhausted">
          No untested rule of this shape is left — the search stops here. Widen the rule shape (more
          states, wider neighborhood) to keep searching.
        </div>
        <div class="ca-meter" v-if="calibrationLimited">
          The best rule survives the maximum height — raise «max height» or make the agent weaker
          (less memory, longer sequence, less health) to keep telling rules apart.
        </div>
      </div>

      <div class="ca-agent-details" v-if="log.length">
        <div class="ca-meter">
          Full walk log — every rule tested and every step. Click a line with a rule to open it.
        </div>

        <div class="ca-inline">
          <span class="ca-field-cap">step</span>
          <div class="ca-seg">
            <button
              type="button"
              v-for="value in EVENT_FILTERS"
              :key="value"
              :class="{ on: eventFilter === value }"
              @click="eventFilter = value"
            >
              {{ value === 'all' ? 'all' : EVENT_LABEL[value] }}
            </button>
          </div>
        </div>

        <div class="ca-inline">
          <span class="ca-field-cap">outcome</span>
          <div class="ca-seg">
            <button
              type="button"
              v-for="value in REASON_FILTERS"
              :key="value"
              :class="{ on: reasonFilter === value }"
              @click="reasonFilter = value"
            >
              {{ value === 'all' ? 'all' : REASON_LABEL[value] || value }}
            </button>
          </div>
          <label class="ca-field">
            <span class="ca-field-cap">find</span>
            <input
              class="ca-number ca-number--sm"
              type="search"
              v-model="textFilter"
              placeholder="rule, note or rule #"
            />
          </label>
        </div>

        <div class="ca-inline">
          <span class="ca-field-cap">sort by</span>
          <div class="ca-seg">
            <button
              type="button"
              v-for="item in LOG_SORT_KEYS"
              :key="item.key"
              :class="{ on: sortKey === item.key }"
              @click="sortKey = item.key"
            >
              {{ item.label }}
            </button>
          </div>
          <div class="ca-seg">
            <button type="button" :class="{ on: sortDesc }" @click="sortDesc = true">↓ desc</button>
            <button type="button" :class="{ on: !sortDesc }" @click="sortDesc = false">↑ asc</button>
          </div>
        </div>

        <div class="ca-meter">{{ sortedLog.length }} of {{ log.length }} events shown</div>

        <div class="ca-sub-results">
          <div v-if="!pagedLog.length" class="ca-meter">Nothing matches these filters.</div>
          <ul class="ca-count-list" v-else>
            <li
              v-for="entry in pagedLog"
              :key="entry.seq"
              class="ca-count-item"
              :class="{ 'ca-sub-result': !!entry.genome }"
              :role="entry.genome ? 'button' : undefined"
              :tabindex="entry.genome ? 0 : undefined"
              @click="entry.genome && emit('select-entry', entry)"
              @keydown.enter.prevent="entry.genome && emit('select-entry', entry)"
            >
              <span
                class="ca-count-chip"
                :class="entry.reason === 'died' ? 'ca-sub-ok' : entry.reason ? 'ca-sub-miss' : ''"
              >
                {{ EVENT_LABEL[entry.event] || entry.event }}
              </span>
              <span class="ca-count-value">
                #{{ entry.seq }}<template v-if="entry.node"> · rule {{ entry.node }}</template>
                <template v-if="entry.parent"> ← {{ entry.parent }}</template>
              </span>
              <span class="ca-count-desc">
                tree {{ entry.root }} · depth {{ entry.depth }}<template v-if="entry.height">
                  · H {{ entry.height }}</template
                ><template v-if="entry.reason">
                  · {{ REASON_LABEL[entry.reason] || entry.reason }}, generations
                  {{ entry.generations }}, health left {{ entry.healthLeft }}, unknown
                  {{ entry.unknownHits }}, remembered {{ entry.learned }}, score
                  {{ Math.round(entry.fitness * 10) / 10 }}</template
                ><template v-if="entry.note"> · {{ entry.note }}</template>
              </span>
            </li>
          </ul>
        </div>

        <div class="ca-inline">
          <div class="ca-seg">
            <button type="button" :disabled="currentPage <= 1" @click="goToPage(1)">« first</button>
            <button type="button" :disabled="currentPage <= 1" @click="goToPage(currentPage - 1)">‹ prev</button>
            <button type="button" :disabled="currentPage >= pageCount" @click="goToPage(currentPage + 1)">
              next ›
            </button>
            <button type="button" :disabled="currentPage >= pageCount" @click="goToPage(pageCount)">last »</button>
          </div>
          <span class="ca-meter">page {{ currentPage }} / {{ pageCount }}</span>
          <span class="ca-field-cap">per page</span>
          <div class="ca-seg">
            <button
              type="button"
              v-for="size in PAGE_SIZES"
              :key="size"
              :class="{ on: pageSize === size }"
              @click="pageSize = size"
            >
              {{ size }}
            </button>
          </div>
        </div>
      </div>

      <TagFoundActions
        :target-tag="targetTag.trim() || AGENT_TREE_TAG"
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
