// ============================================================================
// backpack.ts — 🎒 the story's ARK-style inventory (v0.66).
//
// Joshua (2026-11-15): "up to 5 tools (like hotkeys) to tap to place in hand, and anything goes in the
// inventory and not in the hands anymore... you just have to be close to something to transfer."
//
//   Inventory   what you carry: counts per item, one capacity (it grows with your Carry stat)
//   Hotbar      5 slots along the bottom (tools: 🪓 hatchet, 🪨 stone; later a spear, a pick, a torch...).
//               Tap a slot: that tool goes in your hand. Tap it again: put away. Each slot shows its wear.
//   HandTool    the tool you hold, drawn at your right hand, and the swing (your right arm lifts and chops)
//   BackBundle  a little pack on your back that grows as the backpack fills (logs strapped on top)
//   StorePanel  the two-column panel for big storage (the workbench now, chests later): yours | theirs
//   coach()     a one-time bubble pointing at something on screen ("This is your 💧 water...")
// ============================================================================
import * as THREE from 'three';
import type { ItemType } from '../world/items';
import type { CreatureModel, Joint } from '../actors/models';

// ----------------------------------------------------------------------------
// 🎒 Inventory
// ----------------------------------------------------------------------------
export class Inventory {
  counts = new Map<ItemType, number>();
  constructor(public cap: number) {}
  total() {
    let n = 0;
    for (const v of this.counts.values()) n += v;
    return n;
  }
  count(t: ItemType) {
    return this.counts.get(t) ?? 0;
  }
  has(t: ItemType, n = 1) {
    return this.count(t) >= n;
  }
  /** Add up to `n` (as many as fit). How many went in. */
  add(t: ItemType, n = 1) {
    const k = Math.max(0, Math.min(n, this.cap - this.total()));
    if (k) this.counts.set(t, this.count(t) + k);
    return k;
  }
  /** Take up to `n` out. How many came out. */
  remove(t: ItemType, n = 1) {
    const k = Math.min(n, this.count(t));
    if (!k) return 0;
    const left = this.count(t) - k;
    if (left) this.counts.set(t, left);
    else this.counts.delete(t);
    return k;
  }
  toJSON() {
    return Object.fromEntries(this.counts);
  }
  load(o: Record<string, number> | undefined) {
    this.counts.clear();
    for (const [t, n] of Object.entries(o ?? {})) if (n > 0) this.counts.set(t as ItemType, n);
  }
}

// ----------------------------------------------------------------------------
// ⚒️ Tools
// ----------------------------------------------------------------------------
export type ToolKind = 'hatchet' | 'stone' | 'pick' | 'canteen';
export const TOOL_ICON: Record<ToolKind, string> = { hatchet: '🪓', stone: '🪨', pick: '⛏️', canteen: '🫗' };
export const TOOL_NAME: Record<ToolKind, string> = { hatchet: 'Hatchet', stone: 'Stone', pick: 'Stone pick', canteen: 'Waterskin' };

export interface HotbarSlot {
  kind: ToolKind;
  /** 0..1 how much is left (the wear bar). */
  wear: number;
  /** e.g. ×3 stones. */
  count?: number;
}

/** The 5 slots along the bottom. `onTap(i)` when one is tapped. */
export class Hotbar {
  el = document.createElement('div');
  useBtn = document.createElement('button');
  private slots: HTMLButtonElement[] = [];
  private key = '';
  onTap: (i: number) => void = () => {};
  onUse: () => void = () => {};
  constructor() {
    this.el.className = 'hotbar';
    for (let i = 0; i < 5; i++) {
      const b = document.createElement('button');
      b.className = 'hb-slot';
      b.innerHTML = `<span class="hb-icon"></span><b class="hb-count"></b><i class="hb-wear"><u></u></i><em>${i + 1}</em>`;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.onTap(i);
      });
      this.slots.push(b);
      this.el.appendChild(b);
    }
    this.useBtn.className = 'use-btn hidden';
    this.useBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onUse();
    });
    const hud = document.getElementById('hud')!;
    hud.append(this.el, this.useBtn);
  }

  show(on: boolean) {
    this.el.classList.toggle('hidden', !on);
    if (!on) this.useBtn.classList.add('hidden');
  }

  /** Redraw (only what changed). `held` = the slot in your hand. */
  render(slots: (HotbarSlot | null)[], held: number) {
    const key = slots.map((s) => (s ? `${s.kind}${Math.round(s.wear * 20)}x${s.count ?? ''}` : '-')).join() + `|${held}`;
    if (key === this.key) return;
    this.key = key;
    slots.forEach((s, i) => {
      const b = this.slots[i];
      b.classList.toggle('empty', !s);
      b.classList.toggle('held', i === held && !!s);
      b.querySelector('.hb-icon')!.textContent = s ? TOOL_ICON[s.kind] : '';
      b.querySelector('.hb-count')!.textContent = s?.count && s.count > 1 ? `×${s.count}` : '';
      const wear = b.querySelector<HTMLElement>('.hb-wear')!;
      wear.style.visibility = s ? 'visible' : 'hidden';
      const u = wear.querySelector<HTMLElement>('u')!;
      u.style.width = `${Math.round((s?.wear ?? 0) * 100)}%`;
      u.classList.toggle('low', (s?.wear ?? 1) < 0.25);
    });
  }

  /** The big "use" button above the hotbar (null = hidden). */
  setUse(label: string | null) {
    this.useBtn.classList.toggle('hidden', !label);
    if (label && this.useBtn.textContent !== label) this.useBtn.textContent = label;
  }
}

// ----------------------------------------------------------------------------
// ✋ The tool in your hand, and the swing
// ----------------------------------------------------------------------------
const wood = new THREE.MeshStandardMaterial({ color: 0x8a5a33, roughness: 0.8 });
const flint = new THREE.MeshStandardMaterial({ color: 0x7d8186, roughness: 0.6, flatShading: true });
const twine = new THREE.MeshStandardMaterial({ color: 0xc9a86a, roughness: 0.9 });

/** A hatchet (handle along +y from the grip, the stone head at the top, its edge facing +z). */
function hatchetMesh() {
  const g = new THREE.Group();
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.85, 7), wood);
  handle.position.y = 0.3;
  const head = new THREE.Mesh(new THREE.DodecahedronGeometry(0.13), flint);
  head.scale.set(0.6, 1, 1.6);
  head.position.set(0, 0.66, 0.08);
  const lash = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.12, 8), twine);
  lash.position.y = 0.63;
  g.add(handle, head, lash);
  return g;
}
/** A stone pick (a pointed stone head across the top of the handle). */
function pickMesh() {
  const g = new THREE.Group();
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.9, 7), wood);
  handle.position.y = 0.32;
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.62, 6), flint);
  head.rotation.x = Math.PI / 2;
  head.position.set(0, 0.7, 0.12);
  const back = new THREE.Mesh(new THREE.DodecahedronGeometry(0.08), flint);
  back.position.set(0, 0.7, -0.1);
  const lash = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.12, 8), twine);
  lash.position.y = 0.68;
  g.add(handle, head, back, lash);
  return g;
}
/** A waterskin (a leather-ish bottle with a cork). */
function canteenMesh() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshStandardMaterial({ color: 0x9c6b3e, roughness: 0.8 }));
  body.scale.set(1, 1.25, 0.7);
  body.position.y = 0.18;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.12, 8), twine);
  neck.position.y = 0.4;
  g.add(body, neck);
  return g;
}
function stoneMesh() {
  const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.13), flint);
  s.scale.set(1.2, 0.8, 1);
  return s;
}

export class HandTool {
  group = new THREE.Group();
  private meshes: Record<ToolKind, THREE.Object3D> = { hatchet: hatchetMesh(), stone: stoneMesh(), pick: pickMesh(), canteen: canteenMesh() };
  private arm: { shoulder: Joint; elbow: Joint | null; hand: THREE.Object3D } | null = null;
  private model: CreatureModel | null = null;
  kind: ToolKind | null = null;
  /** 0..1 through a swing (-1 = not swinging). */
  private swingT = -1;
  private swingDur = 0.42;
  private onHit: (() => void) | null = null;
  private hit = false;
  private tmp = new THREE.Vector3();
  private q = new THREE.Quaternion();

  constructor(parent: THREE.Object3D) {
    for (const m of Object.values(this.meshes)) {
      m.visible = false;
      m.traverse((o) => ((o as THREE.Mesh).castShadow = true));
      this.group.add(m);
    }
    parent.add(this.group);
  }

  /** Whose hand (a person model with a skeleton): finds their RIGHT arm (the one on -x, facing +z). */
  attach(model: CreatureModel) {
    this.model = model;
    this.arm = null;
    const b = model.biped;
    if (!b) return;
    model.root.updateMatrixWorld(true);
    let best: { shoulder: Joint; elbow: Joint | null; hand: THREE.Object3D } | null = null;
    let bestX = Infinity;
    for (const limb of b.limbs) {
      if (!limb.arm) continue;
      const elbow = limb.mid;
      const hand = (elbow?.bone.children.find((c) => (c as THREE.Bone).isBone) ?? elbow?.bone ?? limb.hip.bone) as THREE.Object3D;
      hand.getWorldPosition(this.tmp);
      model.root.worldToLocal(this.tmp);
      if (this.tmp.x < bestX) {
        bestX = this.tmp.x;
        best = { shoulder: limb.hip, elbow, hand };
      }
    }
    this.arm = best;
  }

  hold(kind: ToolKind | null) {
    this.kind = kind;
    for (const [k, m] of Object.entries(this.meshes)) m.visible = k === kind;
    if (!kind) this.swingT = -1;
  }

  get swinging() {
    return this.swingT >= 0;
  }

  /** One swing; `onHit` at the moment it strikes (once). Ignored if already mid-swing. */
  swing(onHit: () => void, dur = 0.42) {
    if (this.swingT >= 0 || !this.kind) return false;
    this.swingT = 0;
    this.swingDur = dur;
    this.onHit = onHit;
    this.hit = false;
    return true;
  }

  /** Every frame, AFTER the person's walk cycle has posed the arms. */
  update(dt: number) {
    if (!this.kind || !this.model || !this.arm) {
      this.group.visible = false;
      return;
    }
    this.group.visible = this.model.root.visible && !this.model.root.userData.hidden;
    // The right arm: held forward a little; a swing lifts it up and brings it down hard
    let a = -0.55;
    let e = -0.5;
    if (this.swingT >= 0) {
      this.swingT += dt / this.swingDur;
      const u = Math.min(1, this.swingT);
      if (u < 0.45) {
        const k = u / 0.45;
        a = -0.55 + (-2.5 + 0.55) * k * (2 - k);
        e = -0.5 - 0.7 * k;
      } else {
        const k = (u - 0.45) / 0.55;
        a = -2.5 + (2.5 - 0.25) * Math.min(1, k * 1.6);
        e = -1.2 + 0.9 * Math.min(1, k * 1.6);
        if (!this.hit && k > 0.45) {
          this.hit = true;
          this.onHit?.();
        }
      }
      if (this.swingT >= 1) {
        this.swingT = -1;
        this.onHit = null;
      }
    }
    const { shoulder, elbow, hand } = this.arm;
    shoulder.bone.quaternion.copy(shoulder.base).multiply(this.q.setFromAxisAngle(shoulder.axis, a));
    if (elbow) elbow.bone.quaternion.copy(elbow.base).multiply(this.q.setFromAxisAngle(elbow.axis, e));
    // The tool sits in the hand, pointing where the arm swings it
    this.model.root.updateMatrixWorld(true);
    hand.getWorldPosition(this.tmp);
    this.group.position.copy(this.tmp);
    this.group.rotation.set(a + 2.1, this.model.root.rotation.y, 0, 'YXZ');
  }
}

// ----------------------------------------------------------------------------
// 🎒 The pack on your back (grows as you carry more; logs strapped on top when you have some)
// ----------------------------------------------------------------------------
export class BackBundle {
  group = new THREE.Group();
  private pack: THREE.Mesh;
  private logs: THREE.Mesh[] = [];
  private stuff: THREE.Mesh[] = [];
  constructor() {
    this.pack = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.3), new THREE.MeshStandardMaterial({ color: 0x6b4f2e, roughness: 0.9 }));
    this.pack.castShadow = true;
    const flap = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.2, 0.32), new THREE.MeshStandardMaterial({ color: 0x5a4126, roughness: 0.9 }));
    flap.position.y = 0.3;
    this.pack.add(flap);
    this.group.add(this.pack);
    const bark = new THREE.MeshStandardMaterial({ color: 0x7a5232, roughness: 0.95 });
    for (let i = 0; i < 4; i++) {
      const l = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.9, 7).rotateZ(Math.PI / 2), bark);
      l.position.set(0, 0.48 + Math.floor(i / 2) * 0.17, (i % 2) * 0.16 - 0.08);
      l.castShadow = true;
      this.logs.push(l);
      this.group.add(l);
    }
    const green = new THREE.MeshStandardMaterial({ color: 0x6fae45, roughness: 0.9 });
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.12, 7, 5), green);
      s.position.set(-0.2 + i * 0.2, 0.42, -0.12);
      this.stuff.push(s);
      this.group.add(s);
    }
  }
  /** Put it on a person: on their back, at shoulder-blade height (the model faces +z). */
  attach(model: CreatureModel) {
    this.group.removeFromParent();
    const H = model.height;
    const s = 1 / (model.root.scale.x || 1);
    this.group.scale.setScalar(s * (H / 2.8));
    this.group.position.set(0, (H * 0.6) * s, -H * 0.075 * s);
    model.root.add(this.group);
  }
  update(inv: Inventory) {
    const n = inv.total();
    this.group.visible = n > 0;
    if (!n) return;
    const fill = Math.min(1, n / Math.max(1, inv.cap));
    this.pack.scale.setScalar(0.8 + fill * 0.45);
    const logs = Math.min(4, Math.ceil(inv.count('log') / 3));
    this.logs.forEach((l, i) => (l.visible = i < logs));
    const other = inv.count('fiber') + inv.count('branch') + inv.count('berry');
    this.stuff.forEach((s, i) => (s.visible = i < Math.min(3, Math.ceil(other / 2))));
  }
}

// ----------------------------------------------------------------------------
// 📦 A panel with tabs (v0.67): the workbench (📦 Storage | 🛠️ Craft), your backpack (🎒 Items | 🔨 Craft),
// the storage chest (📦 Storage). Each tab draws its own HTML and wires its own buttons; the panel redraws
// itself a few times a second while it's open (so crafting progress bars move).
// ----------------------------------------------------------------------------
export interface PanelTab {
  label: string;
  html: () => string;
  /** Wire the buttons; call `redraw()` after anything changes. */
  bind?: (root: HTMLElement, redraw: () => void) => void;
  /** Update live bits (a progress bar) in place, without rebuilding the buttons. */
  tick?: (root: HTMLElement) => void;
}
export class TabsPanel {
  el = document.createElement('div');
  private open_ = false;
  private tabs: PanelTab[] = [];
  private tab = 0;
  private title = '';
  private timer = 0;
  private lastHtml = '';
  constructor() {
    this.el.className = 'store hidden';
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    document.getElementById('hud')!.appendChild(this.el);
  }
  get open() {
    return this.open_;
  }
  show(title: string, tabs: PanelTab[], start = 0) {
    this.title = title;
    this.tabs = tabs;
    this.tab = Math.min(start, tabs.length - 1);
    this.open_ = true;
    this.el.classList.remove('hidden');
    this.lastHtml = '';
    this.render();
    clearInterval(this.timer);
    this.timer = window.setInterval(() => this.render(), 250);
  }
  close() {
    this.open_ = false;
    this.el.classList.add('hidden');
    clearInterval(this.timer);
  }
  render() {
    if (!this.open_) return;
    const t = this.tabs[this.tab];
    const tabBar = this.tabs.length > 1 ? `<div class="store-tabs">${this.tabs.map((x, i) => `<button class="store-tab${i === this.tab ? ' on' : ''}" data-tab="${i}">${x.label}</button>`).join('')}</div>` : '';
    const html = `<div class="store-box"><h3 class="store-title">${this.title}</h3>${tabBar}<div class="store-body">${t.html()}</div><button class="store-close big-btn">Close</button></div>`;
    if (html === this.lastHtml) {
      t.tick?.(this.el.querySelector('.store-body') as HTMLElement);
      return; // (nothing changed: keep the buttons as they are, so taps aren't lost)
    }
    this.lastHtml = html;
    this.el.innerHTML = html;
    this.el.querySelectorAll<HTMLButtonElement>('.store-tab').forEach((b) =>
      b.addEventListener('click', () => {
        this.tab = Number(b.dataset.tab);
        this.lastHtml = '';
        this.render();
      }),
    );
    this.el.querySelector('.store-close')!.addEventListener('click', () => this.close());
    t.bind?.(this.el.querySelector('.store-body') as HTMLElement, () => {
      this.lastHtml = '';
      this.render();
    });
    t.tick?.(this.el.querySelector('.store-body') as HTMLElement);
  }
}

/** The two-column storage tab: yours | theirs. Tap an item to move one; "Move all" moves everything. */
export interface StoreSide {
  title: string;
  items: { type: ItemType; icon: string; n: number; label?: string }[];
}
export function storeTab(get: () => [StoreSide, StoreSide], move: (from: 0 | 1, t: ItemType, all: boolean) => void): PanelTab {
  return {
    label: '📦 Storage',
    html: () => {
      const sides = get();
      const col = (s: StoreSide, i: 0 | 1) => `
        <div class="store-col">
          <h4>${s.title}</h4>
          ${s.items.length ? s.items.map((it) => `<button class="store-item" data-side="${i}" data-type="${it.type}">${it.icon}<b>${it.n}</b>${it.label ? `<small>${it.label}</small>` : ''}</button>`).join('') : '<p class="store-empty">Empty</p>'}
          ${s.items.length ? `<button class="store-all" data-side="${i}">${i === 0 ? 'Move all →' : '← Take all'}</button>` : ''}
        </div>`;
      return `<div class="store-cols">${col(sides[0], 0)}<div class="store-mid">⇄</div>${col(sides[1], 1)}</div>`;
    },
    bind: (root, redraw) => {
      root.querySelectorAll<HTMLButtonElement>('.store-item').forEach((b) =>
        b.addEventListener('click', () => {
          move(Number(b.dataset.side) as 0 | 1, b.dataset.type as ItemType, false);
          redraw();
        }),
      );
      root.querySelectorAll<HTMLButtonElement>('.store-all').forEach((b) =>
        b.addEventListener('click', () => {
          const side = Number(b.dataset.side) as 0 | 1;
          for (const it of get()[side].items) move(side, it.type, true);
          redraw();
        }),
      );
    },
  };
}

// ----------------------------------------------------------------------------
// 💬 A one-time coach bubble pointing at something on screen (tap or wait to close)
// ----------------------------------------------------------------------------
export function coach(target: Element | null, html: string, secs = 7) {
  if (!target) return;
  const r = target.getBoundingClientRect();
  const b = document.createElement('div');
  b.className = 'coach';
  b.innerHTML = html;
  document.getElementById('hud')!.appendChild(b);
  // Under the thing, kept on screen
  const w = Math.min(260, window.innerWidth - 24);
  b.style.width = `${w}px`;
  const left = Math.max(12, Math.min(window.innerWidth - w - 12, r.left + r.width / 2 - w / 2));
  b.style.left = `${left}px`;
  b.style.top = `${r.bottom + 12}px`;
  b.style.setProperty('--arrow', `${r.left + r.width / 2 - left}px`);
  target.classList.add('coach-glow');
  const close = () => {
    b.remove();
    target.classList.remove('coach-glow');
  };
  b.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    close();
  });
  window.setTimeout(close, secs * 1000);
}
