    const out = document.getElementById('out');
    const startBtn = document.getElementById('start');

    startBtn.addEventListener('click', async () => {
      const answer = await DeviceOrientationEvent.requestPermission();
      out.textContent = 'permission: ' + answer;

      if (answer === 'granted') {
        window.addEventListener('deviceorientation', (e) => {
          out.textContent = 'heading: ' + Math.round(e.webkitCompassHeading);
        });
      }
    });