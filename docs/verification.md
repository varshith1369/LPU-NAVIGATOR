# Verification record

Validation is performed locally; it does not certify a production release or campus facts. Current run: 25 Node tests, 6 Python AI/API tests and 1 ML data-gate test pass. The production build and historical data validation pass.

- Historical CSV validation: 51 unique rows, missing IDs preserved, current fields empty.
- PostgreSQL/PostGIS schema: executed using experimental embedded PGlite/PostGIS.
- Backend: automated API and database integration tests for search, validation, geospatial distance, CSRF, roles, passwords/sessions, user isolation, moderation, grounded answers, optimistic editing, graph constraints, connected/disconnected routes and idempotent public-map import.
- Frontend: TypeScript compile and Vite production build; browser checks of map source image, live map, search/details, assistant unknown response and mobile map/list layout.
- Python: extractive grounding and FastAPI contract tests; insufficient-data ML gate test. No model trained.
- Dependency audit: no reported npm vulnerabilities after updating csv-parse.
- Cloud: not deployed; Docker is unavailable locally, so the image and real hosted PostgreSQL integration still need execution on the target platform.

See the command output from `npm test`, `npm run build`, `npm run data:validate`, `python -m unittest discover -s ai-service -p 'test_*.py'` and `python -m unittest discover -s ml-service -p 'test_*.py'` for current results.
