# GitHub Action — architecture governance on every PR

> Status: **implemented.** The composite action lives in [`action.yml`](../action.yml);
> this repo dogfoods it in [`.github/workflows/architecture.yml`](../.github/workflows/architecture.yml).
> This is the next step up from a diagram generator: enforcing architecture rules in CI.

## Usage (for consumers)

Once published to npm, another repo enforces its architecture in one step:

```yaml
# .github/workflows/architecture.yml
name: Architecture
on: pull_request
permissions:
  contents: read
  pull-requests: write
jobs:
  architecture:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: builditwithgk/repo-cartographer@v1
        with:
          path: .
          config: .cartographer.yml   # optional; auto-detected if omitted
          level: high                 # optional
```

The step fails the PR when an error-level rule is violated and posts (or updates) a
single sticky PR comment with the diagram and any violations.

## The one job it does

On every pull request:

1. **Enforce architecture rules** — fail the check if the PR introduces a
   forbidden cross-boundary import (e.g. `ui/` importing `db/`) or a new
   dependency cycle.
2. **Regenerate the architecture diagram** and post it (plus any violations) as a
   PR comment.

The enforcement step is **100% deterministic — no LLM in the CI path.** It runs on
the exact import edges `build_import_graph` already produces, so it's fast,
reproducible, and can safely gate a merge. The diagram is the human-friendly
artifact layered on top.

## Why it's credible with what we already have

`build_import_graph(path)` returns `{ nodes, edges }` — directed intra-repo import
edges for JS/TS + Python. Everything below is a pure function over that graph:

- **Forbidden import** = an edge whose `from` matches a boundary glob and whose
  `to` matches a forbidden target glob.
- **Cycle** = a strongly-connected component of size > 1 (Tarjan/DFS over `edges`).

No new analysis engine required — just rules on top of existing facts.

## Config: `.cartographer.yml` (committed to the repo)

```yaml
rules:
  # Fail the PR if any of these import edges exist.
  forbidden:
    - from: "src/ui/**"
      to:   "src/db/**"
      reason: "UI must go through the service layer, not the DB directly."
    - from: "**"
      to:   "src/internal/**"
      reason: "internal/ is private to its package."

  # New import cycles between modules.
  cycles: error        # error | warn | off

diagram:
  level: high          # high | detail
  format: mermaid      # mermaid | dot (Graphviz)
  outPath: docs/architecture   # regenerated each run (architecture.html + raw source)
```

## CLI the Action calls (small delta from today's code)

The published `bin` becomes dual-mode — MCP server by default, CLI when given a
subcommand:

```bash
repo-cartographer                       # (default) MCP stdio server — unchanged
repo-cartographer map   <path> [-o out] [--level high|detail] [--format mermaid|dot]
repo-cartographer check <path> [--config .cartographer.yml]   # exit 1 on error-level violations
```

- `map`  → thin wrapper over the existing `runMapRepo`.
- `check` → `runBuildImportGraph` → load rules → evaluate forbidden edges + cycles
  → print a report + write `violations.json` → `process.exit(hasError ? 1 : 0)`.

New dependencies are confined to this CLI/Action layer (the MCP server stays at
its two deps): a glob matcher (`minimatch`, or a ~30-line subset) and a YAML
parser (`yaml`, or restrict the config to JSON). Cycle detection is hand-rolled.

## The workflow: `.github/workflows/architecture.yml`

```yaml
name: Architecture
on: pull_request

permissions:
  contents: read
  pull-requests: write

jobs:
  architecture:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Enforce architecture rules
        id: check
        run: npx -y repo-cartographer check . --config .cartographer.yml
        # exits 1 (fails the job) if any error-level rule is violated

      - name: Regenerate architecture diagram
        if: always()
        run: npx -y repo-cartographer map . -o docs/architecture --level high

      - name: Comment on the PR
        if: always()
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const mermaid = fs.readFileSync('docs/architecture.mermaid', 'utf8');
            const violations = fs.existsSync('violations.json')
              ? JSON.parse(fs.readFileSync('violations.json', 'utf8')) : [];
            const lines = violations.length
              ? violations.map(v => `${v.level === 'error' ? '❌' : '⚠️'} \`${v.from}\` → \`${v.to}\` — ${v.reason}`)
              : ['✅ No architecture rule violations.'];
            const body = [
              '### 🗺️ Architecture check',
              '', ...lines, '',
              '<details><summary>Updated architecture diagram</summary>',
              '', '```mermaid', mermaid, '```', '', '</details>',
            ].join('\n');
            // upsert a single sticky comment (find-by-marker, then update or create)
            // ...github.rest.issues.{listComments,updateComment,createComment}
```

(Package the three steps as a composite action — `builditwithgk/repo-cartographer-action@v1`
— so consumers add just one `uses:` line.)

## Sample PR comment

> ### 🗺️ Architecture check
>
> **2 violations** (1 error, 1 warning)
>
> ❌ `src/ui/Login.tsx` → `src/db/client.ts` — UI must go through the service layer, not the DB directly.
> ⚠️ new cycle: `orders → risk → orders`
>
> <details><summary>Updated architecture diagram</summary>
>
> *(rendered Mermaid flowchart)*
>
> </details>

## Build checklist (phased)

- [x] **Phase 0** — deterministic import graph (`build_import_graph`).
- [x] **Phase 1 — CLI.** `map` + `check` subcommands; rules loader; glob match; Tarjan cycle detection; `violations.json`; correct exit code.
- [x] **Phase 2 — Action.** Composite `action.yml` + dogfood workflow + sticky PR comment (upsert by marker).
- [x] **Phase 3 — "new" vs "existing".** `check --update-baseline` records accepted violations to `.cartographer-baseline.json`; later runs (auto-detecting that file, or via `--baseline`) fail only on *newly introduced* violations, so adopting on a messy repo doesn't block every PR on day one.
- [ ] **Phase 4** — coupling/fan-in metrics, drift trend, hosted GitHub App + dashboard.

## Design guardrails

- **CI path stays LLM-free and deterministic** — a merge gate must be reproducible.
- **Local-first** — the Action runs in the customer's own CI; source never leaves.
- **Adopt-gradually** — the baseline (`--update-baseline`) is what makes it usable on
  an existing large codebase instead of a wall of red on first install.
