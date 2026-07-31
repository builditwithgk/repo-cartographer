import type { RenderOptions } from "../types.js";
import { basename, moduleKey } from "./paths.js";
import { collapseToModules } from "./imports.js";
import { CATEGORY_STYLE, roleCategory, roleGuess, type RoleCategory } from "./roles.js";

export type { RenderOptions };

/** Sanitize text for use inside a Mermaid `["..."]` label. */
function escapeLabel(s: string): string {
  return s
    .replace(/[\r\n]+/g, " ")
    .replace(/["`]/g, "'")
    .replace(/[[\]{}|<>]/g, "")
    .trim();
}

/** Assigns stable ids (prefix + index) to a sorted list of keys. */
class IdMap {
  private map = new Map<string, string>();
  constructor(private prefix: string) {}
  add(keys: string[]): void {
    for (const k of [...keys].sort()) {
      if (!this.map.has(k)) this.map.set(k, `${this.prefix}${this.map.size}`);
    }
  }
  get(key: string): string | undefined {
    return this.map.get(key);
  }
}

function header(repoName: string, level: string): string[] {
  return [
    "flowchart TD",
    `    %% ${escapeLabel(repoName)} — ${level}-level architecture (DRAFT, refine me)`,
  ];
}

/** High-level diagram: one node per module, collapsed module edges. */
function renderHigh(opts: RenderOptions): string {
  const counts = new Map<string, number>();
  for (const f of opts.codeFiles) counts.set(moduleKey(f), (counts.get(moduleKey(f)) ?? 0) + 1);

  const { nodes, edges } = collapseToModules(opts.codeFiles, opts.edges);
  const ids = new IdMap("n");
  ids.add(nodes);

  const lines = header(opts.repoName, "high");
  for (const node of nodes) {
    const count = counts.get(node) ?? 0;
    const role = roleGuess(node);
    const parts = [node];
    if (!role.startsWith("(role")) parts.push(role); // omit the "model to infer" placeholder
    parts.push(`${count} ${count === 1 ? "file" : "files"}`);
    lines.push(`    ${ids.get(node)}["${escapeLabel(parts.join(" · "))}"]`);
  }
  for (const e of edges) {
    const a = ids.get(e.from);
    const b = ids.get(e.to);
    if (a && b) lines.push(`    ${a} --> ${b}`);
  }

  // Color modules by role family. Only the categories actually present get a
  // classDef, so small repos stay small. (Detail level stays neutral — dozens
  // of colored file boxes read as noise, not architecture.)
  const byCategory = new Map<RoleCategory, string[]>();
  for (const node of nodes) {
    const cat = roleCategory(node);
    if (!cat) continue;
    const id = ids.get(node);
    if (!id) continue;
    const bucket = byCategory.get(cat);
    if (bucket) bucket.push(id);
    else byCategory.set(cat, [id]);
  }
  const usedCategories = [...byCategory.keys()].sort();
  for (const cat of usedCategories) {
    lines.push(`    class ${byCategory.get(cat)!.join(",")} ${cat}`);
  }
  for (const cat of usedCategories) {
    const { fill, stroke } = CATEGORY_STYLE[cat];
    lines.push(`    classDef ${cat} fill:${fill},color:#ffffff,stroke:${stroke}`);
  }
  return lines.join("\n");
}

/** Detail diagram: file nodes grouped into per-module subgraphs. */
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

  const nodeIds = new IdMap("n");
  nodeIds.add(opts.codeFiles);
  const groupIds = new IdMap("g");
  groupIds.add([...byModule.keys()]);

  const lines = header(opts.repoName, "detail");
  for (const mod of [...byModule.keys()].sort()) {
    const files = byModule.get(mod)!.sort();
    lines.push(`    subgraph ${groupIds.get(mod)}["${escapeLabel(mod)}"]`);
    for (const f of files) {
      lines.push(`        ${nodeIds.get(f)}["${escapeLabel(basename(f))}"]`);
    }
    lines.push("    end");
  }
  for (const e of opts.edges) {
    const a = nodeIds.get(e.from);
    const b = nodeIds.get(e.to);
    if (a && b) lines.push(`    ${a} --> ${b}`);
  }
  return lines.join("\n");
}

/** Build a draft Mermaid flowchart from scan + import facts. */
export function renderFlowchart(opts: RenderOptions): string {
  return opts.level === "detail" ? renderDetail(opts) : renderHigh(opts);
}
