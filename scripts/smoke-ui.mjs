import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const html = readFileSync("dist/index.html", "utf8");
const asset = html.match(/src="([^"]+\.js)"/)[1];
const js = readFileSync("dist" + asset, "utf8");
const places = {
  items: JSON.parse(readFileSync("frontend/src/data/campus.json", "utf8"))
    .mapped,
};
const errors = [];
const console = new VirtualConsole();
console.on("jsdomError", (e) => errors.push(e.message));
console.on("error", (e) => errors.push(String(e)));
const dom = new JSDOM(html, {
  url: "https://lpu-campus-navigator-lpu.vercel.app/",
  runScripts: "outside-only",
  pretendToBeVisual: true,
  virtualConsole: console,
});
const w = dom.window;
w.ResizeObserver = class {
  observe() {}
  disconnect() {}
};
w.SVGSVGElement.prototype.createSVGRect = () => ({});
w.fetch = async (path) => {
  if (path.endsWith("/locations")) return Response.json(places);
  if (path.endsWith("/profile"))
    return Response.json({ error: "Please sign in" }, { status: 401 });
  return Response.json({ available: false });
};
w.eval(js);
await new Promise((resolve) => setTimeout(resolve, 1500));
const text = w.document.body.textContent;
assert.ok(!text.includes("Numbered plan"));
assert.ok(
  w.document.querySelector('img.leaflet-tile[src*="tile.openstreetmap.org"]'),
);
assert.ok(
  [...w.document.querySelectorAll(".map-number")].some(
    (n) => n.textContent === "18",
  ),
);
const expectedBlocks = places.items
  .filter((p) => p.building_code)
  .map((p) => p.building_code);
assert.equal(expectedBlocks.length, 55);
for (const block of expectedBlocks) {
  assert.equal(
    [...w.document.querySelectorAll(".map-number")].filter(
      (n) => n.textContent === block,
    ).length,
    1,
    `One live marker for block ${block}`,
  );
}
assert.equal(w.document.querySelectorAll(".place-row").length, 56);
assert.ok(text.includes("55 labels"));
assert.ok(text.includes("Campus plan · approximate"));
const historicalTab = [...w.document.querySelectorAll("button")].find((b) =>
  b.textContent.includes("Historical entries"),
);
historicalTab.click();
await new Promise((resolve) => setTimeout(resolve, 100));
assert.equal(w.document.querySelectorAll(".place-row").length, 55);
assert.equal(
  w.document.querySelector('img[src*="historical-campus-plan"]'),
  null,
);
w.document.querySelector(".place-row").click();
await new Promise((resolve) => setTimeout(resolve, 100));
assert.equal(
  w.document.querySelector('img[src*="historical-campus-plan"]'),
  null,
);
assert.ok(
  w.document.querySelector('img.leaflet-tile[src*="tile.openstreetmap.org"]'),
);
process.stdout.write(
  JSON.stringify({
    errors,
    content: text.slice(0, 250),
    places: w.document.querySelectorAll(".place-row").length,
  }) + "\n",
);
dom.window.close();
assert.deepEqual(errors, []);
assert.ok(text.includes("Campus directory"));
