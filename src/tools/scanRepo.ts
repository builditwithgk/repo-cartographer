import type { ModuleInfo, ScanResult } from "../types.js";
import { resolveRepoRoot, walk } from "../lib/walk.js";
import { isCodeFile, moduleKey } from "../lib/paths.js";
import { detectLanguages, detectManifestAndFrameworks, detectEntryPoints } from "../lib/detect.js";
import { roleGuess } from "../lib/roles.js";

/** Group the file list into top-level modules with role guesses. */
function buildModules(files: string[]): ModuleInfo[] {
  const counts = new Map<string, number>();
  for (const f of files) {
    const key = moduleKey(f);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([dir, fileCount]) => ({ dir, roleGuess: roleGuess(dir), fileCount }));
}

/**
 * `scan_repo` — deterministic facts about a repo: languages, frameworks, entry
 * points, top-level modules, and a manifest summary. No reasoning.
 */
export function runScanRepo(inputPath: string): ScanResult {
  const { root, notes: rootNotes } = resolveRepoRoot(inputPath);
  const { files, dirs, truncated } = walk(root);
  const codeFiles = files.filter(isCodeFile);

  const languages = detectLanguages(files);
  const { manifest, frameworks, notes: manifestNotes } = detectManifestAndFrameworks(root, files);
  const { entryPoints, notes: entryNotes } = detectEntryPoints(root, files);
  const modules = buildModules(files);

  const notes = [...rootNotes, ...manifestNotes, ...entryNotes];
  if (truncated) notes.push(`File scan capped — repository has more than the scan limit; results are partial.`);

  return {
    path: root,
    languages,
    frameworks,
    entryPoints,
    modules,
    manifest,
    stats: { files: files.length, dirs: dirs.length, codeFiles: codeFiles.length },
    truncated,
    notes,
  };
}
