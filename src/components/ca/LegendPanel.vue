<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { LegendItem } from '../../types/ca'
import { stateChar } from '../../utils/caMath'
import RuleJsonPanel from './RuleJsonPanel.vue'

const props = defineProps<{
  colors: string[]
  stateCount: number
  keyText: string
  legendItems: LegendItem[]
  legendModeLocal: boolean
  mode: string
  neighborhood: number
  depth: number
  ruleInputValue: string
  /** Templates whose output is drawn at random: neighborhood index → the state digits to pick from. */
  stochasticOptions: Record<string, string> | null
}>()

const emit = defineEmits<{
  'cell-click': [index: number, direction: 1 | -1]
  'apply-rule-json': [payload: { rule: string; options: Record<string, string> }]
}>()

const COLLAPSE_THRESHOLD = 30

const collapsed = ref(true)
const searchExpanded = ref(false)
const searchQuery = ref('')

// Reset to collapsed whenever the rule (and thus the item count) changes.
watch(
  () => props.legendItems.length,
  () => {
    collapsed.value = true
    searchExpanded.value = false
    searchQuery.value = ''
  },
)

// Searching only makes sense (and is only offered) once there are enough
// conditions that scanning them by eye is impractical.
const canSearch = computed(() => props.legendItems.length > COLLAPSE_THRESHOLD)
const showSearchBox = computed(() => canSearch.value && searchExpanded.value)
const isSearching = computed(() => showSearchBox.value && searchQuery.value.trim().length > 0)

// Keep the original index (needed by cell-click) alongside each item so
// filtering by search text doesn't break which rule digit gets cycled.
const filteredIndexedItems = computed(() => {
  const indexed = props.legendItems.map((item, index) => ({ item, index }))
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) {
    return indexed
  }
  return indexed.filter(({ item }) => item.caption.toLowerCase().includes(q))
})

// While searching, show every match instead of collapsing - the user has
// already narrowed the list down on purpose.
const showToggle = computed(() => !isSearching.value && filteredIndexedItems.value.length > COLLAPSE_THRESHOLD)
const visibleIndexedItems = computed(() =>
  collapsed.value && showToggle.value ? filteredIndexedItems.value.slice(0, COLLAPSE_THRESHOLD) : filteredIndexedItems.value,
)

function onCellClick(index: number, event: MouseEvent): void {
  event.preventDefault()
  emit('cell-click', index, 1)
}

function onCellRightClick(index: number, event: MouseEvent): void {
  event.preventDefault()
  emit('cell-click', index, -1)
}
</script>

<template>
  <div class="ca-key">
    <span v-for="s in stateCount" :key="s"><span class="ca-dot" :style="{ background: colors[s - 1] }"></span>{{ stateChar(s - 1) }}</span>
    <span class="ca-key-text">{{ keyText }}</span>
  </div>

  <div class="ca-legend-wrap">
    <div v-if="canSearch" class="ca-legend-search">
      <button type="button" class="ca-link-btn" @click="searchExpanded = !searchExpanded">
        {{ searchExpanded ? 'Hide search' : 'Search conditions…' }}
      </button>
      <template v-if="showSearchBox">
        <input
          class="ca-input ca-legend-search-input"
          type="search"
          placeholder="Search rule conditions…"
          v-model="searchQuery"
        />
        <span v-if="isSearching" class="ca-meter">{{ filteredIndexedItems.length }} / {{ legendItems.length }} matching</span>
      </template>
    </div>

    <div class="ca-legend" :class="{ 'ca-legend--local': legendModeLocal }">
      <div class="ca-cell" v-for="{ item, index } in visibleIndexedItems" :key="index">
        <div
          class="ca-sq ca-sq--clickable"
          :style="{ background: item.color }"
          title="click to step to the next state, right-click for the previous one"
          @click="onCellClick(index, $event)"
          @contextmenu="onCellRightClick(index, $event)"
        ></div>
        <div class="ca-cap">{{ item.caption }}</div>
      </div>
      <div v-if="isSearching && filteredIndexedItems.length === 0" class="ca-meter">No matching conditions.</div>
    </div>
    <RuleJsonPanel
      v-if="mode !== 'descendants'"
      :state-count="stateCount"
      :neighborhood="neighborhood"
      :depth="depth"
      :local-rule="ruleInputValue"
      :stochastic-options="stochasticOptions"
      @apply="emit('apply-rule-json', $event)"
    />
    <button v-if="showToggle" type="button" class="ca-legend-toggle" @click="collapsed = !collapsed">
      {{ collapsed ? `Show all (${filteredIndexedItems.length})` : 'Collapse' }}
    </button>
  </div>
</template>

