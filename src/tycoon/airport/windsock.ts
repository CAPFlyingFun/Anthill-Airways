// ============================================================================
// windsock.ts — 🌬️ the windsock: a DANDELION SEED on a thin stem (v0.68).
//
// A dandelion seed has a tiny brown seed and a fluffy white parachute. Stuck on the top of a thin stem it
// works as a windsock: the fluff streams out downwind like a sock. In update(dt) the wind slowly changes
// direction and gusts, and the fluff swings round and lifts or droops with it.
//
// Size: ~15 tall (30 mm), fluff ~5 long × 5 across. Triangles: ~1,600. Meshes: 7.
// Spots: 'top' (the seed head).
// ============================================================================
import * as THREE from 'three';
import { mat, rng } from '../kit';
import { Piece, box, v3 } from './common';

const STEM_H = 13;
const FIBRE = 4.6;
const stemMat = mat(0x7bb04a, { rough: 0.6 });
const moundMat = mat(0x9a7a50, { rough: 0.95 });
const seedMat = mat(0x7a5434, { rough: 0.7 });
const fibreMat = mat(0xffffff, { rough: 0.6 });
const sockMat = mat(0xffffff, { rough: 0.5, opacity: 0.14, side: THREE.DoubleSide });

export function makeWindsock(): Piece {
  const root = new THREE.Group();
  const r = rng(5);

  // a little mound of dirt and the stem
  const mound = new THREE.Mesh(new THREE.SphereGeometry(2.4, 14, 8).scale(1, 0.4, 1), moundMat);
  mound.receiveShadow = true;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.3, STEM_H, 7).translate(0, STEM_H / 2, 0), stemMat);
  stem.castShadow = true;
  root.add(mound, stem);

  // the head swings in two steps: swing (yaw: which way the wind blows) -> tilt (droop / lift)
  const swing = new THREE.Group();
  swing.position.y = STEM_H;
  const tilt = new THREE.Group();
  swing.add(tilt);
  root.add(swing);

  // the seed (tiny brown capsule pointing back up the stem) at the base of the fluff
  const seed = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.9, 3, 6), seedMat);
  seed.rotation.z = Math.PI / 2 + 0.4;
  seed.position.set(-0.5, -0.3, 0);
  seed.castShadow = true;
  tilt.add(seed);

  // fluff: 46 thin fibres fanning out downwind (+X) inside a cone, each ending in a tiny puff
  const dirs: THREE.Vector3[] = [];
  const N = 46;
  for (let i = 0; i < N; i++) {
    const psi = r.range(0, Math.PI * 2);
    const alpha = r.range(0.1, 0.62);
    dirs.push(new THREE.Vector3(Math.cos(alpha), Math.sin(alpha) * Math.cos(psi), Math.sin(alpha) * Math.sin(psi)));
  }
  const up = new THREE.Vector3(0, 1, 0);
  const m = new THREE.Matrix4();
  const fibreGeo = new THREE.CylinderGeometry(0.045, 0.03, 1, 4);
  const puffGeo = new THREE.SphereGeometry(0.2, 6, 4);
  const fibreMesh = new THREE.InstancedMesh(fibreGeo, fibreMat, N);
  const puffMesh = new THREE.InstancedMesh(puffGeo, fibreMat, N);
  dirs.forEach((d, i) => {
    const len = FIBRE * r.range(0.75, 1.0);
    const q = new THREE.Quaternion().setFromUnitVectors(up, d);
    m.compose(d.clone().multiplyScalar(len / 2), q, new THREE.Vector3(1, len, 1));
    fibreMesh.setMatrixAt(i, m);
    m.compose(d.clone().multiplyScalar(len), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
    puffMesh.setMatrixAt(i, m);
  });
  fibreMesh.frustumCulled = false;
  puffMesh.frustumCulled = false;
  tilt.add(fibreMesh, puffMesh);

  // a faint translucent cone that gives the fluff its "sock" outline
  const cone = new THREE.Mesh(new THREE.ConeGeometry(2.2, FIBRE * 0.95, 14, 1, true).translate(0, -FIBRE * 0.475, 0).rotateZ(Math.PI / 2), sockMat);
  tilt.add(cone);

  let t = r.range(0, 10);
  swing.rotation.y = 0.6;
  return {
    root,
    blockers: [box(0, 0, 1.2, 1.2)],
    roofs: [],
    spots: { top: v3(0, STEM_H, 0) },
    update(dt: number) {
      t += dt;
      // the wind slowly wanders round, gusting now and then
      const dir = 0.7 + 0.9 * Math.sin(t * 0.23) + 0.25 * Math.sin(t * 0.71);
      const gust = 0.5 + 0.5 * Math.sin(t * 0.9) * Math.sin(t * 0.37 + 1);
      swing.rotation.y += (dir - swing.rotation.y) * Math.min(1, dt * 1.4);
      const droop = -0.12 - 0.5 * (1 - gust);
      tilt.rotation.z += (droop - tilt.rotation.z) * Math.min(1, dt * 2.2);
      tilt.rotation.x = Math.sin(t * 5.1) * 0.05 * gust;
      cone.scale.set(1 + 0.04 * Math.sin(t * 7.3), 1 + 0.06 * Math.sin(t * 6.1) * gust, 1);
    },
  };
}
