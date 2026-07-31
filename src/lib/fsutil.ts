import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Resolve `p` to an absolute path and assert it is an existing directory.
 * Throws a clear Error (caught at the tool boundary) rather than a raw fs error.
 */
export function resolveDir(p: string): string {
  const abs = resolve(p);
  let st;
  try {
    st = statSync(abs);
  } catch {
    throw new Error(`Path does not exist: ${abs}`);
  }
  if (!st.isDirectory()) {
    throw new Error(`Path is not a directory: ${abs}`);
  }
  return abs;
}

/**
 * Read a text file, capped at `maxBytes`. Returns null for missing/unreadable
 * files and for likely-binary files (a NUL byte in the first 4 KB).
 */
export function readTextCapped(abs: string, maxBytes: number): string | null {
  try {
    const st = statSync(abs);
    if (!st.isFile()) return null;
    const buf = readFileSync(abs);
    const slice = buf.length > maxBytes ? buf.subarray(0, maxBytes) : buf;
    const probe = slice.subarray(0, Math.min(4096, slice.length));
    if (probe.includes(0)) return null; // binary
    return slice.toString("utf8");
  } catch {
    return null;
  }
}
