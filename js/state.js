// js/state.js — the ONLY thing modules share
const state = {
  started: false,                         // Sensors
  lat: null, lon: null, accuracy: null,   // Location (metres)
  heading: 0,                             // Sensors (deg, 0 = north, clockwise)
  target: null,                           // Distance (nearest washroom object)
  distance: null,                         // Distance (metres)
  arrived: false,                         // Distance
  bearing: null,                          // Angle (deg from north to washroom)
  relAngle: 0                             // Angle (deg, where to draw the toilet)
};
