// ============================================================================
// devRoom.ts — 🧪 the DEV ROOM (temporary): a performance test for the Custom
// Character Builder System's female body in this game.
//
// Joshua's idea (2026-11-14): one model in the game, loaded ONCE and cloned,
// each clone with its own body sizes and painted clothes, instead of a file per
// person. This room measures what that costs on a phone:
//
//   - the builder's own body + hair are loaded once, straight from the builder's
//     site (same server as this game, so nothing is copied into this repo);
//   - each person is a clone: the mesh and textures are shared, each one gets
//     her own skeleton, shape (morph weights, height) and outfit colours;
//   - pick how many walk around, and read the frames per second on screen. The
//     game's current (small) Sarah model is there to compare against.
//
// The people wear Joshua's first three saved looks (LOOKS below), in turn. Their
// outfits are painted on in the shader by height (about what one of the builder's
// painted garments costs to draw), not with the builder's own fabric code.
//
// Opened from ⚙️ Settings -> 🧪 DEV Room, or ?devroom=1. It never touches the
// save: main.ts hands over here before the game starts.
// ============================================================================
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { MeshoptSimplifier } from 'meshoptimizer/simplifier';
// The builder's own posing code (a copy: see src/vendor/ccbs/README.md): how she stands, breathes and walks
import { HumanRig } from './vendor/ccbs/HumanRigView';
import { measureHuman } from './vendor/ccbs/humanSkeleton';
import { poseHuman, humanStride } from './vendor/ccbs/humanPose';
import { walkWeight, weighWalk } from './vendor/ccbs/walkWeight';
import type { HumanMeasure, MutableJointTurn } from './vendor/ccbs/humanRig';
import { MOTION_TARGETS, motionWeights, restingBellySpring, stepBellySpring, stepBreastSpring, walkBounceAccel, walkSwayAccel, type BellySpring } from './vendor/ccbs/bellyMotion';

/** The builder's published models (GitHub Pages: the same origin as this game when it's live). */
const BUILDER = 'https://capflyingfun.github.io/Custom-Character-Builder-System/models/';

interface ModelDef {
  key: string;
  label: string;
  files: string[];       // loaded once, then cloned per person
  builder: boolean;      // the builder's body: random shape + stand-in outfits
}
const MODELS: ModelDef[] = [
  { key: 'builder', label: "Builder body", files: [BUILDER + 'sarah-v2-body-slim.glb', BUILDER + 'sarah-v2-hair.glb'], builder: true },
  { key: 'game', label: "Game's Sarah", files: [`${import.meta.env.BASE_URL}models/h-sarah.glb`], builder: false },
];
const COUNTS = [1, 3, 6, 10, 15, 20, 30, 40];
const HEIGHT = 2.8; // people are this tall in the game
/**
 * DETAIL (v0.29.3, Joshua's "smart LOD" idea): how much of the model's triangles are drawn, in %.
 * The model FILE is never changed: when it has loaded, a lighter triangle list is worked out here for
 * the same points (so her skeleton, her shapes and her outfit all still fit), and swapped in.
 */
const DETAILS = [100, 50, 25, 10, 5, 3]; // (3% of the builder body is about 9k triangles: the "under 10k" gameplay target)
const NO_MORPHS = {};
/**
 * AUTO DETAIL (v0.35; Joshua: "closer to the camera the higher %, and further away less"). A person within
 * `within` of the camera is drawn at `detail` %. Distances are in the game's units: people are 2.8 units tall
 * (a 1.68 m woman), so ONE UNIT IS 0.6 m: 9 units is about 5.4 m, 18 units about 11 m. The game's top-down
 * camera sits about 22 units from you, so up there everyone is at 3%; the higher levels are for the 👁️ view.
 */
const AUTO = [{ within: 9, detail: 10 }, { within: 18, detail: 5 }, { within: Infinity, detail: 3 }];
interface GeoKeep { index0: THREE.BufferAttribute | null; morph0: THREE.BufferGeometry['morphAttributes']; lods: Map<string, THREE.BufferAttribute>; auto?: THREE.BufferAttribute[] }

/**
 * JOSHUA'S FIRST THREE LOOKS, saved in the builder on 2026-11-14 (its export, traddomium-characters.json:
 * Char1, Char2, Char3). What this test takes from each: her belly size (the builder's `bump`, in %), her
 * height (cm from the standard body), and her painted outfit: which leggings and tee, and their fabric
 * colours (the builder's swatch tables, fabricLibrary.ts). Her finer body controls (waist, hips, limb
 * lengths, the belly's and bust's own shapes) and the fabrics' knit are the builder's own code, not copied
 * here: this room is about what she costs to draw.
 */
interface Look {
  name: string;
  bump: number;        // belly size, %
  heightCm: number;    // from the standard body (about 168 cm)
  top: number;         // tee colour
  legs: number;        // leggings colour
  capri: boolean;      // leggings end mid-calf (leggingsCapri) or at the ankle
  longSleeves: boolean; // teeLong or teeShort
}
const LOOKS: Look[] = [
  { name: 'Char1', bump: 23, heightCm: 3.5, top: 0x4e642e, legs: 0x37383e, capri: false, longSleeves: false },  // jersey: olive tee, charcoal leggings
  { name: 'Char2', bump: 21, heightCm: -7, top: 0x9c9ca3, legs: 0x1631bc, capri: false, longSleeves: false },   // ribbed: grey tee, blue leggings
  { name: 'Char3', bump: 5, heightCm: -6.5, top: 0xeec415, legs: 0x0b7e3a, capri: true, longSleeves: true },    // sweater: yellow long tee, green capris
];
/** The standard body with the stand-in outfit ("Looks: off"). */
const PLAIN: Look = { name: 'Base', bump: 0, heightCm: 0, top: 0xd8473f, legs: 0x33343f, capri: false, longSleeves: false };
const STANDARD_CM = 168;
const SNEAKERS = 0xf2f2f2;

/**
 * The builder's belly sizes (its sarahLabTool.ts BELLY_KEYS): the file itself is the 100%
 * belly, each named morph is that belly at another size ('belly' = flat, 0%), and a size in
 * between cross-fades the two keys either side of it.
 */
const BELLY_KEYS: [number, string | null][] = [
  [2, 'belly200'], [1.5, 'belly150'], [1, null], [0.75, 'belly75'], [0.6, 'belly60'], [0.5, 'belly50'], [0.3, 'belly30'], [0.25, 'belly25'], [0, 'belly'],
];
function bellyWeights(size: number): Record<string, number> {
  const s = Math.min(2, Math.max(0, size));
  const out: Record<string, number> = {};
  for (let i = 0; i + 1 < BELLY_KEYS.length; i++) {
    const [hi, hiName] = BELLY_KEYS[i];
    const [lo, loName] = BELLY_KEYS[i + 1];
    if (s > hi || s < lo) continue;
    const k = (s - lo) / (hi - lo);
    if (hiName) out[hiName] = k;
    if (loName) out[loName] = 1 - k;
    break;
  }
  return out;
}

/** The builder's bust for a belly size (its breastVolumeRatio / breastGrowWeight): it grows a little with the belly. */
function bustWeight(bumpPercent: number) {
  const p = Math.min(200, Math.max(0, bumpPercent));
  const volume = p <= 100 ? 1 + (0.3 * p) / 100 : 1.3 + (0.25 * (p - 100)) / 100;
  return (Math.cbrt(volume) - 1) / (Math.cbrt(1.55) - 1);
}

/** A small seeded random (the same person looks the same every time). */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Stand-in painted clothes: the skin's own material, with a top and leggings
 * mixed over it by where each point of her is in her rest pose (height up her
 * body, distance from her middle). One compiled program for everyone; each
 * clone has its own two colours.
 */
function paintedMaterial(base: THREE.Material, box: THREE.Box3, look: Look, fine = true) {
  const m = base.clone();
  // (her skin's bump detail is drawn from a second picture, the normal map. On a much lighter body the
  // picture no longer lines up with the big triangles, and it shows as dark blotches on her face: off below 25%)
  if (!fine) (m as THREE.MeshStandardMaterial).normalMap = null;
  const uniforms = {
    uTop: { value: new THREE.Color(look.top) },
    uLegs: { value: new THREE.Color(look.legs) },
    uShoe: { value: new THREE.Color(SNEAKERS) },
    uLegEnd: { value: look.capri ? 0.17 : 0.04 },      // where the leggings end (height up her body)
    uSleeveEnd: { value: look.longSleeves ? 0.56 : 0.71 }, // where the sleeves end
    uY0: { value: box.min.y },
    uH: { value: box.max.y - box.min.y },
  };
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vRest;\nuniform float uY0;\nuniform float uH;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRest = vec2(abs(position.x) / uH, (position.y - uY0) / uH);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vRest;\nuniform vec3 uTop;\nuniform vec3 uLegs;\nuniform vec3 uShoe;\nuniform float uLegEnd;\nuniform float uSleeveEnd;\nfloat drCloth = 0.0;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          // leggings: waist down to their hem. tee: waist to collar, with its sleeves. sneakers.
          float legs = step(uLegEnd, vRest.y) * step(vRest.y, 0.57) * step(vRest.x, 0.125); // (her hands hang further out than her hips)
          float torso = step(0.55, vRest.y) * step(vRest.y, 0.835) * step(vRest.x, 0.115);
          // (below her shoulder, only what is out at her arm is sleeve)
          float sleeve = step(uSleeveEnd, vRest.y) * step(vRest.y, 0.835) * step(vRest.x, 0.2) * max(step(0.71, vRest.y), step(0.115, vRest.x));
          float topMask = max(torso, sleeve);
          float shoe = step(vRest.y, 0.04);
          diffuseColor.rgb = mix(diffuseColor.rgb, uLegs, legs * (1.0 - topMask));
          diffuseColor.rgb = mix(diffuseColor.rgb, uTop, topMask);
          diffuseColor.rgb = mix(diffuseColor.rgb, uShoe, shoe);
          drCloth = max(max(legs, topMask), shoe);
        }`,
      )
      // (cloth is smooth: her skin's fine detail isn't drawn through it, as under the builder's paint)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize(mix(normal, nonPerturbedNormal, drCloth));')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.85, drCloth);');
  };
  m.customProgramCacheKey = () => (fine ? 'devroom-painted' : 'devroom-painted-plain');
  m.userData.devRoomOwn = true;
  return m;
}

interface Person {
  root: THREE.Group;
  angle: number;   // where she is on her circle
  radius: number;
  speed: number;   // radians per second (its sign is her direction)
  phase: number;
  /** AUTO detail: her baked body at each level, and the level she is drawn at now. */
  lods: { mesh: THREE.Mesh; geos: THREE.BufferGeometry[] }[];
  level: number;
  /** The builder body's own moving skeleton (v0.29.5): her bones posed each frame by the builder's code. */
  live?: {
    rig: HumanRig;
    measure: HumanMeasure;
    carry: number;      // her belly, 0..2 (a big belly walks shorter and wider)
    perUnit: number;    // her skeleton's own units per one of the room's
    walked: number;     // how far she has walked, in the room's units
    out: MutableJointTurn[];
    out2: MutableJointTurn[];
    // Her belly's and bust's weight: two springs, and where her four motion shapes are on each of her meshes
    belly: BellySpring;
    breast: BellySpring;
    bumpPercent: number;
    soft: { influences: number[]; at: number[] }[];
    weights: number[];
  };
}

export async function startDevRoom() {
  // ---- The page: our own canvas and a small panel, over everything else ----
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#9fd3f5;touch-action:none;font-family:system-ui,sans-serif;';
  document.body.appendChild(host);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // (as the game does)
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.appendChild(renderer.domElement);
  const panel = document.createElement('div');
  panel.style.cssText =
    'position:absolute;left:calc(8px + env(safe-area-inset-left));right:calc(8px + env(safe-area-inset-right));top:calc(8px + env(safe-area-inset-top));' +
    'display:flex;flex-direction:column;gap:6px;align-items:flex-start;pointer-events:none;color:#fff;';
  host.appendChild(panel);
  const css = document.createElement('style');
  css.textContent = `
    .dr-row { display:flex; flex-wrap:wrap; gap:6px; pointer-events:auto; }
    .dr-b { font:600 15px system-ui,sans-serif; color:#fff; background:rgba(28,35,42,.82); border:0; border-radius:10px; padding:9px 12px; min-width:44px; min-height:40px; }
    .dr-b.on { background:#2f7fd0; }
    .dr-stat { font:600 13px/1.35 ui-monospace,Menlo,monospace; background:rgba(28,35,42,.82); border-radius:10px; padding:8px 11px; white-space:pre-wrap; max-width:100%; box-sizing:border-box; pointer-events:none; }
    .dr-fps { font-size:22px; }
  `;
  host.appendChild(css);
  const row = () => {
    const d = document.createElement('div');
    d.className = 'dr-row';
    panel.appendChild(d);
    return d;
  };
  const button = (parent: HTMLElement, text: string, onClick: () => void) => {
    const b = document.createElement('button');
    b.className = 'dr-b';
    b.textContent = text;
    b.addEventListener('click', onClick);
    parent.appendChild(b);
    return b;
  };
  const top = row();
  button(top, '← Back to the game', () => {
    const u = new URL(location.href);
    u.searchParams.delete('devroom');
    location.href = u.toString();
  });
  const title = document.createElement('div');
  title.className = 'dr-stat';
  title.textContent = '🧪 DEV Room · character test';
  top.appendChild(title);
  const modelRow = row();
  const countRow = row();
  const detailRow = row();
  const detailLabel = document.createElement('div');
  detailLabel.className = 'dr-stat';
  detailLabel.textContent = 'Detail';
  detailRow.appendChild(detailLabel);
  const optRow = row();
  const stat = document.createElement('div');
  stat.className = 'dr-stat';
  panel.appendChild(stat);

  // ---- The scene: grass, sky, a sun with shadows (like the backyard) ----
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9fd3f5);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x88aa66, 1.15));
  const sun = new THREE.DirectionalLight(0xfff2d6, 2.0);
  sun.position.set(-14, 26, 16);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -20; sc.right = 20; sc.top = 20; sc.bottom = -20; sc.near = 1; sc.far = 80;
  scene.add(sun);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(22, 48), new THREE.MeshStandardMaterial({ color: 0x7ec850, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 300);
  // Drag: orbit. Pinch / wheel: zoom.
  const view = { yaw: 0, pitch: 0.62, dist: 26 };
  const pointers = new Map<number, { x: number; y: number }>();
  let pinch = 0;
  const el = renderer.domElement;
  el.addEventListener('pointerdown', (e) => { pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); pinch = 0; });
  const up = (e: PointerEvent) => { pointers.delete(e.pointerId); pinch = 0; };
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    if (pointers.size === 1) {
      view.yaw -= (e.clientX - p.x) * 0.006;
      view.pitch = THREE.MathUtils.clamp(view.pitch + (e.clientY - p.y) * 0.004, 0.12, 1.4);
    }
    p.x = e.clientX;
    p.y = e.clientY;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch) view.dist = THREE.MathUtils.clamp(view.dist * (pinch / d), 4, 60);
      pinch = d;
    }
  });
  el.addEventListener('wheel', (e) => { view.dist = THREE.MathUtils.clamp(view.dist * (1 + Math.sign(e.deltaY) * 0.1), 4, 60); }, { passive: true });
  const people: Person[] = [];
  const state = { model: MODELS[0], count: 3, morphs: true, shadows: true, detail: 100, shapes: 'live' as 'live' | 'baked' | 'off', underwear: true, auto: false, smart: false, perChar: 0, motion: 'walk' as 'walk' | 'idle' | 'off', plain: false, sharp: true, loading: '', error: '', info: null as Loaded | null };
  const resize = () => {
    renderer.setPixelRatio(state.sharp ? Math.min(window.devicePixelRatio, 2) : 1);
    renderer.setSize(host.clientWidth, host.clientHeight, false);
    el.style.width = '100%';
    el.style.height = '100%';
    camera.aspect = host.clientWidth / Math.max(1, host.clientHeight);
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();

  // ---- Loading a model (once), then cloning it per person ----
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  interface Loaded { parts: THREE.Object3D[]; scale: number; minY: number; box: THREE.Box3; tris: number; mb: number; ms: number }
  const cache = new Map<string, Promise<Loaded>>();
  const load = (def: ModelDef) => {
    let p = cache.get(def.key);
    if (!p) {
      p = (async () => {
        const t0 = performance.now();
        let bytes = 0;
        const parts: THREE.Object3D[] = [];
        for (const url of def.files) {
          const buf = await (await fetch(url)).arrayBuffer();
          bytes += buf.byteLength;
          const gltf = await loader.parseAsync(buf, '');
          parts.push(gltf.scene);
        }
        // Her size as she stands (skinned, in the world), from the first part (the body)
        const world = new THREE.Box3();
        const rest = new THREE.Box3(); // ...and in her geometry's own units (for the painted outfit)
        let tris = 0;
        for (const part of parts) {
          part.updateWorldMatrix(true, true);
          part.traverse((o) => {
            const mesh = o as THREE.SkinnedMesh;
            if (!mesh.isMesh) return;
            mesh.castShadow = true;
            mesh.frustumCulled = false; // (a skinned mesh's bounds are its rest pose's)
            const g = mesh.geometry;
            tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
            if (part !== parts[0]) return;
            // (her rest pose alone: a geometry's own bounding box also covers every morph, the 200% belly included)
            rest.union(new THREE.Box3().setFromBufferAttribute(g.attributes.position as THREE.BufferAttribute));
            world.union(new THREE.Box3().setFromObject(mesh, true));
          });
        }
        const h = Math.max(0.001, world.max.y - world.min.y);
        return { parts, scale: HEIGHT / h, minY: world.min.y, box: rest, tris: Math.round(tris), mb: bytes / 1e6, ms: performance.now() - t0 };
      })();
      cache.set(def.key, p);
    }
    return p;
  };


  /**
   * The test switches that change the model itself, for everyone at once: its detail (a lighter triangle
   * list over the same points) and whether it carries its 43 body shapes at all.
   */
  const applyModelSettings = async (src: Loaded) => {
    await MeshoptSimplifier.ready;
    for (const part of src.parts) {
      part.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const g = mesh.geometry;
        const keep: GeoKeep = (g.userData.devRoom ??= { index0: g.index, morph0: g.morphAttributes, lods: new Map() });
        let index = keep.index0;
        const index0 = keep.index0;
        const lodFor = (detail: number) => {
          const index = index0!;
          // SMART DETAIL (v0.33): her head keeps three times the share of triangles her body gets (a face reads
          // from far away; a back or a thigh doesn't), for the same total. Only on her skin, which has the head.
          const smart = state.smart && src.box.max.y > src.box.min.y && (mesh.material as THREE.Material).name === 'Material_0';
          const key = `${detail}${smart ? 's' : ''}`;
          let lod = keep.lods.get(key);
          if (!lod) {
            const pos = g.attributes.position;
            const points = new Float32Array(pos.count * 3);
            for (let i = 0; i < pos.count; i++) { points[i * 3] = pos.getX(i); points[i * 3 + 1] = pos.getY(i); points[i * 3 + 2] = pos.getZ(i); }
            const all = new Uint32Array(index.array);
            const target = Math.max(3, Math.floor((index.count * detail) / 100 / 3) * 3);
            let lighter: Uint32Array;
            if (smart) {
              // WHICH PARTS OF HER KEEP THEIR TRIANGLES (v0.34; Joshua: "keep certain parts masked as is, but
              // other parts can be consolidated", "protect the hands"). Every point of her gets an IMPORTANCE:
              // 1 on a back or a thigh, more on her face, her hands, her bust, her belly, most on her navel.
              // Her own body shapes say where those are: the points the navel shapes move ARE her navel, the
              // points 'breastGrow' moves are her bust, the points 'belly' moves are her belly (and each
              // fades out smoothly, as the shape does). Her head and hands are found by where they are.
              //
              // The lightening then works on a copy of her in which every point is pushed out from her middle
              // by its importance: an important part looks bigger to it, so a mistake there counts for more
              // and it keeps more of its triangles. Importance changes smoothly, so there are no seams between
              // parts. Only the choice of triangles comes from the copy: her real points are never moved.
              const dict = (mesh as THREE.Mesh).morphTargetDictionary ?? {};
              const morphs = (keep.morph0.position ?? []) as THREE.BufferAttribute[];
              const n = pos.count;
              const B = src.box;
              const H = B.max.y - B.min.y;
              const cx = (B.min.x + B.max.x) / 2, cy = (B.min.y + B.max.y) / 2, cz = (B.min.z + B.max.z) / 2;
              const ease = (k: number) => { const u = Math.min(1, Math.max(0, k)); return u * u * (3 - 2 * u); };
              const weight = new Float32Array(n).fill(1);
              for (let v = 0; v < n; v++) {
                const xr = Math.abs(points[v * 3] - cx) / H, yr = (points[v * 3 + 1] - B.min.y) / H;
                const head = ease((yr - 0.84) / 0.04);                                             // above her neck
                const hand = ease((xr - 0.125) / 0.015) * ease((0.57 - yr) / 0.02) * ease((yr - 0.38) / 0.02); // out at her sides, below her wrists
                // (between her legs, where her thighs meet her hips: a tight fold that tears first when it's lightened)
                const groin = ease((0.075 - xr) / 0.02) * ease((yr - 0.43) / 0.02) * ease((0.53 - yr) / 0.02);
                weight[v] = 1 + 2 * Math.max(head, hand, groin);
              }
              const mark = (names: string[], extra: number, full: number) => {
                for (const name of names) {
                  const m = morphs[dict[name]];
                  if (!m) continue;
                  let most = 0;
                  const moved = new Float32Array(n);
                  for (let v = 0; v < n; v++) { moved[v] = Math.hypot(m.getX(v), m.getY(v), m.getZ(v)); if (moved[v] > most) most = moved[v]; }
                  if (!(most > 0)) continue;
                  // (full importance where the shape moves a point at least `full` of its most, fading to none)
                  for (let v = 0; v < n; v++) weight[v] = Math.max(weight[v], 1 + extra * ease(moved[v] / most / full));
                }
              };
              mark(['belly'], 1, 0.5);
              mark(['breastGrow'], 2, 0.3);
              mark(['navelIn', 'navelOut', 'navelFlat'], 5, 0.3);
              // The lightening is told two more things about every point, beside where it is: where it sits on
              // her skin's picture (so the picture isn't dragged sideways: without it her face came out blotchy),
              // and its place again, scaled by its extra importance. A mistake at an important point then
              // counts several times over, so that part keeps more of its triangles; her real shape is what
              // the lightening works on throughout. (Its first version worked on a copy of her with the
              // important parts blown up instead; that left thin dark slivers on her inner thighs.)
              const uv = g.attributes.uv as THREE.BufferAttribute | undefined;
              const extra = new Float32Array(n * 5);
              for (let v = 0; v < n; v++) {
                extra[v * 5] = uv ? uv.getX(v) : 0;
                extra[v * 5 + 1] = uv ? uv.getY(v) : 0;
                const k = weight[v] - 1;
                extra[v * 5 + 2] = (points[v * 3] - cx) * k;
                extra[v * 5 + 3] = (points[v * 3 + 1] - cy) * k;
                extra[v * 5 + 4] = (points[v * 3 + 2] - cz) * k;
              }
              [lighter] = MeshoptSimplifier.simplifyWithAttributes(all, points, 3, extra, 5, [H * 1.5, H * 1.5, 1, 1, 1], null, target, 1);
            } else {
              [lighter] = MeshoptSimplifier.simplify(all, points, 3, target, 1);
            }
            lod = new THREE.BufferAttribute(lighter, 1);
            keep.lods.set(key, lod);
          }
          return lod;
        };
        if (index && state.detail < 100) index = lodFor(state.detail);
        // (AUTO: the three levels a person switches between by her distance, ready for the baking)
        keep.auto = index0 && state.auto ? AUTO.map((a) => lodFor(a.detail)) : undefined;
        const morphs = state.shapes === 'live' ? keep.morph0 : NO_MORPHS;
        if (g.index === index && g.morphAttributes === morphs) return;
        g.dispose(); // (so nothing of the old setting stays on the graphics chip: her shapes alone are a big texture)
        g.setIndex(index);
        g.morphAttributes = morphs;
      });
    }
  };

  /**
   * BAKED SHAPES (v0.29.4): "lock her shape down". Live, the graphics chip re-blends her 43 body shapes for
   * every point of her on every frame. Baked, her final shape is worked out ONCE, here, into a plain body of
   * her own (only the points her detail level still draws), and nothing is blended while she walks.
   */
  const bakeGeometry = (g: THREE.BufferGeometry, weights: [number, number][], live: [string, number][], index: THREE.BufferAttribute = g.index!) => {
    const keep = g.userData.devRoom as GeoKeep;
    const src = g.attributes;
    // Only the points this detail level uses, renumbered
    const remap = new Int32Array(src.position.count).fill(-1);
    const order: number[] = [];
    const tri = new Uint32Array(index.count);
    for (let i = 0; i < index.count; i++) {
      const v = index.getX(i);
      if (remap[v] < 0) { remap[v] = order.length; order.push(v); }
      tri[i] = remap[v];
    }
    const n = order.length;
    const out = new THREE.BufferGeometry();
    for (const [name, a] of Object.entries(src) as [string, THREE.BufferAttribute][]) {
      const size = a.itemSize;
      if (name === 'position' || name === 'normal') {
        // (as real numbers: her base shape plus each of her shapes at its weight)
        const morphs = keep.morph0[name] as THREE.BufferAttribute[] | undefined;
        const arr = new Float32Array(n * 3);
        for (let k = 0; k < n; k++) {
          const o = order[k];
          let x = a.getX(o), y = a.getY(o), z = a.getZ(o);
          if (morphs) {
            for (const [mi, w] of weights) {
              const m = morphs[mi];
              if (!m) continue;
              if (g.morphTargetsRelative) { x += m.getX(o) * w; y += m.getY(o) * w; z += m.getZ(o) * w; }
              else { x += (m.getX(o) - a.getX(o)) * w; y += (m.getY(o) - a.getY(o)) * w; z += (m.getZ(o) - a.getZ(o)) * w; }
            }
          }
          arr[k * 3] = x; arr[k * 3 + 1] = y; arr[k * 3 + 2] = z;
        }
        out.setAttribute(name, new THREE.BufferAttribute(arr, 3));
      } else {
        // (everything else is copied as it is: her texture coordinates, which bones move each point)
        const from = a.array as unknown as { [i: number]: number; constructor: new (len: number) => THREE.TypedArray };
        const arr = new from.constructor(n * size);
        for (let k = 0; k < n; k++) for (let c = 0; c < size; c++) arr[k * size + c] = from[order[k] * size + c];
        out.setAttribute(name, new THREE.BufferAttribute(arr, size, a.normalized));
      }
    }
    // HER MOTION SHAPES STAY LIVE (Joshua, 2026-11-14: "leave belly/breasts/breathing live, the rest baked"): the
    // four that move with her walk are carried over, for her own points only. Her breathing is her bones.
    for (const kind of ['position', 'normal'] as const) {
      const morphs = keep.morph0[kind] as THREE.BufferAttribute[] | undefined;
      const base = src[kind] as THREE.BufferAttribute | undefined;
      if (!morphs || !base || live.length === 0) continue;
      out.morphAttributes[kind] = live.map(([name, mi]) => {
        const m = morphs[mi];
        const arr = new Float32Array(n * 3);
        for (let k = 0; k < n; k++) {
          const o = order[k];
          const rel = g.morphTargetsRelative;
          arr[k * 3] = m.getX(o) - (rel ? 0 : base.getX(o));
          arr[k * 3 + 1] = m.getY(o) - (rel ? 0 : base.getY(o));
          arr[k * 3 + 2] = m.getZ(o) - (rel ? 0 : base.getZ(o));
        }
        const a = new THREE.BufferAttribute(arr, 3);
        a.name = name;
        return a;
      });
    }
    // ON A MUCH LIGHTER BODY, NEW SURFACE DIRECTIONS (v0.34). Each point remembers which way the fine skin
    // faced there, and lighting uses that. Once most points are gone, a point from under her jaw can end up
    // holding a triangle on her chin, and her chin is lit as if it faced the ground (dark, greenish blotches).
    // So the directions are worked out again from the triangles she has now: each triangle's own facing, added
    // up at its three points (points in the same place share one sum, so the skin picture's seams don't show).
    const P = out.attributes.position as THREE.BufferAttribute | undefined;
    if (state.detail < 25 && P && out.attributes.normal) {
      const sum = new Map<string, [number, number, number]>();
      const key = (i: number) => `${Math.round(P.getX(i) * 4096)},${Math.round(P.getY(i) * 4096)},${Math.round(P.getZ(i) * 4096)}`;
      const keys: string[] = [];
      for (let i = 0; i < n; i++) { keys.push(key(i)); if (!sum.has(keys[i])) sum.set(keys[i], [0, 0, 0]); }
      const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
      for (let t = 0; t < tri.length; t += 3) {
        a.fromBufferAttribute(P, tri[t]); b.fromBufferAttribute(P, tri[t + 1]); c.fromBufferAttribute(P, tri[t + 2]);
        b.sub(a); c.sub(a); b.cross(c); // (its length is twice the triangle's area: big triangles count for more)
        for (let k = 0; k < 3; k++) { const acc = sum.get(keys[tri[t + k]])!; acc[0] += b.x; acc[1] += b.y; acc[2] += b.z; }
      }
      let top = -Infinity, bottom = Infinity;
      for (let i = 0; i < n; i++) { const y = P.getY(i); if (y > top) top = y; if (y < bottom) bottom = y; }
      const faceY = bottom + (top - bottom) * 0.86; // (her neck; only her skin reaches both her feet and her crown)
      const N = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const acc = sum.get(keys[i])!;
        const len = Math.hypot(acc[0], acc[1], acc[2]) || 1;
        N[i * 3] = acc[0] / len; N[i * 3 + 1] = acc[1] / len; N[i * 3 + 2] = acc[2] / len;
        // (...but only where the remembered direction is badly off, more than about 45 degrees: everywhere else
        // the fine skin's own direction is kept, because it hides the big flat triangles far better)
        const old = out.attributes.normal as THREE.BufferAttribute;
        const ox = old.getX(i), oy = old.getY(i), oz = old.getZ(i);
        const ol = Math.hypot(ox, oy, oz) || 1;
        // (stricter on her face, about 20 degrees: a wrong tint shows there first)
        if ((ox * N[i * 3] + oy * N[i * 3 + 1] + oz * N[i * 3 + 2]) / ol > (P.getY(i) > faceY ? 0.94 : 0.7)) { N[i * 3] = ox / ol; N[i * 3 + 1] = oy / ol; N[i * 3 + 2] = oz / ol; }
      }
      out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    }
    out.morphTargetsRelative = true;
    out.setIndex(new THREE.BufferAttribute(tri, 1));
    out.userData.devRoomOwn = true;
    return out;
  };

  const makePerson = (def: ModelDef, src: Loaded, i: number): Person => {
    const r = rng(1000 + i * 7919);
    const root = new THREE.Group();
    const inner = new THREE.Group();
    // Which look she wears: Joshua's three in turn, or the plain standard body
    const look = def.builder && state.morphs ? LOOKS[i % LOOKS.length] : PLAIN;
    const tall = 1 + look.heightCm / STANDARD_CM;
    inner.scale.setScalar(src.scale * tall);
    inner.position.y = -src.minY * src.scale * tall;
    // Her shape, with the builder's own morphs and rules: her belly at her look's size, her bust with it
    const shape: Record<string, number> = { ...bellyWeights(look.bump / 100), breastGrow: bustWeight(look.bump) };
    const lods: { mesh: THREE.Mesh; geos: THREE.BufferGeometry[] }[] = [];
    for (const part of src.parts) {
      const copy = cloneSkinned(part); // (shares the geometry and textures; her skeleton is her own)
      copy.traverse((o) => {
        const mesh = o as THREE.SkinnedMesh;
        if (!mesh.isMesh) return;
        const body = def.builder && part === src.parts[0];
        const dict = mesh.morphTargetDictionary;
        if (state.shapes !== 'live') {
          mesh.morphTargetInfluences = undefined;
          mesh.morphTargetDictionary = undefined;
        }
        // (her underwear pieces are about half her points, and they are under her painted outfit)
        if (body && !state.underwear && (mesh.material as THREE.Material).name === 'bikini') {
          mesh.visible = false;
          return;
        }
        if (body && state.shapes === 'baked' && mesh.geometry.index) {
          const weights: [number, number][] = [];
          for (const [name, v] of Object.entries(shape)) if (dict && dict[name] !== undefined && v !== 0) weights.push([dict[name], v]);
          const live: [string, number][] = [];
          if (state.motion !== 'off' && dict) for (const name of MOTION_TARGETS) if (dict[name] !== undefined) live.push([name, dict[name]]);
          const source = mesh.geometry;
          const levels = (source.userData.devRoom as GeoKeep | undefined)?.auto;
          if (levels) {
            // (AUTO: her body baked once at each level; she starts at the lightest and switches by her distance)
            const geos = levels.map((ix) => bakeGeometry(source, weights, live, ix));
            lods.push({ mesh: mesh as THREE.Mesh, geos });
            mesh.geometry = geos[geos.length - 1];
          } else {
            mesh.geometry = bakeGeometry(source, weights, live);
          }
          if (live.length) mesh.updateMorphTargets(); // (only her motion shapes now, by name)
        }
        if (state.plain) {
          // (the cheapest material there is, one flat colour: is it her skin and outfit that cost?)
          mesh.material = new THREE.MeshLambertMaterial({ color: def.builder ? look.top : 0xc9a27e });
          mesh.material.userData.devRoomOwn = true;
        }
        if (body) {
          if (!state.plain) {
            mesh.material = Array.isArray(mesh.material)
              ? mesh.material.map((m) => paintedMaterial(m, src.box, look, state.detail >= 25))
              : paintedMaterial(mesh.material, src.box, look, state.detail >= 25);
          }
          if (state.shapes === 'live' && dict && mesh.morphTargetInfluences) {
            mesh.morphTargetInfluences.fill(0);
            for (const [name, v] of Object.entries(shape)) if (dict[name] !== undefined) mesh.morphTargetInfluences[dict[name]] = v;
          }
        }
      });
      inner.add(copy);
    }
    root.add(inner);
    scene.add(root);
    const ring = Math.floor(i / 6);
    const radius = 4 + ring * 3.2;
    const person: Person = { root, lods, level: AUTO.length - 1, angle: (i % 6) * (Math.PI / 3) + ring * 0.5, radius, speed: ((2.0 - ring * 0.15) / radius) * (ring % 2 ? -1 : 1), phase: r() * 6 };
    if (def.builder && state.motion !== 'off') {
      try {
        const body = inner.children[0];
        const rig = new HumanRig(body);
        // Her hair is its own file on its own copy of her skeleton: hang it on her body's bones, by name
        const byName = new Map<string, THREE.Bone>();
        body.traverse((o) => { if ((o as THREE.Bone).isBone) byName.set(o.name, o as THREE.Bone); });
        for (const extra of inner.children.slice(1)) {
          extra.traverse((o) => {
            const hair = o as THREE.SkinnedMesh;
            if (!hair.isSkinnedMesh) return;
            const old = hair.skeleton;
            hair.bind(new THREE.Skeleton(old.bones.map((b) => byName.get(b.name) ?? b), old.boneInverses), hair.bindMatrix);
            old.dispose();
          });
        }
        const measure = measureHuman(rig.bind);
        // How big her skeleton's units are in the room: two of her joints, measured both ways
        root.updateWorldMatrix(true, true);
        const bones = (body.getObjectByProperty('isSkinnedMesh', true as unknown as string) as THREE.SkinnedMesh).skeleton.bones;
        const a = measure.joints.head, b = measure.joints.ankleL;
        const inRoom = bones[a].getWorldPosition(new THREE.Vector3()).distanceTo(bones[b].getWorldPosition(new THREE.Vector3()));
        const inBind = Math.hypot(rig.bind[a].x - rig.bind[b].x, rig.bind[a].y - rig.bind[b].y, rig.bind[a].z - rig.bind[b].z);
        const soft: { influences: number[]; at: number[] }[] = [];
        body.traverse((o) => {
          const mesh = o as THREE.Mesh;
          const d = mesh.morphTargetDictionary;
          if (!mesh.isMesh || !mesh.visible || !d || !mesh.morphTargetInfluences) return;
          soft.push({ influences: mesh.morphTargetInfluences, at: MOTION_TARGETS.map((name) => d[name] ?? -1) });
        });
        person.live = {
          rig, measure, carry: look.bump / 100, perUnit: inBind / Math.max(1e-6, inRoom), walked: r() * 10, out: [], out2: [],
          belly: restingBellySpring(), breast: restingBellySpring(), bumpPercent: look.bump, soft, weights: [0, 0, 0, 0],
        };
      } catch (e) {
        state.error = `No moving skeleton: ${e instanceof Error ? e.message : String(e)}`;
      }
    }
    return person;
  };

  let building = 0;
  let onBuilt = () => {};
  const rebuild = async () => {
    const ticket = ++building;
    state.loading = `Loading ${state.model.label}…`;
    state.error = '';
    let src: Loaded;
    try {
      src = await load(state.model);
    } catch (e) {
      cache.delete(state.model.key);
      if (ticket === building) {
        state.loading = '';
        state.error = `Couldn't load ${state.model.label}: ${e instanceof Error ? e.message : String(e)}`;
      }
      return;
    }
    if (ticket !== building) return;
    for (const p of people.splice(0)) {
      p.root.traverse((o) => {
        const mesh = o as THREE.SkinnedMesh;
        if (!mesh.isMesh) return;
        // (only what this person owned: her painted materials and her skeleton; the mesh and textures are shared)
        for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) if (m.userData.devRoomOwn) m.dispose();
        if (mesh.geometry.userData.devRoomOwn) mesh.geometry.dispose();
        mesh.skeleton?.dispose();
      });
      for (const l of p.lods) for (const geo of l.geos) geo.dispose(); // (her other detail levels)
      p.live?.rig.dispose();
      p.root.removeFromParent();
    }
    state.loading = 'Preparing…';
    await applyModelSettings(src);
    if (ticket !== building) return;
    for (let i = 0; i < state.count; i++) people.push(makePerson(state.model, src, i));
    // How many triangles ONE of them is, as she is drawn now (her visible pieces and her hair)
    let tris = 0;
    people[0]?.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || !mesh.visible) return;
      const g = mesh.geometry;
      tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
    });
    state.perChar = Math.round(tris);
    state.info = src;
    state.loading = '';
    onBuilt();
  };

  // ---- The panel's buttons ----
  const modelBtns = MODELS.map((def) => button(modelRow, def.label, () => { state.model = def; sync(); void rebuild(); }));
  const countBtns = COUNTS.map((n) => button(countRow, String(n), () => { state.count = n; sync(); void rebuild(); }));
  const detailBtns = DETAILS.map((d) => button(detailRow, `${d}%`, () => { state.detail = d; state.auto = false; sync(); void rebuild(); }));
  const autoBtn = button(detailRow, 'Auto', () => { state.auto = !state.auto; if (state.auto) { state.detail = 10; state.shapes = 'baked'; } sync(); void rebuild(); });
  const morphBtn = button(optRow, '', () => { state.morphs = !state.morphs; sync(); void rebuild(); });
  const shadowBtn = button(optRow, '', () => { state.shadows = !state.shadows; sync(); });
  const shapeBtn = button(optRow, '', () => { state.shapes = state.shapes === 'live' ? 'baked' : state.shapes === 'baked' ? 'off' : 'live'; sync(); void rebuild(); });
  const motionBtn = button(optRow, '', () => { state.motion = state.motion === 'walk' ? 'idle' : state.motion === 'idle' ? 'off' : 'walk'; sync(); void rebuild(); });
  const smartBtn = button(optRow, '', () => { state.smart = !state.smart; sync(); void rebuild(); });
  const underBtn = button(optRow, '', () => { state.underwear = !state.underwear; sync(); void rebuild(); });
  const plainBtn = button(optRow, '', () => { state.plain = !state.plain; sync(); void rebuild(); });
  const sharpBtn = button(optRow, '', () => { state.sharp = !state.sharp; sync(); resize(); });
  const sync = () => {
    modelBtns.forEach((b, i) => b.classList.toggle('on', MODELS[i] === state.model));
    countBtns.forEach((b, i) => b.classList.toggle('on', COUNTS[i] === state.count));
    morphBtn.textContent = `Looks (Char1-3): ${state.morphs ? 'on' : 'off'}`;
    morphBtn.classList.toggle('on', state.morphs);
    shadowBtn.textContent = `Shadows: ${state.shadows ? 'on' : 'off'}`;
    shadowBtn.classList.toggle('on', state.shadows);
    sun.castShadow = state.shadows;
    detailBtns.forEach((b, i) => b.classList.toggle('on', !state.auto && DETAILS[i] === state.detail));
    autoBtn.classList.toggle('on', state.auto);
    shapeBtn.textContent = `Body shapes: ${state.shapes}`;
    shapeBtn.classList.toggle('on', state.shapes !== 'off');
    motionBtn.textContent = `Motion: ${state.motion}`;
    motionBtn.classList.toggle('on', state.motion !== 'off');
    smartBtn.textContent = `Smart detail: ${state.smart ? 'on' : 'off'}`;
    smartBtn.classList.toggle('on', state.smart);
    underBtn.textContent = `Hidden pieces: ${state.underwear ? 'drawn' : 'skipped'}`;
    underBtn.classList.toggle('on', state.underwear);
    plainBtn.textContent = `Materials: ${state.plain ? 'plain' : 'full'}`;
    plainBtn.classList.toggle('on', !state.plain);
    sharpBtn.textContent = `Sharpness: ${state.sharp ? '2x' : '1x'}`;
    sharpBtn.classList.toggle('on', state.sharp);
  };
  sync();
  void rebuild();

  // ---- The loop: they walk their circles; frames per second, averaged over a second ----
  let last = performance.now();
  let frames = 0;
  let acc = 0;
  let worst = 0;
  let fps = 0;
  let worstShown = 0;
  let t = 0;
  const tick = (now: number) => {
    requestAnimationFrame(tick);
    const ms = Math.max(0, now - last);
    last = now;
    const dt = Math.min(0.05, ms / 1000);
    t += dt;
    for (const p of people) {
      if (p.lods.length) {
        // AUTO detail: her level by her distance from the camera (a level is only left once she is 10% past
        // its edge, so someone walking along an edge doesn't flicker between two)
        const d = camera.position.distanceTo(p.root.position);
        let level = p.level;
        while (level > 0 && d < AUTO[level - 1].within * 0.95) level--;
        while (level < AUTO.length - 1 && d > AUTO[level].within * 1.05) level++;
        if (level !== p.level) {
          p.level = level;
          for (const l of p.lods) l.mesh.geometry = l.geos[level];
        }
      }
      const walking = state.motion !== 'idle';
      if (walking) p.angle += p.speed * dt;
      const x = Math.cos(p.angle) * p.radius;
      const z = Math.sin(p.angle) * p.radius;
      const m = p.live;
      if (m) {
        // The builder's own pose for this frame: standing and breathing, or a step of her walk with its weight
        if (walking) m.walked += Math.abs(p.speed) * p.radius * dt;
        const phase = ((m.walked * m.perUnit) / humanStride(m.measure, 'walk', m.carry)) % 1;
        let turns = poseHuman(m.measure, m.rig.bind, { stance: walking ? 'walk' : 'stand', phase, seconds: t + p.phase, lean: 0, carry: m.carry }, m.out);
        if (walking) turns = weighWalk(m.measure, turns, walkWeight(phase, 'walk'), m.out2);
        m.rig.apply(turns);
        // Her belly's and bust's weight: the walk's bounce and sway, felt by their springs (the builder's own rule)
        const stride = humanStride(m.measure, 'walk', m.carry);
        const strideSeconds = walking ? stride / Math.max(1e-6, Math.abs(p.speed) * p.radius * m.perUnit) : 0;
        const upA = walking ? walkBounceAccel(phase, strideSeconds) : 0;
        const leftA = walking ? walkSwayAccel(phase, strideSeconds) : 0;
        stepBellySpring(m.belly, dt, upA, leftA);
        stepBreastSpring(m.breast, dt, upA, leftA);
        motionWeights(m.bumpPercent, m.belly, m.breast, m.weights);
        for (const sm of m.soft) for (let k = 0; k < 4; k++) if (sm.at[k] >= 0) sm.influences[sm.at[k]] = m.weights[k];
      }
      p.root.position.set(x, m ? 0 : Math.abs(Math.sin(t * 5 + p.phase)) * 0.05, z);
      p.root.rotation.y = -p.angle + (p.speed > 0 ? 0 : Math.PI); // (facing the way she goes)
    }
    camera.position.set(Math.sin(view.yaw) * Math.cos(view.pitch) * view.dist, Math.sin(view.pitch) * view.dist + 1.2, Math.cos(view.yaw) * Math.cos(view.pitch) * view.dist);
    camera.lookAt(0, 1.2, 0);
    renderer.info.reset();
    renderer.render(scene, camera);
    if (document.hidden || ms > 3000) return; // (back from the background: not a frame time)
    frames++;
    acc += ms;
    worst = Math.max(worst, ms);
    if (acc >= 1000) {
      fps = (frames * 1000) / acc;
      worstShown = worst;
      frames = 0;
      acc = 0;
      worst = 0;
      paint();
    }
  };
  const paint = () => {
    {
      const info = state.info;
      const r = renderer.info.render;
      stat.innerHTML = '';
      const big = document.createElement('div');
      big.className = 'dr-fps';
      big.textContent = `${fps.toFixed(0)} FPS`;
      big.style.color = fps >= 50 ? '#7dffa0' : fps >= 30 ? '#ffd166' : '#ff7b7b';
      stat.appendChild(big);
      const lines = [
        `slowest frame ${worstShown.toFixed(0)} ms`,
        `${people.length} x ${state.model.label}`,
        `${(r.triangles / 1e6).toFixed(2)}M triangles drawn · ${r.calls} draw calls`,
        state.auto && people.some((q) => q.lods.length)
          ? `auto detail: ${AUTO.map((a, k) => `${people.filter((q) => q.level === k).length} at ${a.detail}%`).join(' · ')}`
          : state.perChar ? `each character: ${(state.perChar / 1000).toFixed(1)}k triangles as drawn` : '',
        info ? `the file: ${(info.tris / 1000).toFixed(0)}k triangles · ${info.mb.toFixed(1)} MB · loaded in ${(info.ms / 1000).toFixed(1)} s` : '',
        `screen ${renderer.domElement.width} x ${renderer.domElement.height}`,
        state.loading,
        state.error,
      ].filter(Boolean);
      stat.appendChild(document.createTextNode(lines.join('\n')));
    }
  };
  onBuilt = paint;
  requestAnimationFrame(tick);
  renderer.info.autoReset = false;

  // (for the headless tests)
  (window as unknown as { devRoom: unknown }).devRoom = { state, people, renderer, looks: LOOKS, get fps() { return fps; } };
}
