/**
 * The real 3D view (WebGL, three.js): the same boxes an isoScene() draws,
 * as solid 3D you can turn all the way round, tilt, zoom and walk around;
 * saved as a .glb file anyone can open (Windows 3D Viewer, Blender, a
 * website); or, for a company that sent us its floor plan, its own .glb
 * model shown instead.
 *
 * three.js is ours (web/vendor/three, MIT): the site's rules load scripts
 * from our own address only. It is loaded the first time someone asks for
 * the 3D view, so pages without it stay light.
 *
 * World units as iso.js: x right-back, y left-back, z up. In three.js y is
 * up, so a world point (x, y, z) is (x, z, y) there -- the same picture,
 * not mirrored.
 */
const VENDOR = '../vendor/three/';
let lib = null;
/** three.js and the parts used here, loaded once. */
export function loadThree() {
  lib ||= Promise.all([
    import(`${VENDOR}three.module.min.js`),
    import(`${VENDOR}OrbitControls.js`),
    import(`${VENDOR}GLTFLoader.js`),
    import(`${VENDOR}GLTFExporter.js`),
  ]).then(([THREE, { OrbitControls }, { GLTFLoader }, { GLTFExporter }]) => ({ THREE, OrbitControls, GLTFLoader, GLTFExporter }));
  return lib;
}

/** Can this browser draw WebGL at all? */
export function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

/** Words on a little canvas, for a label above a box or painted on the floor. */
function textCanvas(text, { ink = '#0b1b2b', bg = 'rgba(255,255,255,.94)', px = 48 } = {}) {
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  const font = `700 ${px}px system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif`;
  g.font = font;
  const w = Math.ceil(g.measureText(text).width + px * 0.9);
  const hgt = Math.ceil(px * 1.5);
  c.width = w;
  c.height = hgt;
  g.font = font;
  if (bg) {
    g.fillStyle = bg;
    const r = hgt / 2;
    g.beginPath();
    g.moveTo(r, 0); g.lineTo(w - r, 0); g.arc(w - r, r, r, -Math.PI / 2, Math.PI / 2); g.lineTo(r, hgt); g.arc(r, r, r, Math.PI / 2, Math.PI * 1.5);
    g.fill();
  }
  g.fillStyle = ink;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, hgt / 2 + px * 0.04);
  return c;
}

/**
 * Builds the boxes as a three.js group: { group, labels, movers, pickables }.
 * [labels] is kept apart (sprites face the camera and are not saved in the .glb).
 */
export function buildModel(T, boxes, { W = 10, D = 10, night = false, floor = true, floorColor = null, selected = null } = {}) {
  const group = new T.Group();
  group.name = 'JSOX';
  const labels = new T.Group();
  const movers = [];
  const pickables = [];
  const mats = new Map();
  const mat = (color, kind = '') => {
    const key = `${color}|${kind}`;
    if (!mats.has(key)) {
      const glass = kind === 'glass' || kind === 'wall';
      const m = new T.MeshStandardMaterial({
        color: new T.Color(color),
        roughness: glass ? 0.15 : kind === 'metal' ? 0.35 : 0.72,
        metalness: glass ? 0.1 : kind === 'metal' ? 0.5 : 0.04,
        transparent: glass,
        opacity: kind === 'wall' ? 0.28 : glass ? 0.5 : 1,
        depthWrite: !glass,
      });
      m.name = key;
      mats.set(key, m);
    }
    return mats.get(key);
  };
  const glow = new T.MeshStandardMaterial({ color: 0xfacc15, emissive: 0xf59e0b, emissiveIntensity: 0.6, roughness: 0.5 });
  const unit = new T.BoxGeometry(1, 1, 1);
  const round = new T.CylinderGeometry(0.5, 0.5, 1, 18);
  const ball = new T.SphereGeometry(0.5, 20, 14);

  // The floor: a slab, a little bigger than the room, with a faint grid.
  if (floor) {
    const slab = new T.Mesh(unit, mat(floorColor || (night ? '#10202f' : '#e9eef1')));
    slab.scale.set(W + 1.6, 0.35, D + 1.6);
    slab.position.set(W / 2, -0.175, D / 2);
    slab.receiveShadow = true;
    slab.name = 'floor';
    group.add(slab);
    const grid = new T.GridHelper(Math.max(W, D) + 1.6, Math.ceil(Math.max(W, D) + 1.6), night ? 0x1e3a52 : 0xc9d4dc, night ? 0x16304a : 0xd8e0e6);
    grid.position.set(W / 2, 0.002, D / 2);
    grid.material.transparent = true;
    grid.material.opacity = 0.55;
    labels.add(grid); // not saved: lines are not part of the model
  }

  const floorWords = (b, text) => {
    const cv = textCanvas(String(text), { ink: night ? '#8aa3bb' : '#5b6b7a', bg: null, px: 64 });
    const tex = new T.CanvasTexture(cv);
    tex.colorSpace = T.SRGBColorSpace;
    const size = (b.labelSize || 0.42) * 1.4;
    const plane = new T.Mesh(new T.PlaneGeometry(size * cv.width / cv.height, size), new T.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(b.x + (b.w || 0) / 2, 0.012, b.y + (b.d || 0) / 2);
    plane.name = `words ${text}`;
    group.add(plane);
  };
  const tag = (b, text, top) => {
    const cv = textCanvas(String(text), night ? { ink: '#e2ebf3', bg: 'rgba(8,20,32,.92)' } : {});
    const tex = new T.CanvasTexture(cv);
    tex.colorSpace = T.SRGBColorSpace;
    const sp = new T.Sprite(new T.SpriteMaterial({ map: tex, depthTest: true, transparent: true }));
    const size = b.labelCls === 'big' ? 0.62 : b.labelCls === 'small' ? 0.36 : 0.46;
    sp.scale.set(size * cv.width / cv.height, size, 1);
    sp.position.set(b.x + (b.w || 0) / 2, top + size * 0.9, b.y + (b.d || 0) / 2);
    sp.center.set(0.5, 0.3);
    sp.userData.src = b;
    labels.add(sp);
  };

  let tags = 0;
  for (const b of boxes) {
    const z = b.z || 0;
    const h = b.h || 0;
    const w = b.w || 0;
    const d = b.d || 0;
    if (b.noFill) { if (b.label) floorWords(b, b.label); continue; }
    const color = b.color || '#9aa5b1';
    const on = b.id != null && b.id === selected;
    const kind = b.kind === 'glass' ? 'glass' : /\bwall\b/.test(b.cls || '') ? 'wall' : '';
    const part = new T.Group();
    part.name = String(b.title || b.label || b.id || b.kind || 'box').slice(0, 60);
    const add = (geo, m, sx, sy, sz, px, py, pz) => {
      const mesh = new T.Mesh(geo, on ? glow : m);
      mesh.scale.set(sx, sy, sz);
      mesh.position.set(px, py, pz);
      mesh.castShadow = kind !== 'wall' && h > 0.05;
      mesh.receiveShadow = true;
      part.add(mesh);
      return mesh;
    };
    const cx = b.x + w / 2;
    const cz = b.y + d / 2;
    if (b.kind === 'tree') {
      const tall = h || 0.6;
      add(round, mat('#8b5a2b'), 0.12, tall, 0.12, cx, z + tall / 2, cz);
      const r = Math.max(w, d) * 1.2;
      add(ball, mat('#22a06b'), r, r, r, cx, z + tall + r * 0.3, cz);
    } else if (b.kind === 'person') {
      const r = Math.max(0.18, Math.min(w, d) * 0.9);
      add(round, mat(color), r, h, r, cx, z + h / 2, cz);
      add(ball, mat('#f1c6a0'), 0.3, 0.3, 0.3, cx, z + h + 0.16, cz);
    } else if (!h) {
      // A tile on the floor: a hair thick, so it shows.
      add(unit, mat(color, kind), w, 0.02, d, cx, z + 0.01, cz);
    } else {
      add(unit, mat(color, kind), w, h, d, cx, z + h / 2, cz);
      if (b.kind === 'carton') add(unit, mat('#7c5a2e'), Math.min(0.08, w * 0.12), 0.006, d * 1.001, cx, z + h + 0.003, cz);
      if ((b.kind === 'building' || b.kind === 'glass') && h > 0.6) {
        // Lit windows on the two long sides.
        const win = mat(b.kind === 'glass' ? '#e0f2fe' : '#fef3c7');
        const rows = Math.max(1, Math.floor(h / 0.45));
        for (let r = 0; r < rows; r++) {
          const y = z + (r + 0.5) * h / rows;
          add(unit, win, w * 0.8, h / rows * 0.42, 0.02, cx, y, b.y + d + 0.011);
          add(unit, win, 0.02, h / rows * 0.42, d * 0.8, b.x + w + 0.011, y, cz);
        }
      }
    }
    if (b.anim?.path?.length) movers.push({ obj: part, path: [[0, 0], ...b.anim.path], dur: b.anim.dur || 8 });
    part.userData.src = b;
    if (b.pick !== false) pickables.push(part);
    group.add(part);
    if (b.label && b.labelCls === 'floor') floorWords(b, b.label);
    else if (b.label && tags++ < 400) tag(b, b.label, z + (b.kind === 'tree' ? h + 0.6 : b.kind === 'person' ? h + 0.35 : h));
  }
  return { group, labels, movers, pickables };
}

/**
 * The 3D view in [host] (an element that is already on the page): returns
 * { draw(boxes, W, D), select(id), autoRotate(on?), glb(): Promise<ArrayBuffer>,
 *   useModel(url|null), dispose() }.
 * [onPick] gets the box tapped. [night] the dark showroom look.
 */
export async function glbView(host, { boxes = [], W = 10, D = 10, onPick = null, night = false, floor = true, floorColor = null, spin = false, model = null } = {}) {
  const { THREE: T, OrbitControls, GLTFLoader, GLTFExporter } = await loadThree();
  const renderer = new T.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const canvas = renderer.domElement;
  canvas.className = 'g3d-canvas';
  host.append(canvas);

  const scene = new T.Scene();
  scene.background = new T.Color(night ? '#08131e' : '#eef5f4');
  scene.fog = new T.Fog(scene.background, 60, 160);
  const camera = new T.PerspectiveCamera(42, 1, 0.1, 500);
  const hemi = new T.HemisphereLight(night ? 0x9cc3ff : 0xffffff, night ? 0x1a2c3d : 0xb8c4cc, night ? 1.9 : 1.6);
  scene.add(hemi);
  const sun = new T.DirectionalLight(0xffffff, night ? 2.1 : 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI / 2 - 0.04; // never under the floor
  controls.minDistance = 2;
  controls.autoRotateSpeed = 1.2;
  controls.screenSpacePanning = false;

  let size = { W, D };
  let current = { boxes, W, D };
  let built = null;
  let custom = null;
  let selected = null;
  let dirty = true;
  let framed = false;
  controls.addEventListener('change', () => { dirty = true; });

  const frame = (w, d) => {
    const span = Math.max(w, d, 6);
    controls.target.set(w / 2, 0, d / 2);
    controls.maxDistance = span * 4;
    camera.position.set(w / 2 + span * 0.85, span * 0.8, d / 2 + span * 0.95);
    sun.position.set(w / 2 - span * 0.6, span * 1.4, d / 2 + span * 0.8);
    sun.target.position.set(w / 2, 0, d / 2);
    const s = sun.shadow.camera;
    s.left = -span; s.right = span; s.top = span; s.bottom = -span; s.near = 0.5; s.far = span * 4;
    s.updateProjectionMatrix();
    controls.update();
  };

  const clear = (g) => {
    if (!g) return;
    scene.remove(g);
    g.traverse((o) => {
      if (o.geometry && !o.geometry.userData?.shared) o.geometry.dispose?.();
      if (o.material) for (const m of [].concat(o.material)) { m.map?.dispose?.(); m.dispose?.(); }
    });
  };
  const draw = (list = current.boxes, w = current.W, d = current.D) => {
    current = { boxes: list, W: w, D: d };
    if (custom) return;
    if (built) { clear(built.group); clear(built.labels); }
    built = buildModel(T, list, { W: w, D: d, night, floor, floorColor, selected });
    scene.add(built.group, built.labels);
    if (!framed || size.W !== w || size.D !== d) { frame(w, d); framed = true; size = { W: w, D: d }; }
    dirty = true;
  };

  /** Shows a company's own model (a .glb at [url]) instead of the boxes; null: back to the boxes. */
  const useModel = async (url) => {
    if (!url) {
      clear(custom);
      custom = null;
      framed = false;
      draw();
      return;
    }
    const gltf = await new GLTFLoader().loadAsync(url);
    if (built) { clear(built.group); clear(built.labels); built = null; }
    clear(custom);
    custom = gltf.scene;
    custom.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    // Sat on the floor at the corner, whatever size it was made at.
    const bounds = new T.Box3().setFromObject(custom);
    const dims = bounds.getSize(new T.Vector3());
    custom.position.set(-bounds.min.x, -bounds.min.y, -bounds.min.z);
    scene.add(custom);
    frame(dims.x || 10, dims.z || 10);
    dirty = true;
  };

  // A tap (not a drag) on something: what it is.
  const ray = new T.Raycaster();
  let down = null;
  canvas.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; controls.autoRotate = false; host.classList.remove('turning'); });
  canvas.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6 || !onPick || !built) return;
    const r = canvas.getBoundingClientRect();
    ray.setFromCamera(new T.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    const hit = ray.intersectObjects([...built.pickables, ...built.labels.children.filter((o) => o.isSprite && o.userData.src?.pick !== false)], true)[0];
    let o = hit?.object;
    while (o && !o.userData.src) o = o.parent;
    if (o) onPick(o.userData.src);
  });

  const fit = () => {
    const w = host.clientWidth || 1;
    const h = host.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    dirty = true;
  };
  const watch = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null;
  watch?.observe(host);
  fit();

  const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let alive = true;
  const t0 = performance.now();
  const loop = (now) => {
    if (!alive) return;
    if (!host.isConnected) { dispose(); return; }
    requestAnimationFrame(loop);
    if (document.hidden) return;
    controls.update();
    // Lorries driving in, people walking: along their path, round and round.
    if (built?.movers.length && !still) {
      for (const m of built.movers) {
        const k = (((now - t0) / 1000) % m.dur) / m.dur * (m.path.length - 1);
        const i = Math.min(m.path.length - 2, Math.floor(k));
        const f = k - i;
        const [ax, ay] = m.path[i];
        const [bx, by] = m.path[i + 1] || m.path[i];
        m.obj.position.set(ax + (bx - ax) * f, 0, ay + (by - ay) * f);
      }
      dirty = true;
    }
    if (dirty || controls.autoRotate) { renderer.render(scene, camera); dirty = false; }
  };
  requestAnimationFrame(loop);

  const autoRotate = (on = !controls.autoRotate) => {
    controls.autoRotate = !!on && !still;
    host.classList.toggle('turning', controls.autoRotate);
    dirty = true;
    return controls.autoRotate;
  };
  const dispose = () => {
    if (!alive) return;
    alive = false;
    watch?.disconnect();
    controls.dispose();
    if (built) { clear(built.group); clear(built.labels); }
    clear(custom);
    renderer.dispose();
    canvas.remove();
  };

  /** The model as a .glb file (binary glTF): the boxes, or the company's own model. */
  const glb = () => new Promise((resolve, reject) => {
    const what = custom || built?.group;
    if (!what) { reject(new Error('Nothing to save')); return; }
    new GLTFExporter().parse(what, resolve, reject, { binary: true });
  });

  draw(boxes, W, D);
  if (model) await useModel(model).catch(() => {});
  if (spin) autoRotate(true);
  return {
    draw,
    select: (id) => { selected = id; draw(); },
    autoRotate,
    glb,
    useModel,
    hasModel: () => !!custom,
    dispose,
    /** For tests: how many things are in the picture. */
    count: () => (custom || built?.group)?.children.length || 0,
    /** Where box [id] is on the screen (page pixels), to tap it. */
    where: (id) => {
      const part = built?.pickables.find((o) => o.userData.src?.id === id);
      if (!part) return null;
      controls.update();
      camera.updateMatrixWorld();
      const c = new T.Box3().setFromObject(part).getCenter(new T.Vector3()).project(camera);
      const r = canvas.getBoundingClientRect();
      return [r.left + (c.x + 1) / 2 * r.width, r.top + (1 - c.y) / 2 * r.height];
    },
  };
}
