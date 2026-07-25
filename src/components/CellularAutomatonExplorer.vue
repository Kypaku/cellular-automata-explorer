<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import '../assets/cellular-automaton.css'
import { useCellularAutomaton } from '../composables/useCellularAutomaton'
import { useRuleTags } from '../composables/useRuleTags'
import { useRuleAnalysis } from '../composables/useRuleAnalysis'
import { useRuleFieldsAnalysis } from '../composables/useRuleFieldsAnalysis'
import { useRuleGlidersAnalysis } from '../composables/useRuleGlidersAnalysis'
import { useRuleCustomSearchAnalysis } from '../composables/useRuleCustomSearchAnalysis'
import { useRuleLinesAnalysis } from '../composables/useRuleLinesAnalysis'
import { useRuleChaosAnalysis } from '../composables/useRuleChaosAnalysis'
import { useRuleSubAnalysis } from '../composables/useRuleSubAnalysis'
import { FIELDS_TAG, GLIDERS_TAG, CUSTOM_SEARCH_TAG, LINES_TAG, CHAOS_TAG, LARGE_STRUCTURES_TAG } from '../constants/ca'
import { CUSTOM_SEARCH_STORAGE_KEY } from '../constants/ca'
import type {
  AnalysisInitMode,
  AnalysisRuleInput,
  AnalysisSourceMode,
  CustomPattern,
  GliderCondition,
  RuleParts,
  RuleSnapshot,
  SubAnalyzeOptions,
} from '../types/ca'
import { partsFromSnapshot } from '../utils/caMath'
import { testRuleAgainstAllTags, type TagTestResult } from '../utils/caAnalysis'
import RuleControls from './ca/RuleControls.vue'
import InitControls from './ca/InitControls.vue'
import LegendPanel from './ca/LegendPanel.vue'
import ViewPanel from './ca/ViewPanel.vue'
import RenderPanel from './ca/RenderPanel.vue'
import TagsPanel from './ca/TagsPanel.vue'
import AnalysisPanel from './ca/AnalysisPanel.vue'
import FieldsAnalysisPanel from './ca/FieldsAnalysisPanel.vue'
import GlidersAnalysisPanel from './ca/GlidersAnalysisPanel.vue'
import CustomSearchPanel from './ca/CustomSearchPanel.vue'
import LinesAnalysisPanel from './ca/LinesAnalysisPanel.vue'
import ChaosAnalysisPanel from './ca/ChaosAnalysisPanel.vue'
import SubAnalysisPanel from './ca/SubAnalysisPanel.vue'

const {
  COL,
  canvasRef,
  H,
  W,
  mode,
  stateCount,
  neighborhood,
  depth,
  init,
  noise,
  extraRows,
  codeValue,
  codeMax,
  showCodeControl,
  sliderLabelText,
  ruleInputValue,
  ruleLabelText,
  ruleStatusText,
  emissionInputValue,
  emissionLabelText,
  emissionStatusText,
  collisionMode,
  collisionFixed,
  energyEnabled,
  initialEnergy,
  seedInputValue,
  seedLabelText,
  seedStatusText,
  seedPlaceholder,
  heightStatusText,
  widthStatusText,
  noiseStatusText,
  legendItems,
  keyText,
  grid,
  run,
  refresh,
  continueSimulation,
  onExtraRowsInput,
  setInit,
  setMode,
  setStateCount,
  setNeighborhood,
  setDepth,
  onCodeSliderInput,
  onCodeNumberInput,
  onHeightSliderInput,
  onHeightNumberInput,
  onWidthSliderInput,
  onWidthNumberInput,
  onNoiseSliderInput,
  onNoiseNumberInput,
  onNoisePreset,
  onRuleInput,
  onLegendCellClick,
  onSeedInput,
  onRandomRule,
  onEmissionInput,
  setCollisionMode,
  setCollisionFixed,
  onCollisionFixedInput,
  setEnergyEnabled,
  onInitialEnergyInput,
  initialize,
  captureRuleSnapshot,
  applyRuleSnapshot,
  getRenderContext,
} = useCellularAutomaton()

const {
  tags,
  rules,
  activeTag,
  activeIndex,
  rulesForActiveTag,
  navStatusText,
  tagCounts,
  addTag,
  renameTag,
  deleteTag,
  closeBrowse,
  selectTag,
  tagsForRule,
  toggleTagOnRule,
  deleteRule,
  clearTag,
  next: nextTaggedRule,
  prev: prevTaggedRule,
  jumpTo,
  exportToFile,
  importFromFile,
  activeRule,
  applyAnalysisTag,
  applyOrthogonalTag,
} = useRuleTags()

const {
  running: analysisRunning,
  done: analysisDone,
  total: analysisTotal,
  progress: analysisProgress,
  currentCode: analysisCurrentCode,
  counts: analysisCounts,
  start: startAnalysis,
  stop: stopAnalysis,
} = useRuleAnalysis()

const {
  running: fieldsRunning,
  done: fieldsDone,
  total: fieldsTotal,
  progress: fieldsProgress,
  currentCode: fieldsCurrentCode,
  found: fieldsFound,
  start: startFieldsAnalysis,
  stop: stopFieldsAnalysis,
} = useRuleFieldsAnalysis()

const {
  running: glidersRunning,
  done: glidersDone,
  total: glidersTotal,
  progress: glidersProgress,
  currentCode: glidersCurrentCode,
  found: glidersFound,
  start: startGlidersAnalysis,
  stop: stopGlidersAnalysis,
} = useRuleGlidersAnalysis()

const {
  running: customRunning,
  done: customDone,
  total: customTotal,
  progress: customProgress,
  currentCode: customCurrentCode,
  found: customFound,
  start: startCustomSearch,
  stop: stopCustomSearch,
} = useRuleCustomSearchAnalysis()

const {
  running: linesRunning,
  done: linesDone,
  total: linesTotal,
  progress: linesProgress,
  currentCode: linesCurrentCode,
  found: linesFound,
  start: startLinesAnalysis,
  stop: stopLinesAnalysis,
} = useRuleLinesAnalysis()

const {
  running: chaosRunning,
  done: chaosDone,
  total: chaosTotal,
  progress: chaosProgress,
  currentCode: chaosCurrentCode,
  found: chaosFound,
  start: startChaosAnalysis,
  stop: stopChaosAnalysis,
} = useRuleChaosAnalysis()

const {
  running: subRunning,
  done: subDone,
  total: subTotal,
  progress: subProgress,
  currentName: subCurrentName,
  found: subFound,
  results: subResults,
  start: startSubAnalysis,
  stop: stopSubAnalysis,
} = useRuleSubAnalysis()

onMounted(initialize)

/** Fields that identify "the same rule" for tagging, independent of init/seed/height. */
function currentRuleParts(): RuleParts {
  return mode.value === 'totalistic'
    ? { stateCount: stateCount.value, mode: 'totalistic', code: codeValue.value, localRule: '' }
    : { stateCount: stateCount.value, mode: 'local', code: 0, localRule: ruleInputValue.value }
}

const currentRuleTags = computed(() => tagsForRule(currentRuleParts()))

function loadActiveTaggedRule(): void {
  if (activeRule.value) {
    applyRuleSnapshot(activeRule.value.snapshot)
  }
}

function onToggleTag(tagName: string): void {
  toggleTagOnRule(tagName, currentRuleParts(), captureRuleSnapshot())
}

// Result of "test current rule for tags": which tag every analysis would assign.
const tagTestResults = ref<TagTestResult[] | null>(null)

/** Reads the persisted custom-search templates (kept in sync by CustomSearchPanel). */
function loadCustomSearchPatterns(): CustomPattern[] {
  try {
    const raw = localStorage.getItem(CUSTOM_SEARCH_STORAGE_KEY)
    if (!raw) {
      return []
    }
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as CustomPattern[]) : []
  } catch {
    return []
  }
}

// Runs every analysis on the current rule and records which tags it would get.
function onTestRuleTags(): void {
  const parts = partsFromSnapshot(captureRuleSnapshot())
  tagTestResults.value = testRuleAgainstAllTags(parts, loadCustomSearchPatterns())
}

// Attaches a passed test's tag to the current rule (class tags replace the rule's
// existing class; orthogonal tags are added independently), creating it if needed.
function onApplyTestTag(result: TagTestResult): void {
  const parts = currentRuleParts()
  const snapshot = captureRuleSnapshot()
  if (result.kind === 'class') {
    applyAnalysisTag(result.tag, parts, snapshot)
  } else {
    applyOrthogonalTag(result.tag, true, parts, snapshot)
  }
}

function onBrowseTag(tagName: string): void {
  selectTag(tagName)
}

function onNextTaggedRule(): void {
  nextTaggedRule()
  loadActiveTaggedRule()
}

function onPrevTaggedRule(): void {
  prevTaggedRule()
  loadActiveTaggedRule()
}

function onJumpToTaggedRule(index: number): void {
  jumpTo(index)
  loadActiveTaggedRule()
}

function onImportFile(file: File): void {
  importFromFile(file)
}

/** Resolves the union of saved rules carrying any of the given tags into
 * classifier-ready inputs (parts + snapshot + display name). */
function rulesForTags(tagNames: string[]): AnalysisRuleInput[] {
  const selected = new Set(tagNames)
  if (!selected.size) {
    return []
  }
  return rules
    .filter((rule) => Array.isArray(rule.tags) && rule.tags.some((t) => selected.has(t)))
    .map((rule) => ({
      parts: partsFromSnapshot(rule.snapshot),
      snapshot: rule.snapshot,
      name: rule.name,
    }))
}

interface RunAnalysisPayload {
  from: number
  to: number
  width: number
  height: number
  init: AnalysisInitMode
  chaosFlux: number
  sparseFill: number
  windowFraction: number
  sourceMode: AnalysisSourceMode
  sampleCount: number
  tags: string[]
}

function onRunAnalysis({
  from,
  to,
  width,
  height,
  init: analysisInit,
  chaosFlux,
  sparseFill,
  windowFraction,
  sourceMode,
  sampleCount,
  tags: selectedTags,
}: RunAnalysisPayload): void {
  startAnalysis({
    stateCount: stateCount.value,
    mode: mode.value,
    collisionMode: collisionMode.value,
    collisionFixed: collisionFixed.value,
    from,
    to,
    width,
    height,
    init: analysisInit,
    chaosFlux,
    sparseFill,
    windowFraction,
    sourceMode,
    sampleCount,
    rules: sourceMode === 'tags' ? rulesForTags(selectedTags) : undefined,
    apply: applyAnalysisTag,
  })
}

interface RunFieldsAnalysisPayload {
  from: number
  to: number
  width: number
  height: number
  init: AnalysisInitMode
  blockWidth: number
  blockHeight: number
  minPercent: number
  sourceMode: AnalysisSourceMode
  sampleCount: number
  tags: string[]
  targetTag: string
}

// Rules tagged by the CURRENT (or most recently finished) fields run, kept so
// "undo found" can untag exactly them (with the tag that run used).
const fieldsFoundRules = ref<{ parts: RuleParts; snapshot: RuleSnapshot; tag: string }[]>([])

function onRunFieldsAnalysis({
  from,
  to,
  width,
  height,
  init: fieldsInit,
  blockWidth,
  blockHeight,
  minPercent,
  sourceMode,
  sampleCount,
  tags: selectedTags,
  targetTag,
}: RunFieldsAnalysisPayload): void {
  const tag = String(targetTag || '').trim() || FIELDS_TAG
  fieldsFoundRules.value = []
  const apply = (hasFields: boolean, parts: RuleParts, snapshot: RuleSnapshot): void => {
    if (hasFields) {
      fieldsFoundRules.value.push({ parts, snapshot, tag })
    }
    applyOrthogonalTag(tag, hasFields, parts, snapshot)
  }
  startFieldsAnalysis({
    stateCount: stateCount.value,
    mode: mode.value,
    collisionMode: collisionMode.value,
    collisionFixed: collisionFixed.value,
    from,
    to,
    width,
    height,
    init: fieldsInit,
    blockWidth,
    blockHeight,
    minPercent,
    sourceMode,
    sampleCount,
    rules: sourceMode === 'tags' ? rulesForTags(selectedTags) : undefined,
    apply,
  })
}

// Untags every rule the last completed fields run had tagged.
function onUndoFieldsFound(): void {
  for (const { parts, snapshot, tag } of fieldsFoundRules.value) {
    applyOrthogonalTag(tag, false, parts, snapshot)
  }
  fieldsFoundRules.value = []
}

// Wipes the given tag off every rule in the library, regardless of which run tagged them.
function onClearFieldsTag(tagName: string): void {
  clearTag(String(tagName || '').trim() || FIELDS_TAG)
  fieldsFoundRules.value = []
}

interface RunGlidersAnalysisPayload {
  from: number
  to: number
  width: number
  height: number
  init: AnalysisInitMode
  blockWidth: number
  blockHeight: number
  maxPeriods: number
  minShift: number
  minMatches: number
  backgroundMin: number
  spaceshipRepeats: number
  spaceshipGap: number
  spaceshipStep: number
  spaceshipDetections: number
  condition: GliderCondition
  sourceMode: AnalysisSourceMode
  sampleCount: number
  tags: string[]
  targetTag: string
}

// Rules tagged by the CURRENT (or most recently finished) gliders run, kept so
// "undo found" can untag exactly them (with the tag that run used).
const glidersFoundRules = ref<{ parts: RuleParts; snapshot: RuleSnapshot; tag: string }[]>([])

function onRunGlidersAnalysis({
  from,
  to,
  width,
  height,
  init: glidersInit,
  blockWidth,
  blockHeight,
  maxPeriods,
  minShift,
  minMatches,
  backgroundMin,
  spaceshipRepeats,
  spaceshipGap,
  spaceshipStep,
  spaceshipDetections,
  condition,
  sourceMode,
  sampleCount,
  tags: selectedTags,
  targetTag,
}: RunGlidersAnalysisPayload): void {
  const tag = String(targetTag || '').trim() || GLIDERS_TAG
  glidersFoundRules.value = []
  const apply = (hasGliders: boolean, parts: RuleParts, snapshot: RuleSnapshot): void => {
    if (hasGliders) {
      glidersFoundRules.value.push({ parts, snapshot, tag })
    }
    applyOrthogonalTag(tag, hasGliders, parts, snapshot)
  }
  startGlidersAnalysis({
    stateCount: stateCount.value,
    mode: mode.value,
    collisionMode: collisionMode.value,
    collisionFixed: collisionFixed.value,
    from,
    to,
    width,
    height,
    init: glidersInit,
    blockWidth,
    blockHeight,
    maxPeriods,
    minShift,
    minMatches,
    backgroundMin,
    spaceshipRepeats,
    spaceshipGap,
    spaceshipStep,
    spaceshipDetections,
    condition,
    sourceMode,
    sampleCount,
    rules: sourceMode === 'tags' ? rulesForTags(selectedTags) : undefined,
    apply,
  })
}

// Untags every rule the last completed gliders run had tagged.
function onUndoGlidersFound(): void {
  for (const { parts, snapshot, tag } of glidersFoundRules.value) {
    applyOrthogonalTag(tag, false, parts, snapshot)
  }
  glidersFoundRules.value = []
}

// Wipes the given tag off every rule in the library, regardless of which run tagged them.
function onClearGlidersTag(tagName: string): void {
  clearTag(String(tagName || '').trim() || GLIDERS_TAG)
  glidersFoundRules.value = []
}

interface RunCustomSearchPayload {
  from: number
  to: number
  width: number
  height: number
  init: AnalysisInitMode
  negativePatterns: CustomPattern[]
  sourceMode: AnalysisSourceMode
  sampleCount: number
  tags: string[]
  targetTag: string
}

// Rules tagged by the CURRENT (or most recently finished) custom-search run, kept
// so "undo found" can untag exactly them (with the tag that run used) without
// touching earlier runs' results.
const customSearchFoundRules = ref<{ parts: RuleParts; snapshot: RuleSnapshot; tag: string }[]>([])

function onRunCustomSearch({
  from,
  to,
  width,
  height,
  init: customInit,
  negativePatterns,
  sourceMode,
  sampleCount,
  tags: selectedTags,
  targetTag,
}: RunCustomSearchPayload): void {
  const tag = String(targetTag || '').trim() || CUSTOM_SEARCH_TAG
  customSearchFoundRules.value = []
  const apply = (passes: boolean, parts: RuleParts, snapshot: RuleSnapshot): void => {
    if (passes) {
      customSearchFoundRules.value.push({ parts, snapshot, tag })
    }
    applyOrthogonalTag(tag, passes, parts, snapshot)
  }
  startCustomSearch({
    stateCount: stateCount.value,
    mode: mode.value,
    collisionMode: collisionMode.value,
    collisionFixed: collisionFixed.value,
    from,
    to,
    width,
    height,
    init: customInit,
    negativePatterns,
    sourceMode,
    sampleCount,
    rules: sourceMode === 'tags' ? rulesForTags(selectedTags) : undefined,
    apply,
  })
}

// Untags every rule the last completed custom-search run had tagged ("undo found"),
// using the tag that run actually applied.
function onUndoCustomSearchFound(): void {
  for (const { parts, snapshot, tag } of customSearchFoundRules.value) {
    applyOrthogonalTag(tag, false, parts, snapshot)
  }
  customSearchFoundRules.value = []
}

// Wipes the given tag off every rule in the library, regardless of which run tagged them.
function onClearCustomSearchTag(tagName: string): void {
  clearTag(String(tagName || '').trim() || CUSTOM_SEARCH_TAG)
  customSearchFoundRules.value = []
}

interface RunLinesAnalysisPayload {
  from: number
  to: number
  width: number
  height: number
  init: AnalysisInitMode
  cutTop: number
  minBlock: number
  maxBlock: number
  blockStep: number
  lineCount: number
  ignoreBackground: boolean
  sourceMode: AnalysisSourceMode
  sampleCount: number
  tags: string[]
  targetTag: string
}

// Rules tagged by the CURRENT (or most recently finished) no-lines run, kept so
// "undo found" can untag exactly them (with the tag that run used).
const linesFoundRules = ref<{ parts: RuleParts; snapshot: RuleSnapshot; tag: string }[]>([])

function onRunLinesAnalysis({
  from,
  to,
  width,
  height,
  init: linesInit,
  cutTop,
  minBlock,
  maxBlock,
  blockStep,
  lineCount,
  ignoreBackground,
  sourceMode,
  sampleCount,
  tags: selectedTags,
  targetTag,
}: RunLinesAnalysisPayload): void {
  const tag = String(targetTag || '').trim() || LINES_TAG
  linesFoundRules.value = []
  const apply = (noLines: boolean, parts: RuleParts, snapshot: RuleSnapshot): void => {
    if (noLines) {
      linesFoundRules.value.push({ parts, snapshot, tag })
    }
    applyOrthogonalTag(tag, noLines, parts, snapshot)
  }
  startLinesAnalysis({
    stateCount: stateCount.value,
    mode: mode.value,
    collisionMode: collisionMode.value,
    collisionFixed: collisionFixed.value,
    from,
    to,
    width,
    height,
    init: linesInit,
    cutTop,
    minBlock,
    maxBlock,
    blockStep,
    lineCount,
    ignoreBackground,
    sourceMode,
    sampleCount,
    rules: sourceMode === 'tags' ? rulesForTags(selectedTags) : undefined,
    apply,
  })
}

// Untags every rule the last completed no-lines run had tagged.
function onUndoLinesFound(): void {
  for (const { parts, snapshot, tag } of linesFoundRules.value) {
    applyOrthogonalTag(tag, false, parts, snapshot)
  }
  linesFoundRules.value = []
}

// Wipes the given tag off every rule in the library, regardless of which run tagged them.
function onClearLinesTag(tagName: string): void {
  clearTag(String(tagName || '').trim() || LINES_TAG)
  linesFoundRules.value = []
}

interface RunChaosAnalysisPayload {
  from: number
  to: number
  width: number
  height: number
  init: AnalysisInitMode
  cutTop: number
  blockSize: number
  maxDominant: number
  sourceMode: AnalysisSourceMode
  sampleCount: number
  tags: string[]
  targetTag: string
}

// Rules tagged by the CURRENT (or most recently finished) chaos run, kept so
// "undo found" can untag exactly them (with the tag that run used).
const chaosFoundRules = ref<{ parts: RuleParts; snapshot: RuleSnapshot; tag: string }[]>([])

function onRunChaosAnalysis({
  from,
  to,
  width,
  height,
  init: chaosInit,
  cutTop,
  blockSize,
  maxDominant,
  sourceMode,
  sampleCount,
  tags: selectedTags,
  targetTag,
}: RunChaosAnalysisPayload): void {
  const tag = String(targetTag || '').trim() || CHAOS_TAG
  chaosFoundRules.value = []
  const apply = (noChaos: boolean, parts: RuleParts, snapshot: RuleSnapshot): void => {
    if (noChaos) {
      chaosFoundRules.value.push({ parts, snapshot, tag })
    }
    applyOrthogonalTag(tag, noChaos, parts, snapshot)
  }
  startChaosAnalysis({
    stateCount: stateCount.value,
    mode: mode.value,
    collisionMode: collisionMode.value,
    collisionFixed: collisionFixed.value,
    from,
    to,
    width,
    height,
    init: chaosInit,
    cutTop,
    blockSize,
    maxDominant,
    sourceMode,
    sampleCount,
    rules: sourceMode === 'tags' ? rulesForTags(selectedTags) : undefined,
    apply,
  })
}

// Untags every rule the last completed chaos run had tagged.
function onUndoChaosFound(): void {
  for (const { parts, snapshot, tag } of chaosFoundRules.value) {
    applyOrthogonalTag(tag, false, parts, snapshot)
  }
  chaosFoundRules.value = []
}

// Wipes the given tag off every rule in the library, regardless of which run tagged them.
function onClearChaosTag(tagName: string): void {
  clearTag(String(tagName || '').trim() || CHAOS_TAG)
  chaosFoundRules.value = []
}

interface RunSubAnalysisPayload {
  sourceMode: AnalysisSourceMode
  from: number
  to: number
  sampleCount: number
  tags: string[]
  init: AnalysisInitMode
  height: number
  targetTag: string
  options: SubAnalyzeOptions
}

// Rules tagged by the CURRENT (or most recently finished) sub-analysis run, kept so
// "undo found" can untag exactly them (with the tag that run used).
const subFoundRules = ref<{ parts: RuleParts; snapshot: RuleSnapshot; tag: string }[]>([])

function onRunSubAnalysis({
  sourceMode,
  from,
  to,
  sampleCount,
  tags: selectedTags,
  init: subInit,
  height,
  targetTag,
  options,
}: RunSubAnalysisPayload): void {
  const tag = String(targetTag || '').trim() || LARGE_STRUCTURES_TAG
  subFoundRules.value = []
  const apply = (hasLargeStructures: boolean, parts: RuleParts, snapshot: RuleSnapshot): void => {
    if (hasLargeStructures) {
      subFoundRules.value.push({ parts, snapshot, tag })
    }
    applyOrthogonalTag(tag, hasLargeStructures, parts, snapshot)
  }
  startSubAnalysis({
    stateCount: stateCount.value,
    mode: mode.value,
    collisionMode: collisionMode.value,
    collisionFixed: collisionFixed.value,
    sourceMode,
    from,
    to,
    sampleCount,
    init: subInit,
    height,
    rules: sourceMode === 'tags' ? rulesForTags(selectedTags) : undefined,
    options,
    apply,
  })
}

// Untags every rule the last completed sub-analysis run had tagged.
function onUndoSubFound(): void {
  for (const { parts, snapshot, tag } of subFoundRules.value) {
    applyOrthogonalTag(tag, false, parts, snapshot)
  }
  subFoundRules.value = []
}

// Wipes the given tag off every rule in the library, regardless of which run tagged them.
function onClearSubTag(tagName: string): void {
  clearTag(String(tagName || '').trim() || LARGE_STRUCTURES_TAG)
  subFoundRules.value = []
}

function onSelectSubRule(snapshot: RuleSnapshot): void {
  applyRuleSnapshot(snapshot)
}
</script>

<template>
  <div class="ca-wrap">
    <h2 class="sr-only">One-dimensional cellular automaton simulator with 2-5 states, totalistic and local rules</h2>

    <div class="ca-layout">
    <div class="ca-main">
    <div class="ca-row">

        <RuleControls
          :state-count="stateCount"
          :mode="mode"
          :neighborhood="neighborhood"
          :depth="depth"
          :code-value="codeValue"
          :code-max="codeMax"
          :show-code-control="showCodeControl"
          :slider-label-text="sliderLabelText"
          :rule-label-text="ruleLabelText"
          :rule-status-text="ruleStatusText"
          :rule-input-value="ruleInputValue"
          :emission-label-text="emissionLabelText"
          :emission-status-text="emissionStatusText"
          :emission-input-value="emissionInputValue"
          :collision-mode="collisionMode"
          :collision-fixed="collisionFixed"
          :energy-enabled="energyEnabled"
          :initial-energy="initialEnergy"
          @set-state-count="setStateCount"
          @set-mode="setMode"
          @set-neighborhood="setNeighborhood"
          @set-depth="setDepth"
          @code-slider-input="onCodeSliderInput"
          @code-number-input="onCodeNumberInput"
          @code-number-change="refresh"
          @rule-input="onRuleInput"
          @emission-input="onEmissionInput"
          @set-collision-mode="setCollisionMode"
          @collision-fixed-input="onCollisionFixedInput"
          @set-energy-enabled="setEnergyEnabled"
          @initial-energy-input="onInitialEnergyInput"
          @random-rule="onRandomRule"
          @regen="run"
        />
    </div>

    <div class="ca-row">
      <InitControls
        :init="init"
        :seed-label-text="seedLabelText"
        :seed-input-value="seedInputValue"
        :seed-status-text="seedStatusText"
        :seed-placeholder="seedPlaceholder"
        :height="H"
        :height-status-text="heightStatusText"
        :width="W"
        :width-status-text="widthStatusText"
        :noise="noise"
        :noise-status-text="noiseStatusText"
        @set-init="setInit"
        @seed-input="onSeedInput"
        @height-slider-input="onHeightSliderInput"
        @height-number-input="onHeightNumberInput"
        @height-number-change="run"
        @width-slider-input="onWidthSliderInput"
        @width-number-input="onWidthNumberInput"
        @width-number-change="run"
        @noise-slider-input="onNoiseSliderInput"
        @noise-number-input="onNoiseNumberInput"
        @noise-number-change="run"
        @noise-preset="onNoisePreset"
      />
    </div>

    <LegendPanel
      :colors="COL"
      :state-count="stateCount"
      :key-text="keyText"
      :legend-items="legendItems"
      :legend-mode-local="mode !== 'totalistic'"
      @cell-click="onLegendCellClick"
    />

    <!-- <div class="ca-canvas-scroll"> -->
      <canvas
        ref="canvasRef"
        class="ca-canvas"
        role="img"
        aria-label="Spatiotemporal diagram of the cellular automaton"
      ></canvas>
    <!-- </div> -->

    <div class="ca-row">
      <div class="ca-control">
        <label class="ca-label">Continue simulating</label>
        <div class="ca-inline">
          <input
            class="ca-number"
            type="number"
            min="1"
            max="5000"
            step="1"
            :value="extraRows"
            @input="onExtraRowsInput"
          />
          <button type="button" @click="continueSimulation">continue {{ extraRows }} generations</button>
        </div>
        <div class="ca-meter">adds generations past the last row, without restarting from the initial row</div>
      </div>
    </div>

    <div class="ca-row">
      <ViewPanel
        :grid="grid"
        :states="stateCount"
        :colors="COL"
      />
    </div>

    <div class="ca-row">
      <RenderPanel :render-context="getRenderContext" />
    </div>
    </div>

    <div class="ca-side">
    <div class="ca-row">
      <TagsPanel
        :tags="tags"
        :current-rule-tags="currentRuleTags"
        :tag-counts="tagCounts"
        :active-tag="activeTag"
        :rules-for-active-tag="rulesForActiveTag"
        :active-index="activeIndex"
        :nav-status-text="navStatusText"
        :tag-test-results="tagTestResults"
        @add-tag="addTag"
        @rename-tag="renameTag"
        @delete-tag="deleteTag"
        @toggle-tag="onToggleTag"
        @browse-tag="onBrowseTag"
        @close-browse="closeBrowse"
        @delete-rule="deleteRule"
        @next-rule="onNextTaggedRule"
        @prev-rule="onPrevTaggedRule"
        @jump-to-rule="onJumpToTaggedRule"
        @export-file="exportToFile"
        @import-file="onImportFile"
        @test-rule="onTestRuleTags"
        @apply-test-tag="onApplyTestTag"
      />
    </div>

    <div class="ca-row">
      <AnalysisPanel
        :state-count="stateCount"
        :mode="mode"
        :code-max="codeMax"
        :running="analysisRunning"
        :done="analysisDone"
        :total="analysisTotal"
        :progress="analysisProgress"
        :current-code="analysisCurrentCode"
        :counts="analysisCounts"
        :tags="tags"
        :tag-counts="tagCounts"
        :rules="rules"
        @run="onRunAnalysis"
        @stop="stopAnalysis"
      />
    </div>

    <div class="ca-row">
      <FieldsAnalysisPanel
        :state-count="stateCount"
        :mode="mode"
        :code-max="codeMax"
        :running="fieldsRunning"
        :done="fieldsDone"
        :total="fieldsTotal"
        :progress="fieldsProgress"
        :current-code="fieldsCurrentCode"
        :found="fieldsFound"
        :can-undo-found="fieldsFoundRules.length > 0"
        :tags="tags"
        :tag-counts="tagCounts"
        :rules="rules"
        @run="onRunFieldsAnalysis"
        @stop="stopFieldsAnalysis"
        @undo-found="onUndoFieldsFound"
        @clear-tag="onClearFieldsTag"
      />
    </div>

    <div class="ca-row">
      <GlidersAnalysisPanel
        :state-count="stateCount"
        :mode="mode"
        :code-max="codeMax"
        :running="glidersRunning"
        :done="glidersDone"
        :total="glidersTotal"
        :progress="glidersProgress"
        :current-code="glidersCurrentCode"
        :found="glidersFound"
        :can-undo-found="glidersFoundRules.length > 0"
        :tags="tags"
        :tag-counts="tagCounts"
        :rules="rules"
        @run="onRunGlidersAnalysis"
        @stop="stopGlidersAnalysis"
        @undo-found="onUndoGlidersFound"
        @clear-tag="onClearGlidersTag"
      />
    </div>

    <div class="ca-row">
      <CustomSearchPanel
        :state-count="stateCount"
        :mode="mode"
        :code-max="codeMax"
        :running="customRunning"
        :done="customDone"
        :total="customTotal"
        :progress="customProgress"
        :current-code="customCurrentCode"
        :found="customFound"
        :can-undo-found="customSearchFoundRules.length > 0"
        :tags="tags"
        :tag-counts="tagCounts"
        :rules="rules"
        @run="onRunCustomSearch"
        @stop="stopCustomSearch"
        @undo-found="onUndoCustomSearchFound"
        @clear-tag="onClearCustomSearchTag"
      />
    </div>

    <div class="ca-row">
      <LinesAnalysisPanel
        :state-count="stateCount"
        :mode="mode"
        :code-max="codeMax"
        :running="linesRunning"
        :done="linesDone"
        :total="linesTotal"
        :progress="linesProgress"
        :current-code="linesCurrentCode"
        :found="linesFound"
        :can-undo-found="linesFoundRules.length > 0"
        :tags="tags"
        :tag-counts="tagCounts"
        :rules="rules"
        @run="onRunLinesAnalysis"
        @stop="stopLinesAnalysis"
        @undo-found="onUndoLinesFound"
        @clear-tag="onClearLinesTag"
      />
    </div>

    <div class="ca-row">
      <ChaosAnalysisPanel
        :state-count="stateCount"
        :mode="mode"
        :code-max="codeMax"
        :running="chaosRunning"
        :done="chaosDone"
        :total="chaosTotal"
        :progress="chaosProgress"
        :current-code="chaosCurrentCode"
        :found="chaosFound"
        :can-undo-found="chaosFoundRules.length > 0"
        :tags="tags"
        :tag-counts="tagCounts"
        :rules="rules"
        @run="onRunChaosAnalysis"
        @stop="stopChaosAnalysis"
        @undo-found="onUndoChaosFound"
        @clear-tag="onClearChaosTag"
      />
    </div>

    <div class="ca-row">
      <SubAnalysisPanel
        :state-count="stateCount"
        :mode="mode"
        :code-max="codeMax"
        :tags="tags"
        :tag-counts="tagCounts"
        :rules="rules"
        :running="subRunning"
        :done="subDone"
        :total="subTotal"
        :progress="subProgress"
        :current-code="0"
        :current-name="subCurrentName"
        :found="subFound"
        :can-undo-found="subFoundRules.length > 0"
        :results="subResults"
        @run="onRunSubAnalysis"
        @stop="stopSubAnalysis"
        @select-rule="onSelectSubRule"
        @undo-found="onUndoSubFound"
        @clear-tag="onClearSubTag"
      />
    </div>
    </div>
    </div>
  </div>
</template>
