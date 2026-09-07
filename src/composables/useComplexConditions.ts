// A "complex condition" is a named group of rule templates written in the JSON
// rule format. One checkbox switches the whole group on or off on top of the
// rule that is currently loaded, so several templates can hide behind a single
// control. Switching a group off restores the values it replaced.
import { computed, ref, watch } from 'vue'
import { COMPLEX_CONDITIONS_STORAGE_KEY } from '../constants/ca'
import { canMaterializeLocal, getConfig, padRight, sanitizeStateString, stateChar } from '../utils/caMath'
import { mirrorTemplateIndex, parseRuleJsonPatch } from '../utils/caRuleJson'

export interface ComplexCondition {
  id: string
  name: string
  json: string
  /** Also apply every pattern reflected left to right, so mirrored templates need not be written out. */
  mirror: boolean
  enabled: boolean
  /** Template index → the digits that were in the rule before the group was switched on. */
  previous: Record<string, string> | null
  /** How many templates the group covers, filled in when it is switched on. */
  covered: number
}

interface RuleState {
  rule: string
  options: Record<string, string>
}

interface RuleFilePayload {
  type?: string
  states?: number
  neighborhood?: number
  depth?: number
  rule: string
  options?: Record<string, string>
  conditions?: { name?: string; json: string; mirror?: boolean; enabled?: boolean }[]
}

const RULE_FILE_TYPE = 'ca-rule-with-conditions'

export interface ComplexConditionsContext {
  stateCount: () => number
  neighborhood: () => number
  depth: () => number
  localRule: () => string
  stochasticOptions: () => Record<string, string> | null
  apply: (payload: { rule: string; options: Record<string, string> }) => void
}

export type ComplexConditionsApi = ReturnType<typeof useComplexConditions>

export function useComplexConditions(ctx: ComplexConditionsContext) {
  const conditions = ref<ComplexCondition[]>(load())
  const error = ref('')
  const editingId = ref<string | null>(null)
  const nameInput = ref('')
  const jsonInput = ref('')
  const mirrorInput = ref(true)

  const config = computed(() => getConfig(ctx.stateCount(), ctx.neighborhood(), ctx.depth()))
  const supported = computed(() => canMaterializeLocal(config.value))
  const activeCount = computed(() => conditions.value.filter((condition) => condition.enabled).length)

  // Template indices depend on the rule shape, so a stored "previous" snapshot
  // stops being meaningful once it changes - drop the active state instead of
  // writing stale digits back into a different rule.
  watch(
    () => [ctx.stateCount(), ctx.neighborhood(), ctx.depth()],
    () => {
      for (const condition of conditions.value) {
        condition.enabled = false
        condition.previous = null
      }
      error.value = ''
    }
  )

  watch(conditions, save, { deep: true })

  function load(): ComplexCondition[] {
    try {
      const raw = localStorage.getItem(COMPLEX_CONDITIONS_STORAGE_KEY)
      const stored = raw ? JSON.parse(raw) : null
      if (!Array.isArray(stored)) {
        return []
      }
      return stored
        .filter((item) => item && typeof item.json === 'string')
        .map((item, index) => ({
          id: `cc-${Date.now()}-${index}`,
          name: typeof item.name === 'string' ? item.name : `condition ${index + 1}`,
          json: item.json as string,
          mirror: item.mirror !== false,
          enabled: false,
          previous: null,
          covered: 0,
        }))
    } catch {
      return []
    }
  }

  function save(): void {
    try {
      const stored = conditions.value.map((condition) => ({
        name: condition.name,
        json: condition.json,
        mirror: condition.mirror,
      }))
      localStorage.setItem(COMPLEX_CONDITIONS_STORAGE_KEY, JSON.stringify(stored))
    } catch {
      // Storage may be full or blocked; the conditions still work for this session.
    }
  }

  /** Adds the edited condition, or saves it back when an existing one is open. */
  function submit(): void {
    const json = jsonInput.value.trim()
    if (!json) {
      error.value = 'Enter the templates of the condition, e.g. { "1#1": 1 }.'
      return
    }
    const parsed = parseRuleJsonPatch(json, ctx.stateCount(), ctx.neighborhood(), ctx.depth())
    if (!parsed.assignments) {
      error.value = parsed.error || 'Could not read the condition.'
      return
    }
    error.value = ''

    const name = nameInput.value.trim()
    const editing = conditions.value.find((condition) => condition.id === editingId.value)
    if (editing) {
      updateCondition(editing, { name: name || editing.name, json, mirror: mirrorInput.value })
    } else {
      conditions.value.push({
        id: `cc-${Date.now()}-${conditions.value.length}`,
        name: name || `condition ${conditions.value.length + 1}`,
        json,
        mirror: mirrorInput.value,
        enabled: false,
        previous: null,
        covered: parsed.covered,
      })
    }
    resetForm()
  }

  function beginEdit(condition: ComplexCondition): void {
    editingId.value = condition.id
    nameInput.value = condition.name
    jsonInput.value = condition.json
    mirrorInput.value = condition.mirror
    error.value = ''
  }

  function resetForm(): void {
    editingId.value = null
    nameInput.value = ''
    jsonInput.value = ''
    mirrorInput.value = true
  }

  function removeEditing(): void {
    const editing = conditions.value.find((condition) => condition.id === editingId.value)
    if (editing) {
      removeCondition(editing)
    }
    resetForm()
  }

  function removeCondition(condition: ComplexCondition): void {
    if (condition.enabled) {
      toggleCondition(condition)
    }
    conditions.value = conditions.value.filter((item) => item.id !== condition.id)
  }

  function setMirror(condition: ComplexCondition, mirror: boolean): void {
    updateCondition(condition, { mirror })
  }

  function toggleCondition(condition: ComplexCondition): void {
    if (condition.enabled) {
      const previous = condition.previous || {}
      condition.enabled = false
      condition.previous = null
      writeValues(previous)
      return
    }

    const assignments = resolveAssignments(condition, condition.json, condition.mirror)
    if (!assignments) {
      return
    }
    condition.previous = capturePrevious(assignments)
    condition.covered = Object.keys(assignments).length
    condition.enabled = true
    writeValues(assignments)
  }

  function updateCondition(
    condition: ComplexCondition,
    patch: { name?: string; json?: string; mirror?: boolean }
  ): void {
    const json = patch.json ?? condition.json
    const mirror = patch.mirror ?? condition.mirror
    if (!condition.enabled) {
      Object.assign(condition, { ...patch, json, mirror })
      return
    }

    const assignments = resolveAssignments(condition, json, mirror)
    if (!assignments) {
      return
    }
    const replaced = condition.previous || {}
    Object.assign(condition, { ...patch, json, mirror })
    // Restoring and re-applying as two writes would read back a stale rule, so
    // put the old values back and lay the new set on top in a single pass.
    condition.previous = capturePrevious(assignments, replaced)
    condition.covered = Object.keys(assignments).length
    writeValues({ ...replaced, ...assignments })
  }

  /** Parses a condition into the templates it sets, reporting a parse error to the user. */
  function resolveAssignments(
    condition: ComplexCondition,
    json: string,
    mirror: boolean
  ): Record<string, string> | null {
    const parsed = parseRuleJsonPatch(json, ctx.stateCount(), ctx.neighborhood(), ctx.depth())
    if (!parsed.assignments) {
      error.value = `${condition.name}: ${parsed.error || 'could not read the condition.'}`
      return null
    }
    error.value = ''
    return mirror ? withMirrors(parsed.assignments) : parsed.assignments
  }

  /** Adds the left-right reflection of every template; explicit entries win over generated ones. */
  function withMirrors(assignments: Record<string, string>): Record<string, string> {
    const mirrored: Record<string, string> = { ...assignments }
    for (const key of Object.keys(assignments)) {
      const twin = String(mirrorTemplateIndex(Number(key), config.value))
      if (!(twin in mirrored)) {
        mirrored[twin] = assignments[key]
      }
    }
    return mirrored
  }

  /** Values to put back when the condition is switched off, preferring an already captured original. */
  function capturePrevious(
    assignments: Record<string, string>,
    captured: Record<string, string> = {},
    state: RuleState = currentState()
  ): Record<string, string> {
    const previous: Record<string, string> = {}
    for (const key of Object.keys(assignments)) {
      previous[key] = key in captured ? captured[key] : state.options[key] || state.rule[Number(key)] || stateChar(0)
    }
    return previous
  }

  function currentState(): RuleState {
    return makeState(ctx.localRule(), ctx.stochasticOptions())
  }

  function makeState(rule: string, options: Record<string, string> | null | undefined): RuleState {
    const digits = config.value.localDigits
    return {
      rule: padRight(sanitizeStateString(rule, digits, ctx.stateCount()), digits),
      options: { ...(options || {}) },
    }
  }

  /** Lays a set of template values over a rule without touching the explorer. */
  function applyValues(state: RuleState, values: Record<string, string>): RuleState {
    const digits = config.value.localDigits
    let rule = state.rule
    const options = { ...state.options }

    for (const key of Object.keys(values)) {
      const index = Number(key)
      if (!Number.isInteger(index) || index < 0 || index >= digits) {
        continue
      }
      const picks = values[key]
      rule = rule.slice(0, index) + picks[0] + rule.slice(index + 1)
      if (picks.length > 1) {
        options[key] = picks
      } else {
        delete options[key]
      }
    }

    return { rule, options }
  }

  function writeValues(values: Record<string, string>): void {
    ctx.apply(applyValues(currentState(), values))
  }

  /** The rule with every active condition undone, so a saved file can reproduce the same setup. */
  function baseState(): RuleState {
    const restore: Record<string, string> = {}
    // Backwards: a condition switched on earlier holds the more original value.
    for (let i = conditions.value.length - 1; i >= 0; i--) {
      const condition = conditions.value[i]
      if (condition.enabled && condition.previous) {
        Object.assign(restore, condition.previous)
      }
    }
    return applyValues(currentState(), restore)
  }

  /** Writes the rule together with all of its conditions to a JSON file. */
  function exportToFile(): void {
    const base = baseState()
    const payload = {
      type: RULE_FILE_TYPE,
      states: ctx.stateCount(),
      neighborhood: ctx.neighborhood(),
      depth: ctx.depth(),
      rule: base.rule,
      options: base.options,
      conditions: conditions.value.map((condition) => ({
        name: condition.name,
        json: condition.json,
        mirror: condition.mirror,
        enabled: condition.enabled,
      })),
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `ca-rule-${ctx.stateCount()}s-${ctx.neighborhood()}n-${ctx.depth()}d.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  /** Restores a rule saved by `exportToFile`, including which conditions were on. */
  async function importFromFile(file: File | null | undefined): Promise<void> {
    if (!file) {
      return
    }
    let data: unknown
    try {
      data = JSON.parse(await file.text())
    } catch {
      error.value = 'Could not read the file: it is not valid JSON.'
      return
    }
    const payload = data as RuleFilePayload | null
    if (!payload || typeof payload !== 'object' || typeof payload.rule !== 'string') {
      error.value = 'This file does not hold a saved rule.'
      return
    }
    if (
      payload.states !== ctx.stateCount() ||
      payload.neighborhood !== ctx.neighborhood() ||
      payload.depth !== ctx.depth()
    ) {
      error.value = `The file was saved for ${payload.states} states, ${payload.neighborhood} cells and ${payload.depth} previous row(s). Switch the explorer to that shape first.`
      return
    }
    error.value = ''

    const stored = Array.isArray(payload.conditions) ? payload.conditions : []
    const loaded = stored
      .filter((item) => item && typeof item.json === 'string')
      .map((item, index) => ({
        id: `cc-${Date.now()}-${index}`,
        name: typeof item.name === 'string' && item.name ? item.name : `condition ${index + 1}`,
        json: item.json,
        mirror: item.mirror !== false,
        enabled: false,
        previous: null as Record<string, string> | null,
        covered: 0,
      }))

    // One write: switching the conditions on one by one would read back a rule
    // the explorer has not received yet.
    let state = makeState(payload.rule, payload.options)
    loaded.forEach((condition, index) => {
      if (!stored[index].enabled) {
        return
      }
      const assignments = resolveAssignments(condition, condition.json, condition.mirror)
      if (!assignments) {
        return
      }
      condition.previous = capturePrevious(assignments, {}, state)
      condition.covered = Object.keys(assignments).length
      condition.enabled = true
      state = applyValues(state, assignments)
    })

    conditions.value = loaded
    resetForm()
    ctx.apply(state)
  }

  return {
    conditions,
    error,
    editingId,
    nameInput,
    jsonInput,
    mirrorInput,
    config,
    supported,
    activeCount,
    submit,
    beginEdit,
    cancelEdit: resetForm,
    removeEditing,
    removeCondition,
    toggleCondition,
    setMirror,
    exportToFile,
    importFromFile,
  }
}
