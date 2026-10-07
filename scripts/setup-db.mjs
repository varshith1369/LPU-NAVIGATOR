import {
  connectDatabase,
  migrate,
  seedHistorical,
} from "../backend/src/db.mjs";
import { seedPublicMap } from "../backend/src/public-map.mjs";
const db = await connectDatabase();
try {
  await migrate(db);
  await seedHistorical(db);
  await seedPublicMap(db);
  console.log(
    "Database initialized. Historical and available public-map records seeded separately.",
  );
} finally {
  await db.close();
}
