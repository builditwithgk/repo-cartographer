# TODO / Tech debt — repo-cartographer

## Deferred (intentionally, for now)
- [x] **Initial git commit** — published to https://github.com/builditwithgk/repo-cartographer (2026-07-31).
- [x] **Publish to npm** — `repo-cartographer@1.0.0` live (2026-08-05); `npx -y repo-cartographer` verified cold. Floating `v1` tag pushed, so `uses: builditwithgk/repo-cartographer@v1` works for external repos.

## Roadmap — the "enterprising" direction
- [x] **One-shot `map_repo(path)`** — path in, downloadable diagram out (shipped).
- [x] **CLI (`map` + `check`)** — dual-mode binary; `check` enforces forbidden imports + cycles from a `.cartographer.yml`, writes `violations.json`, exits 1 on error. (shipped)
- [x] **GitHub Action (Phase 2)** — composite [`action.yml`](action.yml) + dogfood workflow that runs `check` on every PR and posts diagram + violations as a sticky comment. (shipped)
- [x] **"New violations only" (Phase 3)** — `check --update-baseline` writes `.cartographer-baseline.json`; later runs fail only on newly-introduced violations. (shipped)
- [x] **Publish to npm** — done (2026-08-05); the `@v1` Action is now consumable by external repos.
- [x] **Unit tests** — 169 tests under [`test/`](test/) via `node:test` + `tsx` (`npm test`), no new dependencies and no build step. Cover import resolution (JS/TS + Python), module collapsing, Tarjan cycles, rule globs, config loading, baseline diffing, walking, manifest/entry-point detection, Mermaid + DOT rendering and `runCheck` end-to-end. `npm run typecheck` type-checks `src/` + `test/` together via [`tsconfig.test.json`](tsconfig.test.json). (shipped)
- [x] **Zip-wrapper auto-descent** — a directory containing no files and exactly one visible subfolder (GitHub "Download ZIP" shape) is stepped past (bounded, noted in tool output) by every tool via `resolveRepoRoot`. Guard: a lone source container (`src/`, `lib/`, `packages/`…) is never treated as a wrapper — that would rewrite every repo-relative glob. Found by testing the fresh-clone flow against extracted sample zips: pre-fix, a 219-file repo mapped as "1 module · 0 edges". Also added: `LICENSE` (MIT — README/package.json already claimed it). (shipped)
- [x] **Diagram formats + role styling** — `format: mermaid | dot` on `map_repo`/`generate_diagram`/`render_diagram`, `--format` on the CLI, `diagram.format` in `.cartographer.yml`, and a `format` input on the Action (comment pins mermaid — the PR fence can't render DOT). High-level diagrams color modules by role family (shared palette across both emitters); DOT HTML renders via the Viz CDN. `map` now reads its defaults from the config's `diagram:` section (flags win) — that section used to be dead config. Strategy: Mermaid because that's where people read it, DOT because that's what their tools eat. (shipped)

## Found by the tests (fixed)
- [x] **Raw NUL bytes in source.** `src/lib/baseline.ts` and `src/lib/imports.ts` used a literal NUL as a composite-key separator, stored as an actual byte. Git would have marked both files binary (no diffs, no reviewable PRs), and any text-normalizing tool could silently delete the separator and change key semantics. Replaced with escape sequences — identical at runtime, ASCII in source.
- [x] **A hidden architecture violation, caused by the above.** `readTextCapped` skips any file with a NUL in the first 4 KB as binary, so `src/lib/baseline.ts` was never scanned for imports — hiding its `import type { Violation } from "../tools/checkRepo.js"`, a real breach of this repo's own `src/lib/** -> src/tools/**` rule. `Violation`/`CheckResult` now live in `src/types.ts` (re-exported from `checkRepo.ts` for compatibility) so dependencies point inward.
- [x] **HTML injection in the rendered diagram.** `render_diagram` inlined the Mermaid source into a `<script>` block via `JSON.stringify` without escaping `<`, so a `</script>` in the diagram text closed the block early and turned the rest into live HTML in the shareable `architecture.html`. Not reachable through `map_repo` (labels are escaped), but `render_diagram` accepts arbitrary text. Now escaped via `jsonForScript()`.

## Possible enhancements (v2+)
- [ ] More formats behind the same enum, only on demand: D2 (prettiest, but audience overlaps DOT) and C4/Structurizr (needs module filtering/levels first — revisit after Phase 4 metrics exist).
- [ ] `diagram.direction` (TD/LR) option — LR reads better for layered repos; kept out of v1 to avoid auto-detection flakiness in diffs.
- [ ] Swap regex import parsing for `es-module-lexer` (JS/TS) for higher-fidelity edges. Currently pure regex to keep deps minimal.
- [ ] Distinguish `import type` from a value import so type-only edges can be reported separately (the regex parser treats them alike).
- [ ] Support more languages (Go, Rust, Java) beyond JS/TS + Python.
- [ ] Option to vendor Mermaid into the rendered HTML so it works fully offline (today it loads Mermaid from a CDN at view time).
- [ ] Parse the `requirements/*.txt` directory layout, not just files *named* `requirements*.txt`. Current behaviour is pinned by a test in `test/detect.test.ts`.
- [ ] Consider declaring `engines` in `package.json` before publishing (`npm test` needs Node >= 22 for `node --test` glob patterns).
