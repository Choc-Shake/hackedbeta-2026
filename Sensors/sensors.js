// Shared state object. Use the existing one if a teammate's file made it first.
window.state = window.state || {};

const out = document.getElementById('out');
const startBtn = document.getElementById('start');

startBtn.addEventListener('click', async () => {
  // iOS only allows motion/compass access after a tap, so ask here.
  const answer = await DeviceOrientationEvent.requestPermission();
  out.textContent = 'permission: ' + answer;

  if (answer === 'granted') {
    window.addEventListener('deviceorientation', (e) => {
      // Magnetometer heading: knows true north, but steel indoors bends it.
      state.heading = e.webkitCompassHeading;

      // Gyroscope heading: ignores magnetic fields, but its zero is random
      // (wherever the phone pointed at start). alpha grows anticlockwise,
      // so 360 - alpha makes it clockwise like a compass.
      const gyro = 360 - e.alpha;

      // TEST: compare compass vs gyro indoors. gyro should only change
      // when you physically turn; compass may jump near steel.
      out.textContent = 'heading: ' + Math.round(state.heading) +
                        '  ±' + Math.round(e.webkitCompassAccuracy) +
                        '  gyro: ' + Math.round(gyro);
    });
  }
});
