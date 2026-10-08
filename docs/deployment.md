# Deployment

Deployment targets: repository `varshith1369/LPU-NAVIGATOR`, Vercel project `lpu-campus-navigator` at `https://lpu-campus-navigator-lpu.vercel.app`, and Render API `lpu-campus-api` at `https://lpu-campus-api.onrender.com`. The API uses managed PostgreSQL 17 in Singapore. `vercel.json` must be included in every frontend deployment so `/api/*` reaches Render rather than returning Vercel 404 pages.

The frontend bundles the numbered campus directory (1–55), public map boundary, mapped paths, and eight sourced map features. All 55 directory numbers remain searchable without the API: 51 have names in the supplied legend and 44, 48, 49, 50 are explicitly unidentified. Reference entries have no invented GPS coordinates. The API refreshes mapped place details; a failed refresh keeps the bundled map and directory visible and displays a reconnect notice. Background map tiles still require an internet connection.

## Single-service deployment

`Dockerfile` builds the frontend and serves it alongside the Express API. `render.yaml` provisions a free web service and PostgreSQL 17 database in Singapore. The container initializes the schema and source data before starting the API; free Render services do not support a separate pre-deploy command. Startup exits if initialization fails. Supply a cryptographically random JWT secret and the exact HTTPS application origin. Production refuses embedded storage and missing secrets. The database needs permission to enable PostGIS and pg_trgm during initial setup. A separate migration owner and restricted runtime role remain production hardening work.

Render's free API can sleep when idle, and its free database expires 30 days after creation. Upgrade the database for ongoing use. The deployed database's external connections are restricted; the API uses its private internal connection.

The historical source image stays private in `.local` and is excluded from builds. Production historical mode displays a source-unavailable notice until an appropriately licensed map is added through a reviewed publication workflow; the historical directory remains usable. Current GPS data and path data are still required for real navigation.

## Vercel frontend + separate API

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
