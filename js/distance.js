// js/distance.js — Distance + nearest-entrance picking.
//
// Job: given where you are (state.lat/lon from Location) and the building you
// picked, choose the closest entrance, measure how far it is, and decide when
// you've arrived.
//
// Writes: state.destination, state.target, state.distance, state.arrived
// Needs:  js/state.js and js/buildings.js loaded first.
//
// Other files use:
//   setDestination(building)   start guiding to a building (from BUILDINGS)
//   clearDestination()         stop guiding
//   updateDistance()           recalculate; js/location.js calls this on every GPS fix
//   distanceM(lat1, lon1, lat2, lon2)      metres between two points
//   nearestEntrance(building, lat, lon)    closest door of one building
//   findNearestWashroom(lat, lon)          closest building that has a washroom

// ---- Settings ----------------------------------------------------------
const ARRIVE_RADIUS_M = 10;   // "You're here" when this close to the entrance
const LEAVE_RADIUS_M = 16;    // ...and it stays "arrived" until you're this far away again,
                              // so GPS wobble at the edge doesn't make it flicker
const SWITCH_MARGIN_M = 6;    // only switch to another door if it is this much closer,
                              // so the arrow doesn't flip between two doors
const EARTH_RADIUS_M = 6371000;

// ---- Distance between two GPS points (haversine formula) ---------------
// The Earth is a sphere, so we can't just subtract coordinates. Haversine gives
// the shortest distance over the surface. Accurate to well under 1 m on campus.
function distanceM(lat1, lon1, lat2, lon2) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const h = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

// ---- Nearest point on a building outline -------------------------------
// Used only for buildings whose doors aren't mapped yet: we guide to the
// nearest wall instead. Over a few hundred metres the ground is flat enough
// to treat as a grid in metres (x = east, y = north) centred on you.
function nearestOutlinePoint(outline, lat, lon) {
  const mPerLat = 111320;                                   // metres per degree north
  const mPerLon = 111320 * Math.cos(lat * Math.PI / 180);   // metres per degree east (shrinks toward the poles)
  let best = null;

  for (const ring of outline) {
    for (let i = 0; i < ring.length - 1; i++) {
      // Wall from A to B, in metres relative to you (you are at 0,0).
      const ax = (ring[i][1] - lon) * mPerLon,     ay = (ring[i][0] - lat) * mPerLat;
      const bx = (ring[i + 1][1] - lon) * mPerLon, by = (ring[i + 1][0] - lat) * mPerLat;
      const dx = bx - ax, dy = by - ay;
      const len2 = dx * dx + dy * dy;

      // t = how far along the wall the closest point is (0 = at A, 1 = at B).
      let t = len2 === 0 ? 0 : -(ax * dx + ay * dy) / len2;
      t = Math.max(0, Math.min(1, t));

      const px = ax + t * dx, py = ay + t * dy;
      const d = Math.hypot(px, py);
      if (best === null || d < best.distance) {
        best = { lat: lat + py / mPerLat, lon: lon + px / mPerLon, distance: d };
      }
    }
  }
  return best;
}

// ---- Closest entrance of one building ----------------------------------
// Returns { lat, lon, distance, index, main, wheelchair, approx } or null.
//   index  = which door in building.entrances (-1 for an outline point)
//   approx = true when the doors aren't mapped and this is just the nearest wall
function nearestEntrance(building, lat, lon) {
  if (building.entrances.length > 0) {
    let best = null;
    building.entrances.forEach((door, index) => {
      const d = distanceM(lat, lon, door.lat, door.lon);
      if (best === null || d < best.distance) {
        best = { lat: door.lat, lon: door.lon, distance: d, index,
                 main: !!door.main, wheelchair: !!door.wheelchair, approx: false };
      }
    });
    return best;
  }

  if (building.outline) {
    const p = nearestOutlinePoint(building.outline, lat, lon);
    if (p) return { ...p, index: -1, main: false, wheelchair: false, approx: true };
  }
  return null;
}

// ---- Closest building with a public washroom ---------------------------
// "Closest" = whose nearest entrance is closest to you.
// Returns { building, distance } or null.
function findNearestWashroom(lat, lon) {
  let best = null;
  for (const building of BUILDINGS) {
    if (!building.washroom) continue;
    const door = nearestEntrance(building, lat, lon);
    if (door && (best === null || door.distance < best.distance)) {
      best = { building, distance: door.distance };
    }
  }
  return best;
}

// ---- Choosing a destination --------------------------------------------
function setDestination(building) {
  state.destination = building;
  state.target = null;
  state.distance = null;
  state.arrived = false;
  updateDistance();
}

function clearDestination() {
  state.destination = null;
  state.target = null;
  state.distance = null;
  state.arrived = false;
}

// ---- Recalculate (runs on every new GPS position) ----------------------
function updateDistance() {
  if (!state.destination || state.lat === null) return;

  const closest = nearestEntrance(state.destination, state.lat, state.lon);
  if (!closest) return;

  let target = closest;
  const current = state.target;

  // Keep guiding to the door we already picked unless another one is clearly
  // closer (or we've arrived, in which case don't switch at all).
  if (current && !current.approx && current.index !== closest.index) {
    const door = state.destination.entrances[current.index];
    const dCurrent = distanceM(state.lat, state.lon, door.lat, door.lon);
    if (state.arrived || dCurrent - closest.distance < SWITCH_MARGIN_M) {
      target = { ...current, distance: dCurrent };
    }
  }

  state.target = {
    lat: target.lat, lon: target.lon, index: target.index,
    main: target.main, wheelchair: target.wheelchair, approx: target.approx,
    name: state.destination.name,
  };
  state.distance = target.distance;

  // Arrival, with a gap between the "arrive" and "leave" distances.
  if (state.distance <= ARRIVE_RADIUS_M) state.arrived = true;
  else if (state.distance > LEAVE_RADIUS_M) state.arrived = false;
}
