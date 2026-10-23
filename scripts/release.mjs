// Builds the app and publishes dist/ into the GitHub Pages site folder.
//
// Replaces the manual routine used so far:
//   1. npm run build                       (vue-tsc -b && vite build, base '/pages/ca2026/')
//   2. replace <site>/pages/ca2026 with the contents of dist/
//      (old hashed assets/index-*.js|css removed, new ones added)
//   3. commit in the site repo as "ca2026: publish build YYYY-MM-DD HH:MM" and push
//
// This script does steps 1–2 and prints the commands for step 3 (it never
// commits or pushes). Files in the target that are not part of the build are
// deleted, except "keep" files (Google site verification googleXXXX.html,
// CNAME, .nojekyll, plus any --keep names) — the manual routine once deleted
// the verification file by accident.
//
// The build always runs with NODE_ENV=production: a NODE_ENV=development
// inherited from the shell makes Vite bundle Vue's development build. A dist/
// that is such a build is refused for publishing (a warning in --dry-run).
//
// Usage:
//   node scripts/release.mjs [--target <dir>] [--dry-run] [--skip-build] [--keep <name>]...
//   npm run release -- --dry-run
//
//   --target <dir>  site folder to publish into
//                   (default: ../kypaku.github.io/pages/ca2026 relative to the repo root)
//   --dry-run       do not build and do not write anything; only print what would
//                   be copied/updated/deleted, comparing the existing dist/ with the target
//   --skip-build    publish the existing dist/ without rebuilding
//   --keep <name>   extra file name (relative to target) that must never be deleted

// No #! line: the script is run as `node scripts/release.mjs`, and Vitest
// cannot import a module with a hashbang (tests/release.test.mjs imports it).

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const distDir = path.join(repoRoot, 'dist')
const DEFAULT_TARGET = path.resolve(repoRoot, '../kypaku.github.io/pages/ca2026')
const KEEP_PATTERNS = [/^google[0-9a-f]+\.html$/i, /^CNAME$/, /^\.nojekyll$/]

function parseArgs(argv) {
  const opts = { target: DEFAULT_TARGET, dryRun: false, skipBuild: false, keep: [], help: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--dry-run' || a === '-n') opts.dryRun = true
    else if (a === '--skip-build') opts.skipBuild = true
    else if (a === '--help' || a === '-h') opts.help = true
    else if (a === '--target' || a === '--keep') {
      const v = argv[++i]
      if (!v) fail(`${a} needs a value`)
      if (a === '--target') opts.target = path.resolve(v)
      else opts.keep.push(v.replace(/\\/g, '/'))
    } else if (a.startsWith('--target=')) opts.target = path.resolve(a.slice(9))
    else if (a.startsWith('--keep=')) opts.keep.push(a.slice(7).replace(/\\/g, '/'))
    else fail(`unknown argument: ${a} (see --help)`)
  }
  return opts
}

function fail(message) {
  console.error(`release: ${message}`)
  process.exit(1)
}

/** Relative file paths (forward slashes) under `dir`, sorted. */
function listFiles(dir) {
  const out = []
  const walk = (sub) => {
    for (const entry of fs.readdirSync(path.join(dir, sub), { withFileTypes: true })) {
      const rel = sub ? `${sub}/${entry.name}` : entry.name
      if (entry.isDirectory()) walk(rel)
      else if (entry.isFile()) out.push(rel)
    }
  }
  if (fs.existsSync(dir)) walk('')
  return out.sort()
}

function fileHash(file) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

function isKept(rel, extraKeep) {
  return extraKeep.includes(rel) || (!rel.includes('/') && KEEP_PATTERNS.some((re) => re.test(rel)))
}

/** Compares dist/ with the target and returns what a publish would do. */
export function planRelease(sourceDir, targetDir, extraKeep = []) {
  const src = listFiles(sourceDir)
  const dst = new Set(listFiles(targetDir))
  const plan = { add: [], update: [], same: [], remove: [], keep: [] }
  for (const rel of src) {
    if (!dst.has(rel)) plan.add.push(rel)
    else if (fileHash(path.join(sourceDir, rel)) !== fileHash(path.join(targetDir, rel))) plan.update.push(rel)
    else plan.same.push(rel)
    dst.delete(rel)
  }
  for (const rel of dst) (isKept(rel, extraKeep) ? plan.keep : plan.remove).push(rel)
  return plan
}

function printPlan(plan) {
  const rows = [
    ['+', 'add', plan.add],
    ['~', 'update', plan.update],
    ['-', 'delete', plan.remove],
    ['=', 'keep (not in build)', plan.keep],
  ]
  for (const [mark, , files] of rows) for (const f of files) console.log(`  ${mark} ${f}`)
  console.log(
    `  ${plan.add.length} add, ${plan.update.length} update, ${plan.remove.length} delete, ` +
      `${plan.same.length} unchanged, ${plan.keep.length} kept`
  )
}

/** Reads the base path the build was made for, from dist/index.html asset URLs. */
function builtBase(indexHtml) {
  const m = /(?:src|href)="([^"]*\/)assets\/index-[^"]+\.(?:js|css)"/.exec(indexHtml)
  return m ? m[1] : null
}

function checkBase(targetDir) {
  const indexFile = path.join(distDir, 'index.html')
  if (!fs.existsSync(indexFile)) fail(`no ${path.relative(repoRoot, indexFile)} — run without --skip-build/--dry-run first`)
  const base = builtBase(fs.readFileSync(indexFile, 'utf8'))
  if (!base) {
    console.warn('release: warning: could not find assets/index-*.js in dist/index.html')
    return
  }
  const normTarget = targetDir.replace(/\\/g, '/').replace(/\/+$/, '') + '/'
  if (!normTarget.endsWith(base)) {
    console.warn(`release: warning: build base is "${base}" but target is ${targetDir} — asset URLs may break`)
  } else {
    console.log(`base ${base} matches target folder`)
  }
}

/**
 * Environment for `npm run build`. NODE_ENV is forced to "production": with
 * NODE_ENV=development inherited from the shell (e.g. a terminal of an
 * Electron dev app) `vite build` bundles Vue's development build — about 65 kB
 * bigger, with dev-only warnings — and nothing in the output says so.
 */
export function buildEnv(env = process.env) {
  return { ...env, NODE_ENV: 'production' }
}

/** Strings that only Vue's development build contains (its runtime warnings). */
const DEV_BUILD_MARKERS = ['Component is missing template or render function']

/** True if a bundled JS file contains Vue's development build. */
export function looksLikeDevBuild(js) {
  return DEV_BUILD_MARKERS.some((m) => js.includes(m))
}

/** Warns (dry run) or stops if dist/assets has a development build of Vue. */
function checkProductionBuild(dryRun) {
  const assetsDir = path.join(distDir, 'assets')
  const dev = listFiles(assetsDir).filter(
    (rel) => rel.endsWith('.js') && looksLikeDevBuild(fs.readFileSync(path.join(assetsDir, rel), 'utf8'))
  )
  if (dev.length === 0) return
  const message =
    `dist/assets/${dev.join(', dist/assets/')} is a development build ` +
    '(built with NODE_ENV other than "production")'
  if (dryRun) console.warn(`release: warning: ${message} — a real run rebuilds it`)
  else fail(`${message} — run without --skip-build, or rebuild with NODE_ENV=production`)
}

function runBuild() {
  console.log('> npm run build')
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const res = spawnSync(npm, ['run', 'build'], {
    cwd: repoRoot,
    env: buildEnv(),
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  if (res.status !== 0) fail(`build failed (exit ${res.status})`)
}

function applyPlan(plan, sourceDir, targetDir) {
  fs.mkdirSync(targetDir, { recursive: true })
  for (const rel of plan.remove) fs.rmSync(path.join(targetDir, rel), { force: true })
  for (const rel of [...plan.add, ...plan.update]) {
    const to = path.join(targetDir, rel)
    fs.mkdirSync(path.dirname(to), { recursive: true })
    fs.copyFileSync(path.join(sourceDir, rel), to)
  }
  // Drop directories left empty by deletions.
  const prune = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const sub = path.join(dir, entry.name)
      prune(sub)
      if (fs.readdirSync(sub).length === 0) fs.rmdirSync(sub)
    }
  }
  prune(targetDir)
}

function stamp() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function main() {
  const opts = parseArgs(process.argv.slice(2))
  if (opts.help) {
    const header = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(0, 28)
    console.log(header.map((l) => l.replace(/^\/\/ ?/, '')).join('\n'))
    return
  }
  if (!fs.existsSync(path.dirname(opts.target))) {
    fail(`parent of target does not exist: ${path.dirname(opts.target)} (pass --target)`)
  }
  console.log(`target: ${opts.target}${opts.dryRun ? '  [dry run — nothing is written]' : ''}`)

  if (opts.dryRun) {
    if (!fs.existsSync(distDir)) fail('no dist/ to compare — run `npm run build` first')
    console.log('dry run: build skipped, comparing the existing dist/')
  } else if (!opts.skipBuild) {
    runBuild()
  }
  checkBase(opts.target)
  checkProductionBuild(opts.dryRun)

  const plan = planRelease(distDir, opts.target, opts.keep)
  printPlan(plan)
  if (opts.dryRun) return
  if (plan.add.length + plan.update.length + plan.remove.length === 0) {
    console.log('nothing to publish — target already matches dist/')
    return
  }
  applyPlan(plan, distDir, opts.target)
  console.log('published. To finish, in the site repo:')
  console.log(`  git -C "${opts.target}" add -A . && git -C "${opts.target}" commit -m "ca2026: publish build ${stamp()}"`)
  console.log('  (then check the page and push yourself)')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
