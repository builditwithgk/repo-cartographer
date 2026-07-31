import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { findCycles } from "../src/lib/cycles.js";
import type { ImportEdge } from "../src/types.js";

const e = (from: string, to: string): ImportEdge => ({ from, to });

describe("findCycles", () => {
  test("a DAG has no cycles", () => {
    assert.deepEqual(findCycles(["a", "b", "c"], [e("a", "b"), e("b", "c"), e("a", "c")]), []);
  });

  test("an isolated node set has no cycles", () => {
    assert.deepEqual(findCycles(["a", "b"], []), []);
  });

  test("finds a two-node cycle", () => {
    assert.deepEqual(findCycles(["a", "b"], [e("a", "b"), e("b", "a")]), [["a", "b"]]);
  });

  test("finds a longer cycle and excludes nodes hanging off it", () => {
    const edges = [e("a", "b"), e("b", "c"), e("c", "a"), e("c", "d")];
    assert.deepEqual(findCycles(["a", "b", "c", "d"], edges), [["a", "b", "c"]]);
  });

  test("reports a self-import as a single-node cycle", () => {
    assert.deepEqual(findCycles(["a"], [e("a", "a")]), [["a"]]);
  });

  test("reports a self-import once even if the edge is repeated", () => {
    assert.deepEqual(findCycles(["a", "b"], [e("a", "a"), e("a", "a"), e("a", "b")]), [["a"]]);
  });

  test("finds multiple disjoint cycles, sorted", () => {
    const edges = [e("c", "d"), e("d", "c"), e("a", "b"), e("b", "a")];
    assert.deepEqual(findCycles(["a", "b", "c", "d"], edges), [
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  test("merges overlapping cycles into one strongly-connected component", () => {
    // a<->b and b<->c share b, so all three are mutually reachable.
    const edges = [e("a", "b"), e("b", "a"), e("b", "c"), e("c", "b")];
    assert.deepEqual(findCycles(["a", "b", "c"], edges), [["a", "b", "c"]]);
  });

  test("handles nodes that appear only in edges", () => {
    assert.deepEqual(findCycles(["a"], [e("a", "b"), e("b", "a")]), [["a", "b"]]);
  });

  test("output is independent of node and edge input order", () => {
    const nodes = ["a", "b", "c", "d", "e", "f"];
    const edges = [e("a", "b"), e("b", "c"), e("c", "a"), e("d", "e"), e("e", "d"), e("f", "a")];
    const expected = [
      ["a", "b", "c"],
      ["d", "e"],
    ];
    assert.deepEqual(findCycles(nodes, edges), expected);
    assert.deepEqual(findCycles([...nodes].reverse(), [...edges].reverse()), expected);
  });

  test("is iterative — a 20k-node chain does not overflow the stack", () => {
    const n = 20_000;
    const nodes = Array.from({ length: n }, (_, i) => `n${i}`);
    const edges = Array.from({ length: n - 1 }, (_, i) => e(`n${i}`, `n${i + 1}`));
    assert.deepEqual(findCycles(nodes, edges), []);
  });

  test("is iterative — a 20k-node ring is found as one component", () => {
    const n = 20_000;
    const nodes = Array.from({ length: n }, (_, i) => `n${i}`);
    const edges = Array.from({ length: n }, (_, i) => e(`n${i}`, `n${(i + 1) % n}`));
    const cycles = findCycles(nodes, edges);
    assert.equal(cycles.length, 1);
    assert.equal(cycles[0].length, n);
  });
});
