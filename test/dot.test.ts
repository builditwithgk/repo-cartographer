import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { renderDot } from "../src/lib/dot.js";
import { runGenerateDiagram } from "../src/tools/generateDiagram.js";
import type { ImportEdge, RenderOptions } from "../src/types.js";
import { makeCodeRepo } from "./helpers/fixture.js";

const e = (from: string, to: string): ImportEdge => ({ from, to });

const opts = (overrides: Partial<RenderOptions> = {}): RenderOptions => ({
  repoName: "demo",
  level: "high",
  codeFiles: ["src/lib/a.ts", "src/lib/b.ts", "src/tools/t.ts"],
  edges: [e("src/tools/t.ts", "src/lib/a.ts")],
  ...overrides,
});

describe("renderDot — high level", () => {
  test("emits a styled digraph with one node per module", () => {
    assert.equal(
      renderDot(opts()),
      [
        'digraph "demo" {',
        "    // demo — high-level architecture (DRAFT, refine me)",
        "    rankdir=TB;",
        '    node [shape=box, style="rounded,filled", fontname="Helvetica,Arial,sans-serif", fillcolor="#eef1f4", color="#8b949e", fontcolor="#1f2328"];',
        '    edge [color="#57606a"];',
        '    "src/lib" [label="src/lib\\nlibrary code\\n2 files", fillcolor="#79706e", fontcolor="#ffffff", color="#5d5654"];',
        '    "src/tools" [label="src/tools\\ntool implementations\\n1 file", fillcolor="#79706e", fontcolor="#ffffff", color="#5d5654"];',
        '    "src/tools" -> "src/lib";',
        "}",
      ].join("\n"),
    );
  });

  test("uncategorized modules keep the neutral default style", () => {
    const dot = renderDot(opts({ codeFiles: ["widgets/a.ts"], edges: [] }));
    assert.ok(dot.includes('"widgets" [label="widgets\\n1 file"];'), dot);
    assert.ok(!dot.includes('"widgets" [label="widgets\\n1 file", fillcolor'), dot);
  });

  test("drops edges to modules that are not nodes (DOT would auto-create them)", () => {
    const dot = renderDot(opts({ edges: [e("src/tools/t.ts", "ghost/x.ts")] }));
    assert.ok(!dot.includes("ghost"), dot);
  });

  test("escapes quotes and backslashes in the repo name", () => {
    const dot = renderDot(opts({ repoName: 'my"repo\\v1', codeFiles: [], edges: [] }));
    assert.ok(dot.startsWith('digraph "my\\"repo\\\\v1" {'), dot);
  });

  test("label line breaks are a single \\n escape, never double-escaped", () => {
    // Regression: escaping after joining turned '\n' into '\\n', which Graphviz
    // renders as literal text instead of a line break.
    const dot = renderDot(opts());
    assert.ok(dot.includes("src/lib\\nlibrary code"), dot);
    assert.ok(!dot.includes("\\\\n"), dot);
  });

  test("is stable when the input ordering changes", () => {
    const base = opts({
      codeFiles: ["src/a/x.ts", "src/b/y.ts", "src/c/z.ts"],
      edges: [e("src/c/z.ts", "src/a/x.ts"), e("src/a/x.ts", "src/b/y.ts")],
    });
    const shuffled: RenderOptions = {
      ...base,
      codeFiles: [...base.codeFiles].reverse(),
      edges: [...base.edges].reverse(),
    };
    assert.equal(renderDot(shuffled), renderDot(base));
  });

  test("an empty repo still produces a well-formed digraph", () => {
    const dot = renderDot(opts({ codeFiles: [], edges: [] }));
    assert.ok(dot.startsWith('digraph "demo" {'));
    assert.ok(dot.endsWith("}"));
  });
});

describe("renderDot — detail level", () => {
  test("groups file nodes into per-module clusters with role-colored borders", () => {
    const dot = renderDot(opts({ level: "detail" }));
    assert.equal(
      dot,
      [
        'digraph "demo" {',
        "    // demo — detail-level architecture (DRAFT, refine me)",
        "    rankdir=TB;",
        '    node [shape=box, style="rounded,filled", fontname="Helvetica,Arial,sans-serif", fillcolor="#eef1f4", color="#8b949e", fontcolor="#1f2328"];',
        '    edge [color="#57606a"];',
        "    subgraph cluster_0 {",
        '        label="src/lib";',
        '        color="#5d5654";',
        '        "src/lib/a.ts" [label="a.ts"];',
        '        "src/lib/b.ts" [label="b.ts"];',
        "    }",
        "    subgraph cluster_1 {",
        '        label="src/tools";',
        '        color="#5d5654";',
        '        "src/tools/t.ts" [label="t.ts"];',
        "    }",
        '    "src/tools/t.ts" -> "src/lib/a.ts";',
        "}",
      ].join("\n"),
    );
  });

  test("braces stay balanced", () => {
    const dot = renderDot(opts({ level: "detail" }));
    assert.equal((dot.match(/{/g) ?? []).length, (dot.match(/}/g) ?? []).length);
  });

  test("keeps file-level edges and drops dangling ones", () => {
    const dot = renderDot(
      opts({
        level: "detail",
        edges: [e("src/lib/a.ts", "src/lib/b.ts"), e("src/lib/a.ts", "missing.ts")],
      }),
    );
    assert.ok(dot.includes('"src/lib/a.ts" -> "src/lib/b.ts";'), dot);
    assert.ok(!dot.includes("missing.ts"), dot);
  });
});

describe("runGenerateDiagram — format plumbing", () => {
  test("emits Mermaid by default and DOT on request, from the same facts", () => {
    const { root } = makeCodeRepo({
      "src/ui/page.ts": `import "../db/query.js";\n`,
      "src/db/query.ts": "export const q = 1;\n",
    });

    const mermaid = runGenerateDiagram(root, "high");
    const dot = runGenerateDiagram(root, "high", "dot");

    assert.ok(mermaid.startsWith("flowchart TD"), mermaid);
    assert.ok(dot.startsWith("digraph "), dot);
    // Same module edge in both notations.
    assert.ok(mermaid.includes("n1 --> n0"), mermaid);
    assert.ok(dot.includes('"src/ui" -> "src/db";'), dot);
  });

  test("descends past a zip wrapper folder, so modules do not collapse into one", () => {
    // GitHub's "Download ZIP" wraps the repo in <name>-main/. Without the
    // descent this repo maps as a single module with zero high-level edges.
    const { root } = makeCodeRepo({
      "repo-main/src/ui/page.ts": `import "../db/query.js";\n`,
      "repo-main/src/db/query.ts": "export const q = 1;\n",
    });

    const mermaid = runGenerateDiagram(root, "high");

    assert.ok(mermaid.includes("n1 --> n0"), mermaid); // src/ui -> src/db survived
    // The title may carry the wrapper's name (it IS the repo name in a GitHub
    // zip), but module keys must be relative to the descended root.
    assert.ok(!mermaid.includes("repo-main/"), mermaid);
    assert.ok(mermaid.includes('"src/ui · UI layer · 1 file"'), mermaid);
  });
});
