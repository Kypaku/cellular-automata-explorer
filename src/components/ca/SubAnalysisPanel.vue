<script setup lang="ts">
import { ref, computed } from 'vue'
import { SUBANALYSIS_DEFAULTS, LARGE_STRUCTURES_TAG } from '../../constants/ca'
import type { AnalysisRunConfig, TaggedRule } from '../../types/ca'
import type { SubAnalysisResultRow } from '../../composables/useRuleSubAnalysis'
import AnalysisRunControls from './AnalysisRunControls.vue'
import TagTargetSelector from './TagTargetSelector.vue'
import TagFoundActions from './TagFoundActions.vue'

const props = defineProps<{
  stateCount: number
  mode: string
  codeMax: number
  tags: string[]
  tagCounts: Record<string, number>
  rules: TaggedRule[]
  running: boolean
  done: number
  total: number
  progress: number
  currentCode: number
  currentName?: string
  found: number
  canUndoFound?: boolean
  results: SubAnalysisResultRow[]
}>()

const emit = defineEmits(['run', 'stop', 'select-rule', 'undo-found', 'clear-tag'])

// The tag that found rules are attached to. Defaults to the built-in
// LargeStructures tag but the user can pick any existing tag (or type a new one).
const targetTag = ref<string>(LARGE_STRUCTURES_TAG)

// Collapsed by default - there are many analysis blocks and expanding all of them
// makes the tags/analysis tab hard to scroll through.
const collapsed = ref(true)

// Number of rules currently carrying the selected target tag.
const targetTagCount = computed(() => props.tagCounts[targetTag.value.trim()] || 0)

const keep = ref(SUBANALYSIS_DEFAULTS.keep)
const chunkPercent = ref(SUBANALYSIS_DEFAULTS.chunkPercent)
const tolerance = ref(SUBANALYSIS_DEFAULTS.tolerance)
const height = ref(SUBANALYSIS_DEFAULTS.height)
const minWidth = ref(SUBANALYSIS_DEFAULTS.minWidth)
const maxWidth = ref(SUBANALYSIS_DEFAULTS.maxWidth)
const step = ref(SUBANALYSIS_DEFAULTS.step)

const chunkNote = computed(() => {
  const w = clampInt(minWidth.value, 4, 4000, SUBANALYSIS_DEFAULTS.minWidth)
  const cw = Math.max(1, Math.round((chunkPercent.value / 100) * w))
  const chunks = Math.floor(w / cw)
  return `at W=${w}: chunk ≈ ${cw} cells × ${clampInt(keep.value, 1, 4000, SUBANALYSIS_DEFAULTS.keep)} rows, ~${chunks} chunks`
})

const missingCount = computed(() => props.results.filter((r) => r.foundWidth === null).length)

function clampInt(value: number, min: number, max: number, fallback: number): number {
  const num = Math.floor(Number(value))
  if (Number.isNaN(num)) {
    return fallback
  }
  return Math.max(min, Math.min(max, num))
}

function onRun(config: AnalysisRunConfig): void {
  keep.value = clampInt(keep.value, 1, 2000, SUBANALYSIS_DEFAULTS.keep)
  height.value = clampInt(height.value, keep.value, 40000, SUBANALYSIS_DEFAULTS.height)
  minWidth.value = clampInt(minWidth.value, 4, 40000, SUBANALYSIS_DEFAULTS.minWidth)
  maxWidth.value = clampInt(maxWidth.value, minWidth.value, 40000, SUBANALYSIS_DEFAULTS.maxWidth)
  step.value = clampInt(step.value, 1, 10000, SUBANALYSIS_DEFAULTS.step)

  const cp = Number(chunkPercent.value)
  chunkPercent.value = Number.isNaN(cp) ? SUBANALYSIS_DEFAULTS.chunkPercent : Math.max(0.5, Math.min(50, cp))
  const tol = Number(tolerance.value)
  tolerance.value = Number.isNaN(tol) ? SUBANALYSIS_DEFAULTS.tolerance : Math.max(0, Math.min(100, tol))

  emit('run', {
    sourceMode: config.sourceMode,
    from: config.from,
    to: config.to,
    sampleCount: config.sampleCount,
    tags: config.tags,
    init: config.init,
    height: height.value,
    targetTag: targetTag.value.trim() || LARGE_STRUCTURES_TAG,
    options: {
      keep: keep.value,
      chunkPercent: chunkPercent.value,
      tolerance: tolerance.value,
      height: height.value,
      init: config.init,
      minWidth: minWidth.value,
      maxWidth: maxWidth.value,
      step: step.value,
    },
  })
}
</script>

<template>
  <div class="ca-analysis">
    <h3 class="ca-panel-title ca-panel-title--toggle" @click="collapsed = !collapsed">
      <span class="ca-panel-toggle-icon">{{ collapsed ? '▶' : '▼' }}</span> Sub-analysis ({{ LARGE_STRUCTURES_TAG }})
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
      run-label="▶ run sub-analysis"
      :found="missingCount"
      found-label="large struct."
      :tags="tags"
      :tag-counts="tagCounts"
      :rules="rules"
      :show-width="false"
      :show-height="false"
      @run="onRun"
      @stop="emit('stop')"
    >
      <template #description>
        <label class="ca-label">
          A set of rules is gathered (full range, random sample or by selected tags),
          and each is tested separately: for the last K rows the minimal width is searched for, at
          which the sum of values in any chunk (chunk width = N% of the width) deviates from
          the average by no more than R%. The tag «{{ targetTag.trim() || LARGE_STRUCTURES_TAG }}»
          is applied to rules where NO such width was found — i.e. the diagram never becomes
          uniform and keeps large structures.
        </label>
      </template>

      <template #params>
        <div class="ca-inline">
          <TagTargetSelector v-model="targetTag" :tags="tags" :default-tag="LARGE_STRUCTURES_TAG" :running="running" />
        </div>

        <div class="ca-inline">
          <label class="ca-field">
            <span class="ca-field-cap">K (rows)</span>
            <input class="ca-number" type="number" min="1" max="2000" step="1" v-model.number="keep" :disabled="running" />
          </label>
          <label class="ca-field">
            <span class="ca-field-cap">N (% of chunk width)</span>
            <input class="ca-number" type="number" min="0.5" max="50" step="0.5" v-model.number="chunkPercent" :disabled="running" />
          </label>
          <label class="ca-field">
            <span class="ca-field-cap">R (% deviation)</span>
            <input class="ca-number" type="number" min="0" max="100" step="1" v-model.number="tolerance" :disabled="running" />
          </label>
          <label class="ca-field">
            <span class="ca-field-cap">height H</span>
            <input class="ca-number" type="number" min="1" step="1" v-model.number="height" :disabled="running" />
          </label>
        </div>

        <div class="ca-inline">
          <label class="ca-field">
            <span class="ca-field-cap">width from</span>
            <input class="ca-number" type="number" min="4" step="1" v-model.number="minWidth" :disabled="running" />
          </label>
          <label class="ca-field">
            <span class="ca-field-cap">width to</span>
            <input class="ca-number" type="number" min="4" step="1" v-model.number="maxWidth" :disabled="running" />
          </label>
          <label class="ca-field">
            <span class="ca-field-cap">width step</span>
            <input class="ca-number" type="number" min="1" step="1" v-model.number="step" :disabled="running" />
          </label>
        </div>

        <div class="ca-meter">{{ chunkNote }}</div>
      </template>

      <template #footer>
        <TagFoundActions
          :target-tag="targetTag.trim() || LARGE_STRUCTURES_TAG"
          :tag-count="targetTagCount"
          :found="missingCount"
          :running="running"
          :can-undo-found="canUndoFound"
          @undo-found="emit('undo-found')"
          @clear-tag="(tag) => emit('clear-tag', tag)"
        />
      </template>
    </AnalysisRunControls>
  </div>
</template>
