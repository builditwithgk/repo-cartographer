import type { ImportGraph } from "../types.js";
import { resolveRepoRoot, walk } from "../lib/walk.js";
import { isCodeFile } from "../lib/paths.js";
import { collapseToModules, extractImports } from "../lib/imports.js";
import { MODULE_COLLAPSE_THRESHOLD } from "../lib/ignore.js";

/**
 * `build_import_graph` — intra-repo import/require edges for JS/TS + Python.
 * Collapses to module (directory) level when the file count is large.
 */
export function runBuildImportGraph(inputPath: string): ImportGraph {
  const { root, notes: rootNotes } = resolveRepoRoot(inputPath);
  const { files, truncated } = walk(root);
  const codeFiles = files.filter(isCodeFile);

  const { edges, externalImports, filesScanned } = extractImports(root, codeFiles);

  let level: "file" | "module" = "file";
  let nodes = codeFiles;
  let outEdges = edges;
  let collapsed = false;

  if (codeFiles.length > MODULE_COLLAPSE_THRESHOLD) {
    const m = collapseToModules(codeFiles, edges);
    nodes = m.nodes;
    outEdges = m.edges;
    level = "module";
    collapsed = true;
  }

  const notes: string[] = [...rootNotes];
  if (collapsed) {
    notes.push(
      `Graph collapsed to module level (${codeFiles.length} code files > ${MODULE_COLLAPSE_THRESHOLD}). ` +
        `Call generate_diagram with level "detail" for a file-level view.`,
    );
  }
  if (truncated) notes.push("File scan capped — some files were not included.");

  return {
    path: root,
    level,
    nodes,
    edges: outEdges,
    collapsed,
    stats: { filesScanned, edges: outEdges.length, externalImports, truncated },
    notes,
  };
}
