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
const usePatterns = ref(SUBANALYSIS_DEFAULTS.usePatterns)
const patternSize = ref(SUBANALYSIS_DEFAULTS.patternSize)

// Detailed per-rule results are hidden by default: a full scan can produce
// thousands of rows and the panel is only meant to show the summary counts.
const showDetails = ref(false)

const chunkNote = computed(() => {
  const w = clampInt(minWidth.value, 4, 4000, SUBANALYSIS_DEFAULTS.minWidth)
  const rows = clampInt(keep.value, 1, 4000, SUBANALYSIS_DEFAULTS.keep)
  if (usePatterns.value) {
    const m = clampInt(patternSize.value, 1, 64, SUBANALYSIS_DEFAULTS.patternSize)
    const cols = Math.floor(w / m)
    const cc = Math.max(1, Math.round((chunkPercent.value / 100) * cols))
    const chunks = Math.floor(cols / cc)
    return `at W=${w}: ${cols} pattern columns of ${m}×${m}, chunk ≈ ${cc} columns × ${Math.floor(rows / m)} pattern rows, ~${chunks} chunks`
  }
  const cw = Math.max(1, Math.round((chunkPercent.value / 100) * w))
  const chunks = Math.floor(w / cw)
  return `at W=${w}: chunk ≈ ${cw} cells × ${rows} rows, ~${chunks} chunks`
})

const missingCount = computed(() => props.results.filter((r) => r.foundWidth === null).length)

function formatDev(dev: number | null): string {
  return dev === null ? '—' : `${(dev * 100).toFixed(1)}%`
}

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
  patternSize.value = clampInt(patternSize.value, 1, 64, SUBANALYSIS_DEFAULTS.patternSize)

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
      usePatterns: usePatterns.value,
      patternSize: patternSize.value,
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

        <label class="ca-check">
          <input type="checkbox" v-model="usePatterns" :disabled="running" />
          <span>count patterns instead of cells</span>
        </label>

        <div class="ca-inline" v-if="usePatterns">
          <label class="ca-field">
            <span class="ca-field-cap">pattern size M</span>
            <input class="ca-number" type="number" min="1" max="64" step="1" v-model.number="patternSize" :disabled="running" />
          </label>
          <div class="ca-meter">
            the kept rows are tiled into M×M patterns (as in «convert field to patterns»);
            every block scores by rarity — the most frequent (background) pattern gives 0,
            rare patterns give close to 1 — instead of the sum of cell values
          </div>
        </div>

        <label class="ca-check">
          <input type="checkbox" v-model="showDetails" />
          <span>show detailed results</span>
        </label>
      </template>

      <template #footer>
        <div v-if="showDetails" class="ca-sub-results">
          <div v-if="!results.length" class="ca-meter">No results yet.</div>
          <ul v-else class="ca-count-list">
            <li
              v-for="row in results"
              :key="row.id"
              class="ca-count-item ca-sub-result"
              role="button"
              tabindex="0"
              @click="emit('select-rule', row.snapshot)"
              @keydown.enter.prevent="emit('select-rule', row.snapshot)"
            >
              <span class="ca-count-chip" :class="row.foundWidth === null ? 'ca-sub-miss' : 'ca-sub-ok'">
                {{ row.foundWidth === null ? 'no width' : `W ${row.foundWidth}` }}
              </span>
              <span class="ca-count-value">{{ row.name }}</span>
              <span class="ca-count-desc">
                best W {{ row.bestWidth === null ? '—' : row.bestWidth }} · deviation {{ formatDev(row.bestDev) }} ·
                widths tested {{ row.tested }}
              </span>
            </li>
          </ul>
        </div>

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
