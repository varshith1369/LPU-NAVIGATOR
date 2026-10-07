import { readFileSync, existsSync } from "node:fs";
const path = new URL("../../data/public-map.json", import.meta.url);
export const publicMap = () =>
  existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
export async function seedPublicMap(db) {
  const data = publicMap();
  if (!data) return;
  await db.transaction(async (tx) => {
    if (
      (
        await tx.query(
          "SELECT id FROM sources WHERE id='osm-snapshot-2026-10-07'",
        )
      ).rows.length
    )
      return;
    const source = async (s) =>
      tx.query(
        "INSERT INTO sources(id,type,title,url,retrieved_at,license,notes) VALUES($1,'PUBLIC_MAP',$2,$3,$4,'ODbL-1.0',$5) ON CONFLICT(id) DO NOTHING",
        [
          s.id,
          s.title,
          s.url,
          "2026-10-07T00:00:00Z",
          `Public OSM evidence; version ${s.version ?? "snapshot"}, edited ${s.timestamp ?? "unknown"}. © OpenStreetMap contributors. Not official campus verification.`,
        ],
      );
    const nodeIds = new Map();
    for (const edge of data.paths)
      for (const point of [edge.from, edge.to]) {
        if (nodeIds.has(point.osm_id)) continue;
        const s = {
          id: `osm-node-${point.osm_id}`,
          title: `OpenStreetMap node ${point.osm_id}`,
          url: `https://www.openstreetmap.org/node/${point.osm_id}`,
        };
        await source(s);
        const row = (
          await tx.query(
            "INSERT INTO path_nodes(point,source_id,verification_status) VALUES(ST_SetSRID(ST_MakePoint($1,$2),4326)::geography,$3,'APPROXIMATE') RETURNING id",
            [point.longitude, point.latitude, s.id],
          )
        ).rows[0];
        nodeIds.set(point.osm_id, row.id);
      }
    for (const edge of data.paths) {
      await source(edge.source);
      const from = edge.reverse ? edge.to : edge.from,
        to = edge.reverse ? edge.from : edge.to;
      await tx.query(
        `INSERT INTO path_edges(from_node_id,to_node_id,path,source_id,verification_status,accessible,accessibility_source_id,accessibility_checked_at,one_way,road_type) VALUES($1,$2,ST_SetSRID(ST_GeomFromGeoJSON($3),4326)::geography,$4,'APPROXIMATE',$5,$6,$7,$8,$9)`,
        [
          nodeIds.get(from.osm_id),
          nodeIds.get(to.osm_id),
          JSON.stringify({
            type: "LineString",
            coordinates: edge.reverse
              ? [...edge.coordinates].reverse()
              : edge.coordinates,
          }),
          edge.source.id,
          edge.accessible,
          edge.accessible === null ? null : edge.source.id,
          edge.accessible === null ? null : "2026-10-07T00:00:00Z",
          edge.one_way || edge.reverse,
          edge.road_type,
        ],
      );
    }
    for (const place of data.places) {
      await source(place.source);
      const row = (
        await tx.query(
          `INSERT INTO locations(name,category_id,description,source_id,verification_status,verification_date,latitude,longitude,position_source_id,position_verification,position_verified_at,status) VALUES($1,(SELECT id FROM categories WHERE name=$2),$3,$4,'VERIFIED_PUBLIC',$5,$6,$7,$4,$8,$5,'UNKNOWN') RETURNING id`,
          [
            place.name,
            place.category,
            place.description,
            place.source.id,
            "2026-10-07T00:00:00Z",
            place.latitude,
            place.longitude,
            place.position_verification,
          ],
        )
      ).rows[0];
      // A shared OSM node proves geometric contact, but not an entrance. Do not promote it automatically.
      await tx.query(
        `INSERT INTO location_evidence(location_id,source_id,claim_field,claim_value,verification_status) VALUES($1,$2,'public_map_feature',$3,'VERIFIED_PUBLIC')`,
        [
          row.id,
          place.source.id,
          JSON.stringify({
            name: place.name,
            position_method:
              place.position_verification === "APPROXIMATE"
                ? "PointOnSurface"
                : "OSM point",
            osm_node_ids: place.osm_node_ids,
          }),
        ],
      );
    }
    await tx.query(
      "INSERT INTO sources(id,type,title,url,retrieved_at,license,sha256,notes) VALUES('osm-snapshot-2026-10-07','PUBLIC_MAP','Campus OSM snapshot','https://www.openstreetmap.org/way/422435593','2026-10-07','ODbL-1.0',$1,$2)",
      [
        data.area_sha256,
        "Import marker. Current operation and entrance connectivity remain unverified.",
      ],
    );
  });
}
