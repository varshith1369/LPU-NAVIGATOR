# OpenStreetMap attribution

`osm-campus-source.json`, `osm-campus-area.json` and the derived `public-map.json` contain OpenStreetMap data retrieved on 7 October 2026.

© OpenStreetMap contributors. Data is available under the [Open Database License](https://www.openstreetmap.org/copyright).

Boundary source: [way 422435593](https://www.openstreetmap.org/way/422435593), version 18, edited 4 September 2026. Exact API downloads and transformations are recorded in `scripts/prepare-public-map.mjs` and the `public-map.json` manifest. The bounding-box download includes off-campus records; only records whose representative point is covered by the campus polygon are imported. Pedestrian segments must be wholly covered by the polygon.

Eight named public-map features are retained verbatim, including the ambiguous source label `voll`. Category assignments are inferred. Polygon markers use PostGIS `ST_PointOnSurface` and are marked APPROXIMATE; they are not building entrances. OSM point coordinates are copied directly and marked VERIFIED_PUBLIC. Neither label means official campus verification or confirmed operating status.

261 pedestrian segments preserve OSM geometry and shared-node topology, with approximate verification. Motor roads, private/no-access ways and barrier-connected segments are excluded by the importer. There are no invented connecting lines or automatically inferred entrances. Accessibility defaults to unknown; steps or an explicit `wheelchair=no` tag make an edge inaccessible. Current operational status remains UNKNOWN.

The old user-supplied image is separate from OSM data, stays in ignored local storage, and is not licensed under ODbL by this notice.
