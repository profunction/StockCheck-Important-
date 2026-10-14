# three.js r184 (MIT, see LICENSE)

The real 3D view (web/js/glb3d.js): three.js itself, GLTFLoader and
GLTFExporter (.glb in and out) and OrbitControls (turn, tilt, zoom).
Copied from https://github.com/mrdoob/three.js tag r184; the only change is
`from 'three'` pointing at `./three.module.min.js`, since the site loads
scripts from its own address only (no import map).
