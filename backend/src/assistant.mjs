export function detectIntent(question) {
  const q = question.toLowerCase();
  if (/nearest|nearby|closest/.test(q)) return "NEAREST_FACILITY";
  if (/directions|route|how.*get|from.+to/.test(q)) return "DIRECTIONS";
  if (/hours|open|close/.test(q)) return "OPENING_HOURS";
  if (/announce|updates/.test(q)) return "ANNOUNCEMENT";
  if (/historical|old map/.test(q)) return "CAMPUS_INFORMATION";
  return "LOCATION_SEARCH";
}
export async function answerQuestion(db, question) {
  const intent = detectIntent(question);
  const unknown = "I don't have verified information about that location yet.";
  if (intent === "DIRECTIONS")
    return {
      intent,
      answer:
        "Choose a starting point and destination in Directions. Routes require sourced campus paths; I cannot infer them from the historical image.",
      sources: [],
    };
  if (intent === "NEAREST_FACILITY")
    return {
      intent,
      answer:
        "Use the live map location control, then a nearby search. A nearest result requires your position and mapped current facilities; the historical image cannot establish distance.",
      sources: [],
    };
  if (intent === "ANNOUNCEMENT") {
    const items = (
      await db.query(
        "SELECT title,description FROM announcements WHERE start_date<=now() AND (end_date IS NULL OR end_date>now()) ORDER BY priority DESC LIMIT 5",
      )
    ).rows;
    return {
      intent,
      answer: items.length
        ? items.map((a) => `${a.title}: ${a.description}`).join("\n")
        : "There are no active announcements in the campus database.",
      sources: [],
    };
  }
  const words = question.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const terms = words.filter(
    (w) =>
      ![
        "where",
        "what",
        "which",
        "is",
        "are",
        "the",
        "a",
        "an",
        "in",
        "on",
        "at",
        "of",
        "to",
        "can",
        "i",
        "find",
        "tell",
        "me",
        "about",
        "lpu",
        "campus",
        "please",
        "does",
        "have",
        "when",
        "it",
      ].includes(w),
  );
  const query = terms.join(" ");
  const items = query
    ? (
        await db.query(
          `SELECT l.name,l.description,l.opening_hours,l.verification_status,s.title,s.url FROM locations l JOIN sources s ON s.id=l.source_id WHERE l.verification_status IN ('VERIFIED_OFFICIAL','VERIFIED_PUBLIC') AND (to_tsvector('english',l.name||' '||coalesce(l.description,'')) @@ plainto_tsquery('english',$1) OR l.name ILIKE $2) LIMIT 5`,
          [query, `%${query}%`],
        )
      ).rows
    : [];
  if (items.length)
    return {
      intent,
      answer: items
        .map((p) =>
          intent === "OPENING_HOURS"
            ? `${p.name}: ${p.opening_hours ? JSON.stringify(p.opening_hours) : "Verified opening hours are not recorded."}`
            : `${p.name}${p.description ? `: ${p.description}` : ""}`,
        )
        .join("\n"),
      sources: items.map((p) => ({
        title: p.title,
        url: p.url,
        verification_status: p.verification_status,
      })),
    };
  if (intent === "CAMPUS_INFORMATION")
    return {
      intent,
      answer:
        "The supplied historical map contains 51 visible legend entries. Four numbers are absent: 44, 48, 49 and 50. These records do not establish current names, GPS coordinates, or walking paths.",
      sources: [
        {
          title: "User-supplied historical LPU map",
          verification_status: "APPROXIMATE",
        },
      ],
    };
  return { intent, answer: unknown, sources: [] };
}
