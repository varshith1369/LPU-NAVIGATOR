import { test } from "node:test";
import assert from "node:assert/strict";
import { canonicalDestination } from "../../frontend/src/services/canonical.ts";

test("deployment aliases use the API-authorized origin while preserving links", () => {
  assert.equal(
    canonicalDestination("https://lpu-campus-navigator-beryl.vercel.app/"),
    "https://lpu-campus-navigator-lpu.vercel.app/",
  );
  assert.equal(
    canonicalDestination(
      "https://lpu-campus-navigator-example-varshith1369s-projects.vercel.app/?reset=abc#map",
    ),
    "https://lpu-campus-navigator-lpu.vercel.app/?reset=abc#map",
  );
  assert.equal(
    canonicalDestination("https://lpu-campus-api.onrender.com/"),
    "https://lpu-campus-navigator-lpu.vercel.app/",
  );
  assert.equal(
    canonicalDestination("https://lpu-campus-navigator-lpu.vercel.app/"),
    null,
  );
  assert.equal(canonicalDestination("http://127.0.0.1:5173/"), null);
  assert.equal(canonicalDestination("http://localhost:5173/"), null);
});
