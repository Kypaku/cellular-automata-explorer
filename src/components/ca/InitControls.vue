<script setup lang="ts">
defineProps<{
  init: string
  seedLabelText: string
  seedInputValue: string
  seedStatusText: string
  seedPlaceholder: string
  height: number
  heightStatusText: string
  width: number
  widthStatusText: string
  noise: number
  noiseStatusText: string
}>()

const emit = defineEmits([
  'set-init',
  'seed-input',
  'height-slider-input',
  'height-number-input',
  'height-number-change',
  'width-slider-input',
  'width-number-input',
  'width-number-change',
  'noise-slider-input',
  'noise-number-input',
  'noise-number-change',
  'noise-preset',
])
</script>

<template>
  <div class="ca-block">
    <h3 class="ca-block-title">Initial Conditions</h3>

    <div class="ca-fields">
      <div class="ca-field">
        <span class="ca-label">Start</span>
        <span class="ca-seg">
          <button type="button" :class="{ on: init === 'single' }" @click="emit('set-init', 'single')">single cell</button>
          <button type="button" :class="{ on: init === 'random' }" @click="emit('set-init', 'random')">random</button>
          <button type="button" :class="{ on: init === 'custom' }" @click="emit('set-init', 'custom')">custom field</button>
        </span>
      </div>
    </div>

    <div class="ca-panel mt-2">
      <div class="ca-control ca-control--wide" v-if="init === 'custom'">
        <label class="ca-label">{{ seedLabelText }}</label>
        <input
          class="ca-input"
          type="text"
          inputmode="numeric"
          maxlength="201"
          spellcheck="false"
          :placeholder="seedPlaceholder"
          :value="seedInputValue"
          @input="emit('seed-input', $event)"
        />
        <div class="ca-meter">{{ seedStatusText }}</div>
      </div>

      <div class="ca-control">
        <label class="ca-label">Generation height</label>
        <div class="ca-inline">
          <input
            class="ca-slider"
            type="range"
            min="40"
            max="640"
            step="1"
            :value="height"
            @input="emit('height-slider-input', $event)"
          />
          <input
            class="ca-number"
            type="number"
            min="40"
            step="1"
            :value="height"
            @input="emit('height-number-input', $event)"
            @change="emit('height-number-change')"
          />
        </div>
        <div class="ca-meter">{{ heightStatusText }}</div>
      </div>

      <div class="ca-control">
        <label class="ca-label">Generation width</label>
        <div class="ca-inline">
          <input
            class="ca-slider"
            type="range"
            min="11"
            max="801"
            step="2"
            :value="width"
            @input="emit('width-slider-input', $event)"
          />
          <input
            class="ca-number"
            type="number"
            min="11"
            max="801"
            step="2"
            :value="width"
            @input="emit('width-number-input', $event)"
            @change="emit('width-number-change')"
          />
        </div>
        <div class="ca-meter">{{ widthStatusText }}</div>
      </div>

      <div class="ca-control">
        <label class="ca-label">Noise probability (against the rule)</label>
        <div class="ca-inline">
          <input
            class="ca-slider"
            type="range"
            min="0"
            max="1"
            step="0.001"
            :value="noise"
            @input="emit('noise-slider-input', $event)"
          />
          <input
            class="ca-number"
            type="number"
            min="0"
            max="1"
            step="0.001"
            :value="noise"
            @input="emit('noise-number-input', $event)"
            @change="emit('noise-number-change')"
          />
          <span class="ca-out">{{ noise }}%</span>
        </div>
        <span class="ca-seg">
          <button type="button" :class="{ on: noise === 0.1 }" @click="emit('noise-preset', 0.1)">0.1%</button>
          <button type="button" :class="{ on: noise === 0.01 }" @click="emit('noise-preset', 0.01)">0.01%</button>
          <button type="button" :class="{ on: noise === 0.001 }" @click="emit('noise-preset', 0.001)">0.001%</button>
        </span>
        <div class="ca-meter">{{ noiseStatusText }}</div>
      </div>
    </div>
  </div>
</template>
