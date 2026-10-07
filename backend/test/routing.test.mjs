import { test } from "node:test";
import assert from "node:assert/strict";
import { shortestPath } from "../src/routing.mjs";
const nodes = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
const edge = (a, b, d, extra = {}) => ({
  from_node_id: a,
  to_node_id: b,
  distance_m: d,
  verification_status: "VERIFIED_PUBLIC",
  accessible: true,
  blocked: false,
  one_way: false,
  ...extra,
});
test("shortest route chooses indirect lower cost and reverses undirected edges", () => {
  const result = shortestPath(
    nodes,
    [edge(1, 3, 100), edge(2, 1, 20), edge(2, 3, 30)],
    1,
    3,
  );
  assert.equal(result.distance_m, 50);
  assert.equal(result.edges[0].reverse, true);
});
test("blocked and unknown accessibility edges are excluded", () => {
  assert.equal(
    shortestPath(nodes, [edge(1, 2, 10, { blocked: true })], 1, 2),
    null,
  );
  assert.equal(
    shortestPath(nodes, [edge(1, 2, 10, { accessible: null })], 1, 2, {
      accessible: true,
    }),
    null,
  );
});
test("one-way and disconnected graphs fail honestly", () => {
  assert.equal(
    shortestPath(nodes, [edge(1, 2, 10, { one_way: true })], 2, 1),
    null,
  );
  assert.equal(shortestPath(nodes, [], 1, 4), null);
});
test("unverified and invalid distance edges are unusable", () => {
  assert.equal(
    shortestPath(
      nodes,
      [edge(1, 2, 10, { verification_status: "UNVERIFIED" })],
      1,
      2,
    ),
    null,
  );
  assert.equal(shortestPath(nodes, [edge(1, 2, -5)], 1, 2), null);
});
