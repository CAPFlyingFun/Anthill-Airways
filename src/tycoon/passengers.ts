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
import { PEOPLE_LOD, hasModel, setPersonLod, spawnHuman, type HumanKind } from '../actors/creatures';
import { newModel, type CreatureModel } from '../actors/models';
import { CROWD_HEIGHT, type Crowd, type CrowdPerson } from '../devRoom';
import { SIZE } from './scale';
import * as THREE from 'three';
import { animateCreature, faceToward } from '../actors/models';
import { artBug, type ArtBug } from './art';
import { TY } from './data';
import { TextSprite } from '../world/labels';

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
  /** Waypoints still to walk through before its target (into the terminal, out to the gates). */
  via: THREE.Vector3[] = [];
  /** Stops still to make on the way to the gate (🍪 café, 🎁 gift shop, 👑 VIP lounge), and how long it's
   *  waited at the current one. */
  stops: Stop[] = [];
  stopT = 0;
  /** 👑 A VIP (v0.70): pays more, relaxes in the lounge, boards first. */
  vip = false;
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
  /** Waypoints from the lawn into the line (the terminal's front door), and from the desk out to the gates
   *  (through the terminal's airside doorway), so nobody walks through a wall. */
  inbound: THREE.Vector3[];
  outbound: THREE.Vector3[];
}

/**
 * A place passengers stop at between check-in and the gate (v0.70; the 🍪 café was the first): where they stand,
 * who stops (`who`), whether there's something for them (`has`), and what happens (`buy`: the airfield pays the
 * cash pad). They give up after `maxWait` seconds if there's nothing.
 */
export interface Stop {
  key: string;
  spot: THREE.Vector3;
  who: (p: Pax) => boolean;
  has: (p: Pax) => boolean;
  buy: (p: Pax) => void;
  maxWait: number;
}

/** 🧍 Everyone who flies (the story's cast: actors/cast.ts). The expecting looks come up less often: about 1 in 8. */
const PEOPLE: { file: HumanKind; weight: number }[] = [
  ...(['h-jack', 'h-jacklab', 'h-cadet', 'h-director', 'h-enigma', 'h-balance', 'h-azure', 'h-ember', 'h-crew1', 'h-crew2', 'h-crew3', 'h-crew4'] as HumanKind[]).map((file) => ({ file, weight: 1 })),
  ...(['h-sarah', 'h-sarah2', 'h-grace', 'h-exec', 'h-balance2'] as HumanKind[]).map((file) => ({ file, weight: 0.35 })),
];
/** With the builder's women in, the story's models that walk in are these (its women's are theirs now). */
const MEN = PEOPLE.filter((k) => !['h-enigma', 'h-balance', 'h-azure', 'h-sarah', 'h-sarah2', 'h-grace', 'h-exec', 'h-balance2'].includes(k.file));
/** How many of the builder's women wear the cloth tee (the rest a painted one). GAME TUNING. */
const CLOTH_SHARE = 0.7;
/** Every model the tiny people need (downloaded when the switch goes on). */
export const PEOPLE_FILES = PEOPLE.map((p) => p.file);

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
  /** 🍪🎁👑 The stops that are open, in the order passengers visit them. */
  stops: Stop[] = [];
  /** 👑 The share of new travellers who are VIPs (0 until the lounge opens). */
  vipChance = 0;
  /** How long the check-in line gets, and how many may wait at each gate (⬆️ upgrades). */
  queueMax: number = TY.queueMax;
  gateCap: number[] = [];
  /** x check-in speed (⬆️ staff). */
  checkMult = 1;
  /** Called when a passenger finishes checking in (the airfield pays + gives XP). */
  onCheckIn: (p: Pax) => void = () => {};
  private arriveT = 2;
  private checkT = 0;
  private tmp = new THREE.Vector3();

  constructor(private scene: THREE.Scene, private spots: FlowSpots, gateCount: number, private ground: (x: number, z: number) => number = () => 0) {
    this.atGate = Array.from({ length: gateCount }, () => []);
  }

  /**
   * 🧍 TINY PEOPLE (v0.77): travellers are TRADDOMIUM's miniature people (the story's cast, at their true 1:180
   * size) instead of aphids. Whoever's model has arrived is in the mix; until one has, they're aphids.
   */
  /**
   * 👩 THE BUILDER'S WOMEN (v0.78): once the Character Builder's body has loaded, every woman who flies is one of
   * its people (devRoom.ts's crowd: one body cloned, each with her own hair, face, height, outfit and belly), and
   * the story's models are the men. Until then, the story's cast as before.
   */
  crowd: Crowd | null = null;
  private woman(): (CreatureModel & { seats: THREE.Object3D[] }) | null {
    // Joshua's belly sizes (2026-11-17): 82% of women 0-35%, 10% 36-50%, 5% 51-80%, 3% 81-140%
    const r = Math.random(), within = (lo: number, hi: number) => Math.round(lo + Math.random() * (hi - lo));
    const bump = r < 0.82 ? within(0, 35) : r < 0.92 ? within(36, 50) : r < 0.97 ? within(51, 80) : within(81, 140);
    // (most wear the builder's cloth tee, simulated onto her and then frozen; the rest a painted one)
    const her = this.crowd?.add({ bump, cloth: Math.random() < CLOTH_SHARE });
    if (!her) return null;
    const m = newModel(SIZE.person, SIZE.person * 0.3);
    m.root.scale.setScalar(SIZE.person / CROWD_HEIGHT);
    m.root.add(her.root);
    m.drive = (_dt, speed) => {
      her.speed = speed;
    };
    m.root.userData.crowd = her;
    m.root.userData.bump = bump;
    m.root.userData.sitDrop = SIZE.person * 0.47 * 0.82;
    return Object.assign(m, { seats: [] as THREE.Object3D[] });
  }
  /** A traveller has gone for good: what was hers alone is let go of. */
  gone(p: Pax) {
    (p.model.root.userData.crowd as CrowdPerson | undefined)?.dispose();
  }

  people = false;
  /** Where the camera is (the airfield keeps it up to date): people are drawn by their distance from it. */
  eye = new THREE.Vector3();
  private lodT = 0;
  private person(): (CreatureModel & { seats: THREE.Object3D[] }) | null {
    if (!this.people) return null;
    // (half are women: the builder's, once its body is in)
    if (this.crowd && Math.random() < 0.5) {
      const her = this.woman();
      if (her) return her;
    }
    const ready = (this.crowd ? MEN : PEOPLE).filter((k) => hasModel(k.file));
    if (!ready.length) return null;
    let roll = Math.random() * ready.reduce((a, k) => a + k.weight, 0);
    const pick = ready.find((k) => (roll -= k.weight) <= 0) ?? ready[0];
    const m = spawnHuman(pick.file, SIZE.person * (0.93 + Math.random() * 0.12));
    if (!m) return null;
    setPersonLod(m, PEOPLE_LOD.length - 1); // (the lightest until the next look at how far away she is)
    m.root.userData.sitDrop = (m.biped?.legLen ?? m.height * 0.47) * 0.82; // (astride the bug: see Plane.seat)
    return Object.assign(m, { seats: [] as THREE.Object3D[] });
  }

  /** The next traveller walks in now (the tiny people have just arrived: something to see straight away). */
  hurry() {
    this.arriveT = 0;
  }

  /** A new traveller: an aphid, or one of the tiny people. */
  private spawn(at: THREE.Vector3) {
    const m = this.person() ?? artBug('aphid', TY.aphidLength * (0.9 + Math.random() * 0.2), { color: TINTS[Math.floor(Math.random() * TINTS.length)], seed: Math.floor(Math.random() * 1000) });
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

  /** 👑 Make `p` a VIP: a golden aphid with a crown over its head. */
  private makeVip(p: Pax) {
    p.vip = true;
    // (an aphid turns gold; a person keeps her own clothes and wears the crown)
    if (!p.model.biped && !p.model.root.userData.crowd) p.model.root.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (m && 'color' in m && (o as THREE.Mesh).isMesh) {
        const gold = m.clone();
        gold.color.lerp(new THREE.Color(0xffc93a), 0.9);
        gold.metalness = 0.4;
        (o as THREE.Mesh).material = gold;
      }
    });
    const crown = new TextSprite(1.15, '#ffd166');
    crown.setText('👑');
    crown.sprite.position.y = 2.6;
    p.model.root.add(crown.sprite);
  }

  /** Climbed down off a plane: walk away into the lawn. */
  leave(p: Pax, path: THREE.Vector3[] = []) {
    p.state = 'leaving';
    // (off the plane along the bridge and down its ramp, then out)
    p.via = [...path.map((v) => v.clone()), this.spots.exit.clone()];
    p.target.copy(p.via[0]);
    p.there = false;
  }

  /** The next passengers to board at gate `g` (up to `n`), walking `path`: the ramp's foot, its top, the plane's door. */
  callToBoard(g: number, n: number, path: THREE.Vector3[]) {
    const q = this.atGate[g];
    // (only those already waiting at the gate: not ones still at the café or on their way; 👑 VIPs first)
    const called = q.filter((p) => p.state === 'waiting').sort((a, b) => Number(b.vip) - Number(a.vip)).slice(0, n);
    for (const p of called) q.splice(q.indexOf(p), 1);
    for (const p of called) {
      p.state = 'boarding';
      p.via = path.map((v) => v.clone());
      p.target.copy(p.via[0]);
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
    if (this.arriveT <= 0 && this.line.length < this.queueMax) {
      // (busier as the airport grows: each open gate brings more travellers)
      this.arriveT = (TY.arriveEvery / (0.6 + 0.4 * this.gates)) * (0.7 + Math.random() * 0.6);
      const p = this.spawn(this.spots.edge);
      p.state = 'queue';
      p.via = this.spots.inbound.map((v) => v.clone());
      if (Math.random() < this.vipChance) this.makeVip(p);
      this.line.push(p);
    }

    // The line shuffles up; the front one checks in when someone's at the desk and a gate has room
    this.line.forEach((p, i) => {
      if (this.followVia(p)) return;
      this.lineSpot(i, p.target);
    });
    const front = this.line[0];
    const gate = this.freeGate();
    if (front && !front.via.length && this.serving && gate >= 0 && front.pos.distanceTo(front.target) < 1.2) {
      this.checkT += dt * this.checkMult;
      if (this.checkT >= TY.checkInSecs) {
        this.checkT = 0;
        this.line.shift();
        front.gate = gate;
        front.state = 'toGate';
        front.there = false; // (it was standing at the desk: on its way now)
        // its stops first (the café, the shop, the lounge for a VIP), then out through the airside doorway
        front.stops = this.stops.filter((s) => s.who(front));
        front.stopT = 0;
        front.via = front.stops.length ? [] : this.spots.outbound.map((v) => v.clone());
        this.atGate[gate].push(front);
        this.onCheckIn(front);
      }
    } else {
      this.checkT = Math.min(this.checkT, TY.checkInSecs * 0.5);
    }
    this.atGate.forEach((q, g) => q.forEach((p, i) => {
      if (p.state === 'toGate' && p.stops.length) {
        // 🍪🎁👑 at a stop: buy (or relax), or give up after a while if there's nothing; then the next one
        const s = p.stops[0];
        p.target.copy(s.spot).add(this.tmp.set(((p.model.root.id % 5) - 2) * 0.9, 0, 0));
        if (p.there) {
          p.stopT += dt;
          let done = false;
          if (s.has(p)) {
            s.buy(p);
            done = true;
          } else if (p.stopT > s.maxWait) done = true;
          if (done) {
            p.stops.shift();
            p.stopT = 0;
            p.there = false;
            if (!p.stops.length) p.via = this.spots.outbound.map((v) => v.clone());
          }
        }
        return;
      }
      if (p.state === 'toGate' && this.followVia(p)) return;
      this.gateSpot(g, i, p.target);
      if (p.state === 'toGate' && p.there) p.state = 'waiting';
    }));

    // 🧍 People are drawn by how far they are from the camera (a few times a second): the full model up close,
    // lighter triangle lists further off (creatures.ts PEOPLE_LOD: the DEV Room's "Auto", in the people's own metres)
    if ((this.lodT -= dt) <= 0) {
      this.lodT = 0.25;
      const metre = SIZE.person / 1.7;
      for (const p of this.all) {
        // (a woman of the builder's stands still once she's riding: the crowd sees to how she's drawn itself)
        const her = p.model.root.userData.crowd as CrowdPerson | undefined;
        if (her && p.state === 'seated') her.speed = 0;
        if (!p.model.biped) continue;
        const d = p.model.root.getWorldPosition(this.tmp).distanceTo(this.eye) / metre;
        setPersonLod(p.model, PEOPLE_LOD.findIndex((lv) => d <= lv.within));
      }
    }

    // Everyone walks (seated riders are carried by their plane)
    for (let i = this.all.length - 1; i >= 0; i--) {
      const p = this.all[i];
      if (p.state === 'seated') continue;
      if (p.state === 'boarding' || p.state === 'leaving') this.followVia(p); // (along the bridge, one waypoint at a time)
      this.walk(p, dt);
      if (p.state === 'leaving' && p.there && !p.via.length) {
        p.model.root.removeFromParent();
        this.gone(p);
        this.all.splice(i, 1);
      }
    }
  }

  /** Walking through waypoints: aims at the next one, drops it once there. False when there are none left. */
  private followVia(p: Pax) {
    if (!p.via.length) return false;
    if (p.there && p.target.distanceTo(p.via[0]) < 0.01) {
      p.via.shift();
      p.there = false;
      if (!p.via.length) return false;
    }
    p.target.copy(p.via[0]);
    return true;
  }

  /** The open gate with the fewest waiting (and room for more), or -1. */
  private freeGate() {
    let best = -1;
    for (let g = 0; g < this.gates; g++) {
      if (this.atGate[g].length >= (this.gateCap[g] ?? 6)) continue;
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
    if (p.state === 'boarding' || p.state === 'leaving') {
      // (on the bridge: its height runs straight from one waypoint to the next: up the ramp, level along the deck)
      p.pos.y = Math.max(p.pos.y + (p.target.y - p.pos.y) * Math.min(1, step / dist), this.ground(p.pos.x, p.pos.z));
    } else p.pos.y = Math.max(p.target.y * (1 - Math.min(1, dist / 3)), this.ground(p.pos.x, p.pos.z)); // (up the ramp near the end)
    faceToward(p.model, d.x, d.z, dt, 10);
    animateCreature(p.model, dt, TY.passengerSpeed);
  }
}
