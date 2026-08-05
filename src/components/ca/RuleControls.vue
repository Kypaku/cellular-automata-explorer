<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { MAX_STATE_COUNT, SAFE_STATE_COUNT } from '../../utils/caMath'
import RuleJsonPanel from './RuleJsonPanel.vue'

const props = defineProps<{
  stateCount: number
  mode: string
  neighborhood: number
  depth: number
  codeValue: number
  codeMax: number
  showCodeControl: boolean
  canConvertToTemplate: boolean
  sliderLabelText: string
  ruleLabelText: string
  ruleStatusText: string
  ruleInputValue: string
  /** Templates whose output is drawn at random: neighborhood index → the state digits to pick from. */
  stochasticOptions: Record<string, string> | null
  emissionLabelText: string
  emissionStatusText: string
  emissionInputValue: string
  collisionMode: string
  collisionFixed: number
  energyEnabled: boolean
  initialEnergy: number
}>()

const ruleMaxLength = computed(() => Math.pow(props.stateCount, props.neighborhood * Math.max(1, props.depth)))
const emissionMaxLength = computed(() => 3 * (props.stateCount - 1))
const maxFixed = computed(() => props.stateCount - 1)
const experimentalStates = computed(() => props.stateCount > SAFE_STATE_COUNT)

// The custom state-count input is only needed rarely (beyond the 2-5
// preset buttons), so it stays hidden behind a toggle by default - it
// auto-opens when the current rule already uses a custom count so it's
// never hidden while active.
const customStatesOpen = ref(props.stateCount > SAFE_STATE_COUNT)

watch(
  () => props.stateCount,
  (value) => {
    if (value > SAFE_STATE_COUNT) {
      customStatesOpen.value = true
    }
  },
)

/**
 * Applies the free-form state count input. Fired on `change` (not `input`) so
 * a half-typed number never resets the whole rule.
 */
function onCustomStateCount(event: Event): void {
  const raw = (event.target as HTMLInputElement).value
  const value = parseInt(raw, 10)
  if (isNaN(value)) {
    return
  }
  emit('set-state-count', Math.max(2, Math.min(MAX_STATE_COUNT, value)))
}

const emit = defineEmits([
  'set-state-count',
  'set-mode',
  'set-neighborhood',
  'set-depth',
  'code-slider-input',
  'code-number-input',
  'code-number-change',
  'rule-input',
  'apply-rule-json',
  'convert-to-template',
  'emission-input',
  'set-collision-mode',
  'collision-fixed-input',
  'set-energy-enabled',
  'initial-energy-input',
  'random-rule',
  'regen',
])
</script>

<template>
  <div class="ca-block">
    <h3 class="ca-block-title">Rule Controls</h3>

    <div class="ca-fields">
      <div class="ca-field">
        <span class="ca-label">States</span>
        <span class="ca-seg">
          <button type="button" :class="{ on: stateCount === 2 }" @click="emit('set-state-count', 2)">2 colors</button>
          <button type="button" :class="{ on: stateCount === 3 }" @click="emit('set-state-count', 3)">3 colors</button>
          <button type="button" :class="{ on: stateCount === 4 }" @click="emit('set-state-count', 4)">4 colors</button>
          <button type="button" :class="{ on: stateCount === 5 }" @click="emit('set-state-count', 5)">5 colors</button>
        </span>
        <button type="button" class="ca-link-btn" @click="customStatesOpen = !customStatesOpen">
          {{ customStatesOpen ? 'hide custom count' : 'custom count…' }}
        </button>
        <input
          v-if="customStatesOpen"
          class="ca-number ca-number--sm"
          type="number"
          min="2"
          :max="MAX_STATE_COUNT"
          step="1"
          :value="stateCount"
          :title="`custom number of states (2-${MAX_STATE_COUNT}); more than ${SAFE_STATE_COUNT} is experimental`"
          @change="onCustomStateCount"
        />
      </div>

      <div class="ca-field" v-if="experimentalStates && customStatesOpen">
        <span class="ca-meter">
          {{ stateCount }} states is experimental: rule spaces explode, colours past 5 are generated
          automatically and states 10+ are written as letters (a, b, c …). Use at your own risk.
        </span>
      </div>

      <RuleJsonPanel
        v-if="mode !== 'descendants'"
        :state-count="stateCount"
        :neighborhood="neighborhood"
        :depth="depth"
        :local-rule="ruleInputValue"
        :stochastic-options="stochasticOptions"
        @apply="emit('apply-rule-json', $event)"
      />

      <div class="ca-field">
        <span class="ca-label">Rule</span>
        <span class="ca-seg">
          <button type="button" :class="{ on: mode === 'totalistic' }" @click="emit('set-mode', 'totalistic')">totalistic</button>
          <button type="button" :class="{ on: mode === 'local' }" @click="emit('set-mode', 'local')">by templates</button>
          <button type="button" :class="{ on: mode === 'descendants' }" @click="emit('set-mode', 'descendants')">by descendants</button>
        </span>
      </div>

      <template v-if="mode !== 'descendants'">
        <div class="ca-field">
          <span class="ca-label">Neighborhood</span>
          <span class="ca-seg">
            <button type="button" :class="{ on: neighborhood === 3 }" @click="emit('set-neighborhood', 3)">3 cells</button>
            <button type="button" :class="{ on: neighborhood === 5 }" @click="emit('set-neighborhood', 5)">5 cells</button>
            <button type="button" :class="{ on: neighborhood === 7 }" @click="emit('set-neighborhood', 7)">7 cells</button>
          </span>
        </div>

        <div class="ca-field">
          <span class="ca-label">Previous rows</span>
          <input
            class="ca-number ca-number--sm"
            type="number"
            min="1"
            max="8"
            step="1"
            :value="depth"
            title="how many previous rows the rule depends on (1 = classic)"
            @input="emit('set-depth', ($event.target as HTMLInputElement).value)"
          />
        </div>
      </template>
    </div>

    <div class="ca-panel mt-2">
      <div class="ca-control" v-if="showCodeControl">
        <label class="ca-label">{{ sliderLabelText }}</label>
        <div class="ca-inline">
          <input
            class="ca-slider"
            type="range"
            min="0"
            :max="codeMax"
            step="1"
            :value="codeValue"
            @input="emit('code-slider-input', $event)"
          />
          <input
            class="ca-number"
            type="number"
            min="0"
            :max="codeMax"
            step="1"
            :value="codeValue"
            @input="emit('code-number-input', $event)"
            @change="emit('code-number-change')"
          />
          <span class="ca-out">{{ codeValue }}</span>
        </div>
      </div>

      <div class="ca-control" v-if="mode === 'totalistic'">
        <button
          type="button"
          :disabled="!canConvertToTemplate"
          title="expand this totalistic rule into an equivalent per-neighborhood template rule and switch to 'by templates' mode"
          @click="emit('convert-to-template')"
        >
          convert to templates
        </button>
        <div class="ca-meter">
          <template v-if="canConvertToTemplate">
            Rewrites the current totalistic rule as an equivalent template rule ({{ ruleMaxLength }} neighborhoods),
            so each neighborhood can be edited on its own. Replaces the template rule stored for {{ stateCount }} states.
          </template>
          <template v-else>
            The template table for this combination of states, neighborhood and previous rows is too large to expand.
          </template>
        </div>
      </div>

      <div class="ca-control" v-if="mode === 'local'">
        <label class="ca-label">{{ ruleLabelText }}</label>
        <input
          class="ca-input"
          type="text"
          inputmode="numeric"
          :maxlength="ruleMaxLength"
          spellcheck="false"
          :value="ruleInputValue"
          @input="emit('rule-input', $event)"
        />
        <div class="ca-meter">{{ ruleStatusText }}</div>
      </div>

      <template v-if="mode === 'descendants'">
        <div class="ca-control">
          <label class="ca-label">{{ emissionLabelText }}</label>
          <input
            class="ca-input"
            type="text"
            inputmode="numeric"
            :maxlength="emissionMaxLength"
            spellcheck="false"
            :value="emissionInputValue"
            @input="emit('emission-input', $event)"
          />
          <div class="ca-meter">{{ emissionStatusText }}</div>
        </div>
        <div class="ca-control">
          <label class="ca-label">Collision: how 2+ signals landing on one cell are merged</label>
          <div class="ca-inline">
            <span class="ca-seg">
              <button type="button" :class="{ on: collisionMode === 'sum' }" @click="emit('set-collision-mode', 'sum')">sum mod {{ stateCount }}</button>
              <button type="button" :class="{ on: collisionMode === 'random' }" @click="emit('set-collision-mode', 'random')">random</button>
              <button type="button" :class="{ on: collisionMode === 'fixed' }" @click="emit('set-collision-mode', 'fixed')">fixed</button>
            </span>
            <input
              v-if="collisionMode === 'fixed'"
              class="ca-number ca-number--sm"
              type="number"
              min="0"
              :max="maxFixed"
              step="1"
              :value="collisionFixed"
              @input="emit('collision-fixed-input', $event)"
            />
          </div>
        </div>
        <div class="ca-control">
          <label class="ca-label ca-check">
            <input
              type="checkbox"
              :checked="energyEnabled"
              @change="emit('set-energy-enabled', ($event.target as HTMLInputElement).checked)"
            />
            energy: each live cell carries energy, split among its descendants and conserved per generation
          </label>
        </div>
        <div class="ca-control" v-if="energyEnabled">
          <label class="ca-label">Initial energy per live cell</label>
          <input
            class="ca-number"
            type="number"
            min="1"
            step="1"
            :value="initialEnergy"
            @input="emit('initial-energy-input', $event)"
          />
          <div class="ca-meter">brightness shows how much energy a cell holds (relative to the peak)</div>
        </div>
      </template>
    </div>

    <div class="ca-actions">
      <button type="button" @click="emit('random-rule')">random rule</button>
      <button type="button" @click="emit('regen')">reset</button>
    </div>
  </div>
</template>
