// js/location.js — Person 2 (Location), simple version
const FAKE_POSITION = null; // or { lat: 53.525325, lon: -113.523570 } for desk testing

state.locationError = null;

function startLocation() {
  if (FAKE_POSITION) {
    state.lat = FAKE_POSITION.lat;
    state.lon = FAKE_POSITION.lon;
    state.accuracy = 5;
    notifyNewPosition();
    return;
  }

  navigator.geolocation.watchPosition(
    pos => {
      state.lat = pos.coords.latitude;
      state.lon = pos.coords.longitude;
      state.accuracy = pos.coords.accuracy;
      state.locationError = null;
      notifyNewPosition();
    },
    err => {
      if (err.code === err.PERMISSION_DENIED) state.locationError = 'denied';
    },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
  );
}

function notifyNewPosition() {
  if (typeof updateDistance === 'function') updateDistance();
}