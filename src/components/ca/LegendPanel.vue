<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { LegendItem } from '../../types/ca'

const props = defineProps<{
  colors: string[]
  stateCount: number
  keyText: string
  legendItems: LegendItem[]
  legendModeLocal: boolean
}>()

const emit = defineEmits<{
  'cell-click': [index: number]
}>()

const COLLAPSE_THRESHOLD = 30

const collapsed = ref(true)

// Reset to collapsed whenever the rule (and thus the item count) changes.
watch(
  () => props.legendItems.length,
  () => {
    collapsed.value = true
  },
)

const showToggle = computed(() => props.legendItems.length > COLLAPSE_THRESHOLD)
const visibleItems = computed(() => (collapsed.value && showToggle.value ? props.legendItems.slice(0, COLLAPSE_THRESHOLD) : props.legendItems))
</script>

<template>
  <div class="ca-key">
    <span v-for="s in stateCount" :key="s"><span class="ca-dot" :style="{ background: colors[s - 1] }"></span>{{ s - 1 }}</span>
    <span class="ca-key-text">{{ keyText }}</span>
  </div>

  <div class="ca-legend-wrap">
    <div class="ca-legend" :class="{ 'ca-legend--local': legendModeLocal }">
      <div class="ca-cell" v-for="(item, index) in visibleItems" :key="index">
        <div
          class="ca-sq ca-sq--clickable"
          :style="{ background: item.color }"
          title="click to step to the next state"
          @click="emit('cell-click', index)"
        ></div>
        <div class="ca-cap">{{ item.caption }}</div>
      </div>
    </div>
    <button v-if="showToggle" type="button" class="ca-legend-toggle" @click="collapsed = !collapsed">
      {{ collapsed ? `Show all (${legendItems.length})` : 'Collapse' }}
    </button>
  </div>
</template>
