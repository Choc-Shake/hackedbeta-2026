// Checks the maths without a phone. Run from the repo root:  node tools/logic.test.js
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const ctx={Math,console};vm.createContext(ctx);
for(const f of['js/state.js','js/buildings.js','js/angle.js','js/distance.js','js/search.js'])
  vm.runInContext(fs.readFileSync(f,'utf8'),ctx,{filename:f});
const g=n=>vm.runInContext(n,ctx);
const state=g('state'),B=g('BUILDINGS');let n=0;const ok=(c,m)=>{assert(c,m);n++;};
const by=c=>B.find(b=>b.code===c);
// distance: 1 deg latitude ~ 111.2 km; known pair
ok(Math.abs(ctx.distanceM(53,-113,54,-113)-111195)<50,'haversine 1deg');
ok(ctx.distanceM(53.5,-113.5,53.5,-113.5)===0,'zero');
// CAB two doors: east door vs west door
const cab=by('CAB');const east=cab.entrances.reduce((a,b)=>a.lon>b.lon?a:b),west=cab.entrances.reduce((a,b)=>a.lon<b.lon?a:b);
let e=ctx.nearestEntrance(cab,east.lat,east.lon+0.0005);ok(e.lon===east.lon&&!e.approx,'nearest = east door from the east');
e=ctx.nearestEntrance(cab,west.lat,west.lon-0.0005);ok(e.lon===west.lon,'nearest = west door from the west');
ok(Math.abs(e.distance-0.0005*111320*Math.cos(53.5267*Math.PI/180))<0.5,'distance ~33 m');
// outline building: Butterdome. Point 100 m north of its north edge
const bd=B.find(b=>b.name.includes('Butterdome'));const maxLat=Math.max(...bd.outline[0].map(p=>p[0]));
e=ctx.nearestEntrance(bd,maxLat+100/111320,bd.lon);ok(e.approx&&e.index===-1,'outline approx');ok(Math.abs(e.distance-100)<8,'outline distance ~100 got '+e.distance);
e=ctx.nearestEntrance(bd,bd.lat,bd.lon);ok(e.distance>10,'inside building: wall is some metres away');
// every building yields a target
for(const b of B){const t=ctx.nearestEntrance(b,53.5262,-113.5252);ok(t&&isFinite(t.distance)&&t.distance<2500,'target for '+b.name);}
// guidance flow: walk toward CAB west door from 60 m west
state.lat=west.lat;state.lon=west.lon-60/(111320*Math.cos(west.lat*Math.PI/180));
ctx.setDestination(cab);ok(state.target.lon===west.lon&&Math.abs(state.distance-60)<1&&!state.arrived,'start 60 m');
ctx.updateAngle();ok(Math.abs(state.bearing-90)<1,'bearing east, got '+state.bearing);
state.heading=0;for(let i=0;i<200;i++)ctx.updateAngle();ok(Math.abs(state.relAngle-90)<1,'arrow right when facing north');
state.heading=90;for(let i=0;i<200;i++)ctx.updateAngle();ok(Math.abs(state.relAngle)<1,'arrow up when facing it');
const step=m=>{state.lon+=m/(111320*Math.cos(west.lat*Math.PI/180));ctx.updateDistance();};
step(45);ok(!state.arrived&&Math.abs(state.distance-15)<1,'15 m: not arrived');
step(6);ok(state.arrived,'9 m: arrived');
step(-4);ok(state.arrived,'13 m: still arrived (hysteresis)');
step(-5);ok(!state.arrived,'18 m: left');
// door switching hysteresis: midway between the two doors
const mid=(east.lon+west.lon)/2;state.lat=west.lat-0.0003;state.lon=west.lon;ctx.setDestination(cab);
ok(state.target.index===cab.entrances.indexOf(west),'picks west');
state.lon=mid+0.00002;ctx.updateDistance();ok(state.target.index===cab.entrances.indexOf(west),'sticks to west when east only slightly closer');
state.lon=east.lon;ctx.updateDistance();ok(state.target.index===cab.entrances.indexOf(east),'switches when east clearly closer');
ctx.clearDestination();ok(state.target===null&&state.destination===null,'clear');
// washroom
const w=ctx.findNearestWashroom(by('SUB').entrances[0].lat,by('SUB').entrances[0].lon);ok(w.building.code==='SUB'&&w.distance<1,'washroom at SUB door = SUB');
const lot=ctx.findNearestWashroom(53.5213,-113.5277);ok(lot.building.washroom,'washroom from Jubilee car park: '+lot.building.name);
// search
const s=(q,la,lo)=>ctx.searchBuildings(q,la,lo).map(r=>r.building);
ok(s('cab')[0].code==='CAB','cab');ok(s('ETLC')[0].code==='ETLC','etlc');ok(s('butterdome')[0].name.includes('Butterdome'),'butterdome');
ok(s('cameron')[0].code==='CAM','cameron');ok(s('students union')[0].code==='SUB',"students' union");ok(s('nipisiy').length===1,'accents');
ok(s('tory').length>=2&&s('tory').every(b=>/tory/i.test(b.name)),'tory');ok(s('sub')[0].code==='SUB','sub');
ok(s('zzzz').length===0,'no match');ok(s('').length===B.length,'empty = all');ok(s('ed')[0].code.startsWith('ED'),'ed');
ok(s('hospital')[0].code==='WMC','hospital alias');ok(s('lister')[0].name==='Lister Centre','lister');
const near=ctx.searchBuildings('',cab.lat,cab.lon);ok(near[0].building.code==='CAB'&&near[0].distance<near[5].distance,'empty query sorted by distance');
console.log('ALL',n,'CHECKS PASSED');
