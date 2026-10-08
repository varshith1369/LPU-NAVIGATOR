import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { api } from "../../frontend/src/services/api.ts";
import { mapLabel } from "../../frontend/src/services/location.ts";

test("live block labels preserve suffixes and stay separate from historical legend numbers", () => {
  const campus = JSON.parse(
    readFileSync(
      new URL("../../frontend/src/data/campus.json", import.meta.url),
    ),
  );
  const blocks = campus.mapped.filter((p) => p.building_code);
  assert.equal(blocks.length, 12);
  assert.equal(new Set(blocks.map((p) => p.building_code)).size, 12);
  for (const block of blocks) {
    assert.equal(mapLabel(block, campus.mapped), block.building_code);
    assert.equal(block.old_map_id, undefined);
  }
  assert.match(blocks.find((p) => p.building_code === "55").name, /Mechanical/);
  assert.equal(
    blocks.find((p) => p.building_code === "55A").building_code,
    "55A",
  );
  assert.equal(
    campus.directory.find((p) => p.old_map_id === 55).latitude,
    null,
  );
});

test("directory contains every number and never invents missing names or GPS positions", () => {
  const campus = JSON.parse(
    readFileSync(
      new URL("../../frontend/src/data/campus.json", import.meta.url),
    ),
  );
  assert.deepEqual(
    campus.directory.map((p) => p.old_map_id),
    Array.from({ length: 55 }, (_, i) => i + 1),
  );
  assert.deepEqual(
    campus.directory
      .filter((p) => p.category === "Unidentified")
      .map((p) => p.old_map_id),
    [44, 48, 49, 50],
  );
  assert.ok(
    campus.directory.every((p) => p.latitude === null && p.longitude === null),
  );
  assert.ok(
    campus.mapped.every(
      (p) =>
        p.latitude > 31.24 &&
        p.latitude < 31.27 &&
        p.longitude > 75.69 &&
        p.longitude < 75.72,
    ),
  );
  assert.equal(campus.boundary.type, "Polygon");
  const pinned = campus.directory.filter((p) => p.image_x_px != null);
  assert.equal(pinned.length, 0);
  assert.ok(
    pinned.every(
      (p) =>
        p.image_x_px > 0 &&
        p.image_x_px < 559 &&
        p.image_y_px > 0 &&
        p.image_y_px < 787,
    ),
  );
  assert.ok(
    campus.directory
      .filter((p) => [44, 48, 49, 50].includes(p.old_map_id))
      .every((p) => p.image_x_px == null),
  );
  assert.ok(campus.paths.length > 0);
});

test("HTML deployment errors cannot masquerade as successful API responses", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response("<html>Not found</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
  );
  await assert.rejects(api("/locations"), /campus service is unavailable/);
});

test("failed CSRF responses do not send a state-changing request", async (t) => {
  const fetch = t.mock.method(
    globalThis,
    "fetch",
    async () => new Response("Not found", { status: 404 }),
  );
  await assert.rejects(
    api("/auth/login", { method: "POST", body: "{}" }),
    /campus service is unavailable/,
  );
  assert.equal(fetch.mock.callCount(), 1);
});

test("valid API responses remain usable", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({ items: [{ id: "1" }] }),
  );
  assert.deepEqual(await api("/locations"), { items: [{ id: "1" }] });
});
