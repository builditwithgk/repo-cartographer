import { resolveRepoRoot, walk } from "../lib/walk.js";
import { isCodeFile } from "../lib/paths.js";
import { collapseToModules, extractImports } from "../lib/imports.js";
import { matchGlob } from "../lib/glob.js";
import { findCycles } from "../lib/cycles.js";
import type { Rules } from "../lib/rules.js";
import type { CheckResult, Violation } from "../types.js";

// Violation / CheckResult live in ../types.js so src/lib can use them without
// importing a tool implementation (dependencies point inward).
export type { CheckResult, Violation };

/**
 * Evaluate architecture rules against a repo's *file-level* import edges
 * (uncollapsed, so path globs work even on large repos). Deterministic — no LLM.
 */
export function runCheck(inputPath: string, rules: Rules): CheckResult {
  const { root } = resolveRepoRoot(inputPath);
  const { files } = walk(root);
  const codeFiles = files.filter(isCodeFile);
  const { edges } = extractImports(root, codeFiles);

  const violations: Violation[] = [];

  // 1) forbidden cross-boundary imports (file-level)
  for (const rule of rules.forbidden) {
    for (const e of edges) {
      if (matchGlob(rule.from, e.from) && matchGlob(rule.to, e.to)) {
        violations.push({ level: rule.level, kind: "forbidden", from: e.from, to: e.to, reason: rule.reason });
      }
    }
  }

  // 2) dependency cycles (module-level)
  const modules = collapseToModules(codeFiles, edges);
  if (rules.cycles !== "off") {
    const level = rules.cycles; // "error" | "warn"
    for (const cycle of findCycles(modules.nodes, modules.edges)) {
      const label = cycle.length === 1 ? `${cycle[0]} (self-import)` : cycle.join(" → ");
      violations.push({ level, kind: "cycle", reason: `dependency cycle: ${label}` });
    }
  }

  // stable ordering: errors first, then by kind/reason
  violations.sort(
    (a, b) =>
      (a.level === b.level ? 0 : a.level === "error" ? -1 : 1) ||
      (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0) ||
      ((a.from ?? "") + (a.to ?? "") + a.reason).localeCompare((b.from ?? "") + (b.to ?? "") + b.reason),
  );

  const errorCount = violations.filter((v) => v.level === "error").length;
  const warnCount = violations.length - errorCount;

  return {
    path: root,
    violations,
    errorCount,
    warnCount,
    stats: { codeFiles: codeFiles.length, edges: edges.length, modules: modules.nodes.length },
  };
}
