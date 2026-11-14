// js/app.js — the UI: the radar, the dial, the readout card and search.
//
// It only READS the shared `state` object and calls each module's functions:
//   startSensors()              js/sensors.js   compass heading
//   startLocation()             js/location.js  GPS position
//   updateAngle(), bearingDeg() js/angle.js     which way the target is
//   setDestination() etc.       js/distance.js  closest entrance, metres, arrival
//   searchBuildings()           js/search.js    filtering the list
//
// How the radar is used:
//   Top button          first press switches on; after that it steps the range 50 m / 200 m / 1 km
//   Swipe around        turns the dial: one click per building, nearest first, wraps around at the ends
//   Tap the glass       lock on to the selected building (tap again to let go)
//   Triple-tap          lock on to the closest door of the nearest building with a washroom
//   Search pill / swipe up from the bottom   opens search half way; drag it up to fill the screen
//
// Wrapped in (() => { ... })() so its helper names can't clash with other files.

(() => {

  // ======================================================================
  // SETTINGS
  // ======================================================================
  const RANGES = [50, 200, 1000];                 // metres from centre to edge of the glass
  const GRID_CELLS = { 50: 5, 200: 9, 1000: 13 }; // finer grid for a longer range
  const STEP_DEG = 22.5;          // how far you turn the dial for one building
  const DETENT_DEG = 7.5;         // spacing of the ring's tick marks (48 around)
  const TAP_WINDOW_MS = 330;      // taps closer together than this count as a double/triple tap
  const MOVE_PX = 10;             // a touch that moves more than this is a swipe, not a tap
  const WHEEL_PX = 60;            // scroll distance for one click on desktop
  const WEAK_GPS_M = 25;          // GPS accuracy worse than this shows a warning
  const NO_FIX_MS = 9000;         // no GPS fix after this long = "no GPS" screen
  const WALK_SPEED_MPS = 1.3;     // for the "about N min" estimate
  const MAX_BLIPS = 16;           // most dots drawn at once
  const MAX_LABELS = 7;           // most dots with a name next to them

  // Demo mode: open index.html?demo to fake GPS + compass (no sensors needed).
  const DEMO = new URLSearchParams(location.search).has('demo');
  const DEMO_START = { lat: 53.52620, lon: -113.52430 };   // Main Quad
  const DEMO_SPEED_MPS = 7;                                // fast-forward walking

  // Radar geometry, in the SVG's own units (viewBox 0 0 340 370).
  const CX = 170, CY = 200;       // centre of the glass
  const R_BEZEL = 168.25;         // ring (outline is 3.5 wide, so the outside edge is 170)
  const R_GLASS = 148;            // glass
  const R_DRAW = 130;             // dots never go further out than this
  const OUT = '#14201B';

  // ======================================================================
  // ELEMENTS + APP STATE
  // ======================================================================
  const $ = (id) => document.getElementById(id);
  const app = $('app');
  const svgNS = 'http://www.w3.org/2000/svg';

  const ui = {
    mode: 'off',          // 'off' | 'scan' | 'locked'
    rangeIndex: 1,        // into RANGES
    washroomsOnly: false, // filter: only buildings with public washrooms
    selectedId: null,     // building picked with the dial
    lockKind: 'building', // 'building' | 'washroom' (how we got locked on)
    dialAngle: 0,         // how far the ring has been turned, degrees
    startedAt: 0,         // when the radar was switched on
    sheetOpen: false,
    wasArrived: false,
    flash: null,          // { text, until } short message in the hint line
  };
  const range = () => RANGES[ui.rangeIndex];

  // ======================================================================
  // SMALL HELPERS
  // ======================================================================
  function el(tag, attrs, parent) {
    const node = document.createElementNS(svgNS, tag);
    for (const k in attrs) node.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(node);
    return node;
  }
  const circlePath = (cx, cy, r) =>
    `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
  const norm180 = (a) => ((a % 360) + 540) % 360 - 180;

  function formatDistance(m) {
    return m < 1000 ? { num: String(Math.round(m)), unit: 'm' } : { num: (m / 1000).toFixed(1), unit: 'km' };
  }
  function minutesText(m) {
    return 'About ' + Math.max(1, Math.round(m / WALK_SPEED_MPS / 60)) + ' min walk';
  }
  const COMPASS_WORDS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
  function compassWord(deg) { return COMPASS_WORDS[Math.round(deg / 45) % 8]; }

  // "north entrance", "main entrance", or the nearest wall when doors aren't mapped.
  function doorLabel(building, target) {
    if (!target) return 'finding the closest door';
    if (target.approx) return 'nearest wall (doors not mapped yet)';
    if (target.main) return 'main entrance';
    return compassWord(bearingDeg(building.lat, building.lon, target.lat, target.lon)) + ' entrance';
  }

  // ======================================================================
  // CLICK SOUND + BUZZ (feels like a real dial)
  // ======================================================================
  let audio = null;
  function unlockAudio() {
    try {
      if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
    } catch (e) { audio = null; }
  }
  function click(strength = 1) {
    if (navigator.vibrate) navigator.vibrate(strength > 1 ? [12, 40, 12, 40, 12] : 8);
    if (!audio) return;
    const t = audio.currentTime;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(strength > 1 ? 1400 : 2100, t);
    gain.gain.setValueAtTime(0.06, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
    osc.connect(gain).connect(audio.destination);
    osc.start(t);
    osc.stop(t + 0.04);
  }

  // ======================================================================
  // DRAW THE RADAR (once)
  // ======================================================================
  const svg = $('radarSvg');
  let gridG, blipsG, detentsG, rangeText, glassMsg, flashCircle, clickLines, capG;

  (function buildRadar() {
    const defs = el('defs', {}, svg);
    const bc = el('clipPath', { id: 'bezelClip' }, defs); el('circle', { cx: CX, cy: CY, r: R_BEZEL }, bc);
    const gc = el('clipPath', { id: 'glassClip' }, defs); el('circle', { cx: CX, cy: CY, r: R_GLASS }, gc);
    const cc = el('clipPath', { id: 'capClip' }, defs); el('rect', { x: 136, y: 0, width: 68, height: 19, rx: 8 }, cc);
    const glow = el('filter', { id: 'glow', x: '-150%', y: '-150%', width: '400%', height: '400%' }, defs);
    el('feGaussianBlur', { stdDeviation: 3.5 }, glow);

    // Cast shadow onto the sky.
    el('circle', { cx: CX, cy: CY + 12, r: 170, fill: '#163A63', opacity: 0.28 }, svg);

    // Top button: stem + cap. The cap moves down when pressed.
    el('rect', { x: 154.5, y: 13, width: 31, height: 18, fill: '#DADFDB', stroke: OUT, 'stroke-width': 2.8 }, svg);
    el('rect', { x: 154.5, y: 13, width: 7, height: 18, fill: '#AEB6B1' }, svg);
    capG = el('g', { id: 'cap' }, svg);
    el('rect', { x: 136, y: 0, width: 68, height: 19, rx: 8, fill: '#ECEFEB' }, capG);
    const capShade = el('g', { 'clip-path': 'url(#capClip)' }, capG);
    el('rect', { x: 136, y: 13, width: 68, height: 8, fill: '#B3BBB6' }, capShade);
    el('rect', { x: 136, y: -2, width: 68, height: 6, fill: '#FFFFFF' }, capShade);
    el('rect', { x: 136, y: 0, width: 68, height: 19, rx: 8, fill: 'none', stroke: OUT, 'stroke-width': 3.5 }, capG);

    // Dial ring with flat cel shading: a light crescent top-left, a shade crescent bottom-right.
    el('circle', { cx: CX, cy: CY, r: R_BEZEL, fill: '#E7EBE7' }, svg);
    const shading = el('g', { 'clip-path': 'url(#bezelClip)' }, svg);
    el('path', { d: circlePath(CX, CY, R_BEZEL) + circlePath(CX + 4, CY + 7, R_BEZEL), 'fill-rule': 'evenodd', fill: '#FFFFFF' }, shading);
    el('path', { d: circlePath(CX, CY, R_BEZEL) + circlePath(CX - 5, CY - 14, R_BEZEL), 'fill-rule': 'evenodd', fill: '#AEB6B1' }, shading);
    el('circle', { cx: CX, cy: CY, r: R_BEZEL, fill: 'none', stroke: OUT, 'stroke-width': 3.5 }, svg);

    // Tick marks around the ring; this group turns with your finger.
    detentsG = el('g', { id: 'detents', style: `transform-origin:${CX}px ${CY}px` }, svg);
    for (let i = 0; i < 48; i++) {
      const major = i % 4 === 0, len = major ? 9 : 5;
      el('line', {
        x1: CX, y1: CY - 161 - len / 2, x2: CX, y2: CY - 161 + len / 2,
        stroke: major ? '#5E6964' : '#8E9893', 'stroke-width': major ? 3 : 2.2, 'stroke-linecap': 'round',
        transform: `rotate(${i * DETENT_DEG} ${CX} ${CY})`,
      }, detentsG);
    }

    // Glass.
    const glass = el('g', { 'clip-path': 'url(#glassClip)' }, svg);
    el('circle', { class: 'g-base', cx: CX, cy: CY, r: R_GLASS }, glass);
    el('circle', { class: 'g-lit', cx: CX - 11.8, cy: CY - 14.8, r: R_GLASS }, glass);
    el('ellipse', { class: 'g-hl', cx: 130, cy: 125, rx: 92, ry: 50, transform: 'rotate(18 130 125)' }, glass);
    gridG = el('g', { class: 'grid', id: 'grid' }, glass);
    blipsG = el('g', { id: 'blips' }, glass);
    el('polygon', { id: 'you', points: `${CX},${CY - 12} ${CX + 11},${CY + 8} ${CX - 11},${CY + 8}`,
      fill: '#F2392B', stroke: OUT, 'stroke-width': 2, 'stroke-linejoin': 'round' }, glass);
    rangeText = el('text', { class: 'gtext', x: CX, y: CY + R_GLASS - 24, 'font-size': 12 }, glass);
    glassMsg = el('text', { class: 'gtext', x: CX, y: CY + 44, 'font-size': 16, 'stroke-width': 3 }, glass);
    el('ellipse', { class: 'glint', cx: 100, cy: 110, rx: 19, ry: 8, fill: '#fff', opacity: 0.85, transform: 'rotate(35 100 110)' }, glass);
    el('circle', { class: 'glint', cx: 77.5, cy: 143, r: 5, fill: '#fff', opacity: 0.85 }, glass);
    flashCircle = el('circle', { id: 'flash', cx: CX, cy: CY, r: R_GLASS, fill: '#FFFBE0' }, glass);
    el('circle', { class: 'glass-outline', cx: CX, cy: CY, r: R_GLASS, fill: 'none', stroke: OUT, 'stroke-width': 3.5 }, svg);

    // Comic "click" lines, flashed on each step of the dial.
    clickLines = el('g', { id: 'clickLines' }, svg);
    for (const deg of [-74, -62, -50]) {
      const a = deg * Math.PI / 180;
      el('line', { x1: CX + Math.cos(a) * 178, y1: CY + Math.sin(a) * 178, x2: CX + Math.cos(a) * 191, y2: CY + Math.sin(a) * 191,
        stroke: OUT, 'stroke-width': 3.5, 'stroke-linecap': 'round' }, clickLines);
    }
    drawGrid();
  })();

  function drawGrid() {
    gridG.textContent = '';
    const cells = GRID_CELLS[range()];
    const cell = (2 * R_GLASS) / cells;
    const n = Math.ceil(cells / 2) + 3, span = R_GLASS * 1.5;
    // Odd cell count: lines sit half a cell either side of the centre, like the toy.
    const start = cells % 2 ? cell / 2 : 0;
    for (let j = -n; j <= n; j++) {
      const o = start + j * cell;
      el('line', { x1: CX + o, y1: CY - span, x2: CX + o, y2: CY + span }, gridG);
      el('line', { x1: CX - span, y1: CY + o, x2: CX + span, y2: CY + o }, gridG);
    }
    rangeText.textContent = range() >= 1000 ? range() / 1000 + ' km' : range() + ' m';
  }

  // ======================================================================
  // CANDIDATES: buildings the dial steps through, nearest first
  // ======================================================================
  let candCache = { key: '', list: [] };

  function candidates() {
    if (state.lat === null) return [];
    const key = state.lat.toFixed(5) + ',' + state.lon.toFixed(5) + ',' + ui.washroomsOnly;
    if (key === candCache.key) return candCache.list;
    const list = [];
    for (const building of BUILDINGS) {
      if (ui.washroomsOnly && !building.washroom) continue;
      const door = nearestEntrance(building, state.lat, state.lon);
      if (door) list.push({ building, door, distance: door.distance });
    }
    list.sort((a, b) => a.distance - b.distance);
    candCache = { key, list };
    return list;
  }
  function selected() {
    return candidates().find((c) => c.building.id === ui.selectedId) || null;
  }
  function selectBuilding(id) {
    ui.selectedId = id;
    const c = selected();
    // Make sure the picked building is on the glass.
    if (c && c.distance > range() * 0.92) {
      const fit = RANGES.findIndex((r) => c.distance <= r * 0.92);
      if (fit !== -1) { ui.rangeIndex = fit; drawGrid(); }
    }
  }

  // ======================================================================
  // DIAL: turning
  // ======================================================================
  function turn(steps) {
    if (ui.mode !== 'scan') return;
    const list = candidates();
    if (!list.length) return;
    let i = list.findIndex((c) => c.building.id === ui.selectedId);
    if (i === -1) i = 0;
    // Wraps around: past the farthest building comes the nearest again, and the other way.
    const next = ((i + steps) % list.length + list.length) % list.length;
    if (next === i && ui.selectedId) return;   // only one building: nothing to turn to
    selectBuilding(list[next].building.id);
    click();
    clickLines.classList.add('on');
    setTimeout(() => clickLines.classList.remove('on'), 120);
  }

  function setDialAngle(a, dragging) {
    ui.dialAngle = a;
    detentsG.classList.toggle('dragging', !!dragging);
    detentsG.style.transform = `rotate(${a}deg)`;
  }

  // ======================================================================
  // DIAL: locking on, washroom, taps
  // ======================================================================
  function lockOn(building, kind) {
    if (!building) return;
    ui.mode = 'locked';
    ui.lockKind = kind;
    ui.selectedId = building.id;
    ui.wasArrived = false;
    setDestination(building);                 // js/distance.js picks the closest door
    if (state.distance !== null) {
      const fit = RANGES.findIndex((r) => state.distance <= r * 0.92);
      ui.rangeIndex = fit === -1 ? RANGES.length - 1 : fit;
      drawGrid();
    }
    click(2);
  }

  function letGo() {
    clearDestination();
    ui.mode = 'scan';
    click();
  }

  function toggleLock() {
    if (ui.mode === 'locked') { letGo(); return; }
    if (ui.mode !== 'scan') return;
    const c = selected();
    if (c) lockOn(c.building, 'building');
  }

  // Triple-tap: straight to the closest door of the nearest building with a washroom.
  function routeToWashroom() {
    if (ui.mode === 'off') return;
    if (state.lat === null) { flashHint('Waiting for GPS before finding a washroom.'); return; }
    const found = findNearestWashroom(state.lat, state.lon);   // js/distance.js
    if (!found) { flashHint('No washroom buildings found nearby.'); return; }
    if (ui.mode === 'locked') clearDestination();
    lockOn(found.building, 'washroom');
  }

  let taps = 0, tapTimer = null;
  function registerTap() {
    taps++;
    clearTimeout(tapTimer);
    if (taps >= 3) { taps = 0; routeToWashroom(); return; }
    tapTimer = setTimeout(() => {
      const n = taps; taps = 0;
      if (n >= 1) toggleLock();
    }, TAP_WINDOW_MS);
  }

  function flashHint(text) { ui.flash = { text, until: performance.now() + 2600 }; }

  // ======================================================================
  // GESTURES ON THE RADAR
  // ======================================================================
  const radar = $('radar');
  let drag = null;

  function centre() {
    const r = svg.getBoundingClientRect();
    return { x: r.left + r.width * CX / 340, y: r.top + r.height * CY / 370 };
  }
  function pointerAngle(e, c) { return Math.atan2(e.clientY - c.y, e.clientX - c.x) * 180 / Math.PI; }

  radar.addEventListener('pointerdown', (e) => {
    if (e.target.closest('#crown')) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    try { radar.setPointerCapture(e.pointerId); } catch (err) { /* capture is a nice-to-have */ }
    const c = centre();
    drag = { id: e.pointerId, c, x: e.clientX, y: e.clientY, last: pointerAngle(e, c), moved: false, acc: 0 };
  });

  radar.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < MOVE_PX) return;
    drag.moved = true;
    // Too close to the middle, the angle jumps around: ignore.
    if (Math.hypot(e.clientX - drag.c.x, e.clientY - drag.c.y) < 24) return;
    const a = pointerAngle(e, drag.c);
    const delta = norm180(a - drag.last);
    drag.last = a;
    if (ui.mode !== 'scan') return;          // the ring only turns while scanning
    setDialAngle(ui.dialAngle + delta, true);
    drag.acc += delta;
    while (drag.acc >= STEP_DEG) { drag.acc -= STEP_DEG; turn(+1); }   // clockwise: further away
    while (drag.acc <= -STEP_DEG) { drag.acc += STEP_DEG; turn(-1); }  // anticlockwise: closer
  });

  function endDrag(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const wasTap = !drag.moved;
    drag = null;
    setDialAngle(Math.round(ui.dialAngle / DETENT_DEG) * DETENT_DEG, false);   // settle into a notch
    if (wasTap && e.type === 'pointerup') registerTap();
  }
  radar.addEventListener('pointerup', endDrag);
  radar.addEventListener('pointercancel', endDrag);

  // Desktop: scroll wheel turns the dial.
  let wheelAcc = 0;
  radar.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (ui.mode !== 'scan') return;
    wheelAcc += e.deltaY;
    while (wheelAcc >= WHEEL_PX) { wheelAcc -= WHEEL_PX; setDialAngle(ui.dialAngle + STEP_DEG); turn(+1); }
    while (wheelAcc <= -WHEEL_PX) { wheelAcc += WHEEL_PX; setDialAngle(ui.dialAngle - STEP_DEG); turn(-1); }
  }, { passive: false });

  // Stop iOS double-tap zoom and long-press menus on the radar.
  radar.addEventListener('touchend', (e) => { if (!e.target.closest('#crown')) e.preventDefault(); }, { passive: false });
  radar.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('gesturestart', (e) => e.preventDefault());

  // ======================================================================
  // TOP BUTTON
  // ======================================================================
  const crown = $('crown');

  crown.addEventListener('click', async () => {
    capG.classList.add('pressed');
    setTimeout(() => capG.classList.remove('pressed'), 140);

    if (ui.mode !== 'off') {
      if (noSignal()) { retryLocation(); click(); return; }
      ui.rangeIndex = (ui.rangeIndex + 1) % RANGES.length;
      drawGrid();
      click();
      return;
    }
    await switchOn();
  });

  async function switchOn() {
    if (DEMO) { unlockAudio(); startDemo(); powerOn(); return; }

    // iOS only shows the motion prompt from inside a tap, so this runs first.
    const sensorsPromise = startSensors();
    unlockAudio();
    const ok = await sensorsPromise;

    if (!ok && state.sensorError !== 'unsupported') {
      const messages = {
        denied: 'Motion access was denied. Close this tab, open it again and tap Allow.',
        failed: 'Could not ask for motion access. Reload the page and try again.',
      };
      const err = $('startErr');
      err.textContent = messages[state.sensorError] || 'The compass did not start. Reload the page and try again.';
      err.hidden = false;
      return;
    }
    startLocation();
    powerOn();
    if (!ok) flashHint('No compass on this device, so north is always up. Try it on an iPhone outdoors.');
  }

  function powerOn() {
    ui.mode = 'scan';
    ui.startedAt = performance.now();
    crown.setAttribute('aria-label', 'Change range');
    $('intro').hidden = true;
    $('gps').hidden = false;
    $('searchBtn').hidden = false;
    click(2);
    radar.focus({ preventScroll: true });
  }

  // "No GPS" screen: pressing the top button asks for a position again.
  let retrying = false;
  function retryLocation() {
    if (retrying || !navigator.geolocation) return;
    retrying = true;
    ui.startedAt = performance.now();
    navigator.geolocation.getCurrentPosition((pos) => {
      retrying = false;
      state.lat = pos.coords.latitude;
      state.lon = pos.coords.longitude;
      state.accuracy = pos.coords.accuracy;
      state.locationError = null;
      notifyNewPosition();                     // js/location.js
    }, () => { retrying = false; }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  }

  function noSignal() {
    if (ui.mode === 'off' || state.lat !== null) return false;
    return state.locationError === 'denied' || performance.now() - ui.startedAt > NO_FIX_MS;
  }

  // ======================================================================
  // KEYBOARD
  // ======================================================================
  document.addEventListener('keydown', (e) => {
    if (ui.sheetOpen) {
      if (e.key === 'Escape') closeSheet();
      return;
    }
    if (e.target.tagName === 'INPUT') return;
    if (ui.mode === 'off') return;
    const k = e.key;
    if (k === 'ArrowRight' || k === 'ArrowDown') { setDialAngle(ui.dialAngle + STEP_DEG); turn(+1); }
    else if (k === 'ArrowLeft' || k === 'ArrowUp') { setDialAngle(ui.dialAngle - STEP_DEG); turn(-1); }
    else if (k === 'Enter' && e.target === radar) toggleLock();
    else if (k === 'w' || k === 'W') routeToWashroom();
    else if (k === 'r' || k === 'R') crown.click();
    else if (k === '/') { e.preventDefault(); openSheet(); }
    else return;
    e.preventDefault();
  });

  // ======================================================================
  // SEARCH SHEET
  // ======================================================================
  const q = $('q');
  const sheet = $('sheet');

  // The sheet has two stops: 'half' (the old height) and 'full' (up to the top of the screen).
  // Its position is --sheet-y, in px down from fully open.
  const DESKTOP_MQ = matchMedia('(min-width:900px) and (min-height:560px)');
  let sheetSnap = 'half';
  let sheetY = 0;

  function sheetHeight() { return sheet.offsetHeight || window.innerHeight; }
  function halfY() {
    const half = DESKTOP_MQ.matches ? Math.min(innerHeight * 0.7, 620) : Math.min(innerHeight * 0.56, 560);
    return Math.max(0, sheetHeight() - half);
  }
  function snapY(snap) { return snap === 'full' ? 0 : halfY(); }

  // Put the sheet at y (px). The scrim darkens as it nears the top.
  function placeSheet(y) {
    sheetY = y;
    sheet.style.setProperty('--sheet-y', y + 'px');
    const h = halfY() || 1;
    app.style.setProperty('--scrim', String(Math.max(0, Math.min(1, 1 - y / h))));
  }
  function setSnap(snap) {
    sheetSnap = snap;
    // At the half stop, pad the bottom so the last result isn't hidden below the screen.
    sheet.style.setProperty('--sheet-pad', (snap === 'half' ? halfY() : 0) + 'px');
    placeSheet(snapY(snap));
  }

  function openSheet(snap = 'half') {
    if (ui.mode === 'off') return;
    const wasOpen = ui.sheetOpen;
    ui.sheetOpen = true;
    setSnap(snap);
    app.classList.add('sheet-open');
    sheet.setAttribute('aria-hidden', 'false');
    renderResults();
    // Don't pop the phone keyboard over the slide-up; desktop gets focus straight away.
    if (!wasOpen) setTimeout(() => q.focus({ preventScroll: true }), DESKTOP_MQ.matches ? 60 : 360);
  }
  function closeSheet() {
    ui.sheetOpen = false;
    app.classList.remove('sheet-open');
    sheet.setAttribute('aria-hidden', 'true');
    q.blur();
    radar.focus({ preventScroll: true });
  }
  $('searchBtn').addEventListener('click', () => openSheet('half'));
  $('scrim').addEventListener('click', closeSheet);
  addEventListener('resize', () => { if (ui.sheetOpen) setSnap(sheetSnap); });

  // Swipe up from the bottom of the screen opens search. A long swipe goes straight to the top.
  let edge = null;
  app.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    if (!ui.sheetOpen && ui.mode !== 'off' && t.clientY > window.innerHeight - 110 && !e.target.closest('#radar')) {
      edge = { y: t.clientY, opened: false };
    } else edge = null;
  }, { passive: true });
  app.addEventListener('touchmove', (e) => {
    if (!edge) return;
    const dy = e.touches[0].clientY - edge.y;
    if (!edge.opened && dy < -40) { edge.opened = true; openSheet('half'); }
    if (edge.opened && dy < -window.innerHeight * 0.35 && sheetSnap !== 'full') setSnap('full');
  }, { passive: true });
  app.addEventListener('touchend', () => { edge = null; }, { passive: true });

  // Drag the sheet by its grabber or any bare part of it (not the field, buttons or list).
  // It follows the finger, then snaps to full, half or closed depending on where and how fast you let go.
  let sheetDrag = null;
  sheet.addEventListener('pointerdown', (e) => {
    if (!ui.sheetOpen) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const onGrabber = !!e.target.closest('#grabber');
    if (!onGrabber && e.target.closest('input, button, a, .field, .results')) return;
    try { sheet.setPointerCapture(e.pointerId); } catch (err) { /* nice-to-have */ }
    sheetDrag = { id: e.pointerId, y0: e.clientY, base: sheetY, lastY: e.clientY, lastT: e.timeStamp, v: 0, moved: false };
  });
  sheet.addEventListener('pointermove', (e) => {
    if (!sheetDrag || e.pointerId !== sheetDrag.id) return;
    const dy = e.clientY - sheetDrag.y0;
    if (!sheetDrag.moved && Math.abs(dy) < 4) return;
    if (!sheetDrag.moved) { sheetDrag.moved = true; sheet.classList.add('dragging'); q.blur(); }
    let y = sheetDrag.base + dy;
    if (y < 0) y = -Math.pow(-y, 0.7);            // a bit of rubber band past the top
    placeSheet(Math.min(y, sheetHeight()));
    const dt = e.timeStamp - sheetDrag.lastT;
    if (dt > 0) sheetDrag.v = 0.7 * sheetDrag.v + 0.3 * ((e.clientY - sheetDrag.lastY) / dt);   // px per ms
    sheetDrag.lastY = e.clientY; sheetDrag.lastT = e.timeStamp;
  });
  function endSheetDrag(e) {
    if (!sheetDrag || e.pointerId !== sheetDrag.id) return;
    const d = sheetDrag;
    sheetDrag = null;
    sheet.classList.remove('dragging');
    if (!d.moved) {
      // A tap on the grabber flips between half and full.
      if (e.target.closest && e.target.closest('#grabber')) setSnap(sheetSnap === 'full' ? 'half' : 'full');
      return;
    }
    const projected = sheetY + d.v * 180;          // where a flick would carry it
    const stops = [['full', 0], ['half', halfY()], ['closed', sheetHeight()]];
    let best = stops[0];
    for (const s of stops) if (Math.abs(projected - s[1]) < Math.abs(projected - best[1])) best = s;
    if (best[0] === 'closed') closeSheet();
    else setSnap(best[0]);
  }
  sheet.addEventListener('pointerup', endSheetDrag);
  sheet.addEventListener('pointercancel', endSheetDrag);

  let resultSignature = '';
  function renderResults() {
    const all = searchBuildings(q.value, state.lat, state.lon);   // js/search.js
    const results = (ui.washroomsOnly ? all.filter((r) => r.building.washroom) : all).slice(0, 40);
    const box = $('results');
    $('clearBtn').hidden = q.value === '';

    const signature = q.value + '|' + ui.washroomsOnly + '|' + results.map((r) =>
      r.building.id + (r.distance === null ? '' : Math.round(r.distance / 10))).join(',');
    if (signature === resultSignature && box.childElementCount) return;
    resultSignature = signature;
    box.textContent = '';

    if (!results.length) {
      const empty = document.createElement('p');
      empty.className = 'empty';
      empty.textContent = ui.washroomsOnly
        ? 'No building with a public washroom matches "' + q.value + '". Turn off Washrooms only to see every building.'
        : 'No building matches "' + q.value + '". Try part of the name, or a code like CAB.';
      box.appendChild(empty);
      return;
    }
    for (const { building, distance } of results) {
      const row = document.createElement('button');
      row.className = 'row';
      row.type = 'button';
      row.dataset.id = building.id;
      const n = document.createElement('span');
      n.className = 'n';
      const b = document.createElement('b');
      b.textContent = building.name;
      n.appendChild(b);
      if (building.code || building.washroom) {
        const s = document.createElement('span');
        if (building.code) s.textContent = building.code;
        if (building.washroom && !ui.washroomsOnly) {
          const w = document.createElement('em');
          w.textContent = 'Washrooms';
          s.appendChild(w);
        }
        n.appendChild(s);
      }
      row.appendChild(n);
      if (distance !== null) {
        const d = document.createElement('span');
        d.className = 'd';
        const f = formatDistance(distance);
        d.textContent = f.num + ' ' + f.unit;
        row.appendChild(d);
      }
      box.appendChild(row);
    }
  }

  q.addEventListener('input', () => { renderResults(); $('results').scrollTop = 0; });
  $('clearBtn').addEventListener('click', () => { q.value = ''; renderResults(); q.focus(); });
  $('results').addEventListener('click', (e) => {
    const row = e.target.closest('.row');
    if (!row) return;
    if (ui.mode === 'locked') clearDestination();
    ui.mode = 'scan';
    const building = BUILDINGS.find((b) => b.id === row.dataset.id);
    if (ui.washroomsOnly && building && !building.washroom) setWashroomsOnly(false);
    selectBuilding(row.dataset.id);
    closeSheet();
    click();
  });

  function setWashroomsOnly(on) {
    ui.washroomsOnly = on;
    $('wcChip').setAttribute('aria-pressed', String(on));
    $('filterTag').hidden = !on;
    candCache.key = '';
    if (on) {
      const first = candidates()[0];
      if (first && !(selected() && selected().building.washroom)) selectBuilding(first.building.id);
    }
    resultSignature = '';
    if (ui.sheetOpen) renderResults();
  }
  $('wcChip').addEventListener('click', () => setWashroomsOnly(!ui.washroomsOnly));
  $('filterTag').addEventListener('click', () => setWashroomsOnly(false));

  // ======================================================================
  // RENDER (every frame)
  // ======================================================================
  function polar(relDeg, metres) {
    const r = Math.min(R_DRAW, (metres / range()) * R_GLASS);
    const a = relDeg * Math.PI / 180;
    return { x: CX + Math.sin(a) * r, y: CY - Math.cos(a) * r, clipped: (metres / range()) * R_GLASS > R_DRAW };
  }

  let blipSignature = '';
  function drawBlips(items) {
    const sig = items.map((b) => `${b.x.toFixed(1)},${b.y.toFixed(1)},${b.kind},${b.label || ''}`).join('|');
    if (sig === blipSignature) return;
    blipSignature = sig;
    blipsG.textContent = '';
    for (const b of items) {
      const big = b.kind === 'target' || b.kind === 'arrive';
      const size = big ? 20 : 13;
      if (big) {
        for (const p of ['p1', 'p2', 'p3']) {
          el('circle', { class: 'pulse ' + p, cx: b.x, cy: b.y, r: 34, fill: 'none', stroke: '#FFF3A6', 'stroke-width': 2.5 }, blipsG);
        }
      }
      if (b.kind === 'selected') {
        el('circle', { cx: b.x, cy: b.y, r: 17, fill: 'none', stroke: '#FFF3A6', 'stroke-width': 2.5 }, blipsG);
      }
      const dim = b.kind === 'dim' ? 0.3 : 1;
      el('circle', { cx: b.x, cy: b.y, r: size * 0.85, fill: '#FFD21A', opacity: 0.9 * dim, filter: 'url(#glow)' }, blipsG);
      el('circle', { cx: b.x, cy: b.y, r: size / 2, fill: '#FFFBE0', stroke: '#F2B705', 'stroke-width': 1.5, opacity: dim }, blipsG);
      if (b.label) {
        // Near the right edge the name goes on the left so the glass doesn't cut it off.
        const left = b.x > CX + 60;
        const t = el('text', { class: 'blabel', x: left ? b.x - size / 2 - 4 : b.x + size / 2 + 4, y: b.y - size / 2 + 1,
          'text-anchor': left ? 'end' : 'start' }, blipsG);
        t.textContent = b.label;
      }
    }
  }

  function shortLabel(building) {
    return building.code || building.name.split(' ')[0];
  }

  function renderRadar(mode) {
    // The grid stays lined up with real north, so it turns as you turn.
    gridG.setAttribute('transform', `rotate(${-state.heading} ${CX} ${CY})`);
    rangeText.style.display = mode === 'off' || mode === 'nosignal' || mode === 'arrived' ? 'none' : '';
    glassMsg.textContent = mode === 'nosignal' ? 'No GPS fix' : '';

    const items = [];
    if (mode === 'scan') {
      const list = candidates();
      const sel = selected();
      // While typing in search, dots that don't match fade out.
      const matching = ui.sheetOpen && q.value.trim() !== ''
        ? new Set(searchBuildings(q.value, null, null).map((r) => r.building.id)) : null;
      let drawn = 0;
      for (const c of list) {
        const isSel = sel && c.building.id === sel.building.id;
        if (matching && !matching.has(c.building.id) && !isSel) {
          if (c.distance > range() || drawn >= MAX_BLIPS) continue;
          const p = polar(bearingDeg(state.lat, state.lon, c.door.lat, c.door.lon) - state.heading, c.distance);
          items.push({ x: p.x, y: p.y, kind: 'dim', label: '' });
          drawn++;
          continue;
        }
        if (!isSel && (c.distance > range() || drawn >= MAX_BLIPS)) continue;
        const rel = bearingDeg(state.lat, state.lon, c.door.lat, c.door.lon) - state.heading;
        const p = polar(rel, c.distance);
        // Only the closest few get a name, so the glass stays readable.
        const label = isSel || drawn < MAX_LABELS ? shortLabel(c.building) : '';
        items.push({ x: p.x, y: p.y, kind: isSel ? 'selected' : 'idle', label });
        drawn++;
      }
      // Draw the selected one last so its ring sits on top.
      items.sort((a, b) => (a.kind === 'selected') - (b.kind === 'selected'));
    } else if (mode === 'locked' && state.target && state.distance !== null) {
      const p = polar(state.relAngle, state.distance);            // js/angle.js keeps relAngle smooth
      items.push({ x: p.x, y: p.y, kind: 'target', label: shortLabel(state.destination) });
    } else if (mode === 'arrived') {
      items.push({ x: CX, y: CY - 2, kind: 'arrive' });
    }
    drawBlips(items);
  }

  function setText(id, text) {
    const node = $(id);
    if (node.textContent !== text) node.textContent = text;
  }
  function showNode(id, on) { const n = $(id); if (n.hidden === on) n.hidden = !on; }

  function renderCard(mode) {
    const card = $('card');
    if (mode === 'off') { showNode('card', false); return; }
    showNode('card', true);
    card.classList.toggle('big', mode === 'locked');
    card.classList.toggle('here', mode === 'arrived');

    let kicker = '', name = '', code = '', sub = '', dist = null, eta = '';

    if (mode === 'nosignal') {
      name = 'We can’t find you yet';
      sub = state.locationError === 'denied'
        ? 'Location is blocked for this site. Allow it in Settings, then reload the page.'
        : 'Step outside, away from tall buildings, and hold still for a few seconds. GPS doesn’t work indoors.';
    } else if (mode === 'waiting') {
      name = 'Finding your position';
      sub = 'This takes a few seconds outdoors.';
    } else if (mode === 'arrived') {
      name = 'You’re here';
      sub = state.destination.name + ', ' + doorLabel(state.destination, state.target);
    } else if (mode === 'locked') {
      const b = state.destination;
      kicker = (ui.lockKind === 'washroom' ? 'Nearest washroom, ' : 'Locked on, ') + doorLabel(b, state.target);
      name = b.name; code = b.code || '';
      if (state.distance !== null) { dist = state.distance; eta = minutesText(state.distance).replace(' walk', ''); }
    } else {
      const c = selected();
      if (c) {
        const first = candidates()[0];
        if (ui.washroomsOnly && first && first.building.id === c.building.id) kicker = 'Nearest public washroom';
        name = c.building.name; code = c.building.code || '';
        dist = c.distance; eta = minutesText(c.distance);
      } else {
        name = ui.washroomsOnly ? 'No washroom buildings in range' : 'No buildings in range';
        sub = 'Press the top button for a longer range.';
      }
    }

    setText('kicker', kicker); showNode('kicker', !!kicker);
    setText('name', name);
    setText('code', code); showNode('code', !!code);
    setText('sub', sub); showNode('sub', !!sub);
    showNode('distRow', dist !== null);
    if (dist !== null) {
      const f = formatDistance(dist);
      setText('distNum', f.num); setText('distUnit', f.unit); setText('eta', eta);
    }
  }

  // The one line under the card: a warning if there is one, otherwise how to use the dial.
  let lastDoor = null, doorNoticeUntil = 0;
  function renderHint(mode) {
    if (mode === 'off') { showNode('hint', false); return; }
    showNode('hint', true);
    const now = performance.now();
    let text = '';
    if (ui.flash && now < ui.flash.until) text = ui.flash.text;
    else if (mode === 'nosignal') text = 'Press the top button to try again.';
    else if (mode === 'waiting') text = 'Hold on while the radar finds you.';
    else if (mode === 'arrived') text = 'Tap the radar to scan again.';
    else if (!DEMO && state.tilted) text = 'Hold your phone flat.';
    else if (!DEMO && state.needsCalibration) text = 'Compass is jumpy. Wave your phone in a figure-8.';
    else if (mode === 'locked' && now < doorNoticeUntil) text = 'Switched to a closer entrance.';
    else if (state.accuracy !== null && state.accuracy > WEAK_GPS_M) text = 'GPS is weak here, so distances may be off.';
    else if (mode === 'locked') text = 'Walk toward the light. Tap the radar to let go.';
    else if (ui.washroomsOnly) text = 'Turn the dial for the next closest. Tap the top-left tag to show all buildings.';
    else text = 'Swipe around the radar to turn the dial. Tap to lock on, triple-tap for the nearest washroom.';
    setText('hint', text);
  }

  function renderGps() {
    const pill = $('gps');
    const led = pill.firstElementChild;
    let cls = '', text = 'Finding GPS';
    if (state.locationError === 'denied') { cls = 'bad'; text = 'Location blocked'; }
    else if (state.accuracy !== null) {
      cls = state.accuracy > WEAK_GPS_M ? 'weak' : 'good';
      text = 'GPS ±' + Math.round(state.accuracy) + ' m';
    } else if (noSignal()) { cls = 'bad'; text = 'No GPS'; }
    led.className = 'led ' + cls;
    setText('gpsText', text);
  }

  function currentMode() {
    if (ui.mode === 'off') return 'off';
    if (state.lat === null) return noSignal() ? 'nosignal' : 'waiting';
    if (ui.mode === 'locked') return state.arrived ? 'arrived' : 'locked';
    return 'scan';
  }

  // ======================================================================
  // MAIN LOOP (every screen frame)
  // ======================================================================
  let lastFrame = performance.now();

  function frame(now) {
    const dt = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;
    if (DEMO && ui.mode !== 'off') demoTick(dt);
    updateAngle();                            // js/angle.js: state.bearing and state.relAngle

    // Pick the nearest building as soon as we know where you are.
    if (ui.mode === 'scan' && !selected() && state.lat !== null) {
      const first = candidates()[0];
      if (first) ui.selectedId = first.building.id;
    }

    // Arrival: flash the glass once.
    if (ui.mode === 'locked' && state.arrived && !ui.wasArrived) {
      flashCircle.classList.remove('go'); void flashCircle.getBoundingClientRect(); flashCircle.classList.add('go');
      click(2);
    }
    ui.wasArrived = ui.mode === 'locked' && state.arrived;

    // Notice when distance.js switches to a closer door.
    if (ui.mode === 'locked' && state.target) {
      if (lastDoor !== null && state.target.index !== lastDoor && !state.target.approx) doorNoticeUntil = now + 3000;
      lastDoor = state.target.index;
    } else lastDoor = null;

    const mode = currentMode();
    if (app.dataset.mode !== mode) app.dataset.mode = mode;
    renderRadar(mode);
    renderCard(mode);
    renderHint(mode);
    if (ui.mode !== 'off') renderGps();
    if (ui.sheetOpen && now - lastResults > 2000) { lastResults = now; renderResults(); }

    requestAnimationFrame(frame);
  }
  let lastResults = 0;
  requestAnimationFrame(frame);

  // ======================================================================
  // DEMO MODE (index.html?demo): fake GPS + compass for a table demo
  // ======================================================================
  let demoWalking = false;

  function startDemo() {
    state.lat = DEMO_START.lat;
    state.lon = DEMO_START.lon;
    state.accuracy = 5;
    state.heading = 0;
    state.started = true;
    $('demo').hidden = false;
  }

  function demoTick(dt) {
    // While walking and locked on, steer toward the door like a person would.
    if (demoWalking && state.bearing !== null && state.target) {
      const diff = norm180(state.bearing - state.heading);
      const step = Math.max(-120 * dt, Math.min(120 * dt, diff));
      state.heading = (state.heading + step + 360) % 360;
      $('demoTurn').value = Math.round(state.heading);
    }
    setText('demoHead', 'Facing ' + Math.round(state.heading) + '°');
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
    $('demoWalk').textContent = on ? 'Stop' : 'Walk';
  }

  if (DEMO) {
    $('demoTurn').addEventListener('input', (e) => { state.heading = +e.target.value; });
    $('demoWalk').addEventListener('click', () => setDemoWalking(!demoWalking));
  }

})();
