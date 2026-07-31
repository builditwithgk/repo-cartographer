import { existsSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { parse as parseYaml } from "yaml";
import type { DiagramFormat, DiagramLevel } from "../types.js";

export type Severity = "error" | "warn" | "off";

export interface ForbiddenRule {
  from: string;
  to: string;
  reason: string;
  level: "error" | "warn";
}

export interface Rules {
  forbidden: ForbiddenRule[];
  cycles: Severity;
  diagram: { level: DiagramLevel; outPath: string; format: DiagramFormat };
}

export const DEFAULT_RULES: Rules = {
  forbidden: [],
  cycles: "off",
  diagram: { level: "high", outPath: "architecture", format: "mermaid" },
};

/** Candidate config filenames, in priority order. */
const CONFIG_NAMES = [".cartographer.yml", ".cartographer.yaml", ".cartographer.json"];

/** Find a config file in `dir`, or return null. */
export function findConfig(dir: string): string | null {
  for (const name of CONFIG_NAMES) {
    const p = join(dir, name);
    if (existsSync(p)) return p;
  }
  return null;
}

/** Parse + normalize a config file into fully-populated Rules. Throws on bad input. */
export function loadRules(configPath: string): Rules {
  const text = readFileSync(configPath, "utf8");
  const raw = extname(configPath).toLowerCase() === ".json" ? JSON.parse(text) : parseYaml(text);
  if (raw === null || typeof raw !== "object") {
    throw new Error(`Config ${configPath} is empty or not a mapping.`);
  }

  const rulesNode = (raw as Record<string, unknown>).rules;
  const rules = (rulesNode && typeof rulesNode === "object" ? rulesNode : {}) as Record<string, unknown>;

  const forbidden: ForbiddenRule[] = [];
  if (Array.isArray(rules.forbidden)) {
    rules.forbidden.forEach((entry, i) => {
      const r = entry as Record<string, unknown>;
      if (typeof r.from !== "string" || typeof r.to !== "string") {
        throw new Error(`rules.forbidden[${i}] must have string 'from' and 'to'.`);
      }
      const level = r.level === "warn" ? "warn" : "error";
      forbidden.push({
        from: r.from,
        to: r.to,
        reason: typeof r.reason === "string" ? r.reason : "forbidden dependency",
        level,
      });
    });
  }

  const cycles: Severity =
    rules.cycles === "warn" || rules.cycles === "off" || rules.cycles === "error"
      ? rules.cycles
      : DEFAULT_RULES.cycles;

  const diagramNode = ((raw as Record<string, unknown>).diagram ?? {}) as Record<string, unknown>;
  const diagram = {
    level: diagramNode.level === "detail" ? ("detail" as const) : ("high" as const),
    outPath: typeof diagramNode.outPath === "string" ? diagramNode.outPath : DEFAULT_RULES.diagram.outPath,
    format: diagramNode.format === "dot" ? ("dot" as const) : ("mermaid" as const),
  };

  return { forbidden, cycles, diagram };
}
