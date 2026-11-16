// ============================================================================
// backdrop.ts — 🏞️ the far-away giants that frame the horizon (v0.68).
//
// When the camera is low (an ant's-eye view) you look past the lawn to the edge of the world. This builds
// a ring of big, simple, low-poly silhouettes out there so the horizon isn't empty:
//   * a wide soft green "far lawn" disc + gentle hills (like the app icon's green hill)
//   * a ring of giant grass tufts (cheap cones, instanced)
//   * giant clover, a garden-hose loop, fence posts with a rail, and a flower pot with a palm trunk
//
// All of it is cheap on purpose: few triangles, NO shadows, plain colours, and it works with fog
// (standard materials, so the scene fog tints the far parts toward the sky colour).
// Put the group at 0,0 and give `radius` a bit bigger than your lawn (e.g. 450). Everything sits INSIDE it.
// ============================================================================
import * as THREE from 'three';
import { PAL, rng } from '../kit';
import { cloverGeos, floraMaterials } from './props';
import { colorize, merge, paint, tube, vcMat, xf, clamp01 } from './shared';

const TAU = Math.PI * 2;

export function buildBackdrop(radius: number, seed = 5): THREE.Group {
  const R = rng(seed * 3571 + 17);
  const root = new THREE.Group();
  root.name = 'backdrop';
  const flat = vcMat({ rough: 0.9, side: THREE.DoubleSide });
  const add = (g: THREE.BufferGeometry, m: THREE.Material = flat) => {
    const mesh = new THREE.Mesh(g, m);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    root.add(mesh);
    return mesh;
  };
  const at = (a: number, r: number) => new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);

  // ----- 1. far lawn + rolling hills -----
  const lawn = new THREE.RingGeometry(radius * 0.25, radius * 2.4, 48, 1);
  lawn.rotateX(-Math.PI / 2);
  lawn.translate(0, -0.6, 0);
  add(paint(lawn, 0x4c9a38));
  const hills: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU + R.next() * 0.3;
    const r = radius * (0.95 + R.next() * 0.35);
    const s = radius * (0.22 + R.next() * 0.16);
    const p = at(a, r);
    const hill = new THREE.SphereGeometry(1, 14, 8, 0, TAU, 0, Math.PI / 2);
    xf(hill, [p.x, -0.5, p.z], [0, 0, 0], [s * 1.6, s * (0.22 + R.next() * 0.12), s * 1.6]);
    hills.push(colorize(hill, (_x, y) => new THREE.Color(0x4c9a38).lerp(new THREE.Color(0x76c25a), clamp01(y / (s * 0.3)))));
  }
  add(merge(hills));

  // ----- 2. a ring of giant grass tufts (instanced cones) -----
  const tuft = new THREE.ConeGeometry(1, 1, 5, 1);
  tuft.translate(0, 0.5, 0);
  const tufts = new THREE.InstancedMesh(tuft, new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }), 520);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sv = new THREE.Vector3(), c = new THREE.Color();
  for (let i = 0; i < 520; i++) {
    const a = R.next() * TAU, r = radius * (0.5 + R.next() * 0.55);
    const hgt = 70 + R.next() * 90, w = 8 + R.next() * 8;
    e.set((R.next() - 0.5) * 0.3, R.next() * TAU, (R.next() - 0.5) * 0.3);
    q.setFromEuler(e);
    m4.compose(at(a, r), q, sv.set(w, hgt, w));
    tufts.setMatrixAt(i, m4);
    tufts.setColorAt(i, c.setHex(PAL.lawnDark).lerp(new THREE.Color(PAL.lawnLight), R.next() * 0.8));
  }
  tufts.instanceMatrix.needsUpdate = true;
  root.add(tufts);

  // ----- 3. giant clover -----
  const cv = cloverGeos(77);
  for (let i = 0; i < 6; i++) {
    const a = R.next() * TAU, r = radius * (0.62 + R.next() * 0.3), s = 3.2 + R.next() * 2.2;
    const p = at(a, r);
    const g = new THREE.Group();
    g.position.copy(p);
    g.rotation.y = R.next() * TAU;
    g.scale.setScalar(s);
    const st = new THREE.Mesh(cv.stem, vcMat());
    const lv = new THREE.Mesh(cv.leaves, floraMaterials.clover());
    g.add(st, lv);
    root.add(g);
  }

  // ----- 4. garden hose: a fat orange-green loop lying in the grass -----
  const hoseR = radius * 0.2, hoseT = 11;
  const hose = new THREE.TorusGeometry(hoseR, hoseT, 8, 40, TAU * 0.82);
  hose.rotateX(-Math.PI / 2);
  hose.translate(0, hoseT * 0.55, 0);
  const hp = at(R.next() * TAU, radius * 0.78);
  hose.rotateY(R.next() * TAU);
  hose.translate(hp.x, 0, hp.z);
  add(paint(hose, 0x2f9a58, 0.04));
  // brass connector at one end
  const brass = paint(xf(new THREE.CylinderGeometry(hoseT * 1.15, hoseT * 1.15, 30, 10), [hp.x + hoseR, hoseT * 0.55, hp.z], [Math.PI / 2, 0, 0]), 0xd9a63a);
  add(brass, vcMat({ rough: 0.35 }));

  // ----- 5. fence posts + a rail -----
  const fa = R.next() * TAU;
  const posts: THREE.BufferGeometry[] = [];
  const nPost = 4;
  const span = 0.16;
  for (let i = 0; i < nPost; i++) {
    const a = fa + (i - (nPost - 1) / 2) * span;
    const p = at(a, radius * 0.92);
    const h = 330 + R.next() * 40;
    const post = new THREE.BoxGeometry(46, h, 46);
    post.translate(0, h / 2, 0);
    // slanted weathered top
    const pp = post.getAttribute('position');
    for (let k = 0; k < pp.count; k++) if (pp.getY(k) > h - 1) pp.setY(k, h - 1 - (pp.getX(k) + 23) * 0.25);
    post.computeVertexNormals();
    xf(post, [p.x, 0, p.z], [0, a + Math.PI / 2 + (R.next() - 0.5) * 0.05, 0]);
    posts.push(colorize(post, (x, y, z) => new THREE.Color(0x9a7a56).lerp(new THREE.Color(0x6e5436), clamp01((Math.sin(y * 0.09 + x * 0.05) + 1) * 0.3 + 0.08 * Math.sin(z)))));
  }
  add(merge(posts), vcMat({ rough: 0.95 }));
  // the rail between posts: a long thin box from first to last
  const pa = at(fa - ((nPost - 1) / 2) * span, radius * 0.92), pb = at(fa + ((nPost - 1) / 2) * span, radius * 0.92);
  const len = pa.distanceTo(pb);
  const rail = new THREE.BoxGeometry(len, 30, 14);
  rail.rotateY(-Math.atan2(pb.z - pa.z, pb.x - pa.x));
  rail.translate((pa.x + pb.x) / 2, 230, (pa.z + pb.z) / 2);
  add(paint(rail, 0x8a6a46));
  const rail2 = rail.clone();
  rail2.translate(0, -110, 0);
  add(rail2.getAttribute('color') ? rail2 : paint(rail2, 0x8a6a46));

  // ----- 6. flower pot + palm trunk -----
  const pa2 = R.next() * TAU;
  const pp2 = at(pa2, radius * 0.85);
  const prof = [[44, 0], [47, 4], [58, 100], [66, 108], [66, 124], [60, 128], [54, 124], [54, 112]].map(([r, y]) => new THREE.Vector2(r, y));
  const pot = new THREE.LatheGeometry(prof, 18);
  xf(pot, [pp2.x, 0, pp2.z]);
  add(colorize(pot, (_x, y) => new THREE.Color(0xc2602e).lerp(new THREE.Color(0xe08848), clamp01((y - 90) / 40) * 0.5)), vcMat({ rough: 0.8, side: THREE.DoubleSide }));
  const soil = paint(xf(new THREE.CylinderGeometry(55, 55, 4, 14), [pp2.x, 115, pp2.z]), 0x4a3320);
  add(soil);
  // palm trunk with rings + a crown of drooping fronds
  const trunkPts = [0, 1, 2, 3, 4].map((i) => new THREE.Vector3(pp2.x + i * 4 + Math.sin(i) * 3, 120 + i * 95, pp2.z + i * 2));
  const trunk = tube(trunkPts, (t) => 24 - t * 7 + Math.sin(t * 60) * 2, 8);
  add(colorize(trunk, (_x, y) => new THREE.Color(0x8a6a48).lerp(new THREE.Color(0xa8845a), 0.5 + 0.5 * Math.sin(y * 0.35))), vcMat({ rough: 0.95 }));
  const crown = trunkPts[4].clone().add(new THREE.Vector3(0, 10, 0));
  const fronds: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU;
    const L = 190 + R.next() * 40;
    const fr = new THREE.BufferGeometry();
    // a long drooping leaf: spine arcs up then down, a V cross-section
    const segs = 6;
    const pos: number[] = [], idx: number[] = [];
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      const w = 26 * Math.sin(Math.PI * Math.min(1, t * 1.05)) + 1;
      const x = t * L, y = Math.sin(t * 2.2) * L * 0.2 - t * t * L * 0.35;
      pos.push(x, y + 5, -w, x, y, 0, x, y + 5, w);
      if (s > 0) {
        const aa = (s - 1) * 3, bb = s * 3;
        idx.push(aa, aa + 1, bb, aa + 1, bb + 1, bb, aa + 1, aa + 2, bb + 1, aa + 2, bb + 2, bb + 1);
      }
    }
    fr.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    fr.setIndex(idx);
    fr.computeVertexNormals();
    xf(fr, [0, 0, 0], [0, -a, 0]);
    xf(fr, [crown.x, crown.y, crown.z]);
    fronds.push(colorize(fr, (x, y, z) => new THREE.Color(0x2f7a38).lerp(new THREE.Color(0x58b04a), clamp01((Math.hypot(x - crown.x, z - crown.z)) / 220))));
  }
  add(merge(fronds), vcMat({ rough: 0.8, side: THREE.DoubleSide }));

  return root;
}
