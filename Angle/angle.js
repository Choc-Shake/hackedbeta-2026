//Angle : bearing + relative angle for the toilet icon 
//Setup
const D = Math.pi/180

function bearingDeg(lat1, lon1, lat2, lon2){
const φ1 = lat1*D, φ2 = lat2*D, Δλ = (lon2-lon1)*D;
const y = Math.sin(Δλ)*Math.cos(φ2);
const x = Math.cos(φ1)*Math.sin(φ2) - Math.sin(φ1)*Math.cos(φ2)*Math.cos(Δλ);
return (Math.atan2(y, x)/D + 360) % 360;

}

function angleDiff(a,b){

    return ((a - b+ 540) % 360) - 180;
}

// Angle that is seen on the screen
let visualAngle = 0;

// Run this code every frame
function updateAngle(){
    // Nothing to point at until nearest washroom is found
    if (state.lat === null || state.target === null)
        return;
    // which compass direction to use based on nearest washroom
    state.bearing = bearingDeg(state.lat, state.lon, state.target.lat, state.target.lon);

    // compass direction relative to your phone
    const targetAngle = angleDiff(state.bearing, state.heading);

    // Smoothing: every frame move 15% toward the target angle
    visualAngle += angleDiff(targetAngle, visualAngle) * 0.15;
    visualAngle = angleDiff(visualAngle, 0);   // keep it in -180..180
    state.relAngle = shownAngle;
}