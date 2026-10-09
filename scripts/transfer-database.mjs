// Run locally with SOURCE_DATABASE_URL and DATABASE_URL. Never commit backups.
import { writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { connectPostgres } from "../backend/src/postgres.mjs";
import { migrate } from "../backend/src/db.mjs";

const quote = (value) => '"' + value.replaceAll('"', '""') + '"';
const source = connectPostgres(process.env.SOURCE_DATABASE_URL);
const target = connectPostgres();
const digest = (rows) =>
  createHash("sha256")
    .update(JSON.stringify(rows.map((row) => JSON.stringify(row)).sort()))
    .digest("hex");
try {
  if (process.env.SOURCE_DATABASE_URL === process.env.DATABASE_URL)
    throw new Error("Source and destination must differ.");
  const snapshot = await source.transaction(async (tx) => {
    await tx.query(
      "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY",
    );
    await tx.query("SET LOCAL TIME ZONE 'UTC'");
    const tables = (
      await tx.query(`SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind='r' AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.objid=c.oid AND d.deptype='e') ORDER BY c.relname`)
    ).rows;
    const dependencies = (
      await tx.query(
        `SELECT c.relname AS child,p.relname AS parent FROM pg_constraint f JOIN pg_class c ON c.oid=f.conrelid JOIN pg_class p ON p.oid=f.confrelid WHERE f.contype='f' AND c.relnamespace='public'::regnamespace`,
      )
    ).rows;
    const sorted = [];
    while (sorted.length < tables.length) {
      const next = tables.find(
        (t) =>
          !sorted.includes(t.name) &&
          dependencies
            .filter((d) => d.child === t.name && d.parent !== t.name)
            .every((d) => sorted.includes(d.parent)),
      );
      if (!next)
        throw new Error("Cyclic table dependency requires manual migration.");
      sorted.push(next.name);
    }
    const result = [];
    for (const name of sorted) {
      const columns = (
        await tx.query(
          "SELECT column_name,udt_name,is_identity FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND is_generated='NEVER' ORDER BY ordinal_position",
          [name],
        )
      ).rows;
      const projection = columns
        .map((c) =>
          [
            "geometry",
            "geography",
            "timestamptz",
            "timestamp",
            "date",
            "bytea",
          ].includes(c.udt_name)
            ? `${quote(c.column_name)}::text AS ${quote(c.column_name)}`
            : quote(c.column_name),
        )
        .join(",");
      const order = columns
        .map((c) => quote(c.column_name) + "::text")
        .join(",");
      const rows = (
        await tx.query(
          `SELECT ${projection} FROM ${quote(name)} ORDER BY ${order}`,
        )
      ).rows;
      result.push({ name, columns, projection, order, rows });
    }
    return result;
  });
  mkdirSync(".local", { recursive: true });
  writeFileSync(".local/migration-backup.json", JSON.stringify(snapshot), {
    mode: 0o600,
  });
  console.log("Source backup saved locally; table count:", snapshot.length);
  await migrate(target);
  await target.transaction(async (tx) => {
    await tx.query("SET LOCAL TIME ZONE 'UTC'");
    for (const table of snapshot) {
      const count = Number(
        (await tx.query(`SELECT count(*) FROM ${quote(table.name)}`)).rows[0]
          .count,
      );
      if (
        count &&
        !(
          table.name === "conversations" &&
          count === 1 &&
          (
            await tx.query(
              "SELECT 1 FROM conversations WHERE kind='CAMPUS' AND owner_id IS NULL",
            )
          ).rows.length === 1
        )
      )
        throw new Error(
          `Destination table ${table.name} is not empty; refusing overwrite.`,
        );
    }
    await tx.query("DELETE FROM conversations WHERE kind='CAMPUS'");
    for (const table of snapshot) {
      const names = table.columns.map((c) => quote(c.column_name)).join(",");
      for (let offset = 0; offset < table.rows.length; offset += 100) {
        const rows = table.rows.slice(offset, offset + 100),
          values = [];
        const placeholders = rows
          .map(
            (row) =>
              "(" +
              table.columns
                .map((c) => {
                  values.push(
                    ["json", "jsonb"].includes(c.udt_name) &&
                      row[c.column_name] !== null
                      ? JSON.stringify(row[c.column_name])
                      : row[c.column_name],
                  );
                  return "$" + values.length;
                })
                .join(",") +
              ")",
          )
          .join(",");
        await tx.query(
          `INSERT INTO ${quote(table.name)}(${names}) OVERRIDING SYSTEM VALUE VALUES ${placeholders}`,
          values,
        );
      }
      // Re-read using the same projection to verify values, not only row counts.
      const copied = (
        await tx.query(
          `SELECT ${table.projection} FROM ${quote(table.name)} ORDER BY ${table.order}`,
        )
      ).rows;
      if (digest(copied) !== digest(table.rows))
        throw new Error(`Verification failed for ${table.name}; rolling back.`);
      for (const column of table.columns.filter((c) => c.is_identity === "YES"))
        await tx.query(
          `SELECT setval(pg_get_serial_sequence($1,$2),COALESCE((SELECT max(${quote(column.column_name)}) FROM ${quote(table.name)}),1),(SELECT count(*)>0 FROM ${quote(table.name)}))`,
          [table.name, column.column_name],
        );
      console.log(`${table.name}: ${copied.length} rows verified`);
    }
  });
  console.log("Database transfer complete. All copied values verified.");
} finally {
  await Promise.all([source.close(), target.close()]);
}
