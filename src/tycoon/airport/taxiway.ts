// ============================================================================
// taxiway.ts — 🚕 a taxiway: a narrower packed-dirt path with gravel edging and a dashed centerline of seeds (v0.68).
//
// You give it the path as a list of (x, z) points (THREE.Vector2: x = world x, y = world z). It lays a dirt
// strip along every segment, rounds every corner with a disc, edges it with gravel (skipping stones that would
// sit inside another part of the path) and drops a pale seed every 5 units for the dashed centerline.
// v0.69: `keepClear(x, z)` says where OTHER paths (or the runway) cross it: no edging stones there (junctions are
// open, like a real airfield), and `noDash(x, z)` where the seed centerline stops (it doesn't run onto the runway).
//
// Size: `width` 7 by default (14 mm: a bee is ~6.5 long, so two ladybugs fit side by side). Surface at y = 0.5.
// Triangles: ~ 450 per segment/corner + ~80 per gravel stone (about 6,500 for a 100-unit path). Meshes: 5.
// Spots: 'start' (first point), 'end' (last point).
// ============================================================================
import * as THREE from 'three';
import { mat, rng } from '../kit';
import { Batch, Item, Piece, capsuleGeometry, distToPath, pathSamples, scatter, v3, cached } from './common';
import { edgingStones } from './runway';

export const TAXIWAY_TOP = 0.5;
const taxiMat = mat(0x978d7f, { rough: 0.95 });
const seedMat = mat(0xf0e0b0, { rough: 0.6 });

export interface TaxiwayOpts {
  /** No edging stone at (x, z): another path or the runway meets this one there. */
  keepClear?: (x: number, z: number) => boolean;
  /** No centerline seed at (x, z) (e.g. on the runway). */
  noDash?: (x: number, z: number) => boolean;
}

export function makeTaxiway(points: THREE.Vector2[], width = 7, seed = 11, opts: TaxiwayOpts = {}): Piece {
  const r = rng(seed);
  const root = new THREE.Group();
  const hw = width / 2;

  // 1) dirt: a box per segment + a round disc at every point (rounds the corners and ends)
  const b = new Batch();
  const disc = cached(`taxi-disc|${hw}`, () => new THREE.CylinderGeometry(hw, hw, TAXIWAY_TOP, 24).translate(0, TAXIWAY_TOP / 2, 0));
  for (const p of points) b.at(disc, taxiMat, p.x, 0, p.y);
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const c = points[i + 1];
    const len = a.distanceTo(c);
    if (len < 1e-4) continue;
    const box = new THREE.BoxGeometry(width, TAXIWAY_TOP, len);
    b.at(box, taxiMat, (a.x + c.x) / 2, TAXIWAY_TOP / 2, (a.y + c.y) / 2, { ry: Math.atan2(c.x - a.x, c.y - a.y) });
  }
  root.add(b.build({ cast: false, receive: true }));

  // 2) gravel edging on both sides, skipping stones that fall on the path itself (inside a bend)
  const edge: { x: number; z: number }[] = [];
  for (const s of pathSamples(points, 2.2)) {
    for (const side of [-1, 1]) {
      const x = s.x + side * s.tz * (hw + 0.2);
      const z = s.z - side * s.tx * (hw + 0.2);
      if (distToPath(x, z, points) >= hw + 0.05 && !opts.keepClear?.(x, z)) edge.push({ x, z });
    }
  }
  root.add(edgingStones(edge, r, TAXIWAY_TOP - 0.2));

  // 3) dashed centerline: pale seeds laid along the path
  const seedGeo = cached('taxi-seed', () => capsuleGeometry(2.4, 0.38, 5).clone().rotateX(Math.PI / 2));
  const dashes: Item[] = pathSamples(points, 5.2, 1.5)
    .filter((s) => !opts.noDash?.(s.x, s.z))
    .map((s) => ({ x: s.x, y: TAXIWAY_TOP + 0.2, z: s.z, ry: Math.atan2(s.tx, s.tz), sy: 0.55 }));
  root.add(scatter(seedGeo, seedMat, dashes, { cast: false }));

  const first = points[0];
  const last = points[points.length - 1];
  return {
    root,
    blockers: [],
    spots: { start: v3(first.x, TAXIWAY_TOP, first.y), end: v3(last.x, TAXIWAY_TOP, last.y) },
    roofs: [],
  };
}
