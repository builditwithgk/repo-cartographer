import { join } from "node:path";
import type { ManifestSummary } from "../types.js";
import { MAX_FILE_BYTES, MAX_GUARD_SCAN } from "./ignore.js";
import { readTextCapped } from "./fsutil.js";
import { basename, extname } from "./paths.js";

/* ----------------------------- languages ----------------------------- */

const LANG_BY_EXT: Record<string, string> = {
  ".ts": "TypeScript",
  ".tsx": "TypeScript",
  ".mts": "TypeScript",
  ".cts": "TypeScript",
  ".js": "JavaScript",
  ".jsx": "JavaScript",
  ".mjs": "JavaScript",
  ".cjs": "JavaScript",
  ".py": "Python",
  ".pyi": "Python",
  ".go": "Go",
  ".rs": "Rust",
  ".java": "Java",
  ".kt": "Kotlin",
  ".rb": "Ruby",
  ".php": "PHP",
  ".cs": "C#",
  ".c": "C",
  ".h": "C",
  ".cpp": "C++",
  ".cc": "C++",
  ".hpp": "C++",
  ".swift": "Swift",
  ".scala": "Scala",
  ".sh": "Shell",
  ".sql": "SQL",
};

/** Programming languages present, most prevalent first (ties broken by name). */
export function detectLanguages(files: string[]): string[] {
  const counts = new Map<string, number>();
  for (const f of files) {
    const lang = LANG_BY_EXT[extname(f)];
    if (lang) counts.set(lang, (counts.get(lang) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => (b[1] - a[1]) || (a[0] < b[0] ? -1 : 1))
    .map(([lang]) => lang);
}

/* ----------------------------- frameworks ---------------------------- */

/** Dependency name -> friendly framework/library label. */
const FRAMEWORK_MAP: Record<string, string> = {
  // JS / TS
  react: "React",
  "react-dom": "React",
  next: "Next.js",
  vue: "Vue",
  svelte: "Svelte",
  express: "Express",
  fastify: "Fastify",
  koa: "Koa",
  vite: "Vite",
  webpack: "Webpack",
  rollup: "Rollup",
  esbuild: "esbuild",
  jest: "Jest",
  vitest: "Vitest",
  mocha: "Mocha",
  electron: "Electron",
  "@modelcontextprotocol/sdk": "MCP SDK",
  zod: "Zod",
  tailwindcss: "Tailwind CSS",
  redux: "Redux",
  "@reduxjs/toolkit": "Redux Toolkit",
  "socket.io": "Socket.IO",
  axios: "Axios",
  prisma: "Prisma",
  mongoose: "Mongoose",
  sequelize: "Sequelize",
  // Python
  flask: "Flask",
  django: "Django",
  fastapi: "FastAPI",
  streamlit: "Streamlit",
  pandas: "pandas",
  numpy: "NumPy",
  "scikit-learn": "scikit-learn",
  tensorflow: "TensorFlow",
  torch: "PyTorch",
  langchain: "LangChain",
  langgraph: "LangGraph",
  openai: "OpenAI SDK",
  anthropic: "Anthropic SDK",
  pydantic: "Pydantic",
  sqlalchemy: "SQLAlchemy",
  celery: "Celery",
  requests: "Requests",
  aiohttp: "aiohttp",
  dhanhq: "DhanHQ",
  kiteconnect: "Zerodha Kite Connect",
  "python-telegram-bot": "python-telegram-bot",
  backtrader: "Backtrader",
  ccxt: "CCXT",
  matplotlib: "Matplotlib",
  plotly: "Plotly",
  yfinance: "yfinance",
  "ta-lib": "TA-Lib",
  ta: "TA (technical-analysis)",
};

function mapFrameworks(deps: ReadonlySet<string>): string[] {
  const out = new Set<string>();
  for (const [dep, label] of Object.entries(FRAMEWORK_MAP)) {
    if (deps.has(dep)) out.add(label);
  }
  for (const d of deps) {
    if (d.startsWith("@nestjs/")) out.add("NestJS");
    if (d.startsWith("@angular/")) out.add("Angular");
  }
  return [...out].sort();
}

/* ------------------------- manifest parsing -------------------------- */

/** Normalize a dependency name for matching (lowercase; Python "_" -> "-"). */
function normDep(name: string): string {
  return name.toLowerCase().replace(/_/g, "-");
}

function parseRequirements(text: string, deps: Set<string>): void {
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.split("#")[0].trim();
    if (!line || line.startsWith("-")) continue; // skip options like -r, -e
    const m = /^([A-Za-z0-9_.-]+)/.exec(line);
    if (m) deps.add(normDep(m[1]));
  }
}

function parseSetupPy(text: string, deps: Set<string>): void {
  const block = /install_requires\s*=\s*\[([\s\S]*?)\]/.exec(text);
  if (!block) return;
  for (const m of block[1].matchAll(/['"]([A-Za-z0-9_.-]+)/g)) deps.add(normDep(m[1]));
}

/** Extract name + dependencies from pyproject.toml (regex, no TOML parser). */
function parsePyproject(text: string, deps: Set<string>): string | null {
  let name: string | null = null;
  const nameM = /(?:^|\n)\s*name\s*=\s*["']([^"']+)["']/.exec(text);
  if (nameM) name = nameM[1];

  // PEP 621: dependencies = ["flask>=2", ...] (possibly multi-line)
  for (const block of text.matchAll(/dependencies\s*=\s*\[([\s\S]*?)\]/g)) {
    for (const m of block[1].matchAll(/['"]([A-Za-z0-9_.-]+)/g)) deps.add(normDep(m[1]));
  }
  // Poetry: [tool.poetry.dependencies] table of `pkg = "..."`
  const poetry = /\[tool\.poetry\.dependencies\]([\s\S]*?)(?:\n\[|$)/.exec(text);
  if (poetry) {
    for (const m of poetry[1].matchAll(/(?:^|\n)\s*([A-Za-z0-9_.-]+)\s*=/g)) {
      const dep = normDep(m[1]);
      if (dep !== "python") deps.add(dep);
    }
  }
  return name;
}

/**
 * Build a manifest summary and framework list from the repo's manifests
 * (package.json, pyproject.toml, requirements*.txt, setup.py).
 */
export function detectManifestAndFrameworks(
  root: string,
  files: string[],
): { manifest: ManifestSummary; frameworks: string[]; notes: string[] } {
  const deps = new Set<string>();
  const notes: string[] = [];
  let name: string | null = null;
  let version: string | null = null;
  let description: string | null = null;

  if (files.includes("package.json")) {
    const txt = readTextCapped(join(root, "package.json"), MAX_FILE_BYTES);
    if (txt) {
      try {
        const j = JSON.parse(txt) as Record<string, unknown>;
        name = typeof j.name === "string" ? j.name : null;
        version = typeof j.version === "string" ? j.version : null;
        description = typeof j.description === "string" ? j.description : null;
        for (const key of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
          const table = j[key];
          if (table && typeof table === "object") {
            for (const d of Object.keys(table)) deps.add(normDep(d));
          }
        }
      } catch {
        notes.push("package.json present but could not be parsed");
      }
    }
  }

  if (files.includes("pyproject.toml")) {
    const txt = readTextCapped(join(root, "pyproject.toml"), MAX_FILE_BYTES);
    if (txt) {
      const pyName = parsePyproject(txt, deps);
      if (!name && pyName) name = pyName;
    }
  }

  for (const f of files) {
    if (/(^|\/)requirements[\w.-]*\.txt$/i.test(f)) {
      const txt = readTextCapped(join(root, f), MAX_FILE_BYTES);
      if (txt) parseRequirements(txt, deps);
    }
  }

  if (files.includes("setup.py")) {
    const txt = readTextCapped(join(root, "setup.py"), MAX_FILE_BYTES);
    if (txt) parseSetupPy(txt, deps);
  }

  const manifest: ManifestSummary = { name, version, description, dependencies: [...deps].sort() };
  return { manifest, frameworks: mapFrameworks(deps), notes };
}

/* ---------------------------- entry points --------------------------- */

const ENTRY_BASENAMES: ReadonlySet<string> = new Set([
  "index.ts",
  "index.js",
  "index.mjs",
  "main.ts",
  "main.js",
  "main.py",
  "__main__.py",
  "app.py",
  "app.ts",
  "app.js",
  "server.ts",
  "server.js",
  "cli.ts",
  "cli.js",
  "start.py",
  "run.py",
  "manage.py",
  "wsgi.py",
  "asgi.py",
]);

const PY_MAIN_GUARD = /^\s*if\s+__name__\s*==\s*['"]__main__['"]\s*:/m;

/**
 * Heuristic entry points: package.json `main`/`bin` targets, well-known entry
 * filenames, and Python files containing a `__main__` guard (capped scan).
 */
export function detectEntryPoints(
  root: string,
  files: string[],
): { entryPoints: string[]; notes: string[] } {
  const set = new Set<string>();
  const notes: string[] = [];
  const fileSet = new Set(files);

  // package.json main / bin
  if (files.includes("package.json")) {
    const txt = readTextCapped(join(root, "package.json"), MAX_FILE_BYTES);
    if (txt) {
      try {
        const j = JSON.parse(txt) as Record<string, unknown>;
        const candidates: string[] = [];
        if (typeof j.main === "string") candidates.push(j.main);
        if (typeof j.module === "string") candidates.push(j.module);
        if (typeof j.bin === "string") candidates.push(j.bin);
        else if (j.bin && typeof j.bin === "object") {
          for (const v of Object.values(j.bin as Record<string, unknown>)) {
            if (typeof v === "string") candidates.push(v);
          }
        }
        for (const c of candidates) {
          const norm = c.replace(/^\.\//, "");
          if (fileSet.has(norm)) set.add(norm);
        }
      } catch {
        /* already noted in manifest parsing */
      }
    }
  }

  // well-known entry filenames
  for (const f of files) {
    if (ENTRY_BASENAMES.has(basename(f))) set.add(f);
  }

  // python __main__ guard (bounded)
  let scanned = 0;
  for (const f of files) {
    if (extname(f) !== ".py") continue;
    if (scanned >= MAX_GUARD_SCAN) {
      notes.push(`Python __main__ scan capped at ${MAX_GUARD_SCAN} files`);
      break;
    }
    scanned++;
    const txt = readTextCapped(join(root, f), MAX_FILE_BYTES);
    if (txt && PY_MAIN_GUARD.test(txt)) set.add(f);
  }

  return { entryPoints: [...set].sort(), notes };
}
