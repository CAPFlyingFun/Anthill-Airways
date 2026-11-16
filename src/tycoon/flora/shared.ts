// ============================================================================
// shared.ts — 🌱 small helpers every flora file uses (v0.68).
//
//   * noise    : a smooth seeded "value noise" so pebbles, dirt and leaves look natural, not perfect
//   * colour   : paint a whole geometry, or each vertex, so a plant can be ONE mesh with many colours
//   * merge    : glue many little pieces (petals, stem, leaves...) into ONE geometry = ONE draw call
//   * tube     : a bendy, tapering tube (stems, twigs, hoses, palm trunks)
//   * vcMat    : the shared "vertex colour" material that all those merged plants use
//
// Why merge? A daisy is a stem + 14 petals + a centre. If each piece were its own mesh the phone would
// draw 16 things per daisy. Merged, it draws ONE. The colours live in the vertices instead of the material.
// ============================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// ---------------------------------------------------------------------------
// NOISE
// ---------------------------------------------------------------------------
/** A repeatable pseudo-random number from two integers (0..1). */
export function hash2(x: number, y: number, seed = 0): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Smooth value noise (0..1): blobby, changes slowly. `period` > 0 makes it tile every `period` cells. */
export function vnoise(x: number, y: number, seed = 0, period = 0): number {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const w = (v: number) => (period > 0 ? ((v % period) + period) % period : v);
  const a = hash2(w(x0), w(y0), seed), b = hash2(w(x0 + 1), w(y0), seed);
  const c = hash2(w(x0), w(y0 + 1), seed), d = hash2(w(x0 + 1), w(y0 + 1), seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** Layers of noise (fine detail on top of coarse shape), 0..1. */
export function fbm(x: number, y: number, seed = 0, octaves = 4): number {
  let sum = 0, amp = 0.5, f = 1, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += vnoise(x * f, y * f, seed + i * 17) * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}

/** A cheap 3D noise for bumpy stones: sums a few sines at odd angles. About -1..1. */
export function noise3(x: number, y: number, z: number, seed: number): number {
  const s = seed * 1.713;
  return (
    Math.sin(x * 1.9 + s) * Math.cos(y * 2.3 - s * 0.7) * 0.5 +
    Math.sin(y * 3.1 + z * 2.7 + s * 1.3) * 0.3 +
    Math.sin(z * 4.3 - x * 3.7 + s * 2.1) * 0.2
  );
}

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

// ---------------------------------------------------------------------------
// COLOUR + MERGING
// ---------------------------------------------------------------------------
const _c = new THREE.Color();

/**
 * Turn any geometry into a "colourable" one: non-indexed, with only position + normal + color.
 * (mergeGeometries needs every piece to have exactly the same attributes.)
 */
export function plain(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  g.deleteAttribute('uv');
  g.deleteAttribute('uv1');
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  return g;
}

/** Paint every vertex of a geometry one colour (`jitter` = a little brightness wobble so it isn't flat). */
export function paint(geo: THREE.BufferGeometry, hex: number, jitter = 0): THREE.BufferGeometry {
  const g = plain(geo);
  const p = g.getAttribute('position');
  const arr = new Float32Array(p.count * 3);
  _c.set(hex);
  for (let i = 0; i < p.count; i++) {
    const k = jitter ? 1 + (hash2(Math.round(p.getX(i) * 40), Math.round(p.getY(i) * 40) + Math.round(p.getZ(i) * 90), 5) - 0.5) * 2 * jitter : 1;
    arr[i * 3] = _c.r * k;
    arr[i * 3 + 1] = _c.g * k;
    arr[i * 3 + 2] = _c.b * k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

/** Paint each vertex with a function of its position + normal (for gradients: dark base -> bright tip). */
export function colorize(geo: THREE.BufferGeometry, fn: (x: number, y: number, z: number, nx: number, ny: number, nz: number) => THREE.Color): THREE.BufferGeometry {
  const g = plain(geo);
  const p = g.getAttribute('position');
  const n = g.getAttribute('normal');
  const arr = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const c = fn(p.getX(i), p.getY(i), p.getZ(i), n.getX(i), n.getY(i), n.getZ(i));
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

/** Glue painted pieces into ONE geometry. */
export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(parts, false);
  if (!g) throw new Error('flora: merge failed (pieces must share the same attributes)');
  g.computeBoundingSphere();
  g.computeBoundingBox();
  parts.forEach((x) => x.dispose());
  return g;
}

/** Move / turn / resize a geometry in place (position, euler rotation XYZ, scale). Returns it. */
export function xf(geo: THREE.BufferGeometry, p: [number, number, number] = [0, 0, 0], r: [number, number, number] = [0, 0, 0], s: number | [number, number, number] = 1): THREE.BufferGeometry {
  const sc = typeof s === 'number' ? ([s, s, s] as [number, number, number]) : s;
  const m = new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), new THREE.Vector3(...sc));
  geo.applyMatrix4(m);
  return geo;
}

/** Lift a geometry so its lowest point sits at y = `sink` (slightly negative = pressed into the ground). */
export function grounded(geo: THREE.BufferGeometry, sink = 0): THREE.BufferGeometry {
  geo.computeBoundingBox();
  geo.translate(0, -geo.boundingBox!.min.y + sink, 0);
  return geo;
}

// ---------------------------------------------------------------------------
// SHARED MATERIALS (never changed after creation, so they batch)
// ---------------------------------------------------------------------------
const vcCache = new Map<string, THREE.MeshStandardMaterial>();
/** The one "vertex colours" material: a plant's colours come from its vertices. */
export function vcMat(o: { rough?: number; side?: THREE.Side; emissive?: number; emissiveIntensity?: number; flat?: boolean } = {}): THREE.MeshStandardMaterial {
  const key = `${o.rough ?? 0.75}|${o.side ?? 0}|${o.emissive ?? 0}|${o.emissiveIntensity ?? 1}|${o.flat ? 1 : 0}`;
  let m = vcCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: o.rough ?? 0.75,
      metalness: 0,
      side: o.side ?? THREE.FrontSide,
      emissive: o.emissive ?? 0,
      emissiveIntensity: o.emissiveIntensity ?? 1,
      flatShading: !!o.flat,
    });
    vcCache.set(key, m);
  }
  return m;
}

/** A mesh with shadows on (props are small, so they're worth it). */
export function propMesh(geo: THREE.BufferGeometry, material: THREE.Material, cast = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, material);
  m.castShadow = cast;
  m.receiveShadow = true;
  return m;
}

// ---------------------------------------------------------------------------
// TUBE: a bendy tube with a changing radius (stems, twigs, trunks, hose)
// ---------------------------------------------------------------------------
/**
 * Sweep a ring along a path. `radius(t)` gives the thickness at t = 0..1 along it.
 * Both ends are closed. Returns an indexed geometry with smooth normals (call paint() on it after).
 */
export function tube(path: THREE.Vector3[], radius: (t: number) => number, radial = 6): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(path, false, 'centripetal');
  const rings = Math.max(path.length * 2, 4);
  const frames = curve.computeFrenetFrames(rings, false);
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    const c = curve.getPointAt(t);
    const r = radius(t);
    const N = frames.normals[i], B = frames.binormals[i];
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const cx = Math.cos(a) * r, cy = Math.sin(a) * r;
      pos.push(c.x + N.x * cx + B.x * cy, c.y + N.y * cx + B.y * cy, c.z + N.z * cx + B.z * cy);
    }
  }
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * radial + j, b = i * radial + ((j + 1) % radial);
      const c2 = (i + 1) * radial + j, d = (i + 1) * radial + ((j + 1) % radial);
      idx.push(a, c2, b, b, c2, d);
    }
  }
  // end caps: one centre vertex each
  const s = curve.getPointAt(0), e = curve.getPointAt(1);
  const si = pos.length / 3;
  pos.push(s.x, s.y, s.z);
  const ei = si + 1;
  pos.push(e.x, e.y, e.z);
  for (let j = 0; j < radial; j++) {
    const j2 = (j + 1) % radial;
    idx.push(si, j, j2);
    idx.push(ei, rings * radial + j2, rings * radial + j);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A straight tapered stem from `a` to `b` (r0 at the start, r1 at the end), a little curved by `bow`. */
export function stem(a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, bow = 0, radial = 5): THREE.BufferGeometry {
  const mid = a.clone().lerp(b, 0.5);
  const dir = b.clone().sub(a);
  const side = new THREE.Vector3(-dir.z, 0, dir.x).normalize().multiplyScalar(bow);
  mid.add(side);
  const q1 = a.clone().lerp(mid, 0.5), q2 = mid.clone().lerp(b, 0.5);
  return tube([a, q1, mid, q2, b], (t) => r0 + (r1 - r0) * t, radial);
}

/** A seeded random with ranges, imported lazily by props (re-exported so files only import shared). */
export { rng } from '../kit';
