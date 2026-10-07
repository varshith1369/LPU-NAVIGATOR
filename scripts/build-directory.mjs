import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { parse } from "csv-parse/sync";

// Keep reference numbering separate from geographically sourced map features.
const rows = parse(
  readFileSync(new URL("../data/lpu_locations.csv", import.meta.url), "utf8"),
  { columns: true, skip_empty_lines: true },
);
const publicMap = JSON.parse(
  readFileSync(new URL("../data/public-map.json", import.meta.url), "utf8"),
);
const directory = Array.from({ length: 55 }, (_, index) => {
  const number = index + 1;
  const row = rows.find((row) => Number(row.old_map_id) === number);
  return {
    id: `history-${number}`,
    old_map_id: number,
    name: row?.old_map_name ?? `Entry ${number} · name unavailable`,
    category: row?.proposed_category ?? "Unidentified",
    historical: true,
    verification_status: row ? "HISTORICAL_REFERENCE" : "UNVERIFIED",
    latitude: null,
    longitude: null,
    source_id: "historical-map-001",
    description: row
      ? "Listed on the supplied campus plan. Current name and GPS position have not been verified."
      : `Number ${number} is missing from the supplied map legend. Its name and location are unknown.`,
  };
});
const mapped = publicMap.places.map((place) => ({
  id: `snapshot-${place.source.id}`,
  name: place.name,
  category: place.category,
  historical: false,
  snapshot: true,
  verification_status: place.verification_status,
  latitude: place.latitude,
  longitude: place.longitude,
  source_id: place.source.id,
  source_url: place.source.url,
  source_title: place.source.title,
  description: place.description,
}));
const output = new URL("../frontend/src/data/campus.json", import.meta.url);
mkdirSync(new URL("../frontend/src/data/", import.meta.url), {
  recursive: true,
});
writeFileSync(
  output,
  JSON.stringify(
    {
      directory,
      mapped,
      boundary: publicMap.boundary,
      paths: publicMap.paths.map((path) => path.coordinates),
      attribution: publicMap.attribution,
      date: publicMap.retrieved_date,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `Prepared ${directory.length} directory entries and ${mapped.length} geographically sourced map features.`,
);
