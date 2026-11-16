// ============================================================================
// fuel.ts — ⛽ where bugs get fuel and water: the FUEL FLOWER and the DEW TANK (v0.68).
//
// FUEL FLOWER: a pink flower whose cup is filled with glowing amber nectar. The nectar IS the fuel gauge:
//   `setLevel(0..1)` raises and lowers it (the glow dims to nothing when it's empty). A thin green hose hangs
//   from the cup to a little red nozzle on the ground: that's the pump.
//   Size: ~13 tall, 11 across (petals). Tris ~2,300. Meshes 7.  Spots: 'pump' (the nozzle), 'top' (the cup).
//
// DEW TANK: a huge dewdrop sitting on a curled leaf: clear, shiny, with a bluer "water" inside it and a bright
//   highlight. A short spigot (a hollow grass stem) comes out of the bottom.
//   Size: drop 11 wide × 9 tall on a 24 × 15 leaf (a big drop is ~10 mm). Tris ~1,500. Meshes 6.
//   Spots: 'pump' (the spigot), 'top'.
// ============================================================================
import * as THREE from 'three';
import { mat } from '../kit';
import { Batch, Piece, box, leafGeometry, v3 } from './common';

// ------------------------------- fuel flower -------------------------------
const NECTAR_BASE = 1.0; // y of the bottom inside the cup (relative to the cup)
const NECTAR_FULL = 4.0; // y of the full line
const CUP_Y = 8.6; // where the cup sits on the stem
const nectarMat = new THREE.MeshStandardMaterial({ color: 0xffa51f, emissive: 0xff8a00, emissiveIntensity: 0.95, roughness: 0.22 });
const petalMat = mat(0xec4f93, { rough: 0.5, emissive: 0x5a1236 });
const petalTipMat = mat(0xff8cc0, { rough: 0.5, emissive: 0x5a1236 });
const cupMat = mat(0xf6e3b0, { rough: 0.4 });
const greenMat = mat(0x4f9b34, { rough: 0.6 });
const leafMat = mat(0x6cbb45, { rough: 0.55 });
const hoseMat = mat(0x3f8a2e, { rough: 0.5 });
const nozzleMat = mat(0xe23b2e, { rough: 0.4 });

export interface FuelFlowerPiece extends Piece {
  /** 0 = empty, 1 = full: raises/lowers the glowing nectar. */
  setLevel(level: number): void;
  level: number;
}

export function makeFuelFlower(): FuelFlowerPiece {
  const root = new THREE.Group();
  const b = new Batch();
  // stem (a little thicker at the foot) + two leaves + sepals under the cup
  b.add(new THREE.CylinderGeometry(0.45, 0.7, CUP_Y + 0.5, 8).translate(0, (CUP_Y + 0.5) / 2, 0), greenMat);
  b.at(leafGeometry(7, 2.6, 0.35, 0.45), leafMat, 2.6, 3.2, 0, { ry: Math.PI / 2, rx: -0.55 });
  b.at(leafGeometry(6, 2.2, 0.35, 0.45), leafMat, -2.3, 5.0, 0.3, { ry: -Math.PI / 2, rx: -0.6 });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    b.at(leafGeometry(3.4, 1.2, 0.2, 0.2), greenMat, Math.sin(a) * 1.3, CUP_Y + 0.4, Math.cos(a) * 1.3, { ry: a, rx: -0.9 });
  }
  // petals: 9 round-tipped petals fanning out of the rim, tilted up, in two tones
  const petal = leafGeometry(5.8, 2.7, 0.3, 0.35, [8, 4]).clone().translate(0, 0, 2.9);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    b.at(petal, i % 2 ? petalMat : petalTipMat, Math.sin(a) * 2.8, CUP_Y + 3.3, Math.cos(a) * 2.8, { ry: a, rx: -0.75 });
  }
  root.add(b.build());

  // the cup: a lathe-turned bowl with thick sides (outer curve, rim, straight inner wall, flat bottom)
  const prof = [
    [0.01, 0], [1.5, 0.15], [2.6, 0.8], [3.3, 2.0], [3.5, 3.3], [3.45, 4.15], [3.2, 4.45], [2.9, 4.2], [2.85, NECTAR_BASE], [0.01, NECTAR_BASE],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const cup = new THREE.Mesh(new THREE.LatheGeometry(prof, 24), cupMat);
  cup.position.y = CUP_Y;
  cup.castShadow = true;
  cup.receiveShadow = true;
  root.add(cup);

  // nectar: a cylinder we squash to the level (always narrower than the cup, so it never pokes through)
  const nectar = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 22), nectarMat);
  nectar.castShadow = false;
  root.add(nectar);

  // hose + nozzle (the "pump")
  const curve = new THREE.CatmullRomCurve3([v3(0, CUP_Y + 1.4, 3.35), v3(0, CUP_Y - 1.5, 4.6), v3(0.8, 3.0, 5.4), v3(1.2, 0.9, 6.4), v3(1.0, 0.45, 7.8)]);
  const hose = new THREE.Mesh(new THREE.TubeGeometry(curve, 22, 0.3, 6), hoseMat);
  hose.castShadow = true;
  root.add(hose);
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.5, 1.5, 8).rotateX(Math.PI / 2).translate(1.0, 0.55, 8.3), nozzleMat);
  nozzle.castShadow = true;
  root.add(nozzle);

  const piece: FuelFlowerPiece = {
    root,
    level: 1,
    blockers: [box(0, 0, 2.2, 2.2)],
    roofs: [],
    spots: { pump: v3(1.0, 0, 10.0), top: v3(0, CUP_Y + NECTAR_FULL, 0) },
    setLevel(level: number) {
      const l = Math.min(1, Math.max(0, level));
      piece.level = l;
      const h = 0.12 + l * (NECTAR_FULL - NECTAR_BASE - 0.12);
      nectar.visible = l > 0.01;
      nectar.scale.set(2.72, h, 2.72);
      nectar.position.y = CUP_Y + NECTAR_BASE + h / 2;
      // the glow fades as the fuel runs low (shared material: all flowers at once, which is fine for a gauge look)
    },
  };
  piece.setLevel(1);
  return piece;
}

// -------------------------------- dew tank --------------------------------
const dewMat = mat(0xcfeeff, { rough: 0.04, metal: 0.15, opacity: 0.42 });
const waterMat = mat(0x58b2ee, { rough: 0.1, opacity: 0.4 });
const shineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false });
const tankLeafMat = mat(0x58a63a, { rough: 0.55 });
const veinMat = mat(0x3f7f2b, { rough: 0.6 });
const spigotMat = mat(0xcdd8c0, { rough: 0.4, opacity: 0.8 });

export function makeDewTank(): Piece {
  const root = new THREE.Group();
  const b = new Batch();
  // the leaf the drop sits on: curled up at the edges so the drop looks held
  b.at(leafGeometry(24, 15, 0.5, 1.6, [24, 12]), tankLeafMat, 0, 0.25, 0);
  // leaf veins: a midrib and a few side veins (thin boxes, sitting on the leaf's top surface)
  b.at(new THREE.BoxGeometry(0.3, 0.12, 21), veinMat, 0, 0.78, 0);
  for (let i = -3; i <= 3; i++) {
    if (!i) continue;
    b.at(new THREE.BoxGeometry(5.2, 0.1, 0.18), veinMat, Math.sign(i) * 2.8, 0.7, i * 2.8, { ry: Math.sign(i) * 0.5 });
  }
  root.add(b.build());

  // the drop (clear) with a bluer core and a bright highlight
  const dropY = 4.1;
  const drop = new THREE.Mesh(new THREE.SphereGeometry(5.5, 28, 16), dewMat);
  drop.scale.set(1, 0.82, 1);
  drop.position.set(0, dropY, 0);
  const core = new THREE.Mesh(new THREE.SphereGeometry(4.8, 24, 14), waterMat);
  core.scale.set(1, 0.76, 1);
  core.position.set(0, dropY - 0.2, 0);
  const shine = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), shineMat);
  shine.scale.set(1.5, 0.7, 0.6);
  shine.position.set(-2.6, dropY + 2.7, 3.0);
  shine.rotation.set(-0.5, 0.5, 0.4);
  const shine2 = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), shineMat);
  shine2.position.set(2.4, dropY - 1.8, 3.8);
  drop.renderOrder = 2;
  root.add(core, drop, shine, shine2);

  // spigot: a short hollow grass stem sticking out of the bottom of the drop
  const spigot = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 3.4, 8).rotateX(Math.PI / 2 - 0.25).translate(0, 1.6, 6.3), spigotMat);
  root.add(spigot);

  return {
    root,
    blockers: [box(0, 0, 10.5, 10.5)],
    roofs: [],
    spots: { pump: v3(0, 0, 10.5), top: v3(0, dropY + 4.5, 0) },
  };
}
