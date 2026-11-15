// ============================================================================
// avatar.ts — 🧍 a tiny live 3D bust of your character in the player card (v0.62).
//
// Joshua (2026-11-15): "have a tiny 3D model of the character as the UI person and we could also add slight
// animations". The card's badge has a see-through window; after each game frame this draws a copy of your
// character from its own little camera, with its own two lights: drawn by the game's renderer into a scissored
// corner of the game canvas (no second 3D context), then copied straight away into the card's own little 2D canvas
// (the card's background would hide the game canvas behind it). About 80 pixels square, 30 times a second.
//
// The people's rigs have no names on their bones (Meshy), so the head is found by shape: the highest bone on the
// middle line of the body. Then, while idle: breathing (the body rises and settles), the head looking around
// now and then, and a nod when you level up. (No face rig, so no blinking or expressions.)
// ============================================================================
import * as THREE from 'three';
import { spawnHuman, type HumanKind } from '../actors/creatures';
import type { CreatureModel } from '../actors/models';

export class Avatar {
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(22, 1, 0.01, 20);
  private model: CreatureModel;
  private head: THREE.Object3D | null = null;
  private headRest = new THREE.Quaternion();
  private turn = new THREE.Quaternion();
  private euler = new THREE.Euler(0, 0, 0, 'YXZ');
  private t = Math.random() * 10;
  private nodT = 0;
  private rect = { x: 0, y: 0, top: 0, w: 0, h: 0 };
  private out: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private odd = false;
  private cw = 0;
  private ch = 0;
  private measured = 0;
  private clear = new THREE.Color();

  /** Null if that person's model isn't loaded. */
  static make(kind: HumanKind, slot: HTMLElement) {
    const m = spawnHuman(kind, 1.7);
    return m ? new Avatar(m, slot) : null;
  }

  private constructor(model: CreatureModel, private slot: HTMLElement) {
    this.model = model;
    this.out = document.createElement('canvas');
    this.out.className = 'pc-live';
    slot.appendChild(this.out);
    this.ctx = this.out.getContext('2d');
    this.scene.add(model.root);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x6a7fa8, 1.7));
    const key = new THREE.DirectionalLight(0xffffff, 2.1);
    key.position.set(0.8, 1.2, 1.5);
    this.scene.add(key);
    model.root.updateMatrixWorld(true);
    // The head: the highest bone near the body's middle line (its rest pose, facing +z)
    const p = new THREE.Vector3();
    let best = -Infinity;
    model.root.traverse((o) => {
      if (!(o as THREE.Bone).isBone) return;
      o.getWorldPosition(p);
      if (Math.abs(p.x) < 0.12 && p.y > best) { best = p.y; this.head = o; }
    });
    // (the very top bone is often the head's tip: the joint the head turns on is its parent)
    if (this.head?.parent && (this.head.parent as THREE.Bone).isBone) {
      const tip = this.head.getWorldPosition(new THREE.Vector3()).y, joint = this.head.parent.getWorldPosition(new THREE.Vector3()).y;
      if (tip - joint < 0.18) this.head = this.head.parent;
    }
    if (this.head) this.headRest.copy(this.head.quaternion);
    // The camera: a bust shot, a little to the right of straight on
    const box = new THREE.Box3().setFromObject(model.root);
    const top = box.max.y, face = top - 0.13;
    this.camera.position.set(0.14, face + 0.02, 0.95);
    this.camera.lookAt(0, face - 0.07, 0);
  }

  /** A nod (a level up). */
  nod() {
    this.nodT = 1;
  }

  /** Draw the bust into the card's window (after the game's own frame). */
  render(renderer: THREE.WebGLRenderer, dt: number) {
    // (where the window is: measured now and then, and at once when the screen turns)
    const cw = renderer.domElement.width, ch = renderer.domElement.height;
    if (--this.measured <= 0 || cw !== this.cw || ch !== this.ch) {
      this.cw = cw; this.ch = ch;
      const r = this.slot.getBoundingClientRect(), c = renderer.domElement.getBoundingClientRect();
      this.rect = { x: r.left - c.left, y: c.bottom - r.bottom, top: r.top - c.top, w: r.width, h: r.height };
      this.measured = 30;
    }
    const { x, y, w, h } = this.rect;
    if (w < 2 || h < 2 || this.slot.offsetParent === null || !this.ctx) return;
    this.t += dt;
    this.odd = !this.odd;
    if (this.odd) return; // (every other frame is plenty for a breathing bust)
    const t = this.t;
    // Breathing; the head drifting round to look about (two slow waves, so it never repeats exactly); a nod
    this.model.bob.position.y = Math.sin(t * 1.7) * 0.004;
    this.model.bob.rotation.y = Math.sin(t * 0.21) * 0.08;
    if (this.head) {
      this.nodT = Math.max(0, this.nodT - dt * 2.8);
      const nod = Math.sin((1 - this.nodT) * Math.PI * 2) * this.nodT * 0.35;
      this.euler.set(Math.sin(t * 0.53) * 0.05 + nod, Math.sin(t * 0.37) * 0.28 + Math.sin(t * 0.11) * 0.12, Math.sin(t * 0.29) * 0.04);
      this.head.quaternion.copy(this.headRest).multiply(this.turn.setFromEuler(this.euler));
    }
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const autoClear = renderer.autoClear, size = renderer.getSize(new THREE.Vector2());
    renderer.getClearColor(this.clear);
    const alpha = renderer.getClearAlpha();
    renderer.autoClear = false;
    renderer.setScissorTest(true);
    renderer.setScissor(x, y, w, h);
    renderer.setViewport(x, y, w, h);
    renderer.setClearColor(0x2f6fdc, 1);
    renderer.clear(true, true, false);
    renderer.render(this.scene, this.camera);
    // (copy it into the card now, before the browser shows the frame and the game canvas lets go of it)
    const src = renderer.domElement, k = src.width / Math.max(1, src.clientWidth);
    const pw = Math.round(w * k), ph = Math.round(h * k);
    if (this.out.width !== pw || this.out.height !== ph) { this.out.width = pw; this.out.height = ph; }
    this.ctx.drawImage(src, Math.round(x * k), Math.round(this.rect.top * k), pw, ph, 0, 0, pw, ph);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, size.x, size.y);
    renderer.setClearColor(this.clear, alpha);
    renderer.autoClear = autoClear;
  }
}
