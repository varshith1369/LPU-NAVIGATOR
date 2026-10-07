import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

// Handles quoted fields, escaped quotes, commas and newlines.
function parseCsv(text) {
  const rows = [];
  let row = [],
    value = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        value += '"';
        i++;
      } else quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(value);
      value = "";
    } else if (char === "\n" && !quoted) {
      row.push(value.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      value = "";
    } else value += char;
  }
  assert.equal(quoted, false, "Unclosed CSV quote");
  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }
  const [header, ...data] = rows;
  return data.map((fields) => {
    assert.equal(fields.length, header.length);
    return Object.fromEntries(header.map((key, i) => [key, fields[i]]));
  });
}
const read = (file) =>
  parseCsv(readFileSync(new URL(`../data/${file}`, import.meta.url), "utf8"));
const rows = read("lpu_locations.csv");
const categories = new Set(read("lpu_categories.csv").map((row) => row.name));
const sources = JSON.parse(
  readFileSync(new URL("../data/sources.json", import.meta.url), "utf8"),
);
assert.equal(rows.length, 51);
assert.equal(
  new Set(rows.map((row) => `${row.source_id}:${row.old_map_id}`)).size,
  51,
);
const expected = Array.from({ length: 55 }, (_, i) => i + 1).filter(
  (id) => ![44, 48, 49, 50].includes(id),
);
assert.deepEqual(
  rows.map((row) => Number(row.old_map_id)),
  expected,
);
for (const row of rows) {
  assert.ok(row.old_map_name.trim());
  assert.ok(categories.has(row.proposed_category));
  assert.ok(sources.some((source) => source.id === row.source_id));
  assert.equal(row.source, "OLD_LPU_MAP");
  assert.equal(row.verification_status, "APPROXIMATE");
  for (const key of [
    "current_name",
    "current_status",
    "latitude",
    "longitude",
    "verification_date",
    "image_x_px",
    "image_y_px",
  ]) {
    assert.equal(
      row[key],
      "",
      `${row.old_map_id}: ${key} must stay unknown in the historical baseline`,
    );
  }
  assert.ok(["LOW", "MEDIUM"].includes(row.transcription_confidence));
}
assert.equal(
  rows.find((row) => row.old_map_id === "45").old_map_name,
  "Boys Hostel 2",
);
assert.equal(
  rows.filter((row) => row.old_map_name === "Engineering").length,
  11,
);
assert.equal(read("lpu_paths.csv").length, 0, "No invented walkways");
assert.equal(
  read("lpu_facilities.csv").length,
  0,
  "No unsupported building-to-facility associations",
);
console.log(
  "PASS: 51 unique historical records; missing IDs preserved; categories and sources valid; current facts and coordinates empty; no invented paths/facilities.",
);
