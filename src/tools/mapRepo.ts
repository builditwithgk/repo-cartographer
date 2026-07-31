import { join } from "node:path";
import { resolveRepoRoot } from "../lib/walk.js";
import { runScanRepo } from "./scanRepo.js";
import { runGenerateDiagram, type DiagramFormat, type DiagramLevel } from "./generateDiagram.js";
import { runRenderDiagram } from "./renderDiagram.js";

export interface MapResult {
  /** Ready-to-open HTML diagram. */
  htmlPath: string;
  /** Raw diagram source written alongside the HTML (.mermaid or .dot). */
  sourcePath: string;
  format: DiagramFormat;
  level: DiagramLevel;
  /** At-a-glance facts so the caller doesn't need a second tool call. */
  summary: {
    languages: string[];
    frameworks: string[];
    entryPoints: string[];
    files: number;
    codeFiles: number;
    modules: number;
    edgesShown: number;
  };
  /** The draft diagram source, inline, so the model can refine it without re-fetching. */
  diagram: string;
}

/**
 * `map_repo` — the one-shot flow: point it at a folder and get a downloadable
 * architecture diagram plus a summary, in a single call. Internally it runs
 * scan -> generate -> render (composing the granular tools). By default the
 * diagram is written into the scanned repo as `architecture.html` plus the raw
 * source (`.mermaid` or `.dot`); pass `outPath` to write elsewhere.
 */
export function runMapRepo(
  inputPath: string,
  level: DiagramLevel = "high",
  outPath?: string,
  format: DiagramFormat = "mermaid",
): MapResult {
  // Descend past zip wrappers here too, so the default outPath lands inside
  // the real repo root (scan/generate would each descend on their own anyway).
  const { root } = resolveRepoRoot(inputPath);

  const scan = runScanRepo(root);
  const diagram = runGenerateDiagram(root, level, format);
  const target = outPath ?? join(root, "architecture");
  const { htmlPath, sourcePath } = runRenderDiagram(diagram, target, format);

  const edgesShown = (diagram.match(format === "dot" ? /->/g : /-->/g) ?? []).length;

  return {
    htmlPath,
    sourcePath,
    format,
    level,
    summary: {
      languages: scan.languages,
      frameworks: scan.frameworks,
      entryPoints: scan.entryPoints,
      files: scan.stats.files,
      codeFiles: scan.stats.codeFiles,
      modules: scan.modules.length,
      edgesShown,
    },
    diagram,
  };
}
