// js/sensors.js — the Sensors module (iPhone Safari only).
//
// Owns these shared state fields:
//   state.heading          degrees clockwise from true north, 0-360 (smoothed)
//   state.locked           true once Lock north was tapped (heading then uses the gyroscope)
//   state.tilted           true when the phone is not held roughly flat
//   state.steps            number of walking steps detected since Start
//   state.needsCalibration true when the compass is jumping around (wave phone in a figure-8)
//   state.started          true once sensors are running
//   state.sensorError      null, 'unsupported', 'denied', 'nocompass' or 'failed'
//
// Global functions other files call:
//   startSensors()  call inside the Start button's tap handler (iOS rule). Same as Sensors.init().
//   lockNorth()     call where the compass is accurate (outside / at the entrance).
//   Sensors.onStep(fn)  fn(heading) runs on every detected step.
//   Sensors.raw     live raw readings, for test/debug pages.
//
// Load order: js/state.js must be loaded BEFORE this file.
//
// Everything below is wrapped in (() => { ... })() so our helper names
// (angleDiff, offset, ...) can't clash with teammates' files, e.g. js/angle.js.

(() => {

  // ======================================================================
  // SETTINGS — tune these
  // ======================================================================

  // Desk testing: set to a number (e.g. 90) to pretend the phone faces that way.
  // Works on a laptop: no permissions, no real sensors. Keep null for the real app.
  const FAKE_HEADING = null;

  // Smoothing: each animation frame, the shown heading moves this fraction of the
  // way toward the real reading. 1 = no smoothing, smaller = smoother but slower.
  const SMOOTHING = 0.2;

  // Step detection: total acceleration (m/s²) must rise above this to count a step.
  // Standing still reads about 9.8 (gravity). Tune by walking 20 steps.
  const STEP_THRESHOLD = 11;
  const STEP_MIN_MS = 300;        // ignore a second "step" sooner than this (bounce)

  // Calibration warning: compass jumps bigger than CAL_JUMP_DEG, CAL_JUMPS times
  // within CAL_WINDOW_MS, means the magnetometer needs a figure-8.
  const CAL_JUMP_DEG = 45;
  const CAL_JUMPS = 3;
  const CAL_WINDOW_MS = 3000;

  const NO_COMPASS_MS = 3000;     // flag 'nocompass' if no reading by then
  const MAX_TILT = 25;            // degrees from flat before state.tilted = true

  // ======================================================================
  // SHARED STATE DEFAULTS
  // ======================================================================

  state.sensorError = null;
  state.steps = 0;
  state.needsCalibration = false;

  // ======================================================================
  // RAW READINGS (debug only, not shared state)
  // ======================================================================

  const raw = {
    compass: null,    // magnetometer heading: knows true north, but steel indoors bends it
    gyro: null,       // gyroscope heading: steady indoors, but its zero is random
    accuracy: null,   // iOS compass accuracy in ± degrees (-1 = uncalibrated)
    heading: null,    // unsmoothed heading we're aiming for (compass, or gyro + lock offset)
    offset: null,     // compass - gyro, measured by lockNorth()
    accel: null,      // total acceleration magnitude, m/s²
  };

  // ======================================================================
  // MATHS HELPERS
  // ======================================================================

  // Keep any angle in 0-360 (handles negatives and values over 360).
  function wrap360(a) {
    return ((a % 360) + 360) % 360;
  }

  // Shortest signed difference a - b, in -180..180.
  // 359 vs 1 gives -2 (turn left 2°), not 358.
  function angleDiff(a, b) {
    return ((a - b + 540) % 360) - 180;
  }

  // ======================================================================
  // HEADING: compass + gyroscope (runs on every orientation event)
  // ======================================================================

  // Compass jump times, for the calibration warning.
  let jumpTimes = [];

  function onOrientation(e) {
    // Ignore events with no compass/gyro data, so heading never becomes NaN.
    if (e.webkitCompassHeading == null || e.alpha == null) return;

    const compass = e.webkitCompassHeading;
    const gyro = 360 - e.alpha;   // alpha grows anticlockwise; flip to clockwise like a compass

    // Calibration check: count big sudden compass jumps in the last 3 s.
    const now = performance.now();
    if (raw.compass !== null && Math.abs(angleDiff(compass, raw.compass)) > CAL_JUMP_DEG) {
      jumpTimes.push(now);
    }
    jumpTimes = jumpTimes.filter((t) => t > now - CAL_WINDOW_MS);
    state.needsCalibration = jumpTimes.length >= CAL_JUMPS;

    raw.compass = compass;
    raw.gyro = gyro;
    raw.accuracy = e.webkitCompassAccuracy;

    // Target heading: before Lock north use the compass; after, gyro + offset
    // (immune to magnetic interference indoors).
    raw.heading = raw.offset === null ? compass : wrap360(gyro + raw.offset);
    state.locked = raw.offset !== null;

    // Tilt: beta = front/back, gamma = left/right; both ~0 when lying flat.
    state.tilted = Math.abs(e.beta) > MAX_TILT || Math.abs(e.gamma) > MAX_TILT;
  }

  // ======================================================================
  // SMOOTHING LOOP (runs every screen frame, ~60 times a second)
  // ======================================================================

  let shown = null;   // the smoothed heading we publish

  function smoothLoop() {
    if (raw.heading !== null) {
      if (shown === null) shown = raw.heading;   // first reading: jump straight there
      // Move part of the way toward the target, the short way round.
      shown = wrap360(shown + angleDiff(raw.heading, shown) * SMOOTHING);
      state.heading = shown;
    }
    requestAnimationFrame(smoothLoop);
  }

  // ======================================================================
  // STEP DETECTION (runs on every motion event)
  // ======================================================================

  const stepListeners = [];
  let lastStepTime = 0;
  let droppedBelow = true;   // must fall below the threshold between steps

  function onMotion(e) {
    const a = e.accelerationIncludingGravity;
    if (!a || a.x == null) return;

    // Total acceleration, ignoring direction: sqrt(x² + y² + z²).
    const mag = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
    raw.accel = mag;

    const now = performance.now();
    if (mag < STEP_THRESHOLD) {
      droppedBelow = true;   // ready for the next step
    } else if (droppedBelow && now - lastStepTime >= STEP_MIN_MS) {
      // Rising above the threshold after a dip, not too soon after the last step = a step.
      droppedBelow = false;
      lastStepTime = now;
      state.steps++;
      stepListeners.forEach((fn) => fn(state.heading));
    }
  }

  // Other files register here to be told about each step: Sensors.onStep(h => ...).
  function onStep(fn) {
    stepListeners.push(fn);
  }

  // ======================================================================
  // SCREEN WAKE LOCK (stops the screen sleeping mid-walk)
  // ======================================================================

  async function requestWakeLock() {
    try {
      if ('wakeLock' in navigator) await navigator.wakeLock.request('screen');
    } catch (err) {
      // Not supported or refused: the app still works, the screen may just dim.
    }
  }

  // iOS drops the wake lock when you leave the page, so ask again on return.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.started) requestWakeLock();
  });

  // ======================================================================
  // START (call inside a tap)
  // ======================================================================

  async function startSensors() {
    if (state.started) return true;   // already running; don't add listeners twice
    state.sensorError = null;

    // Desk testing: fake a heading, skip permissions and real sensors.
    if (FAKE_HEADING !== null) {
      raw.heading = FAKE_HEADING;
      state.started = true;
      requestAnimationFrame(smoothLoop);
      return true;
    }

    // iOS 13+ Safari has requestPermission; anything else isn't supported (iPhone only for now).
    if (typeof DeviceOrientationEvent === 'undefined' ||
        typeof DeviceOrientationEvent.requestPermission !== 'function') {
      state.sensorError = 'unsupported';
      return false;
    }

    // Ask for both: orientation (compass/gyro) and motion (accelerometer for steps).
    let orientationAnswer, motionAnswer;
    try {
      orientationAnswer = await DeviceOrientationEvent.requestPermission();
      motionAnswer = typeof DeviceMotionEvent.requestPermission === 'function'
        ? await DeviceMotionEvent.requestPermission()
        : 'granted';
    } catch (err) {
      state.sensorError = 'failed';   // e.g. not called from a tap, or page not on HTTPS
      return false;
    }
    if (orientationAnswer !== 'granted' || motionAnswer !== 'granted') {
      state.sensorError = 'denied';
      return false;
    }

    window.addEventListener('deviceorientation', onOrientation);
    window.addEventListener('devicemotion', onMotion);
    requestAnimationFrame(smoothLoop);
    requestWakeLock();
    state.started = true;

    // If no compass reading shows up soon, flag it.
    setTimeout(() => {
      if (raw.compass === null) state.sensorError = 'nocompass';
    }, NO_COMPASS_MS);

    return true;
  }

  // ======================================================================
  // LOCK NORTH (call where the compass is accurate)
  // ======================================================================

  // Records the compass-gyro gap; after that heading = gyro + gap, so steel
  // indoors can't bend it. Returns false if there are no readings yet.
  function lockNorth() {
    if (raw.compass === null) return false;
    raw.offset = raw.compass - raw.gyro;
    return true;
  }

  // ======================================================================
  // PUBLIC API
  // ======================================================================

  window.startSensors = startSensors;
  window.lockNorth = lockNorth;
  window.Sensors = { init: startSensors, onStep, lockNorth, raw };
  window.sensorDebug = raw;   // old name, kept so existing test pages still work

})();
