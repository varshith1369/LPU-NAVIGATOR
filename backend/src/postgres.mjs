import pg from "pg";

export function connectPostgres(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error("DATABASE_URL is required");
  const pool = new pg.Pool({
    connectionString,
    max: process.env.VERCEL ? 3 : 10,
    idleTimeoutMillis: 5000,
    connectionTimeoutMillis: 15000,
  });
  // A closed idle connection must not crash a serverless instance.
  pool.on("error", (error) =>
    console.error("Idle database connection:", error.code ?? error.name),
  );
  return {
    pool,
    query: (sql, args) => pool.query(sql, args),
    exec: (sql) => pool.query(sql),
    close: () => pool.end(),
    transaction: async (fn) => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await fn(client);
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
