// js/sensors.js — owns state.heading, state.locked, state.tilted, state.started.
// No buttons or display in here: the UI calls startSensors() and lockNorth().
// Load order: js/state.js must be loaded BEFORE this file.

// Sensor problems for the UI to show (null = fine). Same idea as state.locationError:
//   'unsupported' - not an iPhone/Safari with motion access (e.g. desktop, Android)
//   'denied'      - user tapped Don't Allow (fix: close Safari tab and reopen)
//   'nocompass'   - started, but no compass readings arrived within 3 seconds
//   'failed'      - permission request threw (e.g. not called from a tap, or not HTTPS)
state.sensorError = null;

// Raw readings, exposed only for debugging/test pages (not part of shared state).
window.sensorDebug = { compass: null, gyro: null, accuracy: null, offset: null };

// Difference between compass and gyro, set by lockNorth().
// null = not locked yet, so heading falls back to the raw compass.
let offset = null;

// How far (degrees) the phone may tilt from flat before we warn.
// Compass/gyro heading is most reliable with the screen facing up.
const MAX_TILT = 25;

// Keep any angle in the range 0-360 (handles negatives and >360).
function wrap360(a) {
  return ((a % 360) + 360) % 360;
}

// Runs on every sensor update.
function onOrientation(e) {
  // Ignore events with no compass/gyro data, so heading never becomes NaN.
  if (e.webkitCompassHeading == null || e.alpha == null) return;

  const compass = e.webkitCompassHeading;   // magnetometer: true north, bent indoors
  const gyro = 360 - e.alpha;               // gyroscope: steady indoors, random zero
                                            // (alpha is anticlockwise, so flip it)

  // Once locked, heading = gyro + offset (immune to steel indoors).
  state.heading = offset === null ? compass : wrap360(gyro + offset);
  state.locked = offset !== null;

  // Tilt: beta = front/back tilt, gamma = left/right tilt. Both are ~0 when flat.
  // Phone held upright or sideways makes heading unreliable, so tell the UI.
  state.tilted = Math.abs(e.beta) > MAX_TILT || Math.abs(e.gamma) > MAX_TILT;

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
  return true;
}
