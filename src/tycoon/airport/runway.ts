// ============================================================================
// runway.ts — 🛬 the runway: a strip of packed dirt, edged with gravel, with a line of fallen leaves down the
// middle (v0.68).
//
// How to read it as an airport AT A GLANCE:  long grey strip + a white dashed-ish centerline + white "piano key"
// bars at both ends + little lights along the sides.
// How to read it as a BACKYARD up close:  the strip is packed dirt, the edge is gravel, the centerline is a row
// of fallen leaves laid end to end, the bars are white petals and the lights are glowing mushrooms.
//
// Size: 140 long (Z) × 18 wide (X) by default = 280 mm × 36 mm. Surface at y = 0.6. Runs from z = -length/2 to +length/2.
// Triangles (default size): ~14,000. Meshes: 9 (slab, scuffs, edging, leaf, vein, petals, mushroom stems+caps...).
// Spots: 'start' (far end, take-off roll begins), 'end' (near end), 'hold' (holding point beside the start end).
// No blockers: you can walk across a runway (but you shouldn't while a bug is landing!).
// ============================================================================
import * as THREE from 'three';
import { PAL, mat, rng } from '../kit';
import { Item, Piece, cached, leafGeometry, pebbleGeometry, roundedSlab, scatter, v3 } from './common';
import { fungusRow, glowTick } from './fungus';

export interface RunwayOpts {
  length?: number;
  width?: number;
  seed?: number;
  /** tiny glowing mushrooms along both edges (default on) */
  lights?: boolean;
  /** little crumbs scuffed over the dirt (default on; v0.69: the airfield keeps its runway clean) */
  scuffs?: boolean;
  /** v0.69: where taxiways join it (local x, z): no edging stones or edge lights there, so each junction is open */
  keepClear?: (x: number, z: number) => boolean;
}
export interface RunwayPiece extends Piece {
  length: number;
  width: number;
}

/** Top of the runway surface. */
export const RUNWAY_TOP = 0.6;

/** Stone colours for edging (shared with the taxiway). */
export const EDGE_COLORS = [0xa29d94, 0xb7a58c, 0x8f8a82, 0xc4b9a4, 0x9a9087, 0xb0a79a];
/** a very cheap 20-triangle crumb for the scuffs on the dirt */
const crumbGeometry = () => cached('crumb', () => new THREE.IcosahedronGeometry(0.5, 0));
export const dirtMat = mat(0x8c8377, { rough: 0.95 });
export const dirtLightMat = mat(0x9b9285, { rough: 0.95 });
const whiteMat = mat(0xffffff, { rough: 0.8 });
const petalMat = mat(0xfff6ea, { rough: 0.55 });
const leafMats = mat(0xffffff, { rough: 0.7 });
const veinMat = mat(0x8a4a1c, { rough: 0.8 });

/**
 * Edging stones along a list of (x,z,ox,oz) spots: each spot is a stone centre.
 * Stones are 1.6–2.8 units across (real gravel is ~2.5 units) and flattened so they sit half-buried.
 */
export function edgingStones(spots: { x: number; z: number }[], r: ReturnType<typeof rng>, topY: number): THREE.Group {
  const g = new THREE.Group();
  // four lumpy variants -> four InstancedMeshes would be 4 draw calls; two is plenty of variety
  const buckets: Item[][] = [[], []];
  for (const p of spots) {
    const d = r.range(1.7, 2.8);
    const b = buckets[r.next() < 0.5 ? 0 : 1];
    b.push({
      x: p.x + r.range(-0.25, 0.25),
      y: topY + d * 0.16,
      z: p.z + r.range(-0.25, 0.25),
      ry: r.range(0, Math.PI),
      sx: d,
      sy: d * r.range(0.45, 0.65),
      sz: d * r.range(0.75, 1.0),
      color: r.pick(EDGE_COLORS),
    });
  }
  g.add(scatter(pebbleGeometry(0), whiteMat, buckets[0], { cast: true }), scatter(pebbleGeometry(2), whiteMat, buckets[1], { cast: true }));
  return g;
}

/**
 * makeRunway({ length = 140, width = 18, seed }) — see the header. Runs along Z, centred on the origin.
 */
export function makeRunway(o: RunwayOpts = {}): RunwayPiece {
  const length = o.length ?? 140;
  const width = o.width ?? 18;
  const r = rng(o.seed ?? 7);
  const root = new THREE.Group();

  // 1) the packed-dirt strip (one rounded slab) + a lighter, slightly narrower "worn" centre
  const slab = new THREE.Mesh(roundedSlab(width + 1.4, length + 1.4, RUNWAY_TOP, 3, 0.18), dirtMat);
  slab.receiveShadow = true;
  slab.castShadow = false;
  root.add(slab);
  const worn = new THREE.Mesh(roundedSlab(width * 0.62, length * 0.97, 0.05, 2, 0.02).translate(0, RUNWAY_TOP - 0.02, 0), dirtLightMat);
  worn.receiveShadow = true;
  root.add(worn);

  // 2) tiny pebbles / crumbs scuffed over the surface so it reads as dirt, not paint
  const crumbs: Item[] = [];
  for (let i = 0; i < (o.scuffs === false ? 0 : Math.round(length * 0.9)); i++) {
    const s = r.range(0.35, 0.8);
    crumbs.push({
      x: r.range(-width / 2 + 1.5, width / 2 - 1.5),
      y: RUNWAY_TOP + s * 0.1,
      z: r.range(-length / 2 + 2, length / 2 - 2),
      ry: r.range(0, 3),
      sx: s * 1.2,
      sy: s * 0.5,
      sz: s,
      color: r.pick([0x7a7167, 0xa89e8f, 0x6d655b, 0xb9ae9d]),
    });
  }
  if (crumbs.length) root.add(scatter(crumbGeometry(), whiteMat, crumbs, { receive: true }));

  // 3) gravel edging along both long sides
  const edge: { x: number; z: number }[] = [];
  for (const side of [-1, 1]) {
    for (let z = -length / 2 + 1; z <= length / 2 - 1; z += 2.4) {
      const x = side * (width / 2 + 0.3);
      if (!o.keepClear?.(x, z)) edge.push({ x, z });
    }
  }
  root.add(edgingStones(edge, r, RUNWAY_TOP - 0.2));

  // 4) the CENTERLINE: fallen leaves laid end to end (leaving room for the threshold bars)
  const margin = 15;
  const span = length - 2 * margin;
  const n = Math.max(1, Math.floor(span / 16));
  const leafLen = span / n - 0.7;
  const leafW = Math.min(4.4, width * 0.26);
  const leaves: Item[] = [];
  const veins: Item[] = [];
  const colors = [0xe6a23c, 0xd9822b, 0xefb94a, 0xd9822b, 0xe39a35];
  for (let i = 0; i < n; i++) {
    const z = -span / 2 + (i + 0.5) * (span / n);
    leaves.push({ x: r.range(-0.12, 0.12), y: RUNWAY_TOP + 0.12, z, ry: r.range(-0.03, 0.03), color: colors[i % colors.length] });
    veins.push({ x: 0, y: RUNWAY_TOP + 0.52, z, sx: 0.16, sy: 0.08, sz: leafLen * 0.82 });
  }
  root.add(scatter(leafGeometry(leafLen, leafW, 0.35, 0.18, [14, 6]), leafMats, leaves, { cast: false }));
  root.add(scatter(new THREE.BoxGeometry(1, 1, 1), veinMat, veins, { receive: false }));

  // 5) THRESHOLD bars at both ends: pale petals standing in for white paint
  const bars: Item[] = [];
  const nBars = Math.max(4, Math.floor((width - 4) / 2));
  for (const end of [-1, 1]) {
    for (let i = 0; i < nBars; i++) {
      const x = (i - (nBars - 1) / 2) * ((width - 4) / (nBars - 1));
      bars.push({ x, y: RUNWAY_TOP + 0.1, z: end * (length / 2 - 5), ry: 0 });
    }
  }
  root.add(scatter(leafGeometry(7, 1.4, 0.3, 0.05, [8, 4]), petalMat, bars, { cast: false }));

  // 6) glowing mushroom edge lights, just outside the gravel
  if (o.lights !== false) {
    const lamps: { x: number; y: number; z: number; s?: number }[] = [];
    for (const side of [-1, 1]) {
      for (let z = -length / 2 + 6; z <= length / 2 - 5; z += 14) {
        const x = side * (width / 2 + 2.2);
        if (!o.keepClear?.(x, z)) lamps.push({ x, y: 0, z });
      }
    }
    root.add(fungusRow(lamps, 1.5, 1.8));
  }

  return {
    root,
    length,
    width,
    blockers: [],
    spots: {
      start: v3(0, RUNWAY_TOP, -length / 2 + 4),
      end: v3(0, RUNWAY_TOP, length / 2 - 4),
      hold: v3(width / 2 + 7, 0, -length / 2 + 10),
    },
    roofs: [],
    update: glowTick,
  };
}
