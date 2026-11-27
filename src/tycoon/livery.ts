// ============================================================================
// livery.ts — 🎨 EACH PLANE YOUR OWN (v1.00, Phase 6 of the plan: "Plane upgrades and liveries").
//
// Joshua's plan: "Each plane becomes yours to name and improve, not only its gate. Liveries: paint each bug-plane
// from a set of colours and patterns (stripes, spots, the Anthill Airways tail). Names: name each plane; its name
// shows on its flight card. Per-plane upgrades: engine (speed), seats (capacity) and comfort (fare tip), on top of
// the gate's own upgrades."
//
// A "plane" here is GATE N's PLANE: whatever bug that gate flies (the mixed fleet swaps the bug), its name, paint
// and upgrades stay with it. Saved in save.tycoon.planes[i] (look) and save.tycoon.ups["plane<i>.<k>"] (levels).
//
// THE PAINT. A bug is built from merged pieces whose colours are written into the geometry (bugs/parts.ts), and
// its body colour can be chosen when it's built (artBug's `color`). So a plane is built in its livery's main
// colour, and a small shader on its materials (one copy per plane) paints the PATTERN over every part of it that
// is exactly that colour: stripes, spots, a racing stripe or the two-tone tail, in the trim colour, laid by where
// each point is on the bug (nose to tail, side to side), so it rides the bug as it flies. A change of colour shows
// at once on its body (the shader) and its wings catch up when it next parks empty (it's built again then).
// Every number here is GAME TUNING.
// ============================================================================
import * as THREE from 'three';
import { PAL } from './kit';
import { BEETLE_COLOURS } from './bugs/insects';
import { BF_BASE } from './bugs/flyers';
import type { BugKind } from './bugs';
import type { ArtBug } from './art';

/** What a plane looks like (all optional: a plane nobody has touched is the bug's own colours, and a default name). */
export interface PlaneLook {
  name?: string;
  /** A colour's id from LIVERY_COLOURS ('original' or absent: the bug's own). */
  color?: string;
  trim?: string;
  pattern?: string;
}

/** The paint pots. 'original' is the bug's own colour (or a jumbo's). */
export const LIVERY_COLOURS: { id: string; name: string; hex: number }[] = [
  { id: 'original', name: 'Its own', hex: -1 },
  { id: 'red', name: 'Red', hex: 0xd8322a },
  { id: 'orange', name: 'Orange', hex: 0xf07a1c },
  { id: 'gold', name: 'Gold', hex: 0xf2c230 },
  { id: 'lime', name: 'Lime', hex: 0x7ccf3a },
  { id: 'green', name: 'Green', hex: 0x1f9a52 },
  { id: 'teal', name: 'Teal', hex: 0x1fb3b0 },
  { id: 'sky', name: 'Sky Blue', hex: 0x4fb3f2 },
  { id: 'blue', name: 'Royal Blue', hex: 0x2552d6 },
  { id: 'navy', name: 'Navy', hex: 0x1b2a5c },
  { id: 'purple', name: 'Purple', hex: 0x7a3fd0 },
  { id: 'pink', name: 'Pink', hex: 0xf06aa8 },
  { id: 'white', name: 'White', hex: 0xf2f2ee },
  { id: 'silver', name: 'Silver', hex: 0xa9b2bd },
  { id: 'black', name: 'Black', hex: 0x22222a },
];

/** The patterns, in the order the panel shows them. */
export const PATTERNS: { id: string; name: string; icon: string }[] = [
  { id: 'plain', name: 'Plain', icon: '⬜' },
  { id: 'stripes', name: 'Stripes', icon: '🦓' },
  { id: 'spots', name: 'Spots', icon: '🔴' },
  { id: 'racing', name: 'Racing stripe', icon: '🏁' },
  { id: 'tail', name: 'Anthill tail', icon: '🐜' },
];

/** A name for each gate's plane until you give it one (GAME TUNING: Joshua can rename every one). */
export const PLANE_NAMES = [
  'Spirit of the Hill', 'Queen\'s Pride', 'Dewdrop Express', 'Crumb Runner',
  'Petal Jet', 'Sunny Skies', 'Honeydew', 'Thistle Wind',
  'Clover Cruiser', 'Morning Glory', 'Pollen Comet', 'Acorn Arrow',
];
export const NAME_MAX = 22;

export function planeName(look: PlaneLook | undefined, gate: number) {
  const n = look?.name?.trim();
  return n ? n : PLANE_NAMES[gate % PLANE_NAMES.length];
}

/** Each plane's own upgrades (per gate: "plane<i>.<k>"), on top of the hangar's (every aircraft) and the gate's. */
export const PLANE_UPS = [
  { k: 'engine', ic: '🚀', name: 'Engine', desc: '+6% speed', max: 5, base: 1500 },
  { k: 'seats', ic: '💺', name: 'Seats', desc: '+1 seat', max: 3, base: 2500 },
  { k: 'comfort', ic: '🛋️', name: 'Comfort', desc: '+$2 tip a passenger', max: 5, base: 2000 },
];
/** What a level does: engine × speed, comfort $ a passenger (× the route's fare: a far trip, a bigger tip). */
export const PLANE_FX = { engine: 0.06, comfort: 2 };

/** The bug's own body colour (as bugs/ builds it with no colour given), so a plane can always be built with one. */
export function ownColour(kind: BugKind, seed: number, typeColor?: number): number {
  if (typeColor !== undefined) return typeColor;
  const s = Math.abs(Math.floor(seed));
  switch (kind) {
    case 'ladybug': return PAL.ladybugRed;
    case 'bee': return PAL.beeYellow;
    case 'beetle': return BEETLE_COLOURS[s % BEETLE_COLOURS.length];
    case 'moth': return 0xa88a66;
    case 'dragonfly': return 0x25b3c9;
    case 'butterfly': return parseInt(BF_BASE[s % 4].slice(1), 16);
    default: return 0xffffff;
  }
}

const hexOf = (id: string | undefined) => LIVERY_COLOURS.find((c) => c.id === id && c.hex >= 0)?.hex;

/** The colour to BUILD a plane in (its livery's, or its own). */
export function bodyColour(look: PlaneLook | undefined, kind: BugKind, seed: number, typeColor?: number) {
  return hexOf(look?.color) ?? ownColour(kind, seed, typeColor);
}
/** The trim (pattern) colour: its own pick, or white (black on a white or silver plane). */
export function trimColour(look: PlaneLook | undefined) {
  const t = hexOf(look?.trim);
  if (t !== undefined) return t;
  return look?.color === 'white' || look?.color === 'silver' ? 0x22222a : 0xf2f2ee;
}

// ---- 🖌️ The paint shader ----

/** A plane's paint: the uniforms its materials share (updated without rebuilding anything). */
export interface Paint {
  /** The colour it was built in (the parts the pattern goes on), and the colours it shows now. */
  key: { value: THREE.Color };
  main: { value: THREE.Color };
  trim: { value: THREE.Color };
  /** 0 plain, 1 stripes, 2 spots, 3 racing stripe, 4 the Anthill tail. */
  pattern: { value: number };
  /** Its length (the pattern's size), and the bug's frame (world → bug: updated every frame by the airfield). */
  len: { value: number };
  inv: { value: THREE.Matrix4 };
}

const PATTERN_NO: Record<string, number> = { plain: 0, stripes: 1, spots: 2, racing: 3, tail: 4 };

/**
 * Paint `m` (a freshly built plane): every material with colours in its geometry is copied for this plane alone and
 * given the pattern. Returns the paint, kept in m.root.userData.paint.
 */
export function paintPlane(m: ArtBug, built: number, look: PlaneLook | undefined): Paint {
  const paint: Paint = {
    key: { value: new THREE.Color(built) },
    main: { value: new THREE.Color(built) },
    trim: { value: new THREE.Color(trimColour(look)) },
    pattern: { value: PATTERN_NO[look?.pattern ?? 'plain'] ?? 0 },
    len: { value: Math.max(0.1, m.length) },
    inv: { value: new THREE.Matrix4() },
  };
  const copies = new Map<THREE.Material, THREE.Material>();
  m.root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry.getAttribute('color')) return;
    const mat = mesh.material as THREE.MeshStandardMaterial;
    if (Array.isArray(mat) || !mat.vertexColors || mat.map) return; // (a wing's picture: it's built in the colour)
    let copy = copies.get(mat);
    if (!copy) {
      copy = mat.clone();
      copy.onBeforeCompile = (sh) => {
        sh.uniforms.lvKey = paint.key;
        sh.uniforms.lvMain = paint.main;
        sh.uniforms.lvTrim = paint.trim;
        sh.uniforms.lvPat = paint.pattern;
        sh.uniforms.lvLen = paint.len;
        sh.uniforms.lvInv = paint.inv;
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nuniform mat4 lvInv;\nvarying vec3 vLv;')
          .replace('#include <project_vertex>', '#include <project_vertex>\nvLv = (lvInv * modelMatrix * vec4(transformed, 1.0)).xyz;');
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', `#include <common>
uniform vec3 lvKey; uniform vec3 lvMain; uniform vec3 lvTrim; uniform float lvPat; uniform float lvLen;
varying vec3 vLv;
float lvHash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }`)
          .replace('#include <color_fragment>', `#include <color_fragment>
#ifdef USE_COLOR
  if (distance(vColor.rgb, lvKey) < 0.035) {
    vec3 p = vLv / lvLen;            // x: side, y: up, z: nose (+) to tail (-), in plane lengths
    float t = 0.0;
    vec3 col = lvMain;
    if (lvPat > 0.5 && lvPat < 1.5) {          // 🦓 stripes round it, nose to tail
      t = step(0.5, fract(p.z * 6.0 + 0.25));
    } else if (lvPat < 2.5 && lvPat > 1.5) {   // 🔴 spots
      vec3 q = p * 13.0; vec3 c = floor(q); vec3 f = fract(q) - 0.5;
      float h = lvHash(c);
      t = (1.0 - smoothstep(0.24 + 0.1 * h, 0.28 + 0.1 * h, length(f))) * step(0.25, h);
    } else if (lvPat < 3.5 && lvPat > 2.5) {   // 🏁 a racing stripe down its back, with pinstripes
      float a = abs(p.x);
      t = 1.0 - smoothstep(0.045, 0.055, a);
      if (a > 0.065 && a < 0.08) col = vec3(0.92);
    } else if (lvPat > 3.5) {                  // 🐜 the Anthill tail: the back third in the trim, a white line between
      t = 1.0 - smoothstep(-0.13, -0.11, p.z);
      if (abs(p.z + 0.095) < 0.012) { col = vec3(0.92); t = 0.0; }
    }
    diffuseColor.rgb = mix(col, lvTrim, t);
  }
#endif`);
      };
      copy.customProgramCacheKey = () => 'livery-v1';
      copies.set(mat, copy);
    }
    mesh.material = copy;
  });
  m.root.userData.paint = paint;
  return paint;
}

/** Change a painted plane's colours and pattern at once (its body; its wings when it's next built). */
export function repaint(m: ArtBug, look: PlaneLook | undefined) {
  const paint = m.root.userData.paint as Paint | undefined;
  if (!paint) return;
  const c = hexOf(look?.color);
  // (a plane built in its own colour shows its own until it's built again in the new one: its body takes it now)
  paint.main.value.setHex(c ?? paint.key.value.getHex());
  paint.trim.value.setHex(trimColour(look));
  paint.pattern.value = PATTERN_NO[look?.pattern ?? 'plain'] ?? 0;
}

/** Keep the pattern on the bug as it moves (call each frame for a plane in sight). */
export function followPaint(m: ArtBug) {
  const paint = m.root.userData.paint as Paint | undefined;
  if (paint) paint.inv.value.copy(m.root.matrixWorld).invert();
}

// ---- 🎨 The panel: name, paint and upgrades for one plane ----

export interface PlanePanelModel {
  gate: number;
  look: PlaneLook;
  /** "🐞 Ladybug · 4 seats" */
  type: string;
  cash: number;
  ups: { k: string; ic: string; name: string; desc: string; lv: number; max: number; cost: number | null }[];
}
export interface PlanePanelHooks {
  model: () => PlanePanelModel | null;
  /** The look changed (name, colour, trim or pattern). */
  setLook: (look: PlaneLook) => void;
  buy: (k: string) => void;
}

const sw = (hex: number) => (hex < 0 ? 'conic-gradient(#e23b2e 0 25%, #f6c431 0 50%, #25b3c9 0 75%, #a88a66 0)' : '#' + hex.toString(16).padStart(6, '0'));

export class PlanePanel {
  private root: HTMLElement;
  private hooks: PlanePanelHooks | null = null;
  private timer = 0;
  private openedAt = 0;
  private els: Record<string, HTMLElement> = {};

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'gm-overlay hidden';
    this.root.innerHTML = `<div class="gm-panel pl-panel">
      <div class="gm-title"></div>
      <div class="pl-type"></div>
      <label class="pl-lab">✏️ NAME</label>
      <input class="pl-name" maxlength="${NAME_MAX}" enterkeyhint="done" autocomplete="off" spellcheck="false">
      <label class="pl-lab">🎨 PAINT</label>
      <div class="pl-sw" data-k="color">${LIVERY_COLOURS.map((c) => `<button data-v="${c.id}" title="${c.name}" style="background:${sw(c.hex)}"></button>`).join('')}</div>
      <label class="pl-lab">🖌️ PATTERN</label>
      <div class="pl-pat">${PATTERNS.map((p) => `<button data-v="${p.id}">${p.icon} ${p.name}</button>`).join('')}</div>
      <label class="pl-lab pl-trimlab">✨ TRIM</label>
      <div class="pl-sw" data-k="trim">${LIVERY_COLOURS.filter((c) => c.hex >= 0).map((c) => `<button data-v="${c.id}" title="${c.name}" style="background:${sw(c.hex)}"></button>`).join('')}</div>
      <label class="pl-lab">⬆️ THIS PLANE</label>
      <div class="gm-cash"></div>
      <div class="gm-rows pl-ups"></div>
      <button class="gm-close">Done</button>
    </div>`;
    parent.appendChild(this.root);
    const q = (s: string) => this.root.querySelector(s) as HTMLElement;
    this.els = { title: q('.gm-title'), type: q('.pl-type'), name: q('.pl-name'), cash: q('.gm-cash'), ups: q('.pl-ups'), trimLab: q('.pl-trimlab'), trim: q('.pl-sw[data-k="trim"]') };
    q('.gm-close').addEventListener('click', () => this.close());
    this.root.addEventListener('click', (e) => {
      if (e.target === this.root && performance.now() - this.openedAt > 350) this.close();
    });
    const name = this.els.name as HTMLInputElement;
    const saveName = () => {
      const m = this.hooks?.model();
      if (!m) return;
      const v = name.value.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
      this.hooks!.setLook({ ...m.look, name: v || undefined });
    };
    name.addEventListener('change', saveName);
    name.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') name.blur();
    });
    // (typing in the box must not walk the ant: the game listens for keys on the window)
    for (const ev of ['keydown', 'keyup']) name.addEventListener(ev, (e) => e.stopPropagation());
    this.root.querySelectorAll('.pl-sw').forEach((row) =>
      row.addEventListener('click', (e) => {
        const b = (e.target as HTMLElement).closest('button');
        const m = this.hooks?.model();
        if (!b || !m) return;
        const k = (row as HTMLElement).dataset.k as 'color' | 'trim';
        this.hooks!.setLook({ ...m.look, [k]: b.dataset.v === 'original' ? undefined : b.dataset.v });
        this.render();
      }),
    );
    q('.pl-pat').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      const m = this.hooks?.model();
      if (!b || !m) return;
      this.hooks!.setLook({ ...m.look, pattern: b.dataset.v === 'plain' ? undefined : b.dataset.v });
      this.render();
    });
    this.els.ups.addEventListener('click', (e) => {
      const row = (e.target as HTMLElement).closest('.gm-row') as HTMLElement | null;
      if (!row || !row.classList.contains('ok')) return;
      this.hooks?.buy(row.dataset.id!);
      this.render();
    });
  }

  get isOpen() {
    return !this.root.classList.contains('hidden');
  }

  open(hooks: PlanePanelHooks) {
    this.hooks = hooks;
    this.openedAt = performance.now();
    this.root.classList.remove('hidden');
    const m = hooks.model();
    if (m) (this.els.name as HTMLInputElement).value = planeName(m.look, m.gate);
    this.els.ups.innerHTML = '';
    this.render();
    window.clearInterval(this.timer);
    this.timer = window.setInterval(() => this.render(), 400);
  }

  close() {
    if (!this.isOpen) return;
    (this.els.name as HTMLInputElement).blur();
    window.clearInterval(this.timer);
    this.root.classList.add('hidden');
    this.hooks = null;
  }

  private render() {
    const m = this.hooks?.model();
    if (!m) return this.close();
    const put = (e: Element, t: string) => {
      if (e.textContent !== t) e.textContent = t;
    };
    put(this.els.title, `✈️ Gate ${m.gate + 1}'s plane`);
    put(this.els.type, m.type);
    put(this.els.cash, `💵 ${Math.floor(m.cash).toLocaleString()} available`);
    const pick = (k: 'color' | 'trim', v: string) => this.root.querySelectorAll(`.pl-sw[data-k="${k}"] button`).forEach((b) => b.classList.toggle('on', (b as HTMLElement).dataset.v === v));
    pick('color', m.look.color ?? 'original');
    pick('trim', m.look.trim ?? (m.look.color === 'white' || m.look.color === 'silver' ? 'black' : 'white'));
    const pat = m.look.pattern ?? 'plain';
    this.root.querySelectorAll('.pl-pat button').forEach((b) => b.classList.toggle('on', (b as HTMLElement).dataset.v === pat));
    // (the trim only means something with a pattern)
    this.els.trimLab.classList.toggle('dim', pat === 'plain');
    this.els.trim.classList.toggle('dim', pat === 'plain');
    // the upgrade rows (built once, updated in place)
    if (this.els.ups.children.length !== m.ups.length) {
      this.els.ups.innerHTML = m.ups
        .map((u) => `<button class="gm-row" data-id="${u.k}"><span class="l1"><b class="nm"></b><b class="pr"></b></span><span class="l2"><i class="lv"></i><i class="ds"></i></span></button>`)
        .join('');
    }
    m.ups.forEach((u, i) => {
      const el = this.els.ups.children[i] as HTMLElement;
      const maxed = u.cost === null;
      const ok = !maxed && m.cash >= u.cost!;
      el.className = `gm-row ${maxed ? 'max' : ok ? 'ok' : 'no'}`;
      put(el.querySelector('.nm')!, `${u.ic}  ${u.name}`);
      put(el.querySelector('.pr')!, maxed ? 'MAX' : `💵 ${u.cost!.toLocaleString()}`);
      put(el.querySelector('.lv')!, `Lv ${u.lv}/${u.max}`);
      put(el.querySelector('.ds')!, u.desc);
    });
  }
}
