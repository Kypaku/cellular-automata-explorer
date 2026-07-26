<script setup lang="ts">
import { computed, onMounted, ref, unref } from 'vue'
import '../assets/cellular-automaton.css'
import { useCellularAutomaton } from '../composables/useCellularAutomaton'
import { useRuleTags } from '../composables/useRuleTags'
import { useRuleAnalysis } from '../composables/useRuleAnalysis'
import { useRuleFieldsAnalysis } from '../composables/useRuleFieldsAnalysis'
import { useRuleGlidersAnalysis } from '../composables/useRuleGlidersAnalysis'
import { useRuleCustomSearchAnalysis } from '../composables/useRuleCustomSearchAnalysis'
import { useRuleLinesAnalysis } from '../composables/useRuleLinesAnalysis'
import { useRuleChaosAnalysis } from '../composables/useRuleChaosAnalysis'
import { useRuleChaos2Analysis } from '../composables/useRuleChaos2Analysis'
import { useRuleAllStatesAnalysis } from '../composables/useRuleAllStatesAnalysis'
import { useRuleSubAnalysis } from '../composables/useRuleSubAnalysis'
import { useTagInteractions } from '../composables/useTagInteractions'
import { useAnalysisRunners } from '../composables/useAnalysisRunners'
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
import Chaos2AnalysisPanel from './ca/Chaos2AnalysisPanel.vue'
import AllStatesAnalysisPanel from './ca/AllStatesAnalysisPanel.vue'
import SubAnalysisPanel from './ca/SubAnalysisPanel.vue'

const ca = useCellularAutomaton()
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
  onCollisionFixedInput,
  setEnergyEnabled,
  onInitialEnergyInput,
  initialize,
  captureRuleSnapshot,
  applyRuleSnapshot,
  getRenderContext,
} = ca

const tagsApi = useRuleTags()
const { tags, rules, activeTag, activeIndex, rulesForActiveTag, navStatusText, tagCounts, addTag, renameTag, deleteTag, closeBrowse, deleteRule, exportToFile } = tagsApi

const analysisApi = useRuleAnalysis()
const { running: analysisRunning, done: analysisDone, total: analysisTotal, progress: analysisProgress, currentCode: analysisCurrentCode, counts: analysisCounts, stop: stopAnalysis } = analysisApi

const fieldsApi = useRuleFieldsAnalysis()
const { running: fieldsRunning, done: fieldsDone, total: fieldsTotal, progress: fieldsProgress, currentCode: fieldsCurrentCode, found: fieldsFound, stop: stopFieldsAnalysis } = fieldsApi

const glidersApi = useRuleGlidersAnalysis()
const { running: glidersRunning, done: glidersDone, total: glidersTotal, progress: glidersProgress, currentCode: glidersCurrentCode, found: glidersFound, stop: stopGlidersAnalysis } = glidersApi

const customSearchApi = useRuleCustomSearchAnalysis()
const { running: customRunning, done: customDone, total: customTotal, progress: customProgress, currentCode: customCurrentCode, found: customFound, stop: stopCustomSearch } = customSearchApi

const linesApi = useRuleLinesAnalysis()
const { running: linesRunning, done: linesDone, total: linesTotal, progress: linesProgress, currentCode: linesCurrentCode, found: linesFound, stop: stopLinesAnalysis } = linesApi

const chaosApi = useRuleChaosAnalysis()
const { running: chaosRunning, done: chaosDone, total: chaosTotal, progress: chaosProgress, currentCode: chaosCurrentCode, found: chaosFound, stop: stopChaosAnalysis } = chaosApi

const chaos2Api = useRuleChaos2Analysis()
const { running: chaos2Running, done: chaos2Done, total: chaos2Total, progress: chaos2Progress, currentCode: chaos2CurrentCode, found: chaos2Found, stop: stopChaos2Analysis } = chaos2Api

const allStatesApi = useRuleAllStatesAnalysis()
const { running: allStatesRunning, done: allStatesDone, total: allStatesTotal, progress: allStatesProgress, currentCode: allStatesCurrentCode, found: allStatesFound, stop: stopAllStatesAnalysis } = allStatesApi

const subApi = useRuleSubAnalysis()
const { running: subRunning, done: subDone, total: subTotal, progress: subProgress, currentName: subCurrentName, found: subFound, results: subResults, stop: stopSubAnalysis } = subApi

onMounted(initialize)

type SideTab = 'controls' | 'tags'
const activeSideTab = ref<SideTab>('controls')

/* Where the rule + initial-conditions blocks live: 'side' = in the tabbed side
   column (default), 'main' = the original full-width spot above the diagram. */
type ControlsPlacement = 'side' | 'main'
const CONTROLS_PLACEMENT_KEY = 'ca-controls-placement'

function readPlacement(): ControlsPlacement {
  try {
    return localStorage.getItem(CONTROLS_PLACEMENT_KEY) === 'main' ? 'main' : 'side'
  } catch {
    return 'side'
  }
}

const controlsPlacement = ref<ControlsPlacement>(readPlacement())
const controlsInSide = computed(() => controlsPlacement.value === 'side')

function toggleControlsPlacement() {
  const next: ControlsPlacement = controlsPlacement.value === 'side' ? 'main' : 'side'
  controlsPlacement.value = next
  activeSideTab.value = next === 'side' ? 'controls' : 'tags'
  try {
    localStorage.setItem(CONTROLS_PLACEMENT_KEY, next)
  } catch {
    /* storage unavailable - placement just won't persist */
  }
}

/* Bound in two possible places, so keep the (long) binding lists in one spot. */
const ruleControlsProps = computed(() => ({
  stateCount: unref(stateCount),
  mode: unref(mode),
  neighborhood: unref(neighborhood),
  depth: unref(depth),
  codeValue: unref(codeValue),
  codeMax: unref(codeMax),
  showCodeControl: unref(showCodeControl),
  sliderLabelText: unref(sliderLabelText),
  ruleLabelText: unref(ruleLabelText),
  ruleStatusText: unref(ruleStatusText),
  ruleInputValue: unref(ruleInputValue),
  emissionLabelText: unref(emissionLabelText),
  emissionStatusText: unref(emissionStatusText),
  emissionInputValue: unref(emissionInputValue),
  collisionMode: unref(collisionMode),
  collisionFixed: unref(collisionFixed),
  energyEnabled: unref(energyEnabled),
  initialEnergy: unref(initialEnergy),
}))

const ruleControlsHandlers = {
  setStateCount,
  setMode,
  setNeighborhood,
  setDepth,
  codeSliderInput: onCodeSliderInput,
  codeNumberInput: onCodeNumberInput,
  codeNumberChange: refresh,
  ruleInput: onRuleInput,
  emissionInput: onEmissionInput,
  setCollisionMode,
  collisionFixedInput: onCollisionFixedInput,
  setEnergyEnabled,
  initialEnergyInput: onInitialEnergyInput,
  randomRule: onRandomRule,
  regen: run,
}

const initControlsProps = computed(() => ({
  init: unref(init),
  seedLabelText: unref(seedLabelText),
  seedInputValue: unref(seedInputValue),
  seedStatusText: unref(seedStatusText),
  seedPlaceholder: unref(seedPlaceholder),
  height: unref(H),
  heightStatusText: unref(heightStatusText),
  width: unref(W),
  widthStatusText: unref(widthStatusText),
  noise: unref(noise),
  noiseStatusText: unref(noiseStatusText),
}))

const initControlsHandlers = {
  setInit,
  seedInput: onSeedInput,
  heightSliderInput: onHeightSliderInput,
  heightNumberInput: onHeightNumberInput,
  heightNumberChange: run,
  widthSliderInput: onWidthSliderInput,
  widthNumberInput: onWidthNumberInput,
  widthNumberChange: run,
  noiseSliderInput: onNoiseSliderInput,
  noiseNumberInput: onNoiseNumberInput,
  noiseNumberChange: run,
  noisePreset: onNoisePreset,
}

const {
  currentRuleTags,
  onToggleTag,
  tagTestResults,
  onTestRuleTags,
  onApplyTestTag,
  onBrowseTag,
  onNextTaggedRule,
  onPrevTaggedRule,
  onJumpToTaggedRule,
  onImportFile,
} = useTagInteractions({ mode, stateCount, codeValue, ruleInputValue, captureRuleSnapshot, applyRuleSnapshot, tags: tagsApi })

const {
  onRunAnalysis,
  onRunFieldsAnalysis,
  onUndoFieldsFound,
  onClearFieldsTag,
  fieldsFoundRules,
  onRunGlidersAnalysis,
  onUndoGlidersFound,
  onClearGlidersTag,
  glidersFoundRules,
  onRunCustomSearch,
  onUndoCustomSearchFound,
  onClearCustomSearchTag,
  customSearchFoundRules,
  onRunLinesAnalysis,
  onUndoLinesFound,
  onClearLinesTag,
  linesFoundRules,
  onRunChaosAnalysis,
  onUndoChaosFound,
  onClearChaosTag,
  chaosFoundRules,
  onRunChaos2Analysis,
  onUndoChaos2Found,
  onClearChaos2Tag,
  chaos2FoundRules,
  onRunAllStatesAnalysis,
  onUndoAllStatesFound,
  onClearAllStatesTag,
  allStatesFoundRules,
  onRunSubAnalysis,
  onUndoSubFound,
  onClearSubTag,
  subFoundRules,
  onSelectSubRule,
} = useAnalysisRunners({
  stateCount,
  mode,
  neighborhood,
  depth,
  collisionMode,
  collisionFixed,
  applyRuleSnapshot,
  tags: tagsApi,
  analysis: analysisApi,
  fields: fieldsApi,
  gliders: glidersApi,
  customSearch: customSearchApi,
  lines: linesApi,
  chaos: chaosApi,
  chaos2: chaos2Api,
  allStates: allStatesApi,
  sub: subApi,
})
</script>

<template>
  <div class="ca-wrap">
    <h2 class="sr-only">One-dimensional cellular automaton simulator with 2-5 states, totalistic and local rules</h2>

    <div class="ca-layout">
    <div class="ca-main">

    <template v-if="!controlsInSide">
      <div class="ca-row">
        <RuleControls v-bind="ruleControlsProps" v-on="ruleControlsHandlers" />
      </div>
      <div class="ca-row">
        <InitControls v-bind="initControlsProps" v-on="initControlsHandlers" />
      </div>
    </template>

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
    <div class="ca-tabs" role="tablist">
      <template v-if="controlsInSide">
        <button
          type="button"
          role="tab"
          class="ca-tab"
          :class="{ 'ca-tab--active': activeSideTab === 'controls' }"
          :aria-selected="activeSideTab === 'controls'"
          @click="activeSideTab = 'controls'"
        >Rule &amp; initial conditions</button>
        <button
          type="button"
          role="tab"
          class="ca-tab"
          :class="{ 'ca-tab--active': activeSideTab === 'tags' }"
          :aria-selected="activeSideTab === 'tags'"
          @click="activeSideTab = 'tags'"
        >Tags &amp; analysis</button>
      </template>
      <span v-else class="ca-tab ca-tab--active ca-tab--static">Tags &amp; analysis</span>
      <button
        type="button"
        class="ca-tab ca-layout-toggle"
        :title="controlsInSide
          ? 'Move the rule and initial-conditions blocks back above the diagram'
          : 'Move the rule and initial-conditions blocks into the side tabs'"
        @click="toggleControlsPlacement"
      >{{ controlsInSide ? 'old layout' : 'tabbed layout' }}</button>
    </div>

    <div v-if="controlsInSide" v-show="activeSideTab === 'controls'" class="ca-tab-panel ca-controls-tab" role="tabpanel">
      <RuleControls v-bind="ruleControlsProps" v-on="ruleControlsHandlers" />
      <InitControls v-bind="initControlsProps" v-on="initControlsHandlers" />
    </div>

    <div v-show="!controlsInSide || activeSideTab === 'tags'" class="ca-tab-panel" role="tabpanel">
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
      <Chaos2AnalysisPanel
        :state-count="stateCount"
        :mode="mode"
        :code-max="codeMax"
        :running="chaos2Running"
        :done="chaos2Done"
        :total="chaos2Total"
        :progress="chaos2Progress"
        :current-code="chaos2CurrentCode"
        :found="chaos2Found"
        :can-undo-found="chaos2FoundRules.length > 0"
        :tags="tags"
        :tag-counts="tagCounts"
        :rules="rules"
        @run="onRunChaos2Analysis"
        @stop="stopChaos2Analysis"
        @undo-found="onUndoChaos2Found"
        @clear-tag="onClearChaos2Tag"
      />
    </div>

    <div class="ca-row">
      <AllStatesAnalysisPanel
        :state-count="stateCount"
        :mode="mode"
        :code-max="codeMax"
        :running="allStatesRunning"
        :done="allStatesDone"
        :total="allStatesTotal"
        :progress="allStatesProgress"
        :current-code="allStatesCurrentCode"
        :found="allStatesFound"
        :can-undo-found="allStatesFoundRules.length > 0"
        :tags="tags"
        :tag-counts="tagCounts"
        :rules="rules"
        @run="onRunAllStatesAnalysis"
        @stop="stopAllStatesAnalysis"
        @undo-found="onUndoAllStatesFound"
        @clear-tag="onClearAllStatesTag"
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
  </div>
</template>
