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
  if (process.env.BOOTSTRAP_ADMIN_EMAIL) {
    await db.transaction(async (tx) => {
      const user = (
        await tx.query(
          "SELECT id,role FROM users WHERE lower(email)=$1 FOR UPDATE",
          [process.env.BOOTSTRAP_ADMIN_EMAIL.trim().toLowerCase()],
        )
      ).rows[0];
      if (!user) {
        console.log("Bootstrap admin account must register before promotion.");
        return;
      }
      if (user.role === "ADMIN") return;
      await tx.query("UPDATE users SET role='ADMIN' WHERE id=$1", [user.id]);
      await tx.query(
        "INSERT INTO audit_logs(action,entity_type,entity_id,before_value,after_value) VALUES('BOOTSTRAP_ADMIN','users',$1,$2,$3)",
        [
          String(user.id),
          JSON.stringify({ role: user.role }),
          JSON.stringify({ role: "ADMIN" }),
        ],
      );
      console.log("Configured administrator promoted.");
    });
  }
  console.log(
    "Database initialized. Historical and available public-map records seeded separately.",
  );
} finally {
  await db.close();
}
