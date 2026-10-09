import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const html = readFileSync("dist/index.html", "utf8");
const js = readFileSync("dist" + html.match(/src="([^"]+\.js)"/)[1], "utf8");
const errors = [],
  writes = [],
  messages = [];
const dashboard = {
  stats: { locations: 1 },
  locations: [
    {
      id: 77,
      name: "Test building",
      category_id: 42,
      source_id: "test",
      version: 3,
      status: "ACTIVE",
      building_code: "57",
      latitude: 31.25,
      longitude: 75.7,
    },
  ],
  categories: [{ id: 42, name: "Academic" }],
  sources: [{ id: "test", title: "Test evidence", type: "PUBLIC_MAP" }],
  announcements: [],
  facilities: [],
  users: [],
  reports: [],
  submissions: [],
  audit: [],
};
const vc = new VirtualConsole();
vc.on("jsdomError", (e) => errors.push(e.message));
vc.on("error", (e) => errors.push(String(e)));
const dom = new JSDOM(html, {
  url: "https://lpu-campus-navigator-lpu.vercel.app/",
  runScripts: "outside-only",
  pretendToBeVisual: true,
  virtualConsole: vc,
});
const w = dom.window;
w.ResizeObserver = class {
  observe() {}
  disconnect() {}
};
w.SVGSVGElement.prototype.createSVGRect = () => ({});
w.confirm = () => true;
w.fetch = async (path, options = {}) => {
  if (path.endsWith("/csrf")) return Response.json({ token: "test-csrf" });
  if (options.method && options.method !== "GET") {
    const body = JSON.parse(options.body ?? "{}");
    writes.push({ path, body, method: options.method });
    if (path === "/api/admin/announcements")
      dashboard.announcements.push({ ...body, id: 1 });
    if (path.endsWith("/messages"))
      messages.push({
        id: 1,
        sender_id: 1,
        sender: "Campus admin",
        body: body.body,
        created_at: new Date().toISOString(),
      });
    return Response.json({ id: 1 });
  }
  if (path === "/api/profile")
    return Response.json({ id: 1, email: "admin@example.test", role: "ADMIN" });
  if (path === "/api/locations") return Response.json({ items: [] });
  if (path === "/api/admin/dashboard") return Response.json(dashboard);
  if (path === "/api/announcements")
    return Response.json(dashboard.announcements);
  if (path === "/api/conversations")
    return Response.json([
      { id: 2, kind: "SUPPORT", title: "Member support", closed: false },
      { id: 1, kind: "CAMPUS", title: "Campus", closed: false },
    ]);
  if (path.endsWith("/messages")) return Response.json(messages);
  return Response.json({ available: false });
};
const pause = () => new Promise((r) => setTimeout(r, 120));
const button = (text) =>
  [...w.document.querySelectorAll("button")].find(
    (b) =>
      b.textContent.trim() === text || b.getAttribute("aria-label") === text,
  );
const fill = async (el, value) => {
  const proto =
    el.tagName === "TEXTAREA"
      ? w.HTMLTextAreaElement.prototype
      : w.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
  el.dispatchEvent(new w.Event("input", { bubbles: true }));
  await pause();
};
try {
  w.eval(js);
  await pause();
  await pause();
  button("Admin").click();
  await pause();
  assert.ok(
    w.document.body.textContent.includes("Publish campus announcements"),
  );
  const form = w.document.querySelector(".admin-announcements form");
  await fill(form.querySelector("input"), "Campus event");
  await fill(form.querySelector("textarea"), "Meet at the library");
  form.dispatchEvent(
    new w.Event("submit", { bubbles: true, cancelable: true }),
  );
  await pause();
  assert.equal(writes.at(-1).body.title, "Campus event");
  assert.equal(writes.at(-1).path, "/api/admin/announcements");
  const record = [...w.document.querySelectorAll(".admin-record")].find((n) =>
    n.textContent.includes("Test building"),
  );
  record.querySelector("button").click();
  await pause();
  const locationForm = w.document.querySelector(".admin-columns form");
  assert.equal(locationForm.querySelector("select").value, "42");
  const block = [...locationForm.querySelectorAll("label")]
    .find((l) => l.textContent.includes("Building / block number"))
    .querySelector("input");
  await fill(block, "57A");
  locationForm.dispatchEvent(
    new w.Event("submit", { bubbles: true, cancelable: true }),
  );
  await pause();
  assert.equal(writes.at(-1).body.building_code, "57A");
  assert.equal(writes.at(-1).body.version, 3);
  button("Chat").click();
  await pause();
  await pause();
  await fill(
    w.document.querySelector(".chat-layout textarea"),
    "Hello support",
  );
  w.document
    .querySelector(".chat-layout form")
    .dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
  await pause();
  assert.equal(writes.at(-1).path, "/api/conversations/2/messages");
  assert.ok(
    w.document
      .querySelector('[role="log"]')
      .textContent.includes("Hello support"),
  );
  button("Campus group").click();
  await pause();
  assert.ok(
    w.document.body.textContent.includes("Visible to signed-in campus members"),
  );
  button("Updates").click();
  await pause();
  assert.ok(
    w.document
      .querySelector(".announcement")
      .textContent.includes("Campus event"),
  );
  assert.deepEqual(errors, []);
  console.log(
    "Admin building edits, announcement publishing, private support and campus chat UI passed.",
  );
} finally {
  w.close();
}
