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
import { ClothTest, SARAH_TEE } from './devRoomCloth';
import { VERSION } from './core/updater';
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
const DETAILS = [100, 50, 25, 10, 5, 3, 2, 1]; // (3% of the builder body is about 9k triangles: the "under 10k" gameplay target)
const NO_MORPHS = {};
/**
 * AUTO DETAIL (v0.35; Joshua: "closer to the camera the higher %, and further away less"). The distance is
 * from the CAMERA to each person (to her middle, in 3D), so zooming in raises her detail in the top-down
 * view exactly as walking up to her does in the 👁️ view. The table is Joshua's, in metres; the game's units
 * are smaller: people are 2.8 units tall (a 1.68 m woman), so one metre is 1 / 0.6 units.
 */
const METRE = 1 / 0.6;
const AUTO = [
  // (v0.36: capped at 30%. Joshua's first table went to 100% within 3 m and 50% within 6 m: thirty times the
  // triangles of the far level, for a difference a phone screen doesn't show. He approved this one on 2026-11-14.)
  { within: 4 * METRE, detail: 30 },   // 0-4 m
  { within: 8 * METRE, detail: 20 },   // 4-8 m
  { within: 12 * METRE, detail: 10 },  // 8-12 m
  { within: 15 * METRE, detail: 5 },   // 12-15 m
  { within: Infinity, detail: 3 },     // 15 m and beyond
];
/**
 * AUTO LITE (v0.39; Joshua, after 40 people at 3% held 25-30 FPS on his phone with every shape live:
 * "0-3m = 3% + Live On / 4-8m = 2% + Live Off / >=9m = 1% + Live Off"). Everyone is light; only the few people
 * right by the camera have all 43 of their body shapes blended live, and the rest are baked as in AUTO.
 */
const AUTO_LITE: { within: number; detail: number; live?: boolean }[] = [
  { within: 4 * METRE, detail: 3, live: true }, // 0-3 m (up to 4)
  { within: 7 * METRE, detail: 2 },             // 4-6 m (up to 7; v0.42, Joshua: "4-6m = 2% / +7m = 1%")
  { within: Infinity, detail: 1 },              // 7 m and beyond
];
/** The table in use: AUTO or AUTO_LITE (the 'Auto lite' button). */
// (v0.42.1: the room opens on AUTO LITE. Joshua, 2026-11-14, on his phone with 40 walking: "These settings work best")
let TABLE: { within: number; detail: number; live?: boolean }[] = AUTO_LITE;
/** A person this far down the table (5% or lighter) lets go of her heaviest bodies again, to save memory. */
const AUTO_DROP_FROM = 3;
/** Cloth tees: how many are dressed at a time on their way to being frozen, and the most simulated for good. GAME TUNING. */
const CLOTH_DRESSING_AT_ONCE = 2, CLOTH_SIMULATED_AT_MOST = 6;
/** 'Cloth tee: near the camera': within this of the camera a tee is simulated (Auto lite's own live range: up to 4 m). */
const CLOTH_NEAR = 4 * METRE;
interface GeoKeep { index0: THREE.BufferAttribute | null; morph0: THREE.BufferGeometry['morphAttributes']; lods: Map<string, THREE.BufferAttribute>; auto?: THREE.BufferAttribute[]; flat?: Float32Array | null; liveGeo?: THREE.BufferGeometry }

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
  navel?: number;      // the builder's NAVEL control, her body's own: -100 (deepest innie) to +100 (fullest outie)
  bustDetail?: number; // how much of her bust's fine detail shows through her tee, 0 (none) to 1 (all, as her skin has it)
  legLength?: number;  // leggings' length down her leg (the builder's legEnd): 0.25 = shorts, 0.78 = capris, 1 = to the ankle
  bust?: number;       // the builder's breast SIZE control, -100 (half the volume) to +100 (twice); 0 = as her belly gives
  heightCm: number;    // from the standard body (about 168 cm)
  top: number;         // tee colour
  legs: number;        // leggings colour
  capri: boolean;      // leggings end mid-calf (leggingsCapri) or at the ankle
  longSleeves: boolean; // teeLong or teeShort
}
const LOOKS: Look[] = [
  { name: 'Char1', bump: 23, heightCm: 3.5, top: 0x4e642e, legs: 0x37383e, capri: false, longSleeves: false, navel: 47, bustDetail: 0.45 },  // jersey: olive tee, charcoal leggings
  { name: 'Char2', bump: 21, heightCm: -7, top: 0x9c9ca3, legs: 0x1631bc, capri: false, longSleeves: false, navel: 47, bustDetail: 0.45 },   // ribbed: grey tee, blue leggings
  { name: 'Char3', bump: 5, heightCm: -6.5, top: 0xeec415, legs: 0x0b7e3a, capri: true, longSleeves: true, navel: 47, bustDetail: 0.45, legLength: 0.78 },    // sweater: yellow long tee, green capris (navel 47 and detail 0.45 are this look's own, used for all three)
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
/**
 * ...and its SIZE control on top (its bustVolume / breastGrowUnits): +100 is twice the volume of her own
 * 0% bust, -100 is half, whatever her belly. Up to 1.55x is the 'breastGrow' shape; the rest of the way to
 * 2.0x is 'shape:breastGrowMore'. Under 1x, 'breastGrow' runs backwards.
 */
function bustWeights(bumpPercent: number, sizePercent = 0): Record<string, number> {
  const p = Math.min(200, Math.max(0, bumpPercent));
  const base = p <= 100 ? 1 + (0.3 * p) / 100 : 1.3 + (0.25 * (p - 100)) / 100;
  const size = Math.min(100, Math.max(-100, sizePercent));
  const volume = base + ((size >= 0 ? 2.0 : 0.5) - base) * (Math.abs(size) / 100);
  const units = (Math.cbrt(volume) - 1) / (Math.cbrt(1.55) - 1);
  return { breastGrow: Math.min(1, units), 'shape:breastGrowMore': Math.max(0, units - 1) };
}

const hooks: { tweak: ((look: Look, i: number) => Look) | null } = { tweak: null };

/** The bust's size against her own 0% bust, as a length (the cube root of its volume): the builder's bustScale. */
function bustLinear(bumpPercent: number, sizePercent = 0) {
  const p = Math.min(200, Math.max(0, bumpPercent));
  const base = p <= 100 ? 1 + (0.3 * p) / 100 : 1.3 + (0.25 * (p - 100)) / 100;
  const size = Math.min(100, Math.max(-100, sizePercent));
  return Math.cbrt(base + ((size >= 0 ? 2.0 : 0.5) - base) * (Math.abs(size) / 100));
}

/**
 * The builder's NAVEL control (its navelFlatFor): the weight of her 'navelFlat' shape. Her outie is modelled
 * into the file; 'navelFlat' settles it into an ordinary navel (fully on up to a 75% belly, eased off by 100%).
 * The control slides her from there: -100 the deepest innie, +100 the fullest outie.
 */
function navelFlatFor(bumpPercent: number, navelPercent: number) {
  const p = Math.min(200, Math.max(0, bumpPercent));
  const t = Math.min(1, Math.max(0, (p - 75) / 25));
  const auto = t * t * (3 - 2 * t); // how far out her pregnancy alone puts it
  const n = Math.min(100, Math.max(-100, navelPercent)) / 100;
  const outie = n < 0 ? auto + n * (auto + 0.6) : auto + n * (1 + 0.3 - auto);
  return 1 - outie;
}

/**
 * HER BUST UNDER A TEE (v0.38). Her clothes here are paint on her skin, so every bit of her skin's relief shows
 * through them. The builder has a BREAST DETAIL setting for how much a fabric lets through; this is the DEV
 * Room's stand-in for it: worked out once per model, how far each point at the tip of each breast would move
 * (and its surface direction turn) if that small raised patch were laid level with the curve round it, as
 * cloth lying across it would. A character takes (1 - her detail) of it in her painted material.
 *
 * The tip is found without any markings on the model: among the points her 'breastGrow' shape moves, the one
 * furthest forward on each side, then (three times) the one standing furthest out along the way the surface
 * round it faces. Measured on Sarah v2: the raised patch is about 2.5 cm across the surface from its tip and
 * stands 6 mm proud of the curve of the breast.
 *
 * The curve it is laid level with is the breast's own: a curved sheet (heights as a quadratic of position)
 * fitted to the ring of skin just outside the patch. So she keeps her shape; only the patch goes.
 */
function bustSmoothing(g: THREE.BufferGeometry, keep: GeoKeep, dict: Record<string, number>, box: THREE.Box3): Float32Array | null {
  const pos = g.attributes.position as THREE.BufferAttribute, nor = g.attributes.normal as THREE.BufferAttribute | undefined;
  const grow = (keep.morph0.position as THREE.BufferAttribute[] | undefined)?.[dict.breastGrow];
  const index = keep.index0;
  if (!nor || !grow || !index) return null;
  const n = pos.count;
  const H = box.max.y - box.min.y, cx = (box.min.x + box.max.x) / 2;
  const R = 0.017 * H, FULL = 0.0135 * H, RING = 0.025 * H; // the patch; where it is wholly levelled; the ring fitted to
  const P = new Float32Array(n * 3);
  for (let v = 0; v < n; v++) { P[v * 3] = pos.getX(v); P[v * 3 + 1] = pos.getY(v); P[v * 3 + 2] = pos.getZ(v); }
  let most = 0;
  for (let v = 0; v < n; v++) most = Math.max(most, Math.hypot(grow.getX(v), grow.getY(v), grow.getZ(v)));
  const S = P.slice();                      // her points with the two patches levelled
  const amount = new Float32Array(n);       // how much of the levelling each point took, 0 to 1
  const face = new THREE.Vector3(), u = new THREE.Vector3(), w = new THREE.Vector3(), T = new THREE.Vector3(), d = new THREE.Vector3();
  for (const side of [0, 1]) {
    let tip = -1;
    for (let v = 0; v < n; v++) {
      if ((P[v * 3] > cx ? 0 : 1) !== side || Math.hypot(grow.getX(v), grow.getY(v), grow.getZ(v)) < most * 0.3) continue;
      if (tip < 0 || P[v * 3 + 2] > P[tip * 3 + 2]) tip = v;
    }
    if (tip < 0) return null;
    let near: number[] = [];
    for (let pass = 0; pass < 3; pass++) {
      T.set(P[tip * 3], P[tip * 3 + 1], P[tip * 3 + 2]);
      near = [];
      face.set(0, 0, 0);
      for (let v = 0; v < n; v++) {
        if (Math.hypot(P[v * 3] - T.x, P[v * 3 + 1] - T.y, P[v * 3 + 2] - T.z) > 0.03 * H) continue;
        near.push(v);
        face.add(d.set(nor.getX(v), nor.getY(v), nor.getZ(v)).normalize());
      }
      face.normalize();
      let best = -Infinity;
      for (const v of near) { const out = P[v * 3] * face.x + P[v * 3 + 1] * face.y + P[v * 3 + 2] * face.z; if (out > best) { best = out; tip = v; } }
    }
    T.set(P[tip * 3], P[tip * 3 + 1], P[tip * 3 + 2]);
    u.set(0, 1, 0).cross(face).normalize();
    w.copy(face).cross(u);
    // Each nearby point as (across, up, height) from the tip; the sheet fitted to the ring by least squares
    const A = Array.from({ length: 6 }, () => new Float64Array(7));
    const local = near.map((v) => { d.set(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]).sub(T); return [d.dot(u), d.dot(w), d.dot(face)]; });
    local.forEach(([x, y, h]) => {
      const r = Math.hypot(x, y);
      if (r < R || r > RING) return;
      const row = [1, x / H, y / H, (x * x) / (H * H), (x * y) / (H * H), (y * y) / (H * H)];
      for (let i = 0; i < 6; i++) { for (let j = 0; j < 6; j++) A[i][j] += row[i] * row[j]; A[i][6] += row[i] * (h / H); }
    });
    for (let i = 0; i < 6; i++) {
      let piv = i;
      for (let k = i + 1; k < 6; k++) if (Math.abs(A[k][i]) > Math.abs(A[piv][i])) piv = k;
      [A[i], A[piv]] = [A[piv], A[i]];
      if (Math.abs(A[i][i]) < 1e-12) return null;
      for (let k = 0; k < 6; k++) {
        if (k === i) continue;
        const f = A[k][i] / A[i][i];
        for (let j = i; j < 7; j++) A[k][j] -= f * A[i][j];
      }
    }
    const c = A.map((row, i) => row[6] / row[i]);
    near.forEach((v, k) => {
      const [x, y, h] = local[k];
      const r = Math.hypot(x, y);
      if (r >= R) return;
      const t = Math.min(1, (R - r) / (R - FULL));
      const a = t * t * (3 - 2 * t);
      const sheet = (c[0] + (c[1] * x) / H + (c[2] * y) / H + (c[3] * x * x) / (H * H) + (c[4] * x * y) / (H * H) + (c[5] * y * y) / (H * H)) * H;
      const lift = (sheet - h) * a;
      amount[v] = a;
      S[v * 3] += face.x * lift; S[v * 3 + 1] += face.y * lift; S[v * 3 + 2] += face.z * lift;
    });
  }
  // The levelled patches' own surface directions, from their triangles (points in the same place share one)
  const place = new Map<string, THREE.Vector3>();
  const key = (v: number) => `${Math.round(P[v * 3] * 1e5)},${Math.round(P[v * 3 + 1] * 1e5)},${Math.round(P[v * 3 + 2] * 1e5)}`;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const ix = index.array;
  for (let t = 0; t < ix.length; t += 3) {
    const i0 = ix[t], i1 = ix[t + 1], i2 = ix[t + 2];
    if (!amount[i0] && !amount[i1] && !amount[i2]) continue;
    a.set(S[i0 * 3], S[i0 * 3 + 1], S[i0 * 3 + 2]); b.set(S[i1 * 3], S[i1 * 3 + 1], S[i1 * 3 + 2]); c.set(S[i2 * 3], S[i2 * 3 + 1], S[i2 * 3 + 2]);
    b.sub(a); c.sub(a); b.cross(c);
    for (const v of [i0, i1, i2]) {
      if (!amount[v]) continue;
      const k = key(v);
      let acc = place.get(k);
      if (!acc) place.set(k, (acc = new THREE.Vector3()));
      acc.add(b);
    }
  }
  // What each patch point moves by, and its direction turns by: [dx, dy, dz, dnx, dny, dnz] per point
  const flat = new Float32Array(n * 6);
  for (let v = 0; v < n; v++) {
    if (!amount[v]) continue;
    flat[v * 6] = S[v * 3] - P[v * 3]; flat[v * 6 + 1] = S[v * 3 + 1] - P[v * 3 + 1]; flat[v * 6 + 2] = S[v * 3 + 2] - P[v * 3 + 2];
    const dir = place.get(key(v));
    if (!dir || dir.lengthSq() === 0) continue;
    const len = dir.length(), ol = Math.hypot(nor.getX(v), nor.getY(v), nor.getZ(v)) || 1;
    const turn = Math.min(1, amount[v] * 4); // (eased in at the rim, where her own smooth directions are the better ones)
    flat[v * 6 + 3] = (dir.x / len - nor.getX(v) / ol) * turn * ol; flat[v * 6 + 4] = (dir.y / len - nor.getY(v) / ol) * turn * ol; flat[v * 6 + 5] = (dir.z / len - nor.getZ(v) / ol) * turn * ol;
  }
  return flat;
}

/**
 * A RANDOM LOOK (v0.37; Joshua, 2026-11-14: "randomize the belly size from 0-50%, the breast size (-100 to +100),
 * and the shirt and leggings colors"). The same person number gets the same look every time; SHUFFLE deals
 * everyone a new one. Her height, sleeves and leggings' length vary too.
 */
function randomLook(i: number, seed: number): Look {
  const r = rng(90001 + i * 7919 + seed * 104729);
  // (a pale orange or peach tee reads as bare skin from any distance: in that part of the colour wheel only
  // strong, darker colours are dealt, a real red or a burnt orange)
  const color = (h: number, sat: number, light: number) => {
    const skinLike = h < 0.15 || h > 0.94;
    return new THREE.Color().setHSL(h, skinLike ? Math.max(sat, 0.72) : sat, skinLike ? Math.min(light, 0.46) : light).getHex();
  };
  // Tees: any colour, from soft to bright. Leggings: half of them dark neutrals, the rest a deeper colour
  const top = color(r(), 0.35 + r() * 0.45, 0.42 + r() * 0.3);
  const legs = r() < 0.5 ? color(r(), 0.05 + r() * 0.12, 0.14 + r() * 0.2) : color(r(), 0.45 + r() * 0.4, 0.22 + r() * 0.2);
  return {
    name: `Random ${i + 1}`,
    bump: Math.round(r() * 50),
    bust: Math.round(-100 + r() * 200),
    heightCm: Math.round((-9 + r() * 18) * 2) / 2,
    top, legs,
    capri: false,
    // (v0.38; Joshua: "leggings leg length from 0.25 (shorts) to 1.00, breast details through clothing between
    // 0-30%, navel 35-45%: not through clothing but actual depth")
    legLength: Math.round((0.25 + r() * 0.75) * 100) / 100,
    bustDetail: Math.round(r() * 30) / 100,
    navel: Math.round(35 + r() * 10),
    longSleeves: r() < 0.4,
  };
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
    uLegEnd: { value: look.legLength !== undefined ? 0.57 - Math.min(1, Math.max(0.1, look.legLength)) * 0.53 : look.capri ? 0.17 : 0.04 },      // where the leggings end (height up her body)
    uSleeveEnd: { value: look.longSleeves ? 0.56 : 0.71 }, // where the sleeves end
    uY0: { value: box.min.y },
    uH: { value: box.max.y - box.min.y },
    // (how much of the levelling of her bust's tips she takes under her tee: all of it at 0 detail; the patch
    // grows with her bust. Done here, on the graphics chip, as the builder does it, so it holds for a live body
    // as for a baked one: v0.39.1, Joshua: "I play it live in the CCBS room with no issues")
    uSoften: { value: (1 - Math.min(1, Math.max(0, look.bustDetail ?? 1))) * bustLinear(look.bump, look.bust ?? 0) },
  };
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vRest;\nuniform float uY0;\nuniform float uH;\nuniform float uSoften;\nattribute vec3 softPos;\nattribute vec3 softNrm;')
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nobjectNormal += softNrm * uSoften;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += softPos * uSoften;\nvRest = vec2(abs(position.x) / uH, (position.y - uY0) / uH);');
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

/** One of a person's meshes under AUTO detail: its baked body per level (made when first needed), its two materials. */
interface MorphSet { dict: Record<string, number>; influences: number[] }
interface PersonLod {
  mesh: THREE.Mesh; geos: (THREE.BufferGeometry | null)[]; make: (level: number) => THREE.BufferGeometry; fine?: THREE.Material | THREE.Material[]; plain?: THREE.Material | THREE.Material[];
  /** AUTO LITE: her shape weights for a baked level (her four motion shapes) and for a live one (all 43), and her motion springs' handle on them. */
  bakedSet?: MorphSet; liveSet?: MorphSet; soft?: { influences: number[]; at: number[] };
}

interface Person {
  root: THREE.Group;
  angle: number;   // where she is on her circle
  radius: number;
  speed: number;   // radians per second (its sign is her direction)
  phase: number;
  /** AUTO detail: her baked body at each level, and the level she is drawn at now. */
  lods: PersonLod[];
  /** The builder's cloth tee on her (the 'Cloth tee' option), and how to put it on her when her turn comes. */
  cloth?: ClothTest;
  clothMake?: (freeze: boolean) => ClothTest;
  /** How far she is from the camera (to her middle), as of this frame. */
  dist?: number;
  /** Her tee is being simulated because she is near the camera ('Cloth tee: near the camera'). */
  clothNear?: boolean;
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
    .dr-row { display:flex; flex-wrap:wrap; gap:4px; pointer-events:auto; }
    .dr-b { font:600 12px system-ui,sans-serif; color:#fff; background:rgba(28,35,42,.82); border:0; border-radius:8px; padding:5px 8px; min-width:32px; min-height:30px; }
    .dr-b.on { background:#2f7fd0; }
    .dr-stat { font:600 11px/1.3 ui-monospace,Menlo,monospace; background:rgba(28,35,42,.82); border-radius:8px; padding:5px 8px; white-space:pre-wrap; max-width:100%; box-sizing:border-box; pointer-events:none; }
    .dr-fps { font-size:18px; }
    .dr-shut .dr-set { display:none; }
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
  title.textContent = `🧪 DEV Room · v${VERSION}`; // (the build it is: so a phone shows whether it has the latest)
  top.appendChild(title);
  // (v0.43; Joshua: "fix the UI and compress it so it is easier to see": smaller buttons, and one that folds the
  // settings away so only the readout is over the picture)
  const foldBtn = button(top, '▲ Hide settings', () => {
    const shut = panel.classList.toggle('dr-shut');
    foldBtn.textContent = shut ? '▼ Settings' : '▲ Hide settings';
  });
  const modelRow = row();
  const countRow = row();
  const detailRow = row();
  const detailLabel = document.createElement('div');
  detailLabel.className = 'dr-stat';
  detailLabel.textContent = 'Detail';
  detailRow.appendChild(detailLabel);
  const optRow = row();
  for (const r of [modelRow, countRow, detailRow, optRow]) r.classList.add('dr-set');
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
  // (the defaults are the settings Joshua settled on, 2026-11-14: 40 walking, auto detail, baked, smart, pieces skipped)
  const state = { model: MODELS[0], count: 40, looks: 'random' as 'random' | 'saved' | 'off', seed: 0, shadows: true, detail: 3, shapes: 'baked' as 'live' | 'baked' | 'off', underwear: false, auto: true, smart: true, cull: true, cloth: 'off' as 'off' | 'live' | 'freeze' | 'near', perChar: 0, motion: 'walk' as 'walk' | 'idle' | 'off', plain: false, sharp: true, loading: '', error: '', info: null as Loaded | null };
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
        // (her skin only, once: what smoothing the tips of her bust under a tee would move: bustSmoothing)
        if (keep.flat === undefined) {
          const isSkin = src.box.max.y > src.box.min.y && (mesh.material as THREE.Material).name === 'Material_0';
          keep.flat = isSkin ? bustSmoothing(g, keep, (mesh as THREE.Mesh).morphTargetDictionary ?? {}, src.box) : null;
          // (as two extra values on each of her points, which her painted material adds in by her own amount)
          const softPos = new Float32Array(g.attributes.position.count * 3), softNrm = new Float32Array(g.attributes.position.count * 3);
          if (keep.flat) for (let v = 0; v < g.attributes.position.count; v++) for (let c = 0; c < 3; c++) { softPos[v * 3 + c] = keep.flat[v * 6 + c]; softNrm[v * 3 + c] = keep.flat[v * 6 + 3 + c]; }
          g.setAttribute('softPos', new THREE.BufferAttribute(softPos, 3));
          g.setAttribute('softNrm', new THREE.BufferAttribute(softNrm, 3));
        }
        let index = keep.index0;
        const index0 = keep.index0;
        const lodFor = (detail: number) => {
          const index = index0!;
          if (detail >= 100) return index; // (as the file has her)
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
        keep.auto = index0 && state.auto ? TABLE.map((a) => lodFor(a.detail)) : undefined;
        // (AUTO LITE's live body is one for everybody near the camera; a new one for each change of settings)
        keep.liveGeo?.dispose();
        keep.liveGeo = undefined;
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
  const bakeGeometry = (g: THREE.BufferGeometry, weights: [number, number][], live: [string, number][], index: THREE.BufferAttribute = g.index!, detail = state.detail) => {
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
    if (detail < 25 && P && out.attributes.normal) {
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
    const picked = !def.builder || state.looks === 'off' ? PLAIN : state.looks === 'random' ? randomLook(i, state.seed) : LOOKS[i % LOOKS.length];
    // (a test's own changes to a look, for side-by-side comparisons: window.devRoom.tweak = (look, i) => ({ ...look, navel: -100 }))
    const tweaked = def.builder && hooks.tweak ? hooks.tweak(picked, i) : picked;
    // (the cloth tee's wearer has its colour painted on her skin beneath it, so a point of skin showing between the
    // cloth's own points is the tee's colour too)
    // (v0.41: everybody, as a clothing option. The first keeps Sarah's own red; the rest wear it in their own colour)
    const wearsCloth = def.builder && state.cloth !== 'off';
    const look = wearsCloth ? { ...tweaked, top: i === 0 ? new THREE.Color(SARAH_TEE.colour).getHex() : tweaked.top, longSleeves: false } : tweaked;
    const tall = 1 + look.heightCm / STANDARD_CM;
    inner.scale.setScalar(src.scale * tall);
    inner.position.y = -src.minY * src.scale * tall;
    // Her shape, with the builder's own morphs and rules: her belly at her look's size, her bust with it
    const shape: Record<string, number> = { ...bellyWeights(look.bump / 100), ...bustWeights(look.bump, look.bust ?? 0), navelFlat: navelFlatFor(look.bump, look.navel ?? 0) };
    const lods: PersonLod[] = [];
    let skin: { mesh: THREE.SkinnedMesh; dict: Record<string, number> } | undefined;
    for (const part of src.parts) {
      const copy = cloneSkinned(part); // (shares the geometry and textures; her skeleton is her own)
      copy.traverse((o) => {
        const mesh = o as THREE.SkinnedMesh;
        if (!mesh.isMesh) return;
        const body = def.builder && part === src.parts[0];
        let auto: PersonLod | undefined; // (this mesh's entry under AUTO detail, if it has one)
        const dict = mesh.morphTargetDictionary;
        if (body && dict && mesh.isSkinnedMesh && mesh.geometry.getAttribute('_cloth_cover')) skin = { mesh, dict };
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
            // (...each one baked the first time she needs it, not all seven up front: her full-detail body is
            // several megabytes, and most people never come that close)
            const geos: (THREE.BufferGeometry | null)[] = levels.map(() => null);
            const keep = source.userData.devRoom as GeoKeep;
            // (a LIVE level: the model's own points and all its shapes, with that level's lighter triangle list.
            // One body shared by everyone that close, since its shapes are one big picture on the graphics chip;
            // each person's own sizes are her mesh's weights)
            const liveBody = (k: number) => {
              if (!keep.liveGeo) {
                const lg = new THREE.BufferGeometry();
                for (const [name, a] of Object.entries(source.attributes)) lg.setAttribute(name, a);
                lg.setIndex(levels[k]);
                lg.morphAttributes = keep.morph0;
                lg.morphTargetsRelative = source.morphTargetsRelative;
                lg.boundingBox = source.boundingBox; lg.boundingSphere = source.boundingSphere;
                lg.userData.devRoomShared = true;
                keep.liveGeo = lg;
              }
              return keep.liveGeo;
            };
            const make = (k: number) => (TABLE[k].live && dict ? liveBody(k) : bakeGeometry(source, weights, live, levels[k], TABLE[k].detail));
            auto = { mesh: mesh as THREE.Mesh, geos, make };
            if (dict && TABLE.some((a) => a.live)) {
              const influences = new Array<number>(Object.keys(dict).length).fill(0);
              for (const [name, v] of Object.entries(shape)) if (dict[name] !== undefined) influences[dict[name]] = v;
              auto.liveSet = { dict, influences };
            }
            lods.push(auto);
            mesh.geometry = geos[geos.length - 1] = make(geos.length - 1);
          } else {
            mesh.geometry = bakeGeometry(source, weights, live);
          }
          if (live.length) mesh.updateMorphTargets(); // (only her motion shapes now, by name)
          if (auto && mesh.morphTargetDictionary && mesh.morphTargetInfluences) auto.bakedSet = { dict: mesh.morphTargetDictionary, influences: mesh.morphTargetInfluences };
        }
        if (state.plain) {
          // (the cheapest material there is, one flat colour: is it her skin and outfit that cost?)
          mesh.material = new THREE.MeshLambertMaterial({ color: def.builder ? look.top : 0xc9a27e });
          mesh.material.userData.devRoomOwn = true;
        }
        if (body) {
          if (!state.plain) {
            const base = mesh.material;
            mesh.material = Array.isArray(mesh.material)
              ? mesh.material.map((m) => paintedMaterial(m, src.box, look, state.detail >= 25 && !auto))
              : paintedMaterial(mesh.material, src.box, look, state.detail >= 25 && !auto);
            if (auto) {
              // (AUTO: a second material with her fine bump picture, for the levels heavy enough to carry it)
              auto.plain = mesh.material;
              auto.fine = Array.isArray(base) ? base.map((m) => paintedMaterial(m, src.box, look, true)) : paintedMaterial(base, src.box, look, true);
            }
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
    const person: Person = { root, lods, level: TABLE.length - 1, angle: (i % 6) * (Math.PI / 3) + ring * 0.5, radius, speed: ((2.0 - ring * 0.15) / radius) * (ring % 2 ? -1 : 1), phase: r() * 6 };
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
          const entry = { influences: mesh.morphTargetInfluences, at: MOTION_TARGETS.map((name) => d[name] ?? -1) };
          soft.push(entry);
          const lod = lods.find((l) => l.mesh === mesh);
          if (lod) lod.soft = entry; // (so a change of level can point her springs at that level's weights)
        });
        person.live = {
          rig, measure, carry: look.bump / 100, perUnit: inBind / Math.max(1e-6, inRoom), walked: r() * 10, out: [], out2: [],
          belly: restingBellySpring(), breast: restingBellySpring(), bumpPercent: look.bump, soft, weights: [0, 0, 0, 0],
        };
      } catch (e) {
        state.error = `No moving skeleton: ${e instanceof Error ? e.message : String(e)}`;
      }
    }
    const worn = skin as { mesh: THREE.SkinnedMesh; dict: Record<string, number> } | undefined;
    if (wearsCloth && worn) {
      // (put on her when her turn comes: see the tick's queue)
      person.clothMake = (freeze: boolean) => {
        let keep: GeoKeep | undefined;
        src.parts[0].traverse((o) => { const g = (o as THREE.Mesh).geometry; if (!keep && g?.getAttribute?.('_cloth_cover')) keep = g.userData.devRoom as GeoKeep; });
        if (!keep?.index0) throw new Error('her body has no triangle list');
        root.updateMatrixWorld(true);
        return new ClothTest({ part: src.parts[0], display: worn.mesh, inner, tall, index: keep.index0, morphs: keep.morph0, dict: worn.dict, shape, motion: MOTION_TARGETS, scene, freeze, colour: look.top });
      };
    }
    return person;
  };

  const frustum = new THREE.Frustum(), cullMatrix = new THREE.Matrix4(), cullBall = new THREE.Sphere(new THREE.Vector3(), 2.4), cullAt = new THREE.Vector3();
  let inView = 0;
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
      for (const l of p.lods) {
        for (const geo of l.geos) if (!geo?.userData.devRoomShared) geo?.dispose(); // (her other detail levels; the shared live body isn't hers)
        for (const set of [l.fine, l.plain]) for (const m of set ? (Array.isArray(set) ? set : [set]) : []) m.dispose();
      }
      p.cloth?.dispose();
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
  const setAuto = (table: typeof TABLE) => {
    const on = !(state.auto && TABLE === table);
    state.auto = on;
    TABLE = on ? table : AUTO;
    if (on) { state.detail = table === AUTO ? 10 : 3; state.shapes = 'baked'; }
    sync(); void rebuild();
  };
  const autoBtn = button(detailRow, 'Auto', () => setAuto(AUTO));
  const liteBtn = button(detailRow, 'Auto lite', () => setAuto(AUTO_LITE));
  const morphBtn = button(optRow, '', () => { state.looks = state.looks === 'random' ? 'saved' : state.looks === 'saved' ? 'off' : 'random'; sync(); void rebuild(); });
  const shuffleBtn = button(optRow, '🎲 Shuffle', () => { state.seed++; state.looks = 'random'; sync(); void rebuild(); });
  const shadowBtn = button(optRow, '', () => { state.shadows = !state.shadows; sync(); });
  const shapeBtn = button(optRow, '', () => { state.shapes = state.shapes === 'live' ? 'baked' : state.shapes === 'baked' ? 'off' : 'live'; sync(); void rebuild(); });
  const motionBtn = button(optRow, '', () => { state.motion = state.motion === 'walk' ? 'idle' : state.motion === 'idle' ? 'off' : 'walk'; sync(); void rebuild(); });
  const smartBtn = button(optRow, '', () => { state.smart = !state.smart; sync(); void rebuild(); });
  const underBtn = button(optRow, '', () => { state.underwear = !state.underwear; sync(); void rebuild(); });
  const plainBtn = button(optRow, '', () => { state.plain = !state.plain; sync(); void rebuild(); });
  const clothBtn = button(optRow, '', () => { state.cloth = state.cloth === 'off' ? 'live' : state.cloth === 'live' ? 'freeze' : state.cloth === 'freeze' ? 'near' : 'off'; sync(); void rebuild(); });
  const cullBtn = button(optRow, '', () => { state.cull = !state.cull; sync(); });
  const sharpBtn = button(optRow, '', () => { state.sharp = !state.sharp; sync(); resize(); });
  const sync = () => {
    modelBtns.forEach((b, i) => b.classList.toggle('on', MODELS[i] === state.model));
    countBtns.forEach((b, i) => b.classList.toggle('on', COUNTS[i] === state.count));
    morphBtn.textContent = `Looks: ${state.looks === 'saved' ? 'Char1-3' : state.looks}`;
    morphBtn.classList.toggle('on', state.looks !== 'off');
    shuffleBtn.classList.toggle('on', false);
    shadowBtn.textContent = `Shadows: ${state.shadows ? 'on' : 'off'}`;
    shadowBtn.classList.toggle('on', state.shadows);
    sun.castShadow = state.shadows;
    detailBtns.forEach((b, i) => b.classList.toggle('on', !state.auto && DETAILS[i] === state.detail));
    autoBtn.classList.toggle('on', state.auto && TABLE === AUTO);
    liteBtn.classList.toggle('on', state.auto && TABLE === AUTO_LITE);
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
    clothBtn.textContent = `Cloth tee: ${state.cloth === 'off' ? 'off' : state.cloth === 'live' ? 'simulated' : state.cloth === 'freeze' ? 'frozen once dressed' : 'simulated near the camera'}`;
    clothBtn.classList.toggle('on', state.cloth !== 'off');
    sharpBtn.textContent = `Sharpness: ${state.sharp ? '2x' : '1x'}`;
    sharpBtn.classList.toggle('on', state.sharp);
    cullBtn.textContent = `Out of view: ${state.cull ? 'not drawn' : 'drawn'}`;
    cullBtn.classList.toggle('on', state.cull);
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
    let simulating = 0;
    for (const p of people) {
      p.dist = Math.hypot(camera.position.x - p.root.position.x, camera.position.y - 1.4, camera.position.z - p.root.position.z);
      if (p.lods.length && p.root.visible) { // (someone out of view keeps the level she had: no baking for nobody to see)
        // AUTO detail: her level by her distance from the camera (a level is only left once she is 10% past
        // its edge, so someone walking along an edge doesn't flicker between two)
        const d = Math.hypot(camera.position.x - p.root.position.x, camera.position.y - 1.4, camera.position.z - p.root.position.z); // (to her middle)
        let level = p.level;
        while (level > 0 && d < TABLE[level - 1].within * 0.95) level--;
        while (level < TABLE.length - 1 && d > TABLE[level].within * 1.05) level++;
        if (level !== p.level) {
          p.level = level;
          for (const l of p.lods) {
            l.mesh.geometry = l.geos[level] ??= l.make(level);
            // (her skin's fine bump picture only on the heavier levels: see paintedMaterial)
            const mat = TABLE[level].detail >= 25 ? l.fine : l.plain;
            if (mat) l.mesh.material = mat;
            if (l.liveSet) {
              // (AUTO LITE: all her shapes when she is drawn live, her four motion shapes when she is baked)
              const set = TABLE[level].live ? l.liveSet : l.bakedSet;
              l.mesh.morphTargetDictionary = set?.dict;
              l.mesh.morphTargetInfluences = set?.influences;
              if (l.soft) { l.soft.influences = set?.influences ?? []; l.soft.at = MOTION_TARGETS.map((name) => set?.dict[name] ?? -1); }
            }
            if (TABLE === AUTO && level >= AUTO_DROP_FROM) for (let k = 0; k < 2; k++) { l.geos[k]?.dispose(); l.geos[k] = null; }
          }
        }
      }
      const walking = state.motion !== 'idle';
      if (walking) p.angle += p.speed * dt;
      const x = Math.cos(p.angle) * p.radius;
      const z = Math.sin(p.angle) * p.radius;
      const m = p.live;
      // (someone out of view isn't posed either, unless her tee is being simulated on her: her place on her circle goes on)
      if (m && (p.root.visible || (p.cloth && p.cloth.phase !== 'frozen'))) {
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
      p.cloth?.update(dt);
      if (p.cloth && p.cloth.phase !== 'frozen') simulating++;
    }
    // THE CLOTH TEES' QUEUE: a tee being simulated is several milliseconds of every frame, and a copy of her whole
    // body in memory. So only a few are simulated at once: frozen once dressed, the next in line takes its place, a
    // few at a time until everybody is dressed; simulated for good, the first few wear cloth and the rest wait in paint.
    const putOn = (q: Person, freeze: boolean) => {
      q.cloth?.dispose();
      q.cloth = undefined;
      try { q.cloth = q.clothMake!(freeze); } catch (e) { q.clothMake = undefined; console.error('[devroom] the cloth tee could not be put on her', e); state.error = `No cloth tee: ${e instanceof Error ? e.message : String(e)}`; }
    };
    if (simulating < (state.cloth === 'live' ? CLOTH_SIMULATED_AT_MOST : CLOTH_DRESSING_AT_ONCE)) {
      const next = people.find((q) => q.clothMake && !q.cloth);
      if (next) putOn(next, state.cloth !== 'live');
    }
    // NEAR THE CAMERA (v0.42; Joshua: "0-3m = 3% + Live/Sim On", beyond it off): everybody is dressed and frozen as
    // above; then whoever comes within CLOTH_NEAR of the camera has her tee simulated again (the nearest first, at most
    // CLOTH_DRESSING_AT_ONCE at once), and it is frozen again as it hangs when she has gone back past it.
    if (state.cloth === 'near') {
      for (const q of people) if (q.cloth && q.cloth.phase !== 'frozen' && q.clothNear && (q.dist ?? 0) > CLOTH_NEAR * 1.1) { q.cloth.release(); q.clothNear = false; }
      if (simulating < CLOTH_DRESSING_AT_ONCE && !people.some((q) => q.clothMake && !q.cloth)) {
        const near = people.filter((q) => q.clothMake && q.cloth?.phase === 'frozen' && (q.dist ?? Infinity) < CLOTH_NEAR * 0.95).sort((a, b) => a.dist! - b.dist!)[0];
        if (near) { putOn(near, false); near.clothNear = true; }
      }
    }
    camera.position.set(Math.sin(view.yaw) * Math.cos(view.pitch) * view.dist, Math.sin(view.pitch) * view.dist + 1.2, Math.cos(view.yaw) * Math.cos(view.pitch) * view.dist);
    camera.lookAt(0, 1.2, 0);
    // OUT OF VIEW, NOT DRAWN (v0.43; Joshua: "hide completely models that are not in the camera viewing frame... as
    // soon as the camera or person walks into the camera view, it shows"). three.js can't do this for these bodies by
    // itself (a skinned body's own bounds are its rest pose's, so its culling is off): each person is a ball round her
    // middle, tested against the camera's view. The ball is wide enough for her stride, and for her shadow while
    // shadows are on, so a shadow doesn't vanish from the picture while its owner is just outside it.
    inView = 0;
    if (state.cull) {
      camera.updateMatrixWorld();
      frustum.setFromProjectionMatrix(cullMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      cullBall.radius = state.shadows ? 4.5 : 2.4;
    }
    for (const p of people) {
      const show = !state.cull || frustum.intersectsSphere(cullBall.set(cullAt.set(p.root.position.x, 1.4, p.root.position.z), cullBall.radius));
      p.root.visible = show;
      p.cloth?.show(show);
      if (show) inView++;
    }
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
  /** The cloth tees' line of the readout: how many are where, and what the simulated ones cost a frame. */
  const clothLine = () => {
    if (state.cloth === 'off') return '';
    const worn = people.filter((q) => q.cloth), frozen = worn.filter((q) => q.cloth!.phase === 'frozen'), live = worn.filter((q) => q.cloth!.phase !== 'frozen');
    const waiting = people.filter((q) => q.clothMake && !q.cloth).length;
    const costs = live.map((q) => q.cloth!.cost()), ms = costs.reduce((a, c) => a + c.ms, 0);
    const triangles = worn.reduce((a, q) => a + q.cloth!.cost().triangles, 0);
    const parts = [
      live.length ? `${live.length} simulated · ${ms.toFixed(ms < 10 ? 1 : 0)} ms a frame${costs[0] ? ` · ${costs[0].points} points each` : ''}` : '',
      frozen.length ? `${frozen.length} frozen` : '',
      waiting ? `${waiting} waiting${state.cloth === 'live' ? ` (at most ${CLOTH_SIMULATED_AT_MOST} simulated at once)` : ''}` : '',
    ].filter(Boolean);
    return `cloth tees: ${parts.join(' · ') || 'none yet'}${triangles ? ` · ${(triangles / 1000).toFixed(0)}k triangles` : ''}`;
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
        `${people.length} x ${state.model.label}${state.cull ? ` · ${inView} in view` : ''}`,
        `${(r.triangles / 1e6).toFixed(2)}M triangles drawn · ${r.calls} draw calls`,
        state.auto && people.some((q) => q.lods.length)
          ? `auto${TABLE === AUTO ? '' : ' lite'}: ${TABLE.map((a, k) => [`${a.detail}%${a.live ? ' live' : ''}`, people.filter((q) => q.level === k).length] as const).filter(([, c]) => c > 0).map(([d, c]) => `${c} at ${d}`).join(' · ')}`
          : state.perChar ? `each character: ${(state.perChar / 1000).toFixed(1)}k triangles as drawn` : '',
        clothLine(),
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
  (window as unknown as { devRoom: unknown }).devRoom = Object.assign(hooks, { state, people, renderer, looks: LOOKS, randomLook, get fps() { return fps; } });
}
