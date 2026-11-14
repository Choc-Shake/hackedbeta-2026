// js/app.js — the UI. Connects the buttons and screens to the other modules.
//
// It only READS the shared `state` object and calls each module's functions:
//   startSensors()            js/sensors.js   compass heading
//   startLocation()           js/location.js  GPS position
//   updateAngle()             js/angle.js     which way the arrow points
//   setDestination() etc.     js/distance.js  closest entrance, metres, arrival
//   searchBuildings()         js/search.js    filtering the list
//
// Wrapped in (() => { ... })() so its helper names can't clash with other files.

(() => {

  // ======================================================================
  // SETTINGS
  // ======================================================================
  const WEAK_GPS_M = 25;          // GPS accuracy worse than this shows a warning
  const ON_COURSE_DEG = 15;       // arrow within this of straight ahead = "on course" glow
  const WALK_SPEED_MPS = 1.3;     // for the "about N min" estimate
  const LIST_REFRESH_MS = 3000;   // how often the list re-sorts by distance as you move

  // Demo mode: open index.html?demo to fake GPS + compass (no sensors needed).
  const DEMO = new URLSearchParams(location.search).has('demo');
  const DEMO_START = { lat: 53.52620, lon: -113.52430 };   // Main Quad
  const DEMO_SPEED_MPS = 7;                                // fast-forward walking

  // ======================================================================
  // ELEMENTS
  // ======================================================================
  const $ = (id) => document.getElementById(id);
  const app = $('app');
  const screens = { start: $('start'), search: $('search'), guide: $('guide') };
  let current = 'start';

  function show(name) {
    current = name;
    for (const key in screens) screens[key].classList.toggle('show', key === name);
  }

  // ======================================================================
  // START SCREEN
  // ======================================================================
  $('startBtn').addEventListener('click', async () => {
    if (DEMO) { startDemo(); enterSearch(); return; }

    // Must be the first thing in the tap: iOS only shows the motion prompt then.
    const ok = await startSensors();
    startLocation();

    if (!ok) {
      const messages = {
        unsupported: 'The compass needs an iPhone in Safari. No iPhone handy? <a href="?demo">Try the demo</a>.',
        denied: 'Motion access was denied. Close this tab, reopen it and tap Allow.',
        failed: 'Could not ask for motion access. Reload the page and try again.',
      };
      $('startErr').innerHTML = messages[state.sensorError] || 'Sensor problem: ' + state.sensorError;
      return;
    }
    enterSearch();
  });

  function enterSearch() {
    show('search');
    renderList();
    requestAnimationFrame(frame);
    setInterval(() => { if (current === 'search') renderList(); }, LIST_REFRESH_MS);
  }

  // ======================================================================
  // SEARCH SCREEN
  // ======================================================================
  const q = $('q');

  // Metres as text: "85 m", "1.2 km".
  function formatDistance(m) {
    return m < 1000 ? Math.round(m) + ' m' : (m / 1000).toFixed(1) + ' km';
  }

  let listSignature = '';   // what the list showed last time

  function renderList() {
    const results = searchBuildings(q.value, state.lat, state.lon);
    const list = $('list');

    // Skip the rebuild when nothing visible changed, so a tap that lands during
    // the timed refresh never loses its row.
    const signature = q.value + '|' + results.map((r) =>
      r.building.id + (r.distance === null ? '' : formatDistance(r.distance))).join(',');
    if (signature === listSignature && list.childElementCount > 0) return;
    listSignature = signature;

    list.textContent = '';
    $('searchbox').classList.toggle('has', q.value !== '');
    $('listHead').textContent = q.value.trim() === ''
      ? (state.lat === null ? 'All buildings' : 'Closest to you')
      : results.length + (results.length === 1 ? ' match' : ' matches');

    if (results.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'No building matches "' + q.value + '". Try part of the name, or a code like CAB.';
      list.appendChild(empty);
      return;
    }

    for (const { building, distance } of results) {
      const row = document.createElement('button');
      row.className = 'row';
      row.dataset.id = building.id;

      const name = document.createElement('span');
      name.className = 'n';
      name.textContent = building.name;
      const notes = [];
      if (building.washroom) notes.push('🚻 washrooms');
      if (building.entrances.length === 0) notes.push('doors not mapped yet');
      if (notes.length) {
        const small = document.createElement('small');
        small.textContent = notes.join(' · ');
        name.appendChild(small);
      }
      row.appendChild(name);

      if (building.code) {
        const code = document.createElement('span');
        code.className = 'code';
        code.textContent = building.code;
        row.appendChild(code);
      }
      if (distance !== null) {
        const d = document.createElement('span');
        d.className = 'd';
        d.textContent = formatDistance(distance);
        row.appendChild(d);
      }
      list.appendChild(row);
    }
  }

  q.addEventListener('input', () => { renderList(); $('list').scrollTop = 0; });
  $('clearBtn').addEventListener('click', () => { q.value = ''; renderList(); q.focus(); });

  // One listener for the whole list: find which row was tapped.
  $('list').addEventListener('click', (e) => {
    const row = e.target.closest('.row');
    if (!row) return;
    const building = BUILDINGS.find((b) => b.id === row.dataset.id);
    if (building) startGuiding(building, 'Guiding to');
  });

  // Bonus: nearest washroom.
  $('wcBtn').addEventListener('click', () => {
    if (state.lat === null) {
      flashToastOnSearch('Waiting for GPS. Try again in a moment.');
      return;
    }
    const found = findNearestWashroom(state.lat, state.lon);
    if (found) startGuiding(found.building, 'Nearest washroom');
  });

  function flashToastOnSearch(text) {
    const btn = $('wcBtn');
    const original = '🚻 Nearest washroom';
    btn.textContent = text;
    setTimeout(() => { btn.textContent = original; }, 2000);
  }

  // ======================================================================
  // GUIDE SCREEN
  // ======================================================================
  let lastDoorIndex = null;     // to notice when the closest entrance changes
  let noticeUntil = 0;          // show "switched entrance" until this time

  function startGuiding(building, kind) {
    q.blur();
    setDestination(building);
    lastDoorIndex = state.target ? state.target.index : null;
    noticeUntil = 0;
    $('destKind').textContent = kind;
    $('destName').textContent = building.name;
    $('destCode').textContent = building.code || '';
    $('destCode').style.display = building.code ? '' : 'none';
    show('guide');
  }

  function stopGuiding() {
    clearDestination();
    show('search');
    renderList();
  }
  $('backBtn').addEventListener('click', stopGuiding);
  $('doneBtn').addEventListener('click', stopGuiding);

  // Compass ring: 72 tick marks and N/E/S/W letters, drawn once.
  (function drawRose() {
    let svg = '';
    for (let deg = 0; deg < 360; deg += 5) {
      const big = deg % 90 === 0, mid = deg % 30 === 0;
      const len = big ? 0 : mid ? 7 : 4;
      if (len) svg += `<line x1="100" y1="3" x2="100" y2="${3 + len}" transform="rotate(${deg} 100 100)" ` +
                      `stroke="${mid ? '#93b39d' : '#42594b'}" stroke-width="${mid ? 1.6 : 1}"/>`;
    }
    const letters = [['N', 0, '#ff7b6e'], ['E', 90, '#93b39d'], ['S', 180, '#93b39d'], ['W', 270, '#93b39d']];
    for (const [ch, deg, color] of letters) {
      svg += `<text x="100" y="12" text-anchor="middle" font-size="12" font-weight="800" fill="${color}" ` +
             `transform="rotate(${deg} 100 100)">${ch}</text>`;
    }
    $('rose').innerHTML = svg;
  })();

  // Words for where the arrow points. angle: -180..180, 0 = straight ahead.
  function hintFor(angle) {
    const a = Math.abs(angle);
    const side = angle < 0 ? 'left' : 'right';
    if (a <= ON_COURSE_DEG) return 'Straight ahead';
    if (a <= 60) return 'Slightly ' + side;
    if (a <= 135) return 'Turn ' + side;
    return 'Behind you, turn around';
  }

  // The one warning most worth showing right now ('' = none).
  function currentWarning() {
    if (state.locationError === 'denied') return 'Location is blocked. Allow it in Settings, then reload.';
    if (state.lat === null) return 'Waiting for GPS… step outside, away from walls.';
    if (!DEMO && state.sensorError) return 'Compass problem: ' + state.sensorError;
    if (state.tilted) return '📱 Hold your phone flat';
    if (state.needsCalibration) return 'Compass is jumpy. Wave your phone in a figure-8.';
    if (performance.now() < noticeUntil) return 'Switched to a closer entrance';
    if (state.accuracy !== null && state.accuracy > WEAK_GPS_M) return 'GPS is weak here. Distance may be off.';
    return '';
  }

  function renderGpsPill(pill) {
    let cls = '', text = 'Finding GPS…';
    if (state.locationError === 'denied') { cls = 'bad'; text = 'Location blocked'; }
    else if (state.accuracy !== null) {
      const weak = state.accuracy > WEAK_GPS_M;
      cls = weak ? 'weak' : 'good';
      text = 'GPS ±' + Math.round(state.accuracy) + ' m';
    }
    pill.className = 'pill ' + cls;
    pill.lastElementChild.textContent = text;
  }

  function renderGuide() {
    const target = state.target;
    const waiting = !target || state.distance === null;

    // Notice when the closest entrance changed while walking.
    if (target && lastDoorIndex !== null && target.index !== lastDoorIndex && !target.approx) {
      noticeUntil = performance.now() + 3000;
    }
    if (target) lastDoorIndex = target.index;

    // Which entrance we're heading to.
    const sub = $('destSub');
    if (!target) {
      sub.textContent = 'Finding the closest entrance…';
      sub.className = 's';
    } else if (target.approx) {
      sub.textContent = 'Doors not mapped yet: guiding you to the nearest wall';
      sub.className = 's note';
    } else {
      const count = state.destination.entrances.length;
      sub.textContent = 'Closest entrance' + (target.main ? ' · main entrance' : '') +
                        (target.wheelchair ? ' · ♿ accessible' : '') +
                        (count > 1 ? ' · 1 of ' + count + ' doors' : '');
      sub.className = 's';
    }

    // Arrow and compass ring.
    $('arrow').style.transform = 'rotate(' + state.relAngle + 'deg)';
    $('rose').style.transform = 'rotate(' + (-state.heading) + 'deg)';

    const onCourse = !waiting && !state.arrived && Math.abs(state.relAngle) <= ON_COURSE_DEG;
    app.classList.toggle('oncourse', onCourse);
    app.classList.toggle('waiting', waiting);
    app.classList.toggle('arrived', state.arrived);

    // Distance, walking time and hint.
    if (waiting) {
      $('distNum').textContent = '--';
      $('distUnit').textContent = 'm';
      $('eta').textContent = '';
      $('hint').textContent = 'Getting your position…';
    } else if (state.arrived) {
      $('distNum').textContent = "You're here";
      $('distUnit').textContent = '';
      $('eta').textContent = '';
      $('hint').textContent = target.approx
        ? 'You are at the building. Look for the nearest door.'
        : 'The entrance is about ' + Math.max(1, Math.round(state.distance)) + ' m away. Look for the door.';
    } else {
      const km = state.distance >= 1000;
      $('distNum').textContent = km ? (state.distance / 1000).toFixed(1) : Math.round(state.distance);
      $('distUnit').textContent = km ? 'km' : 'm';
      const minutes = Math.max(1, Math.round(state.distance / WALK_SPEED_MPS / 60));
      $('eta').textContent = 'about ' + minutes + ' min walk';
      $('hint').textContent = hintFor(state.relAngle);
    }
    $('distNum').parentElement.style.fontSize = state.arrived ? '40px' : '';

    const warning = state.arrived ? '' : currentWarning();
    const toast = $('toast');
    if (warning) toast.textContent = warning;
    toast.classList.toggle('show', warning !== '');
  }

  // ======================================================================
  // MAIN LOOP (every screen frame)
  // ======================================================================
  let lastFrame = performance.now();

  function frame(now) {
    const dt = Math.min(0.1, (now - lastFrame) / 1000);   // seconds since last frame
    lastFrame = now;

    if (DEMO) demoTick(dt);
    updateAngle();                       // js/angle.js: sets state.bearing and state.relAngle

    renderGpsPill($('gpsPill1'));
    renderGpsPill($('gpsPill2'));
    if (current === 'guide') renderGuide();

    requestAnimationFrame(frame);
  }

  // ======================================================================
  // DEMO MODE (index.html?demo): fake GPS + compass for a table demo
  // ======================================================================
  let demoWalking = false, demoAuto = false;

  function startDemo() {
    state.lat = DEMO_START.lat;
    state.lon = DEMO_START.lon;
    state.accuracy = 5;
    state.heading = 0;
    state.started = true;
  }

  function demoTick(dt) {
    // Auto-steer: turn toward the entrance, up to 120 degrees a second.
    if (demoAuto && state.bearing !== null && state.target) {
      const diff = ((state.bearing - state.heading + 540) % 360) - 180;
      const turn = Math.max(-120 * dt, Math.min(120 * dt, diff));
      state.heading = (state.heading + turn + 360) % 360;
      $('demoTurn').value = Math.round(state.heading);
    }
    $('demoHead').textContent = 'facing ' + Math.round(state.heading) + '°';

    // Walk forward the way we're facing.
    if (demoWalking && !state.arrived) {
      const metres = DEMO_SPEED_MPS * dt;
      const rad = state.heading * Math.PI / 180;
      state.lat += (metres * Math.cos(rad)) / 111320;
      state.lon += (metres * Math.sin(rad)) / (111320 * Math.cos(state.lat * Math.PI / 180));
      updateDistance();
    }
    if (state.arrived && demoWalking) setDemoWalking(false);
  }

  function setDemoWalking(on) {
    demoWalking = on;
    $('demoWalk').classList.toggle('on', on);
    $('demoWalk').textContent = on ? '⏸ Stop' : '▶ Walk';
  }

  if (DEMO) {
    app.classList.add('demo');
    $('startBtn').textContent = 'Start demo';
    $('demoTurn').addEventListener('input', (e) => { state.heading = +e.target.value; });
    $('demoWalk').addEventListener('click', () => setDemoWalking(!demoWalking));
    $('demoAuto').addEventListener('click', () => {
      demoAuto = !demoAuto;
      $('demoAuto').classList.toggle('on', demoAuto);
    });
    $('demoReset').addEventListener('click', () => {
      setDemoWalking(false);
      state.lat = DEMO_START.lat;
      state.lon = DEMO_START.lon;
      updateDistance();
    });
  }

})();
