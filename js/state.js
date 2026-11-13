// js/state.js — the ONLY thing modules share
const state = {
  started: false,                         // Sensors
  lat: null, lon: null, accuracy: null,   // Location (metres)
  heading: 0,                             // Sensors (deg, 0 = north, clockwise)
  locked: false,                          // Sensors (true once Lock north tapped; heading is gyro-based)
  target: null,                           // Distance (nearest washroom object)
  distance: null,                         // Distance (metres)
  arrived: false,                         // Distance
  bearing: null,                          // Angle (deg from north to washroom)
  relAngle: 0                             // Angle (deg, where to draw the toilet)
};
