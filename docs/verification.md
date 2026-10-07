# Verification record

Validation does not certify campus facts. The live-location update passes 34 Node tests and the TypeScript/Vite production build. The previous release also passed 6 Python AI/API tests, 1 ML data-gate test and historical data validation; those services are unchanged by this update.

- Historical CSV validation: 51 unique rows, missing IDs preserved, current fields empty.
- PostgreSQL/PostGIS schema: executed using experimental embedded PGlite/PostGIS.
- Backend: automated API and database integration tests for search, validation, geospatial distance, CSRF, roles, passwords/sessions, user isolation, moderation, grounded answers, optimistic editing, graph constraints, connected/disconnected routes and idempotent public-map import.
- Frontend: TypeScript compile and Vite production build. GPS tests simulate successive position fixes, watcher cleanup and late callbacks, permission denial, timeouts, stale/invalid fixes, straight-line distance and stable marker labels. Real outdoor movement, browser prompts, mobile layout and camera behavior still need device testing. The Microsoft Edge automation helper failed to start with a Windows sandbox setup error during this update; no visual verification is claimed.
- Python: extractive grounding and FastAPI contract tests; insufficient-data ML gate test. No model trained.
- Dependency audit: no reported npm vulnerabilities after updating csv-parse.
- Cloud baseline: Vercel frontend and Render API/PostgreSQL are deployed. The prior release was checked through the live frontend for health, directory, map context, CSRF and assistant API responses. GPS submissions are covered by local database integration tests for consent, precision, freshness, campus vicinity and prevention of automatic publication.

See the command output from `npm test`, `npm run build`, `npm run data:validate`, `python -m unittest discover -s ai-service -p 'test_*.py'` and `python -m unittest discover -s ml-service -p 'test_*.py'` for current results.
