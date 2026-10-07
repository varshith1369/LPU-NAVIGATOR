import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { connectDatabase } from "../backend/src/db.mjs";
const area = JSON.parse(readFileSync("data/osm-campus-area.json", "utf8"));
const campus = JSON.parse(readFileSync("data/osm-campus-source.json", "utf8"));
const nodes = new Map(
  area.elements.filter((e) => e.type === "node").map((e) => [e.id, e]),
);
for (const n of campus.elements.filter((e) => e.type === "node"))
  nodes.set(n.id, n);
const outline = campus.elements.find(
  (e) => e.type === "way" && e.id === 422435593,
);
const polygon = {
  type: "Polygon",
  coordinates: [
    outline.nodes.map((id) => [nodes.get(id).lon, nodes.get(id).lat]),
  ],
};
const db = await connectDatabase({ memory: true });
await db.exec("CREATE EXTENSION postgis");
const places = [],
  paths = [];
const osmSource = (e) => ({
  id: `osm-${e.type}-${e.id}`,
  type: "PUBLIC_MAP",
  title: `OpenStreetMap ${e.type} ${e.id}`,
  url: `https://www.openstreetmap.org/${e.type}/${e.id}`,
  version: e.version,
  timestamp: e.timestamp,
});
function category(tags, name) {
  if (tags.amenity === "library") return "Library";
  if (["hospital", "clinic", "pharmacy"].includes(tags.amenity))
    return "Healthcare";
  if (["restaurant", "cafe", "fast_food", "food_court"].includes(tags.amenity))
    return "Food";
  if (["bank", "atm"].includes(tags.amenity)) return "Banking";
  if (tags.leisure) return "Sports";
  if (tags.shop || /mall/i.test(name)) return "Shopping";
  if (/hostel/i.test(name)) return "Hostel";
  if (/block|school|institute/i.test(name)) return "Academic";
  if (tags.barrier === "gate") return "Transport";
  return "Other";
}
try {
  for (const element of area.elements) {
    const t = element.tags ?? {},
      name = t["name:en"] ?? t.name;
    if (
      !name ||
      element.type === "relation" ||
      element.id === 422435593 ||
      name === "LPU" ||
      t.highway
    )
      continue;
    const geometry =
      element.type === "node"
        ? { type: "Point", coordinates: [element.lon, element.lat] }
        : element.nodes?.[0] === element.nodes?.at(-1)
          ? {
              type: "Polygon",
              coordinates: [
                element.nodes.map((n) => [
                  nodes.get(n)?.lon,
                  nodes.get(n)?.lat,
                ]),
              ],
            }
          : null;
    if (!geometry) continue;
    const point = (
      await db.query(
        `SELECT ST_X(p) AS longitude,ST_Y(p) AS latitude FROM (SELECT ST_PointOnSurface(ST_GeomFromGeoJSON($1)) p) q WHERE ST_Covers(ST_GeomFromGeoJSON($2),p)`,
        [JSON.stringify(geometry), JSON.stringify(polygon)],
      )
    ).rows[0];
    if (!point) continue;
    places.push({
      name,
      category: category(t, name),
      ...point,
      source: osmSource(element),
      verification_status: "VERIFIED_PUBLIC",
      position_verification:
        element.type === "node" ? "VERIFIED_PUBLIC" : "APPROXIMATE",
      description: `Public OpenStreetMap record, last edited ${element.timestamp?.slice(0, 10) ?? "at an unknown date"}. ${element.type === "node" ? "Point copied from the mapped feature." : "Marker derived with PostGIS PointOnSurface from the mapped footprint; it is not an entrance."} Current campus use and access have not been officially verified.`,
      osm_node_ids: element.type === "node" ? [element.id] : element.nodes,
    });
  }
  // Import only explicitly pedestrian ways. Unknown/private access and motor roads are not assumed safe.
  for (const e of area.elements) {
    const t = e.tags ?? {};
    if (
      e.type !== "way" ||
      !["footway", "pedestrian", "steps"].includes(t.highway) ||
      ["no", "private"].includes(t.access) ||
      t.foot === "no"
    )
      continue;
    for (let i = 1; i < e.nodes.length; i++) {
      const a = nodes.get(e.nodes[i - 1]),
        b = nodes.get(e.nodes[i]);
      if (!a || !b) continue;
      const coordinates = [
        [a.lon, a.lat],
        [b.lon, b.lat],
      ];
      const covered = (
        await db.query(
          "SELECT ST_Covers(ST_GeomFromGeoJSON($1),ST_GeomFromGeoJSON($2)) AS covered",
          [
            JSON.stringify(polygon),
            JSON.stringify({ type: "LineString", coordinates }),
          ],
        )
      ).rows[0].covered;
      if (!covered) continue;
      // Barrier nodes are disconnected until a campus reviewer establishes usable access.
      if (a.tags?.barrier || b.tags?.barrier) continue;
      paths.push({
        source: osmSource(e),
        from: { osm_id: a.id, latitude: a.lat, longitude: a.lon },
        to: { osm_id: b.id, latitude: b.lat, longitude: b.lon },
        coordinates,
        road_type: t.highway,
        one_way: t["oneway:foot"] === "yes",
        reverse: t["oneway:foot"] === "-1",
        accessible:
          t.highway === "steps" || t.wheelchair === "no" ? false : null,
      });
    }
  }
  const output = {
    retrieved_date: "2026-10-07",
    license: "ODbL-1.0",
    attribution: "© OpenStreetMap contributors",
    copyright_url: "https://www.openstreetmap.org/copyright",
    area_sha256: createHash("sha256")
      .update(readFileSync("data/osm-campus-area.json"))
      .digest("hex"),
    boundary: polygon,
    places,
    paths,
  };
  writeFileSync("data/public-map.json", JSON.stringify(output, null, 2) + "\n");
  console.log(
    JSON.stringify(
      {
        places: places.map((p) => p.name),
        pedestrian_segments: paths.length,
        entrance_policy:
          "Only shared source nodes; never snap or create connecting paths.",
      },
      null,
      2,
    ),
  );
} finally {
  await db.close();
}
