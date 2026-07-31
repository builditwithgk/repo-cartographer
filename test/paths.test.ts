import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  basename,
  extname,
  isCodeFile,
  joinPosix,
  moduleKey,
  posixDirname,
  posixNormalize,
  stripCodeExt,
} from "../src/lib/paths.js";

describe("extname", () => {
  test("returns a lowercased extension", () => {
    assert.equal(extname("src/a.ts"), ".ts");
    assert.equal(extname("SRC/A.TS"), ".ts");
  });

  test("returns '' when the only dot is in a directory name", () => {
    assert.equal(extname("my.dir/file"), "");
    assert.equal(extname("file"), "");
  });

  test("dotfiles have no usable extension for our purposes", () => {
    // extname(".gitignore") technically returns the whole name, but the only
    // consumer is isCodeFile, which rejects it — pin that behaviour.
    assert.equal(isCodeFile(".gitignore"), false);
    assert.equal(extname("src/.env"), ".env");
  });
});

describe("posixNormalize", () => {
  test("drops '.' and empty segments", () => {
    assert.equal(posixNormalize("a/./b"), "a/b");
    assert.equal(posixNormalize("/a//b"), "a/b");
    assert.equal(posixNormalize(""), "");
  });

  test("resolves '..' against earlier segments", () => {
    assert.equal(posixNormalize("a/b/../c"), "a/c");
    assert.equal(posixNormalize("a/b/c/../../d"), "a/d");
  });

  test("keeps leading '..' so callers can detect escapes above the repo root", () => {
    assert.equal(posixNormalize("../a"), "../a");
    assert.equal(posixNormalize("a/../../b"), "../b");
  });
});

describe("posixDirname / joinPosix / basename", () => {
  test("posixDirname returns '' at the root", () => {
    assert.equal(posixDirname("a/b/c.ts"), "a/b");
    assert.equal(posixDirname("c.ts"), "");
  });

  test("joinPosix skips the separator when either side is empty", () => {
    assert.equal(joinPosix("a", "b"), "a/b");
    assert.equal(joinPosix("", "b"), "b");
    assert.equal(joinPosix("a", ""), "a");
  });

  test("basename takes the last segment", () => {
    assert.equal(basename("a/b/c.ts"), "c.ts");
    assert.equal(basename("c.ts"), "c.ts");
  });
});

describe("stripCodeExt", () => {
  test("strips JS/TS extensions only", () => {
    assert.equal(stripCodeExt("a/b.js"), "a/b");
    assert.equal(stripCodeExt("a/b.tsx"), "a/b");
    assert.equal(stripCodeExt("a/b.py"), "a/b.py"); // Python resolution appends, never strips
    assert.equal(stripCodeExt("a/b"), "a/b");
  });
});

describe("isCodeFile", () => {
  test("accepts the v1 language set and rejects everything else", () => {
    for (const f of ["a.ts", "a.tsx", "a.mts", "a.cts", "a.js", "a.jsx", "a.mjs", "a.cjs", "a.py", "a.pyi"]) {
      assert.equal(isCodeFile(f), true, f);
    }
    for (const f of ["a.md", "a.json", "a.go", "a.css", "Makefile"]) {
      assert.equal(isCodeFile(f), false, f);
    }
  });
});

describe("moduleKey", () => {
  test("root-level files collapse to (root)", () => {
    assert.equal(moduleKey("README.md"), "(root)");
    assert.equal(moduleKey("index.ts"), "(root)");
  });

  test("container directories key one level deeper", () => {
    assert.equal(moduleKey("src/lib/paths.ts"), "src/lib");
    assert.equal(moduleKey("src/lib/deep/nested.ts"), "src/lib");
    assert.equal(moduleKey("packages/core/src/x.ts"), "packages/core");
  });

  test("non-container directories key at the top level", () => {
    assert.equal(moduleKey("docs/guide/intro.md"), "docs");
    assert.equal(moduleKey("test/helpers/fixture.ts"), "test");
  });

  test("a file directly inside a container keys to the container itself", () => {
    // "src/index.ts" has no second directory level to descend into.
    assert.equal(moduleKey("src/index.ts"), "src");
  });
});
