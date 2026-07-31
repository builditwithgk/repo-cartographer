import type { ImportEdge } from "../types.js";

/**
 * Find dependency cycles via Tarjan's strongly-connected-components algorithm.
 * Any SCC with more than one node is a cycle; self-loops are reported too.
 * Returns each cycle as a sorted list of node ids (deterministic order).
 */
export function findCycles(nodes: string[], edges: ImportEdge[]): string[][] {
  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n, []);
  const selfLoops: string[] = [];
  for (const e of edges) {
    if (e.from === e.to) {
      selfLoops.push(e.from);
      continue;
    }
    if (!adj.has(e.from)) adj.set(e.from, []);
    if (!adj.has(e.to)) adj.set(e.to, []);
    adj.get(e.from)!.push(e.to);
  }

  let index = 0;
  const indices = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const cycles: string[][] = [];

  // iterative Tarjan (avoids deep recursion on large graphs)
  const allNodes = [...adj.keys()].sort();
  for (const start of allNodes) {
    if (indices.has(start)) continue;
    const work: Array<{ node: string; i: number }> = [{ node: start, i: 0 }];
    while (work.length) {
      const frame = work[work.length - 1];
      const { node } = frame;
      if (frame.i === 0) {
        indices.set(node, index);
        low.set(node, index);
        index++;
        stack.push(node);
        onStack.add(node);
      }
      const neighbors = adj.get(node) ?? [];
      if (frame.i < neighbors.length) {
        const next = neighbors[frame.i];
        frame.i++;
        if (!indices.has(next)) {
          work.push({ node: next, i: 0 });
        } else if (onStack.has(next)) {
          low.set(node, Math.min(low.get(node)!, indices.get(next)!));
        }
      } else {
        if (low.get(node) === indices.get(node)) {
          const comp: string[] = [];
          let w: string;
          do {
            w = stack.pop()!;
            onStack.delete(w);
            comp.push(w);
          } while (w !== node);
          if (comp.length > 1) cycles.push(comp.sort());
        }
        work.pop();
        if (work.length) {
          const parent = work[work.length - 1].node;
          low.set(parent, Math.min(low.get(parent)!, low.get(node)!));
        }
      }
    }
  }

  for (const n of [...new Set(selfLoops)].sort()) cycles.push([n]);
  cycles.sort((a, b) => (a.join() < b.join() ? -1 : a.join() > b.join() ? 1 : 0));
  return cycles;
}
