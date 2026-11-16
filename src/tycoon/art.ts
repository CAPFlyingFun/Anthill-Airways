// ============================================================================
// art.ts — 🎨 the one place the Airport Tycoon gets its procedural art from (v0.68).
//
// The bugs (tycoon/bugs), the plants and ground (tycoon/flora) and the airport pieces (tycoon/airport) are each
// their own module. The game only ever calls the functions below, so a module can be swapped or improved
// without touching the gameplay code (airfield.ts, plane.ts, passengers.ts).
// ============================================================================
import * as THREE from 'three';
import type { CreatureModel } from '../actors/models';
import type { Footprint } from './kit';
import { makeBug, type BugKind } from './bugs';
export type { BugKind } from './bugs';
import { buildBackdrop, buildGround, Lawn, scatter } from './flora';
import { makeBaggageCart, makeControlTower, makeDewTank, makeFuelFlower, makeGate, makeHangar, makeRunway, makeSign, makeTaxiway, makeTerminal, makeWindsock, RUNWAY_TOP, TAXIWAY_TOP } from './airport';
import type { TaxiwayOpts } from './airport/taxiway';

/** How high the runway's and taxiways' surfaces sit (things on them stand on top). */
export const SURFACE = { runway: RUNWAY_TOP, taxiway: TAXIWAY_TOP };

/** A placed piece of the airport: its 3D, walls, named points (local space), roofs (hidden for a cutaway). */
export interface ArtPiece {
  root: THREE.Group;
  blockers: Footprint[];
  spots: Record<string, THREE.Vector3>;
  roofs: THREE.Object3D[];
  update?(dt: number): void;
  /** Fuel flowers: how full of nectar (0..1). */
  setLevel?(v: number): void;
}

/** A bug: a CreatureModel (so animateCreature walks + flaps it) with seats on its back. */
export type ArtBug = CreatureModel & { seats: THREE.Object3D[] };

/** 🐞 A procedural bug (tycoon/bugs): walks + flaps with animateCreature; seats on its back for passengers. */
export function artBug(kind: BugKind, length?: number, opts: { color?: number; seed?: number } = {}): ArtBug {
  return makeBug(kind, { length, color: opts.color, seed: opts.seed });
}

/** 🟫 The ground: bare dirt in the clearings fading into lawn soil (tycoon/flora). */
export function artGround(size: number, clearings: { x: number; z: number; r: number }[]): THREE.Object3D {
  return buildGround({ size, clearings, seed: 7 });
}

export interface ArtLawn {
  root: THREE.Object3D;
  update(dt: number, camera: THREE.Camera, focus?: THREE.Vector3): void;
}
/** 🌱 The lawn: a forest of grass blades 47 units tall around the clearings (`avoid` = keep clear). */
export function artLawn(size: number, avoid: (x: number, z: number) => boolean): ArtLawn {
  return new Lawn({ size, avoid, density: 0.2, seed: 11 });
}

/** 🌄 Far-away giants on the horizon (a hose, a fence, a flower pot with a palm). */
export function artBackdrop(radius: number): THREE.Object3D {
  return buildBackdrop(radius, 5);
}

/** 🪨🍂 Pebbles, fallen leaves, twigs and clover scattered over an area (x/z = its centre). */
export function artScatter(root: THREE.Object3D, what: 'pebbles' | 'leaves' | 'twigs' | 'clover' | 'mushrooms', area: { x: number; z: number; w: number; d: number }, count: number, avoid: (x: number, z: number) => boolean, seed: number) {
  scatter(root, what, area, count, avoid, seed);
}

function piece(): ArtPiece {
  return { root: new THREE.Group(), blockers: [], spots: {}, roofs: [] };
}

/** 🛫 The runway, running along x (the kit builds it along z: it's turned a quarter here). */
/** The runway (along x once placed). `keepClear(x, z)` (relative to its centre) = where taxiways join: left open. */
export function artRunway(length: number, width: number, keepClear?: (x: number, z: number) => boolean): ArtPiece {
  // (its own space runs along z: local (x, z) is (z, -x) here)
  const rw = makeRunway({ length, width, seed: 7, scuffs: false, keepClear: keepClear && ((lx, lz) => keepClear(lz, -lx)) });
  const p = piece();
  rw.root.rotation.y = Math.PI / 2;
  p.root.add(rw.root);
  // (spots turn with it: local (x, z) -> (z, -x))
  for (const [k, v] of Object.entries(rw.spots)) p.spots[k] = new THREE.Vector3(v.z, v.y, -v.x);
  p.update = rw.update?.bind(rw);
  return p;
}

/** A taxiway along `points` (x = world x, y = world z): place it at the origin. */
export function artTaxiway(points: THREE.Vector2[], width: number, opts?: TaxiwayOpts): ArtPiece {
  return makeTaxiway(points, width, 3, opts);
}

/** 🐚 The scallop-shell terminal (mouth toward +z). */
export function artTerminal(): ArtPiece {
  return makeTerminal();
}

/** A gate: the stand ('plane', facing +z), the bridge on its -x side, the waiting spot ('gate'), the bridge's 'door'. */
export function artGate(n = 1): ArtPiece {
  return makeGate({ number: String(n) });
}

/** 🌼 A nectar flower (the fuel pump): setLevel(0..1) shows how full its cup is. */
export function artFuelFlower(): ArtPiece {
  return makeFuelFlower();
}

export function artTower(): ArtPiece {
  return makeControlTower();
}

export function artWindsock(): ArtPiece {
  return makeWindsock();
}

export function artSign(text: string, arrow?: 'left' | 'right' | 'up'): ArtPiece {
  return makeSign(text, { width: 12, height: 4.4, arrow });
}

export function artHangar(): ArtPiece {
  return makeHangar('bottlecap');
}

export function artDewTank(): ArtPiece {
  return makeDewTank();
}

export function artBaggageCart(): ArtPiece {
  return makeBaggageCart();
}
