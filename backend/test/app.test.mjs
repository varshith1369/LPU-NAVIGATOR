import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { connectDatabase, migrate, seedHistorical } from "../src/db.mjs";
import { createApp } from "../src/app.mjs";
import { seedPublicMap } from "../src/public-map.mjs";
import { hash } from "../src/security.mjs";
let db, app, student, admin, csrfStudent, csrfAdmin, locationId;
async function session() {
  const agent = request.agent(app);
  const { body } = await agent.get("/api/csrf");
  return [agent, body.token];
}
before(
  async () => {
    db = await connectDatabase({ memory: true });
    await migrate(db);
    await seedHistorical(db);
    app = createApp(db, { limit: false });
    [student, csrfStudent] = await session();
    [admin, csrfAdmin] = await session();
  },
  { timeout: 60000 },
);
after(async () => {
  await db?.close();
});
test("historical baseline is idempotent and never becomes current data", async () => {
  await seedHistorical(db);
  const h = await request(app).get("/api/locations?historical=true");
  assert.equal(h.body.items.length, 51);
  assert.ok(
    h.body.items.every((p) => p.latitude === null && p.longitude === null),
  );
  assert.equal((await request(app).get("/api/locations")).body.items.length, 0);
});
test("search handles old map IDs and repeated names without merging", async () => {
  let r = await request(app).get(
    "/api/locations/search?historical=true&q=Block%2034",
  );
  assert.equal(r.body.items[0].old_map_id, 34);
  r = await request(app).get(
    "/api/locations/search?historical=true&q=Engineering",
  );
  assert.ok(r.body.items.filter((i) => i.name === "Engineering").length === 11);
  r = await request(app).get(
    "/api/locations/search?historical=true&category=Healthcare",
  );
  assert.equal(r.body.items.length, 1);
});
test("registration cannot grant admin; CSRF is mandatory", async () => {
  await student
    .post("/api/auth/register")
    .send({ email: "student@example.test", password: "a-valid-password-123" })
    .expect(403);
  const r = await student
    .post("/api/auth/register")
    .set("X-CSRF-Token", csrfStudent)
    .send({
      email: "student@example.test",
      password: "a-valid-password-123",
      role: "ADMIN",
    })
    .expect(201);
  assert.equal(r.body.user.role, "STUDENT");
  await admin
    .post("/api/auth/register")
    .set("X-CSRF-Token", csrfAdmin)
    .send({ email: "admin@example.test", password: "a-valid-password-456" })
    .expect(201);
  await db.query(
    "UPDATE users SET role='ADMIN' WHERE email='admin@example.test'",
  );
});
test("visitor and student cannot mutate admin data", async () => {
  await request(app).get("/api/admin/dashboard").expect(401);
  await student.get("/api/admin/dashboard").expect(403);
  await student
    .post("/api/admin/categories")
    .set("X-CSRF-Token", csrfStudent)
    .send({ name: "Unauthorized" })
    .expect(403);
});
test("cross-site mutations fail even with session and CSRF token", async () => {
  await student
    .post("/api/submissions")
    .set("Origin", "https://untrusted.example")
    .set("X-CSRF-Token", csrfStudent)
    .send({ description: "A correction attempt" })
    .expect(403);
});
test("admin source and location creation is audited; old source refused", async () => {
  await admin
    .post("/api/admin/sources")
    .set("X-CSRF-Token", csrfAdmin)
    .send({
      id: "test-only",
      type: "PUBLIC_MAP",
      title: "SYNTHETIC TEST FIXTURE ONLY",
    })
    .expect(201);
  const category = (
    await db.query("SELECT id FROM categories WHERE name='Academic'")
  ).rows[0].id;
  await admin
    .post("/api/admin/locations")
    .set("X-CSRF-Token", csrfAdmin)
    .send({
      name: "Test location",
      category_id: category,
      source_id: "historical-map-001",
    })
    .expect(400);
  const r = await admin
    .post("/api/admin/locations")
    .set("X-CSRF-Token", csrfAdmin)
    .send({
      name: "Test library",
      category_id: category,
      source_id: "test-only",
      latitude: 0,
      longitude: 0,
      status: "ACTIVE",
    })
    .expect(201);
  locationId = r.body.id;
  assert.ok(
    (await db.query("SELECT id FROM audit_logs WHERE action='CREATE'")).rows
      .length >= 2,
  );
});
test("coordinate pairs and invalid latitude are rejected by API and SQL", async () => {
  const cat = (await db.query("SELECT id FROM categories LIMIT 1")).rows[0].id;
  await admin
    .post("/api/admin/locations")
    .set("X-CSRF-Token", csrfAdmin)
    .send({
      name: "Invalid",
      category_id: cat,
      source_id: "test-only",
      latitude: 95,
      longitude: 0,
    })
    .expect(400);
  await assert.rejects(
    db.query("UPDATE locations SET latitude=10,longitude=NULL WHERE id=$1", [
      locationId,
    ]),
  );
  await assert.rejects(
    db.query("UPDATE locations SET latitude='NaN'::float8 WHERE id=$1", [
      locationId,
    ]),
  );
});
test("unverified geography is excluded from nearby; verified uses PostGIS distance", async () => {
  let r = await request(app).get(
    "/api/locations/nearby?latitude=0&longitude=0",
  );
  assert.equal(r.body.items.length, 0);
  await admin
    .post("/api/admin/verification")
    .set("X-CSRF-Token", csrfAdmin)
    .send({
      location_id: locationId,
      source_id: "test-only",
      verification_status: "VERIFIED_PUBLIC",
      field: "position",
      claim:
        "Synthetic fixture position is reviewed in isolated test database.",
    })
    .expect(200);
  r = await request(app).get("/api/locations/nearby?latitude=0&longitude=0");
  assert.equal(r.body.items.length, 1);
  assert.equal(r.body.items[0].distance_m, 0);
  await request(app)
    .get("/api/locations/nearby?latitude=100&longitude=0")
    .expect(400);
});
test("SQL-like search text does not execute SQL", async () => {
  await request(app)
    .get("/api/locations/search")
    .query({ q: "'; DROP TABLE locations; --" })
    .expect(200);
  assert.equal(
    (await db.query("SELECT count(*)::int AS n FROM locations")).rows[0].n,
    1,
  );
});
test("favorites are user-scoped and idempotent", async () => {
  await student
    .post("/api/favorites")
    .set("X-CSRF-Token", csrfStudent)
    .send({ location_id: locationId })
    .expect(201);
  await student
    .post("/api/favorites")
    .set("X-CSRF-Token", csrfStudent)
    .send({ location_id: locationId })
    .expect(201);
  assert.equal((await student.get("/api/favorites")).body.length, 1);
  assert.equal((await admin.get("/api/favorites")).body.length, 0);
});
test("reports enter moderation without changing published data", async () => {
  const r = await student
    .post("/api/reports")
    .set("X-CSRF-Token", csrfStudent)
    .send({
      location_id: locationId,
      report_type: "WRONG_NAME",
      description: "This test suggests a different name.",
    })
    .expect(201);
  assert.equal(r.body.status, "PENDING");
  assert.equal(
    (await request(app).get(`/api/locations/${locationId}`)).body.name,
    "Test library",
  );
  await admin
    .patch(`/api/admin/reports/${r.body.id}`)
    .set("X-CSRF-Token", csrfAdmin)
    .send({ status: "APPROVED", admin_comment: "Checked the evidence." })
    .expect(400);
  await admin
    .patch(`/api/admin/reports/${r.body.id}`)
    .set("X-CSRF-Token", csrfAdmin)
    .send({
      status: "REJECTED",
      admin_comment: "Synthetic suggestion rejected.",
    })
    .expect(200);
});
test("suggestions remain pending and cannot self-publish", async () => {
  const r = await student
    .post("/api/submissions")
    .set("X-CSRF-Token", csrfStudent)
    .send({ description: "Historical name needs checking", status: "APPROVED" })
    .expect(201);
  assert.equal(r.body.status, "PENDING");
});
test("GPS suggestions require consent and a recent accurate campus fix, and never publish", async () => {
  const before = (await request(app).get("/api/locations")).body.items;
  const valid = {
    description: "Synthetic entrance location for moderation test",
    historical_id: "history-55",
    suggested_latitude: 31.2533,
    suggested_longitude: 75.7041,
    accuracy_m: 12,
    captured_at: new Date().toISOString(),
    location_consent: true,
  };
  for (const override of [
    { location_consent: false },
    { accuracy_m: 101 },
    { accuracy_m: undefined },
    { captured_at: new Date(Date.now() - 360000).toISOString() },
    { captured_at: new Date(Date.now() + 60000).toISOString() },
    { suggested_longitude: undefined },
    { suggested_latitude: 28.61 },
  ]) {
    await student
      .post("/api/submissions")
      .set("X-CSRF-Token", csrfStudent)
      .send({ ...valid, ...override })
      .expect(400);
  }
  const result = await student
    .post("/api/submissions")
    .set("X-CSRF-Token", csrfStudent)
    .send(valid)
    .expect(201);
  assert.equal(result.body.status, "PENDING");
  const stored = (
    await db.query("SELECT payload FROM submissions WHERE id=$1", [
      result.body.id,
    ])
  ).rows[0].payload;
  assert.equal(stored.location_consent, true);
  assert.equal(stored.accuracy_m, 12);
  assert.deepEqual(
    (await request(app).get("/api/locations")).body.items,
    before,
  );
});
test("routing does not manufacture an edge for disconnected locations", async () => {
  const r = await student
    .post("/api/routes")
    .set("X-CSRF-Token", csrfStudent)
    .send({ from: locationId, to: 999, accessible: false })
    .expect(422);
  assert.match(r.body.error, /No sourced connected route/);
});
test("assistant refuses unknown campus facts and identifies historical provenance", async () => {
  let r = await student
    .post("/api/assistant")
    .set("X-CSRF-Token", csrfStudent)
    .send({ question: "Where is the imaginary observatory?" });
  assert.match(r.body.answer, /don't have verified/);
  r = await student
    .post("/api/assistant")
    .set("X-CSRF-Token", csrfStudent)
    .send({ question: "What is on the historical map?" });
  assert.match(r.body.answer, /51 visible/);
  assert.equal(r.body.sources[0].verification_status, "APPROXIMATE");
});
test("optimistic edit rejects stale version", async () => {
  const current = (await request(app).get(`/api/locations/${locationId}`)).body;
  await admin
    .put(`/api/admin/locations/${locationId}`)
    .set("X-CSRF-Token", csrfAdmin)
    .send({
      ...current,
      version: 999,
      source_id: "test-only",
      category_id: current.category_id,
    })
    .expect(409);
});
test("logout revokes server session, not just browser cookie", async () => {
  const profile = await student.get("/api/profile").expect(200);
  assert.equal(profile.body.role, "STUDENT");
  await student
    .post("/api/auth/logout")
    .set("X-CSRF-Token", csrfStudent)
    .send({})
    .expect(200);
  await student.get("/api/profile").expect(401);
  const active = (
    await db.query(
      "SELECT count(*)::int AS n FROM auth_tokens t JOIN users u ON u.id=t.user_id WHERE u.email='student@example.test' AND revoked_at IS NULL",
    )
  ).rows[0].n;
  assert.equal(active, 0);
});
test("ML stays unavailable without real data", async () => {
  const r = await request(app).get("/api/ml/status");
  assert.equal(r.body.enabled, false);
});
test("database enforces edge geometry and returns a real connected test route", async () => {
  const a = (
    await db.query(
      "INSERT INTO path_nodes(point,source_id,verification_status) VALUES(ST_SetSRID(ST_MakePoint(0,0),4326),'test-only','VERIFIED_PUBLIC') RETURNING id",
    )
  ).rows[0].id;
  const b = (
    await db.query(
      "INSERT INTO path_nodes(point,source_id,verification_status) VALUES(ST_SetSRID(ST_MakePoint(0.001,0),4326),'test-only','VERIFIED_PUBLIC') RETURNING id",
    )
  ).rows[0].id;
  await assert.rejects(
    db.query(
      "INSERT INTO path_edges(from_node_id,to_node_id,path,source_id,verification_status) VALUES($1,$2,ST_GeogFromText('LINESTRING(1 1,2 2)'),'test-only','VERIFIED_PUBLIC')",
      [a, b],
    ),
  );
  await db.query(
    "INSERT INTO path_edges(from_node_id,to_node_id,path,source_id,verification_status) VALUES($1,$2,ST_GeogFromText('LINESTRING(0 0,0.001 0)'),'test-only','VERIFIED_PUBLIC')",
    [a, b],
  );
  const target = (
    await db.query(
      "INSERT INTO locations(name,category_id,source_id,latitude,longitude,position_source_id,position_verification,status) SELECT 'Synthetic target',category_id,'test-only',0,0.001,'test-only','APPROXIMATE','ACTIVE' FROM locations WHERE id=$1 RETURNING id",
      [locationId],
    )
  ).rows[0].id;
  await db.query(
    "INSERT INTO location_entrances(location_id,node_id,source_id) VALUES($1,$2,'test-only'),($3,$4,'test-only')",
    [locationId, a, target, b],
  );
  const response = await admin
    .post("/api/routes")
    .set("X-CSRF-Token", csrfAdmin)
    .send({ from: locationId, to: target })
    .expect(200);
  assert.ok(response.body.distance_m > 110 && response.body.distance_m < 112);
  assert.deepEqual(response.body.coordinates, [
    [0, 0],
    [0, 0.001],
  ]);
  await admin
    .post("/api/routes")
    .set("X-CSRF-Token", csrfAdmin)
    .send({ from: locationId, to: target, accessible: true })
    .expect(422);
  await assert.rejects(
    db.query(
      "UPDATE path_nodes SET point=ST_SetSRID(ST_MakePoint(2,2),4326) WHERE id=$1",
      [a],
    ),
  );
});
test("public OSM import is idempotent and does not invent entrances", async () => {
  await seedPublicMap(db);
  await seedPublicMap(db);
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int AS n FROM locations WHERE source_id LIKE 'osm-%'",
      )
    ).rows[0].n,
    8,
  );
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int AS n FROM path_edges WHERE source_id LIKE 'osm-%'",
      )
    ).rows[0].n,
    261,
  );
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int AS n FROM location_entrances WHERE source_id LIKE 'osm-%'",
      )
    ).rows[0].n,
    0,
  );
  const named = (
    await request(app).get("/api/locations/search?q=Central%20Library")
  ).body.items;
  assert.ok(
    named.some(
      (p) =>
        p.name === "Central Library" && p.latitude !== null && p.source_url,
    ),
  );
});
test("admin can close a path with evidence and an audit event", async () => {
  const edge = (
    await db.query(
      "SELECT id FROM path_edges WHERE source_id='test-only' LIMIT 1",
    )
  ).rows[0];
  await admin
    .patch(`/api/admin/path-edges/${edge.id}`)
    .set("X-CSRF-Token", csrfAdmin)
    .send({ blocked: true, source_id: "test-only" })
    .expect(200);
  assert.equal(
    (await db.query("SELECT blocked FROM path_edges WHERE id=$1", [edge.id]))
      .rows[0].blocked,
    true,
  );
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int AS n FROM audit_logs WHERE action='PATH_CONDITION'",
      )
    ).rows[0].n,
    1,
  );
  await admin
    .patch(`/api/admin/path-edges/${edge.id}`)
    .set("X-CSRF-Token", csrfAdmin)
    .send({ blocked: false, source_id: "historical-map-001" })
    .expect(400);
});
test("password reset is single-use and revokes existing sessions", async () => {
  const [account, csrf] = await session();
  await account
    .post("/api/auth/login")
    .set("X-CSRF-Token", csrf)
    .send({ email: "student@example.test", password: "a-valid-password-123" })
    .expect(200);
  const user = (
    await db.query("SELECT id FROM users WHERE email='student@example.test'")
  ).rows[0];
  const token = "synthetic-test-token-never-used-outside-tests";
  await db.query(
    "INSERT INTO auth_tokens(user_id,token_hash,purpose,expires_at) VALUES($1,$2,'PASSWORD_RESET',now()+interval '10 minutes')",
    [user.id, hash(token)],
  );
  await account
    .post("/api/auth/reset-password")
    .set("X-CSRF-Token", csrf)
    .send({ token, password: "changed-test-password-789" })
    .expect(200);
  await account.get("/api/profile").expect(401);
  await account
    .post("/api/auth/reset-password")
    .set("X-CSRF-Token", csrf)
    .send({ token, password: "changed-again-password-123" })
    .expect(400);
  await account
    .post("/api/auth/login")
    .set("X-CSRF-Token", csrf)
    .send({ email: "student@example.test", password: "a-valid-password-123" })
    .expect(401);
  await account
    .post("/api/auth/login")
    .set("X-CSRF-Token", csrf)
    .send({
      email: "student@example.test",
      password: "changed-test-password-789",
    })
    .expect(200);
});
