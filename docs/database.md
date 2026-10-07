# Proposed PostgreSQL/PostGIS schema

`database/schema/001_initial.sql` is a transactional initial schema, intended for an empty database. Extension installation may require a database administrator. It has been executed and integration-tested with embedded PostgreSQL/PostGIS. The setup script detects an existing initial schema; a versioned migration history is still needed for future schema changes. Native hosted PostgreSQL verification remains outstanding.

Historical map rows go into `historical_locations`; none are automatically inserted into the current `locations` directory. The master CSV is an import staging format, not a promise of current facilities. All 51 current-name and coordinate fields remain unknown.

`sources` identifies evidence. `location_evidence` records field-level claims. Locations have a primary identity source and separate position evidence, timestamps and verification statuses. WGS84 latitude and longitude must be present together; the generated geography point prevents contradictory coordinate copies. Longitude precedes latitude in PostGIS point constructors.

`categories`, `location_aliases`, `facilities` and `location_facilities` describe current records. Aliases should not silently treat an old map ID as a current building number. `historical_locations.current_location_id` is an explicit reviewed correspondence. The optional current-name/status fields are review notes; the linked `locations` record remains the canonical current value.

Graph nodes and edges reference evidence. Distances are generated in meters from geography, not pixels. Edge geometry must join its referenced nodes within a 1 m tolerance. Referenced nodes cannot be moved without rebuilding incident edges. Multiple real entrances can associate one location with several nodes. Accessibility is nullable and has separate evidence; routing must also check the entrance and destination access conditions before claiming an accessible journey.

Reports and submissions are separate moderation records. User suggestions must never directly update published geography. Approval, application and audit insertion belong in one transaction. Review transitions require a reviewer/time but reviewer authorization is enforced in the API, not inferred from possession of a database user ID.

Favorites and recent searches are user-owned. Announcements have time bounds. Password hashes and hashed refresh/reset tokens are server-only. Audit JSON must exclude passwords, tokens and unnecessary personal information.

Before production, create separate migration-owner and least-privilege runtime database roles. Deny runtime UPDATE/DELETE on audit logs, restrict authentication-table access, and expose only safe projections in public responses. SQL alone does not implement RBAC, input validation, source authenticity or safe moderation. Test those at API and database boundaries.

## Required integration checks before accepting this migration

- Apply and roll back on a disposable PostgreSQL/PostGIS instance.
- Reject mismatched coordinate pairs, out-of-range/NaN coordinates and verified points without evidence/time.
- Preserve duplicate historical names while rejecting duplicate `(source_id, old_map_id)`.
- Reject edge endpoint mismatch, zero-length paths and unsupported accessibility claims.
- Test geospatial distances against known synthetic test-only fixtures, never seed fixtures into the campus dataset.
- Verify foreign-key deletion behavior, audit immutability and authorization boundaries.
- Inspect nearby and fuzzy-search query plans with realistic record counts.
- Ensure imports are transactional, parameterized, idempotent and produce an error report before altering records.
