<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  stateCount: number
  mode: string
  neighborhood: number
  depth: number
  codeValue: number
  codeMax: number
  showCodeControl: boolean
  sliderLabelText: string
  ruleLabelText: string
  ruleStatusText: string
  ruleInputValue: string
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

const emit = defineEmits([
  'set-state-count',
  'set-mode',
  'set-neighborhood',
  'set-depth',
  'code-slider-input',
  'code-number-input',
  'code-number-change',
  'rule-input',
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
  <div>
    <div>
      <h3>Rule Controls</h3>
    </div>

    <div>
      <span class="ca-label mr-1">States</span>
      <span class="ca-seg">
        <button type="button" :class="{ on: stateCount === 2 }" @click="emit('set-state-count', 2)">2 colors</button>
        <button type="button" :class="{ on: stateCount === 3 }" @click="emit('set-state-count', 3)">3 colors</button>
        <button type="button" :class="{ on: stateCount === 4 }" @click="emit('set-state-count', 4)">4 colors</button>
        <button type="button" :class="{ on: stateCount === 5 }" @click="emit('set-state-count', 5)">5 colors</button>
      </span>
    
      <span class="ca-label ml-4 mr-1">Rule</span>
      <span class="ca-seg">
        <button type="button" :class="{ on: mode === 'totalistic' }" @click="emit('set-mode', 'totalistic')">totalistic</button>
        <button type="button" :class="{ on: mode === 'local' }" @click="emit('set-mode', 'local')">by templates</button>
        <button type="button" :class="{ on: mode === 'descendants' }" @click="emit('set-mode', 'descendants')">by descendants</button>
      </span>

      <template v-if="mode !== 'descendants'">
        <span class="ca-label ml-4 mr-1">Neighborhood</span>
        <span class="ca-seg">
          <button type="button" :class="{ on: neighborhood === 3 }" @click="emit('set-neighborhood', 3)">3 cells</button>
          <button type="button" :class="{ on: neighborhood === 5 }" @click="emit('set-neighborhood', 5)">5 cells</button>
          <button type="button" :class="{ on: neighborhood === 7 }" @click="emit('set-neighborhood', 7)">7 cells</button>
        </span>

        <span class="ca-label ml-4 mr-1">Previous rows</span>
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
      </template>
    
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
    
      <button type="button" @click="emit('random-rule')">random rule</button>
      <button type="button" @click="emit('regen')">reset</button>
    </div>
  </div>
</template>
