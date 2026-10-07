import { readFileSync } from "node:fs";
import { parse } from "csv-parse/sync";
import { z } from "zod";
import { connectDatabase } from "../backend/src/db.mjs";
const file = process.argv[2];
if (!file)
  throw new Error(
    "Usage: node --env-file-if-exists=.env scripts/import_locations.js path/to/current_locations.csv [--apply]",
  );
const input = parse(readFileSync(file, "utf8"), {
  columns: true,
  skip_empty_lines: true,
});
const coordinate = (min, max) =>
  z.preprocess(
    (v) => (v === "" || v == null ? null : Number(v)),
    z.number().min(min).max(max).nullable(),
  );
const schema = z
  .object({
    name: z.string().trim().min(1).max(200),
    category: z.string().trim().min(1),
    source_id: z.string().trim().min(1),
    latitude: coordinate(-90, 90),
    longitude: coordinate(-180, 180),
    description: z.string().max(5000).default(""),
    building_code: z.string().max(80).optional(),
  })
  .refine(
    (v) => (v.latitude === null) === (v.longitude === null),
    "Latitude and longitude must be provided together",
  );
const rows = input.map((r, i) => {
  try {
    return schema.parse(r);
  } catch (e) {
    throw new Error(`CSV row ${i + 2}: ${e.message}`);
  }
});
const keys = rows.map(
  (r) => `${r.source_id}:${r.name.toLowerCase()}:${r.building_code ?? ""}`,
);
if (new Set(keys).size !== keys.length)
  throw new Error("Duplicate location in input.");
const db = await connectDatabase();
try {
  await db.transaction(async (tx) => {
    for (const row of rows) {
      const category = (
        await tx.query("SELECT id FROM categories WHERE name=$1", [
          row.category,
        ])
      ).rows[0];
      if (!category) throw new Error(`Invalid category: ${row.category}`);
      const source = (
        await tx.query("SELECT type FROM sources WHERE id=$1", [row.source_id])
      ).rows[0];
      if (!source || source.type === "OLD_LPU_MAP")
        throw new Error(`Current evidence required: ${row.source_id}`);
      const duplicate = (
        await tx.query(
          "SELECT id FROM locations WHERE source_id=$1 AND lower(name)=lower($2) AND coalesce(building_code,'')=$3",
          [row.source_id, row.name, row.building_code ?? ""],
        )
      ).rows[0];
      if (duplicate) throw new Error(`Location already exists: ${row.name}`);
      if (process.argv.includes("--apply")) {
        const created = (
          await tx.query(
            "INSERT INTO locations(name,category_id,source_id,latitude,longitude,position_source_id,description,building_code) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id",
            [
              row.name,
              category.id,
              row.source_id,
              row.latitude,
              row.longitude,
              row.latitude === null ? null : row.source_id,
              row.description,
              row.building_code ?? null,
            ],
          )
        ).rows[0];
        await tx.query(
          "INSERT INTO audit_logs(action,entity_type,entity_id,after_value) VALUES('CSV_IMPORT','locations',$1,$2)",
          [String(created.id), JSON.stringify(row)],
        );
      }
    }
  });
  console.log(
    `${rows.length} rows ${process.argv.includes("--apply") ? "imported as unverified" : "validated; pass --apply to import"}.`,
  );
} finally {
  await db.close();
}
