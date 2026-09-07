<script setup lang="ts">
// Editor for the complex conditions; the conditions themselves are listed in
// the legend, next to the ordinary rule conditions.
import { ref, watch } from 'vue'
import type { ComplexConditionsApi } from '../../composables/useComplexConditions'

const props = defineProps<{
  api: ComplexConditionsApi
  stateCount: number
  neighborhood: number
  depth: number
}>()

const {
  conditions,
  error,
  editingId,
  nameInput,
  jsonInput,
  mirrorInput,
  supported,
  activeCount,
  submit,
  cancelEdit,
  removeEditing,
  exportToFile,
  importFromFile,
} = props.api

const open = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

async function onFileChosen(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  await importFromFile(input.files && input.files[0])
  input.value = ''
}

// The edit button lives in the legend, so opening the editor is what shows the
// user where the condition can be changed.
watch(editingId, (id) => {
  if (id) {
    open.value = true
  }
})
</script>

<template>
  <div class="ca-complex">
    <button type="button" class="ca-json-toggle" :aria-expanded="open" @click="open = !open">
      <span class="ca-panel-toggle-icon">{{ open ? '▼' : '▶' }}</span>
      Complex conditions<template v-if="activeCount"> ({{ activeCount }} on)</template>
    </button>

    <div v-if="open" class="ca-json-body">
      <template v-if="supported">
        <div class="ca-meter">
          Group several templates under one name and switch them all on or off with a single checkbox next to
          the rule conditions above. Same format as the JSON rule; turning a condition off restores the
          templates it replaced. "mirror" also applies every pattern read right to left, so mirrored templates
          need not be written out. The whole rule — the plain rule plus its conditions and which of them are
          on — can be saved to a file and loaded back.
        </div>

        <input v-model="nameInput" class="ca-input ca-complex-name-input" placeholder="condition name" />
        <textarea
          v-model="jsonInput"
          class="ca-input ca-json-textarea"
          rows="5"
          spellcheck="false"
          placeholder='{ "1#1": 1, "010": [1, 0] }'
        ></textarea>
        <div class="ca-inline">
          <button type="button" @click="submit">{{ editingId ? 'save changes' : 'add condition' }}</button>
          <label class="ca-complex-check ca-meter">
            <input type="checkbox" v-model="mirrorInput" />
            mirror
          </label>
          <template v-if="editingId">
            <button type="button" class="ca-link-btn" @click="cancelEdit">cancel</button>
            <button type="button" class="ca-link-btn" @click="removeEditing">remove</button>
          </template>
        </div>
        <div v-if="error" class="ca-meter ca-render-warn">{{ error }}</div>
        <div v-else-if="conditions.length" class="ca-meter">
          {{ conditions.length }} condition{{ conditions.length === 1 ? '' : 's' }}, shown with the rule
          conditions above.
        </div>
        <div v-else class="ca-meter">No complex conditions yet.</div>

        <div class="ca-inline">
          <button type="button" @click="exportToFile">💾 save rule</button>
          <button type="button" @click="fileInput?.click()">📂 load rule</button>
          <input
            ref="fileInput"
            type="file"
            accept="application/json,.json"
            class="ca-cs-file"
            @change="onFileChosen"
          />
        </div>
      </template>
      <div v-else class="ca-meter">
        The template table for {{ stateCount }} states, {{ neighborhood }} cells and {{ depth }} previous row(s)
        is too large to group into conditions.
      </div>
    </div>
  </div>
</template>
