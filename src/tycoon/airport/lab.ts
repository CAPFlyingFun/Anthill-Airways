// ============================================================================
// lab.ts — 🧪 the airport art lab (dev only):  /Anthill-Airways/lab/?show=airport
//
//   (nothing)          a small sample airport: runway, taxiway, terminal + 2 gates, hangars, tower, fuel flowers,
//                      dew tank, windsock, mushroom lights, baggage cart and a sign, on plain dirt
//   &kind=terminal     one piece, big and centred. kinds: runway taxiway terminal hangar acorn tower fuel dew
//                      windsock fungus gate cart sign
//   &roofs=off         hide the roofs (the 2.5D cutaway view)
//   &cam=game|low|top  &dist=120  &t=2   (see tycoon/lab/lab.ts)
// ============================================================================
import * as THREE from 'three';
import type { LabCtx } from '../lab/lab';
import { PAL } from '../kit';
import { Piece, countStats } from './common';
import { makeRunway } from './runway';
import { makeTaxiway } from './taxiway';
import { makeTerminal } from './terminal';
import { makeHangar } from './hangar';
import { makeControlTower } from './tower';
import { makeFuelFlower, makeDewTank } from './fuel';
import { makeWindsock } from './windsock';
import { makeFungusLight, fungusRow } from './fungus';
import { makeGate } from './gate';
import { makeBaggageCart } from './baggage';
import { makeSign } from './sign';

export function labScene(scene: THREE.Scene, ctx: LabCtx) {
  const q = ctx.params;
  const kind = q.get('kind');
  const roofsOff = q.get('roofs') === 'off';
  const updates: ((dt: number) => void)[] = [];
  const stats: Record<string, { tris: number; meshes: number }> = {};

  // plain dirt ground
  const ground = new THREE.Mesh(new THREE.CircleGeometry(400, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: PAL.dirt, roughness: 1 }));
  ground.receiveShadow = true;
  scene.add(ground);

  const put = (name: string, p: Piece, x = 0, z = 0, ry = 0) => {
    p.root.position.set(x, 0, z);
    p.root.rotation.y = ry;
    if (roofsOff) p.roofs.forEach((r) => (r.visible = false));
    if (p.update) updates.push(p.update);
    scene.add(p.root);
    stats[name] = countStats(p.root);
    return p;
  };

  if (kind) {
    // ---- one piece, big and centred ----
    const makers: Record<string, () => Piece> = {
      runway: () => makeRunway({ length: 60 }),
      taxiway: () => makeTaxiway([new THREE.Vector2(-20, 0), new THREE.Vector2(0, 0), new THREE.Vector2(14, 14), new THREE.Vector2(14, 34)]),
      terminal: makeTerminal,
      hangar: () => makeHangar('bottlecap'),
      acorn: () => makeHangar('acorn'),
      tower: makeControlTower,
      fuel: () => {
        const f = makeFuelFlower();
        f.setLevel(Number(q.get('level') ?? 0.7));
        return f;
      },
      dew: makeDewTank,
      windsock: makeWindsock,
      fungus: makeFungusLight,
      gate: () => makeGate({ number: '1' }),
      cart: makeBaggageCart,
      sign: () => makeSign('DEPARTURES', { width: 11, arrow: 'right' }),
    };
    const p = (makers[kind] ?? makers.terminal)();
    put(kind, p);
    const box = new THREE.Box3().setFromObject(p.root);
    const size = box.getSize(new THREE.Vector3());
    const c = box.getCenter(new THREE.Vector3());
    ctx.target.set(c.x, size.y * 0.35, c.z);
    // lab.ts places the camera `dist` away (default 30): scale small pieces up so they fill the shot
    if (!q.has('dist')) p.root.scale.setScalar(Math.min(4, 16 / Math.max(size.x, size.z, size.y)));
    if (!q.has('dist')) {
      const s = p.root.scale.x;
      ctx.target.set(c.x * s, size.y * 0.35 * s, c.z * s);
    }
    console.log('airport-stats', JSON.stringify(stats));
    (window as unknown as { airportStats: unknown }).airportStats = stats;
    return (dt: number) => updates.forEach((u) => u(dt));
  }

  // ---- the sample airport ----
  // runway on the left, running along Z; the apron (gates + terminal) to its right
  put('runway', makeRunway({ length: 140, width: 18 }), -40, 0);
  put(
    'taxiway',
    makeTaxiway([new THREE.Vector2(-31, 24), new THREE.Vector2(-6, 24), new THREE.Vector2(6, 14), new THREE.Vector2(50, 14)], 7),
  );
  put('terminal', makeTerminal(), 36, -24);
  put('gate1', makeGate({ number: '1' }), 26, -3);
  put('gate2', makeGate({ number: '2' }), 48, -3);
  put('hangar', makeHangar('bottlecap'), -6, -40);
  put('acorn', makeHangar('acorn'), 10, -46);
  put('tower', makeControlTower(), 64, -26);
  put('fuel1', makeFuelFlower(), -16, -2);
  const f2 = makeFuelFlower();
  f2.setLevel(0.35);
  put('fuel2', f2, -16, 8, 0.4);
  put('dew', makeDewTank(), -8, -18, 0.3);
  put('windsock', makeWindsock(), -24, 38);
  put('cart', makeBaggageCart(), 36, 6, 0.3);
  put('sign', makeSign('TERMINAL', { width: 10, arrow: 'left' }), 8, 6, -0.1);
  put('light', makeFungusLight(), 30, 18);
  // a row of mushroom lights along the taxiway edge
  const lamps: { x: number; y: number; z: number }[] = [];
  for (let x = -4; x <= 50; x += 9) lamps.push({ x, y: 0, z: x < 6 ? 19 - (x + 4) * 0.35 : 9.3 });
  scene.add(fungusRow(lamps, 1.6, 2.0));

  ctx.target.set(6, 0, -6);
  let total = 0;
  let totalMeshes = 0;
  for (const k of Object.keys(stats)) {
    total += stats[k].tris;
    totalMeshes += stats[k].meshes;
  }
  console.log('airport-stats', JSON.stringify(stats), 'TOTAL tris', total, 'meshes', totalMeshes);
  (window as unknown as { airportStats: unknown }).airportStats = stats;
  return (dt: number) => updates.forEach((u) => u(dt));
}
