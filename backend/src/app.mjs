import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import { rateLimit } from "express-rate-limit";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { configuration, security, hash } from "./security.mjs";
import { campusRoute } from "./routing.mjs";
import { answerQuestion } from "./assistant.mjs";
import { registerAdmin } from "./admin.mjs";
import { registerConversations } from "./conversations.mjs";
import { PostgresRateStore } from "./rate-store.mjs";
import { publicMap } from "./public-map.mjs";
import { numberMetadata } from "./numbered-buildings.mjs";
import { registerPush } from "./push.mjs";

const id = z.coerce.number().int().positive();
const email = z
  .email()
  .max(254)
  .transform((s) => s.toLowerCase().trim());
const password = z
  .string()
  .min(12)
  .refine(
    (s) => Buffer.byteLength(s, "utf8") <= 72,
    "Password must not exceed 72 UTF-8 bytes.",
  );
const parse = (schema, value) => schema.parse(value);
const currentSelect = `SELECT l.*,c.name AS category,s.url AS source_url,s.title AS source_title,false AS historical FROM locations l JOIN categories c ON c.id=l.category_id JOIN sources s ON s.id=l.source_id`;
const safePlace = (p) => ({
  ...p,
  ...numberMetadata(p),
  id: String(p.id),
  latitude: p.latitude ?? null,
  longitude: p.longitude ?? null,
  location_point: undefined,
  verified_by: undefined,
});

export function createApp(db, { config = configuration(), limit = true } = {}) {
  const app = express();
  const { requireUser, admin, issue, csrf } = security(db, config);
  app.disable("x-powered-by");
  if (process.env.VERCEL || process.env.RENDER) app.set("trust proxy", 1);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: [
            "'self'",
            "'unsafe-inline'",
            "https://fonts.googleapis.com",
          ],
          fontSrc: ["'self'", "https://fonts.gstatic.com"],
          imgSrc: ["'self'", "data:", "https://*.tile.openstreetmap.org"],
          connectSrc: ["'self'", "https://*.tile.openstreetmap.org"],
          upgradeInsecureRequests: config.production ? [] : null,
        },
      },
    }),
  );
  app.use(
    cors({
      origin: (origin, cb) =>
        cb(null, !origin || config.origins.includes(origin)),
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "64kb" }));
  app.use(cookieParser(config.secret));
  app.use("/api", (req, res, next) => {
    if (
      process.env.MIGRATION_READ_ONLY === "true" &&
      (!["GET", "HEAD", "OPTIONS"].includes(req.method) ||
        req.path.startsWith("/conversations"))
    )
      return res
        .status(503)
        .set("Retry-After", "60")
        .json({
          error:
            "We are moving campus data to the new host. Please retry in a minute.",
        });
    next();
  });
  if (limit)
    app.use(
      "/api",
      rateLimit({
        windowMs: 60000,
        limit: 200,
        store: process.env.VERCEL
          ? new PostgresRateStore(db, "api")
          : undefined,
        validate: { forwardedHeader: false },
        standardHeaders: "draft-8",
        legacyHeaders: false,
      }),
    );
  app.get("/api/csrf", (req, res) => {
    const token =
      typeof req.signedCookies.csrf === "string"
        ? req.signedCookies.csrf
        : randomBytes(32).toString("hex");
    res.cookie("csrf", token, {
      ...config.cookie,
      signed: true,
      maxAge: 8 * 3600 * 1000,
    });
    res.set("Cache-Control", "no-store").json({ token });
  });
  app.use(
    "/api",
    (req, res, next) => {
      res.set("Cache-Control", "no-store");
      next();
    },
    csrf,
  );
  app.get("/api/health", async (req, res) => {
    await db.query("SELECT 1");
    res.json({
      status: "ok",
      database: process.env.DATABASE_URL ? "postgresql" : "embedded-postgresql",
      ml: "disabled-no-training-data",
    });
  });
  const imagePath = resolve(".local/historical-map.png");
  app.get("/api/map-status", (req, res) =>
    res.json({ available: !config.production && existsSync(imagePath) }),
  );
  app.get("/api/map-context", (req, res) => {
    const data = publicMap();
    res.json(
      data
        ? {
            boundary: data.boundary,
            attribution: data.attribution,
            source_url: data.copyright_url,
          }
        : null,
    );
  });
  app.get("/api/historical-map", (req, res) => {
    if (config.production || !existsSync(imagePath))
      return res
        .status(404)
        .json({ error: "Private historical image is not published." });
    res.sendFile(imagePath, { dotfiles: "allow" });
  });
  app.get("/api/categories", async (req, res) =>
    res.json(
      (await db.query("SELECT id,name FROM categories ORDER BY name")).rows,
    ),
  );
  app.get(["/api/locations", "/api/locations/search"], async (req, res) => {
    const {
      q = "",
      category = "",
      historical = "false",
      offset = 0,
    } = parse(
      z.object({
        q: z.string().max(200).optional(),
        category: z.string().max(100).optional(),
        historical: z.enum(["true", "false"]).optional(),
        offset: z.coerce.number().int().min(0).max(100000).optional(),
      }),
      req.query,
    );
    let items;
    if (historical === "true")
      items = (
        await db.query(
          `SELECT 'history-'||h.old_map_id AS id,h.old_map_name AS name,h.old_map_id,h.source_id,h.verification_status,h.image_x_px,h.image_y_px,c.name AS category,true AS historical,NULL::float8 AS latitude,NULL::float8 AS longitude FROM historical_locations h LEFT JOIN categories c ON c.id=h.proposed_category_id WHERE ($2='' OR c.name=$2) AND ($1='' OR h.old_map_name ILIKE '%'||$1||'%' OR c.name ILIKE '%'||$1||'%' OR h.old_map_id::text=regexp_replace($1,'^(block|map)\\s+','','i') OR similarity(h.old_map_name,$1)>0.2) ORDER BY (h.old_map_id::text=regexp_replace($1,'^(block|map)\\s+','','i')) DESC,h.old_map_id LIMIT 100 OFFSET $3`,
          [q, category, offset],
        )
      ).rows;
    else
      items = (
        await db.query(
          `${currentSelect} WHERE ($2='' OR c.name=$2) AND ($1='' OR l.name ILIKE '%'||$1||'%' OR l.building_code ILIKE '%'||$1||'%' OR l.description ILIKE '%'||$1||'%' OR c.name ILIKE '%'||$1||'%' OR similarity(l.name,$1)>0.2 OR EXISTS (SELECT 1 FROM location_aliases a WHERE a.location_id=l.id AND a.alias ILIKE '%'||$1||'%')) ORDER BY similarity(l.name,$1) DESC,l.name LIMIT 100 OFFSET $3`,
          [q, category, offset],
        )
      ).rows;
    res.json({ items: items.map(safePlace), offset, limit: 100 });
  });
  app.get("/api/locations/nearby", async (req, res) => {
    const {
      latitude,
      longitude,
      radius = 1500,
      category = "",
    } = parse(
      z.object({
        latitude: z.coerce.number().min(-90).max(90),
        longitude: z.coerce.number().min(-180).max(180),
        radius: z.coerce.number().positive().max(10000).optional(),
        category: z.string().max(100).optional(),
      }),
      req.query,
    );
    const items = (
      await db.query(
        `SELECT l.*,c.name AS category,false AS historical,ST_Distance(l.location_point,ST_SetSRID(ST_MakePoint($1,$2),4326)::geography) AS distance_m FROM locations l JOIN categories c ON c.id=l.category_id WHERE l.status IN ('ACTIVE','UNKNOWN') AND l.position_verification IN ('VERIFIED_OFFICIAL','VERIFIED_PUBLIC','APPROXIMATE') AND ($4='' OR c.name=$4) AND ST_DWithin(l.location_point,ST_SetSRID(ST_MakePoint($1,$2),4326)::geography,$3) ORDER BY distance_m LIMIT 50`,
        [longitude, latitude, radius, category],
      )
    ).rows;
    res.json({
      items: items.map(safePlace),
      notice: items.length
        ? null
        : "No usable geographic records found; this does not mean the facilities do not exist.",
    });
  });
  app.get("/api/locations/:id", async (req, res) => {
    const result = await db.query(`${currentSelect} WHERE l.id=$1`, [
      parse(id, req.params.id),
    ]);
    if (!result.rows.length)
      return res.status(404).json({ error: "Location not found." });
    const location = safePlace(result.rows[0]);
    location.facilities = (
      await db.query(
        "SELECT f.name,lf.verification_status FROM location_facilities lf JOIN facilities f ON f.id=lf.facility_id WHERE lf.location_id=$1",
        [location.id],
      )
    ).rows;
    location.announcements = (
      await db.query(
        "SELECT id,title,description FROM announcements WHERE location_id=$1 AND start_date<=now() AND (end_date IS NULL OR end_date>now())",
        [location.id],
      )
    ).rows;
    res.json(location);
  });
  app.get("/api/announcements", async (req, res) =>
    res.json(
      (
        await db.query(
          "SELECT id,title,description,start_date,end_date,priority,location_id FROM announcements WHERE start_date<=now() AND (end_date IS NULL OR end_date>now()) ORDER BY priority DESC,start_date DESC LIMIT 100",
        )
      ).rows,
    ),
  );
  app.post("/api/routes", async (req, res) => {
    const body = parse(
      z.object({
        from: id,
        to: id,
        accessible: z.boolean().default(false),
        allow_approximate: z.boolean().default(false),
      }),
      req.body,
    );
    const route = await campusRoute(db, body);
    if (!route)
      return res.status(422).json({
        code: "ROUTE_UNAVAILABLE",
        error: body.accessible
          ? "No route with verified step-free access is stored between these buildings."
          : "The saved campus walking paths do not connect these buildings. Try Google Maps walking directions below.",
      });
    res.json(route);
  });
  app.get("/api/routes", async (req, res) => {
    const body = parse(
      z.object({
        from: id,
        to: id,
        accessible: z.enum(["true", "false"]).optional(),
      }),
      req.query,
    );
    const route = await campusRoute(db, {
      ...body,
      accessible: body.accessible === "true",
    });
    if (!route)
      return res.status(422).json({
        code: "ROUTE_UNAVAILABLE",
        error:
          "The saved campus walking paths do not connect these buildings with the requested access requirements.",
      });
    res.json(route);
  });
  if (limit)
    app.use(
      "/api/auth",
      rateLimit({
        windowMs: 15 * 60000,
        limit: 25,
        store: process.env.VERCEL
          ? new PostgresRateStore(db, "auth")
          : undefined,
        validate: { forwardedHeader: false },
        standardHeaders: "draft-8",
        legacyHeaders: false,
      }),
    );
  app.post("/api/auth/register", async (req, res) => {
    const body = parse(z.object({ email, password }), req.body);
    const passwordHash = await bcrypt.hash(body.password, 12);
    const result = await db.query(
      "INSERT INTO users(email,password_hash) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING id,email,role",
      [body.email, passwordHash],
    );
    if (!result.rows.length)
      return res
        .status(409)
        .json({ error: "An account could not be created with those details." });
    await issue(result.rows[0], res);
    res.status(201).json({ user: result.rows[0] });
  });
  const dummyHash = bcrypt.hashSync(
    "constant-time-non-account-placeholder",
    12,
  );
  app.post("/api/auth/login", async (req, res) => {
    const body = parse(
      z.object({ email, password: z.string().min(1).max(200) }),
      req.body,
    );
    const row = (
      await db.query("SELECT * FROM users WHERE lower(email)=$1 AND active", [
        body.email,
      ])
    ).rows[0];
    const valid = await bcrypt.compare(
      body.password,
      row?.password_hash ?? dummyHash,
    );
    if (!row || !valid)
      return res.status(401).json({ error: "Email or password is incorrect." });
    const user = { id: row.id, email: row.email, role: row.role };
    await issue(user, res);
    res.json({ user });
  });
  app.post("/api/auth/logout", requireUser, async (req, res) => {
    await db.query(
      "UPDATE auth_tokens SET revoked_at=now() WHERE token_hash=$1",
      [hash(req.cookies.session)],
    );
    res.clearCookie("session", config.cookie).json({ message: "Signed out." });
  });
  app.post("/api/auth/forgot-password", async (req, res) => {
    const body = parse(z.object({ email }), req.body);
    if (process.env.RESET_DELIVERY_URL) {
      const token = randomBytes(32).toString("hex");
      const user = (
        await db.query(
          "SELECT id FROM users WHERE lower(email)=$1 AND active",
          [body.email],
        )
      ).rows[0];
      if (user) {
        await db.query(
          "INSERT INTO auth_tokens(user_id,token_hash,purpose,expires_at) VALUES($1,$2,'PASSWORD_RESET',now()+interval '30 minutes')",
          [user.id, hash(token)],
        );
        if (
          config.production &&
          !process.env.RESET_DELIVERY_URL.startsWith("https://")
        )
          throw new Error("Reset delivery requires HTTPS");
        try {
          const delivery = await fetch(process.env.RESET_DELIVERY_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${process.env.RESET_DELIVERY_SECRET ?? ""}`,
            },
            body: JSON.stringify({
              email: body.email,
              url: `${config.origin}/?reset=${token}`,
            }),
            signal: AbortSignal.timeout(5000),
          });
          if (!delivery.ok) throw new Error("Delivery failed");
        } catch {
          await db.query(
            "UPDATE auth_tokens SET revoked_at=now() WHERE token_hash=$1",
            [hash(token)],
          );
        }
      }
    }
    res.json({
      message:
        "If the account exists and email delivery is configured, a reset link will be sent.",
    });
  });
  app.post("/api/auth/reset-password", async (req, res) => {
    const body = parse(
      z.object({ token: z.string().min(32).max(256), password }),
      req.body,
    );
    const newHash = await bcrypt.hash(body.password, 12);
    const success = await db.transaction(async (tx) => {
      const tokens = (
        await tx.query(
          "UPDATE auth_tokens SET revoked_at=now() WHERE token_hash=$1 AND purpose='PASSWORD_RESET' AND revoked_at IS NULL AND expires_at>now() RETURNING user_id",
          [hash(body.token)],
        )
      ).rows;
      if (!tokens.length) return false;
      await tx.query("UPDATE users SET password_hash=$1 WHERE id=$2", [
        newHash,
        tokens[0].user_id,
      ]);
      await tx.query(
        "UPDATE auth_tokens SET revoked_at=now() WHERE user_id=$1",
        [tokens[0].user_id],
      );
      return true;
    });
    if (!success)
      return res.status(400).json({ error: "Invalid or expired reset link." });
    res
      .clearCookie("session", config.cookie)
      .json({ message: "Password updated. Sign in with your new password." });
  });
  app.get("/api/profile", requireUser, (req, res) =>
    res.set("Cache-Control", "no-store").json(req.user),
  );
  app.get("/api/favorites", requireUser, async (req, res) =>
    res.json(
      (
        await db.query(
          "SELECT l.id,l.name FROM favorites f JOIN locations l ON l.id=f.location_id WHERE f.user_id=$1 ORDER BY f.created_at DESC",
          [req.user.id],
        )
      ).rows,
    ),
  );
  app.post("/api/favorites", requireUser, async (req, res) => {
    const body = parse(z.object({ location_id: id }), req.body);
    await db.query(
      "INSERT INTO favorites(user_id,location_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
      [req.user.id, body.location_id],
    );
    res.status(201).json({ message: "Saved." });
  });
  app.delete("/api/favorites/:id", requireUser, async (req, res) => {
    await db.query(
      "DELETE FROM favorites WHERE user_id=$1 AND location_id=$2",
      [req.user.id, parse(id, req.params.id)],
    );
    res.json({ message: "Removed." });
  });
  app.post("/api/history", requireUser, async (req, res) => {
    const body = parse(
      z.object({ query: z.string().trim().min(1).max(300) }),
      req.body,
    );
    await db.transaction(async (tx) => {
      await tx.query(
        "INSERT INTO recent_searches(user_id,query) VALUES($1,$2)",
        [req.user.id, body.query],
      );
      await tx.query(
        "DELETE FROM recent_searches WHERE user_id=$1 AND id NOT IN (SELECT id FROM recent_searches WHERE user_id=$1 ORDER BY created_at DESC LIMIT 25)",
        [req.user.id],
      );
    });
    res.status(201).json({ message: "Recorded." });
  });
  app.get("/api/history", requireUser, async (req, res) =>
    res.json(
      (
        await db.query(
          "SELECT id,query,created_at FROM recent_searches WHERE user_id=$1 ORDER BY created_at DESC LIMIT 25",
          [req.user.id],
        )
      ).rows,
    ),
  );
  app.post("/api/reports", requireUser, async (req, res) => {
    const body = parse(
      z.object({
        location_id: id,
        report_type: z.enum([
          "WRONG_LOCATION",
          "WRONG_NAME",
          "WRONG_CATEGORY",
          "WRONG_OPENING_HOURS",
          "MISSING_FACILITY",
          "CLOSED_LOCATION",
          "DUPLICATE_LOCATION",
          "OTHER",
        ]),
        description: z.string().trim().min(10).max(5000),
        suggested_value: z.record(z.string(), z.unknown()).optional(),
      }),
      req.body,
    );
    const result = await db.query(
      "INSERT INTO reports(location_id,user_id,report_type,description,suggested_value) VALUES($1,$2,$3,$4,$5) RETURNING id,status",
      [
        body.location_id,
        req.user.id,
        body.report_type,
        body.description,
        body.suggested_value ?? null,
      ],
    );
    res.status(201).json(result.rows[0]);
  });
  app.get("/api/reports", requireUser, async (req, res) =>
    res.json(
      (
        await db.query(
          "SELECT * FROM reports WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100",
          [req.user.id],
        )
      ).rows,
    ),
  );
  app.post("/api/submissions", requireUser, async (req, res) => {
    const body = parse(
      z
        .object({
          description: z.string().trim().min(10).max(5000),
          historical_id: z.string().max(80).optional(),
          suggested_latitude: z.number().min(-90).max(90).optional(),
          suggested_longitude: z.number().min(-180).max(180).optional(),
          accuracy_m: z.number().min(0).max(100).optional(),
          captured_at: z.iso.datetime().optional(),
          location_consent: z.boolean().optional(),
        })
        .refine(
          (o) =>
            (o.suggested_latitude === undefined) ===
            (o.suggested_longitude === undefined),
          "Both coordinates are required",
        )
        .refine(
          (o) =>
            o.suggested_latitude === undefined ||
            (o.location_consent === true &&
              o.accuracy_m !== undefined &&
              o.captured_at !== undefined),
          "GPS suggestions require consent, accuracy and capture time",
        )
        .refine(
          (o) =>
            o.suggested_latitude === undefined ||
            (o.suggested_latitude >= 31.24 &&
              o.suggested_latitude <= 31.27 &&
              o.suggested_longitude >= 75.69 &&
              o.suggested_longitude <= 75.72),
          "Capture the position while at the place on campus",
        )
        .refine(
          (o) =>
            o.suggested_latitude === undefined ||
            (Date.now() - Date.parse(o.captured_at) <= 300000 &&
              Date.parse(o.captured_at) <= Date.now() + 5000),
          "Capture a fresh position within five minutes before sharing",
        ),
      req.body,
    );
    const result = await db.query(
      "INSERT INTO submissions(user_id,payload) VALUES($1,$2) RETURNING id,status",
      [req.user.id, JSON.stringify(body)],
    );
    res.status(201).json(result.rows[0]);
  });
  app.post("/api/assistant", async (req, res) => {
    const { question } = parse(
      z.object({ question: z.string().trim().min(1).max(1000) }),
      req.body,
    );
    const result = await answerQuestion(db, question);
    if (process.env.AI_SERVICE_URL) {
      try {
        const response = await fetch(`${process.env.AI_SERVICE_URL}/answer`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question, retrieval: result }),
          signal: AbortSignal.timeout(7000),
        });
        if (response.ok) {
          const output = await response.json();
          if (
            typeof output.answer === "string" &&
            Array.isArray(output.sources)
          )
            return res.json(output);
        }
      } catch {
        /* Deterministic grounded answer remains available. */
      }
    }
    res.json(result);
  });
  app.get("/api/ml/status", (req, res) =>
    res.json({
      enabled: false,
      reason: "No eligible real crowd dataset or validated model is available.",
    }),
  );
  registerAdmin(app, db, requireUser, admin);
  registerPush(app, db);
  registerConversations(app, db, requireUser, admin);
  app.use("/api", (req, res) =>
    res.status(404).json({ error: "API endpoint not found." }),
  );
  if (existsSync(resolve("dist/index.html"))) {
    app.use(express.static(resolve("dist")));
    app.get("/{*path}", (req, res) => res.sendFile(resolve("dist/index.html")));
  }
  app.use((error, req, res, next) => {
    if (error instanceof z.ZodError)
      return res.status(400).json({
        error: error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      });
    if (error.type === "entity.parse.failed")
      return res.status(400).json({ error: "Invalid JSON." });
    if (error.code === "23505")
      return res.status(409).json({ error: "That record already exists." });
    if (["23503", "23514", "P0001", "22P02"].includes(error.code))
      return res.status(400).json({
        error:
          "The data violates a relationship, geometry, or validation constraint.",
      });
    console.error("Request failed:", error.code ?? error.name);
    res.status(500).json({ error: "The request could not be completed." });
  });
  return app;
}
