# Live block numbers

Checked 9 October 2026. `numbered-buildings.json` contains 12 current block identifiers: 14, 18, 30, 32, 34, 36, 37, 38, 55, 55A, 56 and 57.

Google Maps place records supply named building locations, with their stable CID links and identifying address saved per entry. Generic university search results and nearby businesses were rejected: a café “near building 41” is not evidence for building 41's coordinates. The query number itself is never treated as evidence.

LPU's [Central Library catalogue](https://library.lpu.in/cgi-bin/koha/opac-library.pl?branchcode=MLB) identifies block 37. Its [Mittal School of Business workshop brochure](https://www.lpu.in/HRD/Broucher/CCT984.pdf) identifies block 14. Those identifiers are matched by institution name to the public map records. Existing OSM positions for block 18 and the library are retained to avoid duplicate places; all other additions use their individual Google place coordinates. Public listings can change and are not a campus survey.

The 55 historical legend entries remain a separate reference directory. They are not a list of 55 verified current blocks. For example, the historical entry 55 is “Academic Block 3”, while the current Google record identifies Mechanical Engineering as block 55. No coordinates are inferred from the old image.

The importer adds building codes and aliases without overwriting administrator codes or existing positions. It records the number evidence separately from position evidence and creates no entrances or walking paths. Number badges may be displaced slightly to avoid overlapping; a leader line and dot retain the actual building point. Selecting a number focuses its stored position.

Coverage is incomplete. Buildings without a corroborated block number keep their existing name label; unlocated historical entries remain unlocated.
