// ============================================================================
// common.ts — 🛠️ shared helpers for the airport pieces (v0.68).
//
// What lives here:
//   Piece        — the shape every airport piece returns (root + blockers + spots + roofs + update)
//   Batch        — "glue many little shapes into a few big meshes" (fewer draw calls = faster on a phone)
//   xf()         — a quick way to say "put it HERE, turned THIS way, THIS big"
//   gridSurface  — build a curvy surface from a formula (used for leaves, shells and husks)
//   leafGeometry / pebbleGeometry / roundedSlab — the found-object shapes everybody reuses
//   scatter()    — one InstancedMesh that draws hundreds of copies of a shape in ONE draw call
//   pathSamples  — evenly spaced points along a line (for edging stones and dashed lines)
//   countStats   — triangle + mesh counts, for the performance report
//
// Remember the scale: 1 game unit = 2 mm. An ant is ~2 units long and ~1 unit tall.
// ============================================================================
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Footprint } from '../kit';

export type { Footprint };

/** What every airport piece hands back to the game. */
export interface Piece {
  root: THREE.Group;
  /** Walls you can't walk through, in the piece's local space (x/z boxes). */
  blockers: Footprint[];
  /** Named local points the game uses: 'door', 'counter', 'queue', 'gate', 'plane', 'fuel', 'cash', ... */
  spots: Record<string, THREE.Vector3>;
  /** Parts that can be hidden for a 2.5D cutaway view (roofs), so you can see inside from above. */
  roofs: THREE.Object3D[];
  update?(dt: number): void;
}

/** Shorthand for a spot. */
export const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

// ----------------------------------------------------------------------------
// Placing things
// ----------------------------------------------------------------------------
export interface XfOpts {
  /** turn left/right (around the up axis) */
  ry?: number;
  /** tip forward/back */
  rx?: number;
  /** roll sideways */
  rz?: number;
  /** size: one number for all three axes... */
  s?: number;
  /** ...or squash/stretch each axis on its own */
  sx?: number;
  sy?: number;
  sz?: number;
}
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
/** A matrix that moves to (x,y,z), turns (yaw first, then tip, then roll) and scales. */
export function xf(x = 0, y = 0, z = 0, o: XfOpts = {}) {
  _e.set(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0, 'YXZ');
  _q.setFromEuler(_e);
  const s = o.s ?? 1;
  _p.set(x, y, z);
  _s.set(o.sx ?? s, o.sy ?? s, o.sz ?? s);
  return new THREE.Matrix4().compose(_p, _q, _s);
}

// ----------------------------------------------------------------------------
// Batch: merge many small shapes into one mesh per material
// ----------------------------------------------------------------------------
/**
 * Collect lots of little shapes (each with its own position/turn/size) and build them as ONE merged mesh per
 * material. A bottle cap made of 12 parts becomes 1–2 draw calls instead of 12.
 * (UVs are dropped on purpose so any shape can merge with any other. Textured things are separate meshes.)
 */
export class Batch {
  private groups = new Map<THREE.Material, THREE.BufferGeometry[]>();
  /** Add `geo` placed by matrix `m`, drawn with `material`. The source geometry is not changed. */
  add(geo: THREE.BufferGeometry, material: THREE.Material, m?: THREE.Matrix4) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.deleteAttribute('uv');
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    if (m) g.applyMatrix4(m);
    const wantsColor = (material as THREE.MeshStandardMaterial).vertexColors === true;
    if (wantsColor && !g.getAttribute('color')) {
      const n = g.getAttribute('position').count;
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
    } else if (!wantsColor && g.getAttribute('color')) {
      g.deleteAttribute('color');
    }
    let list = this.groups.get(material);
    if (!list) this.groups.set(material, (list = []));
    list.push(g);
    return this;
  }
  /** Add `geo` at a position with optional turn/scale (see xf). */
  at(geo: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0, o: XfOpts = {}) {
    return this.add(geo, material, xf(x, y, z, o));
  }
  /** Merge everything into a Group of meshes (one mesh per material). */
  build(shadows: { cast?: boolean; receive?: boolean } = {}): THREE.Group {
    const group = new THREE.Group();
    for (const [material, list] of this.groups) {
      const merged = mergeGeometries(list, false);
      if (!merged) throw new Error('Batch: geometries could not be merged');
      const m = new THREE.Mesh(merged, material);
      m.castShadow = shadows.cast ?? true;
      m.receiveShadow = shadows.receive ?? true;
      group.add(m);
    }
    this.groups.clear();
    return group;
  }
}

// ----------------------------------------------------------------------------
// Surfaces from a formula
// ----------------------------------------------------------------------------
export type SurfaceFn = (u: number, v: number) => [number, number, number];

/**
 * A (nu × nv) grid of quads whose points come from `fn(u, v)` with u and v running 0..1.
 * The front face is on the side of (du × dv). `color(u,v)` adds per-vertex colors if given.
 */
export function gridSurface(
  nu: number,
  nv: number,
  fn: SurfaceFn,
  o: { flip?: boolean; color?: (u: number, v: number) => number } = {},
): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const c = new THREE.Color();
  for (let i = 0; i <= nu; i++) {
    for (let j = 0; j <= nv; j++) {
      const [x, y, z] = fn(i / nu, j / nv);
      pos.push(x, y, z);
      if (o.color) {
        c.setHex(o.color(i / nu, j / nv));
        col.push(c.r, c.g, c.b);
      }
    }
  }
  const idx: number[] = [];
  const row = nv + 1;
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const a = i * row + j;
      const b = (i + 1) * row + j;
      const cc = (i + 1) * row + j + 1;
      const d = i * row + j + 1;
      if (o.flip) idx.push(a, cc, b, a, d, cc);
      else idx.push(a, b, cc, a, cc, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (o.color) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A strip of quads joining two lines of points (used to close the edge of a thin shell). */
export function stripBetween(a: THREE.Vector3[], b: THREE.Vector3[], colorHex?: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const c = new THREE.Color(colorHex ?? 0xffffff);
  for (let i = 0; i < a.length; i++) {
    pos.push(a[i].x, a[i].y, a[i].z, b[i].x, b[i].y, b[i].z);
    col.push(c.r, c.g, c.b, c.r, c.g, c.b);
  }
  const idx: number[] = [];
  for (let i = 0; i < a.length - 1; i++) {
    const p = i * 2;
    idx.push(p, p + 1, p + 3, p, p + 3, p + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ----------------------------------------------------------------------------
// Found-object shapes (cached: build once, reuse everywhere)
// ----------------------------------------------------------------------------
const geoCache = new Map<string, THREE.BufferGeometry>();
export function cached<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  let g = geoCache.get(key);
  if (!g) geoCache.set(key, (g = make()));
  return g as T;
}

/**
 * A closed, pointed leaf lying flat: length along Z, width along X, a little puffy in the middle (`th`) and
 * with edges that curl up (`curl`, in units). Top and bottom meet at the rim so there is no gap to see.
 */
export function leafGeometry(len: number, wid: number, th = 0.35, curl = 0.25, seg: [number, number] = [12, 8]): THREE.BufferGeometry {
  return cached(`leaf|${len}|${wid}|${th}|${curl}|${seg}`, () => {
    const make = (sign: number) =>
      gridSurface(
        seg[0],
        seg[1],
        (u, v) => {
          const U = u * 2 - 1;
          const V = v * 2 - 1;
          const taper = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(U), 2.1)), 0.55);
          const puff = th * (1 - V * V) * Math.sqrt(Math.max(0, 1 - U * U));
          const lift = curl * V * V * taper;
          return [V * (wid / 2) * taper, sign * puff * (sign > 0 ? 1 : 0.4) + lift, U * (len / 2)];
        },
        { flip: sign < 0 },
      );
    const g = mergeGeometries([make(1), make(-1)])!;
    g.computeVertexNormals();
    return g;
  });
}

/**
 * A smooth little rock: a lumpy sphere (diameter 1). Scale it per instance to make it flat / long.
 * `variant` 0..3 gives four different lumpy shapes so a row of stones doesn't look copy-pasted.
 */
export function pebbleGeometry(variant = 0): THREE.BufferGeometry {
  return cached(`pebble|${variant}`, () => {
    let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(0.5, 1);
    g.deleteAttribute('normal');
    g.deleteAttribute('uv');
    g = mergeVertices(g);
    const p = g.getAttribute('position');
    const k = 1 + variant * 0.73;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const lump = 1 + 0.13 * Math.sin(7 * x * k + 1.3 * variant) * Math.cos(6 * y + 2.1 * k) + 0.08 * Math.sin(9 * z * k + variant);
      p.setXYZ(i, x * lump, y * lump, z * lump);
    }
    g.computeVertexNormals();
    return g;
  });
}

/**
 * A flat slab with rounded corners and softly rounded edges: `w` wide (X), `d` long (Z), `h` tall (Y).
 * Sits on y = 0 and is centred on x/z. Used for runways, sign boards and floors.
 */
export function roundedSlab(w: number, d: number, h: number, corner = 2, bevel = 0.15): THREE.BufferGeometry {
  return cached(`slab|${w}|${d}|${h}|${corner}|${bevel}`, () => {
    const hw = w / 2 - bevel;
    const hd = d / 2 - bevel;
    const r = Math.min(corner, hw, hd);
    const s = new THREE.Shape();
    s.moveTo(-hw + r, -hd);
    s.lineTo(hw - r, -hd);
    s.quadraticCurveTo(hw, -hd, hw, -hd + r);
    s.lineTo(hw, hd - r);
    s.quadraticCurveTo(hw, hd, hw - r, hd);
    s.lineTo(-hw + r, hd);
    s.quadraticCurveTo(-hw, hd, -hw, hd - r);
    s.lineTo(-hw, -hd + r);
    s.quadraticCurveTo(-hw, -hd, -hw + r, -hd);
    const g = new THREE.ExtrudeGeometry(s, {
      depth: Math.max(0.01, h - 2 * bevel),
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 2,
      curveSegments: 6,
    });
    g.rotateX(-Math.PI / 2); // lie flat: shape Y -> world -Z, extrusion -> up
    g.translate(0, bevel, 0);
    return g;
  });
}

/** A twig / grass stem / seed: a capsule standing on Y, `len` long (tips included) and `r` thick. */
export function capsuleGeometry(len: number, r: number, seg = 6): THREE.BufferGeometry {
  return cached(`caps|${len}|${r}|${seg}`, () => new THREE.CapsuleGeometry(r, Math.max(0.001, len - 2 * r), 3, seg));
}

/** A twig between two points as a matrix + length (for use with Batch.add). */
export function between(a: THREE.Vector3, b: THREE.Vector3, thick = 1) {
  const dir = b.clone().sub(a);
  const len = dir.length();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  const m = new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(thick, len, thick));
  return { m, len };
}

// ----------------------------------------------------------------------------
// Instancing: many copies, ONE draw call
// ----------------------------------------------------------------------------
export interface Item {
  x: number;
  y: number;
  z: number;
  ry?: number;
  rx?: number;
  rz?: number;
  s?: number;
  sx?: number;
  sy?: number;
  sz?: number;
  /** tint (needs a WHITE base material to show) */
  color?: number;
}
/** Draw all `items` as one InstancedMesh of `geo`. If items have `color`, use a white material. */
export function scatter(geo: THREE.BufferGeometry, material: THREE.Material, items: Item[], o: { cast?: boolean; receive?: boolean } = {}) {
  const im = new THREE.InstancedMesh(geo, material, Math.max(1, items.length));
  const c = new THREE.Color();
  let colored = false;
  items.forEach((it, i) => {
    im.setMatrixAt(i, xf(it.x, it.y, it.z, it));
    if (it.color !== undefined) {
      colored = true;
      im.setColorAt(i, c.setHex(it.color));
    }
  });
  im.count = items.length;
  if (colored && im.instanceColor) im.instanceColor.needsUpdate = true;
  im.instanceMatrix.needsUpdate = true;
  im.castShadow = o.cast ?? false;
  im.receiveShadow = o.receive ?? true;
  im.frustumCulled = false; // pieces are small; skip the bounding-sphere fuss for instances
  return im;
}

// ----------------------------------------------------------------------------
// Paths
// ----------------------------------------------------------------------------
export interface PathSample {
  x: number;
  z: number;
  /** direction of travel (unit) */
  tx: number;
  tz: number;
}
/** Points spaced `spacing` apart along a polyline of (x,z) points, starting `start` in from the beginning. */
export function pathSamples(points: THREE.Vector2[], spacing: number, start = 0): PathSample[] {
  const out: PathSample[] = [];
  let carry = start;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const len = a.distanceTo(b);
    if (len < 1e-6) continue;
    const tx = (b.x - a.x) / len;
    const tz = (b.y - a.y) / len;
    let d = carry;
    while (d <= len) {
      out.push({ x: a.x + tx * d, z: a.y + tz * d, tx, tz });
      d += spacing;
    }
    carry = d - len;
  }
  return out;
}

/** Shortest distance from (x,z) to a polyline. */
export function distToPath(x: number, z: number, points: THREE.Vector2[]) {
  let best = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const dx = b.x - a.x;
    const dz = b.y - a.y;
    const l2 = dx * dx + dz * dz || 1e-9;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.y) * dz) / l2));
    best = Math.min(best, Math.hypot(x - (a.x + t * dx), z - (a.y + t * dz)));
  }
  return best;
}

/** Turn a curved wall (list of x/z points) into a short list of x/z boxes to bump into. */
export function blockersAlong(pts: { x: number; z: number }[], pad = 0.5, every = 3): Footprint[] {
  const out: Footprint[] = [];
  for (let i = 0; i < pts.length - 1; i += every) {
    const run = pts.slice(i, Math.min(pts.length, i + every + 1));
    out.push({
      minX: Math.min(...run.map((p) => p.x)) - pad,
      maxX: Math.max(...run.map((p) => p.x)) + pad,
      minZ: Math.min(...run.map((p) => p.z)) - pad,
      maxZ: Math.max(...run.map((p) => p.z)) + pad,
    });
  }
  return out;
}

/** A box blocker from a centre and a size. */
export const box = (cx: number, cz: number, w: number, d: number): Footprint => ({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });

// ----------------------------------------------------------------------------
// Counting (for the report)
// ----------------------------------------------------------------------------
export function countStats(root: THREE.Object3D) {
  let tris = 0;
  let meshes = 0;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    meshes++;
    const g = m.geometry;
    const per = g.index ? g.index.count / 3 : g.getAttribute('position').count / 3;
    tris += per * ((m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : 1);
  });
  return { tris: Math.round(tris), meshes };
}
