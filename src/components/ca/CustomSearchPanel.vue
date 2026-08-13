<script setup lang="ts">
import { reactive, ref, computed, watch } from 'vue'
import {
  CUSTOM_SEARCH_DEFAULTS,
  CUSTOM_SEARCH_TAG,
  CUSTOM_SEARCH_STORAGE_KEY,
  CUSTOM_ANY,
  CUSTOM_VAR_MAX,
  stateColor,
  isCustomVar,
  customVarIndex,
  customVarValue,
  customVarLabel,
  customVarColor,
} from '../../constants/ca'
import type { AnalysisRunConfig, CustomPattern, TaggedRule } from '../../types/ca'
import { stateChar } from '../../utils/caMath'
import { trySetItem } from '../../composables/useStorageWarning'
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

const MIN_PW = 1
const MAX_PW = 96
const MIN_PH = 1
const MAX_PH = 96

let uid = 0
function nextId(): string {
  uid += 1
  return `cs-${Date.now()}-${uid}`
}

function makeCells(w: number, h: number, fill: number): number[] {
  return new Array(w * h).fill(fill)
}

function normalizePattern(raw: unknown): CustomPattern | null {
  if (!raw || typeof raw !== 'object') {
    return null
  }
  const cand = raw as Partial<CustomPattern>
  const w = clampInt(Number(cand.width), MIN_PW, MAX_PW, 3)
  const h = clampInt(Number(cand.height), MIN_PH, MAX_PH, 3)
  const cells = makeCells(w, h, CUSTOM_ANY)
  let usedVars = 0
  if (Array.isArray(cand.cells)) {
    for (let i = 0; i < cells.length && i < cand.cells.length; i++) {
      const v = Math.floor(Number(cand.cells[i]))
      if (!Number.isFinite(v)) {
        cells[i] = CUSTOM_ANY
      } else if (v >= 0) {
        cells[i] = v
      } else if (isCustomVar(v) && customVarIndex(v) < CUSTOM_VAR_MAX) {
        cells[i] = v
        usedVars = Math.max(usedVars, customVarIndex(v) + 1)
      } else {
        cells[i] = CUSTOM_ANY
      }
    }
  }
  const varCount = clampInt(Number(cand.varCount), 0, CUSTOM_VAR_MAX, usedVars)
  return {
    id: typeof cand.id === 'string' ? cand.id : nextId(),
    width: w,
    height: h,
    cells,
    varCount: Math.max(varCount, usedVars),
  }
}

function loadPatterns(): CustomPattern[] {
  try {
    const raw = localStorage.getItem(CUSTOM_SEARCH_STORAGE_KEY)
    if (!raw) {
      return []
    }
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed.map(normalizePattern).filter((p): p is CustomPattern => p !== null)
  } catch {
    return []
  }
}

const patterns = reactive<CustomPattern[]>(loadPatterns())

watch(
  patterns,
  () => {
    trySetItem(CUSTOM_SEARCH_STORAGE_KEY, JSON.stringify(patterns))
  },
  { deep: true }
)

const modeLabel = computed(() =>
  props.mode === 'totalistic' ? 'totalistic codes' : props.mode === 'descendants' ? 'descendants rules' : 'local rules'
)

// The tag that found rules are attached to. Defaults to the built-in customSearch
// tag but the user can pick any existing tag (or type a new one) to use instead.
const targetTag = ref<string>(CUSTOM_SEARCH_TAG)

// Number of rules currently carrying the selected target tag.
const targetTagCount = computed(() => props.tagCounts[targetTag.value.trim()] || 0)

const maxState = computed(() => Math.max(1, props.stateCount - 1))

const usablePatterns = computed(() =>
  patterns.filter((p) => p.width >= 1 && p.height >= 1 && p.cells.some((c) => c !== CUSTOM_ANY))
)

const canRun = computed(() => usablePatterns.value.length > 0)

function clampInt(value: number, min: number, max: number, fallback: number): number {
  const num = Math.floor(Number(value))
  if (Number.isNaN(num)) {
    return fallback
  }
  return Math.max(min, Math.min(max, num))
}

function addPattern(): void {
  patterns.push({ id: nextId(), width: 3, height: 3, cells: makeCells(3, 3, CUSTOM_ANY), varCount: 0 })
}

// Adds one more variable (x{N}) to a template, up to CUSTOM_VAR_MAX.
function addVariable(pattern: CustomPattern): void {
  const count = pattern.varCount ?? 0
  if (count < CUSTOM_VAR_MAX) {
    pattern.varCount = count + 1
  }
}

// Drops the highest variable and rewrites any cell using it back to "any".
function removeVariable(pattern: CustomPattern): void {
  const count = pattern.varCount ?? 0
  if (count <= 0) {
    return
  }
  const removed = customVarValue(count - 1)
  for (let i = 0; i < pattern.cells.length; i++) {
    if (pattern.cells[i] === removed) {
      pattern.cells[i] = CUSTOM_ANY
    }
  }
  pattern.varCount = count - 1
}

// The ordered value cycle for a template's cells: any → states → variables.
function cellSequence(pattern: CustomPattern): number[] {
  const seq: number[] = [CUSTOM_ANY]
  for (let v = 0; v <= maxState.value; v++) {
    seq.push(v)
  }
  const count = pattern.varCount ?? 0
  for (let i = 0; i < count; i++) {
    seq.push(customVarValue(i))
  }
  return seq
}

function removePattern(id: string): void {
  const idx = patterns.findIndex((p) => p.id === id)
  if (idx !== -1) {
    patterns.splice(idx, 1)
  }
}

function clearPattern(pattern: CustomPattern): void {
  for (let i = 0; i < pattern.cells.length; i++) {
    pattern.cells[i] = CUSTOM_ANY
  }
}

// Fills every cell of the pattern with a single value (used by the "fill all" swatches).
function fillPattern(pattern: CustomPattern, value: number): void {
  for (let i = 0; i < pattern.cells.length; i++) {
    pattern.cells[i] = value
  }
}

// Values offered by the "fill all" swatches: any (∗), every concrete state, then
// each variable the template currently exposes.
function fillValues(pattern: CustomPattern): number[] {
  const values = [CUSTOM_ANY]
  for (let v = 0; v <= maxState.value; v++) {
    values.push(v)
  }
  const count = pattern.varCount ?? 0
  for (let i = 0; i < count; i++) {
    values.push(customVarValue(i))
  }
  return values
}

function resizePattern(pattern: CustomPattern, nextW: number, nextH: number): void {
  const w = clampInt(nextW, MIN_PW, MAX_PW, pattern.width)
  const h = clampInt(nextH, MIN_PH, MAX_PH, pattern.height)
  const cells = makeCells(w, h, CUSTOM_ANY)
  const copyW = Math.min(w, pattern.width)
  const copyH = Math.min(h, pattern.height)
  for (let y = 0; y < copyH; y++) {
    for (let x = 0; x < copyW; x++) {
      cells[y * w + x] = pattern.cells[y * pattern.width + x]
    }
  }
  pattern.width = w
  pattern.height = h
  pattern.cells = cells
}

// Click cycles a cell forward through: any → states → variables → any.
function cycleCell(pattern: CustomPattern, index: number): void {
  const seq = cellSequence(pattern)
  const pos = seq.indexOf(pattern.cells[index])
  pattern.cells[index] = seq[(pos + 1) % seq.length]
}

// Right-click steps a cell backwards through the same sequence.
function cycleCellBack(pattern: CustomPattern, index: number): void {
  const seq = cellSequence(pattern)
  const pos = seq.indexOf(pattern.cells[index])
  pattern.cells[index] = pos < 0 ? seq[seq.length - 1] : seq[(pos - 1 + seq.length) % seq.length]
}

function cellStyle(value: number): Record<string, string> {
  if (value === CUSTOM_ANY) {
    return {}
  }
  if (isCustomVar(value)) {
    return { backgroundColor: customVarColor(customVarIndex(value)) }
  }
  return { backgroundColor: stateColor(value) }
}

function cellLabel(value: number): string {
  if (value === CUSTOM_ANY) {
    return '∗'
  }
  if (isCustomVar(value)) {
    return customVarLabel(customVarIndex(value))
  }
  return stateChar(value)
}

function cellTitle(value: number): string {
  if (value === CUSTOM_ANY) {
    return 'any value'
  }
  if (isCustomVar(value)) {
    return `variable ${customVarLabel(customVarIndex(value))} — all cells with it must be equal to each other`
  }
  return `state ${value}`
}

function savePatternsToFile(): void {
  const payload = { patterns: JSON.parse(JSON.stringify(patterns)) }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'ca-custom-search-patterns.json'
  link.click()
  URL.revokeObjectURL(url)
}

const fileInput = ref<HTMLInputElement | null>(null)

function triggerLoad(): void {
  fileInput.value?.click()
}

async function onFileChosen(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files && input.files[0]
  if (!file) {
    return
  }
  try {
    const data = JSON.parse(await file.text())
    const list = Array.isArray(data) ? data : Array.isArray(data?.patterns) ? data.patterns : []
    const loaded = list.map(normalizePattern).filter((p: CustomPattern | null): p is CustomPattern => p !== null)
    patterns.splice(0, patterns.length, ...loaded)
  } catch {
    // ignore malformed files
  } finally {
    input.value = ''
  }
}

function onRun(config: AnalysisRunConfig): void {
  const tag = targetTag.value.trim() || CUSTOM_SEARCH_TAG
  emit('run', {
    ...config,
    negativePatterns: JSON.parse(JSON.stringify(usablePatterns.value)) as CustomPattern[],
    targetTag: tag,
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
      <span class="ca-panel-toggle-icon">{{ collapsed ? '▶' : '▼' }}</span> Custom search ({{ CUSTOM_SEARCH_TAG }})
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
      run-label="▶ run search"
      :found="found"
      found-label="passed the filter"
      :tags="tags"
      :tag-counts="tagCounts"
      :rules="rules"
      :width-max="1000"
      :height-max="2000"
      :initial-width="CUSTOM_SEARCH_DEFAULTS.width"
      :initial-height="CUSTOM_SEARCH_DEFAULTS.height"
      :can-run="canRun"
      @run="onRun"
      @stop="emit('stop')"
    >
      <template #description>
        <label class="ca-label">
          Separate run. Draw one or more W×H templates: each cell is either a
          concrete state (0…{{ maxState }}), or "any" (∗), or a <b>variable</b>
          (x1, x2, …) — all cells sharing the same variable must match in value at the point of
          a match (they define equality, not a fixed state). A variable can fill
          the whole field too. This is a block of <b>negative</b>
          templates: if any of them appears in the rule's spacetime diagram,
          the rule is <b>excluded</b>. The tag «{{ targetTag.trim() || CUSTOM_SEARCH_TAG }}» is only given to
          rules where none of the negative templates are found. Clicking a cell cycles its value
          (∗ → 0 → 1 → … → x1 → x2), right-click cycles backward. The template set can be saved to disk and
          loaded back. The tag is independent and can coexist with any class (currently {{ modeLabel }} for
          {{ stateCount }} states).
        </label>
      </template>

      <template #params>
        <div class="ca-cs-toolbar">
          <TagTargetSelector v-model="targetTag" :tags="tags" :default-tag="CUSTOM_SEARCH_TAG" :running="running" />
        </div>

        <div class="ca-cs-toolbar">
          <span class="ca-field-cap">negative templates ({{ patterns.length }})</span>
          <button type="button" @click="addPattern" :disabled="running">＋ template</button>
          <button type="button" @click="savePatternsToFile" :disabled="!patterns.length">💾 save set</button>
          <button type="button" @click="triggerLoad" :disabled="running">📂 load set</button>
          <input ref="fileInput" type="file" accept="application/json,.json" class="ca-cs-file" @change="onFileChosen" />
        </div>

        <div class="ca-cs-patterns">
          <div v-for="(pattern, pi) in patterns" :key="pattern.id" class="ca-cs-pattern">
            <div class="ca-cs-pattern-head">
              <span class="ca-field-cap">#{{ pi + 1 }}</span>
              <label class="ca-field">
                <span class="ca-field-cap">W</span>
                <input
                  class="ca-number ca-number--sm"
                  type="number"
                  :min="MIN_PW"
                  :max="MAX_PW"
                  step="1"
                  :value="pattern.width"
                  :disabled="running"
                  @change="resizePattern(pattern, ($event.target as HTMLInputElement).valueAsNumber, pattern.height)"
                />
              </label>
              <label class="ca-field">
                <span class="ca-field-cap">H</span>
                <input
                  class="ca-number ca-number--sm"
                  type="number"
                  :min="MIN_PH"
                  :max="MAX_PH"
                  step="1"
                  :value="pattern.height"
                  :disabled="running"
                  @change="resizePattern(pattern, pattern.width, ($event.target as HTMLInputElement).valueAsNumber)"
                />
              </label>
              <button type="button" class="ca-cs-mini" @click="addVariable(pattern)" :disabled="running || (pattern.varCount ?? 0) >= CUSTOM_VAR_MAX">＋ variable</button>
              <button type="button" class="ca-cs-mini" @click="removeVariable(pattern)" :disabled="running || (pattern.varCount ?? 0) <= 0">− variable</button>
              <button type="button" class="ca-cs-mini" @click="clearPattern(pattern)" :disabled="running">clear</button>
              <button type="button" class="ca-cs-mini" @click="removePattern(pattern.id)" :disabled="running">delete</button>
            </div>
            <div class="ca-cs-fillrow">
              <span class="ca-field-cap">fill all:</span>
              <button
                v-for="value in fillValues(pattern)"
                :key="value"
                type="button"
                class="ca-cs-swatch"
                :class="{ 'ca-cs-swatch--any': value === -1, 'ca-cs-swatch--var': value <= -2 }"
                :style="cellStyle(value)"
                :disabled="running"
                :title="cellTitle(value)"
                @click="fillPattern(pattern, value)"
              >{{ cellLabel(value) }}</button>
            </div>
            <div
              class="ca-cs-grid"
              :style="{ gridTemplateColumns: `repeat(${pattern.width}, 20px)` }"
            >
              <button
                v-for="(value, ci) in pattern.cells"
                :key="ci"
                type="button"
                class="ca-cs-cell"
                :class="{ 'ca-cs-cell--any': value === -1, 'ca-cs-cell--var': value <= -2 }"
                :style="cellStyle(value)"
                :disabled="running"
                :title="cellTitle(value)"
                @click="cycleCell(pattern, ci)"
                @contextmenu.prevent="cycleCellBack(pattern, ci)"
              >{{ cellLabel(value) }}</button>
            </div>
          </div>
          <p v-if="!patterns.length" class="ca-meter">no templates — add at least one negative template.</p>
        </div>
      </template>

      <template #run-extra>
        <span v-if="!usablePatterns.length" class="ca-meter">set at least one non-"any" cell</span>
      </template>

      <template #footer>
        <TagFoundActions
          :target-tag="targetTag.trim() || CUSTOM_SEARCH_TAG"
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
