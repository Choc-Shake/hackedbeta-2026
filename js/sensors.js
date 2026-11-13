// js/sensors.js — owns state.heading, state.locked, state.autoLocked, state.started.
// No buttons or display in here: the UI calls startSensors() and lockNorth().
// Load order: js/state.js must be loaded BEFORE this file.

// Sensor problems for the UI to show (null = fine). Same idea as state.locationError:
//   'unsupported' - not an iPhone/Safari with motion access (e.g. desktop, Android)
//   'denied'      - user tapped Don't Allow (fix: close Safari tab and reopen)
//   'nocompass'   - started, but no compass readings arrived within 3 seconds
//   'failed'      - permission request threw (e.g. not called from a tap, or not HTTPS)
state.sensorError = null;
state.autoLocked = false;   // true if the lock happened automatically (vs Lock north button)

// Raw readings, exposed only for debugging/test pages (not part of shared state).
window.sensorDebug = { compass: null, gyro: null, accuracy: null, offset: null };

// Difference between compass and gyro, set by lockNorth().
// null = not locked yet, so heading falls back to the raw compass.
let offset = null;

// ---- Auto-lock settings ----
// Lock automatically only when ALL of these hold for AUTO_LOCK_MS in a row:
const AUTO_LOCK_MAX_COMPASS_ACC = 15;  // iOS compass accuracy, degrees (smaller = better)
const AUTO_LOCK_MAX_GPS_ACC = 15;      // state.accuracy from Location, metres: only this sharp
                                       // outdoors/by doors, where the compass is trustworthy
const AUTO_LOCK_MAX_SPREAD = 5;        // compass-gyro gap may wobble at most this many degrees
const AUTO_LOCK_MS = 2000;             // how long conditions must stay good

// Recent compass-gyro gaps while conditions are good: [{ t: time ms, gap: degrees }]
let autoSamples = [];

// Keep any angle in the range 0-360 (handles negatives and >360).
function wrap360(a) {
  return ((a % 360) + 360) % 360;
}

// Shortest signed difference a - b, in -180..180 (so 359 vs 1 is -2, not 358).
function angleDiff(a, b) {
  return ((a - b + 540) % 360) - 180;
}

// Called on every reading until locked. Locks by itself once the compass has
// been trustworthy for AUTO_LOCK_MS. Any bad reading resets the timer.
function checkAutoLock(compass, gyro, compassAcc) {
  const good =
    compassAcc >= 0 && compassAcc <= AUTO_LOCK_MAX_COMPASS_ACC &&   // -1 means uncalibrated
    state.accuracy != null && state.accuracy <= AUTO_LOCK_MAX_GPS_ACC;
  if (!good) { autoSamples = []; return; }

  const now = performance.now();
  autoSamples.push({ t: now, gap: wrap360(compass - gyro) });
  while (autoSamples[0].t < now - AUTO_LOCK_MS) autoSamples.shift();   // keep last 2 s

  // Need (almost) a full 2 s of good readings before deciding.
  if (autoSamples[0].t > now - AUTO_LOCK_MS * 0.9) return;

  // How much did the gap wobble? Measure each sample against the first one.
  // A bent magnetic field makes the compass drift against the gyro; a clean one doesn't.
  const base = autoSamples[0].gap;
  const diffs = autoSamples.map((s) => angleDiff(s.gap, base));
  const spread = Math.max(...diffs) - Math.min(...diffs);
  if (spread > AUTO_LOCK_MAX_SPREAD) return;

  // Steady: lock using the average gap (smoother than a single reading).
  const avg = diffs.reduce((sum, d) => sum + d, 0) / diffs.length;
  offset = wrap360(base + avg);
  state.autoLocked = true;
  autoSamples = [];
}

// Runs on every sensor update.
function onOrientation(e) {
  // Ignore events with no compass/gyro data, so heading never becomes NaN.
  if (e.webkitCompassHeading == null || e.alpha == null) return;

  const compass = e.webkitCompassHeading;   // magnetometer: true north, bent indoors
  const gyro = 360 - e.alpha;               // gyroscope: steady indoors, random zero
                                            // (alpha is anticlockwise, so flip it)

  if (offset === null) checkAutoLock(compass, gyro, e.webkitCompassAccuracy);

  // Once locked, heading = gyro + offset (immune to steel indoors).
  state.heading = offset === null ? compass : wrap360(gyro + offset);
  state.locked = offset !== null;

  sensorDebug.compass = compass;
  sensorDebug.gyro = gyro;
  sensorDebug.accuracy = e.webkitCompassAccuracy;
  sensorDebug.offset = offset;
}

// Call from the Start button's click handler (iOS only asks for permission
// after a tap). Returns a promise: true if sensors started, false if not.
async function startSensors() {
  if (state.started) return true;   // already running; don't add a second listener
  state.sensorError = null;

  // iOS 13+ Safari has requestPermission; anything else isn't supported (iPhone only for now).
  if (typeof DeviceOrientationEvent === 'undefined' ||
      typeof DeviceOrientationEvent.requestPermission !== 'function') {
    state.sensorError = 'unsupported';
    return false;
  }

  let answer;
  try {
    answer = await DeviceOrientationEvent.requestPermission();
  } catch (err) {
    state.sensorError = 'failed';
    return false;
  }
  if (answer !== 'granted') {
    state.sensorError = 'denied';
    return false;
  }

  window.addEventListener('deviceorientation', onOrientation);
  state.started = true;

  // If no compass reading shows up soon, flag it (sensor broken or blocked).
  setTimeout(() => {
    if (sensorDebug.compass === null) state.sensorError = 'nocompass';
  }, 3000);

  return true;
}

// Call where the compass is accurate (outside or at the entrance).
// Records the compass-gyro gap; after that heading no longer needs the magnetometer.
// Returns true if it locked, false if there were no readings yet.
function lockNorth() {
  if (sensorDebug.compass === null) return false;
  offset = sensorDebug.compass - sensorDebug.gyro;
  state.autoLocked = false;   // user locked by hand
  return true;
}
