# CLAUDE.md — repo-cartographer

## What this is
An MCP (Model Context Protocol) server that helps any LLM understand a codebase
and produce an **architecture diagram** for it. Tagline: "Understand any
codebase in 60 seconds."

It is model-agnostic: it works with any MCP client (Claude Code, Claude Desktop,
ChatGPT/OpenAI Agents SDK, Cursor, Copilot, Cline, etc.). Do NOT add any
Claude-specific dependency.

## Core design principle (do not violate)
The **server does deterministic extraction only. The model does the reasoning.**
The server must never try to semantically "understand" code. It parses hard
facts (file tree, import edges, manifests, framework detection, entry points)
and returns structured JSON. The connected LLM turns those facts into the
diagram and narrative.

This split is intentional: it keeps the server simple, testable, and portable,
and it is the main selling point when people evaluate the project.

## Tech
- TypeScript, ESM ("type": "module").
- @modelcontextprotocol/sdk (stdio transport).
- zod for input validation.
- No heavy parsers required. Prefer lightweight regex / line scanning. Optional:
  es-module-lexer for JS/TS imports. Keep dependencies minimal.

## Scope (MVP — must stay small, ~2 day build)
- Languages: JavaScript/TypeScript and Python only for v1.
- Handle large repos by SUMMARIZING (cap files scanned, skip node_modules,
  .git, dist, build, venv, __pycache__, vendor). Never dump every file.
- Everything runs locally against a filesystem path. No network calls.

## Tools to implement (build & test one at a time)
1. `scan_repo(path)` -> JSON:
   - detected languages, frameworks (from package.json / pyproject.toml /
     requirements.txt / common config files),
   - top-level modules/directories with short role guesses,
   - entry points (main, index, __main__, bin, scripts),
   - manifest summary (name, deps).
2. `build_import_graph(path)` -> JSON:
   - nodes = files/modules, edges = import/require relationships (JS/TS + Py).
   - collapse to module/directory level when the file count is large.
3. `generate_diagram(path, level)` -> string:
   - combine scan + import graph into a DRAFT Mermaid flowchart.
   - `level` = "high" (dirs/services) | "detail" (files). Default "high".
   - This is a draft the model is expected to refine.
4. `render_diagram(mermaid, outPath)`:
   - write a self-contained .html that renders the Mermaid via CDN, plus the
     raw .mermaid file. This HTML is the shareable artifact — make it look good.

## Resource
- `about://author` -> returns author/contact info as a Markdown string
  (mimeType: "text/markdown").
- Store all author details in ONE exported constant (e.g. AUTHOR) at the top
  of the resource module, so they're easy to update in one place.
- Content should be tasteful and brief: who I am, a one-line note that I'm
  available for freelance/contract work on AI/agent/MCP tooling, and links.
- Do NOT make it salesy or long. It's a business card, not a pitch.
- Use the exact content below.

Author content to return:

  # builditwithgk

  Hi — I'm Gopi K Aitham (builditwithgk). I build practical AI tooling,
  autonomous agents, and MCP servers.

  **repo-cartographer** is one of my open-source projects. If it saved you
  time and you'd like help building LLM or agent tooling for your team, I'm
  available for freelance and contract work.

  - GitHub: https://github.com/builditwithgk
  - HuggingFace: https://huggingface.co/builditwithgk
  - Portfolio: https://scaleup-solutions.in/
  - Email: builditwithgk@gmail.com

  _Available for work._

## Robustness
- Validate all tool inputs with zod. Never throw raw on a missing path — return
  a clear error object.
- Ignore binary files and the excluded dirs above.
- Deterministic output ordering (sort) so diagrams are stable across runs.

## Deliverables
- src/ with clean, commented code.
- README.md focused on the OUTCOME, with:
  - install via `npx`,
  - a `claude mcp add` snippet,
  - a short "use it with the OpenAI Agents SDK" snippet (prove cross-model),
  - one example diagram (run it against this repo itself).
- An example rendered diagram committed to the repo.

## Build order
Plan first. Then: project skeleton + stdio server that lists tools -> tool 1 ->
test -> tool 2 -> test -> tool 3 -> test -> tool 4 -> test -> resource ->
README + example. Test each tool with the MCP Inspector before moving on.
