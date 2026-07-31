import { join } from "node:path";
import type { ImportEdge } from "../types.js";
import { MAX_FILE_BYTES } from "./ignore.js";
import { readTextCapped } from "./fsutil.js";
import {
  extname,
  JS_EXTS,
  joinPosix,
  moduleKey,
  posixDirname,
  posixNormalize,
  stripCodeExt,
} from "./paths.js";

export interface ExtractResult {
  /** Sorted, de-duplicated intra-repo directed edges. */
  edges: ImportEdge[];
  /** Best-effort count of imports that pointed outside the repo. */
  externalImports: number;
  /** Number of code files actually read. */
  filesScanned: number;
}

/* ------------------------------------------------------------------ *
 * Specifier extraction (regex — good enough for a draft diagram).    *
 * ------------------------------------------------------------------ */

const JS_PATTERNS: RegExp[] = [
  // import X from 'x'   |   import 'x'   |   import type {A} from 'x'
  /\bimport\s+(?:[^;'"]*?\bfrom\s*)?['"]([^'"]+)['"]/g,
  // export ... from 'x'
  /\bexport\s+[^;'"]*?\bfrom\s*['"]([^'"]+)['"]/g,
  // require('x')
  /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  // dynamic import('x')
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
];

function extractJsSpecifiers(text: string): string[] {
  const out: string[] = [];
  for (const re of JS_PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) out.push(m[1]);
  }
  return out;
}

interface PyImport {
  dots: number;
  module: string; // dotted module ("" for `from . import x`)
  names: string[]; // imported names (used only when module === "")
}

const PY_FROM = /^[ \t]*from[ \t]+(\.*)([A-Za-z0-9_.]*)[ \t]+import[ \t]+(.+?)[ \t]*$/;
const PY_IMPORT = /^[ \t]*import[ \t]+(.+?)[ \t]*$/;

function parseNameList(raw: string): string[] {
  // "a, b as c, (d, e)" -> ["a","b","d","e"]
  return raw
    .replace(/[()]/g, "")
    .split(",")
    .map((s) => s.trim().split(/\s+as\s+/)[0].trim())
    .filter((s) => s.length > 0 && s !== "*");
}

function extractPyImports(text: string): PyImport[] {
  const out: PyImport[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine;
    if (/^[ \t]*#/.test(line)) continue;
    const from = PY_FROM.exec(line);
    if (from) {
      out.push({ dots: from[1].length, module: from[2], names: parseNameList(from[3]) });
      continue;
    }
    const imp = PY_IMPORT.exec(line);
    if (imp) {
      for (const item of imp[1].split(",")) {
        const dotted = item.trim().split(/\s+as\s+/)[0].trim();
        if (dotted) out.push({ dots: 0, module: dotted, names: [] });
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Resolution of specifiers to intra-repo files.                      *
 * ------------------------------------------------------------------ */

function resolveJs(fromFile: string, spec: string, fileSet: ReadonlySet<string>): string | null {
  if (!spec.startsWith(".") && !spec.startsWith("/")) return null; // bare = external
  const target = posixNormalize(joinPosix(posixDirname(fromFile), spec));
  if (target === "" || target.startsWith("..")) return null; // escaped repo root
  const base = stripCodeExt(target);
  const candidates = [
    target,
    base,
    ...JS_EXTS.map((e) => base + e),
    ...JS_EXTS.map((e) => joinPosix(base, "index" + e)),
  ];
  for (const c of candidates) if (fileSet.has(c)) return c;
  return null;
}

function pyCandidates(base: string): string[] {
  return [base + ".py", base + ".pyi", joinPosix(base, "__init__.py")];
}

function resolvePyAbsolute(dotted: string, fileSet: ReadonlySet<string>): string | null {
  const base = dotted.split(".").join("/");
  for (const c of pyCandidates(base)) if (fileSet.has(c)) return c;
  return null;
}

function resolvePyRelative(
  fromFile: string,
  dots: number,
  dotted: string,
  fileSet: ReadonlySet<string>,
): string | null {
  let dir = posixDirname(fromFile);
  for (let i = 1; i < dots; i++) dir = posixDirname(dir);
  const sub = dotted ? dotted.split(".").join("/") : "";
  const base = sub ? joinPosix(dir, sub) : dir;
  for (const c of pyCandidates(base)) if (fileSet.has(c)) return c;
  return null;
}

/* ------------------------------------------------------------------ *
 * Public API.                                                        *
 * ------------------------------------------------------------------ */

/**
 * Read each code file (capped), extract import specifiers, and resolve them to
 * intra-repo edges. External (npm / PyPI / stdlib) imports are counted, not
 * turned into nodes.
 */
export function extractImports(root: string, codeFiles: string[]): ExtractResult {
  const fileSet = new Set(codeFiles);
  const edgeKeys = new Set<string>();
  const edges: ImportEdge[] = [];
  let externalImports = 0;
  let filesScanned = 0;

  const addEdge = (from: string, to: string | null) => {
    if (to === null) {
      externalImports++;
      return;
    }
    if (to === from) return; // ignore self-imports
    // Keys join fields with a NUL byte: it can never occur in a path, so two
    // distinct (from, to) pairs can never collide on the same key.
    const key = `${from}\u0000${to}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push({ from, to });
  };

  for (const file of codeFiles) {
    const text = readTextCapped(join(root, file), MAX_FILE_BYTES);
    if (text === null) continue;
    filesScanned++;
    const ext = extname(file);

    if (ext === ".py" || ext === ".pyi") {
      for (const imp of extractPyImports(text)) {
        if (imp.dots > 0 && imp.module === "") {
          // `from . import a, b` -> each name is a sibling submodule
          for (const name of imp.names) {
            addEdge(file, resolvePyRelative(file, imp.dots, name, fileSet));
          }
        } else if (imp.dots > 0) {
          addEdge(file, resolvePyRelative(file, imp.dots, imp.module, fileSet));
        } else {
          addEdge(file, resolvePyAbsolute(imp.module, fileSet));
        }
      }
    } else {
      for (const spec of extractJsSpecifiers(text)) {
        addEdge(file, resolveJs(file, spec, fileSet));
      }
    }
  }

  edges.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : a.to < b.to ? -1 : a.to > b.to ? 1 : 0));
  return { edges, externalImports, filesScanned };
}

/** Collapse file-level nodes/edges to module (directory) level. */
export function collapseToModules(
  codeFiles: string[],
  edges: ImportEdge[],
): { nodes: string[]; edges: ImportEdge[] } {
  const nodeSet = new Set<string>();
  for (const f of codeFiles) nodeSet.add(moduleKey(f));

  const edgeKeys = new Set<string>();
  const out: ImportEdge[] = [];
  for (const e of edges) {
    const from = moduleKey(e.from);
    const to = moduleKey(e.to);
    if (from === to) continue;
    const key = `${from}\u0000${to}`;
    if (edgeKeys.has(key)) continue;
    edgeKeys.add(key);
    out.push({ from, to });
  }
  out.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : a.to < b.to ? -1 : a.to > b.to ? 1 : 0));
  return { nodes: [...nodeSet].sort(), edges: out };
}
