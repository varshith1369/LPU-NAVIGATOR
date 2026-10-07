import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";

// Transcribed from the supplied legend, not a present-day campus directory.
const rows = [
  [1, "HM", "Other"],
  [2, "Campus Cafe", "Food"],
  [3, "Auditorium", "Entertainment"],
  [4, "LIT Engineering", "Academic"],
  [5, "LIT Pharmacy", "Academic"],
  [6, "LIT Architecture", "Academic"],
  [7, "LIT Pharmacy", "Academic"],
  [8, "Shri Baldev Raj Mittal Hospital", "Healthcare"],
  [9, "Girls Hostel 1", "Hostel"],
  [10, "Girls Hostel 2", "Hostel"],
  [11, "Girls Hostel 3", "Hostel"],
  [12, "Girls Hostel 4", "Hostel"],
  [13, "LIT Polytechnic", "Academic"],
  [14, "Business Block", "Academic"],
  [15, "Lovely Mall", "Shopping"],
  [16, "Hotel Mgt", "Academic"],
  [17, "Mall - II", "Shopping"],
  [18, "Education", "Academic"],
  [19, "Auditorium", "Entertainment"],
  [20, "LSB", "Other"],
  [21, "Girl Hostel 5", "Hostel"],
  [22, "Girl Hostel 6", "Hostel"],
  [23, "Auditorium", "Entertainment"],
  [24, "Auditorium", "Entertainment"],
  [25, "Engineering", "Academic"],
  [26, "Engineering", "Academic"],
  [27, "Engineering", "Academic"],
  [28, "Engineering", "Academic"],
  [29, "Engineering", "Academic"],
  [30, "Chancellor Office", "Administrative"],
  [31, "Administrative Block", "Administrative"],
  [32, "Administrative Block", "Administrative"],
  [33, "Engineering", "Academic"],
  [34, "Engineering", "Academic"],
  [35, "Engineering", "Academic"],
  [36, "Engineering", "Academic"],
  [37, "Engineering", "Academic"],
  [38, "Engineering", "Academic"],
  [39, "STP", "Utility"],
  [40, "Store", "Other"],
  [41, "Staff Residence", "Other"],
  [42, "Staff Residence", "Other"],
  [43, "Boys Hostel 1", "Hostel"],
  [45, "Boys Hostel 2", "Hostel"],
  [46, "Boys Hostel 3", "Hostel"],
  [47, "Boys Hostel 4", "Hostel"],
  [51, "Boys Hostel 5", "Hostel"],
  [52, "Boys Hostel 6", "Hostel"],
  [53, "Academic Block 1", "Academic"],
  [54, "Academic Block 2", "Academic"],
  [55, "Academic Block 3", "Academic"],
];
const categories = [
  "Academic",
  "Administrative",
  "Hostel",
  "Library",
  "Healthcare",
  "Food",
  "Shopping",
  "Banking",
  "Sports",
  "Transport",
  "Parking",
  "Religious",
  "Security",
  "Utility",
  "Entertainment",
  "Student Services",
  "Other",
];
const field = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
const csv = (records) =>
  records.map((row) => row.map(field).join(",")).join("\n") + "\n";
mkdirSync(new URL("../data/", import.meta.url), { recursive: true });
const header = [
  "source_id",
  "source",
  "old_map_id",
  "old_map_name",
  "proposed_category",
  "current_name",
  "current_status",
  "latitude",
  "longitude",
  "verification_status",
  "verification_date",
  "transcription_confidence",
  "image_x_px",
  "image_y_px",
  "notes",
];
writeFileSync(
  new URL("../data/lpu_locations.csv", import.meta.url),
  csv([
    header,
    ...rows.map(([id, name, category]) => [
      "historical-map-001",
      "OLD_LPU_MAP",
      id,
      name,
      category,
      null,
      null,
      null,
      null,
      "APPROXIMATE",
      null,
      [1, 16].includes(id) ? "LOW" : "MEDIUM",
      null,
      null,
      [1, 16, 20, 39].includes(id)
        ? "Abbreviation retained; requires transcription and meaning review."
        : "Historical label only; category inferred; current identity and geography unverified.",
    ]),
  ]),
);
writeFileSync(
  new URL("../data/lpu_categories.csv", import.meta.url),
  csv([["id", "name"], ...categories.map((name, i) => [i + 1, name])]),
);
writeFileSync(
  new URL("../data/lpu_paths.csv", import.meta.url),
  csv([
    [
      "id",
      "from_node_id",
      "to_node_id",
      "geometry_wkt",
      "source_id",
      "verification_status",
      "accessible",
      "blocked",
      "one_way",
      "road_type",
    ],
  ]),
);
writeFileSync(
  new URL("../data/lpu_facilities.csv", import.meta.url),
  csv([["id", "location_id", "name", "source_id", "verification_status"]]),
);
const imageArgument = process.argv.indexOf("--image");
const sourcePath =
  imageArgument >= 0
    ? process.argv[imageArgument + 1]
    : ".local/historical-map.png";
// Only the initial author needs the attachment. Existing manifests stay usable elsewhere.
if (process.argv.includes("--record-source")) {
  writeFileSync(
    new URL("../data/sources.json", import.meta.url),
    JSON.stringify(
      [
        {
          id: "historical-map-001",
          type: "OLD_LPU_MAP",
          title: "User-supplied historical LPU campus map",
          local_reference: ".local/historical-map.png (not distributed)",
          sha256: createHash("sha256")
            .update(readFileSync(sourcePath))
            .digest("hex"),
          received_date: "2026-10-07",
          publication_date: null,
          width_px: 559,
          height_px: 787,
          scale: "NOT_TO_SCALE",
          georeferenced: false,
          license: null,
          visible_legend_entries: 51,
          missing_legend_ids: [44, 48, 49, 50],
          notes:
            "Do not redistribute the image or treat the map as current without further review.",
        },
      ],
      null,
      2,
    ) + "\n",
  );
}
console.log(
  `Prepared ${rows.length} historical records. No geographic coordinates or walking paths generated.`,
);
