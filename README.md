# LPU Smart Campus Navigator

A student-developed campus map and directory with source-aware search, PostgreSQL/PostGIS, graph routing, accounts, moderation and an extractive campus assistant. Not an official LPU application.

Built in the requested order: **Map data → Database → Map → Search → Backend → Routing → Auth → Admin → AI → ML → Deployment**.

## Run locally

Requires Node.js 22.12+ (tested with Node 24). From the repository root:

```sh
npm ci
npm run db:setup
npm run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173). The API listens on port 3001. Local PostgreSQL/PostGIS is embedded in `.local/postgres`, so Docker is not required. This experimental embedded mode is for development only. Production requires `DATABASE_URL` for a real PostgreSQL/PostGIS database.

The supplied historical image is available locally at `.local/historical-map.png`. It is intentionally excluded from Git, release packages and production. On a new checkout, copy a legitimately held reference image to that path to enable the local historical overlay. The directory remains usable without the image.

## Implemented

- Responsive React/TypeScript UI, Leaflet live map, source boundary, marker details and a separate historical-image mode.
- Search by names, partial/fuzzy terms, categories and historical map IDs, without merging repeated names.
- Browser geolocation, spatial nearby lookup, source links, location details and unavailable-data states.
- Express REST API backed by PostgreSQL/PostGIS with spatial, search and relationship constraints.
- Sourced graph routing with Dijkstra, blocked/one-way/accessibility constraints and distance/time estimates.
- Registration/login/logout, bcrypt hashes, JWT sessions with server-side revocation, CSRF, validation and rate limits.
- Favorites, recent searches, reports and pending submissions.
- Admin location/category/user management, moderation, evidence review and transaction-linked audit entries. Advanced source/facility/announcement/path records use a validated JSON editor.
- Extractive database-grounded assistant with optional FastAPI provider service.
- Real-data-only ML training pipeline; predictions disabled because no training observations exist.
- Docker and Render configuration, plus Vercel API-proxy configuration generator.

## Data and practical limits

The supplied historical legend contains **51 visible entries**, numbered 1–43, 45–47 and 51–55. IDs **44, 48, 49 and 50** are absent. Their current names and coordinates are unknown; the map is not to scale.

A separately sourced [OpenStreetMap campus snapshot](https://www.openstreetmap.org/way/422435593), retrieved 7 October 2026, provides **8 named features and 261 pedestrian segments**. Publicly mapped labels are retained verbatim, including the ambiguous name `voll`. Footprint markers are approximate `ST_PointOnSurface` derivatives, not entrance coordinates. Current operation/access remains unknown. Read [data provenance](docs/data-verification.md) and [OSM attribution](data/NOTICE.md).

**No campus entrance-to-path associations have been verified.** Building-to-building directions therefore correctly report unavailable until a reviewer adds evidenced entrances. The route engine is tested with isolated synthetic fixtures, never fabricated campus paths. Opening hours, indoor rooms and accessibility guarantees are not inferred.

The AI assistant uses deterministic retrieval rather than a configured generative LLM. ML is not trained or enabled. Password-reset email needs a configured delivery webhook. This is a working local implementation, not a claim of a production-ready or officially verified campus navigation service.

## Database and accounts

The initial schema is in `database/schema/001_initial.sql`. `npm run db:setup` initializes it and idempotently seeds historical and public-map data. Existing database edits are not overwritten by reseeding. To use native PostGIS locally, set `POSTGRES_PASSWORD`, run `docker compose up -d db`, then set `DATABASE_URL` in an ignored `.env` based on `.env.example`.

Register an account through the UI. With the API stopped in embedded mode, run `npm run db:admin` and enter the existing email address to promote it. There are no hardcoded admin credentials. Production requires separately managed database roles and an audited bootstrap procedure.

Current CSV import supports validation before mutation:

```sh
node --env-file-if-exists=.env scripts/import_locations.js path/to/current.csv
node --env-file-if-exists=.env scripts/import_locations.js path/to/current.csv --apply
```

Required CSV fields: `name,category,source_id,latitude,longitude`; optional `description,building_code`. Empty coordinates become SQL NULL. Sources must already exist and cannot be historical map sources. Imports reject duplicate names within the same source/building code, invalid categories, missing names and invalid/mismatched coordinates. Imports are transactional and start unverified.

## Configuration

Copy `.env.example` to `.env` when needed. `DATABASE_URL` selects native PostgreSQL; `PORT` selects the API port; `APP_ORIGIN` sets the exact frontend origin; `JWT_SECRET` must be random and at least 32 characters in production. `AI_SERVICE_URL` optionally enables the Python service. `RESET_DELIVERY_URL` and `RESET_DELIVERY_SECRET` configure a server-side HTTPS reset-mail webhook. Never expose these values through frontend environment variables.

## Test and build

```sh
npm run data:validate
npm test
npm run build
python -m unittest discover -s ai-service -p 'test_*.py'
python -m unittest discover -s ml-service -p 'test_*.py'
```

AI API tests require `ai-service/requirements.txt` and `httpx`. Python service setup, ML gates and verification limits are documented below. The Node suite uses fresh embedded PostgreSQL databases and does not touch the local campus database.

## Deployment target

Requested repository: [varshith1369/LPU-NAVIGATOR](https://github.com/varshith1369/LPU-NAVIGATOR). Requested frontend project: `lpu-campus-navigator` on Vercel. Requested API service: `lpu-campus-api` on Render, with Render Postgres/PostGIS.

The frontend is deployed at [LPU Campus Navigator](https://lpu-campus-navigator-lpu.vercel.app), with the [Render API](https://lpu-campus-api.onrender.com/api/health). GitHub main triggers provider deployments. Follow [deployment instructions](docs/deployment.md).

## Live location and missing GPS positions

On the map, choose **Start live location** and grant your browser permission. The device may combine GPS, Wi-Fi and mobile signals. A blue position marker and accuracy circle update as you move; **Follow me** keeps your position and a selected mapped destination in view, zooming closer as their separation decreases. Distances are straight-line estimates, not verified walking directions. Drag the map to pause following, or choose **Stop location** to clear the watch and position. Tracking pauses in hidden tabs and stops when leaving the map section. Movement is not uploaded to the campus API or stored persistently.

The map displays **only the live geographic map**. The historical image and its map mode have been removed at the user's request. All 55 reference entries remain in the directory, but historical image positions are never converted into invented GPS coordinates. The sourced Block 18 point displays **18**; other places keep their names until a number-to-GPS match can be verified. Selecting an unlocated directory reference keeps the live map visible and explains the missing position.

Select a historical entry, choose **I’m at this place · add GPS**, and capture a position at its public entrance. The purple numbered preview is local and unverified. Signed-in visitors can explicitly consent to share the coordinate, accuracy, capture time and entrance description with reviewers. The API requires a recent fix (five minutes), accuracy within 100 metres and coordinates within the campus vicinity; these checks do not establish authenticity. Suggestions remain pending until independently verified and entered through the administrative source/location workflow. Indoor GPS and device spoofing remain limitations.

## Project layout

```text
frontend/src/        React UI, map component and API client
backend/src/         API, database adapter, security, admin, routing and retrieval
backend/test/        API/database and graph tests
ai-service/         Optional FastAPI extractive provider and tests
ml-service/         Data gates, temporal evaluation and candidate training
database/schema/    PostgreSQL/PostGIS initial schema
data/               Historical CSVs, public OSM snapshots and provenance
scripts/            Validation, seeds, imports, admin bootstrap and Vercel setup
docs/               Architecture, API, routing, data policy and deployment
```

## Documentation

- [Architecture](docs/architecture.md), [database](docs/database.md), [API](docs/api.md)
- [Routing](docs/routing.md), [AI](docs/ai.md), [ML](docs/ml.md)
- [Data verification](docs/data-verification.md), [build stages](docs/roadmap.md)
- [Verification record](docs/verification.md), [deployment](docs/deployment.md)

## Screenshots

Browser-verified desktop and mobile views are captured in `docs/screenshots/` when available. These are development previews, not proof of official campus accuracy.

## Remaining work before campus use

Verify entrances and actual walking connectivity, current facilities/opening hours and accessibility. Replace the advanced admin JSON inputs with task-specific forms, expand administrative editing for announcements/path closures, add full screen-reader auditing, improve turn-by-turn instructions, run native/hosted database checks and configure backups, mail delivery and hosting. Indoor routing and crowd predictions remain gated on suitable evidence/data.
