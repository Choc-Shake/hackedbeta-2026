// js/location.js — Person 2 (Location)
// Writes: state.lat, state.lon, state.accuracy, state.locationError
// Called by Sensors: startLocation() inside the Start button tap.

// ---- Desk testing ----
// Set to { lat: 53.5268, lon: -113.5290 } (any real point) to skip GPS at a table.
// MUST be null before the demo.
const FAKE_POSITION = null; // Main Coordinates in the University of Alberta Commons

// ---- Settings ----
const MAX_ACCURACY_M = 30;  // ignore readings worse than this (metres)
const AVERAGE_OVER = 2;     // average the last N good readings
const RETRY_MS = 2000;      // wait before retrying after a timeout

// UI reads this: null = fine, 'denied' = location blocked, 'unsupported' = no GPS in browser
state.locationError = null;

// ---- Internal ----
const goodReadings = [];
let watchId = null;
let retryTimer = null;

// For test.html only: lets you see what the raw GPS is doing
const locationDebug = { raw: null, updates: 0, good: 0, rejected: 0, errors: 0 };

function startLocation() {
  if (FAKE_POSITION) {
    state.lat = FAKE_POSITION.lat;
    state.lon = FAKE_POSITION.lon;
    state.accuracy = 5;
    state.locationError = null;
    notifyNewPosition();
    return;
  }

  if (!('geolocation' in navigator)) {
    state.locationError = 'unsupported';
    return;
  }

  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  watchId = navigator.geolocation.watchPosition(onPos, onErr, {
    enableHighAccuracy: true,
    maximumAge: 0,
    timeout: 10000
  });
}

function onPos(pos) {
  const { latitude, longitude, accuracy } = pos.coords;
  locationDebug.raw = { lat: latitude, lon: longitude, accuracy, time: pos.timestamp };
  locationDebug.updates++;
  state.locationError = null;

  if (accuracy > MAX_ACCURACY_M) {
    locationDebug.rejected++;
    // No good reading yet? Show the rough one so the UI isn't stuck on "Finding you…".
    // Once we have good readings, rough ones are ignored.
    if (goodReadings.length === 0) {
      state.lat = latitude;
      state.lon = longitude;
      state.accuracy = accuracy;
      notifyNewPosition();
    }
    return;
  }

  locationDebug.good++;
  goodReadings.push({ lat: latitude, lon: longitude, accuracy });
  if (goodReadings.length > AVERAGE_OVER) goodReadings.shift();

  const n = goodReadings.length;
  // Trust precise readings more: weight = 1 / accuracy²
  const weights = goodReadings.map(r => 1 / Math.max(r.accuracy, 1) ** 2);
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  state.lat = goodReadings.reduce((sum, r, i) => sum + r.lat * weights[i], 0) / totalWeight;
  state.lon = goodReadings.reduce((sum, r, i) => sum + r.lon * weights[i], 0) / totalWeight;
  state.accuracy = goodReadings.reduce((sum, r) => sum + r.accuracy, 0) / n;
  notifyNewPosition();
}

function onErr(err) {
  locationDebug.errors++;

  if (err.code === err.PERMISSION_DENIED) {
    state.locationError = 'denied';  // UI shows "Turn on Location in Settings"
    return;                          // can't retry; user has to allow it and reload
  }

  // TIMEOUT or POSITION_UNAVAILABLE (common indoors): keep trying quietly
  if (retryTimer === null) {
    retryTimer = setTimeout(() => {
      retryTimer = null;
      startLocation();
    }, RETRY_MS);
  }
}

// Tell Distance there's a new position (agree on this with the Distance person)
function notifyNewPosition() {
  if (typeof updateDistance === 'function') updateDistance();
}
