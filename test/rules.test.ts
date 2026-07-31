import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { DEFAULT_RULES, findConfig, loadRules } from "../src/lib/rules.js";
import { makeRepo } from "./helpers/fixture.js";

describe("findConfig", () => {
  test("returns null when no config is present", () => {
    assert.equal(findConfig(makeRepo({ "README.md": "" })), null);
  });

  test("prefers .yml over .yaml over .json", () => {
    const all = makeRepo({
      ".cartographer.yml": "rules: {}\n",
      ".cartographer.yaml": "rules: {}\n",
      ".cartographer.json": "{}",
    });
    assert.equal(findConfig(all), join(all, ".cartographer.yml"));

    const noYml = makeRepo({ ".cartographer.yaml": "rules: {}\n", ".cartographer.json": "{}" });
    assert.equal(findConfig(noYml), join(noYml, ".cartographer.yaml"));

    const jsonOnly = makeRepo({ ".cartographer.json": "{}" });
    assert.equal(findConfig(jsonOnly), join(jsonOnly, ".cartographer.json"));
  });
});

describe("loadRules", () => {
  test("parses a full YAML config", () => {
    const root = makeRepo({
      ".cartographer.yml": [
        "rules:",
        "  forbidden:",
        '    - from: "src/ui/**"',
        '      to: "src/db/**"',
        '      reason: "no direct db access from the UI"',
        '    - from: "a/**"',
        '      to: "b/**"',
        "      level: warn",
        "  cycles: error",
        "diagram:",
        "  level: detail",
        "  outPath: docs/arch",
      ].join("\n"),
    });

    assert.deepEqual(loadRules(join(root, ".cartographer.yml")), {
      forbidden: [
        { from: "src/ui/**", to: "src/db/**", reason: "no direct db access from the UI", level: "error" },
        { from: "a/**", to: "b/**", reason: "forbidden dependency", level: "warn" },
      ],
      cycles: "error",
      diagram: { level: "detail", outPath: "docs/arch", format: "mermaid" },
    });
  });

  test("parses an equivalent JSON config", () => {
    const root = makeRepo({
      ".cartographer.json": JSON.stringify({
        rules: { forbidden: [{ from: "x/**", to: "y/**" }], cycles: "warn" },
        diagram: { level: "high", outPath: "out/arch" },
      }),
    });

    assert.deepEqual(loadRules(join(root, ".cartographer.json")), {
      forbidden: [{ from: "x/**", to: "y/**", reason: "forbidden dependency", level: "error" }],
      cycles: "warn",
      diagram: { level: "high", outPath: "out/arch", format: "mermaid" },
    });
  });

  test("fills in defaults for everything omitted", () => {
    const root = makeRepo({ ".cartographer.yml": "rules: {}\n" });
    assert.deepEqual(loadRules(join(root, ".cartographer.yml")), DEFAULT_RULES);
  });

  test("an unknown cycles severity falls back to the default", () => {
    const root = makeRepo({ ".cartographer.yml": "rules:\n  cycles: loud\n" });
    assert.equal(loadRules(join(root, ".cartographer.yml")).cycles, DEFAULT_RULES.cycles);
  });

  test("an unknown diagram level falls back to 'high'", () => {
    const root = makeRepo({ ".cartographer.yml": "diagram:\n  level: extreme\n" });
    assert.equal(loadRules(join(root, ".cartographer.yml")).diagram.level, "high");
  });

  test("parses diagram.format and falls back to 'mermaid' on unknown values", () => {
    const dot = makeRepo({ ".cartographer.yml": "diagram:\n  format: dot\n" });
    assert.equal(loadRules(join(dot, ".cartographer.yml")).diagram.format, "dot");

    const unknown = makeRepo({ ".cartographer.yml": "diagram:\n  format: plantuml\n" });
    assert.equal(loadRules(join(unknown, ".cartographer.yml")).diagram.format, "mermaid");
  });

  test("any level other than 'warn' is treated as an error", () => {
    const root = makeRepo({
      ".cartographer.yml": 'rules:\n  forbidden:\n    - from: "a"\n      to: "b"\n      level: nitpick\n',
    });
    assert.equal(loadRules(join(root, ".cartographer.yml")).forbidden[0].level, "error");
  });

  test("throws when a forbidden rule is missing 'from' or 'to'", () => {
    const root = makeRepo({ ".cartographer.yml": 'rules:\n  forbidden:\n    - from: "a/**"\n' });
    assert.throws(
      () => loadRules(join(root, ".cartographer.yml")),
      /rules\.forbidden\[0\] must have string 'from' and 'to'/,
    );
  });

  test("throws on an empty or non-mapping config", () => {
    const empty = makeRepo({ ".cartographer.yml": "" });
    assert.throws(() => loadRules(join(empty, ".cartographer.yml")), /empty or not a mapping/);

    const scalar = makeRepo({ ".cartographer.yml": "just-a-string\n" });
    assert.throws(() => loadRules(join(scalar, ".cartographer.yml")), /empty or not a mapping/);
  });

  test("throws on malformed JSON", () => {
    const root = makeRepo({ ".cartographer.json": "{ not json" });
    assert.throws(() => loadRules(join(root, ".cartographer.json")));
  });
});
