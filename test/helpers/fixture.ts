/**
 * Throwaway on-disk repos for tests.
 *
 * Several units (import extraction, walking, manifest detection, `runCheck`)
 * read real files, so they need a real directory. Each fixture gets its own
 * `mkdtemp` directory and everything is removed when the process exits.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { isCodeFile } from "../../src/lib/paths.js";

const created: string[] = [];

process.on("exit", () => {
  for (const dir of created) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best effort — the OS temp dir gets cleaned eventually */
    }
  }
});

/**
 * Materialize a repo from a `{ "rel/path": contents }` map and return its
 * absolute root. Parent directories are created automatically; pass `{}` for an
 * empty directory.
 */
export function makeRepo(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "repo-carto-"));
  created.push(root);
  for (const [rel, contents] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, contents, "utf8");
  }
  return root;
}

/**
 * Like {@link makeRepo}, but also returns the sorted repo-relative code files —
 * the exact shape `extractImports` expects from a walk.
 */
export function makeCodeRepo(files: Record<string, string>): { root: string; codeFiles: string[] } {
  return {
    root: makeRepo(files),
    codeFiles: Object.keys(files).filter(isCodeFile).sort(),
  };
}
