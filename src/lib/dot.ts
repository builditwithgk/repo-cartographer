/**
 * Graphviz DOT emitter — the interop output. Same deterministic facts as the
 * Mermaid emitter, rendered as `digraph` so users can pipe the result into
 * Graphviz (`dot -Tsvg`), Backstage, or any other tool that eats DOT. Node ids
 * are the module keys / file paths themselves (quoted), so diffs stay readable.
 */
import type { RenderOptions } from "../types.js";
import { basename, moduleKey } from "./paths.js";
import { collapseToModules } from "./imports.js";
import { CATEGORY_STYLE, roleCategory, roleGuess } from "./roles.js";

/** Escape one line of text for use inside a DOT double-quoted string. */
function escLine(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, " ");
}

/** A DOT double-quoted string (single line). */
function q(s: string): string {
  return `"${escLine(s)}"`;
}

/**
 * A multi-line DOT label. Parts are escaped individually and then joined with
 * a literal `\n` sequence — joining first would get the separator re-escaped
 * and Graphviz would print "\n" as text instead of breaking the line.
 */
function qLabel(parts: string[]): string {
  return `"${parts.map(escLine).join("\\n")}"`;
}

/** Shared preamble: comment header + defaults that match the Mermaid look. */
function header(repoName: string, level: string): string[] {
  return [
    `digraph ${q(repoName)} {`,
    `    // ${repoName.replace(/[\r\n]+/g, " ")} — ${level}-level architecture (DRAFT, refine me)`,
    "    rankdir=TB;",
    '    node [shape=box, style="rounded,filled", fontname="Helvetica,Arial,sans-serif", fillcolor="#eef1f4", color="#8b949e", fontcolor="#1f2328"];',
    '    edge [color="#57606a"];',
  ];
}

/** High-level: one node per module, collapsed module edges, colored by role. */
function renderHigh(opts: RenderOptions): string {
  const counts = new Map<string, number>();
  for (const f of opts.codeFiles) counts.set(moduleKey(f), (counts.get(moduleKey(f)) ?? 0) + 1);

  const { nodes, edges } = collapseToModules(opts.codeFiles, opts.edges);

  const lines = header(opts.repoName, "high");
  for (const node of nodes) {
    const count = counts.get(node) ?? 0;
    const role = roleGuess(node);
    const label = [node];
    if (!role.startsWith("(role")) label.push(role);
    label.push(`${count} ${count === 1 ? "file" : "files"}`);

    const cat = roleCategory(node);
    const style = cat
      ? `, fillcolor="${CATEGORY_STYLE[cat].fill}", fontcolor="#ffffff", color="${CATEGORY_STYLE[cat].stroke}"`
      : "";
    lines.push(`    ${q(node)} [label=${qLabel(label)}${style}];`);
  }
  const known = new Set(nodes);
  for (const e of edges) {
    if (known.has(e.from) && known.has(e.to)) lines.push(`    ${q(e.from)} -> ${q(e.to)};`);
  }
  lines.push("}");
  return lines.join("\n");
}

/** Detail: file nodes inside per-module clusters (borders colored by role). */
function renderDetail(opts: RenderOptions): string {
  const byModule = new Map<string, string[]>();
  for (const f of opts.codeFiles) {
    const key = moduleKey(f);
    let bucket = byModule.get(key);
    if (!bucket) {
      bucket = [];
      byModule.set(key, bucket);
    }
    bucket.push(f);
  }

  const lines = header(opts.repoName, "detail");
  const modules = [...byModule.keys()].sort();
  modules.forEach((mod, i) => {
    const cat = roleCategory(mod);
    lines.push(`    subgraph cluster_${i} {`);
    lines.push(`        label=${q(mod)};`);
    lines.push(`        color="${cat ? CATEGORY_STYLE[cat].stroke : "#8b949e"}";`);
    for (const f of byModule.get(mod)!.sort()) {
      lines.push(`        ${q(f)} [label=${q(basename(f))}];`);
    }
    lines.push("    }");
  });
  // DOT auto-creates nodes named in edges, so guard against dangling endpoints
  // (Mermaid's renderer gets the same protection from its id lookup).
  const known = new Set(opts.codeFiles);
  for (const e of opts.edges) {
    if (known.has(e.from) && known.has(e.to)) lines.push(`    ${q(e.from)} -> ${q(e.to)};`);
  }
  lines.push("}");
  return lines.join("\n");
}

/** Build a draft Graphviz DOT digraph from scan + import facts. */
export function renderDot(opts: RenderOptions): string {
  return opts.level === "detail" ? renderDetail(opts) : renderHigh(opts);
}
