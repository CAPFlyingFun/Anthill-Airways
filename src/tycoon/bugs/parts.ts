// ============================================================================
// parts.ts — 🧩 the shared building blocks every bug is made from (tycoon bugs, v0.68).
//
// WHY THIS FILE EXISTS
//   Every creature except the fire ants is procedural (built from code). To keep dozens of them on screen at 30+ FPS
//   on a phone, each bug follows the same recipe:
//     1. Build its BODY out of simple solid shapes (ellipsoids, tapered tubes, lathes), paint each shape with VERTEX
//        COLOURS, and MERGE them all into ONE geometry -> one mesh, one draw call, any number of colours.
//     2. Build that geometry ONCE per species (a module-level cache), then every bug of that species shares it.
//     3. Legs are separate meshes (they have to swing), but they all share one leg geometry per side.
//     4. Wings are thin double-sided shapes with a painted canvas texture (veins, orange/black patterns...).
//
//   Everything is in GAME UNITS (1 unit = 2 mm, see ../scale.ts). The root sits on the ground under the body centre,
//   y is up, and the creature faces +Z, just like the old models in src/actors/models.ts.
//
// WHAT'S IN HERE
//   - ell / tube / lathe / merge : the shape toolbox (all of them paint vertex colours)
//   - wingGeo + wing textures    : thin wing shapes and the painted textures that make them look veined / patterned
//   - addLegs / addWing / seat   : register legs + wings so the EXISTING animateCreature() animates them
//   - finishBug                  : wires the shared per-frame extras (legs lift off the ground while stepping)
// ============================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { newModel, type CreatureModel, type Wing } from '../../actors/models';
import type { Bug, BugKind } from './types';

// ---------------------------------------------------------------------------
// Caches (module level: built once, shared by every bug of that kind)
// ---------------------------------------------------------------------------
const store = new Map<string, unknown>();
/** Build something once per key and reuse it forever. */
export function cached<T>(key: string, build: () => T): T {
  let v = store.get(key) as T | undefined;
  if (v === undefined) {
    v = build();
    store.set(key, v);
  }
  return v;
}

// ---------------------------------------------------------------------------
// Materials: three shared "vertex colour" materials (shiny shells / satin skin / matte fuzz)
// ---------------------------------------------------------------------------
export const SHINY = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.22, metalness: 0.12 });
export const SATIN = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.0 });
export const MATTE = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0.0 });
/** Slightly glossy + flat shaded-ish skin for the lizards and toad. */
export const SKIN = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.0 });

// ---------------------------------------------------------------------------
// The shape toolbox
// ---------------------------------------------------------------------------
type V3 = readonly [number, number, number];
/** A colour is one hex number, or a function of the vertex position (for stripes / bands / gradients). */
export type Colour = number | ((x: number, y: number, z: number) => number);

const _col = new THREE.Color();
const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _up = new THREE.Vector3(0, 1, 0);

/** Writes the colour attribute (and drops UVs, so every part can be merged with every other part). */
function finish(g: THREE.BufferGeometry, color: Colour) {
  g.deleteAttribute('uv');
  const pos = g.getAttribute('position');
  const arr = new Float32Array(pos.count * 3);
  if (typeof color === 'number') {
    _col.setHex(color);
    for (let i = 0; i < pos.count; i++) _col.toArray(arr, i * 3);
  } else {
    for (let i = 0; i < pos.count; i++) {
      _col.setHex(color(pos.getX(i), pos.getY(i), pos.getZ(i)));
      _col.toArray(arr, i * 3);
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

/**
 * An ELLIPSOID (a stretched ball): the workhorse of every body.
 * `at` = centre, `r` = radii (x, y, z), `rot` = optional tilt (radians, x/y/z order).
 * `clipMinX` / `clipMaxX` slice it flat at that x (used to make the two halves of a shell with a seam between).
 */
export function ell(color: Colour, at: V3, r: V3, o: { w?: number; h?: number; rot?: V3; clipMinX?: number; clipMaxX?: number } = {}) {
  const g = new THREE.SphereGeometry(1, o.w ?? 10, o.h ?? 7);
  _e.set(...(o.rot ?? [0, 0, 0]));
  _q.setFromEuler(_e);
  _m4.compose(new THREE.Vector3(...at), _q, new THREE.Vector3(...r));
  g.applyMatrix4(_m4);
  const pos = g.getAttribute('position');
  const nor = g.getAttribute('normal');
  if (o.clipMinX !== undefined || o.clipMaxX !== undefined) {
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      if (o.clipMinX !== undefined && x < o.clipMinX) {
        pos.setX(i, o.clipMinX);
        nor.setXYZ(i, -1, 0, 0);
      } else if (o.clipMaxX !== undefined && x > o.clipMaxX) {
        pos.setX(i, o.clipMaxX);
        nor.setXYZ(i, 1, 0, 0);
      }
    }
  }
  return finish(g, color);
}

/** A tapered TUBE from point a (radius r0) to point b (radius r1): legs, antennae, tails, fangs. */
export function tube(color: Colour, a: V3, b: V3, r0: number, r1: number, sides = 5, open = false) {
  const A = new THREE.Vector3(...a);
  const B = new THREE.Vector3(...b);
  const dir = B.clone().sub(A);
  const len = dir.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, sides, 1, open);
  _q.setFromUnitVectors(_up, dir.normalize());
  _m4.compose(A.clone().add(B).multiplyScalar(0.5), _q, new THREE.Vector3(1, 1, 1));
  g.applyMatrix4(_m4);
  return finish(g, color);
}

/**
 * A LATHE: a shape spun around the front-to-back (Z) axis. `profile` is a list of [radius, z] pairs from the
 * back to the front. Perfect for abdomens (ridged, segmented), pillbug armour, tails, pears.
 */
export function lathe(color: Colour, profile: ReadonlyArray<readonly [number, number]>, at: V3 = [0, 0, 0], o: { segs?: number; sy?: number; sx?: number } = {}) {
  const g = new THREE.LatheGeometry(profile.map(([r, t]) => new THREE.Vector2(r, t)), o.segs ?? 8);
  g.rotateX(Math.PI / 2); // lathe spins around Y; turn that axis into Z (front-to-back)
  g.scale(o.sx ?? 1, o.sy ?? 1, 1);
  g.translate(...at);
  return finish(g, color);
}

/** Merge parts into ONE geometry (one mesh = one draw call). */
export function merge(parts: THREE.BufferGeometry[]) {
  const g = mergeGeometries(parts, false);
  if (!g) throw new Error('bugs: could not merge parts (attribute mismatch)');
  g.computeBoundingSphere();
  return g;
}

/** Mirror a geometry left <-> right (x -> -x), fixing the triangle winding so lighting stays right. */
export function mirrorX(g: THREE.BufferGeometry) {
  const m = g.clone();
  const pos = m.getAttribute('position');
  for (let i = 0; i < pos.count; i++) pos.setX(i, -pos.getX(i));
  const nor = m.getAttribute('normal');
  if (nor) for (let i = 0; i < nor.count; i++) nor.setX(i, -nor.getX(i));
  const idx = m.getIndex();
  if (idx) {
    for (let i = 0; i < idx.count; i += 3) {
      const t = idx.getX(i + 1);
      idx.setX(i + 1, idx.getX(i + 2));
      idx.setX(i + 2, t);
    }
  }
  return m;
}

/** Triangle count of a geometry (for the budget report). */
export function triCount(g: THREE.BufferGeometry) {
  return (g.getIndex() ? g.getIndex()!.count : g.getAttribute('position').count) / 3;
}

/** Mix two hex colours (t = 0 -> a, 1 -> b). Handy for gradients inside colour functions. */
export function mix(a: number, b: number, t: number) {
  const k = Math.min(1, Math.max(0, t));
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return ((ar + (br - ar) * k) << 16) | ((ag + (bg - ag) * k) << 8) | (ab + (bb - ab) * k);
}

/** A flattened spot sitting ON an ellipsoid's surface (so it reads as paint / a wart, not a ball). */
export function spotOn(color: Colour, c: V3, r: V3, x: number, z: number, size: number, sink: number, o: { w?: number; h?: number } = {}) {
  const k = 1 - (x - c[0]) ** 2 / r[0] ** 2 - (z - c[2]) ** 2 / r[2] ** 2;
  const y = c[1] + r[1] * Math.sqrt(Math.max(0.0001, k));
  // outward normal of the ellipsoid at that point
  const n = new THREE.Vector3((x - c[0]) / r[0] ** 2, (y - c[1]) / r[1] ** 2, (z - c[2]) / r[2] ** 2).normalize();
  const p = new THREE.Vector3(x, y, z).addScaledVector(n, -sink);
  const g = ell(color, [p.x, p.y, p.z], [size, size, size], { w: o.w ?? 7, h: o.h ?? 4 });
  return g;
}

// ---------------------------------------------------------------------------
// Wings: thin double-sided shapes + painted textures
// ---------------------------------------------------------------------------
/** A smooth closed outline through control points (x = along the wing, z = front/back). */
export function smoothOutline(ctrl: ReadonlyArray<readonly [number, number]>, n = 18): Array<[number, number]> {
  const curve = new THREE.CatmullRomCurve3(ctrl.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'centripetal');
  const pts = curve.getPoints(n);
  pts.pop(); // last point == first point
  return pts.map((p) => [p.x, p.z] as [number, number]);
}

export interface WingShape {
  /** Geometry for a RIGHT wing (spans +x; leading edge toward +z). Left wings use mirrorX(). */
  geo: THREE.BufferGeometry;
  /** The outline that made it (so textures can draw a border exactly along the edge). */
  outline: Array<[number, number]>;
  minX: number; maxX: number; minZ: number; maxZ: number;
}

/** Turn an outline into a flat wing with UVs that match the canvas textures below. */
export function wingShape(outline: Array<[number, number]>): WingShape {
  const xs = outline.map((p) => p[0]), zs = outline.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const tri = THREE.ShapeUtils.triangulateShape(outline.map(([x, z]) => new THREE.Vector2(x, z)), []);
  const pos = new Float32Array(outline.length * 3);
  const nor = new Float32Array(outline.length * 3);
  const uv = new Float32Array(outline.length * 2);
  outline.forEach(([x, z], i) => {
    pos.set([x, 0, z], i * 3);
    nor.set([0, 1, 0], i * 3);
    uv.set([(x - minX) / (maxX - minX), (z - minZ) / (maxZ - minZ)], i * 2); // leading edge (+z) = top of the canvas
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(tri.flat());
  g.computeBoundingSphere();
  return { geo: g, outline, minX, maxX, minZ, maxZ };
}

export type Draw = (c: CanvasRenderingContext2D, W: number, H: number, to: (x: number, z: number) => [number, number], shape: WingShape) => void;

/** Paint a wing texture. `to` converts wing coordinates (x, z) into canvas pixels. */
export function wingTexture(key: string, shape: WingShape, draw: Draw) {
  return cached(`tex|${key}`, () => {
    const W = 256, H = 128;
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const c = cv.getContext('2d')!;
    const to = (x: number, z: number): [number, number] => [
      ((x - shape.minX) / (shape.maxX - shape.minX)) * W,
      (1 - (z - shape.minZ) / (shape.maxZ - shape.minZ)) * H,
    ];
    draw(c, W, H, to, shape);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  });
}

/** Path of the wing outline on the canvas (for fills / borders that follow the edge exactly). */
export function outlinePath(c: CanvasRenderingContext2D, shape: WingShape, to: (x: number, z: number) => [number, number]) {
  c.beginPath();
  shape.outline.forEach(([x, z], i) => {
    const [px, py] = to(x, z);
    if (i === 0) c.moveTo(px, py);
    else c.lineTo(px, py);
  });
  c.closePath();
}

/** Shared wing materials, one per texture. `see` = see-through (clear insect wings) or solid (butterfly / moth). */
export function wingMaterial(tex: THREE.Texture, see: boolean) {
  return cached(`wmat|${tex.uuid}`, () =>
    new THREE.MeshStandardMaterial({
      map: tex,
      side: THREE.DoubleSide,
      roughness: 0.5,
      transparent: see,
      depthWrite: !see,
      alphaTest: see ? 0.02 : 0.4,
      // solid patterned wings glow a little on their own, so they stay bright from every angle (toy-like, like the icon)
      emissive: see ? 0x000000 : 0xffffff,
      emissiveMap: see ? null : tex,
      emissiveIntensity: see ? 0 : 0.42,
    }),
  );
}

// ---------------------------------------------------------------------------
// Registering legs, wings, seats on the model, the way animateCreature expects
// ---------------------------------------------------------------------------
/** Bookkeeping so the legs can lift their feet while stepping. */
export interface Rig {
  legMeshes: THREE.Mesh[];
  legSide: number[];
  lift: number;
  /** wing meshes that should hide while folded (ladybug, beetle: the wings tuck under the shell) */
  hideWhenFolded: THREE.Object3D[];
}
export function newRig(lift = 0.3): Rig {
  return { legMeshes: [], legSide: [], lift, hideWhenFolded: [] };
}

/** A fresh Bug shell: model + kind + seats. `scale` stretches the whole thing (length option). */
export function newBug(kind: BugKind, height: number, length: number, scale: number): Bug {
  const m = newModel(height * scale, length * scale) as Bug;
  m.kind = kind;
  m.seats = [];
  m.bob.scale.setScalar(scale);
  m.legAmp = 0.45;
  return m;
}

export interface LegSpec {
  /** where the hip joins the body (bob space) */
  at: V3;
  /** which side the leg is on: +1 right (+x), -1 left (-x) */
  side: 1 | -1;
  /** resting direction: + turns the foot FORWARD for the right leg's sign convention (see addLegs callers) */
  yaw: number;
  /** 0 or PI, alternating gait */
  phase: number;
  geo: THREE.BufferGeometry;
}

/**
 * Registers legs EXACTLY the way models.ts addLegs does: each leg is a pivot Group (swings around Y),
 * its resting rotation goes in legBase, its axis in legAxis and its gait phase in legPhase.
 */
export function addLegs(m: Bug, rig: Rig, mat: THREE.Material, specs: LegSpec[]) {
  for (const s of specs) {
    const pivot = new THREE.Group();
    pivot.position.set(...s.at);
    pivot.rotation.y = s.yaw;
    const mesh = new THREE.Mesh(s.geo, mat);
    pivot.add(mesh);
    m.bob.add(pivot);
    m.legs.push(pivot);
    m.legBase.push(pivot.quaternion.clone());
    m.legAxis.push(new THREE.Vector3(0, 1, 0));
    m.legPhase.push(s.phase);
    rig.legMeshes.push(mesh);
    rig.legSide.push(s.side);
  }
}

/** Tripod gait phase for 6-legged bugs: front-left, middle-right, back-left go together. */
export function tripodPhase(row: number, side: 1 | -1) {
  return (row % 2 === 0) === (side === -1) ? 0 : Math.PI;
}
/** Alternating gait phase for 8 legs (spiders). */
export function octoPhase(row: number, side: 1 | -1) {
  return (row + (side === 1 ? 1 : 0)) % 2 === 0 ? 0 : Math.PI;
}

/** The standard resting yaw for a leg in row 0..n-1 (front rows point forward, back rows point back). */
export function rowYaw(row: number, rows: number, side: 1 | -1, spread = 0.55) {
  const t = rows === 1 ? 0 : (row / (rows - 1)) * 2 - 1; // -1 front .. +1 back
  return t * spread * side;
}

/**
 * A leg made of tubes: `pts` are the joints for a RIGHT leg (x = outward), starting at the hip (0,0,0).
 * Radii go with the joints. Knee balls make it look jointed. Returns the right geometry; mirror for the left.
 */
export function legChain(color: number, pts: V3[], radii: number[], o: { sides?: number; knees?: boolean; foot?: number } = {}) {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < pts.length - 1; i++) parts.push(tube(color, pts[i], pts[i + 1], radii[i], radii[i + 1], o.sides ?? 5));
  if (o.knees) for (let i = 1; i < pts.length - 1; i++) parts.push(ell(color, pts[i], [radii[i] * 1.5, radii[i] * 1.5, radii[i] * 1.5], { w: 6, h: 4 }));
  if (o.foot) {
    const f = pts[pts.length - 1];
    parts.push(ell(color, [f[0], f[1] + o.foot * 0.2, f[2] + o.foot * 0.3], [o.foot, o.foot * 0.45, o.foot * 1.4], { w: 6, h: 4 }));
  }
  return merge(parts);
}

/** Make the two sides of a leg geometry (right, left) and cache them. */
export function legPair(key: string, build: () => THREE.BufferGeometry): { R: THREE.BufferGeometry; L: THREE.BufferGeometry } {
  return cached(`leg|${key}`, () => {
    const R = build();
    return { R, L: mirrorX(R) };
  });
}

/** Add an empty attach point for a passenger / cargo item. Local to model.bob. */
export function seat(m: Bug, x: number, y: number, z: number) {
  const o = new THREE.Object3D();
  o.name = 'seat';
  o.position.set(x, y, z);
  m.bob.add(o);
  m.seats.push(o);
  return o;
}

/**
 * Registers a wing the way models.ts expects (Wing entry with bone / base / up / fwd / side).
 *  - `folded` = true: the wing pivot is turned so a closed wing lies BACK along the body (bee, fly, ladybug, beetle);
 *    the standard buzz then opens it outward and flaps it.
 *  - `folded` = false: the wing stays pointing sideways (butterfly, moth, dragonfly), and the species'
 *    own `extra` does all the flapping.
 */
export function addWing(m: Bug, geoR: THREE.BufferGeometry, geoL: THREE.BufferGeometry, mat: THREE.Material, at: V3, side: 1 | -1, folded: boolean) {
  const mesh = new THREE.Mesh(side === 1 ? geoR : geoL, mat);
  mesh.position.set(...at);
  if (folded) mesh.quaternion.setFromAxisAngle(_up, side * Math.PI / 2);
  m.bob.add(mesh);
  const w: Wing = {
    bone: mesh,
    base: mesh.quaternion.clone(),
    up: new THREE.Vector3(0, 1, 0),
    fwd: new THREE.Vector3(0, 0, 1),
    side,
  };
  m.wings.push(w);
  return mesh;
}

/**
 * Last step of every builder: sets the extra per-frame animation. The standard extra is
 *   1. legs lift their feet while stepping (so they don't just slide)
 *   2. tucked-away wings hide when folded
 * then the species' own functions run (tail sway, dewlap, flapping...).
 * Note: animateCreature calls `extra` AFTER its own leg + wing math, so anything set here wins.
 */
export function finishBug(m: Bug, rig: Rig, extras: Array<(dt: number) => void> = []) {
  const n = rig.legMeshes.length;
  for (const o of rig.hideWhenFolded) o.visible = false; // start folded
  m.extra = (dt: number) => {
    if (rig.lift > 0) {
      for (let i = 0; i < n; i++) {
        const c = Math.cos(m.walkT + m.legPhase[i]);
        // the foot moves FORWARD when cos > 0 for a left leg and cos < 0 for a right leg
        rig.legMeshes[i].rotation.z = rig.legSide[i] * Math.max(0, -rig.legSide[i] * c) * m.walkBlend * rig.lift;
      }
    }
    if (rig.hideWhenFolded.length) {
      const vis = m.wingOpen > 0.03; // wings tucked under the shell are hidden while folded
      for (const o of rig.hideWhenFolded) o.visible = vis;
    }
    for (const f of extras) f(dt);
  };
}

/** Add the big merged body mesh (casts + receives shadows). */
export function addBody(m: Bug, geo: THREE.BufferGeometry, mat: THREE.Material = SHINY, parent: THREE.Object3D = m.bob) {
  const b = new THREE.Mesh(geo, mat);
  b.castShadow = true;
  b.receiveShadow = true;
  b.userData.body = true;
  parent.add(b);
  return b;
}

/** Tiny helper: a type-safe re-export so builders can say what they return. */
export type { CreatureModel };
