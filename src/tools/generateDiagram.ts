import { basename as pathBasename } from "node:path";
import { resolveRepoRoot, walk } from "../lib/walk.js";
import { isCodeFile } from "../lib/paths.js";
import { extractImports } from "../lib/imports.js";
import { detectManifestAndFrameworks } from "../lib/detect.js";
import { renderFlowchart } from "../lib/mermaid.js";
import { renderDot } from "../lib/dot.js";
import type { DiagramFormat, DiagramLevel } from "../types.js";

export type { DiagramFormat, DiagramLevel };

/**
 * `generate_diagram` — combine scan + import facts into a DRAFT diagram string:
 * Mermaid (default; renders on GitHub) or Graphviz DOT (interop). The connected
 * model is expected to refine it.
 */
export function runGenerateDiagram(
  inputPath: string,
  level: DiagramLevel = "high",
  format: DiagramFormat = "mermaid",
): string {
  const { root } = resolveRepoRoot(inputPath);
  const { files } = walk(root);
  const codeFiles = files.filter(isCodeFile);
  const { edges } = extractImports(root, codeFiles);
  const { manifest } = detectManifestAndFrameworks(root, files);
  const repoName = manifest.name ?? pathBasename(root);

  const opts = { repoName, level, codeFiles, edges };
  return format === "dot" ? renderDot(opts) : renderFlowchart(opts);
}
