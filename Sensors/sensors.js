// sensors.js — owns state.heading and state.locked.
// No buttons or display in here: the UI calls startSensors() and lockNorth().

// Shared state object. Use the existing one if a teammate's file made it first.
window.state = window.state || {};

// Raw readings, exposed only for debugging/test pages (not part of shared state).
window.sensorDebug = { compass: null, gyro: null, accuracy: null, offset: null };

// Difference between compass and gyro, set by lockNorth().
// null = not locked yet, so heading falls back to the raw compass.
let offset = null;

// Keep any angle in the range 0-360 (handles negatives and >360).
function wrap360(a) {
  return ((a % 360) + 360) % 360;
}

// Runs on every sensor update.
function onOrientation(e) {
  const compass = e.webkitCompassHeading;   // magnetometer: true north, bent indoors
  const gyro = 360 - e.alpha;               // gyroscope: steady indoors, random zero
                                            // (alpha is anticlockwise, so flip it)

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
  const answer = await DeviceOrientationEvent.requestPermission();
  if (answer !== 'granted') return false;

  window.addEventListener('deviceorientation', onOrientation);
  state.started = true;
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
