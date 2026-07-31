import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runMapRepo } from "./tools/mapRepo.js";
import { runCheck } from "./tools/checkRepo.js";
import type { DiagramFormat, DiagramLevel, Violation } from "./types.js";
import { DEFAULT_RULES, findConfig, loadRules } from "./lib/rules.js";
import { BASELINE_NAME, findBaseline, loadBaseline, partitionByBaseline, writeBaseline } from "./lib/baseline.js";

interface ParsedArgs {
  positional: string[];
  out?: string;
  level?: string;
  format?: string;
  config?: string;
  baseline?: string;
  updateBaseline?: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = { positional: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-o" || a === "--out") parsed.out = argv[++i];
    else if (a === "--level") parsed.level = argv[++i];
    else if (a === "--format") parsed.format = argv[++i];
    else if (a === "-c" || a === "--config") parsed.config = argv[++i];
    else if (a === "--baseline") parsed.baseline = argv[++i];
    else if (a === "--update-baseline") parsed.updateBaseline = true;
    else if (a.startsWith("-")) throw new Error(`Unknown option: ${a}`);
    else parsed.positional.push(a);
  }
  return parsed;
}

function requirePath(args: ParsedArgs): string {
  const p = args.positional[0];
  if (!p) throw new Error("Missing <path>. Usage shown with: repo-cartographer help");
  return p;
}

function asLevel(value: string | undefined, fallback: DiagramLevel): DiagramLevel {
  if (value === undefined) return fallback;
  if (value !== "high" && value !== "detail") throw new Error(`--level must be 'high' or 'detail', got '${value}'`);
  return value;
}

function asFormat(value: string | undefined, fallback: DiagramFormat): DiagramFormat {
  if (value === undefined) return fallback;
  if (value !== "mermaid" && value !== "dot") {
    throw new Error(`--format must be 'mermaid' or 'dot', got '${value}'`);
  }
  return value;
}

const HELP = `repo-cartographer — architecture diagrams & governance

Usage:
  repo-cartographer                         Run as an MCP server (stdio; how AI clients launch it)
  repo-cartographer map <path> [options]    Write a downloadable architecture diagram
  repo-cartographer check <path> [options]  Enforce architecture rules (exits 1 on error-level violations)
  repo-cartographer help                    Show this help

map options:
  -o, --out <path>     Output base path (default: <repo>/architecture)
      --level <lvl>    'high' (default) or 'detail'
      --format <fmt>   'mermaid' (default; renders on GitHub) or 'dot' (Graphviz)
  Defaults for these come from the 'diagram:' section of .cartographer.yml when
  the repo has one; explicit flags always win.

check options:
  -c, --config <file>    Rules file (default: .cartographer.yml/.yaml/.json in <path>)
      --baseline <file>  Accepted pre-existing violations (default: .cartographer-baseline.json
                         in <path>); only NEW violations then fail the build
      --update-baseline  Record the current violations as the baseline and exit 0

Docs: https://github.com/builditwithgk/repo-cartographer
`;

function cliMap(args: ParsedArgs): void {
  const path = requirePath(args);

  // Flags win; otherwise the repo's .cartographer.yml `diagram:` section, if
  // any, supplies the defaults (its outPath is repo-relative by convention).
  const configPath = findConfig(path);
  const defaults = configPath ? loadRules(configPath).diagram : DEFAULT_RULES.diagram;
  const out = args.out ?? (configPath ? join(path, defaults.outPath) : undefined);

  const result = runMapRepo(path, asLevel(args.level, defaults.level), out, asFormat(args.format, defaults.format));
  const s = result.summary;
  process.stdout.write(
    `Mapped ${result.htmlPath}\n` +
      `  languages: ${s.languages.join(", ") || "—"}\n` +
      `  frameworks: ${s.frameworks.join(", ") || "—"}\n` +
      `  ${s.codeFiles} code files · ${s.modules} modules · ${s.edgesShown} edges shown\n` +
      `\nOpen the .html file in a browser to view the diagram.\n`,
  );
}

function formatViolation(v: Violation): string {
  const badge = v.level === "error" ? "❌ ERROR" : "⚠️  WARN ";
  const head =
    v.kind === "forbidden" ? `${badge} forbidden  ${v.from} → ${v.to}` : `${badge} cycle      ${v.reason}`;
  return v.kind === "forbidden" ? `${head}\n           ${v.reason}` : head;
}

function cliCheck(args: ParsedArgs): void {
  const path = requirePath(args);

  const configPath = args.config ?? findConfig(path);
  if (!configPath) {
    process.stdout.write(
      `No .cartographer.yml found in ${path} — nothing to enforce.\n` +
        `Add rules (see docs/github-action.md) to gate PRs on architecture.\n`,
    );
    // Still emit an empty report so CI steps downstream don't choke.
    writeViolations([]);
    return;
  }

  const result = runCheck(path, loadRules(configPath));

  // --update-baseline: accept the current violations and exit 0.
  if (args.updateBaseline) {
    const target = args.baseline ?? join(path, BASELINE_NAME);
    writeBaseline(target, result.violations);
    process.stdout.write(`Wrote baseline with ${result.violations.length} accepted violation(s) → ${target}\n`);
    return;
  }

  // Apply a baseline if one exists: only NEW violations count. A path that
  // doesn't exist yet (common on the first CI run) is treated as "no baseline".
  const baselinePath = args.baseline ?? findBaseline(path);
  const baselineSet = baselinePath && existsSync(baselinePath) ? loadBaseline(baselinePath) : null;
  const { fresh, baselined } = baselineSet
    ? partitionByBaseline(result.violations, baselineSet)
    : { fresh: result.violations, baselined: [] as Violation[] };

  const freshErrors = fresh.filter((v) => v.level === "error").length;
  const freshWarns = fresh.length - freshErrors;

  process.stdout.write(
    `Architecture check — ${result.path}\n` +
      `  ${result.stats.codeFiles} code files · ${result.stats.edges} edges · ${result.stats.modules} modules\n` +
      `  rules: ${configPath}\n` +
      (baselineSet ? `  baseline: ${baselinePath} (${baselined.length} pre-existing ignored)\n` : "") +
      "\n",
  );

  if (fresh.length === 0) {
    process.stdout.write("✅ No new violations.\n");
  } else {
    for (const v of fresh) process.stdout.write(`${formatViolation(v)}\n`);
    process.stdout.write(`\n${freshErrors} new error(s), ${freshWarns} new warning(s)\n`);
  }

  // violations.json holds the actionable (new) violations for the PR comment.
  writeViolations(fresh);

  if (freshErrors > 0) process.exitCode = 1;
}

function writeViolations(violations: Violation[]): void {
  try {
    writeFileSync(join(process.cwd(), "violations.json"), JSON.stringify(violations, null, 2), "utf8");
  } catch {
    /* non-fatal: the report was already printed to stdout */
  }
}

/** Entry for the `map` / `check` / `help` subcommands. */
export async function runCli(argv: string[]): Promise<void> {
  const [cmd, ...rest] = argv;
  try {
    if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") {
      process.stdout.write(HELP);
      return;
    }
    const args = parseArgs(rest);
    if (cmd === "map") return cliMap(args);
    if (cmd === "check") return cliCheck(args);
    process.stderr.write(`Unknown command: ${cmd}\n\n${HELP}`);
    process.exitCode = 2;
  } catch (e) {
    process.stderr.write(`Error: ${e instanceof Error ? e.message : String(e)}\n`);
    process.exitCode = 1;
  }
}
