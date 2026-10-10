import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import webpush from "web-push";
import { connectDatabase, migrate } from "../src/db.mjs";
import { createApp } from "../src/app.mjs";
import {
  allowedPushEndpoint,
  notifyAnnouncement,
  notifyChat,
} from "../src/push.mjs";
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

test("chat preferences require login and device proof, and cannot bind a supplied user ID", async () => {
  await client
    .put("/api/push/chat")
    .set("X-CSRF-Token", token)
    .send({ ...sub, support_alerts: true, campus_alerts: false })
    .expect(401);
  await client
    .post("/api/auth/register")
    .set("X-CSRF-Token", token)
    .send({
      email: "push-owner@example.test",
      password: "test-password-long-123",
    })
    .expect(201);
  await client
    .post("/api/push/subscriptions")
    .set("X-CSRF-Token", token)
    .send(sub)
    .expect(201);
  const endpoint = client.put("/api/push/chat").set("X-CSRF-Token", token);
  await endpoint
    .send({
      ...sub,
      keys: { ...sub.keys, auth: "z".repeat(22) },
      support_alerts: true,
      campus_alerts: true,
    })
    .expect(404);
  await client
    .put("/api/push/chat")
    .set("X-CSRF-Token", token)
    .send({
      ...sub,
      user_id: 99999,
      support_alerts: true,
      campus_alerts: false,
    })
    .expect(200);
  let response = await client
    .post("/api/push/chat/status")
    .set("X-CSRF-Token", token)
    .send(sub)
    .expect(200);
  assert.deepEqual(response.body, {
    support_alerts: true,
    campus_alerts: false,
  });
  const profile = await client.get("/api/profile");
  assert.equal(
    String(
      (
        await db.query(
          "SELECT user_id FROM push_subscriptions WHERE endpoint=$1",
          [sub.endpoint],
        )
      ).rows[0].user_id,
    ),
    String(profile.body.id),
  );
  await client
    .put("/api/push/chat")
    .set("X-CSRF-Token", token)
    .send({ ...sub, support_alerts: false, campus_alerts: false })
    .expect(200);
  response = await client
    .post("/api/push/chat/status")
    .set("X-CSRF-Token", token)
    .send(sub);
  assert.deepEqual(response.body, {
    support_alerts: false,
    campus_alerts: false,
  });
  await client
    .post("/api/auth/logout")
    .set("X-CSRF-Token", token)
    .send({})
    .expect(200);
  await client
    .post("/api/push/chat/status")
    .set("X-CSRF-Token", token)
    .send(sub)
    .expect(401);
});

test("chat delivery respects ownership, roles, separate mutes, sender exclusion and revoked sessions", async () => {
  const users = {};
  for (const [name, role] of [
    ["owner", "STUDENT"],
    ["other", "STUDENT"],
    ["admin", "ADMIN"],
    ["muted", "ADMIN"],
    ["expired", "ADMIN"],
  ]) {
    const u = (
      await db.query(
        "INSERT INTO users(email,password_hash,role) VALUES($1,'unused',$2) RETURNING id",
        [name + "@push.test", role],
      )
    ).rows[0];
    users[name] = u.id;
    await db.query(
      "INSERT INTO auth_tokens(user_id,token_hash,purpose,expires_at) VALUES($1,$2,'REFRESH',now()+interval '1 hour')",
      [u.id, "session-" + name],
    );
    await db.query(
      "INSERT INTO push_subscriptions(endpoint,p256dh,auth,user_id,session_hash,support_alerts,campus_alerts) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [
        "https://fcm.googleapis.com/" + name,
        sub.keys.p256dh,
        sub.keys.auth,
        u.id,
        "session-" + name,
        name !== "muted",
        name === "other",
      ],
    );
  }
  await db.query(
    "UPDATE auth_tokens SET revoked_at=now() WHERE token_hash='session-expired'",
  );
  const sent = [];
  const send = async (s, p) =>
    sent.push({ endpoint: s.endpoint, data: JSON.parse(p) });
  await notifyChat(
    db,
    { id: 123, kind: "SUPPORT", owner_id: users.owner },
    users.admin,
    send,
  );
  assert.deepEqual(
    sent.map((s) => s.endpoint),
    ["https://fcm.googleapis.com/owner"],
  );
  assert.equal(sent[0].data.url, "/?view=conversations&room=123");
  assert.equal(
    sent[0].data.body,
    "Open Campus Navigator to read your messages.",
  );
  sent.length = 0;
  await notifyChat(
    db,
    { id: 123, kind: "SUPPORT", owner_id: users.owner },
    users.owner,
    send,
  );
  assert.deepEqual(
    sent.map((s) => s.endpoint),
    ["https://fcm.googleapis.com/admin"],
  );
  sent.length = 0;
  await notifyChat(
    db,
    { id: 1, kind: "CAMPUS", owner_id: null },
    users.owner,
    send,
  );
  assert.deepEqual(
    sent.map((s) => s.endpoint),
    ["https://fcm.googleapis.com/other"],
  );
  await db.query("UPDATE users SET active=false WHERE id=$1", [users.other]);
  sent.length = 0;
  await notifyChat(
    db,
    { id: 1, kind: "CAMPUS", owner_id: null },
    users.owner,
    send,
  );
  assert.equal(sent.length, 0);
});
