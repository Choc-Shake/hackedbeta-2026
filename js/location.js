// js/location.js — Person 2 (Location), simple version
// Job: get the phone's position and write it into the shared `state` object.
// Writes: state.lat, state.lon, state.accuracy, state.locationError
// Other files use: startLocation() (Sensors calls it when Start is tapped)


// null will use the phone's real GPS location
const FAKE_POSITION = null;



// A test to see if the user has allowed location
state.locationError = null;


// Turns on location tracking
function startLocation() {

  // If a fake position is set, copy it into state and stop here.
  // `return` leaves the function, so the real GPS code below never runs.
  if (FAKE_POSITION) {
    state.lat = FAKE_POSITION.lat;
    state.lon = FAKE_POSITION.lon;
    state.accuracy = 5;            // pretend the fake position is accurate to 5 m
    notifyNewPosition();           // tell Distance to recalculate
    return;
  }

  // navigator.geolocation is built into the browser (no import needed).
  // watchPosition keeps tracking you: every time the phone gets a new fix. Built in from google
  // (about once a second outdoors, less often indoors), it runs the first
  // function below. If something goes wrong, it runs the second one.
  navigator.geolocation.watchPosition(

    // 1) SUCCESS: runs on every new reading. `pos` is the reading the phone gives us.
    //    `pos => { ... }` is an arrow function, like a Python lambda but with a body.
    pos => {
      state.lat = pos.coords.latitude;        // north/south position, in degrees
      state.lon = pos.coords.longitude;       // east/west position, in degrees
      state.accuracy = pos.coords.accuracy;   // "you're probably within this many metres"
      state.locationError = null;             // a reading arrived, so location is working
      notifyNewPosition();                    // tell Distance to recalculate
    },

    // 2) ERROR: runs when the phone can't get a position.
    //    Only "permission denied" needs action: the user blocked location, so the UI
    //    should tell them. Other errors (like a timeout indoors) are ignored,
    //    because the phone keeps trying by itself.
    err => {
      if (err.code === err.PERMISSION_DENIED) state.locationError = 'denied';
    },

    // 3) OPTIONS: how we want the phone to track us.
    {
      enableHighAccuracy: true,   // use real GPS + Wi-Fi, not a rough guess
      maximumAge: 0,              // never give us an old saved position
      timeout: 20000              // report a timeout after 20 s with no fix (milliseconds)
    }
  );
}


// Tells the Distance person's code that the position changed, so it can
// recalculate the nearest washroom and how far away it is.
// `typeof updateDistance === 'function'` checks the function exists first,
// so this file still works on test pages that don't load Distance's code.
function notifyNewPosition() {
  if (typeof updateDistance === 'function') updateDistance();
}