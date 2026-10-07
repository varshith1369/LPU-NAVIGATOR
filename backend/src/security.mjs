import jwt from "jsonwebtoken";
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
export const hash = (value) => createHash("sha256").update(value).digest("hex");
export function configuration() {
  const production = process.env.NODE_ENV === "production";
  let secret = process.env.JWT_SECRET;
  if (!secret) {
    if (production) throw new Error("JWT_SECRET required");
    mkdirSync(".local", { recursive: true });
    if (!existsSync(".local/jwt-secret"))
      writeFileSync(".local/jwt-secret", randomBytes(48).toString("hex"));
    secret = readFileSync(".local/jwt-secret", "utf8");
  }
  if (secret.length < 32)
    throw new Error("JWT_SECRET must have at least 32 characters");
  const origin = process.env.APP_ORIGIN ?? "http://127.0.0.1:5173";
  if (production && !origin.startsWith("https://"))
    throw new Error("Production APP_ORIGIN must use HTTPS");
  return {
    secret,
    production,
    origin,
    origins: production
      ? [origin]
      : [
          origin,
          "http://localhost:5173",
          "http://127.0.0.1:5173",
          "http://localhost:3001",
          "http://127.0.0.1:3001",
        ],
    cookie: { httpOnly: true, secure: production, sameSite: "lax", path: "/" },
  };
}
export function security(db, config) {
  const requireUser = async (req, res, next) => {
    try {
      const raw = req.cookies.session;
      if (!raw)
        return res.status(401).json({ error: "Please sign in to continue." });
      const decoded = jwt.verify(raw, config.secret, {
        algorithms: ["HS256"],
        issuer: "lpu-navigator",
        audience: "lpu-web",
      });
      const result = await db.query(
        `SELECT u.id,u.email,u.role FROM users u JOIN auth_tokens t ON t.user_id=u.id WHERE u.id=$1 AND u.active AND t.token_hash=$2 AND t.purpose='REFRESH' AND t.revoked_at IS NULL AND t.expires_at>now()`,
        [decoded.sub, hash(raw)],
      );
      if (!result.rows.length)
        return res
          .status(401)
          .json({ error: "Your session has expired. Please sign in." });
      req.user = result.rows[0];
      next();
    } catch (e) {
      if (e.name === "JsonWebTokenError" || e.name === "TokenExpiredError")
        return res.status(401).json({ error: "Invalid or expired session." });
      next(e);
    }
  };
  const admin = (req, res, next) =>
    req.user?.role === "ADMIN"
      ? next()
      : res.status(403).json({ error: "Administrator access required." });
  const issue = async (user, res) => {
    const token = jwt.sign(
      { jti: randomBytes(16).toString("hex") },
      config.secret,
      {
        subject: String(user.id),
        issuer: "lpu-navigator",
        audience: "lpu-web",
        expiresIn: "8h",
      },
    );
    await db.query(
      "INSERT INTO auth_tokens(user_id,token_hash,purpose,expires_at) VALUES($1,$2,'REFRESH',now()+interval '8 hours')",
      [user.id, hash(token)],
    );
    res.cookie("session", token, { ...config.cookie, maxAge: 8 * 3600 * 1000 });
  };
  const csrf = (req, res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    if (req.headers.origin && !config.origins.includes(req.headers.origin))
      return res.status(403).json({ error: "Request origin is not allowed." });
    const cookie = req.signedCookies.csrf,
      header = req.headers["x-csrf-token"];
    if (
      typeof cookie !== "string" ||
      typeof header !== "string" ||
      Buffer.byteLength(cookie) !== Buffer.byteLength(header) ||
      !timingSafeEqual(Buffer.from(cookie), Buffer.from(header))
    )
      return res
        .status(403)
        .json({ error: "Security token missing. Reload the page and retry." });
    next();
  };
  return { requireUser, admin, issue, csrf };
}
