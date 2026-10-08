import { readFileSync } from "node:fs";

export const numberedBuildings = JSON.parse(
  readFileSync(
    new URL("../../data/numbered-buildings.json", import.meta.url),
    "utf8",
  ),
).blocks;
export const numberReference = (sourceId) =>
  numberedBuildings.find(
    (p) => (p.existing_source_id ?? p.source.id) === sourceId,
  );

export function withNumberedBuildings(places) {
  const existing = places.map((p) => {
    const block = numberReference(p.source.id);
    return block
      ? {
          ...p,
          building_code: block.building_code,
          building_source_url: (block.number_source ?? block.source).url,
        }
      : p;
  });
  return [
    ...existing,
    ...numberedBuildings
      .filter((p) => !p.existing_source_id)
      .map((p) => ({
        ...p,
        building_source_url: (p.number_source ?? p.source).url,
        verification_status: "VERIFIED_PUBLIC",
        position_verification: "VERIFIED_PUBLIC",
        description:
          "Number and building position sourced from public map listings. This point is not a verified entrance.",
      })),
  ];
}

export async function seedNumberedBuildings(db) {
  await db.transaction(async (tx) => {
    for (const p of numberedBuildings) {
      const sourceId = p.existing_source_id ?? p.source.id;
      const evidenceSource = p.number_source ?? p.source;
      for (const s of [p.source, p.number_source].filter(Boolean)) {
        await tx.query(
          `INSERT INTO sources(id,type,title,url,retrieved_at,notes) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO NOTHING`,
          [
            s.id,
            s.type ?? "PUBLIC_MAP",
            s.title,
            s.url,
            p.retrieved_at,
            "Building identification evidence; not a surveyed entrance. See numbered-buildings.json for the matched listing.",
          ],
        );
      }
      let location = (
        await tx.query(
          "SELECT id,building_code FROM locations WHERE source_id=$1 ORDER BY id LIMIT 1",
          [sourceId],
        )
      ).rows[0];
      if (!location && !p.existing_source_id) {
        location = (
          await tx.query(
            `INSERT INTO locations(name,category_id,building_code,description,source_id,verification_status,verification_date,latitude,longitude,position_source_id,position_verification,position_verified_at,status) VALUES($1,(SELECT id FROM categories WHERE name=$2),$3,$4,$5,'VERIFIED_PUBLIC',$6,$7,$8,$5,'VERIFIED_PUBLIC',$6,'UNKNOWN') RETURNING id,building_code`,
            [
              p.name,
              p.category,
              p.building_code,
              "Public map building location; entrance and current operation are not verified.",
              sourceId,
              p.retrieved_at,
              p.latitude,
              p.longitude,
            ],
          )
        ).rows[0];
      }
      if (!location)
        throw new Error(
          `Missing existing location for block ${p.building_code}`,
        );
      // Never replace an administrator's existing building code or position.
      if (!location.building_code)
        await tx.query(
          "UPDATE locations SET building_code=$1,updated_at=now(),version=version+1 WHERE id=$2 AND building_code IS NULL",
          [p.building_code, location.id],
        );
      if (location.building_code && location.building_code !== p.building_code)
        continue;
      await tx.query(
        `INSERT INTO location_evidence(location_id,source_id,claim_field,claim_value,verification_status) SELECT $1,$2,'building_code',$3,'VERIFIED_PUBLIC' WHERE NOT EXISTS (SELECT 1 FROM location_evidence WHERE location_id=$1 AND source_id=$2 AND claim_field='building_code')`,
        [
          location.id,
          evidenceSource.id,
          JSON.stringify({
            building_code: p.building_code,
            listing: p.evidence,
            position_source: p.source.url,
          }),
        ],
      );
      await tx.query(
        "INSERT INTO location_aliases(location_id,alias,source_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
        [location.id, `Block ${p.building_code}`, evidenceSource.id],
      );
    }
  });
}
