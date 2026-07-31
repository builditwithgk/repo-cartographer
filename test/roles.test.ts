import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { CATEGORY_STYLE, roleCategory, roleGuess } from "../src/lib/roles.js";

describe("roleGuess", () => {
  test("maps a known directory name to a hint", () => {
    assert.equal(roleGuess("tools"), "tool implementations");
    assert.equal(roleGuess("api"), "API layer");
  });

  test("uses only the last path segment of a module key", () => {
    assert.equal(roleGuess("src/lib"), "library code");
    assert.equal(roleGuess("packages/core/utils"), "utility helpers");
  });

  test("is case-insensitive", () => {
    assert.equal(roleGuess("Components"), "UI components");
    assert.equal(roleGuess("src/DB"), "database layer");
  });

  test("falls back to a placeholder the model is expected to replace", () => {
    // The diagram renderer keys off this "(role" prefix to omit the placeholder.
    assert.ok(roleGuess("widgets").startsWith("(role"));
    assert.ok(roleGuess("(root)").startsWith("(role"));
  });

  test("singular and plural spellings agree", () => {
    for (const [a, b] of [
      ["strategy", "strategies"],
      ["agent", "agents"],
      ["service", "services"],
      ["util", "utils"],
      ["config", "configs"],
    ]) {
      assert.equal(roleGuess(a), roleGuess(b), `${a} vs ${b}`);
    }
  });
});

describe("roleCategory", () => {
  test("maps directory names into visual families", () => {
    assert.equal(roleCategory("src/ui"), "ui");
    assert.equal(roleCategory("src/db"), "data");
    assert.equal(roleCategory("api"), "api");
    assert.equal(roleCategory("src/lib"), "shared");
    assert.equal(roleCategory("__tests__"), "test");
    assert.equal(roleCategory("scripts"), "infra");
  });

  test("uses the last segment, case-insensitively", () => {
    assert.equal(roleCategory("packages/core/Components"), "ui");
  });

  test("returns null when there is no hint", () => {
    assert.equal(roleCategory("widgets"), null);
    assert.equal(roleCategory("(root)"), null);
  });

  test("every category used by roleCategory has a style", () => {
    // Sample one key per family; a missing palette entry would break both emitters.
    for (const key of ["ui", "api", "core", "data", "lib", "test", "docs", "config"]) {
      const cat = roleCategory(key);
      assert.ok(cat, `expected a category for '${key}'`);
      const style = CATEGORY_STYLE[cat!];
      assert.match(style.fill, /^#[0-9a-f]{6}$/i);
      assert.match(style.stroke, /^#[0-9a-f]{6}$/i);
    }
  });

  test("anything roleGuess knows, roleCategory also categorizes", () => {
    // Keep the two tables in sync: a hint without a family would render unstyled.
    for (const key of ["broker", "gateway", "monitoring", "migrations", "middleware", "resources", "spec", "bin"]) {
      assert.ok(!roleGuess(key).startsWith("(role"), `roleGuess lost '${key}'`);
      assert.notEqual(roleCategory(key), null, `roleCategory missing '${key}'`);
    }
  });
});
