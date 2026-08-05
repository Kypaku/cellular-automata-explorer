<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { canMaterializeLocal, getConfig } from '../../utils/caMath'
import { RULE_JSON_ANY, RULE_JSON_MAX_ENTRIES, buildRuleJson, parseRuleJson } from '../../utils/caRuleJson'

const props = defineProps<{
  stateCount: number
  neighborhood: number
  depth: number
  localRule: string
}>()

const emit = defineEmits<{
  apply: [rule: string]
}>()

const open = ref(false)
const text = ref('')
const error = ref('')
const info = ref('')
// True once the text belongs to the user, so incoming rule changes no longer
// overwrite what is being typed.
const dirty = ref(false)

const config = computed(() => getConfig(props.stateCount, props.neighborhood, props.depth))
const supported = computed(() => canMaterializeLocal(config.value))

function plural(count: number): string {
  return count === 1 ? '' : 's'
}

function loadFromRule(): void {
  const built = buildRuleJson(props.localRule, props.stateCount, props.neighborhood, props.depth)
  text.value = built.text
  error.value = ''
  dirty.value = false
  info.value = built.truncated
    ? `Showing the first ${RULE_JSON_MAX_ENTRIES} of ${built.total} non-zero patterns - applying this text would reset the rest to 0.`
    : `${built.total} non-zero pattern${plural(built.total)} of ${config.value.localDigits} templates.`
}

function toggle(): void {
  open.value = !open.value
  if (open.value && supported.value && !dirty.value) {
    loadFromRule()
  }
}

function onInput(event: Event): void {
  text.value = (event.target as HTMLTextAreaElement).value
  dirty.value = true
}

function onApply(): void {
  const result = parseRuleJson(text.value, props.stateCount, props.neighborhood, props.depth)
  if (result.rule === null) {
    error.value = result.error || 'Could not read the rule.'
    return
  }
  error.value = ''
  info.value = `Applied ${result.entries} pattern${plural(result.entries)} covering ${result.covered} of ${config.value.localDigits} templates.`
  // Keep the text as written (wildcards included) instead of the expanded form.
  dirty.value = true
  emit('apply', result.rule)
}

// While the editor is open and untouched, follow the rule shown elsewhere.
watch(
  () => [props.localRule, props.stateCount, props.neighborhood, props.depth],
  () => {
    if (open.value && supported.value && !dirty.value) {
      loadFromRule()
    }
  }
)
</script>

<template>
  <div class="ca-json-rule">
    <button type="button" class="ca-json-toggle" @click="toggle">
      <span class="ca-panel-toggle-icon">{{ open ? '▼' : '▶' }}</span>
      JSON rule
    </button>

    <div v-if="open" class="ca-json-body">
      <template v-if="supported">
        <div class="ca-meter">
          One entry per template: the key lists the {{ config.taps }} cells the rule reads (leftmost cell of the
          oldest row first), the value is the resulting state. "{{ RULE_JSON_ANY }}" matches any state<template
            v-if="config.depth > 1"
          >, and "/" optionally separates the {{ config.depth }} rows</template>. Every template that is not
          listed produces 0.
        </div>
        <textarea
          class="ca-input ca-json-textarea"
          rows="10"
          spellcheck="false"
          :value="text"
          @input="onInput"
        ></textarea>
        <div class="ca-inline">
          <button type="button" @click="onApply">apply JSON</button>
          <button type="button" class="ca-link-btn" @click="loadFromRule">reload from current rule</button>
        </div>
        <div v-if="error" class="ca-meter ca-render-warn">{{ error }}</div>
        <div v-else class="ca-meter">{{ info }}</div>
      </template>
      <div v-else class="ca-meter">
        The template table for {{ stateCount }} states, {{ neighborhood }} cells and {{ depth }} previous row(s)
        is too large to edit as JSON.
      </div>    </div>
  </div>
</template>
