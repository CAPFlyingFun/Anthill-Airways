// ============================================================================
// terminal.ts — 🐚 the passenger terminal: a big SCALLOP SHELL lying open on the dirt (v0.68).
//
// Why a scallop: a fan of ribs reads as "a grand building" from the air, and the two halves of a real shell
// split naturally into a BASE (floor + low wall) and a ROOF (the domed upper valve, hinged at the back).
//
//   * The base: a fan-shaped floor and a low, scalloped wall of shell. The wall has two openings:
//     the ENTRANCE (front, 8 wide) and an AIRSIDE EXIT (right side, 5 wide) that leads out to the gates.
//   * The roof: ribbed dome with a rosy underside and two little "ears" at the hinge. It is separate, so it is
//     in `roofs` (hide it for the 2.5D cutaway and you can see inside).
//   * Windows: dewdrops stuck into the wall (clear, shiny, instanced).
//   * Inside: a pale floor, a petal-red carpet runner, a smooth PEBBLE check-in counter with a tray of gold
//     seeds (the cash), and little seed posts with a grass-blade rope for the queue.
//   * Outside: a bark DEPARTURES sign on twig legs beside the entrance.
//
// Size: ~38 wide (X) × 22 deep (Z), 5 high at the wall, 12 at the roof peak. Shell is centred on the origin,
// the open mouth faces +Z (toward the apron), the hinge is at the back (-Z).
// Triangles: ~11,000. Meshes: ~14 (wall, floor, roof, ears, windows, carpet, counter, props, sign...).
// Spots: 'door' (outside the entrance), 'queue' (end of the line), 'counter' (where you stand to check in),
//        'cash' (the gold seeds), 'exit' (outside the airside opening, toward the gates).
// ============================================================================
import * as THREE from 'three';
import { PAL, mat } from '../kit';
import { Batch, Footprint, Piece, blockersAlong, box, capsuleGeometry, gridSurface, stripBetween, v3 } from './common';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makeSign } from './sign';

// ---- the shape of the scallop (all numbers in game units) ----
const R = 22; // hinge -> front edge
const R0 = 3.5; // the rounded back (hinge end)
const TH = Math.PI / 3; // half the fan angle (60°) -> 41 wide at the very front
const HZ = -11; // z of the hinge point, so the whole shell is centred
const WALL_H = 5; // wall height = entrance height
const LOBES = 9; // ribs
const PERIOD = (2 * TH) / LOBES;
const WALL_T = 1.1; // wall thickness
const DOOR_HALF = 4.2; // entrance half-width
const EXIT_R0 = 9;
const EXIT_R1 = 14; // the airside opening spans these radii along the right wall

/** 0 at a rib valley, 1 at a rib crest. */
const bump = (th: number) => Math.sqrt(Math.abs(Math.sin((Math.PI * (th + TH)) / PERIOD)));
/** The scalloped front-edge radius at angle th. */
const rimR = (th: number, extra = 0) => R + extra - 1.2 * (1 - bump(th));
const px = (r: number, th: number) => r * Math.sin(th);
const pz = (r: number, th: number) => HZ + r * Math.cos(th);

// ---- materials (module-level: shared by every terminal) ----
const shellMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.05, side: THREE.DoubleSide });
const wallMat = mat(0xf1e0c8, { rough: 0.45 });
const earMat = mat(0xf2cdbd, { rough: 0.4 });
const floorMat = mat(0xf4e4d2, { rough: 0.6 });
const carpetMat = mat(0xd9566a, { rough: 0.9 });
const pebbleMat = mat(0xa9a59c, { rough: 0.35 });
const goldMat = mat(0xffc93c, { rough: 0.25, metal: 0.4, emissive: 0x4a3200 });
const postMat = mat(0x7a4f2b, { rough: 0.8 });
const ropeMat = mat(0xe23b2e, { rough: 0.7 });
const glassMat = mat(0xcfeeff, { rough: 0.05, opacity: 0.62 });

interface P2 {
  x: number;
  z: number;
  gap: boolean;
}
/** The outline of the shell, walked once around: front arc -> right side -> back -> left side. */
function perimeter(): P2[] {
  const out: P2[] = [];
  const gapTh = Math.asin(DOOR_HALF / R);
  const nArc = LOBES * 8;
  for (let i = 0; i <= nArc; i++) {
    const th = -TH + (2 * TH * i) / nArc;
    const r = rimR(th);
    out.push({ x: px(r, th), z: pz(r, th), gap: Math.abs(th) < gapTh });
  }
  // right side, front to back (th = +TH), with the airside exit
  const rEnd = rimR(TH);
  for (let r = rEnd - 1.2; r > R0; r -= 1.2) out.push({ x: px(r, TH), z: pz(r, TH), gap: r > EXIT_R0 && r < EXIT_R1 });
  // back arc, right to left
  for (let i = 0; i <= 16; i++) {
    const th = TH - (2 * TH * i) / 16;
    out.push({ x: px(R0, th), z: pz(R0, th), gap: false });
  }
  // left side, back to front
  for (let r = R0 + 1.2; r < rimR(-TH) - 0.6; r += 1.2) out.push({ x: px(r, -TH), z: pz(r, -TH), gap: false });
  return out;
}

/** Split the outline into the stretches between openings. */
function runsOf(pp: P2[]): THREE.Vector2[][] {
  const n = pp.length;
  let s = 0;
  while (!(pp[s].gap && !pp[(s + 1) % n].gap)) s++;
  const runs: THREE.Vector2[][] = [];
  let cur: THREE.Vector2[] = [];
  for (let k = 1; k <= n; k++) {
    const p = pp[(s + k) % n];
    if (p.gap) {
      if (cur.length > 1) runs.push(cur);
      cur = [];
    } else cur.push(new THREE.Vector2(p.x, p.z));
  }
  if (cur.length > 1) runs.push(cur);
  return runs;
}

/** Push a polyline sideways by `d` (positive = toward the inside of the fan). */
function inset(pts: THREE.Vector2[], d: number, inwardSign: number) {
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)];
    const c = pts[Math.min(pts.length - 1, i + 1)];
    const t = c.clone().sub(a).normalize();
    // left normal in (x,z) is (-tz, tx)
    return new THREE.Vector2(p.x + -t.y * inwardSign * d, p.y + t.x * inwardSign * d);
  });
}

/** Flat shape (x, -z) -> a solid of height `h`, standing on y = 0. */
function extrudeOutline(pts: THREE.Vector2[], h: number) {
  const s = new THREE.Shape(pts.map((p) => new THREE.Vector2(p.x, -p.y)));
  const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false, curveSegments: 1 });
  g.rotateX(-Math.PI / 2);
  return g;
}

/** The domed roof valve, with its ribs, as a thin closed shell with a rosy underside. */
function roofGeometry() {
  const NU = 10;
  const NV = LOBES * 8;
  const th = (v: number) => -TH + 2 * TH * v;
  const outerFn = (u: number, v: number): [number, number, number] => {
    const t = th(v);
    const r = R0 + u * (rimR(t, 0.9) - R0);
    const y = WALL_H + 6.8 * Math.pow(1 - Math.pow(u, 2.2), 0.7) + 0.55 * bump(t) * Math.pow(u, 0.8);
    return [px(r, t), y, pz(r, t)];
  };
  const innerFn = (u: number, v: number): [number, number, number] => {
    const t = th(v);
    const r = R0 + u * (rimR(t, 0) - R0);
    const y = WALL_H - 0.7 + 6.1 * Math.pow(1 - Math.pow(u, 2.2), 0.7) + 0.4 * bump(t) * Math.pow(u, 0.8);
    return [px(r, t), y, pz(r, t)];
  };
  const cream = new THREE.Color(0xf7e8d2);
  const pink = new THREE.Color(0xf0a89c);
  const tmp = new THREE.Color();
  const outerCol = (u: number, v: number) => {
    const b = bump(th(v));
    const k = Math.min(1, Math.pow(1 - b, 1.6) * 0.95 + (1 - u) * 0.35);
    return tmp.copy(cream).lerp(pink, k).getHex();
  };
  const outer = gridSurface(NU, NV, outerFn, { color: outerCol });
  const inner = gridSurface(NU, NV, innerFn, { flip: true, color: () => 0xf6c9c0 });
  const edges = (fn: (i: number) => [[number, number, number], [number, number, number]], n: number) => {
    const a: THREE.Vector3[] = [];
    const b: THREE.Vector3[] = [];
    for (let i = 0; i <= n; i++) {
      const [p, q] = fn(i);
      a.push(new THREE.Vector3(...p));
      b.push(new THREE.Vector3(...q));
    }
    return stripBetween(a, b, 0xf3dcc6);
  };
  const rim = edges((i) => [outerFn(1, i / NV), innerFn(1, i / NV)], NV);
  const back = edges((i) => [outerFn(0, i / NV), innerFn(0, i / NV)], NV);
  const sideL = edges((i) => [outerFn(i / NU, 0), innerFn(i / NU, 0)], NU);
  const sideR = edges((i) => [outerFn(i / NU, 1), innerFn(i / NU, 1)], NU);
  return mergeGeometries([outer, inner, rim, back, sideL, sideR])!;
}

export function makeTerminal(): Piece {
  const root = new THREE.Group();
  const roofs: THREE.Object3D[] = [];

  // ---- the walls ----
  const pp = perimeter();
  const runs = runsOf(pp);
  // which way is "inside"? (sign of the polygon's area in the x/z plane)
  let area = 0;
  for (let i = 0; i < pp.length; i++) {
    const a = pp[i];
    const b = pp[(i + 1) % pp.length];
    area += a.x * b.z - b.x * a.z;
  }
  const inwardSign = area > 0 ? 1 : -1;
  const wallB = new Batch();
  const blockers: Footprint[] = [];
  for (const run of runs) {
    const inner = inset(run, WALL_T, inwardSign);
    wallB.add(extrudeOutline([...run, ...inner.slice().reverse()], WALL_H), wallMat);
    blockers.push(...blockersAlong(run.map((p) => ({ x: p.x, z: p.y })), 0.6, 3));
  }
  const walls = wallB.build();
  root.add(walls);

  // ---- the floor ----
  const outline = pp.map((p) => new THREE.Vector2(p.x, p.z));
  const floor = new THREE.Mesh(extrudeOutline(outline, 0.5), floorMat);
  floor.receiveShadow = true;
  root.add(floor);

  // ---- the roof (separate, in `roofs`) ----
  const roofGroup = new THREE.Group();
  const roofMesh = new THREE.Mesh(roofGeometry(), shellMat);
  roofMesh.castShadow = true;
  roofMesh.receiveShadow = true;
  roofGroup.add(roofMesh);
  // the two ears at the hinge: flattened lumps tipped outward
  const ears = new Batch();
  for (const s of [-1, 1]) {
    ears.at(new THREE.SphereGeometry(1, 12, 8), earMat, s * 5.4, WALL_H + 5.0, HZ + 2.2, { sx: 3.6, sy: 1.0, sz: 2.4, rz: -s * 0.32, ry: s * 0.2 });
  }
  const earMesh = ears.build();
  roofGroup.add(earMesh);
  root.add(roofGroup);
  roofs.push(roofGroup);

  // ---- dewdrop windows stuck into the wall ----
  const wins: THREE.Matrix4[] = [];
  const winGeo = new THREE.SphereGeometry(1, 10, 7);
  const addWin = (x: number, z: number, facing: number) => {
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, 2.9, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, facing, 0)),
      new THREE.Vector3(1.0, 1.15, 0.5),
    );
    wins.push(m);
  };
  for (let k = 0; k < LOBES; k++) {
    const t = -TH + (k + 0.5) * PERIOD;
    if (Math.abs(t) < 0.3) continue;
    addWin(px(R - 0.15, t), pz(R - 0.15, t), t);
  }
  for (const r of [6.5, 17]) {
    addWin(px(r, TH) + 0.0, pz(r, TH), TH + Math.PI / 2);
    addWin(px(r, -TH), pz(r, -TH), -TH - Math.PI / 2);
  }
  addWin(0, pz(R0, 0) - 0.3, Math.PI); // one at the back
  const windows = new THREE.InstancedMesh(winGeo, glassMat, wins.length);
  wins.forEach((m, i) => windows.setMatrixAt(i, m));
  windows.castShadow = false;
  windows.receiveShadow = false;
  root.add(windows);

  // ---- inside: carpet, counter, cash, queue posts ----
  const inside = new Batch();
  inside.at(new THREE.BoxGeometry(3.2, 0.08, 14.5), carpetMat, 0, 0.54, 5.2);
  const counterZ = -3;
  inside.at(new THREE.SphereGeometry(1, 20, 12), pebbleMat, 0, 1.45, counterZ, { sx: 5.4, sy: 1.15, sz: 1.7 });
  // gold seeds in a little dish at the end of the counter = the cash
  const cashX = 5.8;
  inside.at(new THREE.SphereGeometry(1, 12, 8), pebbleMat, cashX, 0.9, counterZ, { sx: 1.4, sy: 0.55, sz: 1.2 });
  for (const [dx, dz, dy] of [[-0.35, -0.2, 1.6], [0.3, -0.1, 1.65], [0, 0.35, 1.55], [0.1, -0.35, 1.9]]) {
    inside.at(new THREE.SphereGeometry(0.42, 8, 6), goldMat, cashX + dx, dy, counterZ + dz, { sy: 0.75 });
  }
  // queue: four seed posts and two blade ropes
  const postGeo = capsuleGeometry(2.4, 0.25);
  for (const x of [-1.9, 1.9]) {
    for (const z of [2.0, 8.0]) inside.at(postGeo, postMat, x, 1.7, z);
    inside.at(new THREE.BoxGeometry(0.14, 0.14, 6), ropeMat, x, 2.55, 5.0);
  }
  root.add(inside.build());

  // ---- the departures sign, outside next to the entrance ----
  const sign = makeSign('DEPARTURES', { width: 11, height: 4.2, arrow: 'right' });
  sign.root.position.set(-12.5, 0, R + HZ + 3.6);
  sign.root.rotation.y = 0.15;
  root.add(sign.root);
  blockers.push(box(-12.5 - 3.5, R + HZ + 3.6, 1, 1), box(-12.5 + 3.5, R + HZ + 3.6, 1, 1));

  blockers.push(box(0, counterZ, 11, 3.4));

  const exitR = (EXIT_R0 + EXIT_R1) / 2;
  return {
    root,
    blockers,
    roofs,
    spots: {
      door: v3(0, 0.5, R + HZ + 2.5),
      queue: v3(0, 0.5, 9.0),
      counter: v3(0, 0.5, counterZ + 2.4),
      cash: v3(cashX, 1.8, counterZ),
      exit: v3(px(exitR, TH) + 2.6, 0.5, pz(exitR, TH)),
    },
  };
}
