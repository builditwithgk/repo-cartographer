import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  detectEntryPoints,
  detectLanguages,
  detectManifestAndFrameworks,
} from "../src/lib/detect.js";
import { makeRepo } from "./helpers/fixture.js";

describe("detectLanguages", () => {
  test("orders languages by prevalence, then alphabetically", () => {
    assert.deepEqual(detectLanguages(["a.ts", "b.tsx", "c.py", "d.go"]), ["TypeScript", "Go", "Python"]);
  });

  test("breaks ties alphabetically so output is stable", () => {
    assert.deepEqual(detectLanguages(["a.ts", "b.py"]), ["Python", "TypeScript"]);
    assert.deepEqual(detectLanguages(["b.py", "a.ts"]), ["Python", "TypeScript"]);
  });

  test("ignores files with no known language", () => {
    assert.deepEqual(detectLanguages(["README.md", "logo.png", "Makefile"]), []);
  });
});

describe("detectManifestAndFrameworks — package.json", () => {
  test("reads name, version, description and every dependency table", () => {
    const root = makeRepo({
      "package.json": JSON.stringify({
        name: "my-app",
        version: "2.1.0",
        description: "does things",
        dependencies: { react: "^18", express: "^4" },
        devDependencies: { vitest: "^1" },
        peerDependencies: { "react-dom": "^18" },
      }),
    });

    const { manifest, frameworks } = detectManifestAndFrameworks(root, ["package.json"]);

    assert.equal(manifest.name, "my-app");
    assert.equal(manifest.version, "2.1.0");
    assert.equal(manifest.description, "does things");
    assert.deepEqual(manifest.dependencies, ["express", "react", "react-dom", "vitest"]);
    assert.deepEqual(frameworks, ["Express", "React", "Vitest"]);
  });

  test("recognizes scoped framework families by prefix", () => {
    const root = makeRepo({
      "package.json": JSON.stringify({ dependencies: { "@nestjs/core": "^10", "@angular/common": "^17" } }),
    });
    assert.deepEqual(detectManifestAndFrameworks(root, ["package.json"]).frameworks, ["Angular", "NestJS"]);
  });

  test("notes an unparseable package.json instead of throwing", () => {
    const root = makeRepo({ "package.json": "{ not json" });
    const { manifest, notes } = detectManifestAndFrameworks(root, ["package.json"]);
    assert.deepEqual(manifest.dependencies, []);
    assert.deepEqual(notes, ["package.json present but could not be parsed"]);
  });

  test("returns empty values when there is no manifest at all", () => {
    const { manifest, frameworks } = detectManifestAndFrameworks(makeRepo({}), []);
    assert.deepEqual(manifest, { name: null, version: null, description: null, dependencies: [] });
    assert.deepEqual(frameworks, []);
  });
});

describe("detectManifestAndFrameworks — Python", () => {
  test("parses requirements.txt, skipping comments and pip options", () => {
    const root = makeRepo({
      "requirements.txt": ["flask==2.0", "# a comment", "-r other.txt", "", "scikit_learn>=1.0  # inline"].join("\n"),
    });
    const { manifest, frameworks } = detectManifestAndFrameworks(root, ["requirements.txt"]);
    assert.deepEqual(manifest.dependencies, ["flask", "scikit-learn"]);
    assert.deepEqual(frameworks, ["Flask", "scikit-learn"]);
  });

  test("parses a PEP 621 pyproject.toml", () => {
    const root = makeRepo({
      "pyproject.toml": ['[project]', 'name = "my-service"', 'dependencies = [', '  "fastapi>=0.1",', '  "pydantic",', ']'].join("\n"),
    });
    const { manifest, frameworks } = detectManifestAndFrameworks(root, ["pyproject.toml"]);
    assert.equal(manifest.name, "my-service");
    assert.deepEqual(manifest.dependencies, ["fastapi", "pydantic"]);
    assert.deepEqual(frameworks, ["FastAPI", "Pydantic"]);
  });

  test("parses a Poetry dependency table and drops the python pin", () => {
    const root = makeRepo({
      "pyproject.toml": [
        "[tool.poetry]",
        'name = "poetry-app"',
        "[tool.poetry.dependencies]",
        'python = "^3.11"',
        'django = "^5.0"',
        "[tool.poetry.group.dev.dependencies]",
      ].join("\n"),
    });
    const { manifest, frameworks } = detectManifestAndFrameworks(root, ["pyproject.toml"]);
    assert.ok(!manifest.dependencies.includes("python"));
    assert.ok(manifest.dependencies.includes("django"));
    assert.deepEqual(frameworks, ["Django"]);
  });

  test("parses install_requires from setup.py", () => {
    const root = makeRepo({
      "setup.py": 'from setuptools import setup\nsetup(install_requires=["requests", "numpy>=1.20"])\n',
    });
    const { manifest } = detectManifestAndFrameworks(root, ["setup.py"]);
    assert.deepEqual(manifest.dependencies, ["numpy", "requests"]);
  });

  test("picks up requirements files in subdirectories", () => {
    const root = makeRepo({ "backend/requirements-dev.txt": "celery\n" });
    const { manifest } = detectManifestAndFrameworks(root, ["backend/requirements-dev.txt"]);
    assert.deepEqual(manifest.dependencies, ["celery"]);
  });

  test("does not read a requirements/ directory layout (known gap)", () => {
    // Only files *named* requirements*.txt are parsed, not requirements/*.txt.
    // Pinned so a future change to the pattern is a deliberate one. See TODO.md.
    const root = makeRepo({ "requirements/base.txt": "celery\n" });
    assert.deepEqual(detectManifestAndFrameworks(root, ["requirements/base.txt"]).manifest.dependencies, []);
  });

  test("package.json wins the name when both manifests exist", () => {
    const root = makeRepo({
      "package.json": JSON.stringify({ name: "js-name" }),
      "pyproject.toml": '[project]\nname = "py-name"\n',
    });
    const { manifest } = detectManifestAndFrameworks(root, ["package.json", "pyproject.toml"]);
    assert.equal(manifest.name, "js-name");
  });
});

describe("detectEntryPoints", () => {
  test("resolves package.json main / module / bin targets", () => {
    const root = makeRepo({
      "package.json": JSON.stringify({
        main: "./bin/tool.js",
        bin: { tool: "bin/other.js" },
      }),
      "bin/tool.js": "",
      "bin/other.js": "",
    });
    const { entryPoints } = detectEntryPoints(root, ["package.json", "bin/other.js", "bin/tool.js"]);
    assert.deepEqual(entryPoints, ["bin/other.js", "bin/tool.js"]);
  });

  test("ignores manifest targets that do not exist (e.g. unbuilt dist/)", () => {
    const root = makeRepo({ "package.json": JSON.stringify({ main: "dist/index.js" }) });
    assert.deepEqual(detectEntryPoints(root, ["package.json"]).entryPoints, []);
  });

  test("recognizes well-known entry filenames anywhere in the tree", () => {
    const root = makeRepo({ "src/index.ts": "", "app/server.js": "", "lib/helper.ts": "" });
    const { entryPoints } = detectEntryPoints(root, ["app/server.js", "lib/helper.ts", "src/index.ts"]);
    assert.deepEqual(entryPoints, ["app/server.js", "src/index.ts"]);
  });

  test("detects a Python __main__ guard", () => {
    const root = makeRepo({
      "job.py": 'def go():\n    pass\n\nif __name__ == "__main__":\n    go()\n',
      "helpers.py": "def helper():\n    pass\n",
    });
    assert.deepEqual(detectEntryPoints(root, ["helpers.py", "job.py"]).entryPoints, ["job.py"]);
  });

  test("returns a sorted, de-duplicated list", () => {
    const root = makeRepo({
      "package.json": JSON.stringify({ main: "main.py" }),
      "main.py": 'if __name__ == "__main__":\n    pass\n',
    });
    // main.py qualifies three ways (manifest main, known basename, __main__ guard).
    assert.deepEqual(detectEntryPoints(root, ["main.py", "package.json"]).entryPoints, ["main.py"]);
  });
});
