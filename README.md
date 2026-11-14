# Campus Compass (HackED Beta 2026)

Search a UAlberta building, then follow the arrow to its **closest entrance**.
A 🚻 button guides you to the nearest building with public washrooms.

Plain HTML/CSS/JS. No backend, no build step, hosted on GitHub Pages. iPhone Safari, outdoors.

**Live:** https://choc-shake.github.io/hackedbeta-2026/
**Demo without a phone:** https://choc-shake.github.io/hackedbeta-2026/?demo

## How it works

1. **Start** asks for motion (compass) and location (GPS). iOS only allows this after a tap.
2. **Search** filters 88 campus buildings by name, code (CAB, ETLC) or nickname (Butterdome).
3. **Guide** picks the closest door, shows an arrow and the metres left, and says
   "You're here" within 10 m. If another door becomes clearly closer as you walk, it switches.

All modules talk through one shared object, `state` (`js/state.js`):

| File | Role | Writes to `state` |
|---|---|---|
| `js/location.js` | Location: GPS position | `lat`, `lon`, `accuracy`, `locationError` |
| `js/sensors.js` | Sensors: compass heading, tilt, calibration | `heading`, `tilted`, `needsCalibration`, `sensorError` |
| `js/distance.js` | Distance: closest entrance, metres, arrival | `destination`, `target`, `distance`, `arrived` |
| `js/angle.js` | Angle: bearing to the entrance, arrow angle | `bearing`, `relAngle` |
| `js/search.js` | UI: search ranking | (nothing) |
| `js/app.js` | UI: screens, buttons, drawing, demo mode | (reads only) |
| `js/buildings.js` | Data: buildings, entrances, washroom flags | (data) |

Script load order is at the bottom of `index.html`: state, data, modules, then `app.js`.

## Data

`js/buildings.js` is a one-time export from OpenStreetMap, made with
`tools/build_buildings.py` (the app never calls OpenStreetMap).

- 88 buildings, 315 entrances. Emergency exits and private doors are removed.
- 13 buildings have no doors mapped yet (Lister, Butterdome, PAW...). For those the app
  guides to the **nearest wall** and says so. Add real doors to their `entrances` to fix.
- `washroom: true` is hand-picked. Please double-check it.
- Codes come from OpenStreetMap plus a few we added.

Map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), ODbL.

## Testing

- **Maths, no phone:** `node tools/logic.test.js` (distance, closest door, arrival, search).
- **Demo mode:** add `?demo` to the address. A slider turns you, Walk moves you,
  Auto-steer follows the arrow. Works on a laptop.
- **Real test:** open the live link on an iPhone, outside, and walk to a building.

## Settings worth knowing

| Where | Setting | Meaning |
|---|---|---|
| `js/distance.js` | `ARRIVE_RADIUS_M = 10` | "You're here" distance. Raise it if GPS is too rough to trigger. |
| `js/distance.js` | `SWITCH_MARGIN_M = 6` | How much closer another door must be before we switch. |
| `js/sensors.js` | `MAGNETIC_DECLINATION = 0` | Set to 13 if the arrow is consistently ~13° off (magnetic vs true north). |
| `js/location.js` | `FAKE_POSITION` | Fake GPS for desk testing. |
| `js/sensors.js` | `FAKE_HEADING` | Fake compass for desk testing. |

## History

We started as "Crap Map", a compass to the nearest washroom inside University Commons.
GPS doesn't work indoors and the building's steel bends the compass, so we moved outdoors.
The old pages are in `archive/commons/`. Module test pages: `Sensors/sensor-test.html`,
`Angle/test-angle.html`.

## Team rules

`git pull --rebase` before every `git push`. Never `--force`. Bump `?v=N` on a script tag
when you change that file (GitHub Pages caches JS for 10 minutes).
