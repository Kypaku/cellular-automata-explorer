<script setup lang="ts">
import { ref, computed } from 'vue'
import { CHAOS_DEFAULTS, CHAOS_TAG } from '../../constants/ca'
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

const cutTop = ref(CHAOS_DEFAULTS.cutTop)
const blockSize = ref(CHAOS_DEFAULTS.blockSize)
const maxDominant = ref(CHAOS_DEFAULTS.maxDominant)

// The tag that found rules are attached to. Defaults to the built-in NoChaos tag
// but the user can pick any existing tag (or type a new one) to use instead.
const targetTag = ref<string>(CHAOS_TAG)

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
  cutTop.value = clampInt(cutTop.value, 0, 90, CHAOS_DEFAULTS.cutTop)
  blockSize.value = clampInt(blockSize.value, 1, 32, CHAOS_DEFAULTS.blockSize)
  maxDominant.value = clampInt(maxDominant.value, 0, 100, CHAOS_DEFAULTS.maxDominant)
  emit('run', {
    ...config,
    cutTop: cutTop.value,
    blockSize: blockSize.value,
    maxDominant: maxDominant.value,
    targetTag: targetTag.value.trim() || CHAOS_TAG,
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
      <span class="ca-panel-toggle-icon">{{ collapsed ? '▶' : '▼' }}</span> Chaos test ({{ CHAOS_TAG }})
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
      run-label="▶ run chaos test"
      :found="found"
      found-label="no chaos in"
      :tags="tags"
      :tag-counts="tagCounts"
      :rules="rules"
      :width-max="1000"
      :height-max="2000"
      :initial-width="CHAOS_DEFAULTS.width"
      :initial-height="CHAOS_DEFAULTS.height"
      @run="onRun"
      @stop="emit('stop')"
    >
      <template #description>
        <label class="ca-label">
          Separate run: the top {{ cutTop }}% of the W×H generation is cut off (transient process),
          the rest is reduced to {{ blockSize }}×{{ blockSize }} patterns (like in the "to patterns" block).
          A rule is considered chaotic if the most frequent ("dominant") pattern doesn't stand out from
          the distribution — it covers no more than {{ maxDominant }}% of all blocks. The tag «{{ targetTag.trim() || CHAOS_TAG }}»
          is applied to rules WITHOUT chaos (to filter out chaotic ones): wild chaos like rule 30 doesn't get
          the tag, while rules with a dominant repeating background (e.g. rule 110) do.
          The tag is independent and can coexist with any class (currently {{ modeLabel }} for
          {{ stateCount }} states).
        </label>
      </template>

      <template #params>
        <div class="ca-inline">
          <TagTargetSelector v-model="targetTag" :tags="tags" :default-tag="CHAOS_TAG" :running="running" />
        </div>

        <div class="ca-inline">
          <label class="ca-field">
            <span class="ca-field-cap">cut off top, %</span>
            <input class="ca-number" type="number" min="0" max="90" step="1" v-model.number="cutTop" :disabled="running" />
          </label>
          <label class="ca-field">
            <span class="ca-field-cap">pattern M×M</span>
            <input class="ca-number" type="number" min="1" max="32" step="1" v-model.number="blockSize" :disabled="running" />
          </label>
          <label class="ca-field">
            <span class="ca-field-cap">max dominant share, %</span>
            <input class="ca-number" type="number" min="0" max="100" step="1" v-model.number="maxDominant" :disabled="running" />
          </label>
        </div>
      </template>

      <template #footer>
        <TagFoundActions
          :target-tag="targetTag.trim() || CHAOS_TAG"
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
