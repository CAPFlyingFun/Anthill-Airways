// ============================================================================
// plane.ts — 🐞✈️ one bug airliner and its whole trip (v0.68; runway clearance v0.69).
//
// A plane belongs to a gate. Its day goes round and round:
//
//   parked ──(fuel + bags + passengers aboard)──► taxiOut ──► hold ──🗼──► lineUp ──► takeoff ──► route
//      ▲                                                                                            │
//      └── deplane ◄── taxiIn ◄── landing ◄──🗼── holding (circling, waiting to land) ◄─────────────┘
//
// 🗼 = RUNWAY CLEARANCE (v0.69, like a real tower): only one bug uses the runway at a time. A plane waits at the
// HOLD line on its link (or circles in the HOLDING PATTERN over the runway's far end) until it's cleared: you tap
// its chip (or its card's button), or the Tower ant does it. A cleared plane goes as soon as the runway is free
// (the airfield's Runway hands it over: see grant()).
//
// Taxiing, it WALKS (bugs taxi on their legs: its legs step with animateCreature). It lines up on the runway at
// its gate's link, runs east, lifts off with its wings open, climbs away over the lawn, and is gone for the
// route's time. It comes back from the west, circles until cleared, lands, rolls out, turns off at its link and
// walks back to its gate, nose toward the terminal. Real insects can take off from a standstill; the runway is
// for the look (and it's what makes it an airport).
//
// The airfield (airfield.ts) decides WHEN to go (fuel, bags, passengers) and what's paid; this file only flies.
// ============================================================================
import * as THREE from 'three';
import { animateCreature, faceToward } from '../actors/models';
import type { ArtBug } from './art';
import { AT, TY } from './data';

export type PlaneState = 'parked' | 'taxiOut' | 'hold' | 'lineUp' | 'takeoff' | 'route' | 'holding' | 'landing' | 'taxiIn';

/** Where the flights go (and come from): the places the plan's routes will open, one day. */
export const DESTINATIONS = ['🌼 Flower Field', '🪵 Fallen Log Town', '🐚 Tide Pool', '🧺 Picnic Table', '🦎 Lizard Rock', '🍄 Mushroom Ring'];

/** A flight: its number and where it's going (a departure) or coming from (an arrival). */
export interface Flight {
  no: number;
  place: string;
}

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
/** The order clearances were given in (first cleared, first to go). */
let clearSeq = 0;

export class Plane {
  state: PlaneState = 'parked';
  /** 🛫 The flight it's about to fly (set when boarding starts) and 🛬 the one it's flying in (set once out on the route). */
  outbound: Flight | null = null;
  inbound: Flight | null = null;
  /** Passengers riding on its back (models parented to its seats). */
  riders: (THREE.Object3D | null)[];
  /** x on taxi and route speed (the 🗼 Control Tower). */
  boost = 1;
  /** 🗼 Cleared (by you or the Tower ant) and waiting for the runway to be free; and in what order. */
  cleared = false;
  clearedAt = 0;
  /** Seconds it has been waiting at the hold line / in the holding pattern. */
  waitT = 0;
  /** Called once airborne (pay out departures, XP), and once parked again after a trip. */
  onAirborne: () => void = () => {};
  /** Out of sight on the route (its passengers have flown away), and back (new ones aboard, waiting to land). */
  onRoute: () => void = () => {};
  onApproach: () => void = () => {};
  onArrived: () => void = () => {};
  /** Seconds left out on the route. */
  private routeT = 0;
  private path: THREE.Vector3[] = [];
  private speed = 0;
  private tmp = new THREE.Vector3();
  /** Where it parks (its gate's stand) and the runway's ends. */
  private home: THREE.Vector3;
  private rwStart: number;
  private rwEnd: number;
  /** The holding pattern: its angle on the circle (each gate's plane has its own spot and height). */
  private holdA = 0;
  private orbiting = false;

  /**
   * `link` = the x of its gate's own link to the runway (it enters there to take off, and turns off there after
   * landing: short trips, so planes turn around fast). `ground(x, z)` = how high the surface is there.
   * `slot` = its gate's number from 0 (keeps planes apart in the holding pattern).
   */
  constructor(public model: ArtBug, park: THREE.Vector3, private link: number, private ground: (x: number, z: number) => number = () => 0, private slot = 0) {
    this.home = park.clone();
    this.riders = model.seats.map(() => null);
    const rw = AT.runway;
    this.rwStart = rw.x - rw.length / 2 + 14;
    this.rwEnd = rw.x + rw.length / 2 - 14;
    this.park();
  }

  get pos() {
    return this.model.root.position;
  }
  /** Out on the route (or at a gate not bought yet) it's put away: `userData.hidden`, which lod.ts respects. */
  get inSight() {
    return !this.model.root.userData.hidden;
  }
  private setInSight(on: boolean) {
    this.model.root.visible = on;
    this.model.root.userData.hidden = !on;
  }
  get parked() {
    return this.state === 'parked';
  }
  /** Waiting for 🗼 runway clearance (at the hold line, or circling). */
  get waiting() {
    return this.state === 'hold' || this.state === 'holding';
  }
  /** Using the runway right now (nobody else may). */
  get onRunway() {
    return this.state === 'lineUp' || (this.state === 'takeoff' && !this.wasUp) || this.state === 'landing';
  }
  /** Seats free right now. */
  get freeSeats() {
    return this.riders.filter((r) => !r).length;
  }
  get aboard() {
    return this.riders.filter((r) => r).length;
  }
  /** How far through the route it is (0..1), for the flight card's ring. */
  get routeFrac() {
    return this.state === 'route' ? THREE.MathUtils.clamp(1 - this.routeT / (TY.routeSecs / this.boost), 0, 1) : 0;
  }

  /** On its stand, facing the terminal (+z). */
  park() {
    this.state = 'parked';
    this.pos.copy(this.home);
    this.pos.y = Math.max(this.home.y, this.ground(this.home.x, this.home.z));
    this.model.root.rotation.set(0, 0, 0);
    this.model.bob.rotation.set(0, 0, 0);
    this.model.flying = false;
    this.setInSight(true);
  }

  /** Swap in a different bug (an upgrade: 🐝 Bee Shuttles). Only while parked and empty. Returns the old one. */
  setModel(m: ArtBug) {
    const old = this.model;
    m.root.position.copy(old.root.position);
    m.root.rotation.copy(old.root.rotation);
    m.root.visible = old.root.visible;
    m.root.userData.hidden = old.root.userData.hidden;
    old.root.parent?.add(m.root);
    old.root.removeFromParent();
    this.model = m;
    this.riders = m.seats.map(() => null);
    return old;
  }

  /** Sit a passenger in a free seat (their world size kept). Returns false if it's full. */
  seat(rider: THREE.Object3D) {
    const i = this.riders.indexOf(null);
    if (i < 0) return false;
    const s = this.model.seats[i];
    const world = rider.getWorldScale(this.tmp).x;
    s.add(rider);
    rider.position.set(0, 0, 0);
    rider.rotation.set(0, 0, 0);
    // (seats sit inside the plane's own scale: undo it so the rider keeps its size)
    const parent = s.getWorldScale(new THREE.Vector3()).x;
    rider.scale.setScalar(world / parent);
    this.riders[i] = rider;
    return true;
  }

  /** Everyone off: returns the riders, back in `scene` at their world spots and sizes. */
  unseat(scene: THREE.Scene) {
    const out: THREE.Object3D[] = [];
    this.riders.forEach((r, i) => {
      if (!r) return;
      const world = r.getWorldScale(this.tmp).x;
      const p = r.getWorldPosition(new THREE.Vector3());
      scene.add(r);
      r.position.copy(p).setY(0);
      r.scale.setScalar(world);
      r.rotation.set(0, 0, 0);
      out.push(r);
      this.riders[i] = null;
    });
    return out;
  }

  /** Off it goes: walk out to the HOLD line on its link (and wait there for take-off clearance). */
  depart() {
    if (this.state !== 'parked') return;
    const h = this.home;
    const tz = AT.taxiZ;
    this.path = [v3(h.x, 0, tz), v3(this.link, 0, tz), v3(this.link, 0, Plane.holdZ)];
    this.state = 'taxiOut';
    this.waitT = 0;
  }

  /** 🗼 Cleared for take-off / to land (you tapped it, or the Tower ant). It goes once the runway is free. */
  clear() {
    if (!this.waiting || this.cleared) return false;
    this.cleared = true;
    this.clearedAt = ++clearSeq;
    return true;
  }

  /** The runway is ours (the airfield's Runway gives it to one cleared plane at a time). */
  grant() {
    this.cleared = false;
    const rz = AT.runway.z;
    if (this.state === 'hold') {
      this.state = 'lineUp';
      this.path = [v3(this.link, 0, rz), v3(this.link + 2, 0, rz)];
    } else if (this.state === 'holding') {
      // Out of the circle, down onto the final approach, touch down past the threshold, roll to its link
      this.state = 'landing';
      this.orbiting = false;
      this.speed = TY.cruiseSpeed * 0.8 * this.boost;
      const top = this.ground(this.rwStart, rz);
      this.path = [v3(this.rwStart - 34, 12, rz), v3(this.rwStart + 6, top, rz), v3(this.exitX(), top, rz)];
    }
  }

  update(dt: number) {
    const m = this.model;
    switch (this.state) {
      case 'parked':
      case 'hold':
        if (this.state === 'hold') {
          this.waitT += dt;
          faceToward(m, 0, -1, dt, 6); // (nose to the runway)
        }
        animateCreature(m, dt, 0);
        return;
      case 'taxiOut':
      case 'lineUp':
      case 'taxiIn': {
        const sp = TY.taxiSpeed * this.boost;
        const done = this.follow(dt, sp, true);
        animateCreature(m, dt, sp);
        if (done) {
          if (this.state === 'taxiOut') {
            this.state = 'hold';
            this.waitT = 0;
          } else if (this.state === 'lineUp') {
            this.state = 'takeoff';
            this.speed = 2;
            this.path = [
              v3(this.link + 44, this.ground(this.link + 44, AT.runway.z), AT.runway.z),
              v3(this.rwEnd + 40, TY.cruiseAlt * 0.6, AT.runway.z - 10),
              v3(this.rwEnd + 140, TY.cruiseAlt, AT.runway.z - 120),
            ];
          } else {
            this.park();
            this.onArrived();
          }
        }
        return;
      }
      case 'takeoff': {
        // A run along the runway (legs, then wings), then climbing out to the north-east
        this.speed = Math.min(TY.takeoffSpeed * this.boost, this.speed + dt * 16);
        const airborne = this.pos.x > this.link + 30;
        m.flying = airborne;
        const done = this.follow(dt, this.speed, false);
        animateCreature(m, dt, airborne ? 0 : this.speed * 0.5);
        m.bob.rotation.x = airborne ? THREE.MathUtils.lerp(m.bob.rotation.x, -0.25, dt * 2) : 0;
        if (airborne && !this.wasUp) {
          this.wasUp = true;
          this.onAirborne();
        }
        if (done) {
          this.state = 'route';
          this.routeT = TY.routeSecs / this.boost;
          this.setInSight(false);
          this.onRoute();
        }
        return;
      }
      case 'route':
        this.routeT -= dt;
        if (this.routeT <= 0) {
          // Back from the west, flying in to the holding pattern (it lands as soon as it's cleared)
          this.state = 'holding';
          this.wasUp = false;
          this.waitT = 0;
          this.orbiting = false;
          this.setInSight(true);
          m.flying = true;
          m.bob.rotation.x = 0;
          const c = AT.hold;
          this.pos.set(c.x - 44, TY.cruiseAlt + 4, c.z + 6); // (in over the grass tops, down into the clearing)
          this.holdA = Math.PI * 0.75 + this.slot * (Math.PI / 2);
          this.path = [this.holdPoint(this.holdA, new THREE.Vector3())];
          this.onApproach();
        }
        return;
      case 'holding': {
        this.waitT += dt;
        const sp = TY.cruiseSpeed * 0.55 * this.boost;
        if (!this.orbiting) {
          if (this.follow(dt, sp, false)) this.orbiting = true;
        } else {
          // Round and round (anticlockwise seen from above), banked into the turn
          this.holdA -= (dt * sp) / TY.holdRadius;
          this.holdPoint(this.holdA, this.pos);
          faceToward(m, Math.sin(this.holdA), -Math.cos(this.holdA), dt, 6);
        }
        m.bob.rotation.z = THREE.MathUtils.lerp(m.bob.rotation.z, this.orbiting ? 0.3 : 0, dt * 2);
        animateCreature(m, dt, 0);
        return;
      }
      case 'landing': {
        const down = this.pos.y < this.ground(this.pos.x, this.pos.z) + 0.05;
        if (down) {
          // (rolls out quickly while there's runway ahead, then slows for the turn-off: the runway is free sooner)
          m.flying = false;
          const nearExit = Math.abs(this.pos.x - this.exitX()) < 10;
          this.speed = Math.max(TY.taxiSpeed * this.boost * (nearExit ? 1 : 2.2), this.speed - dt * 16);
        }
        m.bob.rotation.x = THREE.MathUtils.lerp(m.bob.rotation.x, down ? 0 : 0.12, dt * 3);
        m.bob.rotation.z = THREE.MathUtils.lerp(m.bob.rotation.z, 0, dt * 4);
        const done = this.follow(dt, this.speed, false);
        animateCreature(m, dt, down ? this.speed * 0.5 : 0);
        if (done) {
          const h = this.home;
          this.path = [v3(this.exitX(), 0, AT.taxiZ), v3(h.x, 0, AT.taxiZ), v3(h.x, 0, h.z - 6), h.clone()];
          this.state = 'taxiIn';
        }
        return;
      }
    }
  }
  private wasUp = false;

  /** A point on this plane's holding circle (its own height, so two planes never share a spot). */
  private holdPoint(a: number, out: THREE.Vector3) {
    const c = AT.hold;
    return out.set(c.x + Math.cos(a) * TY.holdRadius, TY.holdAlt + this.slot * 3, c.z + Math.sin(a) * TY.holdRadius);
  }

  /** Where it waits for take-off clearance: behind the HOLD line on its link, just short of the runway. */
  static get holdZ() {
    return AT.runway.z + AT.runway.width / 2 + 5;
  }

  // --------------------------------------------------------------------------
  // ⏱️ Timing, for the flight board (estimates, in game seconds; waiting for clearance has no clock)
  // --------------------------------------------------------------------------
  /** Path still to go (units). */
  private left() {
    let d = 0;
    let prev = this.pos;
    for (const p of this.path) {
      d += prev.distanceTo(p);
      prev = p;
    }
    return d;
  }
  private get taxiInSecs() {
    return (Math.abs(this.exitX() - this.home.x) + Math.abs(AT.runway.z - AT.taxiZ) + Math.abs(AT.taxiZ - this.home.z)) / (TY.taxiSpeed * this.boost);
  }
  /** Coming back from the route to touchdown, if it's cleared straight away (the fly-in and the final approach). */
  private get approachSecs() {
    return 100 / (TY.cruiseSpeed * 0.8 * this.boost) + 1;
  }
  /** Seconds until it leaves the ground (null: not heading out, or waiting for clearance). */
  etaTakeoff(): number | null {
    const lineUp = (Math.abs(Plane.holdZ - AT.runway.z) + 2) / (TY.taxiSpeed * this.boost);
    if (this.state === 'taxiOut') return this.left() / (TY.taxiSpeed * this.boost) + lineUp + 3;
    if (this.state === 'lineUp') return this.left() / (TY.taxiSpeed * this.boost) + 3;
    if (this.state === 'takeoff') return this.wasUp ? 0 : Math.max(0, (this.link + 30 - this.pos.x) / Math.max(this.speed, 8));
    return null;
  }
  /** Seconds until it's parked at its gate again (null: it's parked, or waiting for clearance). */
  etaGate(): number | null {
    const taxiIn = this.taxiInSecs;
    switch (this.state) {
      case 'taxiOut':
      case 'lineUp':
      case 'takeoff':
        return (this.etaTakeoff() ?? 0) + 4 + TY.routeSecs / this.boost + this.approachSecs + taxiIn;
      case 'route':
        return this.routeT + this.approachSecs + taxiIn;
      case 'landing':
        return this.left() / Math.max(this.speed, TY.taxiSpeed) + taxiIn;
      case 'taxiIn':
        return this.left() / (TY.taxiSpeed * this.boost);
      default:
        return null;
    }
  }
  /** Seconds until it touches down (null: not in the air, or circling until it's cleared). */
  etaLanding(): number | null {
    if (this.state === 'route') return this.routeT + this.approachSecs;
    if (this.state === 'landing') return this.pos.y > this.ground(this.pos.x, this.pos.z) + 0.05 ? (this.left() / Math.max(this.speed, 8)) * 0.7 : 0;
    return null;
  }

  /** Where landing planes turn off the runway (at their own gate's link). */
  private exitX() {
    return this.link;
  }

  /** Move along the path at `speed`; true when the last point is reached. `ground` keeps it on the surface. */
  private follow(dt: number, speed: number, ground: boolean) {
    let left = speed * dt;
    while (left > 0 && this.path.length) {
      const target = this.path[0];
      this.tmp.subVectors(target, this.pos);
      if (ground) this.tmp.y = 0;
      const d = this.tmp.length();
      if (d <= left) {
        this.pos.copy(target);
        this.path.shift();
        left -= d;
      } else {
        this.pos.addScaledVector(this.tmp.normalize(), left);
        left = 0;
      }
    }
    if (ground) this.pos.y = this.ground(this.pos.x, this.pos.z);
    const next = this.path[0];
    if (next) faceToward(this.model, next.x - this.pos.x, next.z - this.pos.z, dt, 6);
    else if (this.state === 'taxiIn') faceToward(this.model, 0, 1, dt, 6);
    return this.path.length === 0;
  }
}
