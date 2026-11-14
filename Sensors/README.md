# Sensors — status for teammates

**Project is now Campus Compass (outdoors).** See the root `README.md`. Outdoors the plain
compass is accurate, so the app does not show Lock north; `lockNorth()` still exists.
New setting: `MAGNETIC_DECLINATION` in `js/sensors.js` (see Planned).

Owner: Ishaan (Sensors). Code: `js/sensors.js`. Test page: `Sensors/sensor-test.html`.
iPhone Safari only for now.

## What it provides
Writes to the shared `state` object (from `js/state.js`):

| Field | Meaning |
|---|---|
| `state.heading` | Degrees clockwise from **true north**, 0–360, live, smoothed every frame. |
| `state.locked` | `true` once `lockNorth()` was called; heading is then gyro-based and reliable indoors. |
| `state.tilted` | `true` when the phone is tilted more than 25° from flat; UI should say "hold your phone flat". |
| `state.steps` | Walking steps detected since Start. |
| `state.needsCalibration` | `true` when the compass jumped >45° three times in 3 s; UI says "wave your phone in a figure-8". |
| `state.started` | `true` after `startSensors()` succeeds. |
| `state.sensorError` | `null`, `'unsupported'`, `'denied'`, `'nocompass'` or `'failed'`. |

Functions (globals):
- `startSensors()` → `Promise<boolean>`. **Must be called inside a tap/click handler** (iOS permission rule).
- `lockNorth()` → `boolean`. Call where the compass is accurate (outside / building entrance).
- `Sensors.init()` = `startSensors()`. `Sensors.onStep(fn)` → `fn(heading)` on every step.
  `Sensors.raw` = live raw readings (debug only; also available as `sensorDebug`).
- Settings at the top of `js/sensors.js`: `FAKE_HEADING` (desk testing), `SMOOTHING`,
  `STEP_THRESHOLD`, calibration limits.
- All internals are inside an IIFE, so names like `angleDiff` don't clash with `js/angle.js`.

## Load order
```html
<script src="js/state.js"></script>
<script src="js/buildings.js"></script>
<script src="js/location.js"></script>
<script src="js/sensors.js"></script>
```
`state` is a top-level `const` in `state.js`; `sensors.js` must load after it.

## Why "lock north" exists
Inside Commons the magnetometer is bent by the building (measured >100° off, while iOS still
reported ±13° accuracy). Outside it is accurate. So: lock once where the compass is good,
then heading = gyroscope rotation (`360 - alpha`) + stored offset, which ignores magnetic
interference. Gyro drift is a few degrees per minute: fine for a short walk.

**Implication for Location/Angle/UI:** before `state.locked` is true, treat `state.heading`
as unreliable indoors and prompt the user to lock at the entrance.

## Done
- Permission on tap, compass reading, accuracy readout
- Gyro + lock-north offset (tested indoors: works)
- `startSensors()` / `lockNorth()` API, no DOM inside `sensors.js`
- Moved to `js/sensors.js`, uses shared `js/state.js` (added `locked: false` there)
- Error handling via `state.sensorError`
- Tilt warning via `state.tilted` (from `beta`/`gamma`, limit 25°)
- Heading smoothing, step detection (`state.steps`, `Sensors.onStep`), screen wake lock,
  calibration flag, `FAKE_HEADING` for desk testing

## Planned
- Confirm true vs magnetic north on a north-south road. If the heading reads ~347 when
  facing true north, set `MAGNETIC_DECLINATION = 13` in `js/sensors.js`.

Shelved: auto-lock. A version that locked when compass accuracy, GPS accuracy and
compass−gyro steadiness were all good was tried and reverted: indoors near windows it
passed all checks while standing still and locked to the wrong north. Possible future fix:
require the user to turn ~45° and check compass and gyro turn by the same amount.
That was for the old indoor idea; outdoors no lock is needed.

## Notes
- `sensorDebug` (global) holds raw compass/gyro/accuracy/offset for test pages only; not shared state.
- Bump `?v=N` on script tags after changes; GitHub Pages caches JS for 10 minutes.
