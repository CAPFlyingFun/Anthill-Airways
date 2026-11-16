// ============================================================================
// passengers.ts — 🐞 the travellers (v0.68): little bugs who fly Anthill Airways.
//
// Each passenger walks in from the lawn, joins the line at the terminal's check-in desk, checks in (pays for a
// ticket: the airfield pays the cash pad), walks to a gate and waits for its plane. When the plane is fuelled
// they walk out to it and climb onto a seat on its back. Passengers who ARRIVE on a plane climb down at the
// gate and walk off into the lawn.
//
// They're small aphids for now (a giant aphid is ~4–5 mm: they fit two to a ladybug). Bigger planes later will
// carry bigger travellers.
// ============================================================================
import * as THREE from 'three';
import { animateCreature, faceToward } from '../actors/models';
import { artBug, type ArtBug } from './art';
import { TY } from './data';

export type PaxState = 'arriving' | 'queue' | 'toGate' | 'waiting' | 'boarding' | 'seated' | 'leaving';

/** Aphid colours: green, pink, black, yellow. */
const TINTS = [0x7cc04a, 0xe58fb0, 0x3a3a3a, 0xe8d34a];

export class Pax {
  state: PaxState = 'arriving';
  /** Where it's walking to (and whether it's there). */
  target = new THREE.Vector3();
  there = false;
  /** Which gate it's flying from. */
  gate = -1;
  /** Walked round the terminal yet (on the way from check-in to the gates)? */
  rounded = false;
  constructor(public model: ArtBug) {}
  get pos() {
    return this.model.root.position;
  }
}

export interface FlowSpots {
  /** Where newcomers step out of the lawn, and where arrivals walk back into it. */
  edge: THREE.Vector3;
  exit: THREE.Vector3;
  /** The check-in desk (the front of the line stands here) and the way the line runs back from it. */
  desk: THREE.Vector3;
  lineDir: THREE.Vector3;
  /** Each gate's waiting spot (the line there runs along x). */
  gateWait: THREE.Vector3[];
  /** A corner to walk round on the way from check-in to the gates (so nobody walks through the terminal). */
  round: THREE.Vector3;
}

export class Passengers {
  /** Everyone around (any state). */
  all: Pax[] = [];
  /** The check-in line, front first. */
  line: Pax[] = [];
  /** Waiting at each gate. */
  atGate: Pax[][];
  /** Is someone at the desk (you, or the Check-in ant)? Set each frame by the airfield. */
  serving = false;
  /** How many gates are open (gate 2 is bought later). */
  gates = 1;
  /** Called when a passenger finishes checking in (the airfield pays + gives XP). */
  onCheckIn: (p: Pax) => void = () => {};
  private arriveT = 2;
  private checkT = 0;
  private tmp = new THREE.Vector3();

  constructor(private scene: THREE.Scene, private spots: FlowSpots, gateCount: number, private ground: (x: number, z: number) => number = () => 0) {
    this.atGate = Array.from({ length: gateCount }, () => []);
  }

  /** A new aphid. */
  private spawn(at: THREE.Vector3) {
    const m = artBug('aphid', TY.aphidLength * (0.9 + Math.random() * 0.2), { color: TINTS[Math.floor(Math.random() * TINTS.length)], seed: Math.floor(Math.random() * 1000) });
    m.root.position.copy(at);
    this.scene.add(m.root);
    const p = new Pax(m);
    this.all.push(p);
    return p;
  }

  /** Arriving passengers for a plane that's coming in to land (they ride in on its seats). */
  makeArrivals(n: number) {
    const out: Pax[] = [];
    for (let i = 0; i < n; i++) {
      const p = this.spawn(this.spots.edge);
      p.state = 'seated';
      out.push(p);
    }
    return out;
  }

  /** Climbed down off a plane: walk away into the lawn. */
  leave(p: Pax) {
    p.state = 'leaving';
    p.target.copy(this.spots.exit);
    p.there = false;
  }

  /** The next passengers to board at gate `g` (up to `n`), walking out to `to`. */
  callToBoard(g: number, n: number, to: THREE.Vector3) {
    const q = this.atGate[g];
    const called = q.splice(0, n);
    for (const p of called) {
      p.state = 'boarding';
      p.target.copy(to);
      p.there = false;
    }
    return called;
  }

  /** The line spot `i` places back from the desk. */
  private lineSpot(i: number, out: THREE.Vector3) {
    return out.copy(this.spots.desk).addScaledVector(this.spots.lineDir, 1.2 + i * 2.6);
  }

  /** The waiting spot `i` at gate `g`. */
  private gateSpot(g: number, i: number, out: THREE.Vector3) {
    // (two by two, back toward the terminal from the foot of the bridge's ramp)
    return out.copy(this.spots.gateWait[g]).add(this.tmp.set((i % 2) * 2.4 - 1.2, 0, 1.6 + Math.floor(i / 2) * 2.4));
  }

  update(dt: number) {
    // New travellers walk in while the line has room
    this.arriveT -= dt;
    if (this.arriveT <= 0 && this.line.length < TY.queueMax) {
      // (busier as the airport grows: each open gate brings more travellers)
      this.arriveT = (TY.arriveEvery / (0.6 + 0.4 * this.gates)) * (0.7 + Math.random() * 0.6);
      const p = this.spawn(this.spots.edge);
      p.state = 'queue';
      this.line.push(p);
    }

    // The line shuffles up; the front one checks in when someone's at the desk and a gate has room
    this.line.forEach((p, i) => this.lineSpot(i, p.target));
    const front = this.line[0];
    const gate = this.freeGate();
    if (front && this.serving && gate >= 0 && front.pos.distanceTo(front.target) < 1.2) {
      this.checkT += dt;
      if (this.checkT >= TY.checkInSecs) {
        this.checkT = 0;
        this.line.shift();
        front.gate = gate;
        front.state = 'toGate';
        front.there = false; // (it was standing at the desk: not yet at the terminal's corner)
        this.atGate[gate].push(front);
        this.onCheckIn(front);
      }
    } else {
      this.checkT = Math.min(this.checkT, TY.checkInSecs * 0.5);
    }
    this.atGate.forEach((q, g) => q.forEach((p, i) => {
      if (p.state === 'toGate' && !p.rounded) {
        // first round the terminal's corner, then on to the gate
        p.target.copy(this.spots.round);
        if (p.there) p.rounded = true;
        return;
      }
      this.gateSpot(g, i, p.target);
      if (p.state === 'toGate' && p.there) p.state = 'waiting';
    }));

    // Everyone walks (seated riders are carried by their plane)
    for (let i = this.all.length - 1; i >= 0; i--) {
      const p = this.all[i];
      if (p.state === 'seated') continue;
      this.walk(p, dt);
      if (p.state === 'leaving' && p.there) {
        p.model.root.removeFromParent();
        this.all.splice(i, 1);
      }
    }
  }

  /** The open gate with the fewest waiting (and room for more), or -1. */
  private freeGate() {
    let best = -1;
    for (let g = 0; g < this.gates; g++) {
      if (this.atGate[g].length >= 6) continue;
      if (best < 0 || this.atGate[g].length < this.atGate[best].length) best = g;
    }
    return best;
  }

  /** Step toward its target (legs going), turning to face where it walks. */
  private walk(p: Pax, dt: number) {
    const d = this.tmp.subVectors(p.target, p.pos).setY(0);
    const dist = d.length();
    if (dist < 0.15) {
      p.there = true;
      animateCreature(p.model, dt, 0);
      if (p.state === 'queue') faceToward(p.model, -this.spots.lineDir.x, -this.spots.lineDir.z, dt, 8);
      return;
    }
    p.there = false;
    const step = Math.min(dist, TY.passengerSpeed * dt);
    p.pos.addScaledVector(d.normalize(), step);
    p.pos.y = Math.max(p.target.y * (1 - Math.min(1, dist / 3)), this.ground(p.pos.x, p.pos.z)); // (up the ramp near the end)
    faceToward(p.model, d.x, d.z, dt, 10);
    animateCreature(p.model, dt, TY.passengerSpeed);
  }
}
