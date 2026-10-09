import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";

// Rebuilds reviewable approximate coordinates from transcribed official-plan
// pixels. No point is snapped to an OSM building or promoted to a surveyed fix.
const read = (name) =>
  JSON.parse(readFileSync(new URL(`../data/${name}`, import.meta.url), "utf8"));
const input = read("plan-georeference-input.json");
const osm = read("osm-campus-area.json");
const campus = read("public-map.json");
const EARTH_RADIUS_M = 6371008.8;
const radians = (n) => (n * Math.PI) / 180;
const distance = (a, b) => {
  const dlat = radians(b[1] - a[1]),
    dlon = radians(b[0] - a[0]);
  const h =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(radians(a[1])) * Math.cos(radians(b[1])) * Math.sin(dlon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
};
const round = (value, digits = 3) => Number(value.toFixed(digits));
function solve(matrix, vector) {
  const rows = matrix.map((row, i) => [...row, vector[i]]);
  for (let k = 0; k < rows.length; k++) {
    let pivot = k;
    for (let i = k + 1; i < rows.length; i++)
      if (Math.abs(rows[i][k]) > Math.abs(rows[pivot][k])) pivot = i;
    [rows[k], rows[pivot]] = [rows[pivot], rows[k]];
    assert.ok(
      Math.abs(rows[k][k]) > 1e-12,
      "Control pixels must span two dimensions",
    );
    const div = rows[k][k];
    rows[k] = rows[k].map((n) => n / div);
    for (let i = 0; i < rows.length; i++)
      if (i !== k) {
        const factor = rows[i][k];
        rows[i] = rows[i].map((n, j) => n - factor * rows[k][j]);
      }
  }
  return rows.map((row) => row.at(-1));
}
function fit(controls) {
  // Center and scale pixels before solving to avoid large normal-equation terms.
  const center = [350, 650],
    scale = 500;
  const x = controls.map((p) => [
    (p.pixel.x - center[0]) / scale,
    (p.pixel.y - center[1]) / scale,
    1,
  ]);
  const matrix = Array.from({ length: 3 }, (_, i) =>
    Array.from({ length: 3 }, (_, j) =>
      x.reduce((s, row) => s + row[i] * row[j], 0),
    ),
  );
  const coefficients = (key) => {
    const b = solve(
      matrix,
      Array.from({ length: 3 }, (_, i) =>
        controls.reduce((s, p, j) => s + x[j][i] * p[key], 0),
      ),
    );
    return [
      b[0] / scale,
      b[1] / scale,
      b[2] - (b[0] * center[0]) / scale - (b[1] * center[1]) / scale,
    ];
  };
  return {
    latitude: coefficients("latitude"),
    longitude: coefficients("longitude"),
  };
}
function predict(model, p) {
  const calculate = (c) => c[0] * p.x + c[1] * p.y + c[2];
  return [calculate(model.longitude), calculate(model.latitude)];
}
function insideRing(point, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i],
      b = ring[j];
    if (
      a[1] > point[1] !== b[1] > point[1] &&
      point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
  }
  return inside;
}
function insidePolygon(point, rings) {
  return (
    insideRing(point, rings[0]) &&
    !rings.slice(1).some((ring) => insideRing(point, ring))
  );
}
function segmentDistance(point, a, b) {
  const metersX =
    (Math.cos(radians(point[1])) * EARTH_RADIUS_M * Math.PI) / 180;
  const metersY = (EARTH_RADIUS_M * Math.PI) / 180;
  const local = (p) => [
    (p[0] - point[0]) * metersX,
    (p[1] - point[1]) * metersY,
  ];
  const [ax, ay] = local(a),
    [bx, by] = local(b);
  const dx = bx - ax,
    dy = by - ay;
  const t = Math.max(
    0,
    Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)),
  );
  return Math.hypot(ax + t * dx, ay + t * dy);
}
const nodes = new Map(
  osm.elements
    .filter((e) => e.type === "node")
    .map((n) => [n.id, [n.lon, n.lat]]),
);
const buildings = osm.elements
  .filter(
    (e) =>
      e.type === "way" &&
      e.tags?.building &&
      e.tags.building !== "no" &&
      e.nodes?.length >= 4 &&
      e.nodes[0] === e.nodes.at(-1) &&
      e.nodes.every((n) => nodes.has(n)),
  )
  .map((way) => ({
    source_id: `osm-way-${way.id}`,
    url: `https://www.openstreetmap.org/way/${way.id}`,
    name: way.tags.name ?? null,
    building: way.tags.building,
    ring: way.nodes.map((n) => nodes.get(n)),
  }))
  .filter((b) =>
    b.ring.some(
      ([lon, lat]) => lat > 31.24 && lat < 31.27 && lon > 75.69 && lon < 75.72,
    ),
  );
function review(point) {
  const candidates = buildings
    .map((b) => {
      const contains = insideRing(point, b.ring);
      return {
        source_id: b.source_id,
        url: b.url,
        name: b.name,
        building: b.building,
        contains_derived_point: contains,
        distance_to_footprint_m: round(
          contains
            ? 0
            : Math.min(
                ...b.ring
                  .slice(1)
                  .map((p, i) => segmentDistance(point, b.ring[i], p)),
              ),
        ),
      };
    })
    .sort(
      (a, b) =>
        a.distance_to_footprint_m - b.distance_to_footprint_m ||
        a.source_id.localeCompare(b.source_id),
    );
  return {
    within_osm_campus_boundary: insidePolygon(
      point,
      campus.boundary.coordinates,
    ),
    within_building_footprint: candidates[0]?.contains_derived_point ?? false,
    nearest_building_candidates: candidates.slice(0, 3),
    automatically_snapped: false,
  };
}
const training = input.controls.filter((p) => p.role === "fit");
const holdouts = input.controls.filter((p) => p.role === "holdout");
assert.ok(training.length >= 11);
assert.equal(
  new Set(input.labels.map((p) => p.code)).size,
  input.labels.length,
);
const model = fit(training);
const evaluate = (p, m = model) => {
  const predicted = predict(m, p.pixel);
  return {
    ...p,
    predicted_latitude: round(predicted[1], 8),
    predicted_longitude: round(predicted[0], 8),
    error_m: round(distance(predicted, [p.longitude, p.latitude])),
  };
};
const trainingResults = training.map((p) => evaluate(p));
const holdoutResults = holdouts.map((p) => evaluate(p));
const alternativeResults = input.controls
  .filter((p) => p.role === "alternative_reference")
  .map((p) => evaluate(p));
const leaveOneOut = training.map((p, i) => ({
  code: p.code,
  error_m: evaluate(p, fit(training.filter((_, j) => i !== j))).error_m,
}));
function statistics(rows) {
  const errors = rows.map((r) => r.error_m).sort((a, b) => a - b);
  return {
    count: errors.length,
    rmse_m: round(
      Math.sqrt(errors.reduce((s, n) => s + n * n, 0) / errors.length),
    ),
    median_m: round(
      errors.length % 2
        ? errors[(errors.length - 1) / 2]
        : (errors[errors.length / 2 - 1] + errors[errors.length / 2]) / 2,
    ),
    maximum_m: errors.at(-1),
  };
}
const positions = input.labels.map((label) => {
  assert.ok(
    label.x >= 0 &&
      label.x <= input.source.image_width &&
      label.y >= 0 &&
      label.y <= input.source.image_height,
  );
  const point = predict(model, label);
  return {
    source_code: label.code,
    source_name: label.source_name,
    pixel: { x: label.x, y: label.y },
    latitude: round(point[1], 8),
    longitude: round(point[0], 8),
    position_verification: "APPROXIMATE",
    method: "AFFINE_GEOREFERENCE_FROM_OFFICIAL_DIAGRAM",
    source_id: input.source.id,
    source_url: input.source.url,
    review: review(point),
  };
});
const result = {
  source: input.source,
  notes: [
    "Review dataset: these source diagram labels are not a claim of current building identities or GPS-surveyed entrances.",
    "All 53 coordinates are affine estimates, including those matching control labels. Use separately sourced direct coordinates when available.",
    "The official diagram is undated. Published numbers and occupants may have changed; source codes are retained without automatic renaming.",
    "Nearest OSM footprints are candidates for manual review only. No coordinates are automatically snapped.",
    "Fit and validation errors describe public-map point agreement, not guaranteed positioning accuracy at each building.",
    "OSM boundary and footprint coverage may be incomplete. Outside-boundary findings are flagged, not silently discarded.",
  ],
  inputs: {
    labels_and_controls_sha256: createHash("sha256")
      .update(
        readFileSync(
          new URL("../data/plan-georeference-input.json", import.meta.url),
        ),
      )
      .digest("hex"),
    osm_area_sha256: createHash("sha256")
      .update(
        readFileSync(new URL("../data/osm-campus-area.json", import.meta.url)),
      )
      .digest("hex"),
    osm_license: "ODbL-1.0",
    osm_attribution: "© OpenStreetMap contributors",
  },
  affine_model: {
    formula:
      "coordinate = coefficient_x * pixel_x + coefficient_y * pixel_y + intercept",
    coefficient_order: ["x", "y", "intercept"],
    ...model,
  },
  validation: {
    fitting: statistics(trainingResults),
    independent_holdouts: statistics(holdoutResults),
    leave_one_out: statistics(leaveOneOut),
    leave_one_out_results: leaveOneOut,
    within_campus_count: positions.filter(
      (p) => p.review.within_osm_campus_boundary,
    ).length,
    outside_campus_codes: positions
      .filter((p) => !p.review.within_osm_campus_boundary)
      .map((p) => p.source_code),
    within_building_count: positions.filter(
      (p) => p.review.within_building_footprint,
    ).length,
    candidate_building_count: buildings.length,
  },
  control_points: trainingResults,
  holdout_points: holdoutResults,
  alternative_reference_points: alternativeResults,
  positions,
  legend_only: input.legend_only,
};
writeFileSync(
  new URL("../data/plan-building-positions.json", import.meta.url),
  `${JSON.stringify(result, null, 2)}\n`,
);
console.log(
  JSON.stringify(
    { positions: positions.length, validation: result.validation },
    null,
    2,
  ),
);
