# Deployment

Deployment targets: repository `varshith1369/LPU-NAVIGATOR`, Vercel project `lpu-campus-navigator` at `https://lpu-campus-navigator-lpu.vercel.app`, and Neon PostgreSQL 17 in Singapore. `vercel.json` routes `/api/*` to `api/index.mjs` in Vercel; the frontend and API use the same origin. The previous Render service is retained temporarily for rollback only.

## Vercel + Neon free deployment

The Vercel Node function exports the existing Express app, using a small shared PostgreSQL pool with Vercel pool lifecycle handling. Only the local development/test path loads PGlite. Set `DATABASE_URL` to Neon's pooled TLS connection string, `JWT_SECRET` to the existing signing secret, and `APP_ORIGIN` to the canonical HTTPS site. Keep the same signing secret during migration to preserve sessions. The API runs in `sin1` beside the Singapore database. Shared database counters preserve rate limits across function instances; only the immediate hosting proxy is trusted.

Run migrations before serving requests; never seed in a function invocation. For migration, first set `MIGRATION_READ_ONLY=true` on the old API and redeploy it. After verifying its write endpoints return 503, run `scripts/transfer-database.mjs` with source and destination connection strings in environment variables. It creates an ignored local backup, transfers records in dependency order, restores identity sequences, and verifies all copied values in a transaction. It refuses populated destination application tables. Verify the preview before switching production, then close temporary source database network access. Do not enable maintenance on the new API.

Free hosting has quotas, not guaranteed always-on capacity. Neon suspends idle compute and automatically resumes it on requests; Vercel functions may also cold-start. Frequent chat polling consumes compute and function quota. Monitor usage before wider campus adoption. Vercel Hobby is for personal, non-commercial projects.

The frontend bundles 56 mapped places with 55 building labels, public map boundaries and mapped paths. Approximate campus-plan positions retain their provenance. The separate historical directory has 55 references: 51 named entries and four explicitly unidentified entries. The API refreshes mapped place details; an initial failed refresh keeps the bundled map visible. Background map tiles still require an internet connection.

## Single-service deployment

`Dockerfile` builds the frontend and serves it alongside the Express API. `render.yaml` provisions a free web service and PostgreSQL 17 database in Singapore. The container initializes the schema and source data before starting the API; free Render services do not support a separate pre-deploy command. Startup exits if initialization fails. Supply a cryptographically random JWT secret and the exact HTTPS application origin. Production refuses embedded storage and missing secrets. The database needs permission to enable PostGIS and pg_trgm during initial setup. A separate migration owner and restricted runtime role remain production hardening work.

Render's free API can sleep when idle, and its free database expires 30 days after creation. Upgrade the database for ongoing use. The deployed database's external connections are restricted; the API uses its private internal connection.

The user requested removal of the historical plan. Its public image asset and UI mode are removed; only the live geographic map is displayed. Historical numbering remains directory reference data, and must not be projected onto GPS positions without evidence. Current entrances and access conditions still require verification for door-to-door navigation.

## Legacy alternative: Vercel frontend + separate API

After provisioning the actual backend, run `node scripts/configure-vercel.mjs https://<actual-backend-host>` with its real origin (not the angle-bracket example). Deploy the repository using `npm run build` and output directory `dist`. The generated rewrite proxies `/api` through the frontend origin, keeping HttpOnly cookies same-origin. Set API `APP_ORIGIN` to the actual Vercel/custom HTTPS origin. Check proxy headers and rate limiting with your platform before exposing login publicly; the current API does not blindly trust X-Forwarded-For.

Configure a server-side HTTPS password-reset delivery webhook if password resets must send email. No messages are sent during development. The UI reports the dependency without claiming delivery.

## Before a production launch

- Run migrations and integration tests against the actual PostgreSQL/PostGIS version; local integration tests use experimental embedded PostGIS.
- Verify TLS, secure cookies, allowed origins, rate limits behind the selected proxy and backup restoration.
- Configure separate database roles; deny modification of audit entries to the runtime account.
- Re-check dependency advisories and pin image digests and Python dependency lockfiles for release.
- Confirm current campus evidence and path access restrictions, map/image reuse permissions and OSM tile-use requirements.
- Run mobile, keyboard and screen-reader checks; audit the advanced admin JSON editor before wide administrator use.

Provider documentation checked during implementation: [Vite](https://vite.dev/guide/), [React Leaflet](https://react-leaflet.js.org/docs/start-installation/), [PostGIS](https://postgis.net/documentation/getting_started/), [PGlite extensions](https://pglite.dev/extensions/), [Render Postgres extensions](https://render.com/docs/postgresql-extensions), [Render Blueprint specification](https://render.com/docs/blueprint-spec), and [Vercel external rewrites](https://vercel.com/docs/routing/rewrites). Render supports PostGIS and pg_trgm; Vercel supports the external API rewrite used here. Hosting configuration must be exercised on the selected account before being described as deployed.
