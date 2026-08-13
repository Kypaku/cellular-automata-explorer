<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { AGENT_DEFAULTS, AGENT_TAG } from '../../constants/ca'
import type { AgentStopReason, AnalysisRunConfig, TaggedRule } from '../../types/ca'
import type { AgentAnalysisResultRow } from '../../composables/useRuleAgentAnalysis'
import AnalysisRunControls from './AnalysisRunControls.vue'
import TagTargetSelector from './TagTargetSelector.vue'
import TagFoundActions from './TagFoundActions.vue'

const props = defineProps<{
  stateCount: number
  mode: string
  codeMax: number
  running: boolean
  done: number
  total: number
  progress: number
  currentCode: number
  currentName?: string
  found: number
  canUndoFound?: boolean
  tags: string[]
  tagCounts: Record<string, number>
  rules: TaggedRule[]
  results: AgentAnalysisResultRow[]
}>()

const emit = defineEmits(['run', 'stop', 'undo-found', 'clear-tag', 'select-rule'])

// Collapsed by default - there are many analysis blocks and expanding all of them
// makes the tags/analysis tab hard to scroll through.
const collapsed = ref(true)

const memorySize = ref(AGENT_DEFAULTS.memorySize)
const sequenceLength = ref(AGENT_DEFAULTS.sequenceLength)
const health = ref(AGENT_DEFAULTS.health)
const stagnantRepeats = ref(AGENT_DEFAULTS.stagnantRepeats)

// Detailed per-rule results are hidden (and not even collected) by default: a
// full scan can cover millions of rules and the panel only shows the summary.
const showDetails = ref(false)

// Short human label for why a run finished.
const REASON_LABEL: Record<string, string> = {
  survived: 'survived',
  died: 'died',
  dead: 'rule died out',
  stagnant: 'frozen',
}

// --- detail list: filtering, sorting, paging -------------------------------
type ReasonFilter = AgentStopReason | 'all'
type SortKey = 'name' | 'generations' | 'healthLeft' | 'unknownHits' | 'learned'

const REASON_FILTERS: ReasonFilter[] = ['all', 'survived', 'died', 'stagnant', 'dead']
const SORT_KEYS: { key: SortKey; label: string }[] = [
  { key: 'name', label: 'rule' },
  { key: 'generations', label: 'generations' },
  { key: 'healthLeft', label: 'health' },
  { key: 'unknownHits', label: 'unknown' },
  { key: 'learned', label: 'remembered' },
]
const PAGE_SIZES = [25, 50, 100, 250]

const reasonFilter = ref<ReasonFilter>('all')
const nameFilter = ref('')
const sortKey = ref<SortKey>('generations')
const sortDesc = ref(true)
const pageSize = ref(50)
const page = ref(1)

const filteredResults = computed(() => {
  const query = nameFilter.value.trim().toLowerCase()
  return props.results.filter(
    (row) =>
      (reasonFilter.value === 'all' || row.stopReason === reasonFilter.value) &&
      (!query || row.name.toLowerCase().includes(query))
  )
})

const sortedResults = computed(() => {
  const rows = filteredResults.value.slice()
  const dir = sortDesc.value ? -1 : 1
  const key = sortKey.value
  rows.sort((a, b) =>
    key === 'name' ? a.name.localeCompare(b.name, undefined, { numeric: true }) * dir : (a[key] - b[key]) * dir
  )
  return rows
})

const pageCount = computed(() => Math.max(1, Math.ceil(sortedResults.value.length / pageSize.value)))
const currentPage = computed(() => Math.min(Math.max(1, page.value), pageCount.value))
const pagedResults = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return sortedResults.value.slice(start, start + pageSize.value)
})

// Any change to the filter/sort/page size (or a fresh run) starts over at page 1.
watch([reasonFilter, nameFilter, sortKey, sortDesc, pageSize, () => props.results.length], () => {
  page.value = 1
})

function goToPage(next: number): void {
  page.value = Math.max(1, Math.min(pageCount.value, next))
}

// The tag that surviving rules are attached to. Defaults to the built-in tag but
// the user can pick any existing tag (or type a new one) to use instead.
const targetTag = ref<string>(AGENT_TAG)

// Number of rules currently carrying the selected target tag.
const targetTagCount = computed(() => props.tagCounts[targetTag.value.trim()] || 0)

const modeLabel = computed(() =>
  props.mode === 'totalistic' ? 'totalistic codes' : props.mode === 'descendants' ? 'descendants rules' : 'local rules'
)

function clampInt(value: number, min: number, max: number, fallback: number): number {
  const num = Math.floor(Number(value))
  if (Number.isNaN(num)) {
    return fallback
  }
  return Math.max(min, Math.min(max, num))
}

function onRun(config: AnalysisRunConfig): void {
  memorySize.value = clampInt(memorySize.value, 1, 4096, AGENT_DEFAULTS.memorySize)
  sequenceLength.value = clampInt(sequenceLength.value, 1, 64, AGENT_DEFAULTS.sequenceLength)
  health.value = clampInt(health.value, 1, 10000, AGENT_DEFAULTS.health)
  stagnantRepeats.value = clampInt(stagnantRepeats.value, 0, 1000, AGENT_DEFAULTS.stagnantRepeats)
  emit('run', {
    ...config,
    memorySize: memorySize.value,
    sequenceLength: sequenceLength.value,
    health: health.value,
    stagnantRepeats: stagnantRepeats.value,
    collectDetails: showDetails.value,
    targetTag: targetTag.value.trim() || AGENT_TAG,
  })
}

// Untags every rule the last completed run had tagged (does not touch earlier runs).
function onUndoFound(): void {
  emit('undo-found')
}
</script>

<template>
  <div class="ca-analysis">
    <h3 class="ca-panel-title ca-panel-title--toggle" @click="collapsed = !collapsed">
      <span class="ca-panel-toggle-icon">{{ collapsed ? '▶' : '▼' }}</span> Agent survival ({{ AGENT_TAG }})
    </h3>
    <AnalysisRunControls
      v-show="!collapsed"
      :code-max="codeMax"
      :running="running"
      :done="done"
      :total="total"
      :progress="progress"
      :current-code="currentCode"
      :current-name="currentName"
      run-label="▶ run agent test"
      :found="found"
      found-label="agent survived in"
      :tags="tags"
      :tag-counts="tagCounts"
      :rules="rules"
      :width-max="1000"
      :height-max="20000"
      :initial-width="AGENT_DEFAULTS.width"
      :initial-height="AGENT_DEFAULTS.height"
      @run="onRun"
      @stop="emit('stop')"
    >
      <template #description>
        <label class="ca-label">
          Separate run: the rule is computed row by row, up to H generations. An agent sits in the
          MIDDLE column and reads its own cell once per generation. The last {{ sequenceLength }}
          readings form a temporal sequence; the agent remembers up to {{ memorySize }} such
          sequences (the least recently seen one is forgotten first) and loses one of its
          {{ health }} health points whenever the sequence it just read is unknown. When the health
          runs out the run stops; if the agent is still alive after the last generation, the tag
          «{{ targetTag.trim() || AGENT_TAG }}» is applied.
          For speed, dead rules (an empty generation) and rules whose generation repeats
          {{ stagnantRepeats }} times in a row are treated as finished as well — such runs stop early
          and are NOT tagged.
          The tag is independent and can coexist with any class (currently {{ modeLabel }} for
          {{ stateCount }} states).
        </label>
      </template>

      <template #params>
        <div class="ca-inline">
          <TagTargetSelector v-model="targetTag" :tags="tags" :default-tag="AGENT_TAG" :running="running" />
        </div>

        <div class="ca-inline">
          <label class="ca-field">
            <span class="ca-field-cap">memory N</span>
            <input class="ca-number" type="number" min="1" max="4096" step="1" v-model.number="memorySize" :disabled="running" />
          </label>
          <label class="ca-field">
            <span class="ca-field-cap">sequence L</span>
            <input class="ca-number" type="number" min="1" max="64" step="1" v-model.number="sequenceLength" :disabled="running" />
          </label>
          <label class="ca-field">
            <span class="ca-field-cap">health</span>
            <input class="ca-number" type="number" min="1" max="10000" step="1" v-model.number="health" :disabled="running" />
          </label>
          <label class="ca-field">
            <span class="ca-field-cap">repeats to stop</span>
            <input class="ca-number" type="number" min="0" max="1000" step="1" v-model.number="stagnantRepeats" :disabled="running" />
          </label>
        </div>

        <label class="ca-check">
          <input type="checkbox" v-model="showDetails" :disabled="running" />
          <span>show detailed results (per rule)</span>
        </label>
      </template>

      <template #footer>
        <div v-if="showDetails" class="ca-agent-details">
          <div class="ca-inline">
            <label class="ca-field">
              <span class="ca-field-cap">outcome</span>
              <div class="ca-seg">
                <button
                  v-for="reason in REASON_FILTERS"
                  :key="reason"
                  type="button"
                  :class="{ on: reasonFilter === reason }"
                  @click="reasonFilter = reason"
                >
                  {{ reason === 'all' ? 'all' : REASON_LABEL[reason] }}
                </button>
              </div>
            </label>
            <label class="ca-field">
              <span class="ca-field-cap">rule name</span>
              <input class="ca-number ca-number--sm" type="search" v-model="nameFilter" placeholder="filter…" />
            </label>
          </div>

          <div class="ca-inline">
            <label class="ca-field">
              <span class="ca-field-cap">sort by</span>
              <div class="ca-seg">
                <button
                  v-for="option in SORT_KEYS"
                  :key="option.key"
                  type="button"
                  :class="{ on: sortKey === option.key }"
                  @click="sortKey = option.key"
                >
                  {{ option.label }}
                </button>
              </div>
            </label>
            <div class="ca-seg">
              <button type="button" :class="{ on: sortDesc }" @click="sortDesc = true">↓ desc</button>
              <button type="button" :class="{ on: !sortDesc }" @click="sortDesc = false">↑ asc</button>
            </div>
          </div>

          <div class="ca-meter">
            {{ sortedResults.length }} of {{ results.length }} rules shown
          </div>

          <div class="ca-sub-results">
            <div v-if="!pagedResults.length" class="ca-meter">No results yet.</div>
            <ul v-else class="ca-count-list">
              <li
                v-for="row in pagedResults"
                :key="row.id"
                class="ca-count-item ca-sub-result"
                role="button"
                tabindex="0"
                @click="emit('select-rule', row.snapshot)"
                @keydown.enter.prevent="emit('select-rule', row.snapshot)"
              >
                <span class="ca-count-chip" :class="row.survived ? 'ca-sub-ok' : 'ca-sub-miss'">
                  {{ REASON_LABEL[row.stopReason] || row.stopReason }}
                </span>
                <span class="ca-count-value">{{ row.name }}</span>
                <span class="ca-count-desc">
                  generations {{ row.generations }} · health left {{ row.healthLeft }} ·
                  unknown sequences {{ row.unknownHits }} · remembered {{ row.learned }}
                </span>
              </li>
            </ul>
          </div>

          <div class="ca-inline">
            <div class="ca-seg">
              <button type="button" :disabled="currentPage <= 1" @click="goToPage(1)">« first</button>
              <button type="button" :disabled="currentPage <= 1" @click="goToPage(currentPage - 1)">‹ prev</button>
              <button type="button" :disabled="currentPage >= pageCount" @click="goToPage(currentPage + 1)">next ›</button>
              <button type="button" :disabled="currentPage >= pageCount" @click="goToPage(pageCount)">last »</button>
            </div>
            <span class="ca-meter">page {{ currentPage }} / {{ pageCount }}</span>
            <label class="ca-field">
              <span class="ca-field-cap">per page</span>
              <div class="ca-seg">
                <button
                  v-for="size in PAGE_SIZES"
                  :key="size"
                  type="button"
                  :class="{ on: pageSize === size }"
                  @click="pageSize = size"
                >
                  {{ size }}
                </button>
              </div>
            </label>
          </div>
        </div>

        <TagFoundActions
          :target-tag="targetTag.trim() || AGENT_TAG"
          :tag-count="targetTagCount"
          :found="found"
          :running="running"
          :can-undo-found="canUndoFound"
          @undo-found="onUndoFound"
          @clear-tag="(tag) => emit('clear-tag', tag)"
        />
      </template>
    </AnalysisRunControls>
  </div>
</template>
