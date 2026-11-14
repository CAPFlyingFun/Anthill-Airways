// ============================================================================
// traffic.ts — 🚗 CARS on the street (v0.31, step 2 of "the street comes alive").
//
// Joshua (2026-11-14): "simple procedural cars" in the style of Mini Motorways:
// cars travel along the street, and some shop customers arrive by car instead
// of walking ("some hidden in cars/trucks"), so fewer walking people are drawn.
//
// What's here:
//   - THE VEHICLES: a car, a van and a delivery truck, in eight colours. Each is
//     ONE merged mesh with vertex colours (wheels included), the same trick as
//     the houses, and each shape + colour is built once and shared.
//   - THE ROADS they follow: every vehicle follows a ROUTE, a line of points
//     drawn once (the two lanes of the main street, and four ways round the
//     corner). We drive on the right.
//   - THROUGH-TRAFFIC: a few vehicles always passing by; some turn at the corner.
//   - RIDES: `arrive(x, side)` sends a vehicle that pulls over at the curb near
//     `x`, tells you when it has parked, and drives away when you say `leaveIn`.
//   - MANNERS: vehicles keep a gap, ease in and out of speed, wait their turn at
//     the corner, wait for a gap before pulling out, and brake for people.
//
// How a vehicle "sees": it looks at a row of points along its own route, from
// its nose forward. If a point lands on another vehicle (or near a person on the
// road), that is how much room it has, and it slows down to stop short of it.
// As a last safety net, a vehicle never takes a step that would make it overlap
// another one (it just waits that frame).
// ============================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { pace } from '../core/pace';
import { STREET, cube, piece } from './neighborhood';

export type VehicleKind = 'car' | 'van' | 'truck';

export interface Ride {
  readonly state: 'coming' | 'parked' | 'leaving' | 'gone';
  /** Where a person stands on the sidewalk beside the parked vehicle (set once it knows its parking spot, i.e. from the start). */
  readonly curb: THREE.Vector3;
  /** Drive away `seconds` from now (0 = now). Until this is called a parked ride stays parked. (Called early, it still parks first.) */
  leaveIn(seconds: number): void;
}

// ---------------------------------------------------------------------------
// The numbers of the road (all taken from STREET, so they move with the street)
// ---------------------------------------------------------------------------
const LANE = 1.2;                                   // a lane's middle, from the middle of the street
const E_Z = STREET.z + LANE;                        // eastbound lane (the south one): we drive on the right
const W_Z = STREET.z - LANE;                        // westbound lane (the north one)
const S_X = STREET.side.x - LANE;                   // side street, southbound (the west lane)
const N_X = STREET.side.x + LANE;                   // side street, northbound
const ROAD_N = STREET.z - STREET.width / 2;         // the north curb of the main street (z 15)
const ROAD_S = STREET.z + STREET.width / 2;         // the south curb (z 24)
const SIDE_W = STREET.side.x - STREET.side.width / 2;
const SIDE_E = STREET.side.x + STREET.side.width / 2;
const MIN_X = STREET.minX, MAX_X = STREET.maxX, MIN_Z = STREET.side.minZ;
/** Where the turns start and end: this far back from the edge of the street being joined. */
const TURN_IN = 1.2;
const R_RIGHT = W_Z - (ROAD_N - TURN_IN);           // a right turn is tight (4.5)...
const R_LEFT = E_Z - (ROAD_N - TURN_IN);            // ...a left turn swings wide, across the other lane (6.9)
/** Where people cross the main street (the same places as the crosswalks in neighborhood.ts). Nobody parks on them. */
const CROSSWALKS = [-19.6, 13.8, 33, 54];

const CRUISE = 7;        // units per second
const TURN_SPEED = 3.8;  // round the corner
const ACCEL = 3.5;       // pulling away
const BRAKE = 5;         // a comfortable stop (the speed limits below are worked out from this)
const PARK_BRAKE = 3;    // easing up to the curb is gentler still
const BRAKE_HARD = 16;   // an emergency stop (somebody stepped out)
const MIN_GAP = 1.5;     // room left behind the vehicle ahead when stopped
const LOOK = 11;         // how far past its nose a vehicle looks
const LOOK_STEP = 0.5;
const SLIDE = 4.5;       // pulling in to (or out from) the curb takes this much forward travel
const SLIDE_YAW = 0.45;  // how much of that slide shows as the nose turning in (0 = a pure sideways slide)
const PARK_GAP = 3.3;    // room between two parked vehicles (so the next one can slide in and out past them)
const PARK_MIN = MIN_X + 12, PARK_MAX = MAX_X - 12; // (room at each end of the street to pull in and out)

// ---------------------------------------------------------------------------
// Routes: lines of points a vehicle follows
// ---------------------------------------------------------------------------
/** A place on a path: the point, and which way the path runs there. */
interface Sample { x: number; z: number; dx: number; dz: number }

/** A line of points with the distance along it worked out, so "12.5 units along" can be looked up. */
class Path {
  private xs: number[] = [];
  private zs: number[] = [];
  private cum: number[] = [];   // distance from the start to each point
  private dxs: number[] = [];   // the direction of each stretch between two points
  private dzs: number[] = [];
  length = 0;

  to(x: number, z: number) {
    const n = this.xs.length;
    if (n > 0) {
      const dx = x - this.xs[n - 1], dz = z - this.zs[n - 1];
      const d = Math.hypot(dx, dz);
      this.length += d;
      this.dxs.push(dx / d);
      this.dzs.push(dz / d);
    }
    this.xs.push(x);
    this.zs.push(z);
    this.cum.push(this.length);
    return this;
  }

  /** A quarter circle round (cx, cz), from angle a0 to a1 (the path must already be at its start). */
  arc(cx: number, cz: number, r: number, a0: number, a1: number, steps = 16) {
    for (let i = 1; i <= steps; i++) {
      const a = a0 + ((a1 - a0) * i) / steps;
      this.to(cx + r * Math.cos(a), cz + r * Math.sin(a));
    }
    return this;
  }

  /** The point `s` units along (written into `out`: nothing is created). */
  at(s: number, out: Sample) {
    const cum = this.cum;
    if (s < 0) s = 0;
    else if (s > this.length) s = this.length;
    let lo = 0, hi = cum.length - 2;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (cum[mid] <= s) lo = mid;
      else hi = mid - 1;
    }
    const t = s - cum[lo];
    out.dx = this.dxs[lo];
    out.dz = this.dzs[lo];
    out.x = this.xs[lo] + out.dx * t;
    out.z = this.zs[lo] + out.dz * t;
  }
}

/** A turn at the corner, as distances along its route. */
interface Turn {
  hold: number;      // the vehicle's NOSE waits here until the corner is free
  arc0: number;      // the turn starts...
  arc1: number;      // ...and ends
  yieldW: boolean;   // gives way to westbound traffic on the main street
  yieldE: boolean;   // gives way to eastbound traffic
}
interface Route { path: Path; turn: Turn | null }

const HALF_PI = Math.PI / 2;
const turnZ = ROAD_N - TURN_IN;       // side street end of every turn (z 13.8)
const turnW = SIDE_W - TURN_IN;       // main street, west end of the turns (x -31.2)
const turnE = SIDE_E + TURN_IN;       // main street, east end of the turns (x -19.8)

function turning(build: (p: Path) => void, finish: (p: Path) => void, holdBack: number, yieldW: boolean, yieldE: boolean): Route {
  const path = new Path();
  build(path);
  const arc0 = path.length;
  const turn: Turn = { hold: arc0 - holdBack, arc0, arc1: 0, yieldW, yieldE };
  finish(path);
  return { path, turn };
}

/** The two lanes of the main street, end to end. */
const MAIN_E: Route = { path: new Path().to(MIN_X, E_Z).to(MAX_X, E_Z), turn: null };
const MAIN_W: Route = { path: new Path().to(MAX_X, W_Z).to(MIN_X, W_Z), turn: null };
/** Down the side street and RIGHT onto the main street (heading west). */
const SIDE_TO_W = turning(
  (p) => p.to(S_X, MIN_Z).to(S_X, turnZ),
  (p) => p.arc(turnW, turnZ, R_RIGHT, 0, HALF_PI),
  2, true, false,
);
/** Down the side street and LEFT onto the main street (heading east), across the westbound lane. */
const SIDE_TO_E = turning(
  (p) => p.to(S_X, MIN_Z).to(S_X, turnZ),
  (p) => p.arc(turnE, turnZ, R_LEFT, Math.PI, HALF_PI),
  2, true, true,
);
/** Eastbound on the main street and LEFT up the side street, across the westbound lane. */
const E_TO_SIDE = turning(
  (p) => p.to(MIN_X, E_Z).to(turnW, E_Z),
  (p) => p.arc(turnW, turnZ, R_LEFT, HALF_PI, 0),
  2, true, false,
);
/** Westbound on the main street and RIGHT up the side street (it waits before the crosswalk, not on it). */
const W_TO_SIDE = turning(
  (p) => p.to(MAX_X, W_Z).to(turnE, W_Z),
  (p) => p.arc(turnE, turnZ, R_RIGHT, HALF_PI, Math.PI),
  1.9, false, false,
);
for (const r of [SIDE_TO_W, SIDE_TO_E, E_TO_SIDE, W_TO_SIDE]) r.turn!.arc1 = r.path.length;
SIDE_TO_W.path.to(MIN_X, W_Z);
SIDE_TO_E.path.to(MAX_X, E_Z);
E_TO_SIDE.path.to(N_X, MIN_Z);
W_TO_SIDE.path.to(N_X, MIN_Z);
const TURN_ROUTES = [SIDE_TO_W, SIDE_TO_E, E_TO_SIDE, W_TO_SIDE];
/** Where main-street traffic waits (its nose) while somebody is turning across its lane: short of the corner (and of the crosswalk beside it). */
const STOP_W = turnE + 2.3;   // westbound traffic
const STOP_E = turnW - 1.8;   // eastbound traffic

// ---------------------------------------------------------------------------
// The vehicles: three shapes, eight colours, each ONE mesh
// ---------------------------------------------------------------------------
/** Body colours: red, blue, yellow, green, cream, teal, orange, plum. */
const PALETTE = [0xd9483b, 0x3a7bd5, 0xf2c14e, 0x4caf6e, 0xf4f1ea, 0x2a9d8f, 0xf08a3c, 0x7d5ba6];
const DARK = 0x33363b;     // bumpers, the truck's frame
const TIRE = 0x1f2125;
const HUB = 0xc9ccd1;
const WINDOW = 0x25313d;   // dark glass
const LAMP = 0xfffbe0;     // headlights
const TAIL = 0xd23b2e;     // tail lights
const BOX = 0xf3efe4;      // the truck's box

/** Length and width (what the driving code uses to keep vehicles apart) and cruising speed. */
const SIZE: Record<VehicleKind, { len: number; wid: number; speed: number }> = {
  car: { len: 4.2, wid: 1.9, speed: CRUISE },
  van: { len: 5.0, wid: 1.95, speed: CRUISE * 0.95 },
  truck: { len: 6.5, wid: 2.0, speed: CRUISE * 0.88 },
};

/** Shinier than the houses: painted metal. One material for every vehicle. */
const CAR_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.15 });

/** A wheel (it lies on its side: the axle runs across the vehicle) with a hubcap on the outside. */
function wheel(parts: THREE.BufferGeometry[], r: number, x: number, side: number, halfWidth: number) {
  const w = 0.3;
  const z = side * (halfWidth - w / 2 - 0.02); // (the bodies are a little narrower than this, so the wheels stand proud of them and show)
  const tire = new THREE.CylinderGeometry(r, r, w, 14);
  tire.rotateX(HALF_PI);
  parts.push(piece(tire, TIRE, x, r, z));
  const hub = new THREE.CylinderGeometry(r * 0.52, r * 0.52, 0.04, 10);
  hub.rotateX(HALF_PI);
  parts.push(piece(hub, HUB, x, r, z + side * (w / 2)));
}

/** A shape drawn from the side (x = along the vehicle, y = up) and pushed across its width: for sloped glass. */
function slab(profile: [number, number][], width: number, color: number) {
  const shape = new THREE.Shape(profile.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false });
  return piece(g, color, 0, 0, -width / 2);
}

/** Headlights at the front and tail lights at the back. */
function lights(parts: THREE.BufferGeometry[], front: number, back: number, y: number, z: number, backY = y) {
  for (const k of [-1, 1]) {
    parts.push(cube(0.08, 0.17, 0.36, LAMP, front, y, k * z));
    parts.push(cube(0.08, 0.16, 0.4, TAIL, back, backY, k * z));
  }
}

/** Built facing +x (east), standing on the ground at y = 0, its middle at the origin. */
function buildVehicle(kind: VehicleKind, color: number) {
  const parts: THREE.BufferGeometry[] = [];
  const hw = SIZE[kind].wid / 2;
  if (kind === 'car') {
    // The body, a bumper at each end, a cabin of dark glass with a sloped windscreen, and the roof on top
    parts.push(cube(4.0, 0.62, 1.78, color, 0, 0.59, 0));
    for (const k of [-1, 1]) parts.push(cube(0.14, 0.24, 1.84, DARK, k * 2.03, 0.42, 0));
    parts.push(slab([[-1.5, 0.9], [0.9, 0.9], [0.4, 1.44], [-1.2, 1.44]], 1.6, WINDOW));
    parts.push(cube(1.55, 0.07, 1.54, color, -0.4, 1.47, 0));
    parts.push(cube(0.13, 0.55, 1.62, color, -0.35, 1.17, 0)); // the pillar between the doors
    lights(parts, 2.0, -2.0, 0.72, 0.6);
    for (const x of [1.3, -1.3]) for (const k of [-1, 1]) wheel(parts, 0.36, x, k, hw);
  } else if (kind === 'van') {
    // A tall box: the load space behind (with a side window and a back window), the cab's glass in front
    parts.push(cube(4.8, 0.8, 1.83, color, 0, 0.7, 0));
    for (const k of [-1, 1]) parts.push(cube(0.12, 0.26, 1.88, DARK, k * 2.44, 0.44, 0));
    parts.push(cube(3.3, 0.95, 1.83, color, -0.75, 1.575, 0));
    parts.push(slab([[0.9, 1.1], [2.1, 1.1], [1.5, 2.0], [0.9, 2.0]], 1.74, WINDOW));
    parts.push(cube(0.66, 0.06, 1.8, color, 1.2, 2.02, 0));
    parts.push(cube(0.95, 0.5, 1.84, WINDOW, 0.1, 1.62, 0));
    parts.push(cube(0.06, 0.5, 1.2, WINDOW, -2.4, 1.62, 0));
    lights(parts, 2.4, -2.4, 0.86, 0.62);
    for (const x of [1.55, -1.55]) for (const k of [-1, 1]) wheel(parts, 0.4, x, k, hw);
  } else {
    // A delivery truck: a frame, the cab in front (in the body colour), and a pale box with a stripe
    parts.push(cube(6.2, 0.3, 1.5, DARK, 0, 0.62, 0));
    parts.push(cube(1.7, 0.95, 1.88, color, 2.3, 0.925, 0));
    parts.push(slab([[1.45, 1.4], [3.15, 1.4], [2.8, 2.15], [1.45, 2.15]], 1.78, WINDOW));
    parts.push(cube(1.42, 0.07, 1.83, color, 2.13, 2.18, 0));
    parts.push(cube(0.25, 0.75, 1.84, color, 1.57, 1.775, 0));
    parts.push(cube(4.5, 2.1, 1.98, BOX, -0.95, 1.83, 0));
    parts.push(cube(4.52, 0.3, 2.0, color, -0.95, 1.5, 0));
    parts.push(cube(0.04, 1.9, 0.06, 0xbdb8aa, -3.2, 1.83, 0)); // the gap between the back doors
    parts.push(cube(0.14, 0.3, 1.92, DARK, 3.18, 0.6, 0));
    parts.push(cube(0.1, 0.2, 1.8, DARK, -3.2, 0.6, 0));
    lights(parts, 3.15, -3.2, 0.95, 0.68);
    for (const x of [2.3, -2.0]) for (const k of [-1, 1]) wheel(parts, 0.46, x, k, hw);
  }
  return mergeGeometries(parts, false)!;
}

/** Every shape + colour is built the first time it is needed, then shared by all vehicles that look like it. */
const GEOS = new Map<string, THREE.BufferGeometry>();
function vehicleGeo(kind: VehicleKind, color: number) {
  const key = `${kind}:${color}`;
  let g = GEOS.get(key);
  if (!g) {
    g = buildVehicle(kind, color);
    GEOS.set(key, g);
  }
  return g;
}

// ---------------------------------------------------------------------------
// One vehicle, and one ride
// ---------------------------------------------------------------------------
class RideImpl implements Ride {
  state: Ride['state'] = 'coming';
  readonly curb = new THREE.Vector3();
  timer = -1;            // seconds until it leaves (-1 = nobody has asked it to leave)
  slotX = 0;             // the middle of its parking space, along the curb
  hasSlot = false;
  constructor(readonly side: 'north' | 'south', readonly kind: VehicleKind, readonly wantX: number, readonly onParked: ((ride: Ride) => void) | undefined) {}
  leaveIn(seconds: number) {
    this.timer = Math.max(0, seconds);
  }
}

interface Vehicle {
  mesh: THREE.Mesh;
  kind: VehicleKind;
  hl: number;            // half its length
  hw: number;            // half its width
  cruise: number;
  route: Route;
  s: number;             // how far along its route its middle is
  v: number;             // speed now
  x: number; z: number;  // where its middle is
  fx: number; fz: number; // which way it faces
  ride: RideImpl | null; // (null = through-traffic)
  parkS: number;         // where along the route it parks (-1 = it doesn't, or it has pulled out again)
  latFull: number;       // how far to the right of the lane its parking space is
  junction: 0 | 1 | 2;   // at the corner: 0 = not there yet, 1 = turning (the corner is its), 2 = done
  waited: number;        // seconds spent stopped at the corner, waiting for a gap
  done: boolean;         // reached the end of its route
}

const smooth = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/**
 * How far to the right of its lane a parking vehicle is when its middle is `s` along: a smooth
 * sideways slide over to the curb just before its parking space, and back out just after it.
 */
function latAt(v: Vehicle, s: number) {
  if (v.parkS < 0) return 0;
  const t = (s - v.parkS) / SLIDE;
  if (t <= 0) return v.latFull * smooth(1 + t);
  if (v.ride!.state !== 'leaving') return v.latFull;
  return v.latFull * (1 - smooth(t));
}
/** ...and how steeply it is sliding over there (+ = toward the curb). */
function latSlope(v: Vehicle, s: number) {
  if (v.parkS < 0) return 0;
  const t = (s - v.parkS) / SLIDE;
  if (t <= -1 || t >= 1) return 0;
  if (t <= 0) return (v.latFull * 6 * (1 + t) * -t) / SLIDE;
  if (v.ride!.state !== 'leaving') return 0;
  return (-v.latFull * 6 * t * (1 - t)) / SLIDE;
}
/** Pulling in or out right now (or just about to): the vehicles behind treat it as still in the lane. */
function sliding(v: Vehicle) {
  return v.parkS >= 0 && v.ride!.state !== 'parked' && v.s > v.parkS - SLIDE - 1;
}

// Scratch values, reused every frame so `update` creates nothing.
const A: Sample = { x: 0, z: 0, dx: 0, dz: 0 };
const B: Sample = { x: 0, z: 0, dx: 0, dz: 0 };
const POSE = { x: 0, z: 0, fx: 1, fz: 0 };

/** Where a vehicle would be, and which way it would face, with its middle `s` along its route (into POSE). */
function poseAt(v: Vehicle, s: number) {
  const p = v.route.path;
  // It is carried by two points on its route, one toward each end (like its axles), and sits
  // between them, facing from the back one to the front one. So it swings smoothly round a turn,
  // and its tail cuts the corner a little, as a real one's does, instead of swinging out wide.
  const e = v.hl * 0.7;
  p.at(s - e, A);
  p.at(s + e, B);
  let tx = B.x - A.x, tz = B.z - A.z;
  const d = Math.hypot(tx, tz) || 1;
  tx /= d; tz /= d;
  const lat = latAt(v, s);
  // (the right-hand side of a vehicle heading (tx, tz) is (-tz, tx))
  POSE.x = (A.x + B.x) / 2 - tz * lat;
  POSE.z = (A.z + B.z) / 2 + tx * lat;
  // While it slides to the curb it turns its nose in a little (less than the slide itself: a full
  // turn-in would swing its corners into the parked vehicles beside it), and never so far that
  // its nose would reach over the sidewalk or its tail swing out across the middle of the street.
  let yaw = SLIDE_YAW * Math.atan(latSlope(v, s));
  if (yaw !== 0) {
    const most = Math.asin(Math.min(1, Math.max(0, (Math.min(lat, v.latFull - lat) + 0.05) / v.hl)));
    yaw = Math.max(-most, Math.min(most, yaw));
  }
  const c = Math.cos(yaw), n = Math.sin(yaw);
  POSE.fx = tx * c - tz * n;
  POSE.fz = tz * c + tx * n;
}

/** Do two vehicles (as rectangles on the ground) overlap? `a` is tried at the place in POSE. */
function overlaps(a: Vehicle, b: Vehicle) {
  const dx = b.x - POSE.x, dz = b.z - POSE.z;
  const reach = a.hl + b.hl + 1.5;
  if (dx * dx + dz * dz > reach * reach) return false;
  const ahl = a.hl + 0.03, ahw = a.hw + 0.03, bhl = b.hl + 0.03, bhw = b.hw + 0.03;
  const afx = POSE.fx, afz = POSE.fz, bfx = b.fx, bfz = b.fz;
  // (two rectangles are apart if, looking along one of their four sides, there is daylight between them)
  const c = Math.abs(afx * bfx + afz * bfz), s = Math.abs(afx * bfz - afz * bfx);
  if (Math.abs(dx * afx + dz * afz) > ahl + bhl * c + bhw * s) return false;
  if (Math.abs(-dx * afz + dz * afx) > ahw + bhl * s + bhw * c) return false;
  if (Math.abs(dx * bfx + dz * bfz) > bhl + ahl * c + ahw * s) return false;
  if (Math.abs(-dx * bfz + dz * bfx) > bhw + ahl * s + ahw * c) return false;
  return true;
}

/** Is this spot on a roadway (the main street, or the side street)? */
function onRoad(x: number, z: number) {
  if (z >= ROAD_N && z <= ROAD_S) return x >= MIN_X && x <= MAX_X;
  return z < ROAD_N && z >= MIN_Z && x >= SIDE_W && x <= SIDE_E;
}

const MAX_PEDS = 64;

export class Traffic {
  private vehicles: Vehicle[] = [];
  private spare: Vehicle[] = [];        // vehicles that drove off, kept to be used again
  private waiting: RideImpl[] = [];     // rides that haven't been able to drive in yet (the end of the street was busy)
  private parked: RideImpl[] = [];      // rides that own a parking space (coming, parked, or pulling out)
  private ambient: number;
  private pedestrians: (() => Iterable<THREE.Vector3>) | undefined;
  private nextSpawn = 1;
  private cornerOwner: Vehicle | null = null; // only one vehicle turns at the corner at a time
  private peds = new Float32Array(MAX_PEDS * 2);
  private pedCount = 0;
  /** For testing: how often the last safety net (never step into another vehicle) had to stop a vehicle. Should stay at or near 0. */
  blocked = 0;

  constructor(private scene: THREE.Scene, opts: { ambient?: number; pedestrians?: () => Iterable<THREE.Vector3> } = {}) {
    this.ambient = opts.ambient ?? 3;
    this.pedestrians = opts.pedestrians;
  }

  /** How many vehicles exist right now (for the lead's stats). */
  get count() {
    return this.vehicles.length;
  }

  /**
   * A vehicle that brings someone to `x` on the main street: it drives in from one end of the
   * street (the east end for the north curb, the west end for the south curb, so it never
   * crosses the other lane), pulls over at the curb on `side` as near `x` as there is a free
   * space, and calls `onParked` when it has stopped.
   */
  arrive(x: number, side: 'north' | 'south', opts: { kind?: VehicleKind; onParked?: (ride: Ride) => void } = {}): Ride {
    const kind = opts.kind ?? (Math.random() < 0.7 ? 'car' : Math.random() < 0.7 ? 'van' : 'truck');
    const ride = new RideImpl(side, kind, x, opts.onParked);
    ride.curb.set(x, 0, side === 'north' ? ROAD_N - 0.4 : ROAD_S + 0.4);
    this.findSpace(ride);
    this.waiting.push(ride);
    return ride;
  }

  /** The nearest free stretch of curb to where the ride wants to be. (False = the whole curb is full: it tries again later.) */
  private findSpace(ride: RideImpl) {
    const half = SIZE[ride.kind].len / 2;
    const want = Math.min(PARK_MAX - half, Math.max(PARK_MIN + half, ride.wantX));
    for (let i = 0; i < 400; i++) {
      // (try at the spot, then a little either side, then a little further...)
      const c = want + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.5;
      if (c - half < PARK_MIN || c + half > PARK_MAX) continue;
      // (no parking so near the corner that pulling in or out would happen in it)
      const reach = half + SLIDE + 0.5;
      if (c > turnW - reach && c < turnE + reach) continue;
      let free = true;
      for (const cx of CROSSWALKS) if (Math.abs(c - cx) < half + 1.5) free = false;
      for (const o of this.parked) {
        if (o.side === ride.side && Math.abs(c - o.slotX) < half + SIZE[o.kind].len / 2 + PARK_GAP) free = false;
      }
      if (!free) continue;
      ride.slotX = c;
      ride.hasSlot = true;
      ride.curb.x = c;
      this.parked.push(ride);
      return true;
    }
    return false;
  }

  private freeSpace(ride: RideImpl) {
    const i = this.parked.indexOf(ride);
    if (i >= 0) this.parked.splice(i, 1);
  }

  /** Put a vehicle at the start of a route, if there is room there. */
  private spawn(route: Route, kind: VehicleKind, color: number, ride: RideImpl | null) {
    const size = SIZE[kind];
    const hl = size.len / 2;
    route.path.at(hl, A);
    for (const o of this.vehicles) {
      const reach = hl + o.hl + 2.5;
      const dx = o.x - A.x, dz = o.z - A.z;
      if (dx * dx + dz * dz < reach * reach) return null;
    }
    let v = this.spare.pop();
    if (!v) {
      const mesh = new THREE.Mesh(vehicleGeo(kind, color), CAR_MAT);
      mesh.castShadow = true;
      v = { mesh, kind, hl, hw: 0, cruise: 0, route, s: 0, v: 0, x: 0, z: 0, fx: 1, fz: 0, ride: null, parkS: -1, latFull: 0, junction: 0, waited: 0, done: false };
    }
    v.mesh.geometry = vehicleGeo(kind, color); // (shared: never disposed)
    v.kind = kind;
    v.hl = hl;
    v.hw = size.wid / 2;
    v.cruise = size.speed * (0.94 + Math.random() * 0.12);
    v.route = route;
    v.s = hl;
    v.v = v.cruise * 0.8; // (it arrives already moving)
    v.ride = ride;
    v.parkS = -1;
    v.latFull = 0;
    v.junction = 0;
    v.waited = 0;
    v.done = false;
    if (ride) {
      // Its parking space, as a distance along its lane, and how far over the curb strip is
      v.parkS = ride.side === 'north' ? MAX_X - ride.slotX : ride.slotX - MIN_X;
      v.latFull = STREET.width / 2 - LANE - 0.08 - v.hw;
    }
    poseAt(v, v.s);
    this.place(v);
    this.scene.add(v.mesh);
    this.vehicles.push(v);
    return v;
  }

  /** Move a vehicle (and its mesh) to the place in POSE. It grows in at the end of the street and shrinks away at the other end, so it doesn't pop. */
  private place(v: Vehicle) {
    v.x = POSE.x; v.z = POSE.z; v.fx = POSE.fx; v.fz = POSE.fz;
    const m = v.mesh;
    m.position.set(v.x, 0, v.z);
    m.rotation.y = Math.atan2(-v.fz, v.fx);
    const edge = Math.min(v.s - v.hl, v.route.path.length - v.hl - v.s);
    m.scale.setScalar(0.02 + 0.98 * smooth(edge / 2.5));
  }

  update(dt: number) {
    const real = Math.min(dt, 0.1);
    // 🚶 People on the road right now (read once a frame)
    this.pedCount = 0;
    if (this.pedestrians) {
      for (const p of this.pedestrians()) {
        if (this.pedCount >= MAX_PEDS) break;
        if (!onRoad(p.x, p.z)) continue;
        this.peds[this.pedCount * 2] = p.x;
        this.peds[this.pedCount * 2 + 1] = p.z;
        this.pedCount++;
      }
    }
    // ⏱ Rides asked to leave: count down
    for (const r of this.parked) if (r.timer > 0) r.timer = Math.max(0, r.timer - real);
    for (const r of this.waiting) if (!r.hasSlot && r.timer > 0) r.timer = Math.max(0, r.timer - real);
    // 🚗 Rides waiting to drive in at the end of the street
    for (let i = 0; i < this.waiting.length; i++) {
      const r = this.waiting[i];
      if (!r.hasSlot && !this.findSpace(r)) continue;
      const color = PALETTE[Math.floor(Math.random() * PALETTE.length)];
      if (!this.spawn(r.side === 'north' ? MAIN_W : MAIN_E, r.kind, color, r)) continue;
      this.waiting.splice(i, 1);
      i--;
    }
    // 🚙 Through-traffic: a new one every few seconds, while there are fewer than `ambient`
    this.nextSpawn -= real;
    if (this.nextSpawn <= 0) {
      let passing = 0;
      for (const v of this.vehicles) if (!v.ride) passing++;
      if (passing < this.ambient) {
        const k = Math.random();
        const kind: VehicleKind = k < 0.6 ? 'car' : k < 0.82 ? 'van' : 'truck';
        // (about a third turn at the corner; the long truck keeps to the main street)
        const turns = kind !== 'truck' && Math.random() < 0.34;
        const route = turns ? TURN_ROUTES[Math.floor(Math.random() * 4)] : Math.random() < 0.5 ? MAIN_E : MAIN_W;
        const made = this.spawn(route, kind, PALETTE[Math.floor(Math.random() * PALETTE.length)], null);
        this.nextSpawn = made ? 1.5 + Math.random() * 5 : 0.5;
      } else this.nextSpawn = 0.5;
    }
    // Drive. (In small steps, so nothing jumps far in one go when the game runs fast or a frame is slow.)
    const moved = real * pace.move;
    const steps = Math.min(8, Math.max(1, Math.ceil(moved / 0.05)));
    const h = moved / steps;
    for (let k = 0; k < steps; k++) for (const v of this.vehicles) if (!v.done) this.drive(v, h);
    // The ones that reached the end of their route drive off (kept as spares)
    for (let i = this.vehicles.length - 1; i >= 0; i--) {
      const v = this.vehicles[i];
      if (!v.done) continue;
      v.mesh.removeFromParent();
      if (this.cornerOwner === v) this.cornerOwner = null;
      if (v.ride) {
        v.ride.state = 'gone';
        this.freeSpace(v.ride);
        v.ride = null;
      }
      this.vehicles.splice(i, 1);
      this.spare.push(v);
    }
  }

  /** One vehicle, one small step of time: decide how fast it may go, then move. */
  private drive(v: Vehicle, dt: number) {
    const ride = v.ride;
    const path = v.route.path;
    // 🅿️ Parked: stay, until asked to leave AND there is a gap in the lane
    if (ride && ride.state === 'parked') {
      if (ride.timer !== 0 || !this.laneClear(v)) return;
      ride.state = 'leaving';
    }
    let allowed = v.cruise;   // the fastest it may go right now
    let room = Infinity;      // the furthest it may move this step

    // Pulling over: slow to a stop exactly at its parking space
    const parking = ride !== null && ride.state === 'coming';
    if (parking) {
      const d = v.parkS - v.s;
      allowed = Math.min(allowed, Math.max(0.35, Math.sqrt(2 * PARK_BRAKE * d)));
      room = d;
    }

    // The corner: slow down for the turn, and wait at the line until the corner is free
    const turn = v.route.turn;
    if (turn) {
      if (v.junction === 0) {
        const d = turn.hold - v.hl - v.s;
        if (d < 3 && this.cornerOwner === null && this.cornerClear(v, turn)) {
          this.cornerOwner = v;
          v.junction = 1;
        } else {
          allowed = Math.min(allowed, Math.sqrt(2 * BRAKE * Math.max(0, d)));
          room = Math.min(room, Math.max(0, d));
          if (d < 0.1) v.waited += dt;
        }
      } else if (v.junction === 1 && v.s > turn.arc1 + v.hl + 0.5) {
        v.junction = 2;
        this.cornerOwner = null;
      }
      if (v.s < turn.arc0) allowed = Math.min(allowed, Math.sqrt(TURN_SPEED * TURN_SPEED + 2 * BRAKE * (turn.arc0 - v.s)));
      else if (v.s < turn.arc1) allowed = Math.min(allowed, TURN_SPEED);
    }

    // Somebody else is turning at the corner, across my lane: wait short of the corner until they are through
    // (unless my nose is already in it: then they are waiting for me)
    const owner = this.cornerOwner;
    if (owner !== null && owner !== v) {
      const theirs = owner.route.turn!;
      let d = -1;
      if (theirs.yieldW && v.fx < -0.7 && Math.abs(v.z - W_Z) < 1.5) d = v.x - v.hl - STOP_W;
      else if (theirs.yieldE && v.fx > 0.7 && Math.abs(v.z - E_Z) < 1.5) d = STOP_E - (v.x + v.hl);
      if (d >= -0.05) {
        allowed = Math.min(allowed, Math.sqrt(2 * BRAKE * Math.max(0, d)));
        room = Math.min(room, Math.max(0, d));
      }
    }

    // 👀 Look ahead along its own route, from the nose forward
    const limit = parking ? v.parkS + v.hl : path.length;
    for (let d = v.hl; d <= v.hl + LOOK; d += LOOK_STEP) {
      const s2 = v.s + d;
      if (s2 > limit) break;
      path.at(s2, A);
      // (when my nose is here, my middle is half my length back: that is how far over I will have slid)
      const lat = latAt(v, s2 - v.hl);
      const px = A.x - A.dz * lat, pz = A.z + A.dx * lat;
      const gap = d - v.hl;
      // A person on the road at this point? Stop short of them. (Right at my nose only someone in my
      // lane counts; further ahead, anyone crossing the street does: I wait for them to get across.)
      let person = false;
      if (gap <= 6.5) {
        const wide = gap < 1.5 ? 1.6 : 3.5;
        for (let i = 0; i < this.pedCount; i++) {
          const ex = this.peds[i * 2] - px, ez = this.peds[i * 2 + 1] - pz;
          if (Math.abs(ex * A.dx + ez * A.dz) <= LOOK_STEP * 0.6 && Math.abs(-ex * A.dz + ez * A.dx) < wide) { person = true; break; }
        }
      }
      if (person) {
        allowed = Math.min(allowed, Math.sqrt(2 * BRAKE * Math.max(0, gap - 1.5)));
        break;
      }
      // Another vehicle on this point? (Its rectangle, widened by half my own width.)
      let hit: Vehicle | null = null;
      let same = false;
      for (const o of this.vehicles) {
        if (o === v) continue;
        // (sliding in or out, I pay no mind to the parked ones: the parking spaces are set far enough apart to clear them)
        if (v.parkS >= 0 && o.ride !== null && o.ride.state === 'parked') continue;
        const ex = px - o.x, ez = pz - o.z;
        if (Math.abs(ex * o.fx + ez * o.fz) > o.hl + 0.1) continue;
        const along = v.fx * o.fx + v.fz * o.fz > 0.5; // (going my way)
        // (one that is pulling in or out counts as in my lane: I wait behind it, I don't squeeze past)
        const wide = o.hw + v.hw + (along && sliding(o) ? 1.5 : 0.12);
        if (Math.abs(-ex * o.fz + ez * o.fx) > wide) continue;
        hit = o;
        same = along;
        break;
      }
      if (hit) {
        // (behind one that is moving my way I can keep its speed; otherwise I stop MIN_GAP short)
        const lead = same ? hit.v * hit.v : 0;
        allowed = Math.min(allowed, Math.sqrt(2 * BRAKE * Math.max(0, gap - MIN_GAP) + lead));
        room = Math.min(room, Math.max(0, gap - 0.3));
        break;
      }
    }

    // Ease toward that speed: gently up, comfortably down (hard only if it must)
    if (v.v < allowed) v.v = Math.min(allowed, v.v + ACCEL * dt);
    else v.v = Math.max(allowed, v.v - BRAKE_HARD * dt);
    let step = v.v * dt;
    if (step > room) {
      step = room;
      if (room <= 0) v.v = 0;
    }
    if (step > 0) {
      // The last safety net: never step into another vehicle
      poseAt(v, v.s + step);
      let clear = true;
      for (const o of this.vehicles) {
        if (o !== v && overlaps(v, o)) { clear = false; break; }
      }
      if (clear) {
        v.s += step;
        this.place(v);
      } else {
        v.v = 0;
        this.blocked++;
      }
    }

    if (ride) {
      if (ride.state === 'coming' && v.parkS - v.s < 0.02) {
        // Parked. Snap to the space, and tell whoever asked.
        v.s = v.parkS;
        v.v = 0;
        ride.state = 'parked';
        poseAt(v, v.s);
        this.place(v);
        ride.onParked?.(ride);
      } else if (ride.state === 'leaving' && v.parkS >= 0 && v.s >= v.parkS + SLIDE) {
        // Back in the lane: its space is free again
        v.parkS = -1;
        this.freeSpace(ride);
      }
    }
    if (v.s >= path.length - v.hl - 0.02) v.done = true;
  }

  /** Before pulling out: is there a gap in the lane beside this parked vehicle? */
  private laneClear(v: Vehicle) {
    const laneZ = v.ride!.side === 'north' ? W_Z : E_Z;
    for (const o of this.vehicles) {
      if (o === v || v.fx * o.fx + v.fz * o.fz < 0.5) continue;       // (only traffic going my way)
      if (Math.abs(o.z - laneZ) > 1.5 && !sliding(o)) continue;       // (in my lane, or sliding in or out of it)
      const ahead = (o.x - v.x) * v.fx;                               // (+ = in front of me)
      const reach = v.hl + o.hl;
      if (ahead > -(reach + 1) && ahead < reach + 1) return false;    // right beside me
      if (ahead < 0 && ahead > -(reach + 16) && o.v > 0.3) return false; // coming up behind
    }
    return true;
  }

  /** Before turning at the corner: is the traffic this turn must give way to clear? */
  private cornerClear(v: Vehicle, turn: Turn) {
    // (how far away oncoming traffic must be. After a long wait it takes a smaller gap: the others see it and slow down)
    const far = v.waited > 6 ? 12 : 24;
    for (const o of this.vehicles) {
      if (o === v) continue;
      if (turn.yieldW && o.fx < -0.7 && Math.abs(o.z - W_Z) < 1.5) {
        // (westbound: its nose is at x - hl. In the corner, or driving up to it from the east)
        if (o.x - o.hl < STOP_W && o.x + o.hl > turnW - 2.8) return false;
        if (o.x > turnE && o.x < turnE + far && o.v > 0.5) return false;
      }
      if (turn.yieldE && o.fx > 0.7 && Math.abs(o.z - E_Z) < 1.5) {
        if (o.x + o.hl > STOP_E && o.x - o.hl < turnE + 2.8) return false;
        if (o.x < turnW && o.x > turnW - far && o.v > 0.5) return false;
      }
    }
    return true;
  }
}
