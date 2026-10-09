import { z } from "zod";
import { rateLimit } from "express-rate-limit";
import { audit } from "./admin.mjs";
const id = z.coerce.number().int().positive();
export function registerConversations(app, db, requireUser, admin) {
  app.use("/api/conversations", requireUser, (req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  app.get("/api/conversations", async (req, res) => {
    await db.query(
      "INSERT INTO conversations(owner_id,kind) VALUES($1,'SUPPORT') ON CONFLICT DO NOTHING",
      [req.user.id],
    );
    res.json(
      (
        await db.query(
          `SELECT c.*, CASE WHEN c.kind='CAMPUS' THEN 'Campus conversation' ELSE COALESCE(u.email,'Support') END AS title,
      (SELECT max(created_at) FROM conversation_messages WHERE conversation_id=c.id) AS last_message_at
      FROM conversations c LEFT JOIN users u ON u.id=c.owner_id
      WHERE c.kind='CAMPUS' OR c.owner_id=$1 OR $2 ORDER BY last_message_at DESC NULLS LAST,c.id`,
          [req.user.id, req.user.role === "ADMIN"],
        )
      ).rows,
    );
  });
  const access = async (req, res, next) => {
    const room = (
      await db.query("SELECT * FROM conversations WHERE id=$1", [
        id.parse(req.params.id),
      ])
    ).rows[0];
    if (
      !room ||
      (room.kind !== "CAMPUS" &&
        String(room.owner_id) !== String(req.user.id) &&
        req.user.role !== "ADMIN")
    )
      return res.status(404).json({ error: "Conversation not found." });
    req.room = room;
    next();
  };
  app.get("/api/conversations/:id/messages", access, async (req, res) => {
    const before = z.coerce
      .number()
      .int()
      .positive()
      .optional()
      .parse(req.query.before);
    res.json(
      (
        await db.query(
          `SELECT m.id,m.sender_id,m.created_at,m.removed,
      CASE WHEN m.removed THEN '[Message removed by moderator]' ELSE m.body END AS body,
      CASE WHEN u.role='ADMIN' THEN 'Campus admin' ELSE 'Member ' || u.id::text END AS sender
      FROM conversation_messages m JOIN users u ON u.id=m.sender_id WHERE conversation_id=$1 AND ($2::bigint IS NULL OR m.id<$2)
      ORDER BY m.id DESC LIMIT 100`,
          [req.room.id, before ?? null],
        )
      ).rows.reverse(),
    );
  });
  app.post(
    "/api/conversations/:id/messages",
    rateLimit({ windowMs: 60000, limit: 30 }),
    access,
    async (req, res) => {
      const { body } = z
        .object({ body: z.string().trim().min(1).max(2000) })
        .parse(req.body);
      const result = await db.transaction(async (tx) => {
        const room = (
          await tx.query(
            "SELECT closed FROM conversations WHERE id=$1 FOR UPDATE",
            [req.room.id],
          )
        ).rows[0];
        if (room.closed) return null;
        return (
          await tx.query(
            "INSERT INTO conversation_messages(conversation_id,sender_id,body) VALUES($1,$2,$3) RETURNING id",
            [req.room.id, req.user.id, body],
          )
        ).rows[0];
      });
      if (!result)
        return res
          .status(409)
          .json({
            error:
              "This conversation is closed. Ask an administrator to reopen it.",
          });
      res.status(201).json(result);
    },
  );
  app.patch("/api/conversations/:id", admin, access, async (req, res) => {
    const { closed } = z.object({ closed: z.boolean() }).parse(req.body);
    await db.transaction(async (tx) => {
      await tx.query("UPDATE conversations SET closed=$1 WHERE id=$2", [
        closed,
        req.room.id,
      ]);
      await audit(
        tx,
        req.user.id,
        "UPDATE",
        "conversations",
        req.room.id,
        req.room,
        { closed },
      );
    });
    res.json({ closed });
  });
  app.delete(
    "/api/conversations/:id/messages/:messageId",
    admin,
    access,
    async (req, res) => {
      await db.transaction(async (tx) => {
        const result = await tx.query(
          "UPDATE conversation_messages SET removed=true WHERE id=$1 AND conversation_id=$2 RETURNING id",
          [id.parse(req.params.messageId), req.room.id],
        );
        if (result.rows[0])
          await audit(
            tx,
            req.user.id,
            "REMOVE",
            "conversation_messages",
            result.rows[0].id,
            null,
            { removed: true },
          );
      });
      res.json({ message: "Message removed." });
    },
  );
}
