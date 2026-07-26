<script setup lang="ts">
import { ref, computed } from 'vue'
import { GLIDERS_DEFAULTS, GLIDERS_TAG } from '../../constants/ca'
import type { AnalysisRunConfig, GliderCondition, TaggedRule } from '../../types/ca'
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

const blockWidth = ref(GLIDERS_DEFAULTS.blockWidth)
const blockHeight = ref(GLIDERS_DEFAULTS.blockHeight)
const maxPeriods = ref(GLIDERS_DEFAULTS.maxPeriods)
const minShift = ref(GLIDERS_DEFAULTS.minShift)
const minMatches = ref(GLIDERS_DEFAULTS.minMatches)
const backgroundMin = ref(GLIDERS_DEFAULTS.backgroundMin)
const spaceshipRepeats = ref(GLIDERS_DEFAULTS.spaceshipRepeats)
const spaceshipGap = ref(GLIDERS_DEFAULTS.spaceshipGap)
const spaceshipStep = ref(GLIDERS_DEFAULTS.spaceshipStep)
const spaceshipDetections = ref(GLIDERS_DEFAULTS.spaceshipDetections)
const condition = ref<GliderCondition>(GLIDERS_DEFAULTS.condition)

// The tag that found rules are attached to. Defaults to the built-in Gliders tag
// but the user can pick any existing tag (or type a new one) to use instead.
const targetTag = ref<string>(GLIDERS_TAG)

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
  blockWidth.value = clampInt(blockWidth.value, 1, 64, GLIDERS_DEFAULTS.blockWidth)
  blockHeight.value = clampInt(blockHeight.value, 1, 64, GLIDERS_DEFAULTS.blockHeight)
  maxPeriods.value = clampInt(maxPeriods.value, 1, 50, GLIDERS_DEFAULTS.maxPeriods)
  minShift.value = clampInt(minShift.value, 1, 32, GLIDERS_DEFAULTS.minShift)
  minMatches.value = clampInt(minMatches.value, 1, 20, GLIDERS_DEFAULTS.minMatches)
  backgroundMin.value = clampInt(backgroundMin.value, 0, 100, GLIDERS_DEFAULTS.backgroundMin)
  spaceshipRepeats.value = clampInt(spaceshipRepeats.value, 1, 50, GLIDERS_DEFAULTS.spaceshipRepeats)
  spaceshipGap.value = clampInt(spaceshipGap.value, 1, 200, GLIDERS_DEFAULTS.spaceshipGap)
  spaceshipStep.value = clampInt(spaceshipStep.value, 1, 200, GLIDERS_DEFAULTS.spaceshipStep)
  spaceshipDetections.value = clampInt(spaceshipDetections.value, 1, 50, GLIDERS_DEFAULTS.spaceshipDetections)
  emit('run', {
    ...config,
    blockWidth: blockWidth.value,
    blockHeight: blockHeight.value,
    maxPeriods: maxPeriods.value,
    minShift: minShift.value,
    minMatches: minMatches.value,
    backgroundMin: backgroundMin.value,
    spaceshipRepeats: spaceshipRepeats.value,
    spaceshipGap: spaceshipGap.value,
    spaceshipStep: spaceshipStep.value,
    spaceshipDetections: spaceshipDetections.value,
    condition: condition.value,
    targetTag: targetTag.value.trim() || GLIDERS_TAG,
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
      <span class="ca-panel-toggle-icon">{{ collapsed ? '▶' : '▼' }}</span> Gliders and spaceships test ({{ GLIDERS_TAG }})
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
      run-label="▶ run gliders test"
      :found="found"
      found-label="gliders found in"
      :tags="tags"
      :tag-counts="tagCounts"
      :rules="rules"
      :width-max="1000"
      :height-max="2000"
      :initial-width="GLIDERS_DEFAULTS.width"
      :initial-height="GLIDERS_DEFAULTS.height"
      @run="onRun"
      @stop="emit('stop')"
    >
      <template #description>
        <label class="ca-label">
          Separate run: a reference patch {{ blockWidth }}×{{ blockHeight }} is taken from the top and
          searched for further down in time, shifted sideways within the light cone (|shift| ≤ dy). The tag
          «{{ targetTag.trim() || GLIDERS_TAG }}» is applied if at least {{ minMatches }} matches are found with a shift
          of {{ minShift }} cell(s) or more — a sign of a moving structure (glider / spaceship). In modes
          with a shift, the rule is checked bottom-to-top for a "stationary spaceship": if a patch
          repeats in the same column ≥ {{ spaceshipRepeats }} times (gap ≤ {{ spaceshipGap }} rows)
          right away in {{ spaceshipDetections }} columns in a row with a step of {{ spaceshipStep }}, this is an oscillator /
          field standing still — such a rule is not tagged (a single repeat in a column can't be told apart from a
          local spaceship, so a series of stepped detections is required). Additionally, a single
          (background) colour must cover ≥ {{ backgroundMin }}% of the field. The tag is independent and
          can coexist with any class (currently {{ modeLabel }} for {{ stateCount }} states).
        </label>
      </template>

      <template #params>
        <div class="ca-inline">
          <TagTargetSelector v-model="targetTag" :tags="tags" :default-tag="GLIDERS_TAG" :running="running" />
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
            <span class="ca-field-cap">periods K</span>
            <input class="ca-number" type="number" min="1" max="50" step="1" v-model.number="maxPeriods" :disabled="running" />
          </label>
        </div>

        <div class="ca-inline">
          <label class="ca-field">
            <span class="ca-field-cap">min shift</span>
            <input class="ca-number" type="number" min="1" max="32" step="1" v-model.number="minShift" :disabled="running" />
          </label>
          <label class="ca-field">
            <span class="ca-field-cap">min matches</span>
            <input class="ca-number" type="number" min="1" max="20" step="1" v-model.number="minMatches" :disabled="running" />
          </label>
          <label class="ca-field">
            <span class="ca-field-cap">min background (% single colour)</span>
            <input class="ca-number" type="number" min="0" max="100" step="1" v-model.number="backgroundMin" :disabled="running" />
          </label>
        </div>

        <div class="ca-inline">
          <label class="ca-field">
            <span class="ca-field-cap">spaceship: repeats K</span>
            <input class="ca-number" type="number" min="1" max="50" step="1" v-model.number="spaceshipRepeats" :disabled="running" />
          </label>
          <label class="ca-field">
            <span class="ca-field-cap">spaceship: gap N (rows)</span>
            <input class="ca-number" type="number" min="1" max="200" step="1" v-model.number="spaceshipGap" :disabled="running" />
          </label>
          <label class="ca-field">
            <span class="ca-field-cap">spaceship: step xStep</span>
            <input class="ca-number" type="number" min="1" max="200" step="1" v-model.number="spaceshipStep" :disabled="running" />
          </label>
          <label class="ca-field">
            <span class="ca-field-cap">spaceship: detections K2</span>
            <input class="ca-number" type="number" min="1" max="50" step="1" v-model.number="spaceshipDetections" :disabled="running" />
          </label>
        </div>

        <div class="ca-inline ca-glider-cond">
          <span class="ca-field-cap">condition:</span>
          <label class="ca-check">
            <input
              type="checkbox"
              :checked="condition === 'all'"
              :disabled="running"
              @change="condition = 'all'"
            />
            <span>all</span>
          </label>
          <label class="ca-check">
            <input
              type="checkbox"
              :checked="condition === 'moving'"
              :disabled="running"
              @change="condition = 'moving'"
            />
            <span>no spaceships (no shift)</span>
          </label>
          <label class="ca-check">
            <input
              type="checkbox"
              :checked="condition === 'bidirectional'"
              :disabled="running"
              @change="condition = 'bidirectional'"
            />
            <span>only gliders moving both ways</span>
          </label>
        </div>
      </template>

      <template #footer>
        <TagFoundActions
          :target-tag="targetTag.trim() || GLIDERS_TAG"
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
