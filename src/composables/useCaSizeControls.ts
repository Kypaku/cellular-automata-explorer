import { computed, type Ref } from 'vue'

/** Reads the current value out of an input `Event` target. */
function inputValue(event: Event): string {
  return (event.target as HTMLInputElement).value
}

export interface CaSizeControlsDeps {
  H: Ref<number>
  W: Ref<number>
  noise: Ref<number>
  run: () => void
}

/**
 * Height/width/noise clamping, their derived status text, and the
 * slider/number input handlers that drive them. Re-renders (`run`) after
 * every change, same as the interactive canvas controls it backs.
 */
export function useCaSizeControls(deps: CaSizeControlsDeps) {
  const { H, W, noise, run } = deps

  const heightStatusText = computed(() => `${H.value} rows`)
  const widthStatusText = computed(() => `${W.value} cells per row`)
  const noiseStatusText = computed(() =>
    noise.value > 0
      ? `${noise.value}% of cells on each step get a random value against the rule`
      : 'the rule is applied with no random deviations'
  )

  function clampHeight(value: number): number {
    return Math.max(40, value)
  }

  function clampWidth(value: number): number {
    return Math.max(11, value)
  }

  function clampNoise(value: number): number {
    return Math.max(0, Math.min(1, value))
  }

  function setHeight(value: number): void {
    if (isNaN(value)) {
      return
    }
    H.value = clampHeight(value)
  }

  function setWidth(value: number): void {
    if (isNaN(value)) {
      return
    }
    W.value = clampWidth(value)
  }

  function setNoise(value: number): void {
    if (isNaN(value)) {
      return
    }
    noise.value = clampNoise(value)
  }

  function onHeightSliderInput(event: Event): void {
    setHeight(parseInt(inputValue(event), 10))
    run()
  }

  function onHeightNumberInput(event: Event): void {
    const raw = inputValue(event)
    if (raw === '') {
      return
    }
    setHeight(parseInt(raw, 10))
    run()
  }

  function onWidthSliderInput(event: Event): void {
    setWidth(parseInt(inputValue(event), 10))
    run()
  }

  function onWidthNumberInput(event: Event): void {
    const raw = inputValue(event)
    if (raw === '') {
      return
    }
    setWidth(parseInt(raw, 10))
    run()
  }

  function onNoiseSliderInput(event: Event): void {
    setNoise(parseFloat(inputValue(event)))
    run()
  }

  function onNoiseNumberInput(event: Event): void {
    const raw = inputValue(event)
    if (raw === '') {
      return
    }
    setNoise(parseFloat(raw))
    run()
  }

  function onNoisePreset(value: number): void {
    setNoise(value)
    run()
  }

  return {
    heightStatusText,
    widthStatusText,
    noiseStatusText,
    onHeightSliderInput,
    onHeightNumberInput,
    onWidthSliderInput,
    onWidthNumberInput,
    onNoiseSliderInput,
    onNoiseNumberInput,
    onNoisePreset,
  }
}
