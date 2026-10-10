import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
test("install manifest has real mobile and desktop icons", () => {
  const manifest = JSON.parse(
    readFileSync("frontend/public/manifest.webmanifest", "utf8"),
  );
  assert.equal(manifest.display, "standalone");
  for (const icon of manifest.icons) {
    const data = readFileSync("frontend/public" + icon.src);
    assert.equal(data.toString("hex", 0, 8), "89504e470d0a1a0a");
    assert.equal(data.readUInt32BE(16), Number(icon.sizes.split("x")[0]));
  }
});
test("service worker displays push, opens Updates, and never caches API or private responses", async () => {
  const handlers = {},
    shown = [],
    opened = [];
  const self = {
    location: { origin: "https://campus.test" },
    skipWaiting() {},
    addEventListener: (name, fn) => (handlers[name] = fn),
    registration: { showNotification: async (...args) => shown.push(args) },
    clients: {
      matchAll: async () => [],
      openWindow: async (url) => opened.push(url),
    },
  };
  vm.runInNewContext(readFileSync("frontend/public/sw.js", "utf8"), {
    self,
    URL,
    Response,
  });
  let work;
  handlers.push({
    data: {
      json: () => ({
        title: "Notice",
        body: "Hello",
        tag: "announcement-1",
        url: "https://evil.test",
      }),
    },
    waitUntil: (p) => (work = p),
  });
  await work;
  assert.equal(shown[0][0], "Notice");
  let closed = false;
  handlers.notificationclick({
    notification: { close: () => (closed = true) },
    waitUntil: (p) => (work = p),
  });
  await work;
  assert.ok(closed);
  assert.equal(opened[0], "https://campus.test/?view=announcements");
  handlers.push({
    data: {
      json: () => ({
        title: "Private support",
        url: "/?view=conversations&room=123",
      }),
    },
    waitUntil: (p) => (work = p),
  });
  await work;
  assert.equal(shown[1][1].data.url, "/?view=conversations&room=123");
  handlers.notificationclick({
    notification: { data: shown[1][1].data, close() {} },
    waitUntil: (p) => (work = p),
  });
  await work;
  assert.equal(opened[1], "https://campus.test/?view=conversations&room=123");
  handlers.fetch({
    request: { mode: "cors", url: "https://campus.test/api/profile" },
    respondWith: () => assert.fail("Private API must not be cached"),
  });
});
