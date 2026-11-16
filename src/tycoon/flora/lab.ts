// ============================================================================
// lab.ts — 🧪 the flora art lab (dev only). Open /Anthill-Airways/lab/?show=flora
//
//   (nothing)      a ~60-unit dirt clearing ringed by lawn, the far backdrop, and a lineup of every prop
//   &kind=lineup   just the props lineup on bare ground (use &cam=game&dist=80)
//   &kind=leaf | pebble | twig | clover | daisy | dandelion | clover-flower | morning-glory
//        | mushroom | glow | seed | acorn | dew | backdrop       one thing, big, for close-ups
//   &cam=low&dist=40     ant's-eye
// ============================================================================
import * as THREE from 'three';
import type { LabCtx } from '../lab/lab';
import { TextSprite } from '../../world/labels';
import { buildGround, Lawn, buildBackdrop, makePebble, makeFallenLeaf, makeTwig, makeClover, makeFlower, makeMushroom, makeDandelionSeed, makeAcornCap, makeDewdrop, scatter } from './index';

function label(text: string, x: number, y: number, z: number, size = 4): THREE.Sprite {
  const t = new TextSprite(size, '#fff');
  t.setText(text);
  t.sprite.position.set(x, y, z);
  return t.sprite;
}

/** Every prop in two rows, each with a name tag. Returns the group. */
function lineup(): THREE.Group {
  const g = new THREE.Group();
  const row1: [string, THREE.Object3D, number][] = [
    ['pebble 6', makePebble(6, 2), 4],
    ['pebble 12.5', makePebble(12.5, 1), 8],
    ['pebble 20', makePebble(20, 4), 13],
    ['twig 30', makeTwig(30, 2), 24],
    ['leaf green', makeFallenLeaf('green', 18, 1), 22],
    ['leaf autumn', makeFallenLeaf('autumn', 18, 2), 22],
    ['leaf brown', makeFallenLeaf('brown', 18, 3), 22],
    ['leaf red', makeFallenLeaf('red', 18, 4), 22],
  ];
  const row2: [string, THREE.Object3D, number][] = [
    ['clover', makeClover(1), 38],
    ['daisy', makeFlower('daisy', 1), 56],
    ['clover bloom', makeFlower('clover-flower', 1), 44],
    ['dandelion', makeFlower('dandelion', 1), 62],
    ['mushroom', makeMushroom(false, 1), 24],
    ['glow shroom', makeMushroom(true, 2), 24],
    ['morning-glory', makeFlower('morning-glory', 1), 76],
    ['dand. seed', makeDandelionSeed(1), 10],
    ['acorn cap', makeAcornCap(1), 8],
    ['dewdrop', makeDewdrop(2), 5],
  ];
  const place = (row: [string, THREE.Object3D, number][], z: number, x0: number, dx: number) =>
    row.forEach(([name, o, h], i) => {
      const x = x0 + i * dx;
      o.position.set(x, 0, z);
      g.add(o, label(name, x, h + 7, z, 4));
    });
  place(row1, -22, -60, 15);
  place(row2, 26, -66, 16);
  // a dewdrop resting on a leaf (real scale: 2 units across)
  const d = makeDewdrop(2.4);
  d.position.set(-60 + 4 * 15 + 3, 2.2, -22);
  // ant for scale: a 2.1-unit box worker would be tiny; use a small orange capsule marker
  const ant = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 1.1, 4, 8), new THREE.MeshStandardMaterial({ color: 0xc2452d }));
  ant.rotation.z = Math.PI / 2;
  ant.position.set(-4, 0.55, 2);
  g.add(d, ant, label('ant (2.1)', -4, 6, 2, 3));
  return g;
}

export function labScene(scene: THREE.Scene, ctx: LabCtx) {
  const kind = ctx.params.get('kind') ?? '';
  const dtor: (() => void)[] = [];
  void dtor;
  let lawn: Lawn | null = null;

  // single-prop close-ups
  const single: Record<string, () => { o: THREE.Object3D; h: number; s: number }> = {
    leaf: () => ({ o: makeFallenLeaf('green', 30, 1), h: 3, s: 28 }),
    'leaf-autumn': () => ({ o: makeFallenLeaf('autumn', 30, 2), h: 3, s: 28 }),
    'leaf-brown': () => ({ o: makeFallenLeaf('brown', 30, 3), h: 3, s: 28 }),
    'leaf-red': () => ({ o: makeFallenLeaf('red', 30, 4), h: 3, s: 28 }),
    pebble: () => ({ o: makePebble(12.5, 1), h: 4, s: 14 }),
    twig: () => ({ o: makeTwig(30, 3), h: 2, s: 30 }),
    clover: () => ({ o: makeClover(2), h: 18, s: 24 }),
    daisy: () => ({ o: makeFlower('daisy', 2), h: 44, s: 40 }),
    dandelion: () => ({ o: makeFlower('dandelion', 2), h: 50, s: 40 }),
    'clover-flower': () => ({ o: makeFlower('clover-flower', 2), h: 30, s: 26 }),
    'morning-glory': () => ({ o: makeFlower('morning-glory', 2), h: 50, s: 60 }),
    mushroom: () => ({ o: makeMushroom(false, 3), h: 8, s: 45 }),
    glow: () => ({ o: makeMushroom(true, 3), h: 8, s: 45 }),
    seed: () => ({ o: makeDandelionSeed(2), h: 3, s: 8 }),
    acorn: () => ({ o: makeAcornCap(2), h: 2, s: 10 }),
    dew: () => ({ o: makeDewdrop(8), h: 2, s: 9 }),
  };

  if (single[kind]) {
    const { o, h, s } = single[kind]();
    const ground = buildGround({ size: 140, clearings: [{ x: 0, z: 0, r: 60 }], seed: 4 });
    scene.add(ground, o);
    ctx.target.set(0, h, 0);
    if (!ctx.params.get('dist')) ctx.params.set('dist', String(s));
    return () => {};
  }

  if (kind === 'lineup') {
    scene.add(buildGround({ size: 240, clearings: [{ x: 0, z: 0, r: 120 }], seed: 4 }), lineup());
    ctx.target.set(0, 12, 0);
    return () => {};
  }

  // the main scene: clearing + lawn + props + backdrop
  const SIZE_L = 400;
  const R_CLEAR = 60;
  const avoid = (x: number, z: number) => Math.hypot(x, z) < R_CLEAR * 0.96;
  scene.add(buildGround({ size: SIZE_L, clearings: [{ x: 0, z: 0, r: R_CLEAR }], seed: 4 }));
  lawn = new Lawn({ size: SIZE_L, avoid, seed: 3, density: Number(ctx.params.get('density') ?? 0.3) });
  scene.add(lawn.root);
  scene.add(buildBackdrop(520, 5));

  // scatter a few props on the dirt (pebbles, leaves, twigs, a mushroom or two), kept clear of the lineup row
  const onDirt = (x: number, z: number) => Math.hypot(x, z) > R_CLEAR * 0.9 || Math.abs(z) < 36 && Math.abs(x) < 76;
  scatter(scene, 'pebbles', { x: 0, z: 0, w: 120, d: 120 }, 26, onDirt, 2);
  scatter(scene, 'leaves', { x: 0, z: 0, w: 120, d: 120 }, 7, onDirt, 3);
  scatter(scene, 'twigs', { x: 0, z: 0, w: 120, d: 120 }, 5, onDirt, 4);
  // and on the lawn just outside the clearing: more pebbles, leaves, mushrooms, clover
  const inLawn = (x: number, z: number) => Math.hypot(x, z) < 90 || Math.hypot(x, z) > 180;
  scatter(scene, 'pebbles', { x: 0, z: 0, w: 360, d: 360 }, 40, inLawn, 5);
  scatter(scene, 'leaves', { x: 0, z: 0, w: 360, d: 360 }, 14, inLawn, 6);
  scatter(scene, 'mushrooms', { x: 0, z: 0, w: 360, d: 360 }, 8, inLawn, 7);
  scene.add(lineup());

  ctx.target.set(0, 6, 0);
  const lw = lawn;
  return (dt: number) => lw.update(dt, ctx.camera);
}
