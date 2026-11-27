// ============================================================================
// events.ts — 🦎 EVENTS & VISITORS (v0.70): a little something happening at the airfield every few minutes.
//
//   🦎 LIZARD ON THE RUNWAY — a young anole wanders out of the lawn and lies down across the runway to sunbathe
//      (flashing its dewlap). Nothing can take off or land until it goes: walk up to it to shoo it away (a reward),
//      or wait about 40 s and it wanders off by itself (no reward).
//   (🌧️ the DEW SHOWER that was here is the sky's RAIN since v0.91: tycoon/weather.ts)
//   🪶 BIRD FLYOVER — a huge shadow sweeps over the field and a bird drops a FEATHER somewhere on the airfield:
//      walk over it within a minute for a bonus.
//   (v0.99, Phase 5 of the plan: "New surprises beside the lizard and the feather, each with something to do and a
//    reward")
//   🕸️ SPIDER WEB OVER A GATE — a jumping spider strings a web across a gate's waiting area: that gate can't board
//      until you walk over and clear it (a reward). Left alone, the janitor ants clear it after two minutes.
//   🐦 A BIRD SWOOPS OVER THE RUNWAY — a sparrow circles low over Runway 1: planes hold until it's gone. Walk out
//      under it to shoo it, like the lizard (a reward), or it flies off by itself after a while.
//   🧳 LOST BAG HUNT — a traveller's bag fell off a cart somewhere on the field: find it, carry it back to the
//      BAG DROP, and its owner tips you.
//   👑 VIP CHARTER — a VIP books a gate's plane: if it takes off within the time limit, a big bonus.
//
// The airfield asks: is the runway blocked (`runwayBlocked`), and what to show on
// the minimap (`markers`). Only played time counts, and nothing happens during the tutorial.
// ============================================================================
import * as THREE from 'three';
import { animateCreature, faceToward } from '../actors/models';
import type { Hud } from '../ui/hud';
import type { Sfx } from '../core/audio';
import { artBug, type ArtBug } from './art';
import { TextSprite } from '../world/labels';
import { AT } from './data';
import { mat, mesh } from './kit';

export interface EventHooks {
  scene: THREE.Scene;
  camera: THREE.Camera;
  hud: Hud;
  sfx: Sfx;
  player: () => THREE.Vector3;
  /** Pay a reward (and XP). */
  reward: (cash: number, xp: number, at: THREE.Vector3, text: string) => void;
  /** Your level (rewards grow with it). */
  level: () => number;
  /** (v0.99) The open gates: where each one's travellers wait, and whether its plane is parked there now. */
  gates: () => { i: number; at: THREE.Vector3; parked: boolean }[];
  /** (v0.99) Where the BAG DROP is (a lost bag is taken back there). */
  bagDrop: () => THREE.Vector3;
}

type Kind = 'lizard' | 'feather' | 'web' | 'bird' | 'bag' | 'charter';
/** How long each new one lasts before it ends by itself (s). GAME TUNING. */
const LAST = { web: 120, bird: 45, bag: 120, charter: 100 };

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
/** Where a dropped feather can land: open ground around the airfield (not on buildings or the runway). */
const FEATHER_SPOTS = [v3(-46, 0, 20), v3(24, 0, 2), v3(-4, 0, 36), v3(50, 0, 18), v3(-28, 0, -26), v3(26, 0, -26), v3(4, 0, -6), v3(-60, 0, -6)];

export class Events {
  /** 🦎 The runway is closed (the lizard is on it, or 🐦 a bird is swooping over it). */
  runwayBlocked = false;
  /** What's closed it, for the flight cards (v0.99). */
  get blockedBy() {
    return this.bird ? { icon: '🐦', name: 'BIRD OVER THE RUNWAY' } : { icon: '🦎', name: 'LIZARD ON THE RUNWAY' };
  }
  private wait = 100;
  private last: Kind | null = null;
  private kind: Kind | null = null;
  private t = 0;
  // 🦎
  private lizard: ArtBug | null = null;
  private lizState: 'in' | 'sun' | 'out' = 'in';
  private lizPath: THREE.Vector3[] = [];
  private shooed = false;
  /** ⚠️ The warning floating over the lizard (v0.72.2). */
  private lizWarn: TextSprite | null = null;
  // 🪶
  private feather: THREE.Group | null = null;
  private shadow: THREE.Mesh | null = null;
  // 🕸️ (the gate it's on: that gate doesn't board)
  webGate = -1;
  private web: THREE.Group | null = null;
  private webAt = new THREE.Vector3();
  // 🐦
  private bird: THREE.Group | null = null;
  private birdState: 'in' | 'circle' | 'out' = 'in';
  private birdShooed = false;
  private birdMark: THREE.Mesh | null = null;
  // 🧳 (on the ground, then on your back)
  private bag: THREE.Group | null = null;
  private bagCarried = false;
  // 👑 (the gate booked, and its countdown over it)
  charterGate = -1;
  private charterSign: TextSprite | null = null;
  private charterAt = new THREE.Vector3();

  constructor(private h: EventHooks) {}

  /** What to show on the minimap. */
  markers(): { x: number; z: number; icon: string; label?: string; alert?: boolean }[] {
    if (this.lizard && this.lizState !== 'out') return [{ x: this.lizard.root.position.x, z: this.lizard.root.position.z, icon: '🦎', label: 'Shoo!', alert: true }];
    if (this.feather) return [{ x: this.feather.position.x, z: this.feather.position.z, icon: '🪶', alert: true }];
    if (this.web) return [{ x: this.webAt.x, z: this.webAt.z, icon: '🕸️', label: 'Clear it!', alert: true }];
    if (this.bird && this.birdState !== 'out') return [{ x: AT.runway.x, z: AT.runway.z, icon: '🐦', label: 'Shoo!', alert: true }];
    if (this.bag) {
      const at = this.bagCarried ? this.h.bagDrop() : this.bag.position;
      return [{ x: at.x, z: at.z, icon: '🧳', label: this.bagCarried ? 'Bring it' : 'Lost bag', alert: true }];
    }
    if (this.charterGate >= 0) return [{ x: this.charterAt.x, z: this.charterAt.z, icon: '👑', label: 'Charter', alert: true }];
    return [];
  }

  /**
   * ⚠️ What's going on right now, for the alert above the flight chips (v0.72.2: it stays up for as long as the
   * event does, so you always know why the planes are circling). `at` = where to look (tap the alert), `bad` = red.
   */
  alert(): { text: string; at: THREE.Vector3 | null; bad: boolean } | null {
    if (this.lizard && this.lizState !== 'out') return { text: '⚠️ 🦎 LIZARD ON THE RUNWAY · walk up to it to shoo it!', at: this.lizard.root.position, bad: true };
    if (this.feather) return { text: '🪶 A feather dropped · find it for a bonus', at: this.feather.position, bad: false };
    if (this.web) return { text: `⚠️ 🕸️ WEB OVER GATE ${this.webGate + 1} · walk over to clear it!`, at: this.webAt, bad: true };
    if (this.bird && this.birdState !== 'out') return { text: '⚠️ 🐦 BIRD OVER THE RUNWAY · walk out under it to shoo it!', at: new THREE.Vector3(AT.runway.x, 0, AT.runway.z), bad: true };
    if (this.bag) return this.bagCarried ? { text: '🧳 Take the lost bag to the BAG DROP', at: this.h.bagDrop(), bad: false } : { text: '🧳 A bag was lost on the field · find it', at: this.bag.position, bad: false };
    if (this.charterGate >= 0) return { text: `👑 VIP CHARTER at Gate ${this.charterGate + 1} · get it off in ${Math.ceil(LAST.charter - this.t)} s!`, at: this.charterAt, bad: false };
    return null;
  }

  /** Something to walk to right now (for the tutorial-style arrow), or null. */
  get target() {
    if (this.lizard && this.lizState === 'sun') return this.lizard.root.position;
    if (this.web) return this.webAt;
    if (this.bird && this.birdState === 'circle') return new THREE.Vector3(AT.runway.x, 0, AT.runway.z);
    if (this.bag) return this.bagCarried ? this.h.bagDrop() : this.bag.position;
    return this.feather?.position ?? null;
  }

  /** 👑 A gate's plane took off (the airfield says so): a charter's bonus, if that was the one booked. */
  airborne(gate: number) {
    if (this.kind !== 'charter' || gate !== this.charterGate) return;
    const lv = this.h.level();
    this.h.reward(150 + 40 * lv, 40, this.charterAt.clone().setY(10), '👑 Charter on time!');
    this.h.sfx.unlocked();
    this.endCharter();
  }

  update(dt: number, active: boolean) {
    if (!active) return;
    if (!this.kind) {
      this.wait -= dt;
      if (this.wait <= 0) this.start();
      return;
    }
    this.t += dt;
    if (this.kind === 'lizard') this.updateLizard(dt);
    else if (this.kind === 'feather') this.updateFeather(dt);
    else if (this.kind === 'web') this.updateWeb(dt);
    else if (this.kind === 'bird') this.updateBird(dt);
    else if (this.kind === 'bag') this.updateBag(dt);
    else this.updateCharter();
  }

  /** Start one now (the next one, or `kind`: for a test). */
  start(kind?: Kind) {
    if (this.kind) return;
    // (never the same one twice running; a web or a charter only with an open gate, a charter's with its plane in)
    const gates = this.h.gates();
    const can = (k: Kind) => k !== this.last && (k !== 'web' || gates.length > 0) && (k !== 'charter' || gates.some((g) => g.parked));
    const kinds = (['lizard', 'feather', 'web', 'bird', 'bag', 'charter'] as Kind[]).filter(can);
    const k = kind ?? kinds[Math.floor(Math.random() * kinds.length)];
    this.kind = this.last = k;
    this.t = 0;
    if (k === 'web') return this.startWeb();
    if (k === 'bird') return this.startBird();
    if (k === 'bag') return this.startBag();
    if (k === 'charter') return this.startCharter();
    if (k === 'lizard') {
      // in from the lawn north of the runway, to lie across it somewhere along its middle
      const rw = AT.runway;
      const x = rw.x + (Math.random() - 0.5) * rw.length * 0.5;
      this.lizard = artBug('anole', 45, { seed: Math.floor(Math.random() * 99) });
      this.lizard.root.position.set(x - 20, 0, rw.z - 70);
      this.h.scene.add(this.lizard.root);
      this.lizWarn = new TextSprite(2.2, '#ff6b6b');
      this.lizWarn.setText('⚠️ SHOO ME!');
      this.h.scene.add(this.lizWarn.sprite);
      this.lizPath = [v3(x - 6, 0, rw.z - 26), v3(x, 0, rw.z)];
      this.lizState = 'in';
      this.shooed = false;
      this.h.hud.banner('🦎 Lizard on the runway!', 'Nothing can take off or land: walk up to it to shoo it away', 4200);
      this.h.sfx.risky();
    } else {
      // a big shadow sweeps over the field first, then the feather drifts down
      const sh = new THREE.Mesh(new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x1a1a1a, transparent: true, opacity: 0.32, depthWrite: false }));
      sh.scale.set(70, 1, 34);
      sh.position.set(160, 0.15, -10);
      sh.renderOrder = 2;
      this.h.scene.add(sh);
      this.shadow = sh;
      this.h.hud.banner('🪶 A bird flew over!', 'It dropped a feather somewhere on the airfield: find it for a bonus', 4000);
    }
  }

  private end() {
    this.kind = null;
    this.wait = 150 + Math.random() * 90;
    this.t = 0;
  }

  // ---- 🦎 ----
  private updateLizard(dt: number) {
    const m = this.lizard!;
    const p = m.root.position;
    const me = this.h.player();
    // (the warning bobs over its back until it's been sent off)
    if (this.lizWarn) {
      this.lizWarn.sprite.position.set(p.x, 15 + Math.sin(this.t * 4) * 1.2, p.z);
      this.lizWarn.sprite.visible = this.lizState !== 'out';
    }
    const walk = (speed: number) => {
      const next = this.lizPath[0];
      if (!next) return true;
      const d = Math.hypot(next.x - p.x, next.z - p.z);
      const step = Math.min(d, speed * dt);
      if (d > 1e-3) {
        p.x += ((next.x - p.x) / d) * step;
        p.z += ((next.z - p.z) / d) * step;
        faceToward(m, next.x - p.x, next.z - p.z, dt, 3);
      }
      if (d - step < 0.05) this.lizPath.shift();
      animateCreature(m, dt, speed);
      return !this.lizPath.length;
    };
    if (this.lizState === 'in') {
      // (the runway's closed as soon as it's at the edge)
      this.runwayBlocked = Math.abs(p.z - AT.runway.z) < 24;
      if (walk(9)) {
        this.lizState = 'sun';
        this.t = 0;
      }
    } else if (this.lizState === 'sun') {
      this.runwayBlocked = true;
      faceToward(m, 1, 0.15, dt, 1); // (lying across the runway)
      animateCreature(m, dt, 0);
      const near = Math.hypot(me.x - p.x, me.z - p.z) < 18;
      if (near || this.t > 40) {
        this.shooed = near;
        this.lizState = 'out';
        (m.root.userData.popDewlap as (() => void) | undefined)?.();
        this.lizPath = [v3(p.x + 18, 0, p.z - 40), v3(p.x + 40, 0, p.z - 110)];
        if (near) {
          const lv = this.h.level();
          this.h.reward(30 + 12 * lv, 20, p.clone().setY(8), '🦎 Shooed!');
          this.h.sfx.unlocked();
        } else this.h.hud.banner('🦎 The lizard wandered off', 'The runway is open again', 2400);
      }
    } else {
      // scurrying away (fast), the runway opens once it's off it
      this.runwayBlocked = Math.abs(p.z - AT.runway.z) < 14;
      if (walk(this.shooed ? 30 : 12)) {
        m.root.removeFromParent();
        this.lizWarn?.sprite.removeFromParent();
        this.lizWarn = null;
        this.lizard = null;
        this.runwayBlocked = false;
        this.end();
      }
    }
  }

  // ---- 🪶 ----
  private updateFeather(dt: number) {
    const sh = this.shadow;
    if (sh) {
      sh.position.x -= dt * 90;
      if (sh.position.x < -170) {
        sh.removeFromParent();
        this.shadow = null;
        this.dropFeather();
      }
      return;
    }
    const f = this.feather;
    if (!f) return this.end();
    // drifting down, rocking side to side, then lying on the ground
    if (f.position.y > 0.3) {
      f.position.y = Math.max(0.3, f.position.y - dt * 6);
      f.rotation.z = Math.sin(this.t * 3) * 0.5;
    } else f.rotation.z = 0;
    f.rotation.y += dt * 0.4;
    const me = this.h.player();
    if (Math.hypot(me.x - f.position.x, me.z - f.position.z) < 3.5) {
      const lv = this.h.level();
      this.h.reward(25 + 10 * lv, 15, f.position.clone().setY(3), '🪶 Feather!');
      this.h.sfx.cash();
      f.removeFromParent();
      this.feather = null;
      this.end();
    } else if (this.t > 70) {
      f.removeFromParent();
      this.feather = null;
      this.end();
    }
  }

  private dropFeather() {
    const at = FEATHER_SPOTS[Math.floor(Math.random() * FEATHER_SPOTS.length)];
    const g = new THREE.Group();
    // a soft white vane (a flattened, pointed ellipsoid) with a grey quill down the middle
    const vane = mesh(new THREE.SphereGeometry(1, 16, 8).scale(1.1, 0.12, 4), mat(0xf6f4ee, { rough: 0.9 }));
    const quill = mesh(new THREE.CylinderGeometry(0.08, 0.04, 9.5, 6).rotateX(Math.PI / 2), mat(0x9a948a, { rough: 0.6 }));
    quill.position.y = 0.1;
    g.add(vane, quill);
    g.position.copy(at).setY(28);
    this.h.scene.add(g);
    this.feather = g;
    this.t = 0;
  }

  // ---- 🕸️ SPIDER WEB OVER A GATE ----
  private startWeb() {
    const gates = this.h.gates();
    const g = gates[Math.floor(Math.random() * gates.length)];
    this.webGate = g.i;
    this.webAt.copy(g.at);
    // a round web strung upright across the waiting area: spokes and rings of silk, its spider in the middle
    const w = new THREE.Group();
    const silk = new THREE.LineBasicMaterial({ color: 0xf4f6ff, transparent: true, opacity: 0.85 });
    const R = 9, pts: number[] = [];
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      pts.push(0, 0, 0, Math.cos(a) * R, Math.sin(a) * R, 0);
    }
    for (let ring = 1; ring <= 5; ring++) {
      const r = (ring / 5) * R;
      for (let k = 0; k < 12; k++) {
        const a0 = (k / 12) * Math.PI * 2, a1 = ((k + 1) / 12) * Math.PI * 2;
        pts.push(Math.cos(a0) * r, Math.sin(a0) * r, 0, Math.cos(a1) * r, Math.sin(a1) * r, 0);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const lines = new THREE.LineSegments(geo, silk);
    lines.position.y = R + 0.4;
    // (seen from above too: a faint disc behind the silk)
    const veil = mesh(new THREE.CircleGeometry(R, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }), false);
    veil.position.y = R + 0.4;
    const spider = artBug('jumping-spider', 4.5, { seed: 5 });
    spider.root.position.set(0, R + 0.4, 0.3);
    spider.root.rotation.x = -Math.PI / 2;
    const sign = new TextSprite(1.6, '#ff8a8a');
    sign.setText('🕸️ CLEAR ME');
    sign.sprite.position.y = 2 * R + 2.4;
    w.add(lines, veil, spider.root, sign.sprite);
    // (strung across the front of the waiting area, where it's seen from the camera)
    w.position.copy(g.at).add(new THREE.Vector3(0, 0, 4));
    this.h.scene.add(w);
    this.web = w;
    this.h.hud.banner(`🕸️ A web over Gate ${g.i + 1}!`, "Nobody can board there until you walk over and clear it", 4200);
    this.h.sfx.risky();
  }
  private updateWeb(_dt: number) {
    const w = this.web!;
    const me = this.h.player();
    w.children[3].position.y = 20.4 + Math.sin(this.t * 4) * 0.6;
    const near = Math.hypot(me.x - this.webAt.x, me.z - this.webAt.z) < 7;
    if (near || this.t > LAST.web) {
      if (near) {
        const lv = this.h.level();
        this.h.reward(35 + 12 * lv, 20, this.webAt.clone().setY(8), '🕸️ Web cleared!');
        this.h.sfx.unlocked();
      } else this.h.hud.banner('🕸️ The janitor ants cleared the web', `Gate ${this.webGate + 1} is boarding again`, 2600);
      w.removeFromParent();
      this.web = null;
      this.webGate = -1;
      this.end();
    }
  }

  // ---- 🐦 A BIRD OVER THE RUNWAY ----
  /** A sparrow, to ants' scale: its wings are wider than the runway. Wings flap by the group's userData. */
  private makeBird() {
    const g = new THREE.Group();
    const brown = mat(0x8a5a36, { rough: 0.9 }), cream = mat(0xe8d6b8, { rough: 0.9 }), dark = mat(0x3a2a20, { rough: 0.8 });
    const body = mesh(new THREE.SphereGeometry(1, 18, 12).scale(9, 8, 20), brown);
    const belly = mesh(new THREE.SphereGeometry(1, 16, 10).scale(8, 6, 16), cream);
    belly.position.set(0, -2.5, 1);
    const head = mesh(new THREE.SphereGeometry(7, 16, 12), brown);
    head.position.set(0, 4, 18);
    const cap = mesh(new THREE.SphereGeometry(7.2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2.4), dark);
    cap.position.copy(head.position);
    const beak = mesh(new THREE.ConeGeometry(2, 6, 10).rotateX(Math.PI / 2), mat(0x4a3a2a, { rough: 0.6 }));
    beak.position.set(0, 3, 26);
    const tail = mesh(new THREE.BoxGeometry(8, 1.2, 16), dark);
    tail.position.set(0, 1, -24);
    const wings: THREE.Object3D[] = [];
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 7, 3, 2);
      const wing = mesh(new THREE.SphereGeometry(1, 14, 8).scale(26, 1.2, 11), brown);
      wing.position.x = side * 25;
      pivot.add(wing);
      g.add(pivot);
      wings.push(pivot);
    }
    g.add(body, belly, head, cap, beak, tail);
    g.userData.wings = wings;
    g.scale.setScalar(0.3); // (the camera is only 22 over the ant: at full size it filled the sky over her)
    return g;
  }
  private startBird() {
    const b = this.makeBird();
    b.position.set(AT.runway.x - 260, 90, AT.runway.z - 120);
    this.h.scene.add(b);
    this.bird = b;
    this.birdState = 'in';
    this.birdShooed = false;
    // where to stand to shoo it: a ring on the runway under it
    const ring = mesh(new THREE.RingGeometry(9, 11, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff6b6b, transparent: true, opacity: 0.55, depthWrite: false }), false);
    ring.position.set(AT.runway.x, 0.25, AT.runway.z);
    this.h.scene.add(ring);
    this.birdMark = ring;
    this.h.hud.banner('🐦 A bird is swooping over the runway!', 'Planes hold until it goes: walk out under it to shoo it', 4200);
    this.h.sfx.risky();
  }
  private updateBird(dt: number) {
    const b = this.bird!;
    const me = this.h.player();
    const c = new THREE.Vector3(AT.runway.x, 0, AT.runway.z);
    // flapping (faster while it climbs away)
    const flap = Math.sin(this.t * (this.birdState === 'out' ? 16 : 9)) * 0.6;
    (b.userData.wings as THREE.Object3D[]).forEach((w, k) => (w.rotation.z = k === 0 ? -flap : flap));
    if (this.birdMark) (this.birdMark.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.25 * Math.sin(this.t * 5);
    const glideTo = (to: THREE.Vector3, speed: number) => {
      const d = to.clone().sub(b.position);
      const len = d.length();
      if (len > 1e-3) {
        b.position.addScaledVector(d, Math.min(1, (speed * dt) / len));
        b.rotation.y = Math.atan2(d.x, d.z);
      }
      return len < 4;
    };
    if (this.birdState === 'in') {
      this.runwayBlocked = true;
      if (glideTo(c.clone().add(new THREE.Vector3(-26, 4, 0)), 70)) { this.birdState = 'circle'; this.t = 0; }
    } else if (this.birdState === 'circle') {
      this.runwayBlocked = true;
      // round and round, low over the runway
      const a = this.t * 0.7;
      b.position.set(c.x + Math.cos(a) * 26, 4 + Math.sin(this.t * 1.3) * 0.8, c.z + Math.sin(a) * 7); // (low: the camera looks down from not much higher)
      b.rotation.y = Math.atan2(-Math.sin(a) * 26, Math.cos(a) * 7);
      b.rotation.z = 0.35;
      const near = Math.hypot(me.x - c.x, me.z - c.z) < 11; // out on the runway itself (it's 20 wide)
      if (near || this.t > LAST.bird) {
        this.birdShooed = near;
        this.birdState = 'out';
        b.rotation.z = 0;
        this.birdMark?.removeFromParent();
        this.birdMark = null;
        if (near) {
          const lv = this.h.level();
          this.h.reward(35 + 12 * lv, 20, c.clone().setY(10), '🐦 Shooed!');
          this.h.sfx.unlocked();
        } else this.h.hud.banner('🐦 The bird flew off', 'The runway is open again', 2400);
        this.runwayBlocked = false;
      }
    } else if (glideTo(c.clone().add(new THREE.Vector3(320, 160, -160)), this.birdShooed ? 140 : 90)) {
      b.removeFromParent();
      this.bird = null;
      this.end();
    }
  }

  // ---- 🧳 LOST BAG ----
  private startBag() {
    const at = FEATHER_SPOTS[Math.floor(Math.random() * FEATHER_SPOTS.length)];
    const g = new THREE.Group();
    const bag = mesh(new THREE.BoxGeometry(2.2, 1.6, 1.4), mat(0x3f7fd6, { rough: 0.7 }));
    bag.position.y = 0.8;
    const handle = mesh(new THREE.TorusGeometry(0.45, 0.1, 6, 12, Math.PI), mat(0x24324a, { rough: 0.6 }));
    handle.position.y = 1.6;
    const tag = new TextSprite(1.2, '#8fd3ff');
    tag.setText('🧳 LOST');
    tag.sprite.position.y = 3.6;
    g.add(bag, handle, tag.sprite);
    g.position.copy(at);
    this.h.scene.add(g);
    this.bag = g;
    this.bagCarried = false;
    this.h.hud.banner('🧳 A bag fell off a cart!', 'Find it on the field and take it to the BAG DROP: its owner will tip you', 4200);
  }
  private updateBag(_dt: number) {
    const g = this.bag!;
    const me = this.h.player();
    if (!this.bagCarried) {
      g.rotation.y += _dt * 0.8;
      if (Math.hypot(me.x - g.position.x, me.z - g.position.z) < 3.5) {
        this.bagCarried = true;
        g.rotation.y = 0;
        (g.children[2] as THREE.Sprite).visible = false;
        this.h.sfx.cash();
        this.h.hud.banner('🧳 Got it!', 'Now take it to the BAG DROP', 2400);
      } else if (this.t > LAST.bag) {
        g.removeFromParent();
        this.bag = null;
        this.end();
      }
      return;
    }
    // (on your back, over your head, until you're at the BAG DROP)
    g.position.set(me.x, me.y + 2.2, me.z);
    const drop = this.h.bagDrop();
    if (Math.hypot(me.x - drop.x, me.z - drop.z) < 3.5) {
      const lv = this.h.level();
      this.h.reward(45 + 15 * lv, 25, drop.clone().setY(5), '🧳 Bag returned! Tip!');
      this.h.sfx.unlocked();
      g.removeFromParent();
      this.bag = null;
      this.end();
    }
  }

  // ---- 👑 VIP CHARTER ----
  private startCharter() {
    const gates = this.h.gates().filter((g) => g.parked);
    const g = gates[Math.floor(Math.random() * gates.length)];
    this.charterGate = g.i;
    this.charterAt.copy(g.at);
    this.charterSign = new TextSprite(1.8, '#ffd166');
    this.charterSign.sprite.position.copy(g.at).setY(6);
    this.h.scene.add(this.charterSign.sprite);
    this.h.hud.banner(`👑 VIP charter at Gate ${g.i + 1}!`, `Get its plane off the ground within ${LAST.charter} s for a big bonus`, 4600);
    this.h.sfx.unlocked();
  }
  private updateCharter() {
    const left = Math.max(0, Math.ceil(LAST.charter - this.t));
    this.charterSign?.setText(`👑 CHARTER · ${left}s`);
    if (this.t > LAST.charter) {
      this.h.hud.banner('👑 The VIP charter left without us', 'Fuel and fill the plane faster next time', 2600);
      this.endCharter();
    }
  }
  private endCharter() {
    this.charterSign?.sprite.removeFromParent();
    this.charterSign = null;
    this.charterGate = -1;
    this.end();
  }
}
