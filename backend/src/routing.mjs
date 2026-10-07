// Dijkstra (A* with a zero heuristic) is safe for both measured and estimated edge costs.
export function shortestPath(
  nodes,
  edges,
  start,
  goal,
  { accessible = false } = {},
) {
  const key = String;
  start = key(start);
  goal = key(goal);
  const nodeSet = new Set(nodes.map((n) => key(n.id)));
  if (!nodeSet.has(start) || !nodeSet.has(goal)) return null;
  const adjacent = new Map();
  for (const e of edges) {
    if (
      e.blocked ||
      !["VERIFIED_OFFICIAL", "VERIFIED_PUBLIC", "APPROXIMATE"].includes(
        e.verification_status,
      ) ||
      (accessible && e.accessible !== true)
    )
      continue;
    if (!Number.isFinite(Number(e.distance_m)) || Number(e.distance_m) <= 0)
      continue;
    const add = (a, b, reverse) => {
      const items = adjacent.get(key(a)) ?? [];
      items.push({ ...e, to: key(b), reverse });
      adjacent.set(key(a), items);
    };
    add(e.from_node_id, e.to_node_id, false);
    if (!e.one_way) add(e.to_node_id, e.from_node_id, true);
  }
  const costs = new Map([[start, 0]]),
    previous = new Map(),
    pending = new Set([start]),
    visited = new Set();
  while (pending.size) {
    const current = [...pending].reduce((best, id) =>
      costs.get(id) < costs.get(best) ? id : best,
    );
    pending.delete(current);
    if (current === goal) {
      const path = [];
      let cursor = goal;
      while (cursor !== start) {
        const p = previous.get(cursor);
        path.unshift(p.edge);
        cursor = p.from;
      }
      return { distance_m: costs.get(goal), edges: path };
    }
    visited.add(current);
    for (const edge of adjacent.get(current) ?? []) {
      if (visited.has(edge.to)) continue;
      const cost = costs.get(current) + Number(edge.distance_m);
      if (cost < (costs.get(edge.to) ?? Infinity)) {
        costs.set(edge.to, cost);
        previous.set(edge.to, { from: current, edge });
        pending.add(edge.to);
      }
    }
  }
  return null;
}
export async function campusRoute(db, { from, to, accessible = false }) {
  const endpoints = await db.query(
    `SELECT e.location_id,e.node_id FROM location_entrances e JOIN locations l ON l.id=e.location_id JOIN path_nodes n ON n.id=e.node_id WHERE e.location_id IN ($1,$2) AND l.status='ACTIVE' AND l.position_verification IN ('VERIFIED_OFFICIAL','VERIFIED_PUBLIC','APPROXIMATE') AND n.verification_status IN ('VERIFIED_OFFICIAL','VERIFIED_PUBLIC','APPROXIMATE')`,
    [from, to],
  );
  const starts = endpoints.rows.filter(
    (e) => String(e.location_id) === String(from),
  );
  const ends = endpoints.rows.filter(
    (e) => String(e.location_id) === String(to),
  );
  if (!starts.length || !ends.length) return null;
  const nodes = (await db.query("SELECT id FROM path_nodes")).rows;
  const edges = (
    await db.query(
      `SELECT e.*, ST_AsGeoJSON(e.path::geometry)::json AS geometry FROM path_edges e JOIN path_nodes a ON a.id=e.from_node_id JOIN path_nodes b ON b.id=e.to_node_id WHERE a.verification_status IN ('VERIFIED_OFFICIAL','VERIFIED_PUBLIC','APPROXIMATE') AND b.verification_status IN ('VERIFIED_OFFICIAL','VERIFIED_PUBLIC','APPROXIMATE')`,
    )
  ).rows;
  let best = null;
  for (const start of starts)
    for (const end of ends) {
      const route = shortestPath(nodes, edges, start.node_id, end.node_id, {
        accessible,
      });
      if (route && (!best || route.distance_m < best.distance_m)) best = route;
    }
  if (!best) return null;
  const coordinates = [];
  for (const e of best.edges) {
    const coords = e.reverse
      ? [...e.geometry.coordinates].reverse()
      : e.geometry.coordinates;
    coordinates.push(...coords.map(([lng, lat]) => [lat, lng]));
  }
  return {
    ...best,
    edges: undefined,
    coordinates,
    estimated_seconds: Math.ceil(
      best.edges.reduce(
        (sum, e) =>
          sum + (Number(e.estimated_seconds) || Number(e.distance_m) / 1.2),
        0,
      ),
    ),
    notice: accessible
      ? "Path accessibility has been recorded; building access and temporary conditions still need confirmation."
      : best.edges.some((e) => e.verification_status === "APPROXIMATE")
        ? "Approximate route based on sourced, unverified paths. Accessibility has not been verified."
        : "Sourced walking route. Accessibility is not guaranteed. Walking time is an estimate.",
    steps: best.edges.map(
      (e) =>
        `Continue ${Math.round(Number(e.distance_m))} m along ${e.road_type ?? "the mapped path"}.`,
    ),
  };
}
