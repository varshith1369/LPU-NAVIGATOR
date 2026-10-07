import { connectDatabase, migrate, seedHistorical } from "./db.mjs";
import { createApp } from "./app.mjs";
import { seedPublicMap } from "./public-map.mjs";
const db = await connectDatabase();
if (process.env.NODE_ENV !== "production") {
  await migrate(db);
  await seedHistorical(db);
  await seedPublicMap(db);
}
const port = Number(process.env.PORT ?? 3001);
const app = createApp(db);
const server = app.listen(
  port,
  process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1",
  () => console.log(`Campus API ready at http://127.0.0.1:${port}`),
);
for (const event of ["SIGINT", "SIGTERM"])
  process.on(event, () =>
    server.close(async () => {
      await db.close();
      process.exit(0);
    }),
  );
