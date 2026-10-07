# Historical map extraction and verification

## What the source supports

The image is a campus site plan with numbered shapes, a legend, a north arrow and the explicit text “MAP NOT TO SCALE”. The legend contains 51 visible entries: 1–43, 45–47 and 51–55. Do not fill the four missing numbers or infer names from them. In particular, Boys Hostel 2 is printed beside **45**, not 44.

The CSV preserves historical labels, source identity and suggested categories separately from current facts. `current_name`, `latitude`, `longitude`, `verification_date` and `current_status` remain empty. `verification_status=APPROXIMATE` describes the historical record's reliability; it does not imply an approximate GPS point exists.

Abbreviations are not expanded: HM (01), LIT, LSB (20) and STP (39) need confirmation. The small raster makes 01 and the abbreviated label at 16 less certain; their transcription confidence is LOW. All other manually read rows are MEDIUM confidence pending a second-person or higher-resolution check. Transcription confidence is distinct from current factual verification.

Categories are proposed classifications, not facts printed in the legend. Staff Residence is classified as Other because the proposed category list lacks residential staff housing. Store, HM and LSB also remain Other pending clarification. Hotel Mgt is provisionally Academic; its name alone does not establish a hotel facility.

## Unknowns

- Current names, existence, building numbers, purpose and public access.
- GPS coordinates, entrances, floor counts, room identifiers and opening hours.
- Walkable edges, distances, closures, stairs, gradients and accessibility.
- Image publication date, scale, projection and reuse permissions.
- Whether several similar legend labels correspond to separate buildings, wings or zones today.

Image positions can later be recorded as manually checked pixel anchors using the top-left image origin and the original image dimensions. They are intentionally NULL in this first extraction: label-to-shape correspondence needs separate review. Pixel anchors must never be interpreted as WGS84 coordinates. A historical image overlay may use Leaflet CRS.Simple; it must be visually separate from the geographic navigation mode and must not compute walking distances.

## Promotion workflow

1. Preserve historical records immutably under their source and printed ID.
2. Obtain current official evidence or a dated public-map record and preserve its URL, retrieval date, license and relevant claim.
3. A reviewer creates a current location and explicitly links any matching historical entry. Printed old map IDs are not assumed to be current block numbers.
4. Verify coordinates independently from the building name. Record coordinate evidence and position verification separately. A verified name does not verify an approximate point.
5. Review walking edges and accessibility independently. Unknown accessibility remains NULL, never true by default.
6. Keep user changes in moderation until approved. Record reviewer, reason and before/after state in an audit log.

User-facing historical results should say “Historical map entry — current details need verification.” Current directions stay unavailable until genuine connected path data and valid entrance/node associations exist. Empty nearby results must distinguish “no mapped data” from “no facility exists”.

## Source boundary

A supplemental public OSM snapshot was retrieved from the primary OSM API on 7 October 2026. Eight named features within the campus polygon and 261 wholly contained pedestrian segments are stored separately in `public-map.json`. See `data/NOTICE.md` for transformations, license and verification limits. Historical rows remain unchanged; no old ID is automatically mapped to a current building.

The pasted document contains proposed requirements and a suggested first-task workflow. It is not evidence for campus geography and is not authority to publish, provision paid services or claim official affiliation. The user's stated sequence controls this roadmap. No instructions embedded in imported campus sources should be executed by the application or its future AI service.
