<script setup lang="ts">
import { ref, computed } from 'vue'
import { CHAOS2_DEFAULTS, CHAOS2_TAG } from '../../constants/ca'
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

const cutTop = ref(CHAOS2_DEFAULTS.cutTop)
const blockSize = ref(CHAOS2_DEFAULTS.blockSize)
const maxUnique = ref(CHAOS2_DEFAULTS.maxUnique)

// The tag that found rules are attached to. Defaults to the built-in NoChaos2 tag
// but the user can pick any existing tag (or type a new one) to use instead.
const targetTag = ref<string>(CHAOS2_TAG)

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
  cutTop.value = clampInt(cutTop.value, 0, 90, CHAOS2_DEFAULTS.cutTop)
  blockSize.value = clampInt(blockSize.value, 1, 32, CHAOS2_DEFAULTS.blockSize)
  maxUnique.value = clampInt(maxUnique.value, 0, 100, CHAOS2_DEFAULTS.maxUnique)
  emit('run', {
    ...config,
    cutTop: cutTop.value,
    blockSize: blockSize.value,
    maxUnique: maxUnique.value,
    targetTag: targetTag.value.trim() || CHAOS2_TAG,
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
      <span class="ca-panel-toggle-icon">{{ collapsed ? '▶' : '▼' }}</span> Chaos test 2 ({{ CHAOS2_TAG }})
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
      run-label="▶ run chaos test 2"
      :found="found"
      found-label="no chaos in"
      :tags="tags"
      :tag-counts="tagCounts"
      :rules="rules"
      :width-max="1000"
      :height-max="2000"
      :initial-width="CHAOS2_DEFAULTS.width"
      :initial-height="CHAOS2_DEFAULTS.height"
      @run="onRun"
      @stop="emit('stop')"
    >
      <template #description>
        <label class="ca-label">
          Separate run, a different principle than the first chaos test: the top {{ cutTop }}% of the
          W×H generation is cut off (transient process), the rest is split into
          {{ blockSize }}×{{ blockSize }} patterns (like in the "to patterns" block) and we count how many
          of those blocks carry a DISTINCT pattern. A chaotic rule keeps inventing new patterns, so their
          share approaches 100%; an ordered rule reuses a small vocabulary of blocks. The tag
          «{{ targetTag.trim() || CHAOS2_TAG }}» is applied when the share of unique patterns is no more
          than {{ maxUnique }}% — i.e. to rules WITHOUT chaos.
          The tag is independent and can coexist with any class (currently {{ modeLabel }} for
          {{ stateCount }} states).
        </label>
      </template>

      <template #params>
        <div class="ca-inline">
          <TagTargetSelector v-model="targetTag" :tags="tags" :default-tag="CHAOS2_TAG" :running="running" />
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
            <span class="ca-field-cap">max unique share K, %</span>
            <input class="ca-number" type="number" min="0" max="100" step="1" v-model.number="maxUnique" :disabled="running" />
          </label>
        </div>
      </template>

      <template #footer>
        <TagFoundActions
          :target-tag="targetTag.trim() || CHAOS2_TAG"
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
