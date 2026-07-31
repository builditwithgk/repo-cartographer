import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { runCheck } from "../src/tools/checkRepo.js";
import { DEFAULT_RULES, type Rules } from "../src/lib/rules.js";
import { makeRepo } from "./helpers/fixture.js";

/**
 * A repo with one forbidden import (ui -> db) that also forms a module-level
 * cycle (src/ui -> src/db -> src/ui), so both rule kinds share one fixture.
 */
function repoWithViolations(): string {
  return makeRepo({
    "src/ui/page.ts": `import { q } from "../db/query.js";\n`,
    "src/db/query.ts": `import { helper } from "../ui/helper.js";\n`,
    "src/ui/helper.ts": "export const helper = 1;\n",
    "README.md": "not code\n",
  });
}

const rules = (overrides: Partial<Rules> = {}): Rules => ({ ...DEFAULT_RULES, ...overrides });

const uiToDb = { from: "src/ui/**", to: "src/db/**", reason: "no direct db access from the UI" };

describe("runCheck — forbidden imports", () => {
  test("reports an edge matching a forbidden rule", () => {
    const result = runCheck(repoWithViolations(), rules({ forbidden: [{ ...uiToDb, level: "error" }] }));

    assert.deepEqual(result.violations, [
      {
        level: "error",
        kind: "forbidden",
        from: "src/ui/page.ts",
        to: "src/db/query.ts",
        reason: "no direct db access from the UI",
      },
    ]);
    assert.equal(result.errorCount, 1);
    assert.equal(result.warnCount, 0);
  });

  test("honours a warn-level rule", () => {
    const result = runCheck(repoWithViolations(), rules({ forbidden: [{ ...uiToDb, level: "warn" }] }));
    assert.equal(result.errorCount, 0);
    assert.equal(result.warnCount, 1);
    assert.equal(result.violations[0].level, "warn");
  });

  test("does not fire when the globs do not match", () => {
    const rule = { from: "src/api/**", to: "src/db/**", reason: "n/a", level: "error" as const };
    assert.deepEqual(runCheck(repoWithViolations(), rules({ forbidden: [rule] })).violations, []);
  });

  test("matches on file paths, so rules work on large repos without collapsing", () => {
    const rule = { from: "src/ui/page.ts", to: "src/db/query.ts", reason: "exact", level: "error" as const };
    const result = runCheck(repoWithViolations(), rules({ forbidden: [rule] }));
    assert.equal(result.violations.length, 1);
  });

  test("rule globs stay repo-relative when the repo sits inside a zip wrapper", () => {
    const root = makeRepo({
      "repo-main/src/ui/page.ts": `import { q } from "../db/query.js";\n`,
      "repo-main/src/db/query.ts": "export const q = 1;\n",
    });
    const result = runCheck(root, rules({ forbidden: [{ ...uiToDb, level: "error" }] }));
    // Globs like src/ui/** must match — not repo-main/src/ui/**.
    assert.equal(result.errorCount, 1);
    assert.equal(result.violations[0].from, "src/ui/page.ts");
  });

  test("reports each matching edge separately", () => {
    const root = makeRepo({
      "src/ui/a.ts": `import "../db/x.js";\n`,
      "src/ui/b.ts": `import "../db/x.js";\n`,
      "src/db/x.ts": "export const x = 1;\n",
    });
    const result = runCheck(root, rules({ forbidden: [{ ...uiToDb, level: "error" }] }));
    assert.deepEqual(
      result.violations.map((v) => v.from),
      ["src/ui/a.ts", "src/ui/b.ts"],
    );
  });
});

describe("runCheck — cycles", () => {
  test("reports a module-level cycle when enabled", () => {
    const result = runCheck(repoWithViolations(), rules({ cycles: "error" }));
    assert.deepEqual(result.violations, [
      { level: "error", kind: "cycle", reason: "dependency cycle: src/db → src/ui" },
    ]);
  });

  test("respects the warn severity", () => {
    const result = runCheck(repoWithViolations(), rules({ cycles: "warn" }));
    assert.equal(result.violations[0].level, "warn");
    assert.equal(result.errorCount, 0);
    assert.equal(result.warnCount, 1);
  });

  test("reports nothing when cycles are off", () => {
    assert.deepEqual(runCheck(repoWithViolations(), rules({ cycles: "off" })).violations, []);
  });

  test("an acyclic repo produces no cycle violations", () => {
    const root = makeRepo({
      "src/ui/page.ts": `import "../db/query.js";\n`,
      "src/db/query.ts": "export const q = 1;\n",
    });
    assert.deepEqual(runCheck(root, rules({ cycles: "error" })).violations, []);
  });
});

describe("runCheck — output shape", () => {
  test("a clean repo with no rules produces no violations", () => {
    const result = runCheck(repoWithViolations(), DEFAULT_RULES);
    assert.deepEqual(result.violations, []);
    assert.equal(result.errorCount, 0);
    assert.equal(result.warnCount, 0);
  });

  test("counts only code files", () => {
    const result = runCheck(repoWithViolations(), DEFAULT_RULES);
    assert.deepEqual(result.stats, { codeFiles: 3, edges: 2, modules: 2 }); // README.md excluded
  });

  test("errors sort ahead of warnings", () => {
    const result = runCheck(
      repoWithViolations(),
      rules({ forbidden: [{ ...uiToDb, level: "error" }], cycles: "warn" }),
    );
    assert.deepEqual(
      result.violations.map((v) => [v.level, v.kind]),
      [
        ["error", "forbidden"],
        ["warn", "cycle"],
      ],
    );
  });

  test("returns the resolved absolute path", () => {
    const root = repoWithViolations();
    assert.equal(runCheck(root, DEFAULT_RULES).path, root);
  });

  test("is deterministic across runs", () => {
    const root = repoWithViolations();
    const config = rules({ forbidden: [{ ...uiToDb, level: "error" }], cycles: "warn" });
    assert.deepEqual(runCheck(root, config), runCheck(root, config));
  });

  test("an empty repo is handled without error", () => {
    const result = runCheck(makeRepo({}), rules({ cycles: "error" }));
    assert.deepEqual(result.violations, []);
    assert.deepEqual(result.stats, { codeFiles: 0, edges: 0, modules: 0 });
  });

  test("throws a clear error for a missing path", () => {
    const missing = join(makeRepo({}), "does-not-exist");
    assert.throws(() => runCheck(missing, DEFAULT_RULES), /Path does not exist/);
  });

  test("throws a clear error when the path is a file", () => {
    const root = makeRepo({ "a.ts": "" });
    assert.throws(() => runCheck(join(root, "a.ts"), DEFAULT_RULES), /Path is not a directory/);
  });
});
