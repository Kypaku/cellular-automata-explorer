// scripts/release.mjs: the published build must be a production build.
// A shell with NODE_ENV=development (e.g. a terminal of an Electron dev app)
// made `vite build` bundle Vue's development build: 392 kB instead of 328 kB,
// with dev-only warnings, and the build output did not say so.
//
// Plain .mjs like themeCss.test.mjs: release.mjs is untyped Node code and the
// app tsconfig (which type-checks tests/**/*.ts) has no Node types.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { buildEnv, looksLikeDevBuild } from '../scripts/release.mjs'

const require = createRequire(import.meta.url)
const vueRuntime = (file) => readFileSync(require.resolve(`@vue/runtime-core/dist/${file}`), 'utf8')

describe('release build environment', () => {
  it('forces NODE_ENV=production over an inherited development value', () => {
    expect(buildEnv({ NODE_ENV: 'development', PATH: '/bin' })).toEqual({ NODE_ENV: 'production', PATH: '/bin' })
  })

  it('sets NODE_ENV=production when it is not set', () => {
    expect(buildEnv({}).NODE_ENV).toBe('production')
  })

  it('does not change the passed environment', () => {
    const env = { NODE_ENV: 'development' }
    buildEnv(env)
    expect(env.NODE_ENV).toBe('development')
  })
})

describe('development build detection', () => {
  it("recognizes Vue's development runtime", () => {
    expect(looksLikeDevBuild(vueRuntime('runtime-core.cjs.js'))).toBe(true)
  })

  it("does not flag Vue's production runtime", () => {
    expect(looksLikeDevBuild(vueRuntime('runtime-core.cjs.prod.js'))).toBe(false)
  })
})
