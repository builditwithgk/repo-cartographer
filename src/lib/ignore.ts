/**
 * Directories to skip and hard caps that keep the server fast and bounded on
 * large repos. Any cap that fires is reported in tool output — never silently.
 */

/**
 * Non-hidden directories that are build output, dependencies, or caches and
 * should never be walked. (Hidden directories — names starting with "." such as
 * .git, .venv, .cache — are skipped separately in the walker.)
 */
export const EXCLUDED_DIRS: ReadonlySet<string> = new Set([
  "node_modules",
  "bower_components",
  "jspm_packages",
  "vendor",
  "dist",
  "build",
  "out",
  "coverage",
  "venv",
  "__pycache__",
  "target", // rust / maven / gradle output
]);

/** Hard cap on the number of files collected during a walk. */
export const MAX_FILES = 4000;

/** Maximum bytes read from any single file (for import scanning / manifests). */
export const MAX_FILE_BYTES = 512 * 1024;

/** Maximum directory recursion depth. */
export const MAX_DEPTH = 24;

/**
 * When a repo has more code files than this, `build_import_graph` collapses to
 * module (directory) level so the graph stays legible.
 */
export const MODULE_COLLAPSE_THRESHOLD = 60;

/** Cap on how many Python files are read when probing for a `__main__` guard. */
export const MAX_GUARD_SCAN = 600;
