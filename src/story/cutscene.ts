// ============================================================================
// cutscene.ts — 🎬 the story's little movie moments (v0.63).
//
// Black bars slide in top and bottom, the camera leaves you and flies its own path (the flight to the island,
// the rex wrecking the plane), a caption may show in the bottom bar, and the dialogue boxes still work in
// between. A ⏭ Skip button (top right) jumps to the end: every shot still does what it does (the plane still
// lands, the wing is still broken), it just happens at once.
//
//   cut.begin();
//   await cut.shot({ dur: 4, cam: (u) => [pos, lookAt], caption: '...', tick: (u, dt) => {...}, end: () => {...} });
//   await talk.say([...]);   // the camera holds the last shot while people talk
//   cut.end();
// ============================================================================
import * as THREE from 'three';

export interface Shot {
  /** Seconds. */
  dur: number;
  /** Where the camera is and what it looks at, at u = 0..1 through the shot. */
  cam: (u: number) => [THREE.Vector3, THREE.Vector3];
  caption?: string;
  /** At the start. */
  start?: () => void;
  /** Every frame (u = 0..1). */
  tick?: (u: number, dt: number) => void;
  /** At the end (also when skipped: whatever the shot changes must be done here too). */
  end?: () => void;
}

export class Cutscene {
  private bars = document.createElement('div');
  private caption = document.createElement('div');
  private skipBtn = document.createElement('button');
  private shotNow: Shot | null = null;
  private t = 0;
  private resolve: (() => void) | null = null;
  private pos = new THREE.Vector3();
  private look = new THREE.Vector3();
  private running = false;
  /** ⏭ was tapped: everything until end() happens at once. */
  skipping = false;
  /** Tapped ⏭ (the world also hurries its dialogue along). */
  onSkip: () => void = () => {};

  constructor() {
    this.bars.className = 'cut hidden';
    this.bars.innerHTML = '<div class="cut-top"></div><div class="cut-bottom"></div>';
    this.caption.className = 'cut-caption';
    this.bars.querySelector('.cut-bottom')!.appendChild(this.caption);
    this.skipBtn.className = 'cut-skip';
    this.skipBtn.textContent = 'Skip ⏭';
    this.skipBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.skip();
    });
    this.bars.appendChild(this.skipBtn);
    document.getElementById('hud')!.appendChild(this.bars);
  }

  /** Is a cutscene on (the camera is ours, you can't walk)? */
  get active() {
    return this.running;
  }

  begin() {
    this.running = true;
    this.skipping = false;
    this.caption.textContent = '';
    this.bars.classList.remove('hidden');
    document.body.classList.add('in-cut');
  }

  end() {
    this.running = false;
    this.skipping = false;
    this.shotNow = null;
    this.bars.classList.add('hidden');
    document.body.classList.remove('in-cut');
  }

  skip() {
    if (!this.running || this.skipping) return;
    this.skipping = true;
    this.onSkip();
    this.finishShot();
  }

  /** Play one shot; resolves when it's over. */
  shot(s: Shot): Promise<void> {
    s.start?.();
    if (this.skipping) {
      s.tick?.(1, 0);
      s.end?.();
      [this.pos, this.look] = s.cam(1).map((v) => v.clone()) as [THREE.Vector3, THREE.Vector3];
      return Promise.resolve();
    }
    this.caption.textContent = s.caption ?? '';
    this.caption.classList.toggle('on', !!s.caption);
    this.shotNow = s;
    this.t = 0;
    return new Promise((r) => (this.resolve = r));
  }

  private finishShot() {
    const s = this.shotNow;
    if (!s) return;
    this.shotNow = null;
    s.tick?.(1, 0);
    s.end?.();
    const [p, l] = s.cam(1);
    this.pos.copy(p);
    this.look.copy(l);
    const r = this.resolve;
    this.resolve = null;
    r?.();
  }

  /** Every frame while active: move the camera (returns false when not in a cutscene). */
  update(dt: number, camera: THREE.PerspectiveCamera) {
    if (!this.running) return false;
    const s = this.shotNow;
    if (s) {
      this.t += dt;
      const u = Math.min(1, this.t / s.dur);
      s.tick?.(u, dt);
      const [p, l] = s.cam(u);
      this.pos.copy(p);
      this.look.copy(l);
      if (u >= 1) this.finishShot();
    }
    camera.position.copy(this.pos);
    camera.lookAt(this.look);
    return true;
  }
}

/** Smooth 0..1 (eases in and out). */
export const ease = (u: number) => u * u * (3 - 2 * u);
/** A point between a and b at u (eased). */
export function glide(a: THREE.Vector3, b: THREE.Vector3, u: number, out = new THREE.Vector3()) {
  return out.lerpVectors(a, b, ease(u));
}
