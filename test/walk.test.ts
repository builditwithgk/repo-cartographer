import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { descendPastWrapper, resolveRepoRoot, walk } from "../src/lib/walk.js";
import { makeRepo } from "./helpers/fixture.js";

describe("walk", () => {
  test("returns sorted, posix-separated repo-relative paths", () => {
    const root = makeRepo({
      "src/deep/b.py": "",
      "src/a.ts": "",
      "README.md": "",
    });
    const result = walk(root);
    assert.deepEqual(result.files, ["README.md", "src/a.ts", "src/deep/b.py"]);
    assert.deepEqual(result.dirs, ["src", "src/deep"]);
    assert.equal(result.truncated, false);
  });

  test("skips build, dependency and cache directories", () => {
    const root = makeRepo({
      "src/a.ts": "",
      "node_modules/pkg/index.js": "",
      "dist/a.js": "",
      "build/a.js": "",
      "out/a.js": "",
      "coverage/a.js": "",
      "vendor/a.js": "",
      "venv/a.py": "",
      "__pycache__/a.pyc": "",
      "target/a.js": "",
    });
    const result = walk(root);
    assert.deepEqual(result.files, ["src/a.ts"]);
    assert.deepEqual(result.dirs, ["src"]);
  });

  test("skips hidden directories but keeps hidden files", () => {
    const root = makeRepo({
      ".git/config": "",
      ".venv/lib/x.py": "",
      ".gitignore": "node_modules/\n",
      "src/a.ts": "",
    });
    const result = walk(root);
    assert.deepEqual(result.files, [".gitignore", "src/a.ts"]);
    assert.deepEqual(result.dirs, ["src"]);
  });

  test("excludes those directories at any depth, not just the root", () => {
    const root = makeRepo({
      "packages/app/src/a.ts": "",
      "packages/app/node_modules/dep/index.js": "",
      "packages/app/dist/a.js": "",
    });
    assert.deepEqual(walk(root).files, ["packages/app/src/a.ts"]);
  });

  test("an empty directory yields empty results", () => {
    assert.deepEqual(walk(makeRepo({})), { files: [], dirs: [], truncated: false });
  });

  test("is deterministic across runs", () => {
    const root = makeRepo({ "b.ts": "", "a.ts": "", "z/y/x.ts": "" });
    assert.deepEqual(walk(root), walk(root));
  });
});

describe("descendPastWrapper", () => {
  test("steps past a zip-style wrapper folder (no files, one subdirectory)", () => {
    const root = makeRepo({ "my-repo-main/src/a.ts": "", "my-repo-main/README.md": "" });
    assert.deepEqual(descendPastWrapper(root), {
      root: join(root, "my-repo-main"),
      descended: ["my-repo-main"],
    });
  });

  test("steps past nested wrappers, bounded", () => {
    const root = makeRepo({ "outer/inner/src/a.ts": "" });
    const result = descendPastWrapper(root);
    assert.deepEqual(result.descended, ["outer", "inner"]);
    assert.equal(result.root, join(root, "outer", "inner"));
  });

  test("does not descend when the directory has any file", () => {
    const root = makeRepo({ "README.md": "", "src/a.ts": "" });
    assert.deepEqual(descendPastWrapper(root), { root, descended: [] });
  });

  test("does not descend when there are two visible subdirectories", () => {
    const root = makeRepo({ "a/x.ts": "", "b/y.ts": "" });
    assert.deepEqual(descendPastWrapper(root), { root, descended: [] });
  });

  test("does not mistake a lone source container for a wrapper", () => {
    // A repo whose root is just src/ (no README yet) must keep src-relative paths.
    for (const container of ["src", "lib", "packages"]) {
      const root = makeRepo({ [`${container}/a.ts`]: "" });
      assert.deepEqual(descendPastWrapper(root), { root, descended: [] }, container);
    }
  });

  test("stops at a container found inside a wrapper", () => {
    const root = makeRepo({ "repo-main/src/a.ts": "" });
    assert.deepEqual(descendPastWrapper(root), {
      root: join(root, "repo-main"),
      descended: ["repo-main"],
    });
  });

  test("ignores hidden and excluded directories when deciding", () => {
    // .git and node_modules alongside the wrapper must not block the descent.
    const root = makeRepo({
      "repo-main/src/a.ts": "",
      ".git/config": "",
      "node_modules/pkg/index.js": "",
    });
    assert.deepEqual(descendPastWrapper(root).descended, ["repo-main"]);
  });
});

describe("resolveRepoRoot", () => {
  test("returns the descended root with an explanatory note", () => {
    const root = makeRepo({ "repo-main/src/a.ts": "" });
    const result = resolveRepoRoot(root);
    assert.equal(result.root, join(root, "repo-main"));
    assert.equal(result.notes.length, 1);
    assert.match(result.notes[0], /wrapper folder/);
  });

  test("is a no-op with no notes for a normal repo", () => {
    const root = makeRepo({ "README.md": "", "src/a.ts": "" });
    assert.deepEqual(resolveRepoRoot(root), { root, notes: [] });
  });

  test("still rejects a missing path with a clear error", () => {
    assert.throws(() => resolveRepoRoot(join(makeRepo({}), "nope")), /Path does not exist/);
  });
});
