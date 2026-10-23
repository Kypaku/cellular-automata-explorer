# CA2026 — Cellular Automaton Explorer

An interactive explorer for one-dimensional cellular automata (CA), built with Vue 3 +
TypeScript + Vite. It lets you run automata with an arbitrary number of states, define a rule
(totalistic or local), visualize the space-time diagram, and batch-run various automated
analyses over many rules (behavior classification, field/glider/custom-pattern/line/chaos
detection, and more), tagging rules along the way.

### Demo

[Demo](https://kypaku.github.io/pages/ca2026)

<img src="images/screen1.jpg" width="500" alt="Space-time diagram of a 3-state totalistic cellular automata rule showing gliders on a periodic background">
<img src="images/screen2.jpg" width="500" alt="Space-time diagram of a 3-state totalistic cellular automata rule showing gliders on a periodic background">

## Features

### Core automaton
- Configurable number of cell states (2–5), with a color per state.
- Two ways to define a rule:
  - **Totalistic** — transition table keyed by the sum of neighbor states.
  - **Local** — full transition table for a specific neighbor triple (or wider window),
    encoded as a single rule code.
- Configurable diagram width/height, initial state (single center cell or random noise with a
  given density), random rule generation, manual code/seed entry.

### Automated rule analysis
Each analysis type is an independent panel that scans a range of rule codes (or a random
sample of them, or already-tagged rules) and tags the results:

| Analysis | Tag | What it does |
|---|---|---|
| Classification | `Dead`/`Fixed`/`Periodic`/`Stable`/`Chaotic`/`Complex`/`Undefined` | The automaton's base behavior class (mutually exclusive tags). |
| Fields | `Fields` | Tiles the diagram into blocks and looks for a repeating (possibly shifting) pattern covering most of the field. |
| Gliders | `Gliders` | Looks for a localized structure that reappears shifted sideways within the light cone (a moving object), with guards against false positives on fields. |
| Custom search | `customSearch` | The user draws one or more templates (specific states, an "any" wildcard, and equality variables); a rule passes when none of the templates ever occur. |
| Absence of lines | `NoLines` | Checks for full-height vertical/diagonal (any slope) solid-pattern lines; the tag marks the **absence** of lines. |
| Chaos | `NoChaos` | Reduces the diagram to a pattern map; chaos is judged by whether the dominant pattern fails to stand out from the distribution; the tag marks the **absence** of chaos. |
| Sub-analysis | — | An extra pass with its own parameters (width/range/K/N%/R%/etc.) over selected rules, with the ability to apply a found rule back to the main automaton. |
| View as patterns | — | Reduces the rendered diagram to an M×M block map with a color legend of unique patterns. |

All analysis panels share one run-control component (`ca/AnalysisRunControls.vue`) with three
rule sources:
- **code range** (from–to),
- **random sample** (N random codes from the range — useful when the code space is
  astronomically large),
- **already-tagged rules**.

### Tags
Found or manually saved rules can be tagged and browsed/filtered in the tags panel
(`ca/TagsPanel.vue`); data persists to `localStorage`.


## Stack

- [Vue 3](https://vuejs.org/) (`<script setup lang="ts">`, Composition API)
- TypeScript (strict mode, `noUnusedLocals`)
- [Vite](https://vitejs.dev/) 6 + `vue-tsc`
- Diagram rendering on `<canvas>` (no third-party visualization libraries)

## Getting started

```bash
npm install
npm run dev        # local dev server (Vite)
npm run build      # type-check (vue-tsc -b) + production build
npm run preview    # preview the production build
npm run type-check # type-check only (vue-tsc --noEmit)
npm test           # unit tests for the automaton core (vitest)
npm run release -- --dry-run   # show what would be published to ../kypaku.github.io/pages/ca2026
npm run release    # build + copy dist/ into the site folder (no commit/push; --target <dir> to override)
```

> On an older Node.js (e.g. 16.x), `npm run dev` / `npm run build` may fail with
> `crypto$2.getRandomValues is not a function` — this is a Vite 6 / old Node.js
> incompatibility, not an application code issue. Building/running dev requires a newer
> Node.js (18+). `npm run type-check` still works fine on Node 16 — use it as the source of
> truth when checking for type errors.


## Release

The demo is served from the GitHub Pages repo `kypaku.github.io`, folder `pages/ca2026`
(the build uses `base: '/pages/ca2026/'`). Publishing is a local, semi-manual step.
Step-by-step checklist for a release (version, checks, commands, manual steps): [RELEASE.md](RELEASE.md).

```bash
npm test                              # core unit tests (vitest, tests/*.test.ts)
npm run type-check
npm run release -- --dry-run          # no build, no writes: diff of dist/ vs the site folder (+ add, ~ update, - delete, = same)
npm run release                       # npm run build, then sync dist/ into ../kypaku.github.io/pages/ca2026
```

- `--target <dir>` publishes into another folder, `--skip-build` reuses the existing `dist/`,
  `--keep <name>` protects an extra file from deletion.
- Files in the target that are not in the build are deleted, except `google*.html` (Search
  Console verification), `CNAME` and `.nojekyll`.
- The script never commits or pushes: it prints the `git commit` command for the site repo.
  Check the page locally, then commit and push the site repo yourself.

### CI

`.github/workflows/ci.yml` (GitHub Actions, Node LTS, npm cache):
- every push and pull request: `npm ci`, `npm run type-check`, `npm test`, `npm run build`;
- a pushed tag `v*` (e.g. `git tag v1.2.0 && git push origin v1.2.0`) additionally runs a
  release build after the checks and uploads `dist/` as the workflow artifact
  `ca2026-dist-<tag>` (kept 90 days; download it from the run page).

Deployment to the site is **not** automated: the site is a different repository, so CI would
need a token with write access to it. To automate it later:
1. Create a fine-grained personal access token limited to `kypaku.github.io` with
   *Contents: read and write*, and store it in this repo as the secret `SITE_DEPLOY_TOKEN`.
2. In the `release-build` job add steps after the build: check out
   `kypaku/kypaku.github.io` with `token: ${{ secrets.SITE_DEPLOY_TOKEN }}` into `site/`; run
   `npm run release -- --skip-build --target site/pages/ca2026`; then in `site/` set a bot
   `git config user.name/user.email`, `git add -A`, commit `ca2026: publish build <tag>` and
   `git push`.
3. Never print the token in logs; keep the job limited to `v*` tags.

## Project structure

```
src/
  App.vue                       — root component
  main.ts                       — entry point
  components/
    CellularAutomatonExplorer.vue — main screen, wires composables and panels together
    ca/                          — panels and controls
      RuleControls.vue, InitControls.vue, LegendPanel.vue, ViewPanel.vue, TagsPanel.vue
      AnalysisPanel.vue, FieldsAnalysisPanel.vue, GlidersAnalysisPanel.vue,
      CustomSearchPanel.vue, LinesAnalysisPanel.vue, ChaosAnalysisPanel.vue,
      SubAnalysisPanel.vue, AnalysisRunControls.vue
  composables/                  — reactive logic (one per feature/analysis)
  constants/ca.ts                — constants (palette, tags, analysis defaults)
  types/ca.ts                    — shared TypeScript types
  utils/
    caMath.ts, caRender.ts, caAnalysis.ts (barrel)
    analysis/                    — pure analysis functions: evolve, classify, fields,
                                    gliders, customSearch, lines, chaos, subAnalysis,
                                    patternMap, patches, shared
```

## Development

- Each analysis type follows the same pattern: a pure function in `utils/analysis/*` + a
  `useRule*Analysis.ts` composable + a `ca/*Panel.vue` panel, wired into
  `CellularAutomatonExplorer.vue`. New analyses are typically added following this template.
- Shared types live in `src/types/ca.ts` (rule/init modes, analysis configs and results, rule
  snapshot, etc.).
- Run `npm run type-check` before committing.

## License

MIT — see [LICENSE](LICENSE).
