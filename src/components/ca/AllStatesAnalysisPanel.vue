<script setup lang="ts">
import { ref, computed } from 'vue'
import { ALL_STATES_DEFAULTS, ALL_STATES_TAG } from '../../constants/ca'
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

const bottomPercent = ref(ALL_STATES_DEFAULTS.bottomPercent)

// The tag that found rules are attached to. Defaults to the built-in AllStates tag
// but the user can pick any existing tag (or type a new one) to use instead.
const targetTag = ref<string>(ALL_STATES_TAG)

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
  bottomPercent.value = clampInt(bottomPercent.value, 1, 100, ALL_STATES_DEFAULTS.bottomPercent)
  emit('run', {
    ...config,
    bottomPercent: bottomPercent.value,
    targetTag: targetTag.value.trim() || ALL_STATES_TAG,
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
      <span class="ca-panel-toggle-icon">{{ collapsed ? '▶' : '▼' }}</span> All states present ({{ ALL_STATES_TAG }})
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
      run-label="▶ run all-states test"
      :found="found"
      found-label="all states in"
      :tags="tags"
      :tag-counts="tagCounts"
      :rules="rules"
      :width-max="1000"
      :height-max="2000"
      :initial-width="ALL_STATES_DEFAULTS.width"
      :initial-height="ALL_STATES_DEFAULTS.height"
      @run="onRun"
      @stop="emit('stop')"
    >
      <template #description>
        <label class="ca-label">
          Separate run: evolves the full W×H generation and looks only at the bottom
          {{ bottomPercent }}% of rows (the settled part, past the initial transient). The tag
          «{{ targetTag.trim() || ALL_STATES_TAG }}» is applied when every possible state value
          (0..{{ stateCount - 1 }}) shows up at least once among those rows. The tag is independent
          and can coexist with any class (currently {{ modeLabel }} for {{ stateCount }} states).
        </label>
      </template>

      <template #params>
        <div class="ca-inline">
          <TagTargetSelector v-model="targetTag" :tags="tags" :default-tag="ALL_STATES_TAG" :running="running" />
        </div>

        <div class="ca-inline">
          <label class="ca-field">
            <span class="ca-field-cap">bottom part, %</span>
            <input class="ca-number" type="number" min="1" max="100" step="1" v-model.number="bottomPercent" :disabled="running" />
          </label>
        </div>
      </template>

      <template #footer>
        <TagFoundActions
          :target-tag="targetTag.trim() || ALL_STATES_TAG"
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
