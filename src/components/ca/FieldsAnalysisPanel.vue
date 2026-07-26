<script setup lang="ts">
import { ref, computed } from 'vue'
import { FIELDS_DEFAULTS, FIELDS_TAG } from '../../constants/ca'
import type { AnalysisRunConfig, TaggedRule } from '../../types/ca'
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
}>()

const emit = defineEmits(['run', 'stop', 'undo-found', 'clear-tag'])

// Collapsed by default - there are many analysis blocks and expanding all of them
// makes the tags/analysis tab hard to scroll through.
const collapsed = ref(true)

const blockWidth = ref(FIELDS_DEFAULTS.blockWidth)
const blockHeight = ref(FIELDS_DEFAULTS.blockHeight)
const minPercent = ref(FIELDS_DEFAULTS.minPercent)

// The tag that found rules are attached to. Defaults to the built-in Fields tag
// but the user can pick any existing tag (or type a new one) to use instead.
const targetTag = ref<string>(FIELDS_TAG)

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
  blockWidth.value = clampInt(blockWidth.value, 1, 64, FIELDS_DEFAULTS.blockWidth)
  blockHeight.value = clampInt(blockHeight.value, 1, 64, FIELDS_DEFAULTS.blockHeight)
  minPercent.value = clampInt(minPercent.value, 1, 100, FIELDS_DEFAULTS.minPercent)
  emit('run', {
    ...config,
    blockWidth: blockWidth.value,
    blockHeight: blockHeight.value,
    minPercent: minPercent.value,
    targetTag: targetTag.value.trim() || FIELDS_TAG,
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
      <span class="ca-panel-toggle-icon">{{ collapsed ? '▶' : '▼' }}</span> Fields test ({{ FIELDS_TAG }})
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
      run-label="▶ run fields test"
      :found="found"
      found-label="fields found in"
      :tags="tags"
      :tag-counts="tagCounts"
      :rules="rules"
      :width-max="1000"
      :height-max="2000"
      :initial-width="FIELDS_DEFAULTS.width"
      :initial-height="FIELDS_DEFAULTS.height"
      @run="onRun"
      @stop="emit('stop')"
    >
      <template #description>
        <label class="ca-label">
          Separate run: the W×H generation is cut into patches {{ blockWidth }}×{{ blockHeight }},
          patches are compared up to a horizontal shift (so field drift doesn't break a
          match). The tag «{{ targetTag.trim() || FIELDS_TAG }}» is applied if the most frequent patch covers at least
          K% of all patches. The tag is independent and can coexist with any class
          (currently {{ modeLabel }} for {{ stateCount }} states).
        </label>
      </template>

      <template #params>
        <div class="ca-inline">
          <TagTargetSelector v-model="targetTag" :tags="tags" :default-tag="FIELDS_TAG" :running="running" />
        </div>

        <div class="ca-inline">
          <label class="ca-field">
            <span class="ca-field-cap">patch W</span>
            <input class="ca-number" type="number" min="1" max="64" step="1" v-model.number="blockWidth" :disabled="running" />
          </label>
          <label class="ca-field">
            <span class="ca-field-cap">patch H</span>
            <input class="ca-number" type="number" min="1" max="64" step="1" v-model.number="blockHeight" :disabled="running" />
          </label>
          <label class="ca-field">
            <span class="ca-field-cap">threshold K (% of patches)</span>
            <input class="ca-number" type="number" min="1" max="100" step="1" v-model.number="minPercent" :disabled="running" />
          </label>
        </div>
      </template>

      <template #footer>
        <TagFoundActions
          :target-tag="targetTag.trim() || FIELDS_TAG"
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
