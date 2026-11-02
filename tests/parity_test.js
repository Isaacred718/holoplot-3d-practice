const fs = require('fs');
const path = require('path');

// Load app.js and extract HP_compute
const appPath = path.join(__dirname, '..', 'app.js');
const appCode = fs.readFileSync(appPath, 'utf8');

// Extract HP_compute function
const startIdx = appCode.indexOf('function HP_compute');
if(startIdx === -1){
  console.error('HP_compute not found');
  process.exit(1);
}
// Find the end of function (next function at same level)
let braceCount = 0;
let inFunction = false;
let endIdx = startIdx;
for(let i = startIdx; i < appCode.length; i++){
  if(appCode.substr(i, 8) === 'function' && i > startIdx && braceCount === 0){
    // check if it's at top level
    break;
  }
  if(appCode[i] === '{'){ braceCount++; inFunction = true; }
  if(appCode[i] === '}'){ 
    braceCount--; 
    if(inFunction && braceCount === 0){
      endIdx = i + 1;
      break;
    }
  }
}

const hpCode = appCode.substring(startIdx, endIdx);

// Need helper functions
const helpers = `
${hpCode}

function hVenueById(id){
  const VENUES = [
    {id:"theatre",label:"Theatre — 800 cap",w:36,d:38,zones:[{name:"Stalls",x:-13,y:10,w:26,h:18},{name:"Balcony",x:-11,y:30,w:22,h:6}]},
    {id:"arena",label:"Arena Bowl",w:56,d:48,zones:[{name:"Floor",x:-16,y:14,w:32,h:20},{name:"Lower Bowl",x:-24,y:36,w:48,h:8}]},
    {id:"church",label:"Worship — Long Nave",w:22,d:44,zones:[{name:"Nave",x:-8,y:10,w:16,h:28},{name:"Choir",x:-6,y:40,w:12,h:4}]},
    {id:"festival",label:"Outdoor Festival",w:60,d:55,zones:[{name:"Main Field",x:-25,y:15,w:50,h:32}]},
    {id:"corp",label:"Corporate Ballroom",w:30,d:26,zones:[{name:"Seating",x:-12,y:8,w:24,h:15}]}
  ];
  for(let i=0;i<VENUES.length;i++) if(VENUES[i].id === id) return VENUES[i];
  return VENUES[0];
}

function hZoneTarget(name){
  if(name === "Balcony" || name === "Lower Bowl") return {target: 82, tol: 4};
  if(name === "Choir") return {target: 78, tol: 4};
  return {target: 80, tol: 5};
}

const H_RES_STEP = {low:4, high:1};
`;

eval(helpers);

// Default design as per spec
const defaultDesign = {
  venueId: 'theatre',
  arrays: [
    {id:'A1', name:'Array L', model:'L', x:-6, y:4, on:true, beams:[{az:-10, tilt:0, hBeam:28, vBeam:18, gain:0, zone:'', layer:'Main'}]},
    {id:'A2', name:'Array R', model:'R', x:6, y:4, on:true, beams:[{az:10, tilt:0, hBeam:28, vBeam:18, gain:0, zone:'', layer:'Main'}]},
    {id:'A3', name:'Centre', model:'Centre', x:0, y:4, on:false, beams:[{az:0, tilt:8, hBeam:20, vBeam:12, gain:-3, zone:'', layer:'Main'}]},
    {id:'A4', name:'Balcony', model:'Balcony', x:0, y:4, on:false, beams:[{az:0, tilt:8, hBeam:20, vBeam:12, gain:-3, zone:'', layer:'Balcony'}]}
  ],
  zoneTargets: {},
  layerOn: {Main:true, Balcony:true, Fill:true}
};

const res = HP_compute(defaultDesign, 1);
console.log('avg', res.stats.avg);
console.log('coverage', res.stats.coverage);
console.log('spill', res.stats.spill);
if(Math.abs(res.stats.avg - 74.1) < 0.5 && res.stats.coverage === 22 && res.stats.spill === 10){
  console.log('PASS');
  process.exit(0);
} else {
  console.log('FAIL');
  process.exit(1);
}
