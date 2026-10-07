# REST API

All endpoints use JSON. Mutations need the signed `csrf` cookie and the `X-CSRF-Token` returned by `GET /api/csrf`. Authentication uses an HttpOnly session cookie; access roles are read from the database on each request. Production cookies require HTTPS. Requests use parameterized SQL and Zod schemas.

## Public reads and queries

- `GET /api/health`: database health, storage mode and ML gate.
- `GET /api/categories`: category IDs/names.
- `GET /api/locations` or `/api/locations/search`: `q`, `category`, `historical=true|false`, `offset`; up to 100 results. Historical identifiers use `history-<printed ID>` and are separate from database location IDs.
- `GET /api/locations/nearby`: required `latitude`, `longitude`; optional `radius` (meters, max 10,000), `category`. Up to 50 results, ordered by geodesic distance. Unknown opening/operating state does not mean open.
- `GET /api/locations/:id`: current record, source, facilities, active announcements.
- `GET /api/announcements`: active updates.
- `GET /api/map-context`: public campus polygon with attribution.
- `POST /api/routes`: `{from,to,accessible}` location IDs; 422 if no connected sourced route. GET equivalent accepts query parameters.
- `POST /api/assistant`: `{question}`; extractive answer, intent and source list.
- `GET /api/ml/status`: disabled until separately reviewed real-data training.

## Account APIs

`POST /api/auth/register` accepts `{email,password}`. Student role is assigned server-side; ignored extra role fields cannot elevate access. Login accepts the same fields. Logout revokes the session server-side. Passwords need at least 12 characters and at most 72 UTF-8 bytes for bcrypt. Access sessions expire after 8 hours; users sign in again rather than having a silent refresh flow.

`POST /api/auth/forgot-password` accepts `{email}`. It uses the optional server-only reset delivery webhook and returns a generic response. `POST /api/auth/reset-password` accepts `{token,password}`, consumes the hashed token atomically and revokes existing sessions.

`GET /api/profile`, `GET/POST /api/favorites`, `DELETE /api/favorites/:id`, `GET/POST /api/history`, `GET/POST /api/reports`, and `POST /api/submissions` require a session. Favorites POST accepts `{location_id}`; history POST accepts `{query}` and retains 25 rows per user. Reports need `{location_id,report_type,description}`. Submissions need `{description}` and optionally a historical ID or suggested coordinate pair. Neither form publishes data directly.

## Administrator APIs

All `/api/admin/*` require ADMIN, with audit events written in the mutation transaction.

- `GET /dashboard`: counts, locations, users, pending moderation and recent audit records; bounded lists.
- `POST /sources`: `{id,type,title,url?,notes?}`. A historical source cannot authorize current coordinates.
- `POST /categories`: `{name}`.
- `POST /locations`: `{name,category_id,source_id,description?,latitude?,longitude?,status?,opening_hours?,phone?,website?,building_code?}`. Unknown coordinates are JSON null. New records start unverified.
- `PUT /locations/:id`: same body plus the expected `version`. Returns 409 on stale edits. Changes invalidate verification.
- `DELETE /locations/:id`: audited deletion; UI requires confirmation.
- `POST /verification`: `{location_id,source_id,field,verification_status,claim}`; `field` is `identity` or `position`. Official/public status requires an appropriate evidence source.
- `PATCH /reports/:id` and `/submissions/:id`: `{status,admin_comment,apply?}`. APPROVED requires `{location_id,version,name,source_id}` in `apply`, applied atomically. For other corrections use the specific audited mutation, then mark the review RESOLVED.
- `PATCH /users/:id`: `{role}`; revokes that user's sessions and prevents self-demotion.
- `POST /announcements`: `{title,description,start_date,end_date?,location_id?,priority?}`; ISO UTC timestamps.
- `POST /facilities`: `{name,location_id,source_id}`.
- `POST /path-nodes`: `{latitude,longitude,source_id,verification_status?}`.
- `POST /path-edges`: `{from_node_id,to_node_id,coordinates,source_id,verification_status?,accessible?,accessibility_source_id?,blocked?,one_way?,road_type?}`. Coordinates are GeoJSON `[longitude,latitude]`; geometry must meet its nodes. Accessibility defaults to null.
- `POST /entrances`: `{location_id,node_id,source_id,name?}`; only attach an evidenced entrance. Never connect a footprint marker to a walkway merely because it is nearby.

`GET /api/admin/path-edges?offset=0` lists bounded path records. `PATCH /api/admin/path-edges/:id` accepts a current `source_id` and at least one of `blocked`, `one_way`, `accessible` to record sourced changes. `DELETE /api/admin/path-edges/:id` removes an edge with an audit entry. `PUT /api/admin/announcements/:id` replaces the validated announcement fields; DELETE removes it. The advanced editor supports these update/delete operations with a record ID and deletion confirmation.

Use 400 for validation, 401 for missing/expired session, 403 for authorization/CSRF, 404 for absent records, 409 for duplicates or stale edits, and 422 for unavailable routing. Unexpected errors return a generic 500 without SQL or credential disclosure.
