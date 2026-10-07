# Proposed architecture

## Runtime boundaries

React + Vite + TypeScript renders a responsive map, directory, location details, directions, account and administrator screens. Leaflet provides geographic navigation. A separate historical mode can display the supplied site plan only if its reuse is permitted; the private source image is not automatically published. Both modes visibly distinguish current from historical information.

The frontend uses a typed `CampusRepository` interface. During the Map and Search stages, a local adapter reads the checked historical dataset; geographic points stay absent. During the Backend stage an HTTP adapter replaces it without changing search and map components. This honors the requested frontend-before-backend order without treating test data as production facts.

An Express REST API owns validation, pagination, authentication, permission checks, moderation, routing requests and all database access. PostgreSQL/PostGIS stores current locations and independently sourced geography. pg_trgm supports fuzzy aliases/names; spatial indexes support nearby queries.

The route service reads a reviewed graph from PostGIS. Dijkstra is the initial safe shortest-path implementation. A* is enabled only with an admissible heuristic under the chosen edge cost. Distance, walking time and accessibility use distinct costs/constraints. Never connect buildings with invented straight-line walking routes.

The Python FastAPI assistant calls narrow read-only retrieval endpoints. It answers from dated evidence and source citations, rejects unsupported premises and returns an explicit unknown when retrieval is insufficient. The provider adapter is optional; deterministic retrieval should work without an API key. Route and nearest-facility questions use the route/spatial services, not model-generated coordinates. Campus source text is data, never executable instructions.

The ML service is deferred until consented, timestamped observations and sufficient coverage exist. Use a temporal validation split, a baseline and class-sensitive metrics. No synthetic crowd model is shipped merely to populate the UI.

## Intended monorepo

```text
LPU/
  frontend/src/
    components/ pages/ layouts/ hooks/ services/ utils/ context/ assets/
  backend/src/
    controllers/ routes/ middleware/ models/ services/ utils/ config/
  ai-service/
    app/ services/ rag/ models/
  ml-service/
    data/ training/ inference/ models/
  database/
    schema/ migrations/ seed/
  data/
    lpu_locations.csv lpu_categories.csv lpu_paths.csv lpu_facilities.csv
    sources.json
  docs/
    architecture.md data-verification.md database.md roadmap.md
  scripts/
    prepare-historical-data.mjs validate-data.mjs
  README.md
```

The implemented layout is listed in the README. Functionality is grouped into focused modules instead of creating empty directories for every proposed layer.

## Proposed API contract

`GET /api/locations`, `/api/locations/search`, `/api/locations/nearby`, `/api/locations/:id`, `/api/categories`, `/api/announcements` and `/api/historical-locations` serve public reads. Register static location routes before `:id`. Nearby requires range-checked coordinates, a capped radius and only usable geographic records.

`POST /api/routes` accepts origin/destination IDs and an accessibility preference. No path yields a documented unavailable response, not a fabricated polyline. Unknown accessible edges are excluded for accessibility-required requests.

`POST /api/auth/register`, `/login`, `/logout`, `/forgot-password`, `/reset-password` and `GET /api/profile` handle accounts. Self-registration cannot choose ADMIN or FACULTY; faculty eligibility needs verification. Prefer an HttpOnly Secure SameSite cookie for session tokens with CSRF protection on mutations, short-lived access and revocable refresh sessions. Password reset responses must not reveal account existence.

Authenticated favorites, search history, reports and submissions are user-scoped. Admin mutation endpoints require both authenticated role checks and audit logging; route-node/edge changes need the same protection. Approving a submission and applying its change must be atomic. Use optimistic locking to prevent overwriting concurrent edits.

All SQL is parameterized. Validate request schemas, paginate reads, limit request sizes, configure exact CORS origins, rate-limit sensitive actions and redact credentials from logs. Hosting and package versions will be checked against official documentation at implementation time.
