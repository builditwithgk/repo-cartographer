import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { collapseToModules, extractImports } from "../src/lib/imports.js";
import type { ImportEdge } from "../src/types.js";
import { makeCodeRepo } from "./helpers/fixture.js";

const e = (from: string, to: string): ImportEdge => ({ from, to });

/** A NUL byte in the first 4 KB is what marks a file as binary. */
const NUL = String.fromCharCode(0);

describe("extractImports — JavaScript / TypeScript", () => {
  test("resolves every supported import form to intra-repo edges", () => {
    const { root, codeFiles } = makeCodeRepo({
      "index.ts": `import { a } from "./src/a.js";\nimport fs from "node:fs";\n`,
      "src/a.ts": `export { b } from "./b.js";\n`,
      "src/b.ts": `const c = require("./sub");\nimport("./b.js");\n`,
      "src/sub/index.ts": `import "../../index.js";\n`,
    });

    const result = extractImports(root, codeFiles);

    assert.deepEqual(result.edges, [
      e("index.ts", "src/a.ts"), //          import ... from
      e("src/a.ts", "src/b.ts"), //          export ... from
      e("src/b.ts", "src/sub/index.ts"), //  require() -> directory index
      e("src/sub/index.ts", "index.ts"), //  bare side-effect import, ../.. resolution
    ]);
    assert.equal(result.filesScanned, 4);
    assert.equal(result.externalImports, 1); // node:fs
  });

  test("rewrites a '.js' specifier onto the '.ts' file that produces it", () => {
    const { root, codeFiles } = makeCodeRepo({
      "a.ts": `import "./b.js";\n`,
      "b.ts": "export const b = 1;\n",
    });
    assert.deepEqual(extractImports(root, codeFiles).edges, [e("a.ts", "b.ts")]);
  });

  test("resolves an extensionless specifier and a directory index", () => {
    const { root, codeFiles } = makeCodeRepo({
      "a.ts": `import "./b";\nimport "./dir";\n`,
      "b.tsx": "export const b = 1;\n",
      "dir/index.js": "module.exports = {};\n",
    });
    assert.deepEqual(extractImports(root, codeFiles).edges, [e("a.ts", "b.tsx"), e("a.ts", "dir/index.js")]);
  });

  test("counts bare and repo-escaping specifiers as external instead of edging them", () => {
    const { root, codeFiles } = makeCodeRepo({
      "a.ts": `import "react";\nimport "@scope/pkg";\nimport "../outside.js";\nimport "./missing.js";\n`,
    });
    const result = extractImports(root, codeFiles);
    assert.deepEqual(result.edges, []);
    assert.equal(result.externalImports, 4);
  });

  test("ignores self-imports", () => {
    const { root, codeFiles } = makeCodeRepo({ "a.ts": `import "./a.js";\n` });
    const result = extractImports(root, codeFiles);
    assert.deepEqual(result.edges, []);
    assert.equal(result.externalImports, 0);
  });

  test("de-duplicates repeated edges between the same pair", () => {
    const { root, codeFiles } = makeCodeRepo({
      "a.ts": `import { x } from "./b.js";\nimport { y } from "./b.js";\nconst z = require("./b");\n`,
      "b.ts": "export const x = 1, y = 2;\n",
    });
    assert.deepEqual(extractImports(root, codeFiles).edges, [e("a.ts", "b.ts")]);
  });

  test("skips binary and missing files without crashing", () => {
    const { root, codeFiles } = makeCodeRepo({
      "a.ts": `import "./b.js";\n`,
      "b.ts": "export const b = 1;\n",
      "blob.js": `${NUL}${NUL}import "./a.js";`,
    });

    const result = extractImports(root, [...codeFiles, "deleted.ts"]);

    assert.equal(result.filesScanned, 2); // blob.js is binary, deleted.ts does not exist
    assert.deepEqual(result.edges, [e("a.ts", "b.ts")]);
  });
});

describe("extractImports — Python", () => {
  test("resolves absolute, relative and package imports", () => {
    const { root, codeFiles } = makeCodeRepo({
      "main.py": "import pkg.mod\nfrom pkg import helper\nimport os\n",
      "pkg/__init__.py": "from .mod import thing\n",
      "pkg/mod.py": "from . import util\nfrom ..main import go\n",
      "pkg/util.py": "",
    });

    const result = extractImports(root, codeFiles);

    assert.deepEqual(result.edges, [
      e("main.py", "pkg/__init__.py"), //    from pkg import helper -> package __init__
      e("main.py", "pkg/mod.py"), //         import pkg.mod
      e("pkg/__init__.py", "pkg/mod.py"), // from .mod import thing
      e("pkg/mod.py", "main.py"), //         from ..main import go
      e("pkg/mod.py", "pkg/util.py"), //     from . import util
    ]);
    assert.equal(result.externalImports, 1); // os
    assert.equal(result.filesScanned, 4);
  });

  test("'from . import a, b' edges to each sibling submodule", () => {
    const { root, codeFiles } = makeCodeRepo({
      "pkg/__init__.py": "",
      "pkg/mod.py": "from . import alpha, beta as b\n",
      "pkg/alpha.py": "",
      "pkg/beta.py": "",
    });
    assert.deepEqual(extractImports(root, codeFiles).edges, [
      e("pkg/mod.py", "pkg/alpha.py"),
      e("pkg/mod.py", "pkg/beta.py"),
    ]);
  });

  test("handles multiple modules on one import line", () => {
    const { root, codeFiles } = makeCodeRepo({
      "main.py": "import alpha, beta, json\n",
      "alpha.py": "",
      "beta.py": "",
    });
    const result = extractImports(root, codeFiles);
    assert.deepEqual(result.edges, [e("main.py", "alpha.py"), e("main.py", "beta.py")]);
    assert.equal(result.externalImports, 1); // json
  });

  test("ignores commented-out imports", () => {
    const { root, codeFiles } = makeCodeRepo({
      "main.py": "# import secret\n  # from . import secret\nimport real\n",
      "real.py": "",
      "secret.py": "",
    });
    assert.deepEqual(extractImports(root, codeFiles).edges, [e("main.py", "real.py")]);
  });

  test("resolves a .pyi stub", () => {
    const { root, codeFiles } = makeCodeRepo({
      "main.py": "import stub\n",
      "stub.pyi": "",
    });
    assert.deepEqual(extractImports(root, codeFiles).edges, [e("main.py", "stub.pyi")]);
  });
});

describe("extractImports — determinism", () => {
  test("edges are sorted and stable across runs and input orderings", () => {
    const { root, codeFiles } = makeCodeRepo({
      "z.ts": `import "./m.js";\n`,
      "m.ts": `import "./a.js";\n`,
      "a.ts": `import "./z.js";\n`,
    });

    const first = extractImports(root, codeFiles);
    const second = extractImports(root, [...codeFiles].reverse());

    assert.deepEqual(first.edges, [e("a.ts", "z.ts"), e("m.ts", "a.ts"), e("z.ts", "m.ts")]);
    assert.deepEqual(second.edges, first.edges);
  });
});

describe("collapseToModules", () => {
  test("drops intra-module edges and de-duplicates the rest", () => {
    const codeFiles = ["index.ts", "src/lib/a.ts", "src/lib/b.ts", "src/tools/t.ts", "src/tools/u.ts"];
    const edges = [
      e("src/lib/a.ts", "src/lib/b.ts"), //  intra-module -> dropped
      e("src/tools/t.ts", "src/lib/a.ts"),
      e("src/tools/u.ts", "src/lib/b.ts"), // collapses onto the same module edge
      e("index.ts", "src/tools/t.ts"),
    ];

    assert.deepEqual(collapseToModules(codeFiles, edges), {
      nodes: ["(root)", "src/lib", "src/tools"],
      edges: [e("(root)", "src/tools"), e("src/tools", "src/lib")],
    });
  });

  test("lists modules that have no edges", () => {
    const { nodes } = collapseToModules(["src/lib/a.ts", "docs/x.ts"], []);
    assert.deepEqual(nodes, ["docs", "src/lib"]);
  });

  test("is stable regardless of input ordering", () => {
    const codeFiles = ["src/a/x.ts", "src/b/y.ts", "src/c/z.ts"];
    const edges = [e("src/c/z.ts", "src/a/x.ts"), e("src/a/x.ts", "src/b/y.ts")];
    assert.deepEqual(
      collapseToModules([...codeFiles].reverse(), [...edges].reverse()),
      collapseToModules(codeFiles, edges),
    );
  });
});
