<script setup lang="ts">
import { ref, computed, onBeforeUnmount } from 'vue'
import { MAX_PREVIEW_SIDE, outputSize, renderDiagramToPngBlob } from '../../utils/caLargeRender'
import type { RenderContext } from '../../utils/caLargeRender'

// The interactive canvas paints 3 canvas px per cell with per-cell fillRect
// calls and is bound by the browser's canvas size cap. This panel bypasses the
// canvas entirely: it evolves the current rule row by row and encodes a PNG
// directly (deflate via CompressionStream), so the only ceiling is memory —
// 10000×10000 fields become a single downloadable PNG. It also supports
// down-scaling (N cells → 1 pixel) so huge fields fit in a small image. The
// interactive diagram above is left untouched.
const props = defineProps<{
  renderContext: () => RenderContext
}>()

const width = ref(2000)
const height = ref(2000)
const cellSize = ref(1)
// false: cellSize pixels per cell (enlarge). true: cellSize cells per pixel (shrink).
const downscale = ref(false)

const generating = ref(false)
const statusText = ref('')
const errorText = ref('')
const imageUrl = ref('')
const imageInfo = ref('')
const generatedRuleLabel = ref('')

function clampInt(value: number, min: number, max: number, fallback: number): number {
  const num = Math.floor(Number(value))
  if (Number.isNaN(num)) {
    return fallback
  }
  return Math.max(min, Math.min(max, num))
}

const out = computed(() =>
  outputSize(
    clampInt(width.value, 1, 1000000, 1),
    clampInt(height.value, 1, 1000000, 1),
    clampInt(cellSize.value, 1, 64, 1),
    downscale.value
  )
)
// Only relevant to the inline preview: past this a browser can't decode the
// <img>, though the downloaded PNG file is still perfectly valid.
const previewTooBig = computed(() => out.value.outWidth > MAX_PREVIEW_SIDE || out.value.outHeight > MAX_PREVIEW_SIDE)
const showPreview = computed(() => Boolean(imageUrl.value) && !previewTooBig.value)

const sizeHint = computed(() => {
  const { outWidth, outHeight } = out.value
  return `output image: ${outWidth}×${outHeight} px (${((outWidth * outHeight) / 1e6).toFixed(1)} Mpx)`
})

const scaleCaption = computed(() => (downscale.value ? 'cells per pixel' : 'pixels per cell'))

function revokeImage(): void {
  if (imageUrl.value) {
    URL.revokeObjectURL(imageUrl.value)
    imageUrl.value = ''
  }
}

async function generate(): Promise<void> {
  if (generating.value) {
    return
  }
  errorText.value = ''
  const w = clampInt(width.value, 1, 1000000, 2000)
  const h = clampInt(height.value, 1, 1000000, 2000)
  const cs = clampInt(cellSize.value, 1, 64, 1)
  width.value = w
  height.value = h
  cellSize.value = cs

  generating.value = true
  statusText.value = 'generating…'
  // Yield once so the "generating…" status paints before the blocking evolve.
  await new Promise((resolve) => requestAnimationFrame(() => resolve(null)))

  try {
    const context = props.renderContext()
    const blob = await renderDiagramToPngBlob({
      width: w,
      height: h,
      config: context.config,
      mode: context.mode,
      sums: context.sums,
      explicitRule: context.explicitRule,
      emission: context.emission,
      collisionMode: context.collisionMode,
      collisionFixed: context.collisionFixed,
      noiseP: context.noiseP,
      stochastic: context.stochastic,
      initialRow: context.makeInitialRow(w),
      priorRows: context.makePriorRows?.(w),
      cellSize: cs,
      downscale: downscale.value,
    })
    const { outWidth, outHeight } = outputSize(w, h, cs, downscale.value)
    revokeImage()
    imageUrl.value = URL.createObjectURL(blob)
    imageInfo.value = `${w}×${h} cells · ${outWidth}×${outHeight} px · ${(blob.size / 1e6).toFixed(2)} MB`
    generatedRuleLabel.value = context.ruleLabel
    statusText.value = 'done'
  } catch (error) {
    errorText.value = error instanceof Error ? error.message : String(error)
    statusText.value = ''
  } finally {
    generating.value = false
  }
}

const downloadName = computed(() => `ca-${generatedRuleLabel.value || 'rule'}-${width.value}x${height.value}.png`)

onBeforeUnmount(revokeImage)
</script>

<template>
  <div class="ca-analysis">
    <h3 class="ca-panel-title">Render: export a large image</h3>
    <div class="ca-control ca-control--wide">
      <label class="ca-label">
        Renders the current rule off-screen at a chosen size and gives you a
        ready PNG to download. The PNG is encoded directly (no canvas), so it is
        not bound by the browser's canvas size limit — very large fields, e.g.
        10000×10000, work as long as there is enough memory. Switch the scale to
        "cells per pixel" to shrink a big field into a small image. The
        interactive diagram above is left untouched.
      </label>

      <div class="ca-inline">
        <label class="ca-field">
          <span class="ca-field-cap">width (cells)</span>
          <input class="ca-number" type="number" min="1" max="1000000" step="1" v-model.number="width" />
        </label>
        <label class="ca-field">
          <span class="ca-field-cap">height (generations)</span>
          <input class="ca-number" type="number" min="1" max="1000000" step="1" v-model.number="height" />
        </label>
      </div>

      <div class="ca-inline">
        <div class="ca-seg">
          <button type="button" :class="{ on: !downscale }" @click="downscale = false">enlarge (px/cell)</button>
          <button type="button" :class="{ on: downscale }" @click="downscale = true">shrink (cells/px)</button>
        </div>
        <label class="ca-field">
          <span class="ca-field-cap">{{ scaleCaption }}</span>
          <input class="ca-number ca-number--sm" type="number" min="1" max="64" step="1" v-model.number="cellSize" />
        </label>
        <button type="button" @click="generate" :disabled="generating">
          ⬇ generate image
        </button>
      </div>

      <div class="ca-meter">{{ sizeHint }}</div>
      <div class="ca-meter" v-if="statusText && !errorText">{{ statusText }}</div>
      <div class="ca-meter ca-render-warn" v-if="errorText">{{ errorText }}</div>

      <template v-if="imageUrl">
        <div class="ca-meter">{{ imageInfo }}</div>
        <div class="ca-inline">
          <a class="ca-render-download" :href="imageUrl" :download="downloadName">⬇ download PNG</a>
        </div>
        <img
          v-if="showPreview"
          class="ca-render-preview"
          :src="imageUrl"
          alt="Rendered cellular automaton diagram"
        />
        <div class="ca-meter" v-else>
          preview skipped — {{ out.outWidth }}×{{ out.outHeight }} px is too large for the browser to display,
          but the downloaded PNG is fine.
        </div>
      </template>
    </div>
  </div>
</template>
