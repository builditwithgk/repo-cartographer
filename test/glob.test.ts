import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { matchGlob } from "../src/lib/glob.js";

describe("matchGlob", () => {
  test("'**' crosses directory separators", () => {
    assert.equal(matchGlob("src/ui/**", "src/ui/a.ts"), true);
    assert.equal(matchGlob("src/ui/**", "src/ui/deep/nested/b.ts"), true);
    assert.equal(matchGlob("**", "anything/at/all.ts"), true);
  });

  test("'dir/**' matches things inside dir, not dir itself", () => {
    assert.equal(matchGlob("src/ui/**", "src/ui"), false);
  });

  test("'**' does not match a sibling with a longer name", () => {
    assert.equal(matchGlob("src/ui/**", "src/uix/a.ts"), false);
  });

  test("'**/' matches zero or more leading segments", () => {
    assert.equal(matchGlob("**/config.ts", "config.ts"), true);
    assert.equal(matchGlob("**/config.ts", "src/config.ts"), true);
    assert.equal(matchGlob("**/config.ts", "src/deep/config.ts"), true);
    assert.equal(matchGlob("**/config.ts", "myconfig.ts"), false);
  });

  test("'*' stops at a directory separator", () => {
    assert.equal(matchGlob("src/*.ts", "src/a.ts"), true);
    assert.equal(matchGlob("src/*.ts", "src/deep/a.ts"), false);
    assert.equal(matchGlob("src/*/index.ts", "src/lib/index.ts"), true);
    assert.equal(matchGlob("src/*/index.ts", "src/lib/deep/index.ts"), false);
  });

  test("'?' matches exactly one non-separator character", () => {
    assert.equal(matchGlob("src/?.ts", "src/a.ts"), true);
    assert.equal(matchGlob("src/?.ts", "src/ab.ts"), false);
    assert.equal(matchGlob("src/?.ts", "src//.ts"), false);
  });

  test("the whole path must match, not just a prefix", () => {
    assert.equal(matchGlob("src/a.ts", "src/a.ts"), true);
    assert.equal(matchGlob("src/a.ts", "src/a.ts.map"), false);
    assert.equal(matchGlob("src/a.ts", "vendor/src/a.ts"), false);
  });

  test("regex metacharacters are treated literally", () => {
    // A '.' must not behave as "any character".
    assert.equal(matchGlob("src/a.b.ts", "src/aXbYts"), false);
    assert.equal(matchGlob("src/a.b.ts", "src/a.b.ts"), true);

    for (const ch of ["+", "(", ")", "[", "]", "{", "}", "^", "$", "|"]) {
      const path = `src/a${ch}b.ts`;
      assert.equal(matchGlob(path, path), true, `literal ${ch}`);
    }
  });

  test("matching is case-sensitive", () => {
    assert.equal(matchGlob("src/**", "SRC/a.ts"), false);
  });
});
