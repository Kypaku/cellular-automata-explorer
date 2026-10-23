// The in-app theme toggle (html.dark / html.light) must also switch the used
// color scheme. Buttons have no explicit `color`, so they take the system
// `ButtonText` of the used scheme: with only `:root { color-scheme: light dark }`
// a light OS gave black text on the dark #1a1a1a buttons in the dark theme.
//
// Plain .mjs on purpose: Vitest returns an empty string for `*.css?raw` imports
// (CSS is not processed in tests), and the app tsconfig has no Node types, so
// the file is read with node:fs outside of the type-checked .ts tests.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8')

/** Body of the top-level rule whose selector is exactly `selector`. */
function ruleBody(selector) {
  for (const block of css.split('}')) {
    const open = block.indexOf('{')
    if (open < 0) continue
    const head = block.slice(0, open).replace(/\/\*[\s\S]*?\*\//g, '').trim()
    if (head === selector) return block.slice(open + 1)
  }
  throw new Error(`no "${selector}" rule in style.css`)
}

describe('theme classes in style.css', () => {
  it('html.dark forces the dark color scheme', () => {
    expect(ruleBody('html.dark')).toMatch(/color-scheme:\s*dark\s*;/)
  })

  it('html.light forces the light color scheme', () => {
    expect(ruleBody('html.light')).toMatch(/color-scheme:\s*light\s*;/)
  })
})
