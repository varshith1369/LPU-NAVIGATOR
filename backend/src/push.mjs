import webpush from "web-push";
import { z } from "zod";

export function allowedPushEndpoint(value) {
  try {
    const u = new URL(value);
    return (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      !u.port &&
      (u.hostname === "fcm.googleapis.com" ||
        u.hostname === "updates.push.services.mozilla.com" ||
        u.hostname.endsWith(".notify.windows.com") ||
        u.hostname.endsWith(".push.apple.com"))
    );
  } catch {
    return false;
  }
}
const subscription = z.object({
  endpoint: z
    .string()
    .max(2048)
    .refine(allowedPushEndpoint, "Unsupported push provider"),
  keys: z.object({
    p256dh: z.string().regex(/^[A-Za-z0-9_-]{87}=?$/),
    auth: z.string().regex(/^[A-Za-z0-9_-]{22}={0,2}$/),
  }),
});
export function pushConfig() {
  return process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY
    ? {
        subject:
          process.env.APP_ORIGIN ||
          "https://lpu-campus-navigator-lpu.vercel.app",
        publicKey: process.env.VAPID_PUBLIC_KEY,
        privateKey: process.env.VAPID_PRIVATE_KEY,
      }
    : null;
}
export function registerPush(app, db) {
  app.get("/api/push/config", (req, res) =>
    res.json({ publicKey: pushConfig()?.publicKey ?? null }),
  );
  app.post("/api/push/subscriptions", async (req, res) => {
    if (!pushConfig())
      return res
        .status(503)
        .json({ error: "Push notifications are not configured yet." });
    const s = subscription.parse(req.body);
    const result = await db.query(
      `INSERT INTO push_subscriptions(endpoint,p256dh,auth) VALUES($1,$2,$3)
       ON CONFLICT(endpoint) DO UPDATE SET p256dh=EXCLUDED.p256dh WHERE push_subscriptions.auth=EXCLUDED.auth RETURNING endpoint`,
      [s.endpoint, s.keys.p256dh, s.keys.auth],
    );
    if (!result.rows.length)
      return res
        .status(409)
        .json({
          error:
            "Remove this browser subscription and enable notifications again.",
        });
    res.status(201).json({ enabled: true });
  });
  app.delete("/api/push/subscriptions", async (req, res) => {
    const s = subscription.parse(req.body);
    await db.query(
      "DELETE FROM push_subscriptions WHERE endpoint=$1 AND auth=$2",
      [s.endpoint, s.keys.auth],
    );
    res.json({ enabled: false });
  });
}

// Only new announcements that are already active are broadcast. Scheduled
// announcements remain in the live feed; this function never invents a timer.
export async function notifyAnnouncement(
  db,
  announcement,
  send = webpush.sendNotification.bind(webpush),
) {
  const vapidDetails = pushConfig();
  if (
    !vapidDetails ||
    new Date(announcement.start_date).getTime() > Date.now() ||
    (announcement.end_date &&
      new Date(announcement.end_date).getTime() <= Date.now())
  )
    return;
  const payload = JSON.stringify({
    title: announcement.title.slice(0, 100),
    body: announcement.description.slice(0, 300),
    tag: `announcement-${announcement.id}`,
    url: "/?view=announcements",
  });
  // Bounded batches and request timeouts keep the serverless job within its budget.
  let cursor = "";
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    const { rows } = await db.query(
      "SELECT endpoint,p256dh,auth FROM push_subscriptions WHERE endpoint>$1 ORDER BY endpoint LIMIT 25",
      [cursor],
    );
    if (!rows.length) break;
    await Promise.all(
      rows.map(async (s) => {
        if (!allowedPushEndpoint(s.endpoint)) return;
        try {
          await send(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload,
            { vapidDetails, TTL: 3600, timeout: 4000 },
          );
        } catch (error) {
          if ([404, 410].includes(error.statusCode))
            await db.query(
              "DELETE FROM push_subscriptions WHERE endpoint=$1 AND auth=$2",
              [s.endpoint, s.auth],
            );
          else
            console.error(
              "Push delivery failed:",
              error.statusCode ?? error.name,
            );
        }
      }),
    );
    cursor = rows.at(-1).endpoint;
  }
}
