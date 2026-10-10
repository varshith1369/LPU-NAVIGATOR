import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import webpush from "web-push";
import { connectDatabase, migrate } from "../src/db.mjs";
import { createApp } from "../src/app.mjs";
import { allowedPushEndpoint, notifyAnnouncement } from "../src/push.mjs";
let db, app, client, token;
const sub = {
  endpoint: "https://fcm.googleapis.com/fcm/send/test",
  keys: { p256dh: "B".repeat(87), auth: "a".repeat(22) },
};
before(
  async () => {
    const keys = webpush.generateVAPIDKeys();
    process.env.VAPID_PUBLIC_KEY = keys.publicKey;
    process.env.VAPID_PRIVATE_KEY = keys.privateKey;
    db = await connectDatabase({ memory: true });
    await migrate(db);
    app = createApp(db, { limit: false });
    client = request.agent(app);
    token = (await client.get("/api/csrf")).body.token;
  },
  { timeout: 60000 },
);
after(async () => {
  await db?.close();
  delete process.env.VAPID_PUBLIC_KEY;
  delete process.env.VAPID_PRIVATE_KEY;
});
test("push endpoints reject private networks and deceptive domains", () => {
  for (const url of [
    "http://fcm.googleapis.com/x",
    "https://localhost/x",
    "https://127.0.0.1/x",
    "https://fcm.googleapis.com.evil.test/x",
    "https://fcm.googleapis.com:444/x",
    "https://user@fcm.googleapis.com/x",
  ])
    assert.equal(allowedPushEndpoint(url), false, url);
  for (const url of [
    sub.endpoint,
    "https://updates.push.services.mozilla.com/wpush/v2/abc",
    "https://web.push.apple.com/abc",
    "https://wns2.notify.windows.com/abc",
  ])
    assert.equal(allowedPushEndpoint(url), true, url);
});
test("subscription writes need CSRF, validate providers, and protect unsubscribe", async () => {
  await client.post("/api/push/subscriptions").send(sub).expect(403);
  await client
    .post("/api/push/subscriptions")
    .set("X-CSRF-Token", token)
    .send({ ...sub, endpoint: "https://127.0.0.1/" })
    .expect(400);
  await client
    .post("/api/push/subscriptions")
    .set("X-CSRF-Token", token)
    .send(sub)
    .expect(201);
  await client
    .post("/api/push/subscriptions")
    .set("X-CSRF-Token", token)
    .send(sub)
    .expect(201);
  const wrong = { ...sub, keys: { ...sub.keys, auth: "b".repeat(22) } };
  await client
    .post("/api/push/subscriptions")
    .set("X-CSRF-Token", token)
    .send(wrong)
    .expect(409);
  await client
    .delete("/api/push/subscriptions")
    .set("X-CSRF-Token", token)
    .send(wrong)
    .expect(200);
  assert.equal(
    (await db.query("SELECT * FROM push_subscriptions")).rows.length,
    1,
  );
});
test("push uses announcement links, skips scheduled/expired records and removes expired subscriptions", async () => {
  const item = {
    id: 7,
    title: "Campus update",
    description: "A new campus update",
    start_date: new Date(Date.now() - 1000).toISOString(),
  };
  const sent = [];
  await notifyAnnouncement(db, item, async (s, payload) =>
    sent.push(JSON.parse(payload)),
  );
  assert.equal(sent.length, 1);
  assert.equal(sent[0].url, "/?view=announcements");
  await notifyAnnouncement(
    db,
    { ...item, start_date: new Date(Date.now() + 60000).toISOString() },
    async () => sent.push({}),
  );
  await notifyAnnouncement(
    db,
    { ...item, end_date: new Date(Date.now() - 500).toISOString() },
    async () => sent.push({}),
  );
  assert.equal(sent.length, 1);
  await notifyAnnouncement(db, item, async () => {
    throw { statusCode: 410 };
  });
  assert.equal(
    (await db.query("SELECT * FROM push_subscriptions")).rows.length,
    0,
  );
});
