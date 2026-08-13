import { ref } from 'vue'

/**
 * Module-singleton warning surfaced app-wide when a localStorage write fails
 * (typically the quota being exceeded), so the tagged-rule library / custom
 * search patterns / etc. silently stop auto-saving without the user noticing.
 */
export const storageWarning = ref<string | null>(null)

export function dismissStorageWarning(): void {
  storageWarning.value = null
}

/**
 * Attempts `localStorage.setItem(key, value)`, updating the shared
 * {@link storageWarning} on failure/success. Returns whether the write
 * succeeded, in case a caller needs to react to it too.
 */
export function trySetItem(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value)
    storageWarning.value = null
    return true
  } catch {
    storageWarning.value =
      'Browser storage is full — changes are no longer saved automatically. Free up space (e.g. delete some tagged rules or custom search patterns) or export your data.'
    return false
  }
}
