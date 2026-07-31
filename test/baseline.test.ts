import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  BASELINE_NAME,
  findBaseline,
  fingerprintViolation,
  loadBaseline,
  partitionByBaseline,
  writeBaseline,
} from "../src/lib/baseline.js";
import type { Violation } from "../src/types.js";
import { makeRepo } from "./helpers/fixture.js";

/** Fingerprints join their fields with a NUL byte (see fingerprintViolation). */
const SEP = String.fromCharCode(0);

const forbidden: Violation = {
  level: "error",
  kind: "forbidden",
  from: "src/ui/page.ts",
  to: "src/db/query.ts",
  reason: "no direct db access from the UI",
};

const cycle: Violation = {
  level: "warn",
  kind: "cycle",
  reason: "dependency cycle: src/db → src/ui",
};

describe("fingerprintViolation", () => {
  test("identifies a forbidden import by its endpoints", () => {
    assert.equal(fingerprintViolation(forbidden), ["forbidden", "src/ui/page.ts", "src/db/query.ts"].join(SEP));
  });

  test("identifies a cycle by its reason", () => {
    assert.equal(fingerprintViolation(cycle), ["cycle", "dependency cycle: src/db → src/ui"].join(SEP));
  });

  test("a path can never contain the separator, so kinds cannot be confused", () => {
    // A forbidden fingerprint has 3 fields, a cycle fingerprint 2 — no overlap.
    assert.equal(fingerprintViolation(forbidden).split(SEP).length, 3);
    assert.equal(fingerprintViolation(cycle).split(SEP).length, 2);
  });

  test("is independent of severity, so re-classifying a rule keeps the baseline valid", () => {
    assert.equal(fingerprintViolation({ ...forbidden, level: "warn" }), fingerprintViolation(forbidden));
  });

  test("is independent of the reason text for forbidden imports", () => {
    // Editing the 'reason' in .cartographer.yml must not resurrect a baselined violation.
    assert.equal(fingerprintViolation({ ...forbidden, reason: "reworded" }), fingerprintViolation(forbidden));
  });

  test("distinguishes different endpoints", () => {
    assert.notEqual(fingerprintViolation({ ...forbidden, to: "src/db/other.ts" }), fingerprintViolation(forbidden));
  });
});

describe("findBaseline", () => {
  test("finds the conventional filename, or returns null", () => {
    const withFile = makeRepo({ [BASELINE_NAME]: "[]" });
    assert.equal(findBaseline(withFile), join(withFile, BASELINE_NAME));
    assert.equal(findBaseline(makeRepo({ "README.md": "" })), null);
  });
});

describe("loadBaseline", () => {
  test("accepts the { violations: [...] } wrapper written by writeBaseline", () => {
    const root = makeRepo({ [BASELINE_NAME]: JSON.stringify({ violations: [forbidden, cycle] }) });
    const set = loadBaseline(join(root, BASELINE_NAME));
    assert.equal(set.size, 2);
    assert.ok(set.has(fingerprintViolation(forbidden)));
  });

  test("also accepts a bare array (e.g. a copied violations.json)", () => {
    const root = makeRepo({ [BASELINE_NAME]: JSON.stringify([forbidden]) });
    assert.deepEqual([...loadBaseline(join(root, BASELINE_NAME))], [fingerprintViolation(forbidden)]);
  });

  test("treats an unrecognized shape as an empty baseline", () => {
    const root = makeRepo({ [BASELINE_NAME]: "{}" });
    assert.equal(loadBaseline(join(root, BASELINE_NAME)).size, 0);
  });

  test("throws on malformed JSON rather than silently accepting nothing", () => {
    const root = makeRepo({ [BASELINE_NAME]: "{ not json" });
    assert.throws(() => loadBaseline(join(root, BASELINE_NAME)));
  });
});

describe("writeBaseline", () => {
  test("writes readable JSON that loadBaseline round-trips", () => {
    const root = makeRepo({});
    const file = join(root, BASELINE_NAME);
    writeBaseline(file, [forbidden, cycle]);

    const text = readFileSync(file, "utf8");
    assert.match(text, /"generatedBy": "repo-cartographer"/);
    assert.ok(text.includes("\n  "), "expected pretty-printed JSON");

    const set = loadBaseline(file);
    assert.deepEqual(partitionByBaseline([forbidden, cycle], set), {
      fresh: [],
      baselined: [forbidden, cycle],
    });
  });
});

describe("partitionByBaseline", () => {
  test("splits new violations from accepted ones", () => {
    const baseline = new Set([fingerprintViolation(forbidden)]);
    assert.deepEqual(partitionByBaseline([forbidden, cycle], baseline), {
      fresh: [cycle],
      baselined: [forbidden],
    });
  });

  test("an empty baseline leaves every violation fresh", () => {
    assert.deepEqual(partitionByBaseline([forbidden, cycle], new Set()), {
      fresh: [forbidden, cycle],
      baselined: [],
    });
  });

  test("a violation introduced after the baseline was written is fresh", () => {
    const root = makeRepo({});
    const file = join(root, BASELINE_NAME);
    writeBaseline(file, [forbidden]);

    const regression: Violation = { ...forbidden, from: "src/ui/other.ts" };
    const { fresh, baselined } = partitionByBaseline([forbidden, regression], loadBaseline(file));

    assert.deepEqual(fresh, [regression]);
    assert.deepEqual(baselined, [forbidden]);
  });

  test("preserves input order within each bucket", () => {
    const a: Violation = { ...forbidden, from: "src/ui/a.ts" };
    const b: Violation = { ...forbidden, from: "src/ui/b.ts" };
    const c: Violation = { ...forbidden, from: "src/ui/c.ts" };
    const baseline = new Set([fingerprintViolation(b)]);
    const { fresh } = partitionByBaseline([c, b, a], baseline);
    assert.deepEqual(fresh, [c, a]);
  });
});

describe("BASELINE_NAME", () => {
  test("is the documented filename", () => {
    assert.equal(BASELINE_NAME, ".cartographer-baseline.json");
    // Guard against the constant drifting away from what the CLI help advertises.
    const root = makeRepo({});
    writeFileSync(join(root, BASELINE_NAME), "[]", "utf8");
    assert.equal(findBaseline(root), join(root, ".cartographer-baseline.json"));
  });
});
