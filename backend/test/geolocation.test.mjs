import { test } from "node:test";
import assert from "node:assert/strict";
import {
  readFix,
  freshFix,
  watchLocation,
  distanceMeters,
  mapLabel,
} from "../../frontend/src/services/location.ts";

test("continuous watch updates movement and cleanup ignores late device callbacks", () => {
  let success, failure, options, cleared;
  const geo = {
    watchPosition(s, e, o) {
      success = s;
      failure = e;
      options = o;
      return 7;
    },
    clearWatch(id) {
      cleared = id;
    },
  };
  const fixes = [],
    errors = [];
  const stop = watchLocation(
    geo,
    (fix) => fixes.push(fix),
    (...error) => errors.push(error),
  );
  success({
    coords: { latitude: 31.2533, longitude: 75.7041, accuracy: 8 },
    timestamp: 1000,
  });
  success({
    coords: { latitude: 31.2534, longitude: 75.7042, accuracy: 9 },
    timestamp: 2000,
  });
  assert.equal(fixes.length, 2);
  assert.equal(fixes[1].latitude, 31.2534);
  failure({ code: 1 });
  assert.match(errors[0][0], /permission was denied/);
  assert.equal(errors[0][1], true);
  failure({ code: 3 });
  assert.equal(errors[1][1], false);
  assert.equal(options.enableHighAccuracy, true);
  assert.equal(options.maximumAge, 0);
  stop();
  assert.equal(cleared, 7);
  success({
    coords: { latitude: 31.3, longitude: 75.7, accuracy: 8 },
    timestamp: 3000,
  });
  failure({ code: 2 });
  assert.equal(fixes.length, 2);
  assert.equal(errors.length, 2);
});
test("stale or invalid coordinates cannot be presented as a current GPS fix", () => {
  const fix = {
    latitude: 31.2533,
    longitude: 75.7041,
    accuracy: 8,
    timestamp: 10000,
  };
  assert.equal(freshFix(fix, 15000), true);
  assert.equal(freshFix(fix, 45000), false);
  assert.equal(freshFix(fix, 0), false);
  assert.equal(freshFix(null), false);
  assert.throws(
    () => readFix({ coords: { ...fix, latitude: NaN }, timestamp: 10000 }),
    /invalid location/,
  );
  assert.throws(
    () => readFix({ coords: { ...fix, accuracy: -1 }, timestamp: 10000 }),
    /invalid location/,
  );
});
test("distance decreases toward a destination and handles identical coordinates", () => {
  const target = [31.2533, 75.7041];
  assert.equal(distanceMeters(target, target), 0);
  assert.ok(
    distanceMeters([31.2534, 75.7042], target) <
      distanceMeters([31.2543, 75.7051], target),
  );
  assert.ok(Math.abs(distanceMeters([0, 0], [0, 1]) - 111195) < 1);
});
test("pin numbers are stable across API ordering and separate historical and building numbers", () => {
  const places = [
    { name: "Library", source_id: "osm-2" },
    { name: "Block 18, LPU", source_id: "osm-3" },
    { name: "Food", source_id: "osm-1" },
  ];
  assert.equal(mapLabel(places[1], places), "B18");
  assert.equal(mapLabel({ old_map_id: 18 }, places), "18");
  assert.equal(mapLabel(places[0], places), "M2");
  assert.equal(mapLabel(places[0], [...places].reverse()), "M2");
});
