# Release checklist 2026

Current release: **v0.1.0** (2026-10-23). Changes: [CHANGELOG.md](CHANGELOG.md).
How the publishing works in general: README, section *Release*.

## 1. Before the release

- [ ] Working tree is clean and on `master`: `git status`, `git log --oneline -5`.
- [ ] `package.json` and `package-lock.json` have the new version (`npm version <x.y.z> --no-git-tag-version`).
- [ ] `CHANGELOG.md` has a `## <x.y.z> — <date>` section; nothing is left under *Unreleased*.
- [ ] Dependencies are installed from the lock file: `npm ci`.
- [ ] Checks pass locally (the same as CI):
  ```bash
  npm run type-check
  npm test
  npm run build
  ```
- [ ] `npm run preview` — the built app opens, the canvas renders, a rule can be changed,
      the classification ("Analysis") runs without console errors.
- [ ] The site repo `../kypaku.github.io` exists next to this repo and has no uncommitted changes.

## 2. Release commands

```bash
npm run release -- --dry-run     # preview: what will be added (+), updated (~), deleted (-)
npm run release                  # build + sync dist/ into ../kypaku.github.io/pages/ca2026
git tag -a v0.1.0 -m "ca2026 v0.1.0"   # local annotated tag on the release commit
```

Check the dry-run list: only `index.html`, `assets/*` and public files should change;
`google*.html`, `CNAME` and `.nojekyll` must never be in the delete list.

## 3. Left for the owner (manual steps)

These are deliberately not automated and are not done by the release script or by agents:

1. Push this repo and the tag:
   ```bash
   git push origin master
   git push origin v0.1.0        # CI runs the checks and uploads dist/ as ca2026-dist-v0.1.0
   ```
2. Check the CI run for the tag on GitHub (Actions → CI) — both jobs green.
3. Publish the site: in `../kypaku.github.io` review `git status`, open
   `pages/ca2026/index.html` locally, then commit with the command the release script printed
   (`ca2026: publish build ...`) and `git push`.
4. Open the live page (`/pages/ca2026/`) after GitHub Pages finishes and do a quick smoke test.

## After the release

- Add a new `## Unreleased` section at the top of `CHANGELOG.md` for the next changes.
