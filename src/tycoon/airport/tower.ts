// ============================================================================
// tower.ts — 🗼 the control tower: a tall flower STEM with a seed-pod cab on top (v0.68).
//
//   * The stem: a green tapered stalk with little "knuckles", a twig ladder up the front, three twig braces and
//     a flat stone for a base, plus two leaves sprouting from the stalk.
//   * The cab: a poppy-style seed pod. Bottom half = pod, middle = a band of blue glass windows with thin
//     mullions, top half = the roof (in `roofs`) with a ridged crown and a tiny BEACON: a bright bead on an arm
//     that turns slowly (update(dt)). Inside the cab: a floor, a desk and a glowing screen.
//
// Size: ~42 tall (84 mm): stem 33 + cab ~9. Base 10 across. Cab 8.4 across.
// Triangles: ~3,900. Meshes: 11.
// Spots: 'door' (at the foot of the ladder), 'cab' (the floor of the cab, up top), 'top' (the beacon).
// ============================================================================
import * as THREE from 'three';
import { PAL, mat } from '../kit';
import { Batch, Piece, between, box, capsuleGeometry, leafGeometry, v3 } from './common';

const STEM_H = 33;
const CAB_Y = 36.2; // cab centre height
const CAB_R = 4.2;
const CAB_SQUASH = 0.9;

const stemMat = mat(0x5aa33c, { rough: 0.6 });
const knuckleMat = mat(0x4a8c30, { rough: 0.6 });
const leafMat = mat(0x6cbb45, { rough: 0.55 });
const twigMat = mat(0x8a5a33, { rough: 0.9 });
const stoneMat = mat(0x9a958c, { rough: 0.7 });
const podMat = mat(0x9cc77a, { rough: 0.45 });
const roofMat = mat(0xb4d68a, { rough: 0.4 });
const glassMat = mat(0x7fc8f2, { rough: 0.08, opacity: 0.45, metal: 0.1 });
const mullionMat = mat(0x3f6e2c, { rough: 0.6 });
const floorMat = mat(0xd9c49a, { rough: 0.9 });
const deskMat = mat(0x8a5a33, { rough: 0.8 });
const screenMat = mat(0xaaf0ff, { rough: 0.3, emissive: 0x39b6e0 });
const beaconMat = new THREE.MeshBasicMaterial({ color: 0xfff08a });
const beaconRedMat = new THREE.MeshBasicMaterial({ color: 0xff5a3c });

export function makeControlTower(): Piece {
  const root = new THREE.Group();

  // ---- the stem, ladder, braces, base stone, leaves ----
  const b = new Batch();
  b.add(new THREE.CylinderGeometry(0.95, 1.55, STEM_H, 10).translate(0, STEM_H / 2, 0), stemMat);
  for (const y of [8, 17, 26]) b.add(new THREE.CylinderGeometry(1.2, 1.2, 0.55, 10).translate(0, y, 0), knuckleMat);
  b.add(new THREE.SphereGeometry(1, 16, 8).scale(5.4, 0.7, 5.4), stoneMat, xfY(0.25));
  // twig ladder on the front (+Z): two rails and rungs
  const rail = capsuleGeometry(30, 0.2, 5);
  b.at(rail, twigMat, -0.65, 15.2, 1.65, { rx: 0.02 });
  b.at(rail, twigMat, 0.65, 15.2, 1.65, { rx: 0.02 });
  const rung = capsuleGeometry(1.5, 0.12, 4);
  for (let y = 1.2; y < 29.5; y += 1.7) b.at(rung, twigMat, 0, y, 1.62, { rz: Math.PI / 2 });
  // three twig braces holding the stalk up
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI * 2) / 3 + 0.5;
    const top = new THREE.Vector3(Math.sin(a) * 1.1, 9.5, Math.cos(a) * 1.1);
    const foot = new THREE.Vector3(Math.sin(a) * 4.6, 0.3, Math.cos(a) * 4.6);
    const { m } = between(foot, top, 0.42);
    b.add(new THREE.CylinderGeometry(1, 1, 1, 6), twigMat, m);
  }
  // two leaves sprouting from the stalk
  b.at(leafGeometry(9, 3.4, 0.4, 0.5), leafMat, 3.2, 11.5, -0.3, { ry: Math.PI / 2, rx: -0.5 });
  b.at(leafGeometry(8, 3.0, 0.4, 0.5), leafMat, -2.8, 21, 0.4, { ry: -Math.PI / 2 - 0.3, rx: -0.55 });
  root.add(b.build());

  // ---- the cab ----
  const cab = new Batch();
  // lower pod: bottom of a sphere
  cab.add(new THREE.SphereGeometry(CAB_R, 24, 8, 0, Math.PI * 2, Math.PI * 0.62, Math.PI * 0.38), podMat, xfScaleY(CAB_Y, CAB_SQUASH));
  // glass band (slightly bigger so it stands proud of the pod)
  cab.add(new THREE.SphereGeometry(CAB_R + 0.06, 24, 4, 0, Math.PI * 2, Math.PI * 0.4, Math.PI * 0.22), glassMat, xfScaleY(CAB_Y, CAB_SQUASH));
  // mullions between windows
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    cab.at(new THREE.BoxGeometry(0.22, 2.1, 0.22), mullionMat, Math.sin(a) * (CAB_R * 0.96), CAB_Y, Math.cos(a) * (CAB_R * 0.96), { ry: a });
  }
  // floor, desk and glowing screen inside
  cab.at(new THREE.CylinderGeometry(CAB_R * 0.8, CAB_R * 0.8, 0.3, 20), floorMat, 0, CAB_Y - 1.7, 0);
  cab.at(new THREE.BoxGeometry(3.2, 0.3, 1.2), deskMat, 0, CAB_Y - 0.9, -1.9);
  cab.at(new THREE.BoxGeometry(0.25, 0.9, 0.25), deskMat, -1.4, CAB_Y - 1.35, -1.9);
  cab.at(new THREE.BoxGeometry(0.25, 0.9, 0.25), deskMat, 1.4, CAB_Y - 1.35, -1.9);
  cab.at(new THREE.BoxGeometry(2.0, 1.1, 0.12), screenMat, 0, CAB_Y - 0.1, -2.35, { rx: -0.2 });
  root.add(cab.build());

  // ---- the roof: top of the pod, ridged crown, beacon on its pole ----
  const roof = new THREE.Group();
  const rb = new Batch();
  rb.add(new THREE.SphereGeometry(CAB_R + 0.12, 24, 8, 0, Math.PI * 2, 0, Math.PI * 0.4), roofMat, xfScaleY(CAB_Y, CAB_SQUASH));
  const crownY = CAB_Y + CAB_R * CAB_SQUASH * Math.cos(0.0) - 0.2;
  rb.at(new THREE.CylinderGeometry(2.2, 2.5, 0.55, 16), roofMat, 0, crownY + 0.1, 0);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    rb.at(new THREE.BoxGeometry(0.28, 0.3, 2.4), knuckleMat, Math.sin(a) * 1.3, crownY + 0.45, Math.cos(a) * 1.3, { ry: a });
  }
  rb.at(new THREE.CylinderGeometry(0.12, 0.15, 3.2, 6), twigMat, 0, crownY + 2.0, 0);
  roof.add(rb.build());
  const arm = new THREE.Group();
  arm.position.set(0, crownY + 3.4, 0);
  const lamp1 = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), beaconMat);
  lamp1.position.x = 1.15;
  const lamp2 = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), beaconRedMat);
  lamp2.position.x = -1.15;
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.3, 5).rotateZ(Math.PI / 2), twigMat);
  arm.add(bar, lamp1, lamp2);
  roof.add(arm);
  root.add(roof);

  return {
    root,
    blockers: [box(0, 0, 3.6, 3.6)],
    roofs: [roof],
    spots: { door: v3(0, 0, 3.2), cab: v3(0, CAB_Y - 1.5, 0), top: v3(0, crownY + 3.4, 0) },
    update(dt) {
      arm.rotation.y += dt * 1.5;
    },
  };
}

function xfY(y: number) {
  return new THREE.Matrix4().makeTranslation(0, y, 0);
}
function xfScaleY(y: number, sy: number) {
  return new THREE.Matrix4().makeTranslation(0, y, 0).multiply(new THREE.Matrix4().makeScale(1, sy, 1));
}
