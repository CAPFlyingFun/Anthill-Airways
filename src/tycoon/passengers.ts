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
import { pace } from '../core/pace';
import { PEOPLE_LOD, setPersonLod } from '../actors/creatures';
import { newModel, type CreatureModel } from '../actors/models';
import { CROWD_HEIGHT, type Crowd, type CrowdPerson } from '../devRoom';
import { SIZE } from './scale';
import type { Nav } from './nav';
import * as THREE from 'three';
import { animateCreature, faceToward } from '../actors/models';
import { artBug, type ArtBug } from './art';
import { TY } from './data';
import { TextSprite } from '../world/labels';
import { MOOD, clampMood, faceFor } from './mood';

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
  /** 🧭 Its way round things to its target (nav.ts): the places to walk to in turn, where that was planned for, and on which grid. */
  route: THREE.Vector3[] | null = null;
  routeTo = new THREE.Vector3();
  routeOn = -1;
  /** Climbing down off a plane: how many of its waypoints are the gate's bridge and ramp (the rest are on the ground). */
  offBridge = 0;
  /** 😀 (v0.96, mood.ts) How it feels, 0 to 1; how long it's been in the state it's in (and which), and how long it
   *  has sat aboard a plane that hasn't gone (or circled one that hasn't landed). */
  mood = MOOD.start;
  waitT = 0;
  waitIn: PaxState | null = null;
  lateT = 0;
  /** 🛂👑 (v0.97) Out through the terminal's airside doorway already (on the way to a stop outside); its security
   *  lane (-1: queuing) and how long it's been in the arch; a VIP called from the lounge, on its way to board. */
  out = false;
  lane = -1;
  scanT = 0;
  /** Its place in the security queue, and its seat in the lounge (-1: none). */
  queueAt = 0;
  loungeSeat = -1;
  vipComing = false;
  /** Its face over its head (made the first time you come near). */
  face: TextSprite | null = null;
  faceShown = '';
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
  /** 🚸 More waypoints on the way out to gate `g` (v0.88: the crossing to the north field), walked back the other way by arrivals. */
  cross?: (g: number) => THREE.Vector3[];
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
  /** (v0.97) Outside the terminal (🛂 security, 👑 the lounge): walked to out through the airside doorway, and from
   *  it a traveller goes on straight to its gate (not back in through the terminal). */
  outside?: boolean;
  /** (v0.97) Where this traveller stands at the stop (a lane's arch, its place in the queue, a lounge seat): else the
   *  stop's spot, spread a little. */
  spotFor?: (p: Pax, out: THREE.Vector3) => THREE.Vector3;
}

/**
 * 🧍 THE TRAVELLERS ARE ALL THE CHARACTER BUILDER'S (v0.93.1; Joshua: "replace all the other male models, so it's
 * only the models from CCBS"). The story's men (h-jack, h-cadet... v0.78.1 to v0.93) are no longer downloaded.
 */
/** 🧍 How near two travellers come before the walking one is eased aside (world units; a person is about 1.3 across the shoulders). GAME TUNING. */
const PERSONAL = 1.25;
/** (a gate over the crossing: asked for its waypoints, which are the crossing's two ends) */
const GATES_ACROSS = 99;
/** How many of the builder's women wear the cloth tee (the rest a painted one). 0 since v0.82: the DEV Room's own
 * settings, "Cloth tee: off" (Joshua: "Match the settings exactly"); it was 0.7. */
const CLOTH_SHARE = 0;

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
  /** 🚸 May travellers walk over the crossing now? (v0.95: the airfield says no while a plane is on Runway 1 or its
   *  taxiway there.) They wait at the curb and cross once it's clear. */
  crossingOpen: () => boolean = () => true;
  /** ⭐ (v0.96) The rating's say in how often travellers come (mood.ts arriveMultFor), set by the airfield. */
  arriveMult = 1;
  /** 😀 What the airfield tells the moods each frame: a lizard on the runway, where you are (faces show near you),
   *  and whether a traveller is somewhere pleasant (by a flower). */
  lizard = false;
  /** 🛂 How many are queuing at security (the airfield counts them). */
  securityQueue = 0;
  you = new THREE.Vector3(1e9, 0, 1e9);
  pleasant: (p: Pax) => boolean = () => false;
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
  /** 👨 A man of the builder's (v0.93): his own random looks; no belly of a pregnancy. */
  private man(): (CreatureModel & { seats: THREE.Object3D[] }) | null {
    const him = this.crowd?.add({ bump: 0, cloth: false, male: true });
    if (!him) return null;
    const m = newModel(SIZE.person, SIZE.person * 0.3);
    m.root.scale.setScalar(SIZE.person / CROWD_HEIGHT);
    m.root.add(him.root);
    m.drive = (_dt, speed) => {
      him.speed = speed;
    };
    m.root.userData.crowd = him;
    m.root.userData.bump = 0;
    m.root.userData.sitDrop = SIZE.person * 0.47 * 0.82;
    return Object.assign(m, { seats: [] as THREE.Object3D[] });
  }
  /** A traveller has gone for good: what was hers alone is let go of. */
  gone(p: Pax) {
    (p.model.root.userData.crowd as CrowdPerson | undefined)?.dispose();
    if (p.face) { const m = p.face.sprite.material as THREE.SpriteMaterial; m.map?.dispose(); m.dispose(); p.face = null; }
  }

  people = false;
  /** Where the camera is (the airfield keeps it up to date): people are drawn by their distance from it. */
  eye = new THREE.Vector3();
  private lodT = 0;
  private person(): (CreatureModel & { seats: THREE.Object3D[] }) | null {
    if (!this.people) return null;
    // (half are men, half women: all of them the Character Builder's. v0.93.1, Joshua: "only the models from CCBS".
    // Until his body is in, a man's turn is a woman's; until hers is, travellers are aphids.)
    if (this.crowd?.men && Math.random() < 0.5) {
      const him = this.man();
      if (him) return him;
    }
    return this.crowd ? this.woman() : null;
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
    const person = p.model.biped || !!p.model.root.userData.crowd;
    if (person) {
      // (v0.83, Joshua: "Can we place the crowns or hats on top of their head so it looks better?" The crown was
      // at an aphid's height, in the middle of a person's chest or face. A person's sits on the top of her head:
      // its lower edge just into her hair, in the world's units whatever her own root is scaled by)
      const k = p.model.root.scale.y || 1, tall = SIZE.person * 0.24;
      crown.sprite.scale.set((tall * 2) / k, tall / k, 1);
      crown.sprite.position.y = (SIZE.person * 0.99 + tall * 0.3) / k;
    }
    p.model.root.add(crown.sprite);
  }

  /** Climbed down off a plane: walk away into the lawn. */
  leave(p: Pax, path: THREE.Vector3[] = [], gate = -1) {
    p.state = 'leaving';
    // (off the plane along the bridge and down its ramp, back over the crossing from a north gate, then out)
    p.via = [...path.map((v) => v.clone()), ...this.wayOut(gate).reverse(), this.spots.exit.clone()];
    p.offBridge = path.length;
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

  /** 🚸 The crossing's waypoints on the way out to gate `g` (none for the first field's gates). */
  private wayOut(g: number) {
    return g >= 0 ? (this.spots.cross?.(g) ?? []).map((v) => v.clone()) : [];
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
      this.arriveT = (TY.arriveEvery / (0.6 + 0.4 * this.gates) / this.arriveMult) * (0.7 + Math.random() * 0.6);
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
        front.out = false;
        front.lane = -1;
        front.via = front.stops.length ? [] : [...this.spots.outbound.map((v) => v.clone()), ...this.wayOut(gate)];
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
        // (🛂👑 v0.97: a stop outside is walked to out through the airside doorway)
        if (s.outside && !p.out) {
          if (!p.via.length) { p.via = this.spots.outbound.map((v) => v.clone()); p.target.copy(p.via[0]); p.there = false; }
          if (this.followVia(p)) return;
          p.out = true;
          p.there = false;
        }
        if (s.spotFor) s.spotFor(p, p.target);
        else p.target.copy(s.spot).add(this.tmp.set(((p.model.root.id % 5) - 2) * 0.9, 0, 0));
        if (p.there) {
          p.stopT += dt;
          let done = false;
          if (s.has(p)) {
            s.buy(p);
            // 😀 (v0.96) a stop they enjoyed, and the VIP lounge most of all
            p.mood = clampMood(p.mood + (s.key === 'lounge' ? MOOD.loungeLift : MOOD.stopLift));
            done = true;
          } else if (p.stopT > s.maxWait) done = true;
          if (done) {
            p.stops.shift();
            p.stopT = 0;
            p.there = false;
            // (out of the terminal already: straight on to the gate)
            if (!p.stops.length) p.via = [...(p.out ? [] : this.spots.outbound.map((v) => v.clone())), ...this.wayOut(g)];
          }
        }
        return;
      }
      if (p.state === 'toGate' && this.followVia(p)) return;
      this.gateSpot(g, i, p.target);
      if (p.state === 'toGate' && p.there) { p.state = 'waiting'; p.vipComing = false; }
    }));

    this.stepMoods(dt);

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
        // (the story's men: by how far from the camera, as in v0.77.1. The full model up close)
        const found = PEOPLE_LOD.findIndex((lv) => d <= lv.within), nearest = found < 0 ? PEOPLE_LOD.length - 1 : found;
        setPersonLod(p.model, nearest);
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
      // 🚸 at one end of the crossing with the other end next: wait at the curb while a plane is on the runway
      if (p.via.length > 1 && this.crossLeg(p.via[0], p.via[1]) && !this.crossingOpen()) return true;
      p.via.shift();
      if (p.offBridge > 0) p.offBridge--;
      p.there = false;
      if (!p.via.length) return false;
    }
    p.target.copy(p.via[0]);
    return true;
  }

  /**
   * 😀 Moods (v0.96, mood.ts): long waits in the line or at the gate wear on them, a crowded line too; a short line,
   * a flower nearby help a little; a lizard on the runway frets everyone on the ground. (Aboard a plane, the airfield
   * sees to it: a late plane.) Faces over their heads, only for those near you, a few times a second.
   */
  private faceT = 0;
  private stepMoods(dt: number) {
    for (const p of this.all) {
      if (p.waitIn !== p.state) { p.waitIn = p.state; p.waitT = 0; }
      p.waitT += dt;
      let d = 0;
      if (p.state === 'queue') {
        if (p.waitT > MOOD.queuePatience) d -= MOOD.queueDrop;
        if (this.line.length > MOOD.crowdLine) d -= MOOD.crowdDrop;
        else if (this.line.length <= MOOD.shortLine) d += MOOD.shortLift;
      } else if (p.state === 'waiting' && p.waitT > MOOD.gatePatience) d -= MOOD.gateDrop;
      else if (p.state === 'toGate' && p.out && p.lane < 0 && p.stops[0]?.key === 'security') {
        // 🛂 (v0.97) a long wait at security, and a crowded queue there
        if (p.stopT > MOOD.securityPatience) d -= MOOD.securityDrop;
        if (this.securityQueue > MOOD.crowdLine) d -= MOOD.crowdDrop;
      }
      if (p.state !== 'seated' && p.state !== 'boarding') {
        if (this.lizard) d -= MOOD.lizardDrop;
        if (p.state !== 'leaving' && this.pleasant(p)) d += MOOD.flowerLift;
      }
      if (d) p.mood = clampMood(p.mood + d * dt);
    }
    if ((this.faceT -= dt) > 0) return;
    this.faceT = 0.25;
    for (const p of this.all) {
      const near = p.state !== 'seated' && Math.hypot(p.pos.x - this.you.x, p.pos.z - this.you.z) < MOOD.faceNear;
      if (!near) { if (p.face) p.face.sprite.visible = false; continue; }
      if (!p.face) {
        // (over a person's head, or an aphid's; higher still over a VIP's crown, in the world's units whatever the
        // traveller's own root is scaled by)
        // (a label sets its own scale from its size whenever its text changes: the size is given here)
        const k = p.model.root.scale.y || 1, person = p.model.biped || !!p.model.root.userData.crowd;
        const size = person ? SIZE.person * 0.45 : 2.4;
        const top = person ? SIZE.person * (p.vip ? 1.5 : 1.3) : p.vip ? 4.6 : 3.0;
        p.face = new TextSprite(size / k);
        p.face.sprite.position.y = top / k;
        p.model.root.add(p.face.sprite);
      }
      const f = faceFor(p.mood);
      if (f !== p.faceShown) { p.face.setText(f); p.faceShown = f; }
      p.face.sprite.visible = true;
    }
  }

  /** 🚸 Is the walk from `a` to `b` the crossing itself (from one of its ends straight to the other)? */
  private crossLeg(a: THREE.Vector3, b: THREE.Vector3) {
    const ends = this.spots.cross?.(GATES_ACROSS);
    if (!ends || ends.length < 2) return false;
    const at = (v: THREE.Vector3, e: THREE.Vector3) => Math.abs(v.x - e.x) < 0.5 && Math.abs(v.z - e.z) < 0.5;
    return (at(a, ends[0]) && at(b, ends[1])) || (at(a, ends[1]) && at(b, ends[0]));
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

  /** 🧭 The airport's grid (the airfield hands it over): without one, travellers walk straight as they did. */
  nav: Nav | null = null;

  /** Step toward its target (legs going), turning to face where it walks: round what is in the way (nav.ts). */
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
    // 🧭 on the ground it follows a path; on a gate's bridge and ramp (boarding, climbing down) its waypoints are the way
    const onGround = p.state !== 'boarding' && !(p.state === 'leaving' && p.offBridge > 0);
    if (this.nav && onGround) {
      if (!p.route || p.routeOn !== this.nav.version || p.routeTo.distanceToSquared(p.target) > 0.04) {
        p.route = this.nav.path(p.pos, p.target);
        p.routeTo.copy(p.target);
        p.routeOn = this.nav.version;
      }
      while (p.route.length > 1 && Math.hypot(p.route[0].x - p.pos.x, p.route[0].z - p.pos.z) < 0.3) p.route.shift();
      if (p.route.length > 1) d.subVectors(p.route[0], p.pos).setY(0);
    } else p.route = null;
    const leg = d.length();
    // (v0.93.4: the travellers follow Settings' Movement speed, as the ants do: 0.5x is about a real person's walk)
    const step = Math.min(leg, TY.passengerSpeed * pace.move * dt);
    if (leg > 1e-6) p.pos.addScaledVector(d.normalize(), step);
    // 🧍 not through one another: a walker is eased aside from anybody within a shoulder's width (never into a wall)
    // (not on its last steps: a place at a counter is closer to its neighbours than that, and it has to get there)
    if (this.nav && onGround && dist > PERSONAL * 1.4) {
      let px = 0, pz = 0;
      for (const q of this.all) {
        if (q === p || q.state === 'seated' || Math.abs(q.pos.y - p.pos.y) > 1) continue;
        const dx = p.pos.x - q.pos.x, dz = p.pos.z - q.pos.z, gap = Math.hypot(dx, dz);
        if (gap < PERSONAL && gap > 1e-4) { px += (dx / gap) * (PERSONAL - gap); pz += (dz / gap) * (PERSONAL - gap); }
      }
      if (px || pz) {
        const nx = p.pos.x + px * Math.min(1, dt * 6), nz = p.pos.z + pz * Math.min(1, dt * 6);
        if (this.nav.free(nx, nz)) { p.pos.x = nx; p.pos.z = nz; }
      }
    }
    if (p.state === 'boarding' || p.state === 'leaving') {
      // (on the bridge: its height runs straight from one waypoint to the next: up the ramp, level along the deck)
      p.pos.y = Math.max(p.pos.y + (p.target.y - p.pos.y) * Math.min(1, step / dist), this.ground(p.pos.x, p.pos.z));
    } else p.pos.y = Math.max(p.target.y * (1 - Math.min(1, dist / 3)), this.ground(p.pos.x, p.pos.z)); // (up the ramp near the end)
    faceToward(p.model, d.x, d.z, dt, 10);
    animateCreature(p.model, dt, TY.passengerSpeed * pace.move);
  }
}
