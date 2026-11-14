// ============================================================================
// neighborhood.ts — 🏘️ THE NEIGHBORHOOD around your backyard (v0.31, step 1 of
// "the street comes alive").
//
// Joshua (2026-11-14): "make the houses and buildings look like buildings on a
// street... a few houses on both sides of one street, near a street corner...
// the people start at random houses and end up in random houses to look full",
// built "with 3D in mind": the game is played top-down (2.5D) AND through your
// own eyes, so a house has to hold up from the sidewalk: a real roof, windows,
// a door, a porch.
//
// What's here:
//   - HOUSES: one small procedural house (walls, a gable roof, a door with a
//     porch, windows, a chimney, a garage door and driveway, a walkway, a
//     mailbox, hedges), in a few colours and sizes. Each house is merged into
//     ONE mesh (vertex colours), so a whole street costs a handful of draw calls.
//   - THE STREETS: the main street past your yard gets a second sidewalk and
//     crosswalks; a side street meets it west of your yard: the street corner.
//   - PEOPLE: `routeIn` / `routeOut` give a customer a walk from a house's front
//     door to a shop and home again (to any house: "to look full"), and a few
//     neighbors are always out for a stroll between two houses.
//
// Not here yet: cars (step 2), and shops as buildings you walk into, with the
// roof off in the top-down view (step 3).
// ============================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { HumanKind } from '../actors/creatures';
import type { CreatureModel } from '../actors/models';
import type { MapArea } from '../ui/minimap';
import { person, stepTo } from './airportWorld';

/** The main street (it runs east-west, south of your yard) and its two sidewalks. */
export const STREET = {
  z: 19.5, width: 9,
  northWalk: 13.6,   // the sidewalk on your side (where the shops' customers come in)
  southWalk: 25.4,   // the sidewalk across the street, along the houses
  minX: -70, maxX: 90,
  /** The side street: it runs north from the main street, west of your yard (the corner). */
  side: { x: -25.5, width: 9, eastWalk: -19.6, westWalk: -31.4, minZ: -70 },
};

interface HouseSpec {
  x: number;
  z: number;
  /** Which way its front door faces: 0 = north (-z), PI = south, PI / 2 = west (-x), -PI / 2 = east (+x). */
  face: number;
  w?: number;
  d?: number;
  h?: number;
  wall: number;
  roof: number;
  door?: number;      // colour
  doorX?: number;     // where the door is along the front (0 = the middle)
  walk?: number;      // length of the walkway from the porch (0 = none)
  garage?: boolean;   // a garage door and a driveway (the cars of step 2 will use them)
}

/** One box, as a piece of a house: its corners coloured, ready to merge. */
export function piece(geo: THREE.BufferGeometry, color: number, x = 0, y = 0, z = 0) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.translate(x, y, z);
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}
export const cube = (w: number, h: number, d: number, color: number, x: number, y: number, z: number) => piece(new THREE.BoxGeometry(w, h, d), color, x, y, z);

export const HOUSE_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82 });
const WHITE = 0xf6f3ea;
const GLASS = 0x6f93b3;

/**
 * A house, as ONE mesh. Built facing north (its front wall at z = -d / 2, the door on it),
 * then turned to `face`. Returns the mesh and, in the world, where its front door is and
 * where its walkway meets the sidewalk.
 */
function buildHouse(spec: HouseSpec) {
  const w = spec.w ?? 9, d = spec.d ?? 7, h = spec.h ?? 4.2;
  const doorX = spec.doorX ?? -1.2;
  const walk = spec.walk ?? 3;
  const front = -d / 2;
  const parts: THREE.BufferGeometry[] = [];
  // Foundation, walls
  parts.push(cube(w + 0.3, 0.3, d + 0.3, 0x9a9a94, 0, 0.15, 0));
  parts.push(cube(w, h, d, spec.wall, 0, 0.3 + h / 2, 0));
  // A gable roof: a triangle pushed along the house, overhanging all round
  const rh = Math.max(2.2, d * 0.36);
  const tri = new THREE.Shape([new THREE.Vector2(-d / 2 - 0.55, 0), new THREE.Vector2(d / 2 + 0.55, 0), new THREE.Vector2(0, rh)]);
  const roof = new THREE.ExtrudeGeometry(tri, { depth: w + 1.0, bevelEnabled: false });
  roof.translate(0, 0, -(w + 1.0) / 2);
  roof.rotateY(Math.PI / 2);
  parts.push(piece(roof, spec.roof, 0, 0.3 + h, 0));
  parts.push(cube(0.9, 1.9, 0.9, 0x8a5a44, w * 0.27, 0.3 + h + rh * 0.62, d * 0.14)); // chimney
  // The front door: a white frame, the door, a knob; a porch slab under a little roof on two posts
  const dy = 0.3;
  parts.push(cube(1.7, 2.55, 0.1, WHITE, doorX, dy + 1.275, front - 0.03));
  parts.push(cube(1.3, 2.3, 0.12, spec.door ?? 0x7a4b2a, doorX, dy + 1.15, front - 0.07));
  parts.push(cube(0.12, 0.12, 0.1, 0xe0c060, doorX + 0.45, dy + 1.15, front - 0.16));
  parts.push(cube(3.0, 0.3, 1.6, 0xb9b4a8, doorX, 0.15, front - 0.8));
  parts.push(cube(3.2, 0.16, 1.8, spec.roof, doorX, dy + 2.95, front - 0.85));
  for (const k of [-1, 1]) parts.push(cube(0.16, 2.7, 0.16, WHITE, doorX + k * 1.35, dy + 1.5, front - 1.5));
  // Windows: along the front (clear of the door and the garage), the back and one on each side
  const garage = spec.garage !== false;
  const gx = doorX < 0 ? w / 2 - 2.0 : -w / 2 + 2.0;
  const win = (x: number, z: number, side = false) => {
    const fw = side ? 0.1 : 1.8, fd = side ? 1.8 : 0.1;
    parts.push(cube(fw, 1.6, fd, WHITE, x, dy + h * 0.56, z));
    parts.push(cube(side ? 0.14 : 1.45, 1.25, side ? 1.45 : 0.14, GLASS, x, dy + h * 0.56, z));
    parts.push(cube(side ? 0.16 : 0.08, 1.25, side ? 0.08 : 0.16, WHITE, x, dy + h * 0.56, z)); // the bar down the middle
    parts.push(cube(side ? 0.3 : 2.0, 0.1, side ? 2.0 : 0.3, WHITE, x, dy + h * 0.56 - 0.85, z)); // the sill
  };
  for (let x = -w / 2 + 1.7; x <= w / 2 - 1.7 + 1e-6; x += 2.6) {
    if (Math.abs(x - doorX) < 1.9) continue;
    if (garage && Math.abs(x - gx) < 2.4) continue;
    win(x, front - 0.02);
  }
  for (let x = -w / 2 + 2; x <= w / 2 - 2 + 1e-6; x += 3.2) win(x, d / 2 + 0.02);
  for (const k of [-1, 1]) win(k * (w / 2 + 0.02), 0.4, true);
  // The garage door (panelled), and its driveway down to the street
  if (garage) {
    parts.push(cube(3.1, 2.5, 0.1, WHITE, gx, dy + 1.25, front - 0.03));
    for (let i = 0; i < 4; i++) parts.push(cube(2.8, 0.5, 0.12, 0xd9d6cc, gx, dy + 0.34 + i * 0.58, front - 0.06));
    if (walk > 0) parts.push(cube(3.2, 0.05, walk + 1.4, 0x8d9096, gx, 0.03, front - (walk + 1.4) / 2));
  }
  // The walkway from the porch to the sidewalk, a mailbox by it, and hedges under the windows
  if (walk > 0) {
    parts.push(cube(1.3, 0.05, walk, 0xcfc8ba, doorX, 0.03, front - 1.6 - walk / 2));
    parts.push(cube(0.1, 1.0, 0.1, 0x5a5f66, doorX - 1.0, 0.5, front - 1.4 - walk));
    parts.push(cube(0.34, 0.26, 0.5, 0xc0392b, doorX - 1.0, 1.1, front - 1.4 - walk));
  }
  for (const k of [-1, 1]) {
    const hx = k * (w / 2 - 1.3);
    if (Math.abs(hx - doorX) < 2.2 || (garage && Math.abs(hx - gx) < 2.2)) continue;
    const bush = new THREE.SphereGeometry(0.7, 10, 7);
    bush.scale(1.5, 0.8, 0.9);
    parts.push(piece(bush, 0x3f8f3a, hx, 0.5, front - 0.7));
  }
  const geo = mergeGeometries(parts, false)!;
  const mesh = new THREE.Mesh(geo, HOUSE_MAT);
  mesh.position.set(spec.x, 0, spec.z);
  mesh.rotation.y = spec.face;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  // (the door and the end of the walkway, in the world)
  const at = (lx: number, lz: number) => new THREE.Vector3(lx, 0, lz).applyAxisAngle(new THREE.Vector3(0, 1, 0), spec.face).add(new THREE.Vector3(spec.x, 0, spec.z));
  return { mesh, door: at(doorX, front - 0.5), gate: at(doorX, front - 1.6 - walk), w, d };
}

interface House { door: THREE.Vector3; gate: THREE.Vector3; rect: { minX: number; maxX: number; minZ: number; maxZ: number }; wall: number; row: 'south' | 'west' | 'north' }
interface Stroller { model: CreatureModel; path: THREE.Vector3[] }

const WALLS = [0xf4a261, 0x8ecae6, 0xe9c46a, 0xb5e48c, 0xcdb4db, 0xf1e3c8, 0xe5989b, 0xa8dadc];
const ROOFS = [0x6d4c41, 0x4a4e69, 0x7f5539, 0x3d405b, 0x8d5b4c];
const DOORS = [0x7a4b2a, 0x2a6f97, 0xb23a48, 0x386641, 0x3d405b];
const STROLLERS: HumanKind[] = ['h-sarah', 'h-director', 'h-exec', 'h-balance', 'h-ember', 'h-crew1', 'h-crew2', 'h-crew3', 'h-crew4'];
/** Where people cross the main street: at each shop's way in (the stand, the café, the store) and at the corner. */
const CROSSINGS = [-19.6, 13.8, 33, 54];

export class Neighborhood {
  houses: House[] = [];
  private strollers: Stroller[] = [];
  private nextStroll = 2;

  constructor(private scene: THREE.Scene) {
    const flat = (w: number, d: number, color: number, x: number, z: number, y: number) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ color, roughness: 0.95 }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, y, z);
      m.receiveShadow = true;
      scene.add(m);
    };
    const S = STREET, V = S.side;
    const len = S.maxX - S.minX, midX = (S.minX + S.maxX) / 2;
    // The main street, its two sidewalks and the dashes down its middle
    flat(len, 2.6, 0xc9c5bd, midX, S.northWalk, 0.005);
    flat(len, 2.6, 0xc9c5bd, midX, S.southWalk, 0.005);
    flat(len, S.width, 0x4a4f55, midX, S.z, 0.004);
    const dashes = new THREE.InstancedMesh(new THREE.PlaneGeometry(3, 0.3), new THREE.MeshStandardMaterial({ color: 0xf2d25a, roughness: 0.9 }), 64);
    const m4 = new THREE.Matrix4();
    const lay = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
    let n = 0;
    for (let x = S.minX + 4; x <= S.maxX - 4; x += 7) dashes.setMatrixAt(n++, m4.makeTranslation(x, 0.008, S.z).multiply(lay));
    // The side street north from the corner, with its own sidewalks and dashes
    const vLen = S.z - S.width / 2 - V.minZ, vMid = (S.z - S.width / 2 + V.minZ) / 2;
    flat(V.width, vLen, 0x4a4f55, V.x, vMid, 0.004);
    flat(2.6, vLen - 5.2, 0xc9c5bd, V.eastWalk, vMid - 2.6, 0.005);
    flat(2.6, vLen - 5.2, 0xc9c5bd, V.westWalk, vMid - 2.6, 0.005);
    const turn = new THREE.Matrix4().makeRotationY(Math.PI / 2);
    for (let z = V.minZ + 4; z <= S.z - S.width / 2 - 6; z += 7) dashes.setMatrixAt(n++, m4.makeTranslation(V.x, 0.008, z).multiply(turn).multiply(lay));
    dashes.count = n;
    scene.add(dashes);
    // Crosswalks: white bars across the main street where people cross
    const bars = new THREE.InstancedMesh(new THREE.PlaneGeometry(2.6, 0.6), new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.9 }), CROSSINGS.length * 7);
    n = 0;
    for (const cx of CROSSINGS) for (let i = 0; i < 7; i++) bars.setMatrixAt(n++, m4.makeTranslation(cx, 0.009, S.z - 3.6 + i * 1.2).multiply(lay));
    scene.add(bars);

    // 🏠 The houses across the street, facing it (north)...
    let k = 0;
    const add = (spec: HouseSpec, row: House['row']) => {
      const b = buildHouse(spec);
      scene.add(b.mesh);
      const sideways = Math.abs(Math.sin(spec.face)) > 0.5;
      const hw = (sideways ? b.d : b.w) / 2, hd = (sideways ? b.w : b.d) / 2;
      this.houses.push({ door: b.door, gate: b.gate, rect: { minX: spec.x - hw, maxX: spec.x + hw, minZ: spec.z - hd, maxZ: spec.z + hd }, wall: spec.wall, row });
    };
    const look = (i: number) => ({ wall: WALLS[i % WALLS.length], roof: ROOFS[i % ROOFS.length], door: DOORS[i % DOORS.length] });
    for (let x = -62; x <= 82; x += 16) {
      const big = k % 3 === 1;
      add({ x, z: 33 + (big ? 0.5 : 0), face: 0, w: big ? 11 : 9, d: big ? 8 : 7, h: big ? 4.8 : 4.2, doorX: k % 2 ? 1.2 : -1.2, walk: big ? 2.5 : 3, ...look(k) }, 'south');
      k++;
    }
    // ...the houses up the side street, facing each other across it...
    for (const z of [-4, -22, -40]) {
      add({ x: -41, z, face: -Math.PI / 2, doorX: k % 2 ? 1.2 : -1.2, walk: 3.6, ...look(k + 2) }, 'west');
      k++;
    }
    // ...and trees along the streets
    for (const [tx, tz] of [[-54, 28], [-22, 28.5], [10, 28.5], [42, 28.5], [74, 28], [-34, -13], [-34, -31], [-34, 9]] as [number, number][]) {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 2.6, 8), new THREE.MeshStandardMaterial({ color: 0x7a4b2a, roughness: 0.9 }));
      trunk.position.set(tx, 1.3, tz);
      const crown = new THREE.Mesh(new THREE.SphereGeometry(1.7, 12, 9), new THREE.MeshStandardMaterial({ color: 0x4f9a35, roughness: 0.85 }));
      crown.position.set(tx, 3.6, tz);
      crown.castShadow = trunk.castShadow = true;
      scene.add(trunk, crown);
    }
  }

  /** Your own house (north of the yard): the same kind of house, bigger, its back door onto the deck. */
  static yourHouse(scene: THREE.Scene) {
    const b = buildHouse({ x: -5, z: -17, face: Math.PI, w: 20, d: 8, h: 6.2, wall: 0xf1e3c8, roof: 0x8d5b4c, door: 0x7a4b2a, doorX: -6.5, walk: 0, garage: false });
    scene.add(b.mesh);
  }

  /** A house on the main street within reach of a crossing at `cx` (so the walk isn't long). */
  private near(cx: number) {
    const row = this.houses.filter((h) => h.row === 'south' && Math.abs(h.door.x - cx) < 20);
    return row[Math.floor(Math.random() * row.length)] ?? this.houses[0];
  }

  /** A customer's way IN: out of a front door, along the sidewalk, over the crosswalk at `cx`, then `rest`. */
  routeIn(cx: number, rest: THREE.Vector3[], quick = false) {
    // (quick: already at the crosswalk. Your very first neighbors, so the opening doesn't wait on a long walk)
    if (quick) return [new THREE.Vector3(cx, 0, STREET.southWalk), new THREE.Vector3(cx, 0, STREET.northWalk), ...rest];
    const h = this.near(cx);
    return [h.door.clone(), h.gate.clone(), new THREE.Vector3(cx, 0, STREET.southWalk), new THREE.Vector3(cx, 0, STREET.northWalk), ...rest];
  }

  /** ...and the way HOME: back over the crosswalk, to a house (not always the one they came from), and in. */
  routeOut(cx: number, first: THREE.Vector3[]) {
    const h = this.near(cx);
    return [...first, new THREE.Vector3(cx, 0, STREET.northWalk), new THREE.Vector3(cx, 0, STREET.southWalk), h.gate.clone(), h.door.clone()];
  }

  /** A few neighbors out for a stroll, from one house to another (some cross to your side and back). */
  update(dt: number) {
    this.nextStroll -= dt;
    if (this.nextStroll <= 0 && this.strollers.length < 3) {
      this.nextStroll = 5 + Math.random() * 6;
      const south = this.houses.filter((h) => h.row === 'south' && h.door.x > -40 && h.door.x < 75);
      const a = south[Math.floor(Math.random() * south.length)];
      let b = south[Math.floor(Math.random() * south.length)];
      if (b === a) b = south[(south.indexOf(a) + 1) % south.length];
      const path = [a.gate.clone()];
      if (Math.random() < 0.5) {
        // (over to your side of the street, along it, and back)
        const lo = Math.min(a.gate.x, b.gate.x), hi = Math.max(a.gate.x, b.gate.x);
        const between = CROSSINGS.filter((c) => c >= lo - 12 && c <= hi + 12);
        const c1 = between[Math.floor(Math.random() * between.length)] ?? CROSSINGS[1];
        const c2 = between[Math.floor(Math.random() * between.length)] ?? CROSSINGS[2];
        if (c1 !== c2) {
          path.push(new THREE.Vector3(c1, 0, STREET.southWalk), new THREE.Vector3(c1, 0, STREET.northWalk + 0.6), new THREE.Vector3(c2, 0, STREET.northWalk + 0.6), new THREE.Vector3(c2, 0, STREET.southWalk));
        }
      }
      path.push(b.gate.clone(), b.door.clone());
      const model = person(STROLLERS[Math.floor(Math.random() * STROLLERS.length)]);
      model.root.position.copy(a.door);
      this.scene.add(model.root);
      this.strollers.push({ model, path });
    }
    for (let i = this.strollers.length - 1; i >= 0; i--) {
      const s = this.strollers[i];
      if (!stepTo(s.model, s.path[0], 3.0, dt)) continue;
      s.path.shift();
      if (s.path.length) continue;
      s.model.root.removeFromParent(); // (home: through the front door)
      this.strollers.splice(i, 1);
    }
  }

  /** Where the strollers are right now (the street's cars brake for them). */
  walkers(out: THREE.Vector3[]) {
    for (const s of this.strollers) out.push(s.model.root.position);
  }

  /** 🗺️ For the minimap: the streets, the sidewalks and the houses. */
  mapAreas(): MapArea[] {
    const S = STREET, V = S.side;
    const top = S.z - S.width / 2;
    const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
    return [
      { rect: { minX: S.minX, maxX: S.maxX, minZ: S.northWalk - 1.3, maxZ: S.southWalk + 1.3 }, fill: '#c9c5bd' },
      { rect: { minX: S.minX, maxX: S.maxX, minZ: top, maxZ: S.z + S.width / 2 }, fill: '#4a4f55' },
      { rect: { minX: V.westWalk - 1.3, maxX: V.eastWalk + 1.3, minZ: V.minZ, maxZ: top }, fill: '#c9c5bd' },
      { rect: { minX: V.x - V.width / 2, maxX: V.x + V.width / 2, minZ: V.minZ, maxZ: top + 0.1 }, fill: '#4a4f55' },
      ...this.houses.map((h) => ({ rect: h.rect, fill: hex(h.wall), edge: 'rgba(60, 45, 35, 0.7)' })),
    ];
  }
}
