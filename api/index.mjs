import { attachDatabasePool } from "@vercel/functions";
import { connectPostgres } from "../backend/src/postgres.mjs";
import { createApp } from "../backend/src/app.mjs";

// Migration and seeding run before cutover, never during a web request.
const db = connectPostgres();
attachDatabasePool(db.pool);
export default createApp(db);
