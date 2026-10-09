import { PGlite } from "@electric-sql/pglite";
import { postgis } from "@electric-sql/pglite-postgis";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { connectPostgres } from "./postgres.mjs";
import { mkdirSync, readFileSync } from "node:fs";
import { parse } from "csv-parse/sync";

export async function connectDatabase({ memory = false } = {}) {
  let db;
  if (process.env.DATABASE_URL && !memory) {
    db = connectPostgres();
  } else {
    if (process.env.NODE_ENV === "production" && !memory)
      throw new Error("Production requires DATABASE_URL");
    if (!memory)
      mkdirSync(new URL("../../.local/", import.meta.url), { recursive: true });
    db = new PGlite({
      dataDir: memory
        ? undefined
        : new URL("../../.local/postgres/", import.meta.url).pathname.replace(
            /^\/([A-Z]:)/,
            "$1",
          ),
      extensions: { postgis, pg_trgm },
    });
    await db.waitReady;
  }
  return db;
}

export async function migrate(db) {
  // Deployment runs this separately before serving traffic.
  const exists = await db.query(
    "SELECT to_regclass('public.locations') AS name",
  );
  if (!exists.rows[0].name)
    await db.exec(
      readFileSync(
        new URL("../../database/schema/001_initial.sql", import.meta.url),
        "utf8",
      ),
    );
  await db.exec(
    readFileSync(
      new URL("../../database/schema/002_conversations.sql", import.meta.url),
      "utf8",
    ),
  );
  await db.exec(
    readFileSync(
      new URL("../../database/schema/003_rate_limits.sql", import.meta.url),
      "utf8",
    ),
  );
}

export async function seedHistorical(db) {
  const sources = JSON.parse(
    readFileSync(new URL("../../data/sources.json", import.meta.url), "utf8"),
  );
  const rows = parse(
    readFileSync(
      new URL("../../data/lpu_locations.csv", import.meta.url),
      "utf8",
    ),
    { columns: true, skip_empty_lines: true },
  );
  const categories = parse(
    readFileSync(
      new URL("../../data/lpu_categories.csv", import.meta.url),
      "utf8",
    ),
    { columns: true, skip_empty_lines: true },
  );
  await db.transaction(async (tx) => {
    for (const source of sources)
      await tx.query(
        "INSERT INTO sources(id,type,title,sha256,notes) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO NOTHING",
        [source.id, source.type, source.title, source.sha256, source.notes],
      );
    for (const cat of categories)
      await tx.query(
        "INSERT INTO categories(name) VALUES($1) ON CONFLICT(name) DO NOTHING",
        [cat.name],
      );
    for (const row of rows)
      await tx.query(
        `INSERT INTO historical_locations(source_id,old_map_id,old_map_name,proposed_category_id,transcription_confidence,notes)
   VALUES($1,$2,$3,(SELECT id FROM categories WHERE name=$4),$5,$6) ON CONFLICT(source_id,old_map_id) DO NOTHING`,
        [
          row.source_id,
          Number(row.old_map_id),
          row.old_map_name,
          row.proposed_category,
          row.transcription_confidence,
          row.notes,
        ],
      );
  });
}
