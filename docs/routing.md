# Routing

`backend/src/routing.mjs` implements Dijkstra, equivalently A* with an admissible zero heuristic. Costs are positive geography-derived meters. Blocked edges, unverified edges and prohibited one-way traversal are excluded. Reversing a bidirectional edge reverses its GeoJSON coordinates. Accessibility-required queries exclude every edge whose accessibility is not explicitly true.

Origins and destinations must have real reviewed entrance associations and active operating status. Search enumerates entrance combinations and chooses the shortest connected path. It never draws a line from a building centroid to a nearby path. Walking time uses a recorded edge time or a transparent 1.2 m/s estimate. The current instruction list reports continuation distances; richer turn-by-turn and indoor navigation remain future work.

The imported OSM snapshot contains 261 pedestrian segments with approximate status. No entrances were established by the supplied evidence. Consequently current building-to-building directions correctly return unavailable. Route integration tests use isolated, explicitly synthetic geometries; they never enter the real campus database. Accessible journeys additionally require building entrance/access review before anyone can claim end-to-end accessibility.
