import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { EXCLUDED_DIRS, MAX_DEPTH, MAX_FILES } from "./ignore.js";
import { resolveDir } from "./fsutil.js";
import { isContainerDir } from "./paths.js";

export interface WalkResult {
  /** Repo-relative posix file paths, sorted. */
  files: string[];
  /** Repo-relative posix directory paths (excluding root), sorted. */
  dirs: string[];
  /** True if MAX_FILES was hit and the file list is incomplete. */
  truncated: boolean;
}

function toPosix(p: string): string {
  return p.split(sep).join("/");
}

/**
 * Step past zip-extraction wrapper folders: GitHub's "Download ZIP" (and most
 * archive tools) wrap the repo in `<repo>-main/`, so a scan of the extraction
 * directory would see one giant module and no resolvable imports. A directory
 * that contains NO files and exactly one visible subdirectory is such a
 * wrapper; descend (bounded) until the shape changes. Deterministic — shape
 * only, no name matching.
 */
export function descendPastWrapper(root: string): { root: string; descended: string[] } {
  let current = root;
  const descended: string[] = [];
  for (let i = 0; i < 3; i++) {
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      break;
    }
    const files = entries.filter((e) => e.isFile());
    const dirs = entries.filter(
      (e) => e.isDirectory() && !e.name.startsWith(".") && !EXCLUDED_DIRS.has(e.name),
    );
    // A lone source container (src/, lib/, packages/ …) is repo structure, not
    // a wrapper — descending would rewrite every repo-relative path and glob.
    if (files.length !== 0 || dirs.length !== 1 || isContainerDir(dirs[0].name)) break;
    current = join(current, dirs[0].name);
    descended.push(dirs[0].name);
  }
  return { root: current, descended };
}

/**
 * Resolve a tool's input path to the repo root every tool should agree on:
 * assert it is a directory, then step past any zip wrapper folders. The note
 * (when a descent happened) is surfaced in tool output so it is never silent.
 */
export function resolveRepoRoot(inputPath: string): { root: string; notes: string[] } {
  const { root, descended } = descendPastWrapper(resolveDir(inputPath));
  const notes = descended.length
    ? [`Descended past wrapper folder(s) "${descended.join("/")}" — the given directory contained only a single folder.`]
    : [];
  return { root, notes };
}

/**
 * Recursively list files under `root`, skipping hidden directories, known build/
 * dependency directories, and symlinked directories (avoids cycles). Traversal
 * visits directory entries in sorted order so truncation at MAX_FILES is
 * deterministic across runs.
 */
export function walk(root: string): WalkResult {
  const files: string[] = [];
  const dirs: string[] = [];
  let truncated = false;

  const recur = (abs: string, depth: number): void => {
    if (depth > MAX_DEPTH) return;
    let entries;
    try {
      entries = readdirSync(abs, { withFileTypes: true });
    } catch {
      return; // unreadable directory — skip
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

    const subdirs: string[] = [];
    for (const e of entries) {
      const full = join(abs, e.name);
      if (e.isDirectory()) {
        if (e.name.startsWith(".") || EXCLUDED_DIRS.has(e.name)) continue;
        dirs.push(toPosix(relative(root, full)));
        subdirs.push(full);
      } else if (e.isFile()) {
        if (files.length >= MAX_FILES) {
          truncated = true;
          continue;
        }
        files.push(toPosix(relative(root, full)));
      }
      // symlinks and other entry types are intentionally ignored
    }
    for (const d of subdirs) recur(d, depth + 1);
  };

  recur(root, 0);
  files.sort();
  dirs.sort();
  return { files, dirs, truncated };
}
