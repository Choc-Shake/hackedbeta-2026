// js/search.js — building search (UI).
//
// searchBuildings(query, lat, lon) returns the matching buildings, best match
// first: [{ building, distance }]. distance is metres to the closest entrance,
// or null when we don't have a GPS position yet.
// Needs: js/buildings.js and js/distance.js loaded first.

// Make text easy to compare: lower case, no accents, no punctuation.
// "Nîpisîy House" -> "nipisiy house", "Students' Union" -> "students union"
function normalizeText(text) {
  return text.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // strip accents
    .replace(/['’.]/g, '')                              // drop apostrophes and dots
    .replace(/[^a-z0-9]+/g, ' ')                        // anything else becomes a space
    .trim();
}

// How well does one building match what the user typed? 0 = not at all.
function matchScore(building, q) {
  const name = normalizeText(building.name);
  const code = building.code ? normalizeText(building.code) : '';
  const aliases = building.aliases.map(normalizeText);
  const words = name.split(' ');
  // First letters of the big words: "Central Academic Building" -> "cab"
  const initials = words.filter((w) => !['of', 'and', 'for', 'the'].includes(w)).map((w) => w[0]).join('');

  if (code === q) return 100;                                  // typed the exact code
  if (aliases.includes(q)) return 90;                          // exact nickname
  if (code && code.startsWith(q)) return 80;                   // start of the code
  if (name.startsWith(q)) return 70;                           // start of the name
  if (words.some((w) => w.startsWith(q))) return 60;           // start of any word in the name
  if (aliases.some((a) => a.startsWith(q))) return 55;         // start of a nickname
  if (initials.startsWith(q) && q.length >= 2) return 50;      // initials
  if (name.includes(q)) return 40;                             // anywhere in the name
  return 0;
}

function searchBuildings(query, lat, lon) {
  const q = normalizeText(query || '');
  const havePosition = lat != null && lon != null;
  const results = [];

  for (const building of BUILDINGS) {
    const score = q === '' ? 1 : matchScore(building, q);
    if (score === 0) continue;

    let distance = null;
    if (havePosition) {
      const door = nearestEntrance(building, lat, lon);
      if (door) distance = door.distance;
    }
    results.push({ building, distance, score });
  }

  // Best match first; ties go to the closer building, then alphabetical.
  results.sort((a, b) =>
    (b.score - a.score) ||
    ((a.distance ?? Infinity) - (b.distance ?? Infinity)) ||
    a.building.name.localeCompare(b.building.name));

  return results;
}
