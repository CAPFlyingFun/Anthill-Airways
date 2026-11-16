// ============================================================================
// plane.ts — 🐞✈️ one bug airliner and its whole trip (v0.68).
//
// A plane belongs to a gate. Its day goes round and round:
//
//   parked ──(fuel + passengers aboard)──► taxiOut ──► takeoff ──► route (out of sight)
//      ▲                                                                   │
//      └── deplane ◄── taxiIn ◄── landing ◄────────────────────────────────┘
//
// Taxiing, it WALKS (bugs taxi on their legs: its legs step with animateCreature). It lines up at the west end
// of the runway, runs east, lifts off with its wings open, climbs away over the lawn, and is gone for the
// route's time. It comes back from the west, lands, rolls out, turns off at the exit and walks back to its
// gate, nose toward the terminal. Real insects can take off from a standstill; the runway is for the look
// (and it's what makes it an airport).
//
// The airfield (airfield.ts) decides WHEN to go (fuel + passengers) and what's paid; this file only flies.
// ============================================================================
import * as THREE from 'three';
import { animateCreature, faceToward } from '../actors/models';
import type { ArtBug } from './art';
import { AT, TY } from './data';

export type PlaneState = 'parked' | 'taxiOut' | 'takeoff' | 'route' | 'landing' | 'taxiIn';

/** Where the flights go (and come from): the places the plan's routes will open, one day. */
export const DESTINATIONS = ['🌼 Flower Field', '🪵 Fallen Log Town', '🐚 Tide Pool', '🧺 Picnic Table', '🦎 Lizard Rock', '🍄 Mushroom Ring'];

/** A flight: its number and where it's going (a departure) or coming from (an arrival). */
export interface Flight {
  no: number;
  place: string;
}

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export class Plane {
  state: PlaneState = 'parked';
  /** 🛫 The flight it's about to fly (set when boarding starts) and 🛬 the one it's flying in (set once out on the route). */
  outbound: Flight | null = null;
  inbound: Flight | null = null;
  /** Passengers riding on its back (models parented to its seats). */
  riders: (THREE.Object3D | null)[];
  /** x on taxi and route speed (the 🗼 Control Tower). */
  boost = 1;
  /** Called once airborne (pay out departures, XP), and once parked again after a trip. */
  onAirborne: () => void = () => {};
  /** Out of sight on the route (its passengers have flown away), and lining up to land (new ones aboard). */
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

  /** `ground(x, z)` = how high the surface is there (the runway and taxiways are raised a little). */
  constructor(public model: ArtBug, park: THREE.Vector3, private ground: (x: number, z: number) => number = () => 0) {
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
  get parked() {
    return this.state === 'parked';
  }
  /** Seats free right now. */
  get freeSeats() {
    return this.riders.filter((r) => !r).length;
  }
  get aboard() {
    return this.riders.filter((r) => r).length;
  }

  /** On its stand, facing the terminal (+z). */
  park() {
    this.state = 'parked';
    this.pos.copy(this.home);
    this.pos.y = Math.max(this.home.y, this.ground(this.home.x, this.home.z));
    this.model.root.rotation.set(0, 0, 0);
    this.model.bob.rotation.set(0, 0, 0);
    this.model.flying = false;
    this.model.root.visible = true;
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

  /** Off it goes: walk to the runway's west end. */
  depart() {
    if (this.state !== 'parked') return;
    const h = this.home;
    const tz = AT.taxiZ;
    const rz = AT.runway.z;
    this.path = [v3(h.x, 0, tz), v3(this.rwStart - 8, 0, tz), v3(this.rwStart - 8, 0, rz), v3(this.rwStart, 0, rz)];
    this.state = 'taxiOut';
  }

  update(dt: number) {
    const m = this.model;
    switch (this.state) {
      case 'parked':
        animateCreature(m, dt, 0);
        return;
      case 'taxiOut':
      case 'taxiIn': {
        const sp = TY.taxiSpeed * this.boost;
        const done = this.follow(dt, sp, true);
        animateCreature(m, dt, sp);
        if (done) {
          if (this.state === 'taxiOut') {
            this.state = 'takeoff';
            this.speed = 2;
            this.path = [
              v3(this.rwStart + 70, this.ground(this.rwStart + 70, AT.runway.z), AT.runway.z),
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
        this.speed = Math.min(TY.takeoffSpeed * this.boost, this.speed + dt * 12);
        const airborne = this.pos.x > this.rwStart + 40;
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
          m.root.visible = false;
          this.onRoute();
        }
        return;
      }
      case 'route':
        this.routeT -= dt;
        if (this.routeT <= 0) {
          // Back from the west, lined up with the runway, coming down
          this.state = 'landing';
          this.wasUp = false;
          m.root.visible = true;
          m.flying = true;
          this.speed = TY.cruiseSpeed * this.boost;
          this.pos.set(this.rwStart - 160, TY.cruiseAlt, AT.runway.z + 60);
          const top = this.ground(this.rwStart, AT.runway.z);
          this.path = [v3(this.rwStart - 60, TY.cruiseAlt * 0.45, AT.runway.z), v3(this.rwStart + 6, top, AT.runway.z), v3(this.exitX(), top, AT.runway.z)];
          this.onApproach();
        }
        return;
      case 'landing': {
        const down = this.pos.y < this.ground(this.pos.x, this.pos.z) + 0.05;
        if (down) {
          m.flying = false;
          this.speed = Math.max(TY.taxiSpeed * this.boost, this.speed - dt * 16);
        }
        m.bob.rotation.x = THREE.MathUtils.lerp(m.bob.rotation.x, down ? 0 : 0.12, dt * 3);
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

  // --------------------------------------------------------------------------
  // ⏱️ Timing, for the flight board (estimates, in game seconds)
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
  /** Seconds until it leaves the ground (null: not heading out). */
  etaTakeoff(): number | null {
    if (this.state === 'taxiOut') return this.left() / (TY.taxiSpeed * this.boost) + 3;
    if (this.state === 'takeoff') return this.wasUp ? 0 : Math.max(0, (this.rwStart + 40 - this.pos.x) / Math.max(this.speed, 8));
    return null;
  }
  /** Seconds until it's parked at its gate again (null: it's parked). */
  etaGate(): number | null {
    const taxiIn = (Math.abs(this.exitX() - this.home.x) + Math.abs(AT.runway.z - AT.taxiZ) + Math.abs(AT.taxiZ - this.home.z)) / (TY.taxiSpeed * this.boost);
    const approach = 230 / (TY.cruiseSpeed * this.boost) + 2;
    switch (this.state) {
      case 'taxiOut':
      case 'takeoff':
        return (this.etaTakeoff() ?? 0) + 4 + TY.routeSecs / this.boost + approach + taxiIn;
      case 'route':
        return this.routeT + approach + taxiIn;
      case 'landing':
        return this.left() / Math.max(this.speed, TY.taxiSpeed) + taxiIn;
      case 'taxiIn':
        return this.left() / (TY.taxiSpeed * this.boost);
      default:
        return null;
    }
  }
  /** Seconds until it touches down (null: not in the air). */
  etaLanding(): number | null {
    if (this.state === 'route') return this.routeT + 230 / (TY.cruiseSpeed * this.boost) + 2;
    if (this.state === 'landing') return this.pos.y > this.ground(this.pos.x, this.pos.z) + 0.05 ? this.left() / Math.max(this.speed, 8) * 0.7 : 0;
    return null;
  }

  /** Where landing planes turn off the runway (east of the gates). */
  private exitX() {
    return Math.max(this.home.x + 30, 0);
  }

  /** Move along the path at `speed`; true when the last point is reached. `ground` keeps it on y = 0. */
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
