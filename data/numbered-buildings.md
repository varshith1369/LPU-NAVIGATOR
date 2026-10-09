# Live block numbers

Checked 9 October 2026. `numbered-buildings.json` contains **55 distinct source-backed map labels**: 53 visibly numbered features in LPU's induction plan plus separately sourced blocks 39 and 55A. This is not a claim that today's campus has every integer block from 1 through 55. Published numbering includes suffixes and gaps.

23 labels have corroborating public listings or named-building references. 32 retain an approximate campus-plan classification. The [official induction plan](https://www.lpu.in/events/freshmeninduction/imgs/event_location.jpg) is undated, and occupants or signage may have changed. Brown dashed markers and the detail card identify the approximate entries. Source names are retained as evidence rather than presented as confirmed current occupants.

`plan-georeference-input.json` records manually transcribed image coordinates and independent geographic controls. Running `node scripts/georeference-campus-plan.mjs` regenerates `plan-building-positions.json`. The affine fit uses 11 controls; ten independent holdout locations have 23.7 m RMS disagreement. This is a validation statistic, not a guaranteed accuracy radius for every marker. All 53 projected positions lie inside the mapped campus boundary.

`plan-footprint-review.json` records 27 visually matched OSM footprints. The residential rows needed particular care: their diagram positions differ from the actual outlines. Corrections use the explicitly matched footprint, not an automatic nearest-building assignment. All such positions remain approximate. Direct public coordinates and existing OSM positions take precedence where available.

Corroborated modern aliases replace plan codes 3A, 3B and 8A with 3, 4 and 6; the original plan codes remain searchable and appear in details. Existing imported buildings are merged by their source identifier so the map does not add duplicate LIT, Pharmacy, Management or Mall markers. Unrelated administrator edits are preserved.

Google Maps place records supply named building locations, with their stable CID links and identifying address saved per entry. Generic university search results and nearby businesses were rejected: a café “near building 41” is not evidence for building 41's coordinates. The query number itself is never treated as evidence.

LPU's [Central Library catalogue](https://library.lpu.in/cgi-bin/koha/opac-library.pl?branchcode=MLB) identifies block 37. Its [Mittal School of Business workshop brochure](https://www.lpu.in/HRD/Broucher/CCT984.pdf) identifies block 14. Those identifiers are matched by institution name to the public map records. Existing OSM positions for block 18 and the library are retained to avoid duplicate places; all other additions use their individual Google place coordinates. Public listings can change and are not a campus survey.

The 55 historical legend entries remain a separate reference directory. They are not a list of 55 verified current blocks. For example, the historical entry 55 is “Academic Block 3”, while the current Google record identifies Mechanical Engineering as block 55. No coordinates are inferred from the old image.

The importer adds building codes and aliases without overwriting administrator codes or existing positions. It records the number evidence separately from position evidence and creates no entrances or walking paths. Number badges may be displaced slightly to avoid overlapping; a leader line and dot retain the actual building point. Selecting a number focuses its stored position.

The historical image remains removed. Its separate 55-entry directory remains available without invented coordinates. The live map contains 55 numbered locations and one pre-existing unnamed-number sports feature. Plan legend entries 40 and 52 have no confidently located source circle and were not fabricated. Neither plan-derived points nor direct public listing points establish entrances or accessible walking routes.
