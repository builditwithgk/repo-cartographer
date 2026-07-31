/**
 * Shared type definitions for repo-cartographer.
 *
 * These describe the DETERMINISTIC facts the server extracts. The server never
 * reasons about them — the connected LLM turns these facts into a narrative and
 * a refined architecture diagram.
 */

/** A top-level (or second-level) module/directory in the repo. */
export interface ModuleInfo {
  /** Repo-relative posix directory key, e.g. "src/tools" or "(root)". */
  dir: string;
  /** Heuristic role guess from the directory name — a hint the model refines. */
  roleGuess: string;
  /** Number of files grouped under this module. */
  fileCount: number;
}

/** Summary of a project manifest (package.json / pyproject.toml / etc.). */
export interface ManifestSummary {
  name: string | null;
  version: string | null;
  description: string | null;
  /** Sorted, de-duplicated dependency names (no versions). */
  dependencies: string[];
}

/** Result of `scan_repo`. */
export interface ScanResult {
  /** Absolute, resolved repo path that was scanned. */
  path: string;
  /** Detected programming languages, most prevalent first. */
  languages: string[];
  /** Frameworks/libraries inferred from manifests, sorted. */
  frameworks: string[];
  /** Heuristic entry points (repo-relative posix paths), sorted. */
  entryPoints: string[];
  /** Top-level modules with role guesses. */
  modules: ModuleInfo[];
  /** Manifest summary. */
  manifest: ManifestSummary;
  /** Coarse counts. */
  stats: {
    files: number;
    dirs: number;
    codeFiles: number;
  };
  /** True if a scan cap was hit (file list is incomplete). */
  truncated: boolean;
  /** Human-readable notes about anything capped or unparseable. */
  notes: string[];
}

/** A directed import edge (from imports to). */
export interface ImportEdge {
  from: string;
  to: string;
}

/** Diagram granularity: modules/directories vs individual files. */
export type DiagramLevel = "high" | "detail";

/**
 * Diagram output notation. "mermaid" renders natively on GitHub (PR comments,
 * READMEs) and in the shareable HTML; "dot" is the interop escape hatch — pipe
 * it into Graphviz, Backstage, or anything else that eats DOT.
 */
export type DiagramFormat = "mermaid" | "dot";

/** The deterministic facts a diagram emitter turns into notation. */
export interface RenderOptions {
  repoName: string;
  level: DiagramLevel;
  codeFiles: string[];
  /** File-level import edges. */
  edges: ImportEdge[];
}

/** A single architecture-rule breach found by `check`. */
export interface Violation {
  level: "error" | "warn";
  kind: "forbidden" | "cycle";
  from?: string;
  to?: string;
  reason: string;
}

/** Result of `check`. */
export interface CheckResult {
  path: string;
  violations: Violation[];
  errorCount: number;
  warnCount: number;
  stats: { codeFiles: number; edges: number; modules: number };
}

/** Result of `build_import_graph`. */
export interface ImportGraph {
  path: string;
  /** "file" = node per file; "module" = collapsed to directory level. */
  level: "file" | "module";
  /** Node ids (repo-relative posix file paths, or module keys when collapsed). */
  nodes: string[];
  /** Intra-repo directed edges. */
  edges: ImportEdge[];
  /** True when the graph was collapsed to module level for size. */
  collapsed: boolean;
  stats: {
    filesScanned: number;
    edges: number;
    externalImports: number;
    truncated: boolean;
  };
  notes: string[];
}
