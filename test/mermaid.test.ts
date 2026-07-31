import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { renderFlowchart, type RenderOptions } from "../src/lib/mermaid.js";
import type { ImportEdge } from "../src/types.js";

const e = (from: string, to: string): ImportEdge => ({ from, to });

const opts = (overrides: Partial<RenderOptions> = {}): RenderOptions => ({
  repoName: "demo",
  level: "high",
  codeFiles: ["src/lib/a.ts", "src/lib/b.ts", "src/tools/t.ts"],
  edges: [e("src/tools/t.ts", "src/lib/a.ts")],
  ...overrides,
});

describe("renderFlowchart — high level", () => {
  test("emits one node per module with a role hint, file count and role styling", () => {
    assert.equal(
      renderFlowchart(opts()),
      [
        "flowchart TD",
        "    %% demo — high-level architecture (DRAFT, refine me)",
        '    n0["src/lib · library code · 2 files"]',
        '    n1["src/tools · tool implementations · 1 file"]',
        "    n1 --> n0",
        "    class n0,n1 shared",
        "    classDef shared fill:#79706e,color:#ffffff,stroke:#5d5654",
      ].join("\n"),
    );
  });

  test("omits the role placeholder and styling for directories with no hint", () => {
    const mermaid = renderFlowchart(opts({ codeFiles: ["widgets/a.ts"], edges: [] }));
    assert.ok(mermaid.includes('n0["widgets · 1 file"]'), mermaid);
    assert.ok(!mermaid.includes("model to infer"), mermaid);
    assert.ok(!mermaid.includes("classDef"), mermaid);
  });

  test("emits a classDef only for categories actually present", () => {
    const mermaid = renderFlowchart(
      opts({ codeFiles: ["src/ui/a.ts", "src/db/b.ts", "widgets/c.ts"], edges: [] }),
    );
    // Sorted nodes: n0=src/db (data), n1=src/ui (ui), n2=widgets (uncategorized).
    assert.ok(mermaid.includes(" class n0 data"), mermaid);
    assert.ok(mermaid.includes(" class n1 ui"), mermaid);
    assert.equal((mermaid.match(/classDef /g) ?? []).length, 2);
    // Every class statement references a defined classDef.
    for (const m of mermaid.matchAll(/class n\d+(?:,n\d+)* (\w+)/g)) {
      assert.ok(mermaid.includes(`classDef ${m[1]} `), `classDef missing for ${m[1]}`);
    }
  });

  test("drops edges whose endpoints collapse into the same module", () => {
    const mermaid = renderFlowchart(
      opts({ codeFiles: ["src/lib/a.ts", "src/lib/b.ts"], edges: [e("src/lib/a.ts", "src/lib/b.ts")] }),
    );
    assert.ok(!mermaid.includes("-->"), mermaid);
  });

  test("class statements never appear at detail level", () => {
    const mermaid = renderFlowchart(opts({ level: "detail" }));
    assert.ok(!mermaid.includes("classDef"), mermaid);
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
    assert.equal(renderFlowchart(shuffled), renderFlowchart(base));
  });
});

describe("renderFlowchart — detail level", () => {
  test("groups file nodes into balanced per-module subgraphs", () => {
    assert.equal(
      renderFlowchart(opts({ level: "detail" })),
      [
        "flowchart TD",
        "    %% demo — detail-level architecture (DRAFT, refine me)",
        '    subgraph g0["src/lib"]',
        '        n0["a.ts"]',
        '        n1["b.ts"]',
        "    end",
        '    subgraph g1["src/tools"]',
        '        n2["t.ts"]',
        "    end",
        "    n2 --> n0",
      ].join("\n"),
    );
  });

  test("every subgraph is closed", () => {
    const mermaid = renderFlowchart(opts({ level: "detail" }));
    const opens = mermaid.split("\n").filter((l) => l.trim().startsWith("subgraph")).length;
    const closes = mermaid.split("\n").filter((l) => l.trim() === "end").length;
    assert.equal(opens, closes);
  });

  test("keeps file-level edges instead of collapsing them", () => {
    const mermaid = renderFlowchart(
      opts({ level: "detail", codeFiles: ["src/lib/a.ts", "src/lib/b.ts"], edges: [e("src/lib/a.ts", "src/lib/b.ts")] }),
    );
    assert.ok(mermaid.includes("n0 --> n1"), mermaid);
  });
});

describe("renderFlowchart — label safety", () => {
  test("strips characters that would break a Mermaid label", () => {
    const mermaid = renderFlowchart(opts({ repoName: 'my"repo"\n[weird]{x}|y<z>' }));
    assert.equal(mermaid.split("\n")[1], "    %% my'repo' weirdxyz — high-level architecture (DRAFT, refine me)");
  });

  test("every node label stays on a single line with balanced quotes", () => {
    const mermaid = renderFlowchart(opts({ repoName: "a\nb" }));
    for (const line of mermaid.split("\n")) {
      assert.equal((line.match(/"/g) ?? []).length % 2, 0, line);
    }
  });
});

describe("renderFlowchart — common shape", () => {
  test("both levels start with a flowchart declaration", () => {
    assert.ok(renderFlowchart(opts({ level: "high" })).startsWith("flowchart TD\n"));
    assert.ok(renderFlowchart(opts({ level: "detail" })).startsWith("flowchart TD\n"));
  });

  test("an empty repo still produces a valid header", () => {
    assert.equal(
      renderFlowchart(opts({ codeFiles: [], edges: [] })),
      ["flowchart TD", "    %% demo — high-level architecture (DRAFT, refine me)"].join("\n"),
    );
  });
});
