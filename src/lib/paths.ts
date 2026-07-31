/**
 * Repo-relative path helpers. All paths inside the server use posix separators
 * ("/") regardless of OS, so output is stable across platforms.
 */

/** Source extensions we parse for imports (JS/TS + Python — v1 scope). */
export const CODE_EXT: ReadonlySet<string> = new Set([
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".pyi",
]);

/** JS/TS extensions used when resolving extensionless / ".js" import specifiers. */
export const JS_EXTS: readonly string[] = [
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
];

/**
 * Common "container" directories that hold the real modules. When a repo nests
 * everything under one of these, we key modules one level deeper so the diagram
 * stays informative (e.g. `src/tools` instead of a single `src` blob).
 */
const CONTAINERS: ReadonlySet<string> = new Set([
  "src",
  "lib",
  "app",
  "source",
  "packages",
  "internal",
  "pkg",
  "cmd",
]);

/**
 * Is this a conventional source-container directory name? Used by moduleKey
 * (key one level deeper) and by the zip-wrapper heuristic (a lone `src/` at
 * the root is structure, not a wrapper to descend past).
 */
export function isContainerDir(name: string): boolean {
  return CONTAINERS.has(name.toLowerCase());
}

export function extname(file: string): string {
  const slash = file.lastIndexOf("/");
  const dot = file.lastIndexOf(".");
  if (dot <= slash) return "";
  return file.slice(dot).toLowerCase();
}

export function basename(file: string): string {
  const i = file.lastIndexOf("/");
  return i < 0 ? file : file.slice(i + 1);
}

export function isCodeFile(file: string): boolean {
  return CODE_EXT.has(extname(file));
}

export function posixDirname(p: string): string {
  const i = p.lastIndexOf("/");
  return i < 0 ? "" : p.slice(0, i);
}

export function joinPosix(a: string, b: string): string {
  if (a === "") return b;
  if (b === "") return a;
  return `${a}/${b}`;
}

/** Normalize "." and ".." segments in a posix path. */
export function posixNormalize(p: string): string {
  const out: string[] = [];
  for (const part of p.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (out.length && out[out.length - 1] !== "..") out.pop();
      else out.push("..");
    } else {
      out.push(part);
    }
  }
  return out.join("/");
}

/** Strip a trailing JS/TS extension, if present (used for ".js" -> ".ts" resolution). */
export function stripCodeExt(p: string): string {
  const ext = extname(p);
  return JS_EXTS.includes(ext) ? p.slice(0, p.length - ext.length) : p;
}

/**
 * Group key for a file: its top-level directory, or "container/second" when the
 * top level is a known container dir. Root files map to "(root)".
 */
export function moduleKey(file: string): string {
  const parts = file.split("/");
  if (parts.length === 1) return "(root)";
  if (CONTAINERS.has(parts[0]) && parts.length >= 3) return `${parts[0]}/${parts[1]}`;
  return parts[0];
}
