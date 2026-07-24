<script setup lang="ts">
import { computed, ref } from 'vue'
import type { TaggedRule } from '../../types/ca'
import type { TagTestResult } from '../../utils/analysis/tagTest'

const props = defineProps<{
  tags: string[]
  currentRuleTags: string[]
  tagCounts: Record<string, number>
  activeTag?: string | null
  rulesForActiveTag: TaggedRule[]
  activeIndex: number
  navStatusText: string
  tagTestResults?: TagTestResult[] | null
}>()

const emit = defineEmits([
  'add-tag',
  'rename-tag',
  'delete-tag',
  'toggle-tag',
  'browse-tag',
  'close-browse',
  'delete-rule',
  'next-rule',
  'prev-rule',
  'jump-to-rule',
  'export-file',
  'import-file',
  'test-rule',
  'apply-test-tag',
])

// The tests the current rule passed (would be tagged with), in test order.
const passedTests = computed(() => (props.tagTestResults || []).filter((r) => r.passed))

const newTagName = ref('')
const editingTag = ref<string | null>(null)
const editValue = ref('')
const fileInput = ref<HTMLInputElement | null>(null)

function submitNewTag(): void {
  const value = newTagName.value.trim()
  if (!value) {
    return
  }
  emit('add-tag', value)
  newTagName.value = ''
}

function startEdit(tag: string): void {
  editingTag.value = tag
  editValue.value = tag
}

function commitEdit(): void {
  if (editingTag.value !== null && editValue.value.trim() && editValue.value.trim() !== editingTag.value) {
    emit('rename-tag', editingTag.value, editValue.value.trim())
  }
  editingTag.value = null
}

function cancelEdit(): void {
  editingTag.value = null
}

function removeTag(tag: string): void {
  if (window.confirm(`Delete tag «${tag}»? It will be removed from all rules.`)) {
    emit('delete-tag', tag)
  }
}

function removeRule(id: string): void {
  if (window.confirm('Delete this saved rule?')) {
    emit('delete-rule', id)
  }
}

function onFileChange(event: Event): void {
  const target = event.target as HTMLInputElement
  const file = target.files && target.files[0]
  if (file) {
    emit('import-file', file)
  }
  target.value = ''
}

function triggerImport(): void {
  fileInput.value && fileInput.value.click()
}
</script>

<template>
  <div class="ca-tags">
    <div class="ca-tags-cols">
      <div class="ca-control ca-control--wide">
        <label class="ca-label">
          Tags (click a tag to add/remove it from the current rule, ☰ — view all rules with the tag)
        </label>
        <div class="ca-tag-list">
          <span
            v-for="tag in tags"
            :key="tag"
            class="ca-tag"
            :class="{ on: currentRuleTags.includes(tag), browsing: tag === activeTag }"
          >
            <input
              v-if="editingTag === tag"
              class="ca-tag-edit"
              type="text"
              v-model="editValue"
              @keyup.enter="commitEdit"
              @keyup.esc="cancelEdit"
              @blur="commitEdit"
              autofocus
            />
            <template v-else>
              <button
                type="button"
                class="ca-tag-name"
                :title="currentRuleTags.includes(tag) ? 'remove tag from current rule' : 'add tag to current rule'"
                @click="emit('toggle-tag', tag)"
              >
                {{ tag }}<span class="ca-tag-count">{{ tagCounts[tag] || 0 }}</span>
              </button>
              <button type="button" class="ca-tag-icon" title="show all rules with this tag" @click="emit('browse-tag', tag)">☰</button>
              <button type="button" class="ca-tag-icon" title="rename tag" @click="startEdit(tag)">✎</button>
              <button type="button" class="ca-tag-icon" title="delete tag" @click="removeTag(tag)">×</button>
            </template>
          </span>
          <span v-if="!tags.length" class="ca-meter">no tags yet</span>
        </div>
        <div class="ca-inline">
          <input
            class="ca-input ca-tag-input"
            type="text"
            placeholder="new tag"
            v-model="newTagName"
            @keyup.enter="submitNewTag"
          />
          <button type="button" @click="submitNewTag">add tag</button>
        </div>

        <div class="ca-tag-test">
          <div class="ca-inline">
            <button type="button" @click="emit('test-rule')" title="run every analysis on the current rule and show which tags it would get">
              test current rule for tags
            </button>
          </div>
          <template v-if="tagTestResults">
            <label class="ca-label">
              Passed {{ passedTests.length }} / {{ tagTestResults.length }} test{{ tagTestResults.length === 1 ? '' : 's' }}
            </label>
            <div class="ca-tag-list" v-if="passedTests.length">
              <button
                v-for="result in passedTests"
                :key="result.tag"
                type="button"
                class="ca-tag-test-item"
                :class="{ 'ca-tag-test-class': result.kind === 'class', on: currentRuleTags.includes(result.tag) }"
                :title="currentRuleTags.includes(result.tag) ? 'already on the current rule — click to add again' : 'add this tag to the current rule'"
                @click="emit('apply-test-tag', result)"
              >
                ✓ {{ result.tag }}
              </button>
            </div>
            <div class="ca-meter" v-else>the rule passed no tests</div>
          </template>
        </div>
      </div>

      <div class="ca-control ca-control--wide" v-if="activeTag">
        <label class="ca-label">Rules with tag «{{ activeTag }}» ({{ navStatusText }})</label>
        <template v-if="rulesForActiveTag.length">
          <div class="ca-inline">
            <button type="button" @click="emit('prev-rule')">← prev.</button>
            <button type="button" @click="emit('next-rule')">next →</button>
            <button type="button" @click="emit('close-browse')">close list</button>
          </div>
          <ul class="ca-rule-list">
            <li
              v-for="(rule, index) in rulesForActiveTag"
              :key="rule.id"
              class="ca-rule-item"
              :class="{ active: index === activeIndex }"
            >
              <button type="button" class="ca-rule-name" @click="emit('jump-to-rule', index)">{{ rule.name }}</button>
              <button type="button" class="ca-tag-icon" title="delete rule" @click="removeRule(rule.id)">×</button>
            </li>
          </ul>
        </template>
        <div class="ca-meter" v-else>
          no saved rules with this tag
          <button type="button" @click="emit('close-browse')">close</button>
        </div>
      </div>
    </div>

    <div class="ca-inline">
      <button type="button" @click="emit('export-file')">save tags and rules to file</button>
      <button type="button" @click="triggerImport">load from file</button>
      <input ref="fileInput" type="file" accept="application/json" class="ca-file-input" @change="onFileChange" />
    </div>
  </div>
</template>
