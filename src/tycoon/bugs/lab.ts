// ============================================================================
// lab.ts — 🧪 the bugs art-lab scene (dev only). Shows every creature from index.ts in a LINEUP with a name label,
// walking in place under the game's lighting, so each one can be checked from the game camera AND an ant's-eye camera.
//
//   /Anthill-Airways/lab/?show=bugs                     all kinds, REAL size, in three rows (small / medium / large)
//   &group=small | mid | large                          just one row (use a small &dist for the small row)
//   &kind=ladybug                                       one bug, BIG and centred (shown at ~14 units long)
//   &mode=fly                                           flyers hover with wings going (everyone else keeps walking)
//   &norm=14                                            show every bug at the SAME length (for comparing designs)
//   &pop=1                                              anoles pop their dewlap right away
//   &seed=2                                             pick the variation (beetle colour, butterfly pattern...)
//   &cam=game|low|top  &dist=40  &t=2                   (see ../lab/lab.ts)
// ============================================================================
import * as THREE from 'three';
import { animateCreature } from '../../actors/models';
import { TextSprite } from '../../world/labels';
import type { LabCtx } from '../lab/lab';
import { PAL } from '../kit';
import { BUG_KINDS, BUG_LENGTH, makeBug, type Bug, type BugKind } from './index';

const ROWS: Record<string, BugKind[]> = {
  small: ['aphid', 'housefly', 'ladybug', 'pillbug', 'bee', 'jumping-spider'],
  mid: ['wolf-spider', 'beetle', 'moth', 'butterfly', 'toad'],
  large: ['dragonfly', 'gecko', 'anole'],
};
/** Rough footprint width of each kind (wing span for the flyers), for spacing the lineup. */
const WIDTH: Partial<Record<BugKind, number>> = { moth: 24, dragonfly: 52, butterfly: 42, bee: 9, beetle: 16, toad: 24, ladybug: 4, 'wolf-spider': 24, 'jumping-spider': 9 };

export function labScene(scene: THREE.Scene, ctx: LabCtx) {
  const p = ctx.params;
  const mode = p.get('mode') ?? 'walk';
  const norm = Number(p.get('norm') ?? 0);
  const seed = Number(p.get('seed') ?? 0);
  const only = p.get('kind') as BugKind | null;
  const group = p.get('group');

  // the lawn
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshStandardMaterial({ color: PAL.lawn, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const bugs: Array<{ bug: Bug; hover: number }> = [];
  const place = (kind: BugKind, x: number, z: number, length: number | undefined, labelSize: number) => {
    const bug = makeBug(kind, { seed, length });
    bug.root.position.set(x, 0, z);
    bug.root.rotation.y = Number(p.get('turn') ?? 0.5);
    const fly = mode === 'fly' && ['ladybug', 'bee', 'beetle', 'moth', 'dragonfly', 'butterfly', 'housefly'].includes(kind);
    bug.flying = fly;
    if (p.get('pop')) (bug.root.userData.popDewlap as (() => void) | undefined)?.();
    scene.add(bug.root);
    bugs.push({ bug, hover: fly ? Math.max(bug.length * 0.5, 3) : 0 });
    const label = new TextSprite(labelSize, '#ffffff');
    label.setText(kind);
    label.sprite.position.set(x, bug.height + (fly ? Math.max(bug.length * 0.5, 3) : 0) + labelSize * 0.9 + (kind === 'butterfly' ? 14 : 0), z);
    scene.add(label.sprite);
  };

  if (only) {
    place(only, 0, 0, norm || 14, 2.2);
    ctx.target.set(0, 4, 0);
  } else {
    const rows = group ? { [group]: ROWS[group] ?? [] } : ROWS;
    let z = 0;
    const zs: number[] = [];
    let maxHalf = 0;
    for (const [name, kinds] of Object.entries(rows)) {
      const w = (k: BugKind) => (norm ? norm * 1.4 : (WIDTH[k] ?? BUG_LENGTH[k]) + (name === 'small' ? 2.5 : 5));
      const total = kinds.reduce((s, k) => s + w(k), 0);
      let x = -total / 2;
      const label = norm ? norm * 0.16 : name === 'small' ? 0.8 : name === 'mid' ? 2 : 4;
      for (const k of kinds) {
        place(k, x + w(k) / 2, z, norm || undefined, label);
        x += w(k);
      }
      maxHalf = Math.max(maxHalf, total / 2);
      zs.push(z);
      z += name === 'small' ? 14 : name === 'mid' ? 30 : 50;
    }
    ctx.target.set(0, 0, (zs[0] + zs[zs.length - 1]) / 2);
    if (!p.get('dist')) p.set('dist', String(maxHalf * 1.2));
  }

  // Budget report for the console / tests: window.bugStats() -> { kind: { tris, meshes } } (default-size builds)
  (window as unknown as { bugStats: () => Record<string, { tris: number; meshes: number; seats: number; legs: number }> }).bugStats = () => {
    const out: Record<string, { tris: number; meshes: number; seats: number; legs: number }> = {};
    for (const k of BUG_KINDS) {
      const b = makeBug(k);
      let tris = 0, meshes = 0;
      b.root.traverse((o) => {
        const me = o as THREE.Mesh;
        if (me.isMesh) {
          meshes++;
          const g = me.geometry;
          tris += (g.index ? g.index.count : g.getAttribute('position').count) / 3;
        }
      });
      out[k] = { tris, meshes, seats: b.seats.length, legs: b.legs.length };
    }
    return out;
  };
  // keep the label order stable for BUG_KINDS (referenced so the lineup never silently misses a kind)
  void BUG_KINDS;
  let t = 0;
  return (dt: number) => {
    t += dt;
    for (const { bug, hover } of bugs) {
      const walking = !bug.flying;
      animateCreature(bug, dt, walking ? bug.length * 1.4 : 0, false);
      if (hover) bug.root.position.y = hover + Math.sin(t * 2 + bug.root.position.x) * hover * 0.12;
    }
  };
}
