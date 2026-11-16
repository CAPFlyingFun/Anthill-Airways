// ============================================================================
// events.ts — 🦎 EVENTS & VISITORS (v0.70): a little something happening at the airfield every few minutes.
//
//   🦎 LIZARD ON THE RUNWAY — a young anole wanders out of the lawn and lies down across the runway to sunbathe
//      (flashing its dewlap). Nothing can take off or land until it goes: walk up to it to shoo it away (a reward),
//      or wait about 40 s and it wanders off by itself (no reward).
//   🌧️ DEW SHOWER — a soft shower for 35 s: the nectar flowers fill twice as fast while it lasts.
//   🪶 BIRD FLYOVER — a huge shadow sweeps over the field and a bird drops a FEATHER somewhere on the airfield:
//      walk over it within a minute for a bonus.
//
// The airfield asks: is the runway blocked (`runwayBlocked`), are the flowers boosted (`dew`), and what to show on
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
}

type Kind = 'lizard' | 'dew' | 'feather';

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
/** Where a dropped feather can land: open ground around the airfield (not on buildings or the runway). */
const FEATHER_SPOTS = [v3(-46, 0, 20), v3(24, 0, 2), v3(-4, 0, 36), v3(50, 0, 18), v3(-28, 0, -26), v3(26, 0, -26), v3(4, 0, -6), v3(-60, 0, -6)];

export class Events {
  /** 🦎 The runway is closed (the lizard is on it). */
  runwayBlocked = false;
  /** 🌧️ The dew shower is on (flowers fill twice as fast). */
  dew = false;
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
  private storm = document.getElementById('storm');

  constructor(private h: EventHooks) {}

  /** What to show on the minimap. */
  markers(): { x: number; z: number; icon: string; label?: string; alert?: boolean }[] {
    if (this.lizard && this.lizState !== 'out') return [{ x: this.lizard.root.position.x, z: this.lizard.root.position.z, icon: '🦎', label: 'Shoo!', alert: true }];
    if (this.feather) return [{ x: this.feather.position.x, z: this.feather.position.z, icon: '🪶', alert: true }];
    return [];
  }

  /**
   * ⚠️ What's going on right now, for the alert above the flight chips (v0.72.2: it stays up for as long as the
   * event does, so you always know why the planes are circling). `at` = where to look (tap the alert), `bad` = red.
   */
  alert(): { text: string; at: THREE.Vector3 | null; bad: boolean } | null {
    if (this.lizard && this.lizState !== 'out') return { text: '⚠️ 🦎 LIZARD ON THE RUNWAY · walk up to it to shoo it!', at: this.lizard.root.position, bad: true };
    if (this.feather) return { text: '🪶 A feather dropped · find it for a bonus', at: this.feather.position, bad: false };
    if (this.dew) return { text: `🌧️ Dew shower · flowers fill ×2 · ${Math.max(0, Math.ceil(35 - this.t))}s`, at: null, bad: false };
    return null;
  }

  /** Something to walk to right now (for the tutorial-style arrow), or null. */
  get target() {
    if (this.lizard && this.lizState === 'sun') return this.lizard.root.position;
    return this.feather?.position ?? null;
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
    else if (this.kind === 'dew') {
      if (this.t > 35) {
        this.dew = false;
        this.storm?.classList.remove('on', 'dew');
        this.end();
      }
    } else this.updateFeather(dt);
  }

  private start() {
    const kinds: Kind[] = (['lizard', 'dew', 'feather'] as Kind[]).filter((k) => k !== this.last);
    const k = kinds[Math.floor(Math.random() * kinds.length)];
    this.kind = this.last = k;
    this.t = 0;
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
    } else if (k === 'dew') {
      this.dew = true;
      this.storm?.classList.add('on', 'dew');
      this.h.hud.banner('🌧️ Dew shower!', 'The nectar flowers fill twice as fast while it lasts', 3600);
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
}
