import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { runRenderDiagram } from "../src/tools/renderDiagram.js";
import { makeRepo } from "./helpers/fixture.js";

const MERMAID = 'flowchart TD\n    n0["src/lib · library code · 2 files"]\n    n0 --> n0\n';
const DOT = 'digraph "demo" {\n    "src/tools" -> "src/lib";\n}\n';

describe("runRenderDiagram — mermaid (default)", () => {
  test("writes sibling .html and .mermaid files and returns absolute paths", () => {
    const out = join(makeRepo({}), "docs", "architecture");
    const result = runRenderDiagram(MERMAID, out);

    assert.equal(result.htmlPath, resolve(`${out}.html`));
    assert.equal(result.sourcePath, resolve(`${out}.mermaid`));
    assert.equal(result.format, "mermaid");
    assert.ok(existsSync(result.htmlPath));
    assert.ok(existsSync(result.sourcePath));
  });

  test("creates missing parent directories", () => {
    const out = join(makeRepo({}), "deeply", "nested", "arch");
    assert.ok(existsSync(runRenderDiagram(MERMAID, out).htmlPath));
  });

  test("the source file is the diagram verbatim", () => {
    const out = join(makeRepo({}), "arch");
    assert.equal(readFileSync(runRenderDiagram(MERMAID, out).sourcePath, "utf8"), MERMAID);
  });

  test("strips a supplied .html/.mermaid/.dot extension instead of doubling it", () => {
    const base = join(makeRepo({}), "arch");
    for (const supplied of [`${base}.html`, `${base}.mermaid`, `${base}.dot`, `${base}.HTML`]) {
      const result = runRenderDiagram(MERMAID, supplied);
      assert.equal(result.htmlPath, resolve(`${base}.html`));
      assert.equal(result.sourcePath, resolve(`${base}.mermaid`));
    }
  });

  test("the HTML embeds the diagram and titles itself from the file name", () => {
    const out = join(makeRepo({}), "my-repo");
    const html = readFileSync(runRenderDiagram(MERMAID, out).htmlPath, "utf8");

    assert.match(html, /^<!doctype html>/);
    assert.match(html, /<title>my-repo — architecture<\/title>/);
    assert.ok(html.includes('<pre class="mermaid">'));
    assert.ok(html.includes("flowchart TD"));
    assert.ok(html.includes("mermaid.esm.min.mjs"), "expected the Mermaid CDN renderer");
    assert.ok(!html.includes("viz-standalone"), "mermaid page must not pull the Viz renderer");
  });

  test("escapes HTML-significant characters in the rendered source blocks", () => {
    const out = join(makeRepo({}), "arch");
    const html = readFileSync(runRenderDiagram("flowchart TD\n    a --> b\n    %% <b>&\n", out).htmlPath, "utf8");

    assert.ok(html.includes("%% &lt;b&gt;&amp;"), "expected < > & to be entity-escaped");
    // Mermaid arrows are escaped too, so "-->" never closes an HTML comment.
    assert.ok(html.includes("a --&gt; b"));
  });

  test("a '</script>' in the diagram cannot break out of the inlined script block", () => {
    const out = join(makeRepo({}), "arch");
    const evil = "flowchart TD\n    %% </script><img src=x onerror=alert(1)>\n";
    const html = readFileSync(runRenderDiagram(evil, out).htmlPath, "utf8");

    // The payload is inlined as `const SRC = <json>` — a raw </script> there would
    // close the block early and make the rest of the diagram live HTML.
    assert.ok(!html.includes("</script><img"), "diagram text broke out of the script block");
    assert.ok(html.includes("\\u003c/script>"), "expected '<' to be escaped in the JSON payload");
  });
});

describe("runRenderDiagram — dot", () => {
  test("writes .dot as the source sibling and reports the format", () => {
    const out = join(makeRepo({}), "arch");
    const result = runRenderDiagram(DOT, out, "dot");

    assert.equal(result.htmlPath, resolve(`${out}.html`));
    assert.equal(result.sourcePath, resolve(`${out}.dot`));
    assert.equal(result.format, "dot");
    assert.equal(readFileSync(result.sourcePath, "utf8"), DOT);
  });

  test("the HTML uses the Viz renderer, not Mermaid", () => {
    const out = join(makeRepo({}), "arch");
    const html = readFileSync(runRenderDiagram(DOT, out, "dot").htmlPath, "utf8");

    assert.ok(html.includes("@viz-js/viz"), "expected the Viz CDN renderer");
    assert.ok(html.includes('id="graph"'));
    assert.ok(!html.includes('<pre class="mermaid">'), "dot page must not declare a mermaid block");
    assert.ok(!html.includes("mermaid.esm.min.mjs"));
    // The raw source is still viewable, escaped.
    assert.ok(html.includes("digraph &quot;demo&quot;") || html.includes('digraph "demo"'));
  });

  test("a '</script>' in the DOT source cannot break out of the script block", () => {
    const out = join(makeRepo({}), "arch");
    const evil = 'digraph "x" {\n    a [label="</script><img src=x onerror=alert(1)>"];\n}\n';
    const html = readFileSync(runRenderDiagram(evil, out, "dot").htmlPath, "utf8");

    assert.ok(!html.includes("</script><img"), "diagram text broke out of the script block");
    assert.ok(html.includes("\\u003c/script>"), "expected '<' to be escaped in the JSON payload");
  });
});

describe("runRenderDiagram — error paths", () => {
  test("refuses to render an empty diagram", () => {
    const out = join(makeRepo({}), "arch");
    assert.throws(() => runRenderDiagram("", out), /Refusing to render an empty diagram/);
    assert.throws(() => runRenderDiagram("   \n ", out), /Refusing to render an empty diagram/);
    assert.ok(!existsSync(`${out}.html`));
  });

  test("reports an unwritable output path as a clear error", () => {
    // A path whose parent is an existing *file* cannot be created as a directory.
    const root = makeRepo({ "blocker.txt": "" });
    assert.throws(
      () => runRenderDiagram(MERMAID, join(root, "blocker.txt", "arch")),
      /Could not write diagram files/,
    );
  });
});
