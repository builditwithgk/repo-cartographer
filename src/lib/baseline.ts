import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Violation } from "../types.js";

/** Default baseline filename, sits next to the config in the repo. */
export const BASELINE_NAME = ".cartographer-baseline.json";

/**
 * Stable identity for a violation, independent of severity. Two runs produce the
 * same fingerprint for "the same" violation, so a baseline can recognize it.
 *
 * Fields are joined with a NUL byte because a NUL can never appear in a path, so
 * no pair of distinct violations can collide on the same key. Fingerprints are
 * in-memory Set keys only — never serialized — so this separator is free to change.
 */
export function fingerprintViolation(v: Violation): string {
  return v.kind === "forbidden"
    ? `forbidden\u0000${v.from}\u0000${v.to}`
    : `cycle\u0000${v.reason}`;
}

/** Find an auto-detected baseline file in `dir`, or null. */
export function findBaseline(dir: string): string | null {
  const p = join(dir, BASELINE_NAME);
  return existsSync(p) ? p : null;
}

/** Load a baseline file into a set of fingerprints. Throws on malformed JSON. */
export function loadBaseline(file: string): Set<string> {
  const raw = JSON.parse(readFileSync(file, "utf8"));
  const entries: Violation[] = Array.isArray(raw) ? raw : Array.isArray(raw?.violations) ? raw.violations : [];
  return new Set(entries.map(fingerprintViolation));
}

/** Write the current violations as the accepted baseline (human-readable). */
export function writeBaseline(file: string, violations: Violation[]): void {
  const payload = {
    generatedBy: "repo-cartographer",
    note: "Accepted pre-existing violations. Delete an entry to start failing on it again.",
    violations,
  };
  writeFileSync(file, JSON.stringify(payload, null, 2), "utf8");
}

/** Split violations into those not in the baseline ("new") and those that are. */
export function partitionByBaseline(
  violations: Violation[],
  baseline: Set<string>,
): { fresh: Violation[]; baselined: Violation[] } {
  const fresh: Violation[] = [];
  const baselined: Violation[] = [];
  for (const v of violations) {
    (baseline.has(fingerprintViolation(v)) ? baselined : fresh).push(v);
  }
  return { fresh, baselined };
}
