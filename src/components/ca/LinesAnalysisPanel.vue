<script setup lang="ts">
import { ref, computed } from 'vue'
import { LINES_DEFAULTS, LINES_TAG } from '../../constants/ca'
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

const cutTop = ref(LINES_DEFAULTS.cutTop)
const minBlock = ref(LINES_DEFAULTS.minBlock)
const maxBlock = ref(LINES_DEFAULTS.maxBlock)
const blockStep = ref(LINES_DEFAULTS.blockStep)
const lineCount = ref(LINES_DEFAULTS.lineCount)
const ignoreBackground = ref(LINES_DEFAULTS.ignoreBackground)
const maxPeriod = ref(LINES_DEFAULTS.maxPeriod)
const maxDrift = ref(LINES_DEFAULTS.maxDrift)

// The tag that found rules are attached to. Defaults to the built-in NoLines tag
// but the user can pick any existing tag (or type a new one) to use instead.
const targetTag = ref<string>(LINES_TAG)

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
  cutTop.value = clampInt(cutTop.value, 0, 90, LINES_DEFAULTS.cutTop)
  minBlock.value = clampInt(minBlock.value, 1, 64, LINES_DEFAULTS.minBlock)
  maxBlock.value = clampInt(maxBlock.value, minBlock.value, 64, LINES_DEFAULTS.maxBlock)
  blockStep.value = clampInt(blockStep.value, 1, 32, LINES_DEFAULTS.blockStep)
  lineCount.value = clampInt(lineCount.value, 1, 50, LINES_DEFAULTS.lineCount)
  maxPeriod.value = clampInt(maxPeriod.value, 1, 16, LINES_DEFAULTS.maxPeriod)
  maxDrift.value = clampInt(maxDrift.value, 1, 8, LINES_DEFAULTS.maxDrift)
  emit('run', {
    ...config,
    cutTop: cutTop.value,
    minBlock: minBlock.value,
    maxBlock: maxBlock.value,
    blockStep: blockStep.value,
    lineCount: lineCount.value,
    ignoreBackground: ignoreBackground.value,
    maxPeriod: maxPeriod.value,
    maxDrift: maxDrift.value,
    targetTag: targetTag.value.trim() || LINES_TAG,
  })
}

// Untags every rule the last completed run had tagged (does not touch earlier runs).
function onUndoFound(): void {
  emit('undo-found')
}
</script>

<template>
  <div class="ca-analysis">
    <h3 class="ca-panel-title">No-lines test ({{ LINES_TAG }})</h3>
    <AnalysisRunControls
      :code-max="codeMax"
      :running="running"
      :done="done"
      :total="total"
      :progress="progress"
      :current-code="currentCode"
      :current-name="currentName"
      run-label="▶ run no-lines test"
      :found="found"
      found-label="no lines in"
      :tags="tags"
      :tag-counts="tagCounts"
      :rules="rules"
      :width-max="1000"
      :height-max="2000"
      :initial-width="LINES_DEFAULTS.width"
      :initial-height="LINES_DEFAULTS.height"
      @run="onRun"
      @stop="emit('stop')"
    >
      <template #description>
        <label class="ca-label">
          Separate run: the top {{ cutTop }}% of the W×H generation is cut off (transient process),
          the rest is reduced to M×M patterns (like in the "to patterns" block) and lines of a
          single color-pattern spanning the full height are searched for — from y0 to the bottom. A line
          counts if it is straight (vertical) or slanted at any angle (the next cell is to the side, below, or
          diagonal, any sideways drift). Blinking rules never keep one constant color, so the color is
          allowed to repeat with a temporal period of up to {{ maxPeriod }} block-rows (1 = constant color,
          as before): every p-th block-row is taken, in every phase. If {{ lineCount }} lines aren't reached
          in any direction, the pattern size M is increased up to {{ maxBlock }}. The tag
          «{{ targetTag.trim() || LINES_TAG }}» is applied to rules where no lines were found at all.
          The tag is independent and can coexist
          with any class (currently {{ modeLabel }} for {{ stateCount }} states).
        </label>
      </template>

      <template #params>
        <div class="ca-inline">
          <TagTargetSelector v-model="targetTag" :tags="tags" :default-tag="LINES_TAG" :running="running" />
        </div>

        <div class="ca-inline">
          <label class="ca-field">
            <span class="ca-field-cap">cut off top, %</span>
            <input class="ca-number" type="number" min="0" max="90" step="1" v-model.number="cutTop" :disabled="running" />
          </label>
          <label class="ca-field">
            <span class="ca-field-cap">lines N (single direction)</span>
            <input class="ca-number" type="number" min="1" max="50" step="1" v-model.number="lineCount" :disabled="running" />
          </label>
        </div>

        <div class="ca-inline">
          <label class="ca-field">
            <span class="ca-field-cap">pattern M from</span>
            <input class="ca-number" type="number" min="1" max="64" step="1" v-model.number="minBlock" :disabled="running" />
          </label>
          <label class="ca-field">
            <span class="ca-field-cap">to Mmax</span>
            <input class="ca-number" type="number" min="1" max="64" step="1" v-model.number="maxBlock" :disabled="running" />
          </label>
          <label class="ca-field">
            <span class="ca-field-cap">step M</span>
            <input class="ca-number" type="number" min="1" max="32" step="1" v-model.number="blockStep" :disabled="running" />
          </label>
        </div>

        <div class="ca-inline">
          <label class="ca-field">
            <span class="ca-field-cap">color period p (1 = constant)</span>
            <input class="ca-number" type="number" min="1" max="16" step="1" v-model.number="maxPeriod" :disabled="running" />
          </label>
          <label class="ca-field">
            <span class="ca-field-cap">sideways drift, blocks</span>
            <input class="ca-number" type="number" min="1" max="8" step="1" v-model.number="maxDrift" :disabled="running" />
          </label>
        </div>

        <div class="ca-inline">
          <label class="ca-check">
            <input type="checkbox" v-model="ignoreBackground" :disabled="running" />
            <span>ignore background (most frequent pattern)</span>
          </label>
        </div>
      </template>

      <template #footer>
        <TagFoundActions
          :target-tag="targetTag.trim() || LINES_TAG"
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
