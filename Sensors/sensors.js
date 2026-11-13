// Shared state object. Use the existing one if a teammate's file made it first.
window.state = window.state || {};

const out = document.getElementById('out');
const startBtn = document.getElementById('start');
const lockBtn = document.getElementById('lock');

// Latest raw readings, so the Lock button can use them.
let compass = null;   // magnetometer heading (true north, but bent indoors)
let gyro = null;      // gyroscope heading (steady indoors, random zero)

// Difference between compass and gyro, measured when you tap Lock.
// null = not locked yet, so we fall back to the raw compass.
let offset = null;

// Keep any angle in the range 0-360 (handles negatives and >360).
function wrap360(a) {
  return ((a % 360) + 360) % 360;
}

startBtn.addEventListener('click', async () => {
  // iOS only allows motion/compass access after a tap, so ask here.
  const answer = await DeviceOrientationEvent.requestPermission();
  out.textContent = 'permission: ' + answer;

  if (answer === 'granted') {
    window.addEventListener('deviceorientation', (e) => {
      compass = e.webkitCompassHeading;

      // alpha grows anticlockwise, so 360 - alpha makes it clockwise like a compass.
      gyro = 360 - e.alpha;

      // Once locked, heading = gyro + offset (immune to steel indoors).
      // Before locking, just use the compass.
      state.heading = offset === null ? compass : wrap360(gyro + offset);
      state.locked = offset !== null;

      out.textContent = 'heading: ' + Math.round(state.heading) +
                        (state.locked ? '  (locked)' : '  (compass ±' + Math.round(e.webkitCompassAccuracy) + ')') +
                        '\ncompass: ' + Math.round(compass) +
                        '  gyro: ' + Math.round(gyro);
    });
  }
});

// Tap this where the compass is accurate (outside or at the entrance).
// It records how far apart compass and gyro are right now; after that,
// gyro + offset gives true heading without needing the magnetometer.
lockBtn.addEventListener('click', () => {
  if (compass === null) return;   // no readings yet, tap Start first
  offset = compass - gyro;
});
