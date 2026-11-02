# Holoplot 3D — Venue Planner (Practice)

**Practice edition** — not SketchUp, not HOLOPLOT software, not affiliated with Trimble or HOLOPLOT. SPL values are relative practice values from a simplified model.

## Coordinate Mapping

- Plan x -> world X
- Plan y (distance from stage) -> world -Z (audience extends away from camera home)
- Height -> world Y
- Camera home = isometric from stage-left front

## Features

- 5 venues with exact zone rects from reference
- SketchUp-style tool rail: Select, Orbit, Rectangle, Push/Pull, Move, Tape Measure, Eraser
- Arrays in 3D with beam visualization
- Coverage heatmap using SPL calculation
- Import/Export design JSON (round-trips schema)
- Export glTF (.glb)
- localStorage autosave under key "holoplot-3d-v1"
- Full-window responsive layout
- Touch/mouse unified events

## Running

Open index.html in a modern browser. All assets are same-origin, vendored locally. Works offline once loaded.

## Three.js

Vendored locally from three@0.160.0:
- vendor/three/three.module.js
- vendor/three/examples/jsm/controls/OrbitControls.js
- vendor/three/examples/jsm/controls/TransformControls.js
- vendor/three/examples/jsm/exporters/GLTFExporter.js

## Schema

```json
{
  "venueId": "theatre",
  "arrays": [
    {"id":1,"name":"Array L","model":"X2","x":-6,"y":4,"on":true,"beams":[{"az":-10,"tilt":0,"hBeam":28,"vBeam":18,"gain":0,"zone":"Stalls","layer":"Main"}]},
    {"id":2,"name":"Array R","model":"X2","x":6,"y":4,"on":true,"beams":[{"az":10,"tilt":0,"hBeam":28,"vBeam":18,"gain":0,"zone":"Stalls","layer":"Main"}]},
    {"id":3,"name":"Centre / Balcony","model":"X1","x":0,"y":4,"on":false,"beams":[{"az":0,"tilt":8,"hBeam":20,"vBeam":12,"gain":-3,"zone":"Balcony","layer":"Balcony"}]}
  ],
  "zoneTargets": {},
  "layerOn": {"Main":true,"Balcony":true,"Fill":true},
  "tags": {"Venue":true,"Zones":true,"Blocks":true,"Arrays":true,"Beams":true,"Coverage":true},
  "blocks": [{"id":1,"name":"Block 1","x":-2,"y":4,"w":4,"d":4,"h":2.5,"color":"#8d6e63"}]
}
```

Blocks use plan-space minimum-corner coordinates (`x`, `y`), plan footprint
`w` x `d`, and a height `h` in metres.

