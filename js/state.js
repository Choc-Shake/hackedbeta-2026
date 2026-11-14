// js/state.js — the ONLY thing modules share
const state = {
  started: false,                         // Sensors
  lat: null, lon: null, accuracy: null,   // Location (metres)
  heading: 0,                             // Sensors (deg, 0 = north, clockwise)
  locked: false,                          // Sensors (true once Lock north tapped; heading is gyro-based)
  tilted: false,                          // Sensors (true = phone not flat; UI says "hold your phone flat")
  destination: null,                      // Distance (the building picked, from BUILDINGS)
  target: null,                           // Distance (the entrance we're guiding to: {lat, lon, name, main, approx...})
  distance: null,                         // Distance (metres)
  arrived: false,                         // Distance
  bearing: null,                          // Angle (deg from north to the entrance)
  relAngle: 0                             // Angle (deg, which way the arrow points; 0 = straight ahead)
};
