<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { LegendItem } from '../../types/ca'
import { padRight, stateChar, stateDigitFromCharCode } from '../../utils/caMath'
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
const probabilityInput = ref('[1, 0]')
const probabilityError = ref('')
const customProbabilities = ref<string[]>([])
const probabilityExpanded = ref(false)

const probabilityCells = computed(() => {
  const cells = [...customProbabilities.value]
  for (const picks of Object.values(props.stochasticOptions || {})) {
    if (picks.length > 1 && !cells.includes(picks)) {
      cells.push(picks)
    }
  }
  return cells
})

// Reset to collapsed whenever the rule (and thus the item count) changes.
watch(
  () => props.legendItems.length,
  () => {
    collapsed.value = true
    searchExpanded.value = false
    searchQuery.value = ''
  },
)

watch(
  () => [props.stateCount, props.mode],
  () => {
    probabilityError.value = ''
    probabilityExpanded.value = false
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
  if (props.mode === 'local' && probabilityCells.value.length > 0) {
    cycleLocalCondition(index, 1)
    return
  }
  emit('cell-click', index, 1)
}

function onCellRightClick(index: number, event: MouseEvent): void {
  event.preventDefault()
  if (props.mode === 'local' && probabilityCells.value.length > 0) {
    cycleLocalCondition(index, -1)
    return
  }
  emit('cell-click', index, -1)
}

function cycleLocalCondition(index: number, direction: 1 | -1): void {
  const rule = padRight(props.ruleInputValue, index + 1)
  const options = { ...(props.stochasticOptions || {}) }
  const deterministicStates = Array.from({ length: props.stateCount }, (_, state) => stateChar(state))
  const chain = [...deterministicStates, ...probabilityCells.value]
  const current = options[String(index)] || rule[index] || deterministicStates[0]
  const currentIndex = Math.max(0, chain.indexOf(current))
  const next = chain[(currentIndex + direction + chain.length) % chain.length]
  const isProbability = next.length > 1

  if (isProbability) {
    options[String(index)] = next
  } else {
    delete options[String(index)]
  }
  const nextRule = rule.slice(0, index) + next[0] + rule.slice(index + 1)
  emit('apply-rule-json', { rule: nextRule, options })
}

function createProbabilityCell(): void {
  const raw = probabilityInput.value.trim()
  if (!raw.startsWith('[') || !raw.endsWith(']')) {
    probabilityError.value = 'Enter a JSON array such as [1, 0, 1].'
    return
  }

  const choices = raw
    .slice(1, -1)
    .split(',')
    .map((choice) => choice.trim())
    .filter(Boolean)
  let picks = ''
  for (const choice of choices) {
    const state = stateDigitFromCharCode(choice.charCodeAt(0))
    if (choice.length !== 1 || state < 0 || state >= props.stateCount) {
      probabilityError.value = `Each item must be one state from 0 to ${stateChar(props.stateCount - 1)}.`
      return
    }
    picks += stateChar(state)
  }
  if (picks.length < 2) {
    probabilityError.value = 'A probability cell needs at least two items.'
    return
  }

  if (!customProbabilities.value.includes(picks)) {
    customProbabilities.value.push(picks)
  }
  probabilityInput.value = `[${picks.split('').join(', ')}]`
  probabilityError.value = ''
}

function probabilityStyle(picks: string): Record<string, string> {
  const segmentSize = 100 / picks.length
  const segments = picks.split('').map((choice, index) => {
    const state = stateDigitFromCharCode(choice.charCodeAt(0))
    const color = props.colors[state] || props.colors[0]
    return `${color} ${index * segmentSize}% ${(index + 1) * segmentSize}%`
  })
  return { background: `linear-gradient(135deg, ${segments.join(', ')})` }
}

function conditionStyle(item: LegendItem, index: number): Record<string, string> {
  const picks = props.mode === 'local' ? props.stochasticOptions?.[String(index)] : undefined
  return picks ? probabilityStyle(picks) : { background: item.color }
}

function conditionCaption(item: LegendItem, index: number): string {
  const picks = props.mode === 'local' ? props.stochasticOptions?.[String(index)] : undefined
  if (!picks) {
    return item.caption
  }
  const condition = item.caption.split('->')[0]
  return `${condition}->[${picks.split('').join(',')}]`
}
</script>

<template>
  <div class="ca-key">
    <span v-for="s in stateCount" :key="s"><span class="ca-dot" :style="{ background: colors[s - 1] }"></span>{{ stateChar(s - 1) }}</span>
    <span class="ca-key-text">{{ keyText }}</span>
  </div>

  <div class="ca-legend-wrap">
    <button
      v-if="mode === 'local'"
      type="button"
      class="ca-link-btn ca-probability-toggle"
      :aria-expanded="probabilityExpanded"
      @click="probabilityExpanded = !probabilityExpanded"
    >
      <span class="ca-panel-toggle-icon">{{ probabilityExpanded ? '▼' : '▶' }}</span>
      Probability cells
    </button>
    <div v-if="mode === 'local' && probabilityExpanded" class="ca-probability-editor">
      <label class="ca-label" for="ca-probability-input">Probability cells</label>
      <div class="ca-inline">
        <input
          id="ca-probability-input"
          v-model="probabilityInput"
          class="ca-input ca-probability-input"
          spellcheck="false"
          placeholder="[1, 0]"
          @keydown.enter="createProbabilityCell"
        />
        <button type="button" class="ca-probability-create" @click="createProbabilityCell">create cell</button>
        <button
          v-for="picks in probabilityCells"
          :key="picks"
          type="button"
          class="ca-probability-choice"
          disabled
          :title="`[${picks.split('').join(', ')}] is included in the condition cycle`"
        >
          <span class="ca-sq" :style="probabilityStyle(picks)"></span>
          <span>[{{ picks.split('').join(', ') }}]</span>
        </button>
      </div>
      <div v-if="probabilityError" class="ca-meter ca-render-warn">{{ probabilityError }}</div>
      <div v-else class="ca-meter">
        Created cells join the normal click cycle after state {{ stateChar(stateCount - 1) }}. Right-click cycles backwards. Repeated states add weight.
      </div>
    </div>

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
          :style="conditionStyle(item, index)"
          title="click for the next state or probability cell, right-click for the previous one"
          @click="onCellClick(index, $event)"
          @contextmenu="onCellRightClick(index, $event)"
        ></div>
        <div class="ca-cap">{{ conditionCaption(item, index) }}</div>
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

