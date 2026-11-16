// ============================================================================
// hangar.ts — 🏠 hangars made of things an ant would find: an upturned BOTTLE CAP and an ACORN CAP (v0.68).
//
// 'bottlecap'  A blue metal cap sitting open-side-down. The skirt has the crimped (fluted) edge of a real cap,
//              the door is simply a gap cut in the skirt, and the flat top still shows the faded painted logo.
//              Size: 15 across (30 mm) × 4.2 tall; door 4.8 wide × 2.4 tall (a ladybug is 3.25 long).
//              Tris ~3,200, meshes 6.
// 'acorn'      An acorn cap (the scaly little hat) turned over to make a round shelter for small bugs, with the
//              woody stem sticking out of the top. Size: 9 across (18 mm) × ~5.5 tall; door 4.6 wide × 2.9 tall.
//              Tris ~2,600, meshes 5.
//
// In both, the ROOF (everything from the top of the door up) is a separate group in `roofs`, so hiding it shows
// the floor, the walls and what's inside.
// Door faces +Z. Spots: 'door' (just outside the door), 'inside' (the middle of the floor).
// ============================================================================
import * as THREE from 'three';
import { PAL, mat } from '../kit';
import { sharpTexture, GAME_FONT } from '../../world/labels';
import { Batch, Footprint, Piece, blockersAlong, capsuleGeometry, v3 } from './common';
import { fungusRow, glowTick } from './fungus';

export type HangarKind = 'bottlecap' | 'acorn';

// ---- bottle cap ----
const CAP_R = 7.5;
const CAP_WALL_H = 2.4; // = door height
const CAP_TOP = 4.0;
const FLUTES = 21;
const capMat = new THREE.MeshStandardMaterial({ color: PAL.capBlue, roughness: 0.38, metalness: 0.45, side: THREE.DoubleSide });
const corkMat = mat(0xcdb78e, { rough: 0.95 });
const pebbleGrey = mat(0x8f8a82, { rough: 0.8 });

let logoTex: THREE.CanvasTexture | null = null;
/** The faded paint on the top of the cap: a sun-bleached ring, an "A" with wings and the airline name. */
function logoTexture() {
  if (logoTex) return logoTex;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 512;
  const c = cv.getContext('2d')!;
  c.fillStyle = '#3e72d6';
  c.fillRect(0, 0, 512, 512);
  // sun-bleached radial patches
  const grad = c.createRadialGradient(190, 170, 20, 256, 256, 280);
  grad.addColorStop(0, 'rgba(255,255,255,0.28)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = grad;
  c.fillRect(0, 0, 512, 512);
  c.strokeStyle = 'rgba(255,255,255,0.8)';
  c.lineWidth = 14;
  c.beginPath();
  c.arc(256, 256, 214, 0, Math.PI * 2);
  c.stroke();
  c.lineWidth = 5;
  c.beginPath();
  c.arc(256, 256, 186, 0, Math.PI * 2);
  c.stroke();
  c.fillStyle = 'rgba(255,255,255,0.88)';
  c.font = `900 230px ${GAME_FONT}`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText('A', 256, 232);
  // little wings
  c.beginPath();
  c.moveTo(150, 250);
  c.quadraticCurveTo(100, 210, 70, 235);
  c.quadraticCurveTo(110, 262, 150, 270);
  c.moveTo(362, 250);
  c.quadraticCurveTo(412, 210, 442, 235);
  c.quadraticCurveTo(402, 262, 362, 270);
  c.fill();
  c.font = `900 50px ${GAME_FONT}`;
  c.fillText('ANTHILL AIR', 256, 372);
  // scratches
  c.strokeStyle = 'rgba(20,40,90,0.35)';
  c.lineWidth = 2;
  for (let i = 0; i < 14; i++) {
    const x = 60 + ((i * 97) % 380);
    const y = 60 + ((i * 53) % 380);
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + 26, y + 9);
    c.stroke();
  }
  logoTex = sharpTexture(cv);
  return logoTex;
}

/** A cylinder skirt with the fluted (crimped) edge of a bottle cap. Partial arcs leave room for the door. */
function flutedSkirt(rBottom: number, rTop: number, h: number, thetaStart: number, thetaLen: number, y0: number) {
  const seg = Math.max(8, Math.round((126 * thetaLen) / (Math.PI * 2)));
  const g = new THREE.CylinderGeometry(rTop, rBottom, h, seg, 1, true, thetaStart, thetaLen);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const a = Math.atan2(x, z);
    const k = 1 + 0.035 * Math.cos(a * FLUTES);
    p.setXYZ(i, x * k, p.getY(i) + h / 2 + y0, z * k);
  }
  g.computeVertexNormals();
  return g;
}

function bottleCap(): Piece {
  const root = new THREE.Group();
  const doorHalf = Math.asin(2.4 / CAP_R);
  // walls: skirt with the door gap
  const wall = new Batch();
  wall.add(flutedSkirt(CAP_R, CAP_R, CAP_WALL_H, doorHalf, Math.PI * 2 - 2 * doorHalf, 0), capMat);
  // door jambs: thin plates closing the cut edges so the wall has thickness
  for (const s of [-1, 1]) {
    const a = s * doorHalf;
    wall.at(new THREE.BoxGeometry(0.35, CAP_WALL_H, 0.5), capMat, Math.sin(a) * (CAP_R - 0.1), CAP_WALL_H / 2, Math.cos(a) * (CAP_R - 0.1), { ry: a });
  }
  root.add(wall.build());
  // floor: a cork liner (the cap's inner disc)
  const floor = new THREE.Mesh(new THREE.CylinderGeometry(CAP_R - 0.2, CAP_R - 0.2, 0.3, 40), corkMat);
  floor.position.y = 0.15;
  floor.receiveShadow = true;
  root.add(floor);

  // roof: skirt band above the door + domed lid + rolled edge + painted top
  const roofG = new THREE.Group();
  const rb = new Batch();
  const band = flutedSkirt(CAP_R, CAP_R * 0.93, CAP_TOP - CAP_WALL_H, 0, Math.PI * 2, CAP_WALL_H);
  rb.add(band, capMat);
  const lid = new THREE.CylinderGeometry(CAP_R * 0.93, CAP_R * 0.93, 0.25, 40).translate(0, CAP_TOP - 0.12, 0);
  rb.add(lid, capMat);
  rb.add(new THREE.TorusGeometry(CAP_R * 0.93, 0.34, 6, 48).rotateX(Math.PI / 2).translate(0, CAP_TOP, 0), capMat);
  roofG.add(rb.build());
  const logo = new THREE.Mesh(
    new THREE.CircleGeometry(CAP_R * 0.86, 48).rotateX(-Math.PI / 2).translate(0, CAP_TOP + 0.03, 0),
    new THREE.MeshStandardMaterial({ map: logoTexture(), roughness: 0.5, metalness: 0.2 }),
  );
  roofG.add(logo);
  root.add(roofG);

  // inside: a work lamp (glowing mushroom), two wheel chocks, a puddle-of-oil dot
  const inside = new Batch();
  inside.at(new THREE.SphereGeometry(0.5, 10, 6), pebbleGrey, -2.2, 0.5, 4.8, { sx: 1.4, sy: 0.7, sz: 1.2 });
  inside.at(new THREE.SphereGeometry(0.5, 10, 6), pebbleGrey, 2.2, 0.5, 4.8, { sx: 1.4, sy: 0.7, sz: 1.2 });
  root.add(inside.build());
  root.add(fungusRow([{ x: -4.7, y: 0.3, z: -3.5 }], 2.2, 2.0));

  // blockers: the skirt, minus the door
  const pts: { x: number; z: number }[] = [];
  const steps = 22;
  for (let i = 0; i <= steps; i++) {
    const a = doorHalf + ((Math.PI * 2 - 2 * doorHalf) * i) / steps;
    pts.push({ x: Math.sin(a) * CAP_R, z: Math.cos(a) * CAP_R });
  }
  const blockers: Footprint[] = blockersAlong(pts, 0.5, 1);

  return {
    root,
    blockers,
    roofs: [roofG],
    spots: { door: v3(0, 0, CAP_R + 2.5), inside: v3(0, 0.3, -0.5) },
    update: glowTick,
  };
}

// ---- acorn cap ----
const AC_R = 4.5;
const AC_SPLIT = 0.87; // radians from the top where the roof meets the walls
const acornMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, side: THREE.DoubleSide });
const stemMat = mat(0x6e4524, { rough: 0.85 });

/** A sphere section covered in overlapping little scales (shingles), colored in two browns. */
function scalyDome(thetaStart: number, thetaLen: number, phiStart: number, phiLen: number) {
  const g = new THREE.SphereGeometry(AC_R, 44, 12, phiStart, phiLen, thetaStart, thetaLen);
  const p = g.getAttribute('position');
  const col: number[] = [];
  const c = new THREE.Color();
  const tiers = 6;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const th = Math.acos(Math.min(1, Math.max(-1, y / AC_R)));
    const ph = Math.atan2(z, -x);
    const tier = (th / (Math.PI / 2)) * tiers;
    const f = tier - Math.floor(tier); // 0..1 inside a tier
    const odd = Math.floor(tier) % 2;
    const s = 0.5 + 0.5 * Math.cos(ph * 10 + odd * Math.PI);
    const k = 1 + 0.025 * f + 0.022 * s * (0.4 + 0.6 * f);
    p.setXYZ(i, x * k, y * k, z * k);
    c.setHex(0x8b5a2b).lerp(new THREE.Color(0xb27a40), 0.55 * s + 0.25 * (1 - f));
    col.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

function acorn(): Piece {
  const root = new THREE.Group();
  const doorHalf = 0.54; // radians of the base ring
  // walls: the lower ring with the door gap (door faces +Z which is phi = pi/2)
  const wall = new Batch();
  wall.add(scalyDome(AC_SPLIT, Math.PI / 2 - AC_SPLIT, Math.PI / 2 + doorHalf, Math.PI * 2 - 2 * doorHalf), acornMat);
  root.add(wall.build());
  const floor = new THREE.Mesh(new THREE.CylinderGeometry(AC_R - 0.15, AC_R - 0.15, 0.25, 28), mat(0xb99a66, { rough: 0.95 }));
  floor.position.y = 0.12;
  floor.receiveShadow = true;
  root.add(floor);

  // roof: the scaly top + the woody stem
  const roofG = new THREE.Group();
  const rb = new Batch();
  rb.add(scalyDome(0, AC_SPLIT, 0, Math.PI * 2), acornMat);
  roofG.add(rb.build());
  const top = AC_R * Math.cos(0.0);
  const st = new Batch();
  st.at(new THREE.CylinderGeometry(0.5, 0.75, 1.4, 8), stemMat, 0, top + 0.5, 0);
  st.at(new THREE.SphereGeometry(0.55, 8, 6), stemMat, 0, top + 1.25, 0, { sy: 0.8 });
  roofG.add(st.build());
  root.add(roofG);

  // inside: a small lamp
  root.add(fungusRow([{ x: -2.2, y: 0.25, z: -1.6 }], 1.5, 1.5));

  // blockers
  const baseR = AC_R * 0.97;
  const pts: { x: number; z: number }[] = [];
  const steps = 16;
  for (let i = 0; i <= steps; i++) {
    const a = doorHalf + ((Math.PI * 2 - 2 * doorHalf) * i) / steps; // measured from +Z like the bottle cap
    pts.push({ x: Math.sin(a) * baseR, z: Math.cos(a) * baseR });
  }

  return {
    root,
    blockers: blockersAlong(pts, 0.45, 1),
    roofs: [roofG],
    spots: { door: v3(0, 0, AC_R + 2.2), inside: v3(0, 0.25, -0.3) },
    update: glowTick,
  };
}

/** makeHangar('bottlecap' | 'acorn') — see the header. */
export function makeHangar(kind: HangarKind = 'bottlecap'): Piece {
  return kind === 'acorn' ? acorn() : bottleCap();
}
