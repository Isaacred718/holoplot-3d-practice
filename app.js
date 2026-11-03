// Holoplot 3D — Venue Planner (Practice) v1
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

// VENUES from reference
const VENUES = [
  {id:"theatre",label:"Theatre — 800 cap",w:36,d:38,zones:[{name:"Stalls",x:-13,y:10,w:26,h:18},{name:"Balcony",x:-11,y:30,w:22,h:6}]},
  {id:"arena",label:"Arena Bowl",w:56,d:48,zones:[{name:"Floor",x:-16,y:14,w:32,h:20},{name:"Lower Bowl",x:-24,y:36,w:48,h:8}]},
  {id:"church",label:"Worship — Long Nave",w:22,d:44,zones:[{name:"Nave",x:-8,y:10,w:16,h:28},{name:"Choir",x:-6,y:40,w:12,h:4}]},
  {id:"festival",label:"Outdoor Festival",w:60,d:55,zones:[{name:"Main Field",x:-25,y:15,w:50,h:32}]},
  {id:"corp",label:"Corporate Ballroom",w:30,d:26,zones:[{name:"Seating",x:-12,y:8,w:24,h:15}]}
];

const H_RES_STEP = {low:4, high:1};
const D2R = Math.PI / 180;
const SNAP_STEP = 0.5;
const MIN_BLOCK_SIZE = 0.1;

function splColor(spl){
  if(spl<55) return "#1e293b";
  if(spl<65) return "#1d4ed8";
  if(spl<75) return "#0891b2";
  if(spl<85) return "#16a34a";
  if(spl<92) return "#eab308";
  if(spl<98) return "#f97316";
  return "#ef4444";
}

function hZoneTarget(name){
  // practice targets
  if(name === "Balcony" || name === "Lower Bowl") return {target: 82, tol: 4};
  if(name === "Choir") return {target: 78, tol: 4};
  return {target: 80, tol: 5};
}

function hVenueById(id){
  for(let i=0;i<VENUES.length;i++) if(VENUES[i].id === id) return VENUES[i];
  return VENUES[0];
}

// PARITY FUNCTION - must be pure DOM-free as specified
function HP_compute(design, step){
  // design has venueId, arrays
  const venue = hVenueById(design.venueId || 'theatre');
  const resStep = step || H_RES_STEP['low'] || 4;
  const stepVal = resStep;
  
  const gridCols = Math.ceil(venue.w/stepVal);
  const gridRows = Math.ceil(venue.d/stepVal);
  const coords = [];
  for(let gx = -venue.w/2; gx < venue.w/2; gx += stepVal){
    for(let gy = 0; gy < venue.d; gy += stepVal){
      coords.push({x: gx + stepVal/2, y: gy + stepVal/2});
    }
  }
  
  if(!design._arrCache) design._arrCache = {};
  const total = new Array(coords.length).fill(0);
  
  (design.arrays || []).forEach(function(a){
    if(!a.on) return;
    const key = stepVal + "|" + venue.id + "|" + a.x + "|" + a.y + "|" + (typeof a.height==="number"?a.height:5.5) + "|" + (a.on?1:0) + "|" + 
      (a.beams||[]).map(function(b){ return [b.az,b.hBeam,b.gain,(design.layerOn && design.layerOn[b.layer]===false)?0:1].join(","); }).join(";");
    let energies = design._arrCache[key];
    if(!energies){
      energies = new Array(coords.length).fill(0);
      (a.beams||[]).forEach(function(b){
        if(design.layerOn && design.layerOn[b.layer] === false) return;
        for(let i=0; i<coords.length; i++){
          const px = coords[i].x, py = coords[i].y;
          const dx = px - a.x, dy = py - a.y;
          const dz = (typeof a.height === 'number' ? a.height : 5.5) - 1.5;
          const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
          const beamAng = Math.atan2(dx, dy) * 180 / Math.PI;
          let diff = beamAng - b.az;
          while(diff > 180) diff -= 360;
          while(diff < -180) diff += 360;
          const fall = -14 * Math.pow(diff / Math.max(8, b.hBeam||28), 2);
          let spl = 104 + (b.gain||0) - 20*Math.log10(Math.max(2, dist)) + Math.max(-32, fall);
          energies[i] += Math.pow(10, spl/10);
        }
      });
      design._arrCache[key] = energies;
    }
    for(let j=0; j<coords.length; j++) total[j] += energies[j];
  });
  
  const list = coords.map(function(c,i){
    const splv = total[i] > 0 ? 10*Math.log10(total[i]) : 42;
    let zi = -1;
    for(let k=0; k<venue.zones.length; k++){
      const zn = venue.zones[k];
      if(c.x >= zn.x && c.x <= zn.x + zn.w && c.y >= zn.y && c.y <= zn.y + zn.h){
        zi = k;
        break;
      }
    }
    return {x:c.x, y:c.y, spl:splv, inAud: zi>=0, zoneIdx: zi};
  });
  
  const aud = list.filter(function(c){ return c.inAud; });
  const out = list.filter(function(c){ return !c.inAud; });
  const avg = aud.length ? aud.reduce(function(s,c){ return s+c.spl; }, 0)/aud.length : 0;
  const mn = aud.length ? Math.min.apply(null, aud.map(function(c){ return c.spl; })) : 0;
  const mx = aud.length ? Math.max.apply(null, aud.map(function(c){ return c.spl; })) : 0;
  const spill = out.length ? Math.round(out.filter(function(c){ return c.spl > 75; }).length/out.length*100) : 0;
  const coverage = aud.length ? Math.round(aud.filter(function(c){ return c.spl >= 78; }).length/aud.length*100) : 0;
  
  const zoneStats = venue.zones.map(function(zn, zi){
    const cells = list.filter(function(c){ return c.zoneIdx === zi; });
    const zavg = cells.length ? cells.reduce(function(s,c){ return s+c.spl; }, 0)/cells.length : 0;
    const tg = hZoneTarget(zn.name);
    const within = cells.length ? cells.filter(function(c){ return Math.abs(c.spl - tg.target) <= tg.tol; }).length : 0;
    return {
      name: zn.name,
      avg: Math.round(zavg*10)/10,
      target: tg.target,
      tol: tg.tol,
      miss: Math.round((zavg-tg.target)*10)/10,
      inTol: cells.length>0 && Math.abs(zavg-tg.target)<=tg.tol,
      withinPct: cells.length ? Math.round(within/cells.length*100) : 0,
      cells: cells.length
    };
  });
  
  let goalCells = 0;
  aud.forEach(function(c){
    if(c.zoneIdx >= 0){
      const tg = hZoneTarget(venue.zones[c.zoneIdx].name);
      if(Math.abs(c.spl - tg.target) <= tg.tol) goalCells++;
    }
  });
  const goal = aud.length ? Math.round(goalCells/aud.length*100) : 0;
  const allZonesInTol = zoneStats.length>0 && zoneStats.every(function(z){ return z.inTol; });
  
  return {
    cells: list,
    step: stepVal,
    gridCols: gridCols,
    gridRows: gridRows,
    zones: zoneStats,
    goal: goal,
    allZonesInTol: allZonesInTol,
    stats: {
      avg: Math.round(avg*10)/10,
      uni: Math.round((mx-mn)/2*10)/10,
      min: Math.round(mn),
      max: Math.round(mx),
      spill: spill,
      coverage: coverage,
      goal: goal
    }
  };
}

// Make it globally accessible for parity test
if(typeof window !== 'undefined'){
  window.HP_compute = HP_compute;
}

// Defaults — source of truth for the initial design and Reset design.
function defaultArrays(){
  return [
    {id:1, name:'Array L', model:'X2', x:-6, y:4, height:5.5, on:true, beams:[{az:-10, tilt:0, hBeam:28, vBeam:18, gain:0, zone:'Stalls', layer:'Main'}]},
    {id:2, name:'Array R', model:'X2', x:6, y:4, height:5.5, on:true, beams:[{az:10, tilt:0, hBeam:28, vBeam:18, gain:0, zone:'Stalls', layer:'Main'}]},
    {id:3, name:'Centre / Balcony', model:'X1', x:0, y:4, height:5.5, on:false, beams:[{az:0, tilt:8, hBeam:20, vBeam:12, gain:-3, zone:'Balcony', layer:'Balcony'}]}
  ];
}

function defaultLayerOn(){
  return {Main:true, Balcony:true, Fill:true};
}

function defaultTags(){
  return {Venue:true, Zones:true, Blocks:true, Arrays:true, Beams:true, Coverage:true};
}

function isLegacyDefaultArrays(arr){
  return Array.isArray(arr) && arr.length === 4 &&
    String(arr[0].id) === 'A1' && String(arr[1].id) === 'A2' &&
    String(arr[2].id) === 'A3' && String(arr[3].id) === 'A4' &&
    arr[2].name === 'Centre' && arr[3].name === 'Balcony';
}

// App state
const state = {
  venueId: 'theatre',
  arrays: defaultArrays(),
  zoneTargets: {},
  layerOn: defaultLayerOn(),
  tags: defaultTags(),
  blocks: [],
  resMode: 'low',
  selectedArrayId: 1,
  selBeam: 0,
  selectedObject: null,
  tool: 'select',
  snap: true,
  undoStack: [],
  rectFirst: null,
  tapeStart: null,
  lastGroundClick: null
};

function saveState(){
  try {
    localStorage.setItem('holoplot-3d-v1', JSON.stringify({
      venueId: state.venueId,
      arrays: state.arrays,
      zoneTargets: state.zoneTargets,
      layerOn: state.layerOn,
      tags: state.tags,
      blocks: state.blocks
    }));
  } catch(e){}
}

function loadState(){
  try {
    const data = localStorage.getItem('holoplot-3d-v1');
    if(data){
      const parsed = JSON.parse(data);
      if(parsed.venueId) state.venueId = parsed.venueId;
      if(Array.isArray(parsed.arrays) && parsed.arrays.length){
        // Ignore a stale copy of the old 4-array buggy default.
        state.arrays = isLegacyDefaultArrays(parsed.arrays) ? defaultArrays() : parsed.arrays;
      }
      if(parsed.zoneTargets) state.zoneTargets = parsed.zoneTargets;
      if(parsed.layerOn) state.layerOn = parsed.layerOn;
      normalizeArrays();
      if(parsed.tags) state.tags = Object.assign(defaultTags(), parsed.tags);
      if(Array.isArray(parsed.blocks)) state.blocks = parsed.blocks;
    }
  } catch(e){}
  state.undoStack = [];
}

// Three.js setup
let scene, camera, renderer, controls;
let gridHelper, axesHelper;
let venueGroup, zonesGroup, blocksGroup, arraysGroup, beamsGroup, coverageGroup;
let selectionHelper = null;
let raycaster = new THREE.Raycaster();
let pointerNdc = new THREE.Vector2();
let previewRectMesh = null;
let previewRectLine = null;
let tapePreviewLine = null;
let tapeFinalLine = null;
const activePointers = new Map();
let gesture = null;

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const GROUND_PLANE = new THREE.Plane(WORLD_UP, 0);
const BLOCK_GEO = new THREE.BoxGeometry(1, 1, 1);
const BLOCK_EDGE_GEO = new THREE.EdgesGeometry(BLOCK_GEO);
const BLOCK_EDGE_MAT = new THREE.LineBasicMaterial({ color: 0x111827 });
const BEAM_GEO = (function(){
  const g = new THREE.ConeGeometry(1, 1, 16, 1, true);
  g.translate(0, -0.5, 0);      // apex at the local origin
  g.rotateX(-Math.PI / 2);      // base along local +Z
  return g;
})();

function planToWorld(x, y, h){
  return new THREE.Vector3(x, h || 0, -y);
}

function worldToPlan(v){
  return { x: v.x, y: -v.z };
}

function clampNum(v, lo, hi){
  return Math.min(hi, Math.max(lo, v));
}

function snapValue(v){
  if(!state.snap) return v === 0 ? 0 : v;
  const r = Math.round(v / SNAP_STEP) * SNAP_STEP;
  return r === 0 ? 0 : r;
}

function fmtNum(n){
  return String(Math.round(n * 100) / 100);
}

function setStatus(text){
  const el = document.getElementById('statusBar');
  if(el) el.textContent = text;
}

function setCameraHome(){
  if(!camera) return;
  const v = hVenueById(state.venueId);
  camera.position.set(-0.9 * v.w, 0.7 * Math.max(v.w, v.d), 0.45 * v.d);
  if(controls){
    controls.target.set(0, 0, -v.d / 2);
    controls.update();
  } else {
    camera.lookAt(0, 0, -v.d / 2);
  }
}

function initThree(){
  const canvas = document.getElementById('threeCanvas');
  const cw = Math.max(1, canvas.clientWidth);
  const ch = Math.max(1, canvas.clientHeight);
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87CEEB);

  camera = new THREE.PerspectiveCamera(60, cw / ch, 0.1, 1000);

  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
  renderer.setSize(cw, ch, false);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  setCameraHome();

  const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
  hemiLight.position.set(0, 50, 0);
  scene.add(hemiLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(30, 50, 30);
  scene.add(dirLight);

  gridHelper = new THREE.GridHelper(100, 100, 0x888888, 0x444444);
  gridHelper.position.z = -hVenueById(state.venueId).d / 2;
  scene.add(gridHelper);

  axesHelper = new THREE.AxesHelper(10);
  scene.add(axesHelper);

  venueGroup = new THREE.Group();
  scene.add(venueGroup);
  zonesGroup = new THREE.Group();
  scene.add(zonesGroup);
  blocksGroup = new THREE.Group();
  scene.add(blocksGroup);
  arraysGroup = new THREE.Group();
  scene.add(arraysGroup);
  beamsGroup = new THREE.Group();
  scene.add(beamsGroup);
  coverageGroup = new THREE.Group();
  scene.add(coverageGroup);

  buildVenue();
  buildBlocks();
  buildArrays();
  buildCoverage();
  buildOutliner();
  applyTagVisibility();
  attachPointerHandlers();

  window.addEventListener('resize', onWindowResize);
  if(typeof ResizeObserver !== 'undefined'){
    new ResizeObserver(onWindowResize).observe(document.getElementById('viewport'));
  }
  animate();
}

function onWindowResize(){
  if(!renderer || !camera) return;
  const canvas = document.getElementById('threeCanvas');
  const cw = Math.max(1, canvas.clientWidth);
  const ch = Math.max(1, canvas.clientHeight);
  camera.aspect = cw / ch;
  camera.updateProjectionMatrix();
  renderer.setSize(cw, ch, false);
}

function animate(){
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

function disposeGroup(group, keepGeometry){
  if(!group) return;
  group.traverse(function(o){
    if(o.geometry && o.geometry !== keepGeometry) o.geometry.dispose();
    if(o.material){
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach(function(m){
        if(m.map) m.map.dispose();
        m.dispose();
      });
    }
  });
  group.clear();
}

function buildVenue(){
  disposeGroup(venueGroup);
  disposeGroup(zonesGroup);
  const venue = hVenueById(state.venueId);

  // Floor — plan y maps to world -Z, so the slab centre is at -d/2.
  const floorGeo = new THREE.PlaneGeometry(venue.w, venue.d);
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x8B7355, roughness: 0.8 });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, -venue.d / 2);
  venueGroup.add(floor);

  // Low translucent perimeter walls at the stage and back edges.
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, transparent: true, opacity: 0.3 });
  const wallGeo1 = new THREE.BoxGeometry(venue.w, 3, 0.2);
  const wall1 = new THREE.Mesh(wallGeo1, wallMat);
  wall1.position.set(0, 1.5, 0);
  venueGroup.add(wall1);
  const wall2 = new THREE.Mesh(wallGeo1, wallMat);
  wall2.position.set(0, 1.5, -venue.d);
  venueGroup.add(wall2);

  // Stage block at the plan y<6 end.
  const stageGeo = new THREE.BoxGeometry(venue.w * 0.8, 1, 6);
  const stageMat = new THREE.MeshStandardMaterial({ color: 0x654321 });
  const stage = new THREE.Mesh(stageGeo, stageMat);
  stage.position.set(0, 0.5, -3);
  venueGroup.add(stage);

  // Zone washes at ground level.
  venue.zones.forEach(function(zn, idx){
    const zoneGeo = new THREE.PlaneGeometry(zn.w, zn.h);
    const zoneMat = new THREE.MeshBasicMaterial({ color: getZoneColor(idx), transparent: true, opacity: 0.3, depthWrite: false });
    const zoneMesh = new THREE.Mesh(zoneGeo, zoneMat);
    zoneMesh.rotation.x = -Math.PI / 2;
    zoneMesh.position.set(zn.x + zn.w / 2, 0.05, -(zn.y + zn.h / 2));
    zonesGroup.add(zoneMesh);
  });
}

function getZoneColor(idx){
  const colors = [0x00ff00, 0x0080ff, 0xff8000, 0xff00ff];
  return colors[idx % colors.length];
}

function getBlockColor(id){
  const colors = [0x8d6e63, 0x78909c, 0x90a4ae, 0xa1887f, 0x6d4c41, 0xbcaaa4];
  const n = Math.abs(parseInt(id, 10) || 0);
  return colors[n % colors.length];
}

function findBlock(id){
  for(let i = 0; i < state.blocks.length; i++){
    if(String(state.blocks[i].id) === String(id)) return state.blocks[i];
  }
  return null;
}

function findArray(id){
  for(let i = 0; i < state.arrays.length; i++){
    if(String(state.arrays[i].id) === String(id)) return state.arrays[i];
  }
  return null;
}

function blockMeshById(id){
  for(let i = 0; i < blocksGroup.children.length; i++){
    const m = blocksGroup.children[i];
    if(m.userData && m.userData.type === 'block' && String(m.userData.id) === String(id)) return m;
  }
  return null;
}

function arrayGroupById(id){
  for(let i = 0; i < arraysGroup.children.length; i++){
    const g = arraysGroup.children[i];
    if(g.userData && g.userData.type === 'array' && String(g.userData.id) === String(id)) return g;
  }
  return null;
}

function nextBlockId(){
  let max = 0;
  state.blocks.forEach(function(b){
    const n = Number(b.id);
    if(isFinite(n)) max = Math.max(max, n);
  });
  return max + 1;
}

function buildBlocks(){
  blocksGroup.clear();
  state.blocks.forEach(function(b){
    const mat = new THREE.MeshStandardMaterial({ color: b.color || getBlockColor(b.id), roughness: 0.75 });
    const mesh = new THREE.Mesh(BLOCK_GEO, mat);
    mesh.scale.set(Math.max(MIN_BLOCK_SIZE, b.w), Math.max(MIN_BLOCK_SIZE, b.h), Math.max(MIN_BLOCK_SIZE, b.d));
    mesh.position.set(b.x + b.w / 2, b.h / 2, -(b.y + b.d / 2));
    mesh.userData = { type: 'block', id: b.id };
    const edges = new THREE.LineSegments(BLOCK_EDGE_GEO, BLOCK_EDGE_MAT);
    mesh.add(edges);
    blocksGroup.add(mesh);
  });
  refreshSelectionVisual();
}

function updateBlockMesh(b){
  const mesh = blockMeshById(b.id);
  if(!mesh) return;
  mesh.scale.set(Math.max(MIN_BLOCK_SIZE, b.w), Math.max(MIN_BLOCK_SIZE, b.h), Math.max(MIN_BLOCK_SIZE, b.d));
  mesh.position.set(b.x + b.w / 2, b.h / 2, -(b.y + b.d / 2));
  if(selectionHelper) selectionHelper.update();
}

function findSelectedObject(){
  if(!state.selectedObject) return null;
  if(state.selectedObject.type === 'block') return blockMeshById(state.selectedObject.id);
  if(state.selectedObject.type === 'array') return arrayGroupById(state.selectedObject.id);
  return null;
}

function refreshSelectionVisual(){
  if(selectionHelper){
    scene.remove(selectionHelper);
    selectionHelper.geometry.dispose();
    selectionHelper.material.dispose();
    selectionHelper = null;
  }
  if(!scene || !state.selectedObject) return;
  const obj = findSelectedObject();
  if(!obj) return;
  selectionHelper = new THREE.BoxHelper(obj, 0x2f81f7);
  selectionHelper.material.depthTest = false;
  selectionHelper.material.transparent = true;
  selectionHelper.renderOrder = 999;
  scene.add(selectionHelper);
}

function selectObject(type, id, opts){
  state.selectedObject = type ? { type: type, id: id } : null;
  if(type === 'array'){
    state.selectedArrayId = id;
    const arrSelect = document.getElementById('arraySelect');
    if(arrSelect) arrSelect.value = String(id);
    syncArrayPanel();
  }
  refreshSelectionVisual();
  syncOutlinerSelection();
  if(!(opts && opts.silent)){
    if(type === 'block'){
      const b = findBlock(id);
      setStatus('Select: block ' + id + ' selected' + (b ? ' (' + fmtNum(b.w) + ' x ' + fmtNum(b.d) + ' x ' + fmtNum(b.h) + ' m).' : '.'));
    } else if(type === 'array'){
      const a = findArray(id);
      setStatus('Select: ' + (a ? a.name : ('array ' + id)) + ' selected.');
    } else {
      setStatus('Select: nothing selected.');
    }
  }
}

function blockPlanLabel(b){
  return (b.name || ('Block ' + b.id)) + ' — ' + fmtNum(b.w) + 'x' + fmtNum(b.d) + 'x' + fmtNum(b.h) + ' m';
}

function buildOutliner(){
  const div = document.getElementById('outliner');
  if(!div) return;
  div.innerHTML = '';
  const venue = hVenueById(state.venueId);

  function addItem(type, id, label){
    const el = document.createElement('div');
    el.className = 'outliner-item';
    el.dataset.type = type;
    el.dataset.id = String(id);
    el.textContent = label;
    if(state.selectedObject && state.selectedObject.type === type && String(state.selectedObject.id) === String(id)){
      el.classList.add('selected');
    }
    div.appendChild(el);
  }

  addItem('venue', venue.id, venue.label + ' — Venue');
  venue.zones.forEach(function(zn, i){ addItem('zone', i, zn.name + ' — Zone'); });
  state.blocks.forEach(function(b){ addItem('block', b.id, blockPlanLabel(b)); });
  state.arrays.forEach(function(a){ addItem('array', a.id, a.name + ' — Array ' + (a.model || '') + (a.on ? '' : ' (off)')); });
}

function syncOutlinerSelection(){
  const div = document.getElementById('outliner');
  if(!div) return;
  const items = div.querySelectorAll('.outliner-item');
  for(let i = 0; i < items.length; i++){
    const it = items[i];
    const on = state.selectedObject && it.dataset.type === state.selectedObject.type &&
      String(it.dataset.id) === String(state.selectedObject.id);
    it.classList.toggle('selected', !!on);
  }
}

function applyTagVisibility(){
  const map = {
    Venue: venueGroup,
    Zones: zonesGroup,
    Blocks: blocksGroup,
    Arrays: arraysGroup,
    Beams: beamsGroup,
    Coverage: coverageGroup
  };
  Object.keys(map).forEach(function(key){
    if(map[key]) map[key].visible = !state.tags || state.tags[key] !== false;
    const cb = document.querySelector('[data-tag="' + key + '"]');
    if(cb) cb.checked = !state.tags || state.tags[key] !== false;
  });
}

function buildArrays(){
  disposeGroup(arraysGroup);
  disposeGroup(beamsGroup, BEAM_GEO);
  const venue = hVenueById(state.venueId);
  const lMax = Math.max(venue.w, venue.d) * 1.2;

  state.arrays.forEach(function(arr){
    const group = new THREE.Group();
    group.userData = { type: 'array', id: arr.id };

    // Body
    const bodyGeo = new THREE.BoxGeometry(0.8, 1.2, 0.5);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    const aH = (typeof arr.height === 'number' ? arr.height : 5.5);
    body.position.y = aH;
    group.add(body);

    // Stand
    const standH = Math.max(0.1, aH - 0.6);
    const standGeo = new THREE.CylinderGeometry(0.1, 0.15, standH, 8);
    const standMat = new THREE.MeshStandardMaterial({ color: 0x666666 });
    const stand = new THREE.Mesh(standGeo, standMat);
    stand.position.y = standH / 2;
    group.add(stand);

    group.position.set(arr.x, 0, -arr.y);
    arraysGroup.add(group);

    // Beams
    if(arr.on){
      (arr.beams || []).forEach(function(beam){
        if(state.layerOn[beam.layer] === false) return;
        const tiltDeg = beam.tilt || 0;
        const azDeg = beam.az || 0;
        const tiltRad = tiltDeg * D2R;
        let len = tiltDeg > 0.5 ? aH / Math.sin(tiltRad) : lMax;
        len = clampNum(len, 2, lMax);
        const rH = Math.max(0.2, len * Math.tan((beam.hBeam || 28) / 2 * D2R));
        const rV = Math.max(0.2, len * Math.tan((beam.vBeam || 18) / 2 * D2R));
        const beamMat = new THREE.MeshBasicMaterial({
          color: getBeamColor(beam.layer),
          transparent: true,
          opacity: 0.2,
          depthWrite: false,
          side: THREE.DoubleSide
        });
        const beamMesh = new THREE.Mesh(BEAM_GEO, beamMat);
        beamMesh.position.set(arr.x, aH, -arr.y);
        beamMesh.quaternion.setFromEuler(new THREE.Euler(tiltRad, Math.PI - azDeg * D2R, 0, 'YXZ'));
        beamMesh.scale.set(rH, rV, len);
        beamsGroup.add(beamMesh);
      });
    }
  });
  refreshSelectionVisual();
}

function getBeamColor(layer){
  if(layer === 'Balcony') return 0xff00ff;
  if(layer === 'Fill') return 0x00ffff;
  return 0xffff00;
}

function buildCoverage(){
  disposeGroup(coverageGroup);
  const venue = hVenueById(state.venueId);
  const design = {
    venueId: state.venueId,
    arrays: state.arrays,
    layerOn: state.layerOn
  };
  const result = HP_compute(design, H_RES_STEP[state.resMode] || 4);

  const cols = Math.max(1, result.gridCols);
  const rows = Math.max(1, result.gridRows);
  const step = result.step;
  const canvas = document.createElement('canvas');
  canvas.width = cols;
  canvas.height = rows;
  const ctx = canvas.getContext('2d');

  const imgData = ctx.createImageData(cols, rows);
  for(let i = 0; i < result.cells.length; i++){
    const c = result.cells[i];
    const col = Math.round((c.x - step / 2 + venue.w / 2) / step);
    const row = Math.round((c.y - step / 2) / step);
    if(col < 0 || col >= cols || row < 0 || row >= rows) continue;
    const hex = splColor(c.spl);
    const idx = (row * cols + col) * 4;
    imgData.data[idx] = parseInt(hex.slice(1, 3), 16);
    imgData.data[idx + 1] = parseInt(hex.slice(3, 5), 16);
    imgData.data[idx + 2] = parseInt(hex.slice(5, 7), 16);
    imgData.data[idx + 3] = 220;
  }
  ctx.putImageData(imgData, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.flipY = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;

  const W = cols * step;
  const D = rows * step;
  const geo = new THREE.PlaneGeometry(W, D);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity: 0.85,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -4
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(-venue.w / 2 + W / 2, 0.07, -D / 2);
  coverageGroup.add(mesh);

  // Update stats
  document.getElementById('statAvg').textContent = result.stats.avg.toFixed(1);
  document.getElementById('statCov').textContent = result.stats.coverage + '%';
  document.getElementById('statSpill').textContent = result.stats.spill + '%';
  document.getElementById('statUni').textContent = result.stats.uni.toFixed(1);

  const zoneStatsDiv = document.getElementById('zoneStats');
  zoneStatsDiv.innerHTML = '<div style="margin-top:4px;font-weight:600;">Zones:</div>';
  result.zones.forEach(function(z){
    const div = document.createElement('div');
    div.textContent = z.name + ': ' + z.avg.toFixed(1) + ' dB';
    zoneStatsDiv.appendChild(div);
  });
}

// ---------------------------------------------------------------------------
// Tool interaction: raycasting, block operations, undo, drag gestures
// ---------------------------------------------------------------------------

function eventNdc(ev){
  const rect = renderer.domElement.getBoundingClientRect();
  pointerNdc.set(
    ((ev.clientX - rect.left) / rect.width) * 2 - 1,
    -((ev.clientY - rect.top) / rect.height) * 2 + 1
  );
}

function updateRay(ev){
  eventNdc(ev);
  raycaster.setFromCamera(pointerNdc, camera);
}

function groundBounds(){
  const v = hVenueById(state.venueId);
  return { minX: -v.w / 2 - 5, maxX: v.w / 2 + 5, minY: -5, maxY: v.d + 5 };
}

function groundHit(ev){
  updateRay(ev);
  const p = new THREE.Vector3();
  if(!raycaster.ray.intersectPlane(GROUND_PLANE, p)) return null;
  const plan = worldToPlan(p);
  const b = groundBounds();
  plan.x = clampNum(plan.x, b.minX, b.maxX);
  plan.y = clampNum(plan.y, b.minY, b.maxY);
  return plan;
}

function pickObject(ev){
  updateRay(ev);
  if(blocksGroup.visible){
    const blockHits = raycaster.intersectObjects(blocksGroup.children, false);
    if(blockHits.length){
      const obj = blockHits[0].object;
      if(obj.userData && obj.userData.type === 'block'){
        return { type: 'block', id: obj.userData.id, object: obj, point: blockHits[0].point, face: blockHits[0].face };
      }
    }
  }
  if(arraysGroup.visible){
    const arrayHits = raycaster.intersectObjects(arraysGroup.children, true);
    if(arrayHits.length){
      let obj = arrayHits[0].object;
      while(obj && !(obj.userData && obj.userData.type === 'array')) obj = obj.parent;
      if(obj) return { type: 'array', id: obj.userData.id, object: obj, point: arrayHits[0].point };
    }
  }
  return null;
}

function pickBlockTop(ev){
  const hit = pickObject(ev);
  if(!hit || hit.type !== 'block') return null;
  if(hit.face && Math.abs(hit.face.normal.y) < 0.9) return null;
  return hit;
}

// --- Undo stack (blocks only, as specified) --------------------------------
function pushUndo(){
  state.undoStack.push(JSON.stringify(state.blocks));
  if(state.undoStack.length > 60) state.undoStack.shift();
}

function undo(){
  if(!state.undoStack.length){
    setStatus('Undo: nothing to undo.');
    return;
  }
  state.blocks = JSON.parse(state.undoStack.pop());
  if(state.selectedObject && state.selectedObject.type === 'block'){
    if(!findBlock(state.selectedObject.id)) state.selectedObject = null;
  }
  buildBlocks();
  buildOutliner();
  syncOutlinerSelection();
  saveState();
  setStatus('Undo: block change reverted.');
}

// --- Block operations -------------------------------------------------------
function addBlock(x, y, w, d, h, opts){
  pushUndo();
  const id = nextBlockId();
  const b = {
    id: id,
    name: 'Block ' + id,
    x: x,
    y: y,
    w: Math.max(MIN_BLOCK_SIZE, w),
    d: Math.max(MIN_BLOCK_SIZE, d),
    h: Math.max(MIN_BLOCK_SIZE, h || MIN_BLOCK_SIZE),
    color: getBlockColor(id)
  };
  state.blocks.push(b);
  buildBlocks();
  buildOutliner();
  selectObject('block', id, { silent: true });
  saveState();
  if(!(opts && opts.silent)){
    setStatus('Rectangle: created block ' + id + ' (' + fmtNum(b.w) + ' x ' + fmtNum(b.d) + ' m, ' + fmtNum(b.h) + ' m high).');
  }
  return b;
}

function deleteBlock(id){
  const idx = state.blocks.findIndex(function(b){ return String(b.id) === String(id); });
  if(idx < 0) return false;
  pushUndo();
  state.blocks.splice(idx, 1);
  if(state.selectedObject && state.selectedObject.type === 'block' && String(state.selectedObject.id) === String(id)){
    state.selectedObject = null;
  }
  buildBlocks();
  buildOutliner();
  saveState();
  return true;
}

function setBlockHeight(id, height, opts){
  const b = findBlock(id);
  if(!b) return false;
  if(!(opts && opts.noUndo)) pushUndo();
  b.h = Math.max(MIN_BLOCK_SIZE, height);
  buildBlocks();
  buildOutliner();
  saveState();
  return true;
}

function moveBlockTo(b, x, y){
  const oldX = b.x, oldY = b.y;
  b.x = snapValue(x);
  b.y = snapValue(y);
  if(b.x !== oldX || b.y !== oldY){
    updateBlockMesh(b);
    return true;
  }
  return false;
}

function moveArrayTo(a, x, y){
  a.x = snapValue(x);
  a.y = snapValue(y);
  buildArrays();
  buildCoverage();
  syncArrayPanel();
  saveState();
}

// --- Rectangle / tape previews ---------------------------------------------
function getPreviewRect(){
  if(previewRectMesh && previewRectLine) return { mesh: previewRectMesh, line: previewRectLine };
  const mat = new THREE.MeshBasicMaterial({ color: 0x2f81f7, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide });
  previewRectMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  previewRectMesh.rotation.x = -Math.PI / 2;
  previewRectMesh.renderOrder = 998;
  scene.add(previewRectMesh);

  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(5 * 3), 3));
  previewRectLine = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0x1d4ed8, depthTest: false }));
  previewRectLine.renderOrder = 999;
  scene.add(previewRectLine);
  return { mesh: previewRectMesh, line: previewRectLine };
}

function updateRectPreview(a, b){
  const pv = getPreviewRect();
  const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x);
  const y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
  const w = Math.max(0.01, x1 - x0);
  const d = Math.max(0.01, y1 - y0);
  pv.mesh.visible = true;
  pv.mesh.scale.set(w, d, 1);
  pv.mesh.position.set(x0 + w / 2, 0.09, -(y0 + d / 2));
  const pos = pv.line.geometry.attributes.position;
  const pts = [
    [x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]
  ];
  pts.forEach(function(pt, i){
    pos.setXYZ(i, pt[0], 0.1, -pt[1]);
  });
  pos.needsUpdate = true;
  pv.line.geometry.computeBoundingSphere();
  pv.line.visible = true;
}

function clearRectPreview(){
  if(previewRectMesh) previewRectMesh.visible = false;
  if(previewRectLine) previewRectLine.visible = false;
}

function getTapeLines(){
  if(!tapePreviewLine){
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(2 * 3), 3));
    tapePreviewLine = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xf59e0b, depthTest: false }));
    tapePreviewLine.renderOrder = 999;
    scene.add(tapePreviewLine);
  }
  return tapePreviewLine;
}

function setLinePoints(line, a, b){
  const pos = line.geometry.attributes.position;
  pos.setXYZ(0, a.x, 0.12, -a.y);
  pos.setXYZ(1, b.x, 0.12, -b.y);
  pos.needsUpdate = true;
  line.geometry.computeBoundingSphere();
}

function updateTapePreview(a, b){
  const line = getTapeLines();
  line.visible = true;
  setLinePoints(line, a, b);
}

function clearTapePreview(){
  if(tapePreviewLine) tapePreviewLine.visible = false;
}

function drawTapeLine(a, b){
  if(!tapeFinalLine){
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(2 * 3), 3));
    tapeFinalLine = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xf59e0b }));
    scene.add(tapeFinalLine);
  }
  tapeFinalLine.visible = true;
  setLinePoints(tapeFinalLine, a, b);
}

function clearTapeLine(){
  if(tapeFinalLine) tapeFinalLine.visible = false;
}

function clearPendingTools(){
  state.rectFirst = null;
  state.tapeStart = null;
  clearRectPreview();
  clearTapePreview();
  clearTapeLine();
}


// --- Pointer handlers wired to the WebGL canvas ----------------------------
function attachPointerHandlers(){
  const el = renderer.domElement;
  el.style.touchAction = 'none';
  // Capture phase so controls.enabled is false before OrbitControls' own
  // pointerdown listener (added in its constructor) can start a camera drag.
  el.addEventListener('pointerdown', onPointerDown, true);
  el.addEventListener('pointermove', onPointerMove);
  el.addEventListener('pointerup', onPointerUp);
  el.addEventListener('pointercancel', onPointerCancel);
}

function onPointerDown(ev){
  if(ev.pointerType === 'mouse' && ev.button !== 0) return;
  if(state.tool === 'orbit') return;

  if(activePointers.size > 0){
    // A second pointer is a navigation gesture: cancel the tool drag.
    cancelToolGesture();
    return;
  }
  activePointers.set(ev.pointerId, true);
  controls.enabled = false;
  try { renderer.domElement.setPointerCapture(ev.pointerId); } catch(e){}

  const plan = groundHit(ev);
  if(plan) state.lastGroundClick = { x: plan.x, y: plan.y };

  const g = {
    pointerId: ev.pointerId,
    mode: null,
    startX: ev.clientX,
    startY: ev.clientY,
    changed: false
  };

  if(state.tool === 'select') handleSelectDown(ev, g);
  else if(state.tool === 'rectangle') handleRectangleDown(ev, g, plan);
  else if(state.tool === 'pushpull') handlePushPullDown(ev, g);
  else if(state.tool === 'move') handleMoveDown(ev, g, plan);
  else if(state.tool === 'tape') handleTapeDown(ev, g, plan);
  else if(state.tool === 'eraser') handleEraserDown(ev, g);
  else if(state.tool === 'pan') handlePanDown(ev, g);

  gesture = g;
}

function handleSelectDown(ev, g){
  const hit = pickObject(ev);
  if(hit) selectObject(hit.type, hit.id);
  else selectObject(null, null);
  g.mode = 'select';
}

function handlePanDown(ev, g){
  g.mode = 'pan';
  g.lastX = ev.clientX;
  g.lastY = ev.clientY;
}

function handleRectangleDown(ev, g, plan){
  if(!plan){ g.mode = 'rectangle-no-ground'; return; }
  let p = { x: plan.x, y: plan.y };
  if(state.snap) p = { x: snapValue(p.x), y: snapValue(p.y) };
  state.lastGroundClick = p;

  if(!state.rectFirst){
    state.rectFirst = p;
    updateRectPreview(p, p);
    setMeasurementsText(fmtNum(p.x) + ', ' + fmtNum(p.y), false);
    setStatus('Rectangle: click the second corner (or type WxD and press Enter).');
    g.mode = 'rectangle-first';
    return;
  }

  const a = state.rectFirst;
  const w = Math.abs(p.x - a.x);
  const d = Math.abs(p.y - a.y);
  if(w < MIN_BLOCK_SIZE || d < MIN_BLOCK_SIZE){
    setStatus('Rectangle: corners are too close; click a different second corner.');
    g.mode = 'rectangle-too-small';
    return;
  }
  const bx = Math.min(a.x, p.x);
  const by = Math.min(a.y, p.y);
  addBlock(bx, by, w, d, MIN_BLOCK_SIZE, { silent: true });
  state.rectFirst = null;
  clearRectPreview();
  setMeasurementsText(fmtNum(w) + ' x ' + fmtNum(d) + ' m', false);
  setStatus('Rectangle: created ' + fmtNum(w) + ' x ' + fmtNum(d) + ' m block (' + fmtNum(MIN_BLOCK_SIZE) + ' m high).');
  g.mode = 'rectangle-second';
}

function handlePushPullDown(ev, g){
  const hit = pickBlockTop(ev);
  if(!hit){
    setStatus('Push/Pull: click the top face of a block first.');
    g.mode = 'pushpull-none';
    return;
  }
  const b = findBlock(hit.id);
  if(!b){ g.mode = 'pushpull-none'; return; }
  selectObject('block', b.id, { silent: true });
  pushUndo();
  g.mode = 'pushpull';
  g.blockId = b.id;
  g.startHeight = b.h;
  g.startScreenY = ev.clientY;
  g.topPoint = new THREE.Vector3(b.x + b.w / 2, b.h, -(b.y + b.d / 2));
  setMeasurementsText(fmtNum(b.h) + ' m', false);
  setStatus('Push/Pull: drag up or down to set the height (minimum 0.1 m).');
}

function handleMoveDown(ev, g, plan){
  const hit = pickObject(ev);
  let target = null;
  if(hit){
    target = { type: hit.type, id: hit.id };
    selectObject(hit.type, hit.id, { silent: true });
  } else if(state.selectedObject){
    target = { type: state.selectedObject.type, id: state.selectedObject.id };
  }
  if(!target){
    setStatus('Move: select a block or array first.');
    g.mode = 'move-none';
    return;
  }
  if(!plan){ g.mode = 'move-none'; return; }

  if(target.type === 'block'){
    const b = findBlock(target.id);
    if(!b){ g.mode = 'move-none'; return; }
    pushUndo();
    g.mode = 'move-block';
    g.blockId = b.id;
    g.grabDX = plan.x - b.x;
    g.grabDY = plan.y - b.y;
    setMeasurementsText(fmtNum(b.x) + ', ' + fmtNum(b.y), false);
    setStatus('Move: drag the block on the ground plane.');
  } else {
    const a = findArray(target.id);
    if(!a){ g.mode = 'move-none'; return; }
    g.mode = 'move-array';
    g.arrayId = a.id;
    g.grabDX = plan.x - a.x;
    g.grabDY = plan.y - a.y;
    setMeasurementsText(fmtNum(a.x) + ', ' + fmtNum(a.y), false);
    setStatus('Move: drag the array on the ground plane.');
  }
}

function handleTapeDown(ev, g, plan){
  if(!plan){ g.mode = 'tape-no-ground'; return; }
  if(!state.tapeStart){
    clearTapeLine();
    state.tapeStart = { x: plan.x, y: plan.y };
    state.lastGroundClick = { x: plan.x, y: plan.y };
    updateTapePreview(state.tapeStart, state.tapeStart);
    setMeasurementsText('0.00 m', true);
    setStatus('Tape Measure: click the second point (Esc clears).');
    g.mode = 'tape-first';
    return;
  }
  const a = state.tapeStart;
  const dist = Math.hypot(plan.x - a.x, plan.y - a.y);
  drawTapeLine(a, plan);
  state.tapeStart = null;
  clearTapePreview();
  setMeasurementsText(dist.toFixed(2) + ' m', true);
  setStatus('Tape Measure: ' + dist.toFixed(2) + ' m — Esc clears.');
  g.mode = 'tape-second';
}

function handleEraserDown(ev, g){
  const hit = pickObject(ev);
  if(hit && hit.type === 'block'){
    deleteBlock(hit.id);
    setStatus('Eraser: block deleted. Ctrl+Z to undo.');
  } else if(hit && hit.type === 'array'){
    setStatus('Eraser: blocks only — arrays, venue and zones are protected.');
  } else {
    setStatus('Eraser: click a block to delete it.');
  }
  g.mode = 'eraser';
}

function onPointerMove(ev){
  const g = gesture;
  if(g && g.pointerId === ev.pointerId){
    if(Math.abs(ev.clientX - g.startX) > 4 || Math.abs(ev.clientY - g.startY) > 4) g.changed = true;
  }

  if(g && g.mode === 'pan'){
    const dx = ev.clientX - (g.lastX || ev.clientX);
    const dy = ev.clientY - (g.lastY || ev.clientY);
    g.lastX = ev.clientX;
    g.lastY = ev.clientY;
    if((dx || dy) && camera && controls){
      const dist = camera.position.distanceTo(controls.target);
      const hPx = (renderer && renderer.domElement && renderer.domElement.clientHeight) || 600;
      const wpp = 2 * dist * Math.tan((camera.fov * Math.PI / 180) / 2) / hPx;
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0);
      const up = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1);
      const delta = right.multiplyScalar(-dx * wpp).add(up.multiplyScalar(dy * wpp));
      camera.position.add(delta);
      controls.target.add(delta);
      g.changed = true;
    }
  } else if(g && g.mode === 'pushpull'){
    const hit = verticalHit(ev, g.topPoint, g);
    if(hit){
      let h = state.snap ? snapValue(hit.y) : hit.y;
      h = Math.max(MIN_BLOCK_SIZE, h);
      const b = findBlock(g.blockId);
      if(b && Math.abs(b.h - h) > 1e-6){
        b.h = h;
        g.changed = true;
        updateBlockMesh(b);
        setMeasurementsText(fmtNum(h) + ' m', false);
        setStatus('Push/Pull: ' + fmtNum(h) + ' m');
      }
    }
  } else if(g && g.mode === 'move-block'){
    const plan = groundHit(ev);
    if(plan){
      const b = findBlock(g.blockId);
      if(b){
        const nx = snapValue(plan.x - g.grabDX);
        const ny = snapValue(plan.y - g.grabDY);
        if(moveBlockTo(b, nx, ny)){
          g.changed = true;
          setMeasurementsText(fmtNum(b.x) + ', ' + fmtNum(b.y), false);
          setStatus('Move: block at ' + fmtNum(b.x) + ', ' + fmtNum(b.y) + ' m');
        }
      }
    }
  } else if(g && g.mode === 'move-array'){
    const plan = groundHit(ev);
    if(plan){
      const a = findArray(g.arrayId);
      if(a){
        const nx = snapValue(plan.x - g.grabDX);
        const ny = snapValue(plan.y - g.grabDY);
        if(nx !== a.x || ny !== a.y){
          moveArrayTo(a, nx, ny);
          g.changed = true;
          setMeasurementsText(fmtNum(a.x) + ', ' + fmtNum(a.y), false);
          setStatus('Move: ' + a.name + ' at ' + fmtNum(a.x) + ', ' + fmtNum(a.y) + ' m');
        }
      }
    }
  }

  // Live rectangle rubber-band (works between click-click corners too).
  if(state.tool === 'rectangle' && state.rectFirst){
    const plan = groundHit(ev);
    if(plan){
      let p = { x: plan.x, y: plan.y };
      if(state.snap) p = { x: snapValue(p.x), y: snapValue(p.y) };
      updateRectPreview(state.rectFirst, p);
      const w = Math.abs(p.x - state.rectFirst.x);
      const d = Math.abs(p.y - state.rectFirst.y);
      setMeasurementsText(fmtNum(w) + ' x ' + fmtNum(d) + ' m', false);
    }
  }

  // Live tape rubber-band.
  if(state.tool === 'tape' && state.tapeStart){
    const plan = groundHit(ev);
    if(plan){
      updateTapePreview(state.tapeStart, plan);
      const dist = Math.hypot(plan.x - state.tapeStart.x, plan.y - state.tapeStart.y);
      setMeasurementsText(dist.toFixed(2) + ' m', true);
    }
  }
}

function verticalHit(ev, point, g){
  updateRay(ev);
  const n = camera.getWorldDirection(new THREE.Vector3());
  n.y = 0;
  if(n.lengthSq() < 1e-4){
    // Near top-down view: fall back to screen-dy at ~0.02 m per pixel.
    return { y: g.startHeight + (g.startScreenY - ev.clientY) * 0.02 };
  }
  n.normalize();
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, point);
  const p = new THREE.Vector3();
  if(raycaster.ray.intersectPlane(plane, p)) return { y: p.y };
  return null;
}

function onPointerUp(ev){
  const g = gesture;
  activePointers.delete(ev.pointerId);
  try { renderer.domElement.releasePointerCapture(ev.pointerId); } catch(e){}
  if(controls) controls.enabled = true;

  if(g && g.pointerId === ev.pointerId){
    if(g.mode === 'pushpull'){
      if(g.changed){
        saveState();
        buildOutliner();
        const b = findBlock(g.blockId);
        setStatus('Push/Pull: block height ' + (b ? fmtNum(b.h) : '?') + ' m.');
      } else {
        // No drag happened: discard the undo entry captured on pointerdown.
        if(state.undoStack.length) state.undoStack.pop();
      }
    } else if(g.mode === 'move-block'){
      if(g.changed){
        saveState();
        buildOutliner();
        const b = findBlock(g.blockId);
        if(b) setStatus('Move: block at ' + fmtNum(b.x) + ', ' + fmtNum(b.y) + ' m.');
      } else if(state.undoStack.length){
        state.undoStack.pop();
      }
    } else if(g.mode === 'move-array' && g.changed){
      saveState();
      buildOutliner();
    }
  }
  gesture = null;
}

function onPointerCancel(ev){
  activePointers.delete(ev.pointerId);
  if(gesture && gesture.changed) saveState();
  gesture = null;
  if(controls) controls.enabled = true;
  setStatus('Gesture cancelled.');
}

function cancelToolGesture(){
  gesture = null;
  activePointers.clear();
  if(controls) controls.enabled = true;
}

// --- Measurements box -------------------------------------------------------
function setMeasurementsText(text, readOnly){
  const el = document.getElementById('measurementsInput');
  if(!el) return;
  el.value = text;
  el.readOnly = !!readOnly;
}

function venueCentrePlan(){
  const v = hVenueById(state.venueId);
  return { x: 0, y: v.d / 2 };
}

function applyMeasurements(raw){
  const value = String(raw || '').trim();
  if(state.tool === 'tape'){
    setStatus('Tape Measure: the result is read-only; click two ground points.');
    return;
  }

  if(state.tool === 'rectangle'){
    const m = value.match(/^\s*([\d.]+)\s*[x×,*]\s*([\d.]+)\s*$/i);
    if(!m){
      setStatus('Rectangle: type WxD, for example 12x8, then press Enter.');
      return;
    }
    const w = parseFloat(m[1]);
    const d = parseFloat(m[2]);
    if(!isFinite(w) || !isFinite(d) || w < MIN_BLOCK_SIZE || d < MIN_BLOCK_SIZE){
      setStatus('Rectangle: width and depth must be at least 0.1 m.');
      return;
    }
    const anchor = state.rectFirst || state.lastGroundClick || venueCentrePlan();
    addBlock(anchor.x, anchor.y, w, d, MIN_BLOCK_SIZE, { silent: true });
    state.rectFirst = null;
    clearRectPreview();
    setMeasurementsText(fmtNum(w) + ' x ' + fmtNum(d) + ' m', false);
    setStatus('Rectangle: created ' + fmtNum(w) + ' x ' + fmtNum(d) + ' m block at ' + fmtNum(anchor.x) + ', ' + fmtNum(anchor.y) + '.');
    return;
  }

  if(state.tool === 'pushpull'){
    const n = parseFloat(value.replace(',', '.'));
    if(!isFinite(n) || n < MIN_BLOCK_SIZE){
      setStatus('Push/Pull: type a height in metres (minimum 0.1).');
      return;
    }
    const b = (state.selectedObject && state.selectedObject.type === 'block') ? findBlock(state.selectedObject.id) : null;
    if(!b){
      setStatus('Push/Pull: select a block first, then type its height.');
      return;
    }
    setBlockHeight(b.id, n);
    setMeasurementsText(fmtNum(b.h) + ' m', false);
    setStatus('Push/Pull: block ' + b.id + ' height set to ' + fmtNum(b.h) + ' m.');
    return;
  }

  if(state.tool === 'move'){
    const m = value.match(/^\s*(-?[\d.]+)\s*[, ]\s*(-?[\d.]+)\s*$/);
    if(!m){
      setStatus('Move: type dx,dz, for example 3,2, then press Enter.');
      return;
    }
    const dx = parseFloat(m[1]);
    const dz = parseFloat(m[2]);
    if(!isFinite(dx) || !isFinite(dz)){
      setStatus('Move: dx and dz must be numbers.');
      return;
    }
    if(state.selectedObject && state.selectedObject.type === 'block'){
      const b = findBlock(state.selectedObject.id);
      if(!b){ setStatus('Move: selected block no longer exists.'); return; }
      pushUndo();
      b.x += dx;
      b.y += dz;
      buildBlocks();
      buildOutliner();
      saveState();
      setMeasurementsText(fmtNum(b.x) + ', ' + fmtNum(b.y), false);
      setStatus('Move: block offset by ' + fmtNum(dx) + ', ' + fmtNum(dz) + ' m.');
      return;
    }
    if(state.selectedObject && state.selectedObject.type === 'array'){
      const a = findArray(state.selectedObject.id);
      if(!a){ setStatus('Move: selected array no longer exists.'); return; }
      a.x += dx;
      a.y += dz;
      buildArrays();
      buildCoverage();
      syncArrayPanel();
      saveState();
      setMeasurementsText(fmtNum(a.x) + ', ' + fmtNum(a.y), false);
      setStatus('Move: ' + a.name + ' offset by ' + fmtNum(dx) + ', ' + fmtNum(dz) + ' m.');
      return;
    }
    setStatus('Move: select a block or array first.');
    return;
  }

  setStatus('Measurements: pick a tool first.');
}

function initUI(){
  // Populate venues
  const venueSelect = document.getElementById('venueSelect');
  VENUES.forEach(function(v){
    const opt = document.createElement('option');
    opt.value = v.id;
    opt.textContent = v.label;
    venueSelect.appendChild(opt);
  });
  venueSelect.value = state.venueId;
  venueSelect.onchange = function(){
    state.venueId = venueSelect.value;
    document.getElementById('venueName').textContent = hVenueById(state.venueId).label;
    clearPendingTools();
    buildVenue();
    buildBlocks();
    buildArrays();
    buildCoverage();
    buildOutliner();
    setCameraHome();
    saveState();
  };

  // Populate arrays
  updateArrayUI();

  // Tool selection
  document.querySelectorAll('.tool').forEach(function(tool){
    tool.addEventListener('click', function(){
      setTool(tool.dataset.tool);
    });
  });
  document.querySelector('.tool[data-tool="select"]').classList.add('active');

  // Snap
  document.getElementById('snapToggle').addEventListener('change', function(e){
    state.snap = e.target.checked;
  });

  // Top bar buttons
  document.getElementById('btnSave').addEventListener('click', function(){
    saveState();
    alert('Design saved to localStorage');
  });
  document.getElementById('btnLoad').addEventListener('click', function(){
    loadState();
    updateArrayUI();
    clearPendingTools();
    buildVenue();
    buildBlocks();
    buildArrays();
    buildCoverage();
    buildOutliner();
    applyTagVisibility();
    setCameraHome();
    document.getElementById('venueSelect').value = state.venueId;
    document.getElementById('venueName').textContent = hVenueById(state.venueId).label;
    alert('Design loaded from localStorage');
  });
  document.getElementById('btnExportJSON').addEventListener('click', exportJSON);
  document.getElementById('btnImportJSON').addEventListener('click', function(){
    document.getElementById('fileImport').click();
  });
  document.getElementById('fileImport').addEventListener('change', importJSON);
  document.getElementById('btnExportGLB').addEventListener('click', exportGLB);
  document.getElementById('btnReset').addEventListener('click', resetDesign);
  document.getElementById('btnAbout').addEventListener('click', function(){
    document.getElementById('aboutModal').classList.add('active');
  });
  document.getElementById('btnAboutClose').addEventListener('click', function(){
    document.getElementById('aboutModal').classList.remove('active');
  });
  document.getElementById('btnShortcuts').addEventListener('click', function(){
    document.getElementById('shortcutsModal').classList.add('active');
  });
  document.getElementById('btnShortcutsClose').addEventListener('click', function(){
    document.getElementById('shortcutsModal').classList.remove('active');
  });

  // Array controls
  document.getElementById('btnAddSpeaker').addEventListener('click', addSpeaker);
  document.getElementById('btnAddBeam').addEventListener('click', function(){
    const arr = getSelectedArray();
    if(!arr) return;
    if(arr.beams.length >= 3){ setStatus('Max 3 beams per array, same as the 2D app.'); return; }
    const src = getSelectedBeam() || {az:0, tilt:0, hBeam:28, vBeam:18, gain:0, zone:'', layer:'Main'};
    arr.beams.push({az:src.az, tilt:src.tilt, hBeam:src.hBeam, vBeam:src.vBeam, gain:src.gain, zone:src.zone, layer:src.layer});
    state.selBeam = arr.beams.length - 1;
    buildArrays(); buildCoverage(); saveState(); syncArrayPanel();
    setStatus(arr.name + ': Beam ' + arr.beams.length + ' added (copies Beam ' + (state.selBeam) + '). Aim it with the sliders.');
  });
  document.getElementById('btnDelBeam').addEventListener('click', function(){
    const arr = getSelectedArray();
    if(!arr) return;
    if(arr.beams.length <= 1){ setStatus('An array keeps at least 1 beam.'); return; }
    const n = state.selBeam + 1;
    arr.beams.splice(state.selBeam, 1);
    if(state.selBeam >= arr.beams.length) state.selBeam = arr.beams.length - 1;
    buildArrays(); buildCoverage(); saveState(); syncArrayPanel();
    setStatus(arr.name + ': Beam ' + n + ' removed.');
  });
  document.getElementById('beamZone').addEventListener('change', function(e){
    const b = getSelectedBeam();
    if(b){ b.zone = e.target.value; saveState(); setStatus('Beam target zone: ' + (b.zone || '(none)') + '.'); }
  });
  document.getElementById('beamLayer').addEventListener('change', function(e){
    const b = getSelectedBeam();
    if(b){ b.layer = e.target.value; buildArrays(); buildCoverage(); saveState(); }
  });
  document.getElementById('heightRange').addEventListener('input', function(e){
    const hv = parseFloat(e.target.value);
    document.getElementById('heightVal').textContent = hv.toFixed(1);
    const arr = getSelectedArray();
    if(arr){ arr.height = hv; buildArrays(); buildCoverage(); saveState(); }
  });
  document.querySelectorAll('[data-layer]').forEach(function(cb){
    cb.addEventListener('change', function(){
      state.layerOn[cb.getAttribute('data-layer')] = cb.checked;
      buildArrays(); buildCoverage(); saveState();
      setStatus('Layer ' + cb.getAttribute('data-layer') + (cb.checked ? ' on.' : ' muted.'));
    });
  });
  document.getElementById('btnDelSpeaker').addEventListener('click', delSpeaker);
  document.getElementById('arrayOn').addEventListener('change', function(e){
    const arr = getSelectedArray();
    if(arr){ arr.on = e.target.checked; buildArrays(); buildCoverage(); saveState(); }
  });
  document.getElementById('azRange').addEventListener('input', function(e){
    document.getElementById('azVal').textContent = e.target.value;
    const arr = getSelectedArray();
    const b = getSelectedBeam(); if(b){ b.az = parseInt(e.target.value, 10); buildArrays(); buildCoverage(); saveState(); }
  });
  document.getElementById('tiltRange').addEventListener('input', function(e){
    document.getElementById('tiltVal').textContent = e.target.value;
    const arr = getSelectedArray();
    const b = getSelectedBeam(); if(b){ b.tilt = parseInt(e.target.value, 10); buildArrays(); buildCoverage(); saveState(); }
  });
  document.getElementById('hBeamRange').addEventListener('input', function(e){
    document.getElementById('hBeamVal').textContent = e.target.value;
    const arr = getSelectedArray();
    const b = getSelectedBeam(); if(b){ b.hBeam = parseInt(e.target.value, 10); buildArrays(); buildCoverage(); saveState(); }
  });
  document.getElementById('vBeamRange').addEventListener('input', function(e){
    document.getElementById('vBeamVal').textContent = e.target.value;
    const arr = getSelectedArray();
    const b = getSelectedBeam(); if(b){ b.vBeam = parseInt(e.target.value, 10); buildArrays(); buildCoverage(); saveState(); }
  });
  document.getElementById('gainRange').addEventListener('input', function(e){
    document.getElementById('gainVal').textContent = e.target.value;
    const arr = getSelectedArray();
    const b = getSelectedBeam(); if(b){ b.gain = parseInt(e.target.value, 10); buildArrays(); buildCoverage(); saveState(); }
  });
  document.getElementById('arrayX').addEventListener('change', function(e){
    const arr = getSelectedArray();
    if(arr){ arr.x = snapValue(parseFloat(e.target.value) || 0); buildArrays(); buildCoverage(); saveState(); }
  });
  document.getElementById('arrayY').addEventListener('change', function(e){
    const arr = getSelectedArray();
    if(arr){ arr.y = snapValue(parseFloat(e.target.value) || 0); buildArrays(); buildCoverage(); saveState(); }
  });
  document.getElementById('resSelect').addEventListener('change', function(e){
    state.resMode = e.target.value;
    buildCoverage();
  });
  document.getElementById('btnRecompute').addEventListener('click', function(){
    buildCoverage();
  });

  // Tag visibility toggles
  document.querySelectorAll('[data-tag]').forEach(function(cb){
    cb.addEventListener('change', function(){
      if(!state.tags) state.tags = defaultTags();
      state.tags[cb.dataset.tag] = cb.checked;
      applyTagVisibility();
      saveState();
    });
  });

  // Outliner selection and block rename
  const outliner = document.getElementById('outliner');
  outliner.addEventListener('click', function(e){
    const item = e.target.closest ? e.target.closest('.outliner-item') : null;
    if(!item) return;
    const type = item.dataset.type;
    const id = item.dataset.id;
    if(type === 'block') selectObject('block', id);
    else if(type === 'array') selectObject('array', id);
    else selectObject(type, id);
  });
  outliner.addEventListener('dblclick', function(e){
    const item = e.target.closest ? e.target.closest('.outliner-item') : null;
    if(!item || item.dataset.type !== 'block') return;
    const b = findBlock(item.dataset.id);
    if(!b) return;
    const name = window.prompt('Rename block', b.name || ('Block ' + b.id));
    if(name !== null && name.trim()){
      b.name = name.trim();
      buildOutliner();
      saveState();
    }
  });

  // Measurements input — Enter applies the active tool's typed value.
  const measurements = document.getElementById('measurementsInput');
  measurements.addEventListener('keydown', function(e){
    if(e.key === 'Enter'){
      e.preventDefault();
      applyMeasurements(measurements.value);
    } else if(e.key === 'Escape'){
      e.preventDefault();
      measurements.blur();
      clearPendingTools();
      setMeasurementsText(state.tool === 'tape' ? '' : '-', state.tool === 'tape');
    }
  });

  // Keyboard shortcuts — SketchUp bindings (ignored while typing in a field,
  // except Ctrl/⌘+Z, Ctrl/⌘+S and Esc, which always work).
  function nudgeSelected(dx, dy, fine, repeat){
    const sel = state.selectedObject;
    if(!sel){ setStatus('Nudge: select a block or array first.'); return; }
    const step = fine ? 0.1 : 0.5;
    const mx = dx * step, my = dy * step;
    if(sel.type === 'block'){
      const b = findBlock(sel.id);
      if(!b) return;
      if(!repeat) pushUndo();
      const nx = fine ? Math.round((b.x + mx) * 10) / 10 : snapValue(b.x + mx);
      const ny = fine ? Math.round((b.y + my) * 10) / 10 : snapValue(b.y + my);
      if(nx !== b.x || ny !== b.y){
        b.x = nx; b.y = ny;
        updateBlockMesh(b);
        saveState();
        setStatus('Nudge: block at ' + fmtNum(b.x) + ', ' + fmtNum(b.y) + ' m');
      } else if(!repeat) state.undoStack.pop();
    } else if(sel.type === 'array'){
      const a = findArray(sel.id);
      if(!a) return;
      if(fine){
        a.x = Math.round((a.x + mx) * 10) / 10;
        a.y = Math.round((a.y + my) * 10) / 10;
        buildArrays(); buildCoverage(); syncArrayPanel(); saveState();
      } else {
        moveArrayTo(a, a.x + mx, a.y + my);
      }
      setStatus('Nudge: ' + a.name + ' at ' + fmtNum(a.x) + ', ' + fmtNum(a.y) + ' m');
    }
  }

  // Stream Deck layer: the deck sends F13-F24 hotkeys (Elgato Hotkey
  // actions). Each one drives the same handler as its on-screen control.
  function deckKey(key, shift){
    if(shift){
      if(key === 'F13'){
        const ids = VENUES.map(function(v){ return v.id; });
        const nxt = ids[(ids.indexOf(state.venueId) + 1) % ids.length];
        const vs = document.getElementById('venueSelect');
        vs.value = nxt;
        if(vs.onchange) vs.onchange();
        setStatus('Deck: venue ' + nxt + '.');
      }
      else if(key === 'F14'){
        const rs = document.getElementById('resSelect');
        rs.value = state.resMode === 'high' ? 'low' : 'high';
        rs.dispatchEvent(new Event('change'));
        setStatus('Deck: coverage resolution ' + rs.value + '.');
      }
      else if(key === 'F15'){
        const st = document.getElementById('snapToggle');
        st.checked = !st.checked;
        st.dispatchEvent(new Event('change'));
        setStatus('Deck: snap ' + (state.snap ? 'on' : 'off') + '.');
      }
      else if(key === 'F16'){
        document.getElementById('shortcutsModal').classList.toggle('active');
      }
      return;
    }
    const tools = { F13: 'select', F14: 'orbit', F15: 'pan', F16: 'rectangle',
                    F17: 'pushpull', F18: 'move', F19: 'tape', F20: 'eraser' };
    if(tools[key]){ setTool(tools[key]); setStatus('Deck: ' + tools[key] + ' tool.'); return; }
    if(key === 'F21'){ setCameraHome(); setStatus('Deck: Zoom Extents.'); return; }
    if(key === 'F22'){ undo(); return; }
    if(key === 'F23'){ saveState(); setStatus('Deck: design saved.'); return; }
    if(key === 'F24'){
      const sel = state.selectedObject;
      if(sel && sel.type === 'block' && deleteBlock(sel.id)) setStatus('Deck: block deleted.');
      else setStatus('Deck: Delete needs a selected block.');
      return;
    }
  }

  // Second deck dialect for keyboards without F13-F24 (every laptop):
  // Ctrl+Option+letter chords, matched on e.code so Mac character
  // production (Alt+letter inserts symbols) cannot confuse the map.
  function deckChord(code){
    const tools = { KeyS: 'select', KeyO: 'orbit', KeyH: 'pan', KeyR: 'rectangle',
                    KeyP: 'pushpull', KeyM: 'move', KeyT: 'tape', KeyE: 'eraser' };
    if(tools[code]){ setTool(tools[code]); setStatus('Deck: ' + tools[code] + ' tool.'); return; }
    if(code === 'KeyZ'){ setCameraHome(); setStatus('Deck: Zoom Extents.'); return; }
    if(code === 'KeyU'){ undo(); return; }
    if(code === 'KeyV'){ saveState(); setStatus('Deck: design saved.'); return; }
    if(code === 'Backspace'){
      const sel = state.selectedObject;
      if(sel && sel.type === 'block' && deleteBlock(sel.id)) setStatus('Deck: block deleted.');
      else setStatus('Deck: Delete needs a selected block.');
      return;
    }
    if(code === 'Digit1'){ deckKey('F13', true); return; }
    if(code === 'Digit2'){ deckKey('F14', true); return; }
    if(code === 'Digit3'){ deckKey('F15', true); return; }
    if(code === 'Digit4'){ deckKey('F16', true); return; }
  }

  document.addEventListener('keydown', function(e){
    const inField = e.target && e.target.closest && e.target.closest('input,textarea,select');
    const mod = e.ctrlKey || e.metaKey;
    if(e.ctrlKey && e.altKey && e.code){
      e.preventDefault();
      deckChord(e.code);
      return;
    }
    if(mod && (e.key === 'z' || e.key === 'Z') && !e.shiftKey){
      e.preventDefault();
      undo();
      return;
    }
    if(mod && (e.key === 's' || e.key === 'S')){
      e.preventDefault();
      saveState();
      setStatus('Design saved.');
      return;
    }
    if(e.key === 'Escape'){
      const sm = document.getElementById('shortcutsModal');
      if(sm && sm.classList.contains('active')){ sm.classList.remove('active'); return; }
      clearPendingTools();
      setMeasurementsText(state.tool === 'tape' ? '' : '-', state.tool === 'tape');
      if(inField && e.target.blur) e.target.blur();
      if(state.tool === 'tape') setStatus('Tape Measure: click two points (Esc clears).');
      return;
    }
    if(inField) return;
    if(/^F(1[3-9]|2[0-4])$/.test(e.key)){
      e.preventDefault();
      deckKey(e.key, e.shiftKey);
      return;
    }
    if(mod || e.altKey) return;
    if(e.key === ' ' || e.code === 'Space'){
      e.preventDefault();
      setTool('select');
      return;
    }
    if(e.key === 'Delete' || e.key === 'Backspace'){
      const sel = state.selectedObject;
      if(sel && sel.type === 'block'){
        e.preventDefault();
        if(deleteBlock(sel.id)) setStatus('Block deleted. Ctrl/⌘+Z undoes it.');
      } else if(sel && sel.type === 'array'){
        setStatus('Arrays are protected from Delete. Use the speaker controls to change them.');
      }
      return;
    }
    if(e.key.indexOf('Arrow') === 0){
      e.preventDefault();
      const dx = e.key === 'ArrowLeft' ? -1 : (e.key === 'ArrowRight' ? 1 : 0);
      const dy = e.key === 'ArrowUp' ? 1 : (e.key === 'ArrowDown' ? -1 : 0);
      nudgeSelected(dx, dy, e.shiftKey, e.repeat);
      return;
    }
    if(e.key === 'Z' && e.shiftKey){
      e.preventDefault();
      setCameraHome();
      setStatus('Zoom Extents: whole venue in view.');
      return;
    }
    if(e.key === '?'){
      document.getElementById('shortcutsModal').classList.toggle('active');
      return;
    }
    if(/^[0-9.\-]$/.test(e.key) && (state.tool === 'rectangle' || state.tool === 'pushpull' || state.tool === 'move')){
      const m = document.getElementById('measurementsInput');
      if(m){ m.focus(); m.value = e.key; e.preventDefault(); }
      return;
    }
    const key = e.key.toLowerCase();
    if(key === 'v') setTool('select');
    else if(key === 'o') setTool('orbit');
    else if(key === 'h') setTool('pan');
    else if(key === 'r') setTool('rectangle');
    else if(key === 'p') setTool('pushpull');
    else if(key === 'm') setTool('move');
    else if(key === 't') setTool('tape');
    else if(key === 'e') setTool('eraser');
  });

  applyTagVisibility();
  updateStatus();
}

function setTool(tool){
  cancelToolGesture();
  clearPendingTools();
  document.querySelectorAll('.tool').forEach(function(t){
    t.classList.toggle('active', t.dataset.tool === tool);
  });
  state.tool = tool;
  const measurements = document.getElementById('measurementsInput');
  if(measurements){
    measurements.readOnly = (tool === 'tape');
    if(tool === 'tape') measurements.value = '';
  }
  updateStatus();
}

function updateStatus(){
  const msgs = {
    select: 'Select: click a block or array to select it.',
    orbit: 'Orbit: drag to orbit, scroll to zoom, right-drag to pan.',
    pan: 'Hand: drag to pan the view.',
    rectangle: 'Rectangle: click two ground corners, or type WxD and press Enter.',
    pushpull: 'Push/Pull: drag a block top, or type a height and press Enter.',
    move: 'Move: drag a block or array, or type dx,dz and press Enter.',
    tape: 'Tape Measure: click two ground points; Esc clears.',
    eraser: 'Eraser: click a block to delete it (venue/zones/arrays are protected).'
  };
  setStatus((msgs[state.tool] || 'Ready.') + ' Practice tool.');
}

function updateArrayUI(){
  const arrSelect = document.getElementById('arraySelect');
  if(!state.arrays.length) state.arrays = defaultArrays();
  if(!state.arrays.some(function(a){ return String(a.id) === String(state.selectedArrayId); })){
    state.selectedArrayId = state.arrays[0].id;
  }
  arrSelect.innerHTML = '';
  state.arrays.forEach(function(arr){
    const opt = document.createElement('option');
    opt.value = String(arr.id);
    opt.textContent = arr.name;
    arrSelect.appendChild(opt);
  });
  arrSelect.value = String(state.selectedArrayId);
  arrSelect.onchange = function(){
    const arr = findArray(arrSelect.value);
    if(arr){
      state.selectedArrayId = arr.id;
      state.selBeam = 0;
      selectObject('array', arr.id);
    }
  };
  syncArrayPanel();
}

function getSelectedArray(){
  for(let i = 0; i < state.arrays.length; i++){
    if(String(state.arrays[i].id) === String(state.selectedArrayId)) return state.arrays[i];
  }
  return state.arrays[0] || null;
}


function getSelectedBeam(){
  const arr = getSelectedArray();
  if(!arr || !arr.beams || !arr.beams.length) return null;
  if(state.selBeam >= arr.beams.length) state.selBeam = arr.beams.length - 1;
  if(state.selBeam < 0) state.selBeam = 0;
  return arr.beams[state.selBeam];
}

function syncBeamChips(){
  const wrap = document.getElementById('beamChips');
  if(!wrap) return;
  const arr = getSelectedArray();
  wrap.innerHTML = '';
  if(!arr || !arr.beams) return;
  arr.beams.forEach(function(b, i){
    const btn = document.createElement('button');
    btn.textContent = 'Beam ' + (i + 1);
    btn.className = 'beam-chip' + (i === state.selBeam ? ' active' : '');
    btn.addEventListener('click', function(){
      state.selBeam = i;
      syncArrayPanel();
      setStatus(arr.name + ': editing Beam ' + (i + 1) + '.');
    });
    wrap.appendChild(btn);
  });
}

function syncBeamSelects(b){
  const zoneSel = document.getElementById('beamZone');
  const layerSel = document.getElementById('beamLayer');
  if(zoneSel){
    const venue = hVenueById(state.venueId);
    const cur = zoneSel.value;
    zoneSel.innerHTML = '';
    (venue.zones || []).forEach(function(z){
      const o = document.createElement('option');
      o.value = z.name; o.textContent = z.name;
      zoneSel.appendChild(o);
    });
    const empty = document.createElement('option');
    empty.value = ''; empty.textContent = '(none)';
    zoneSel.appendChild(empty);
    zoneSel.value = b.zone || '';
    if(zoneSel.value !== (b.zone || '')) zoneSel.value = cur || '';
  }
  if(layerSel) layerSel.value = b.layer || 'Main';
}

function normalizeArrays(){
  state.arrays.forEach(function(a){
    if(typeof a.height !== 'number') a.height = 5.5;
    if(!Array.isArray(a.beams) || !a.beams.length) a.beams = [{az:0, tilt:0, hBeam:28, vBeam:18, gain:0, zone:'', layer:'Main'}];
    a.beams.forEach(function(b){ if(!b.layer) b.layer = 'Main'; if(typeof b.zone !== 'string') b.zone = ''; });
  });
}

function syncArrayPanel(){
  const arr = getSelectedArray();
  if(!arr) return;
  document.getElementById('arrayOn').checked = !!arr.on;
  syncBeamChips();
  const heightEl = document.getElementById('heightRange');
  if(heightEl){ const hv = (typeof arr.height === 'number' ? arr.height : 5.5); heightEl.value = hv; document.getElementById('heightVal').textContent = hv.toFixed(1); }
  const b = getSelectedBeam();
  if(b){
    document.getElementById('azRange').value = b.az;
    document.getElementById('azVal').textContent = b.az;
    document.getElementById('tiltRange').value = b.tilt;
    document.getElementById('tiltVal').textContent = b.tilt;
    document.getElementById('hBeamRange').value = b.hBeam;
    document.getElementById('hBeamVal').textContent = b.hBeam;
    document.getElementById('vBeamRange').value = b.vBeam;
    document.getElementById('vBeamVal').textContent = b.vBeam;
    document.getElementById('gainRange').value = b.gain;
    document.getElementById('gainVal').textContent = b.gain;
    syncBeamSelects(b);
  }
  document.getElementById('arrayX').value = arr.x;
  document.getElementById('arrayY').value = arr.y;
}

function addSpeaker(){
  if(state.arrays.length >= 8){ alert('Max 8 speakers'); return; }
  let max = 0;
  state.arrays.forEach(function(a){ const n = Number(a.id); if(isFinite(n)) max = Math.max(max, n); });
  const id = max + 1;
  state.arrays.push({
    id: id,
    name: 'Array ' + id,
    model: 'X1',
    x: 0,
    y: 4,
    height: 5.5,
    on: false,
    beams: [{ az: 0, tilt: 0, hBeam: 28, vBeam: 18, gain: 0, zone: '', layer: 'Main' }]
  });
  state.selectedArrayId = id;
  updateArrayUI();
  buildArrays();
  buildCoverage();
  buildOutliner();
  selectObject('array', id, { silent: true });
  saveState();
}

function delSpeaker(){
  if(state.arrays.length <= 1){ alert('Min 1 speaker'); return; }
  state.arrays = state.arrays.filter(function(a){ return String(a.id) !== String(state.selectedArrayId); });
  state.selectedArrayId = state.arrays[0].id;
  if(state.selectedObject && state.selectedObject.type === 'array') state.selectedObject = null;
  updateArrayUI();
  buildArrays();
  buildCoverage();
  buildOutliner();
  refreshSelectionVisual();
  saveState();
}

function exportJSON(){
  const design = {
    venueId: state.venueId,
    arrays: state.arrays,
    zoneTargets: state.zoneTargets,
    layerOn: state.layerOn,
    tags: state.tags,
    blocks: state.blocks
  };
  const blob = new Blob([JSON.stringify(design, null, 2)], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'holoplot-design.json';
  a.click();
  URL.revokeObjectURL(url);
}

function importJSON(e){
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = function(evt){
    try {
      const design = JSON.parse(evt.target.result);
      if(design.venueId) state.venueId = design.venueId;
      if(Array.isArray(design.arrays) && design.arrays.length) state.arrays = design.arrays;
      if(design.zoneTargets) state.zoneTargets = design.zoneTargets;
      if(design.layerOn) state.layerOn = design.layerOn;
      if(design.tags) state.tags = Object.assign(defaultTags(), design.tags);
      state.blocks = Array.isArray(design.blocks) ? design.blocks : [];
      state.selectedArrayId = state.arrays[0] ? state.arrays[0].id : 1;
      state.selectedObject = null;
      state.undoStack = [];
      clearPendingTools();
      updateArrayUI();
      buildVenue();
      buildBlocks();
      buildArrays();
      buildCoverage();
      buildOutliner();
      applyTagVisibility();
      setCameraHome();
      document.getElementById('venueSelect').value = state.venueId;
      document.getElementById('venueName').textContent = hVenueById(state.venueId).label;
      saveState();
      alert('Design imported');
    } catch(err) {
      alert('Invalid JSON');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}

function exportGLB(){
  const exporter = new GLTFExporter();
  const exportRoot = new THREE.Group();
  [venueGroup, zonesGroup, blocksGroup, arraysGroup, beamsGroup, coverageGroup].forEach(function(g){
    if(g && g.visible) exportRoot.add(g.clone(true));
  });
  exporter.parse(exportRoot, function(gltf){
    const blob = new Blob([gltf], {type: 'model/gltf-binary'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'holoplot-design.glb';
    a.click();
    URL.revokeObjectURL(url);
  }, function(err){
    alert('Export error');
  }, {binary: true});
}

function resetDesign(){
  if(!confirm('Reset design?')) return;
  state.venueId = 'theatre';
  state.arrays = defaultArrays();
  state.layerOn = defaultLayerOn();
  state.tags = defaultTags();
  state.zoneTargets = {};
  state.blocks = [];
  state.undoStack = [];
  state.selectedArrayId = 1;
  state.selectedObject = null;
  state.rectFirst = null;
  state.tapeStart = null;
  state.lastGroundClick = null;
  setTool('select');
  clearPendingTools();
  updateArrayUI();
  buildVenue();
  buildBlocks();
  buildArrays();
  buildCoverage();
  buildOutliner();
  applyTagVisibility();
  setCameraHome();
  document.getElementById('venueSelect').value = state.venueId;
  document.getElementById('venueName').textContent = hVenueById(state.venueId).label;
  setMeasurementsText('-', false);
  saveState();
  setStatus('Design reset to defaults.');
}

// Initialize
loadState();
window.addEventListener('DOMContentLoaded', function(){
  try {
    initThree();
  } catch (err) {
    // A WebGL failure must not kill the whole UI: tools, panels and
    // shortcuts still init, and the status bar names the problem.
    window.__hpThreeError = String(err && err.message || err);
  }
  initUI();
  if (window.__hpThreeError) {
    setStatus('3D view failed to start (' + window.__hpThreeError + '). Tools and panels still work; try Chrome/Edge with hardware acceleration on.');
  }
  window.__hpBooted = true;
});
