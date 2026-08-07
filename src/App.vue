<script setup lang="ts">
import CellularAutomatonExplorer from './components/CellularAutomatonExplorer.vue'
import { useTheme } from './composables/useTheme'

const { theme, toggleTheme } = useTheme()
</script>

<template>
  <main class="app-shell">
    <div class="app-topbar">
      <h1>Cellular Automaton Simulator</h1>
      <div class="app-topbar-actions">
        <button
          type="button"
          class="icon-btn"
          :title="theme === 'dark' ? 'Light theme' : 'Dark theme'"
          :aria-label="theme === 'dark' ? 'Enable light theme' : 'Enable dark theme'"
          @click="toggleTheme"
        >
          <svg
            v-if="theme === 'dark'"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="4" />
            <line x1="12" y1="1" x2="12" y2="3" />
            <line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" />
            <line x1="21" y1="12" x2="23" y2="12" />
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
          </svg>
          <svg
            v-else
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        </button>
        <a
          class="icon-btn"
          href="https://github.com/Kypaku/ca2026"
          target="_blank"
          rel="noopener noreferrer"
          title="GitHub: Kypaku"
          aria-label="GitHub: Kypaku"
        >
          <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path
              d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38
              0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13
              -.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07
              -1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82
              .64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12
              .51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2
              0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"
            />
          </svg>
        </a>
      </div>
    </div>
    <CellularAutomatonExplorer />

    <details class="app-about">
      <summary><h2>About this simulator</h2></summary>
      <div class="app-about-body">
        <section>
          <p>
            An interactive explorer for one-dimensional cellular automata. Define a rule, run it,
            and study the resulting space-time diagram — or let the app scan thousands of rules
            automatically and tag the interesting ones.
          </p>
        </section>

        <section>
          <h3>What you can do</h3>
          <ul>
            <li>
              Run automata with an arbitrary number of cell states (2–36), a neighborhood of 3, 5 or
              7 cells, and a temporal depth of up to 8 previous rows.
            </li>
            <li>
              Define rules in several ways: <strong>totalistic</strong> (keyed by the sum of the
              neighbors), <strong>by templates</strong> (a full local transition table, editable as
              JSON, including stochastic entries), <strong>by descendants</strong> (each live cell
              emits children that collide by a chosen rule), or by generating a random rule.
            </li>
            <li>Start from a single live cell, random noise of a given density, or a custom row.</li>
            <li>
              Render the space-time diagram on canvas, continue an existing run for extra
              generations, reduce the field to a pattern map, and export very large diagrams
              directly to PNG.
            </li>
            <li>
              Generate rules that conserve the number of cells of a chosen “particle” state, derived
              statically from the rule table.
            </li>
          </ul>
        </section>

        <section>
          <h3>Automated rule analysis</h3>
          <p>
            Each analysis scans a code range, a random sample of rules, or a set of already tagged
            rules, and attaches a tag to every match:
          </p>
          <ul>
            <li><strong>Classification</strong> — dead, fixed, periodic, stable, chaotic, complex.</li>
            <li>
              <strong>Fields</strong> — a repeating, possibly drifting pattern covering most of the
              diagram.
            </li>
            <li><strong>Gliders</strong> — localized structures that reappear shifted sideways.</li>
            <li>
              <strong>Custom search</strong> — user-drawn templates with wildcards and equality
              variables.
            </li>
            <li><strong>Absence of lines</strong> — full-height vertical or diagonal solid streaks.</li>
            <li>
              <strong>Chaos</strong> and <strong>Chaos 2</strong> — dominant-pattern share and
              pattern diversity.
            </li>
            <li><strong>All states present</strong> — every state still occurs late in the run.</li>
            <li><strong>Sub-analysis</strong> — an extra pass detecting large surviving structures.</li>
          </ul>
        </section>

        <section>
          <h3>About cellular automata</h3>
          <p>
            A one-dimensional cellular automaton is a row of cells that all update at the same time
            according to one local rule applied to each cell's neighborhood. Stacking every
            generation under the previous one produces a space-time diagram. Despite the simplicity
            of the rules, these systems produce the full range of behavior — from an immediately
            dead field to periodic structures, chaos and computationally universal patterns such as
            elementary rule 110.
          </p>
          <p>
            Source code:
            <a href="https://github.com/Kypaku/ca2026" rel="noopener">github.com/Kypaku/ca2026</a>
          </p>
        </section>
      </div>
    </details>
  </main>
</template>

<!--
  These styles are intentionally NOT scoped: the static shell in index.html
  reuses the same markup and must look identical before the app mounts.
-->
<style>
.app-shell {
  max-width: 960px;
  margin: 0 auto;
  padding: 1.5rem;
  text-align: left;
}
@media (min-width: 1400px) {
  .app-shell {
    max-width: none;
    padding: 1.5rem 2rem;
  }
}
.app-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 1rem;
}
.app-topbar h1 {
  font-size: 1.6em;
  margin: 0;
}
.app-topbar-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}
.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  padding: 0;
  border-radius: 999px;
  border: 1px solid transparent;
  background-color: transparent;
  color: inherit;
  cursor: pointer;
  transition: background-color 0.2s, border-color 0.2s;
}
.icon-btn:hover {
  background-color: rgba(128, 128, 128, 0.15);
  border-color: #646cff;
}
.icon-btn svg {
  width: 22px;
  height: 22px;
}
</style>
