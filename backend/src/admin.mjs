import { z } from "zod";
const id = z.coerce.number().int().positive();
const status = z.enum([
  "VERIFIED_OFFICIAL",
  "VERIFIED_PUBLIC",
  "APPROXIMATE",
  "UNVERIFIED",
  "USER_SUBMITTED",
  "PENDING_REVIEW",
]);
const source = z.string().trim().min(1).max(200);
const locationSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    category_id: id,
    description: z.string().max(5000).default(""),
    source_id: source,
    latitude: z.number().min(-90).max(90).nullable().default(null),
    longitude: z.number().min(-180).max(180).nullable().default(null),
    version: z.number().int().optional(),
    status: z
      .enum(["UNKNOWN", "ACTIVE", "TEMPORARILY_CLOSED", "CLOSED"])
      .default("UNKNOWN"),
    opening_hours: z.record(z.string(), z.string()).nullable().optional(),
    phone: z.string().max(80).nullable().optional(),
    website: z.url().nullable().optional(),
    building_code: z.string().max(80).nullable().optional(),
  })
  .refine(
    (o) => (o.latitude === null) === (o.longitude === null),
    "Coordinates must be provided together",
  );
export async function audit(tx, actor, action, type, entity, before, after) {
  await tx.query(
    "INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,before_value,after_value) VALUES($1,$2,$3,$4,$5,$6)",
    [
      actor,
      action,
      type,
      String(entity),
      before ? JSON.stringify(before) : null,
      after ? JSON.stringify(after) : null,
    ],
  );
}
export function registerAdmin(app, db, requireUser, admin) {
  app.use("/api/admin", requireUser, admin);
  app.get("/api/admin/dashboard", async (req, res) => {
    const locations = (
      await db.query("SELECT * FROM locations ORDER BY name LIMIT 200")
    ).rows;
    const reports = (
      await db.query(
        "SELECT * FROM reports WHERE status='PENDING' ORDER BY created_at LIMIT 100",
      )
    ).rows;
    const submissions = (
      await db.query(
        "SELECT * FROM submissions WHERE status='PENDING' ORDER BY created_at LIMIT 100",
      )
    ).rows;
    const users = (
      await db.query(
        "SELECT id,email,role,active FROM users ORDER BY id LIMIT 100",
      )
    ).rows;
    const log = (
      await db.query(
        "SELECT id,action,entity_type,entity_id,created_at FROM audit_logs ORDER BY id DESC LIMIT 20",
      )
    ).rows;
    const stats = (
      await db.query(
        `SELECT (SELECT count(*) FROM locations)::int AS locations,(SELECT count(*) FROM historical_locations)::int AS historical_entries,(SELECT count(*) FROM locations WHERE verification_status IN ('VERIFIED_OFFICIAL','VERIFIED_PUBLIC'))::int AS verified,(SELECT count(*) FROM reports WHERE status='PENDING')::int+(SELECT count(*) FROM submissions WHERE status='PENDING')::int AS pending_reviews,(SELECT count(*) FROM users)::int AS users`,
      )
    ).rows[0];
    res.json({
      locations: locations.map((p) => ({ ...p, location_point: undefined })),
      reports,
      submissions,
      users,
      audit: log,
      stats,
    });
  });
  app.post("/api/admin/sources", async (req, res) => {
    const b = z
      .object({
        id: source,
        type: z.enum([
          "OFFICIAL_LPU",
          "PUBLIC_MAP",
          "OLD_LPU_MAP",
          "USER_SUBMISSION",
          "ADMIN_VERIFIED",
        ]),
        title: z.string().min(1).max(300),
        url: z.url().optional(),
        notes: z.string().max(5000).optional(),
      })
      .parse(req.body);
    await db.transaction(async (tx) => {
      await tx.query(
        "INSERT INTO sources(id,type,title,url,retrieved_at,notes) VALUES($1,$2,$3,$4,now(),$5)",
        [b.id, b.type, b.title, b.url ?? null, b.notes ?? null],
      );
      await audit(tx, req.user.id, "CREATE", "sources", b.id, null, b);
    });
    res.status(201).json(b);
  });
  app.post("/api/admin/categories", async (req, res) => {
    const b = z
      .object({ name: z.string().trim().min(1).max(100) })
      .parse(req.body);
    const row = await db.transaction(async (tx) => {
      const row = (
        await tx.query("INSERT INTO categories(name) VALUES($1) RETURNING *", [
          b.name,
        ])
      ).rows[0];
      await audit(tx, req.user.id, "CREATE", "categories", row.id, null, row);
      return row;
    });
    res.status(201).json(row);
  });
  app.post("/api/admin/locations", async (req, res) => {
    const b = locationSchema.parse(req.body);
    const row = await db.transaction(async (tx) => {
      await requireCurrentSource(tx, b.source_id);
      const row = (
        await tx.query(
          `INSERT INTO locations(name,category_id,description,source_id,latitude,longitude,position_source_id,status,opening_hours,phone,website,building_code) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id,name`,
          [
            b.name,
            b.category_id,
            b.description,
            b.source_id,
            b.latitude,
            b.longitude,
            b.latitude === null ? null : b.source_id,
            b.status,
            b.opening_hours ?? null,
            b.phone ?? null,
            b.website ?? null,
            b.building_code ?? null,
          ],
        )
      ).rows[0];
      await audit(tx, req.user.id, "CREATE", "locations", row.id, null, b);
      return row;
    });
    res.status(201).json(row);
  });
  app.put("/api/admin/locations/:id", async (req, res) => {
    const b = locationSchema.parse(req.body),
      locationId = id.parse(req.params.id);
    if (!b.version)
      return res
        .status(400)
        .json({ error: "The location version is required." });
    const row = await db.transaction(async (tx) => {
      await requireCurrentSource(tx, b.source_id);
      const before = (
        await tx.query("SELECT * FROM locations WHERE id=$1 FOR UPDATE", [
          locationId,
        ])
      ).rows[0];
      if (!before) return null;
      if (before.version !== b.version) return "conflict";
      const after = (
        await tx.query(
          `UPDATE locations SET name=$1,category_id=$2,description=$3,source_id=$4,latitude=$5,longitude=$6,position_source_id=$7,status=$8,opening_hours=$9,phone=$10,website=$11,building_code=$12,verification_status='UNVERIFIED',verification_date=NULL,position_verification='UNVERIFIED',position_verified_at=NULL,verified_by=NULL WHERE id=$13 RETURNING id,name,version`,
          [
            b.name,
            b.category_id,
            b.description,
            b.source_id,
            b.latitude,
            b.longitude,
            b.latitude === null ? null : b.source_id,
            b.status,
            b.opening_hours ?? null,
            b.phone ?? null,
            b.website ?? null,
            b.building_code ?? null,
            locationId,
          ],
        )
      ).rows[0];
      await audit(
        tx,
        req.user.id,
        "UPDATE",
        "locations",
        locationId,
        { name: before.name, version: before.version },
        b,
      );
      return after;
    });
    if (row === "conflict")
      return res
        .status(409)
        .json({ error: "This location changed. Reload before editing." });
    if (!row) return res.status(404).json({ error: "Location not found." });
    res.json(row);
  });
  app.delete("/api/admin/locations/:id", async (req, res) => {
    const locationId = id.parse(req.params.id);
    const deleted = await db.transaction(async (tx) => {
      const row = (
        await tx.query("DELETE FROM locations WHERE id=$1 RETURNING id,name", [
          locationId,
        ])
      ).rows[0];
      if (row)
        await audit(
          tx,
          req.user.id,
          "DELETE",
          "locations",
          locationId,
          row,
          null,
        );
      return row;
    });
    if (!deleted) return res.status(404).json({ error: "Location not found." });
    res.json({ message: "Deleted." });
  });
  app.post("/api/admin/verification", async (req, res) => {
    const b = z
      .object({
        location_id: id,
        source_id: source,
        verification_status: status,
        field: z.enum(["identity", "position"]),
        claim: z.string().trim().min(10).max(5000),
      })
      .parse(req.body);
    await db.transaction(async (tx) => {
      const evidence = await requireCurrentSource(tx, b.source_id);
      if (
        b.verification_status === "VERIFIED_OFFICIAL" &&
        evidence.type !== "OFFICIAL_LPU"
      )
        throw badData("Official verification requires an official source.");
      if (
        b.verification_status === "VERIFIED_PUBLIC" &&
        !["PUBLIC_MAP", "OFFICIAL_LPU"].includes(evidence.type)
      )
        throw badData("Public verification requires a public source.");
      const field =
          b.field === "identity"
            ? "verification_status"
            : "position_verification",
        date =
          b.field === "identity" ? "verification_date" : "position_verified_at",
        src = b.field === "identity" ? "source_id" : "position_source_id";
      const row = (
        await tx.query(
          `UPDATE locations SET ${field}=$1,${date}=now(),${src}=$2,verified_by=$3 WHERE id=$4 RETURNING id`,
          [b.verification_status, b.source_id, req.user.id, b.location_id],
        )
      ).rows[0];
      if (!row) throw badData("Location not found.");
      await tx.query(
        "INSERT INTO location_evidence(location_id,source_id,claim_field,claim_value,verification_status,reviewed_by,reviewed_at) VALUES($1,$2,$3,$4,$5,$6,now())",
        [
          b.location_id,
          b.source_id,
          b.field,
          JSON.stringify(b.claim),
          b.verification_status,
          req.user.id,
        ],
      );
      await audit(
        tx,
        req.user.id,
        "VERIFY",
        "locations",
        b.location_id,
        null,
        b,
      );
    });
    res.json({ message: "Evidence and review recorded." });
  });
  for (const table of ["reports", "submissions"])
    app.patch(`/api/admin/${table}/:id`, async (req, res) => {
      const reviewId = id.parse(req.params.id);
      const b = z
        .object({
          status: z.enum(["APPROVED", "REJECTED", "RESOLVED"]),
          admin_comment: z.string().trim().min(5).max(3000),
          apply: z
            .object({
              location_id: id,
              version: z.number().int().positive(),
              name: z.string().trim().min(1).max(200),
              source_id: source,
            })
            .optional(),
        })
        .parse(req.body);
      if (b.status === "APPROVED" && !b.apply)
        return res.status(400).json({
          error:
            "Approval requires an explicit current-location name change, evidence source and expected version. Use RESOLVED after other separately audited changes.",
        });
      const row = await db.transaction(async (tx) => {
        const before = (
          await tx.query(
            `SELECT * FROM ${table} WHERE id=$1 AND status='PENDING' FOR UPDATE`,
            [reviewId],
          )
        ).rows[0];
        if (!before) return null;
        if (b.apply) {
          await requireCurrentSource(tx, b.apply.source_id);
          const changed = (
            await tx.query(
              "UPDATE locations SET name=$1,source_id=$2,verification_status='UNVERIFIED',verification_date=NULL WHERE id=$3 AND version=$4 RETURNING id",
              [
                b.apply.name,
                b.apply.source_id,
                b.apply.location_id,
                b.apply.version,
              ],
            )
          ).rows[0];
          if (!changed) throw badData("Location missing or version changed.");
          await audit(
            tx,
            req.user.id,
            "CORRECT",
            "locations",
            b.apply.location_id,
            null,
            b.apply,
          );
        }
        const row = (
          await tx.query(
            `UPDATE ${table} SET status=$1,admin_comment=$2,reviewed_by=$3,${table === "reports" ? "resolved_at" : "reviewed_at"}=now() WHERE id=$4 RETURNING id,status`,
            [b.status, b.admin_comment, req.user.id, reviewId],
          )
        ).rows[0];
        await audit(
          tx,
          req.user.id,
          "REVIEW",
          table,
          reviewId,
          { status: before.status },
          b,
        );
        return row;
      });
      if (!row)
        return res
          .status(409)
          .json({ error: "Review no longer pending or not found." });
      res.json(row);
    });
  app.patch("/api/admin/users/:id", async (req, res) => {
    const target = id.parse(req.params.id),
      b = z
        .object({ role: z.enum(["VISITOR", "STUDENT", "FACULTY", "ADMIN"]) })
        .parse(req.body);
    if (String(target) === String(req.user.id) && b.role !== "ADMIN")
      return res
        .status(409)
        .json({ error: "You cannot demote your own admin account." });
    const user = await db.transaction(async (tx) => {
      const before = (
        await tx.query("SELECT id,role FROM users WHERE id=$1 FOR UPDATE", [
          target,
        ])
      ).rows[0];
      if (!before) return null;
      const row = (
        await tx.query(
          "UPDATE users SET role=$1 WHERE id=$2 RETURNING id,email,role",
          [b.role, target],
        )
      ).rows[0];
      await tx.query(
        "UPDATE auth_tokens SET revoked_at=now() WHERE user_id=$1",
        [target],
      );
      await audit(tx, req.user.id, "ROLE_CHANGE", "users", target, before, row);
      return row;
    });
    if (!user) return res.status(404).json({ error: "User not found." });
    res.json(user);
  });
  app.post("/api/admin/announcements", async (req, res) => {
    const b = z
      .object({
        title: z.string().min(1).max(200),
        description: z.string().min(1).max(5000),
        location_id: id.nullable().default(null),
        start_date: z.iso.datetime(),
        end_date: z.iso.datetime().nullable().default(null),
        priority: z.number().int().min(0).max(3).default(0),
      })
      .parse(req.body);
    const row = await db.transaction(async (tx) => {
      const row = (
        await tx.query(
          "INSERT INTO announcements(title,description,location_id,start_date,end_date,priority,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",
          [
            b.title,
            b.description,
            b.location_id,
            b.start_date,
            b.end_date,
            b.priority,
            req.user.id,
          ],
        )
      ).rows[0];
      await audit(tx, req.user.id, "CREATE", "announcements", row.id, null, b);
      return row;
    });
    res.status(201).json(row);
  });
  app.post("/api/admin/facilities", async (req, res) => {
    const b = z
      .object({
        name: z.string().min(1).max(100),
        location_id: id,
        source_id: source,
      })
      .parse(req.body);
    await db.transaction(async (tx) => {
      await requireCurrentSource(tx, b.source_id);
      const row = (
        await tx.query(
          "INSERT INTO facilities(name) VALUES($1) ON CONFLICT(name) DO UPDATE SET name=excluded.name RETURNING id",
          [b.name],
        )
      ).rows[0];
      await tx.query(
        "INSERT INTO location_facilities(location_id,facility_id,source_id) VALUES($1,$2,$3)",
        [b.location_id, row.id, b.source_id],
      );
      await audit(
        tx,
        req.user.id,
        "ADD_FACILITY",
        "locations",
        b.location_id,
        null,
        b,
      );
    });
    res.status(201).json({ message: "Facility associated for review." });
  });
  app.post("/api/admin/path-nodes", async (req, res) => {
    const b = z
      .object({
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        source_id: source,
        verification_status: status.default("UNVERIFIED"),
      })
      .parse(req.body);
    const row = await db.transaction(async (tx) => {
      await requireCurrentSource(tx, b.source_id);
      const row = (
        await tx.query(
          "INSERT INTO path_nodes(point,source_id,verification_status) VALUES(ST_SetSRID(ST_MakePoint($1,$2),4326)::geography,$3,$4) RETURNING id",
          [b.longitude, b.latitude, b.source_id, b.verification_status],
        )
      ).rows[0];
      await audit(tx, req.user.id, "CREATE", "path_nodes", row.id, null, b);
      return row;
    });
    res.status(201).json(row);
  });
  app.post("/api/admin/path-edges", async (req, res) => {
    const b = z
      .object({
        from_node_id: id,
        to_node_id: id,
        coordinates: z
          .array(
            z.tuple([
              z.number().min(-180).max(180),
              z.number().min(-90).max(90),
            ]),
          )
          .min(2)
          .max(1000),
        source_id: source,
        verification_status: status.default("UNVERIFIED"),
        accessible: z.boolean().nullable().default(null),
        accessibility_source_id: source.nullable().default(null),
        blocked: z.boolean().default(false),
        one_way: z.boolean().default(false),
        road_type: z.string().max(100).default("walkway"),
      })
      .parse(req.body);
    const row = await db.transaction(async (tx) => {
      await requireCurrentSource(tx, b.source_id);
      if (b.accessible !== null)
        await requireCurrentSource(tx, b.accessibility_source_id);
      const row = (
        await tx.query(
          `INSERT INTO path_edges(from_node_id,to_node_id,path,source_id,verification_status,accessible,accessibility_source_id,accessibility_checked_at,blocked,one_way,road_type) VALUES($1,$2,ST_SetSRID(ST_GeomFromGeoJSON($3),4326)::geography,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id,distance_m`,
          [
            b.from_node_id,
            b.to_node_id,
            JSON.stringify({ type: "LineString", coordinates: b.coordinates }),
            b.source_id,
            b.verification_status,
            b.accessible,
            b.accessibility_source_id,
            b.accessible === null ? null : new Date().toISOString(),
            b.blocked,
            b.one_way,
            b.road_type,
          ],
        )
      ).rows[0];
      await audit(tx, req.user.id, "CREATE", "path_edges", row.id, null, b);
      return row;
    });
    res.status(201).json(row);
  });
  app.post("/api/admin/entrances", async (req, res) => {
    const b = z
      .object({
        location_id: id,
        node_id: id,
        source_id: source,
        name: z.string().max(100).optional(),
      })
      .parse(req.body);
    await db.transaction(async (tx) => {
      await requireCurrentSource(tx, b.source_id);
      await tx.query(
        "INSERT INTO location_entrances(location_id,node_id,source_id,name) VALUES($1,$2,$3,$4)",
        [b.location_id, b.node_id, b.source_id, b.name ?? null],
      );
      await audit(
        tx,
        req.user.id,
        "ADD_ENTRANCE",
        "locations",
        b.location_id,
        null,
        b,
      );
    });
    res.status(201).json(b);
  });
  app.get("/api/admin/path-edges", async (req, res) => {
    const offset = z.coerce
      .number()
      .int()
      .min(0)
      .max(100000)
      .default(0)
      .parse(req.query.offset);
    res.json(
      (
        await db.query(
          "SELECT id,from_node_id,to_node_id,distance_m,source_id,verification_status,accessible,blocked,one_way,road_type FROM path_edges ORDER BY id LIMIT 100 OFFSET $1",
          [offset],
        )
      ).rows,
    );
  });
  app.patch("/api/admin/path-edges/:id", async (req, res) => {
    const edgeId = id.parse(req.params.id);
    const b = z
      .object({
        source_id: source,
        blocked: z.boolean().optional(),
        one_way: z.boolean().optional(),
        accessible: z.boolean().nullable().optional(),
      })
      .refine(
        (b) =>
          b.blocked !== undefined ||
          b.one_way !== undefined ||
          b.accessible !== undefined,
        "Provide a path update",
      )
      .parse(req.body);
    const result = await db.transaction(async (tx) => {
      await requireCurrentSource(tx, b.source_id);
      const before = (
        await tx.query("SELECT * FROM path_edges WHERE id=$1 FOR UPDATE", [
          edgeId,
        ])
      ).rows[0];
      if (!before) return null;
      const access =
        b.accessible === undefined ? before.accessible : b.accessible;
      const row = (
        await tx.query(
          "UPDATE path_edges SET blocked=$1,one_way=$2,accessible=$3,accessibility_source_id=$4,accessibility_checked_at=$5 WHERE id=$6 RETURNING id,blocked,one_way,accessible",
          [
            b.blocked ?? before.blocked,
            b.one_way ?? before.one_way,
            access,
            b.accessible === undefined
              ? before.accessibility_source_id
              : access === null
                ? null
                : b.source_id,
            b.accessible === undefined
              ? before.accessibility_checked_at
              : access === null
                ? null
                : new Date().toISOString(),
            edgeId,
          ],
        )
      ).rows[0];
      await audit(
        tx,
        req.user.id,
        "PATH_CONDITION",
        "path_edges",
        edgeId,
        {
          blocked: before.blocked,
          one_way: before.one_way,
          accessible: before.accessible,
        },
        b,
      );
      return row;
    });
    if (!result) return res.status(404).json({ error: "Path not found." });
    res.json(result);
  });
  for (const [endpoint, table] of [
    ["path-edges", "path_edges"],
    ["announcements", "announcements"],
  ])
    app.delete(`/api/admin/${endpoint}/:id`, async (req, res) => {
      const target = id.parse(req.params.id);
      const result = await db.transaction(async (tx) => {
        const row = (
          await tx.query(`DELETE FROM ${table} WHERE id=$1 RETURNING *`, [
            target,
          ])
        ).rows[0];
        if (row)
          await audit(tx, req.user.id, "DELETE", table, target, row, null);
        return row;
      });
      if (!result) return res.status(404).json({ error: "Record not found." });
      res.json({ message: "Deleted." });
    });
  app.put("/api/admin/announcements/:id", async (req, res) => {
    const target = id.parse(req.params.id);
    const b = z
      .object({
        title: z.string().min(1).max(200),
        description: z.string().min(1).max(5000),
        start_date: z.iso.datetime(),
        end_date: z.iso.datetime().nullable(),
        priority: z.number().int().min(0).max(3),
        location_id: id.nullable(),
      })
      .parse(req.body);
    const row = await db.transaction(async (tx) => {
      const before = (
        await tx.query("SELECT * FROM announcements WHERE id=$1 FOR UPDATE", [
          target,
        ])
      ).rows[0];
      if (!before) return null;
      const after = (
        await tx.query(
          "UPDATE announcements SET title=$1,description=$2,start_date=$3,end_date=$4,priority=$5,location_id=$6 WHERE id=$7 RETURNING *",
          [
            b.title,
            b.description,
            b.start_date,
            b.end_date,
            b.priority,
            b.location_id,
            target,
          ],
        )
      ).rows[0];
      await audit(
        tx,
        req.user.id,
        "UPDATE",
        "announcements",
        target,
        before,
        b,
      );
      return after;
    });
    if (!row) return res.status(404).json({ error: "Announcement not found." });
    res.json(row);
  });
}
function badData(message) {
  const e = new Error(message);
  e.code = "P0001";
  return e;
}
async function requireCurrentSource(tx, sourceId) {
  const s = (await tx.query("SELECT * FROM sources WHERE id=$1", [sourceId]))
    .rows[0];
  if (!s || s.type === "OLD_LPU_MAP")
    throw badData("A current evidence source is required.");
  return s;
}
