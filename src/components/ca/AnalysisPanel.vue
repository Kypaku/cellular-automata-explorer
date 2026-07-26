<script setup lang="ts">
import { ref, computed } from 'vue'
import { ANALYSIS_CLASSES, ANALYSIS_DEFAULTS } from '../../constants/ca'
import type { AnalysisRunConfig, TaggedRule } from '../../types/ca'
import AnalysisRunControls from './AnalysisRunControls.vue'

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
  counts: Record<string, number>
  tags: string[]
  tagCounts: Record<string, number>
  rules: TaggedRule[]
}>()

const emit = defineEmits(['run', 'stop'])

// Collapsed by default - there are many analysis blocks and expanding all of them
// makes the tags/analysis tab hard to scroll through.
const collapsed = ref(true)

const chaosFluxPercent = ref(Math.round(ANALYSIS_DEFAULTS.chaosFlux * 100))
const sparseFillPercent = ref(Math.round(ANALYSIS_DEFAULTS.sparseFill * 100))
const windowFraction = ref(ANALYSIS_DEFAULTS.windowFraction)

const modeLabel = computed(() =>
  props.mode === 'totalistic' ? 'totalistic codes' : props.mode === 'descendants' ? 'descendants rules' : 'local rules'
)

const countList = computed(() =>
  ANALYSIS_CLASSES.map((cls) => ({
    ...cls,
    count: props.counts[cls.tag] || 0,
  }))
)

function clampPercent(value: number, fallback: number): number {
  const num = Number(value)
  return Number.isNaN(num) ? fallback : Math.max(0, Math.min(100, num))
}

function clampWindowFraction(value: number): number {
  const num = Math.floor(Number(value))
  return Number.isNaN(num) || num < 1 ? ANALYSIS_DEFAULTS.windowFraction : Math.min(20, num)
}

function onRun(config: AnalysisRunConfig): void {
  chaosFluxPercent.value = clampPercent(chaosFluxPercent.value, Math.round(ANALYSIS_DEFAULTS.chaosFlux * 100))
  sparseFillPercent.value = clampPercent(sparseFillPercent.value, Math.round(ANALYSIS_DEFAULTS.sparseFill * 100))
  windowFraction.value = clampWindowFraction(windowFraction.value)
  emit('run', {
    ...config,
    chaosFlux: chaosFluxPercent.value / 100,
    sparseFill: sparseFillPercent.value / 100,
    windowFraction: windowFraction.value,
  })
}
</script>

<template>
  <div class="ca-analysis">
    <h3 class="ca-panel-title ca-panel-title--toggle" @click="collapsed = !collapsed">
      <span class="ca-panel-toggle-icon">{{ collapsed ? '▶' : '▼' }}</span> Rule Analysis
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
      run-label="▶ run analysis"
      :tags="tags"
      :tag-counts="tagCounts"
      :rules="rules"
      :width-max="401"
      :height-max="1000"
      :initial-width="ANALYSIS_DEFAULTS.width"
      :initial-height="ANALYSIS_DEFAULTS.height"
      @run="onRun"
      @stop="emit('stop')"
    >
      <template #description>
        <label class="ca-label">
          Runs each rule (full range, random sample or by selected tags)
          and automatically applies a class tag
          (currently analysing {{ modeLabel }} for {{ stateCount }} states)
        </label>
      </template>

      <template #params>
        <div class="ca-inline">
          <label class="ca-field">
            <span class="ca-field-cap">chaos threshold, % changes</span>
            <input class="ca-number" type="number" min="0" max="100" step="1" v-model.number="chaosFluxPercent" :disabled="running" />
          </label>
          <label class="ca-field">
            <span class="ca-field-cap">sparse threshold, % fill</span>
            <input class="ca-number" type="number" min="0" max="100" step="1" v-model.number="sparseFillPercent" :disabled="running" />
          </label>
          <label class="ca-field">
            <span class="ca-field-cap">window divider (H / N)</span>
            <input class="ca-number" type="number" min="1" max="20" step="1" v-model.number="windowFraction" :disabled="running" />
          </label>
        </div>
      </template>

      <template #footer>
        <ul class="ca-count-list">
          <li v-for="cls in countList" :key="cls.tag" class="ca-count-item">
            <span class="ca-count-chip">{{ cls.tag }}</span>
            <span class="ca-count-value">{{ cls.count }}</span>
            <span class="ca-count-desc">{{ cls.description }}</span>
          </li>
        </ul>
      </template>
    </AnalysisRunControls>
  </div>
</template>
