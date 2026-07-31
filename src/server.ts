/**
 * repo-cartographer MCP server — deterministic extraction only; the connected
 * model does the reasoning. Every tool returns structured facts (or a draft
 * diagram), never an interpretation.
 *
 * This module builds and starts the stdio server. The CLI entry (index.ts)
 * launches it when no subcommand is given.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { errResult, jsonResult, textResult } from "./lib/result.js";
import { runMapRepo } from "./tools/mapRepo.js";
import { runScanRepo } from "./tools/scanRepo.js";
import { runBuildImportGraph } from "./tools/buildImportGraph.js";
import { runGenerateDiagram } from "./tools/generateDiagram.js";
import { runRenderDiagram } from "./tools/renderDiagram.js";
import { registerAuthorResource } from "./resources/author.js";

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Construct the server with all tools + resources registered. */
export function buildServer(): McpServer {
  const server = new McpServer({ name: "repo-cartographer", version: "1.0.0" });

  server.registerTool(
    "map_repo",
    {
      title: "Map repository (one-shot)",
      description:
        "Point at a folder and get a downloadable architecture diagram in one call: runs " +
        "scan + import-graph + render internally and returns the HTML path, a facts summary, and " +
        "the draft diagram source inline. By default writes architecture.html plus the raw source " +
        "(.mermaid or .dot) into the repo; pass outPath to write elsewhere. Use the granular tools " +
        "(scan_repo, build_import_graph, generate_diagram, render_diagram) only when you need to " +
        "compose the steps yourself.",
      inputSchema: {
        path: z.string().describe("Absolute or relative path to the repository root"),
        level: z.enum(["high", "detail"]).optional().describe("Diagram granularity (default 'high')"),
        format: z
          .enum(["mermaid", "dot"])
          .optional()
          .describe("Diagram notation: 'mermaid' (default; renders on GitHub) or 'dot' (Graphviz interop)"),
        outPath: z
          .string()
          .optional()
          .describe("Output base path (default: <repo>/architecture); .html and the raw source are written"),
      },
    },
    async ({ path, level, outPath, format }) => {
      try {
        return jsonResult(runMapRepo(path, level ?? "high", outPath, format ?? "mermaid"));
      } catch (e) {
        return errResult(message(e));
      }
    },
  );

  server.registerTool(
    "scan_repo",
    {
      title: "Scan repository",
      description:
        "Deterministically extract facts from a local repo: programming languages, " +
        "frameworks/libraries, entry points, top-level modules (with role guesses), and a " +
        "manifest summary. Returns JSON facts only — no interpretation.",
      inputSchema: { path: z.string().describe("Absolute or relative path to the repository root") },
    },
    async ({ path }) => {
      try {
        return jsonResult(runScanRepo(path));
      } catch (e) {
        return errResult(message(e));
      }
    },
  );

  server.registerTool(
    "build_import_graph",
    {
      title: "Build import graph",
      description:
        "Extract intra-repo import/require relationships for JavaScript/TypeScript and Python. " +
        "Nodes are files (auto-collapsed to module/directory level for large repos); edges are " +
        "directed import relationships. Returns JSON.",
      inputSchema: { path: z.string().describe("Absolute or relative path to the repository root") },
    },
    async ({ path }) => {
      try {
        return jsonResult(runBuildImportGraph(path));
      } catch (e) {
        return errResult(message(e));
      }
    },
  );

  server.registerTool(
    "generate_diagram",
    {
      title: "Generate diagram",
      description:
        "Combine scan + import facts into a DRAFT diagram string — Mermaid flowchart (default) " +
        "or Graphviz DOT. level 'high' (default) shows modules/directories; 'detail' shows files " +
        "grouped by module. This is a draft the calling model is expected to refine.",
      inputSchema: {
        path: z.string().describe("Absolute or relative path to the repository root"),
        level: z.enum(["high", "detail"]).optional().describe("Diagram granularity (default 'high')"),
        format: z
          .enum(["mermaid", "dot"])
          .optional()
          .describe("Diagram notation: 'mermaid' (default; renders on GitHub) or 'dot' (Graphviz interop)"),
      },
    },
    async ({ path, level, format }) => {
      try {
        return textResult(runGenerateDiagram(path, level ?? "high", format ?? "mermaid"));
      } catch (e) {
        return errResult(message(e));
      }
    },
  );

  server.registerTool(
    "render_diagram",
    {
      title: "Render diagram",
      description:
        "Write a self-contained, shareable HTML page (renders via CDN: Mermaid, or Viz for " +
        "Graphviz DOT) plus the raw source file (.mermaid or .dot). Returns the absolute paths written.",
      inputSchema: {
        source: z.string().describe("Diagram source to render (Mermaid, or DOT when format is 'dot')"),
        format: z
          .enum(["mermaid", "dot"])
          .optional()
          .describe("Notation of `source` (default 'mermaid')"),
        outPath: z
          .string()
          .describe("Output path (with or without extension); .html and the raw source siblings are written"),
      },
    },
    async ({ source, outPath, format }) => {
      try {
        return jsonResult(runRenderDiagram(source, outPath, format ?? "mermaid"));
      } catch (e) {
        return errResult(message(e));
      }
    },
  );

  registerAuthorResource(server);
  return server;
}

/** Start the MCP server on stdio. */
export async function startServer(): Promise<void> {
  const server = buildServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr is safe for logs; stdout is reserved for the JSON-RPC stream.
  process.stderr.write("repo-cartographer MCP server running on stdio\n");
}
