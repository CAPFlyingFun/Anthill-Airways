// ============================================================================
// gate.ts — 🚪 a boarding gate: gate post, a grass-stem JET BRIDGE and a parking stand (v0.68).
//
// Layout (local space; the plane parks at the origin, nose toward +Z):
//   * STAND: a flat green leaf, 9 wide × 11 long, with a white painted STOP LINE across the nose end and a
//     yellow dashed centerline (petals / seeds standing in for paint).
//   * JET BRIDGE: a deck of straw stems on twig legs reaching from the left of the stand (-X) to the plane's
//     side door. A green blade-arch covers it (the arch + the cab on its end are the ROOF, so you can hide it
//     and see the walkway), with twig rails along both sides. A little leaf ramp leads up to it from the ground.
//   * GATE POST: a twig post with a numbered bark plate, beside the ramp.
//
// Size: stand ~9 × 11; whole gate ~25 (X) × 11 (Z); bridge deck 1.1 above the ground, 2.4 wide, 9.6 long.
// Triangles: ~2,700. Meshes: ~11.
// Spots: 'gate' (where passengers wait, foot of the ramp), 'plane' (where the plane parks, facing +Z),
//        'door' (the end of the bridge at the plane's side door, up on the deck),
//        'rampFoot' and 'rampTop' (the two ends of the ramp: passengers walk foot → top → door).
// ============================================================================
import * as THREE from 'three';
import { mat } from '../kit';
import { Batch, Footprint, Piece, box, capsuleGeometry, leafGeometry, v3 } from './common';
import { signTexture } from './sign';

const STAND_W = 9;
const STAND_L = 11;
const DECK_Y = 1.1;
const DECK_X0 = -13; // far end of the deck (toward the ramp)
const DECK_X1 = -3.4; // plane end

const standMat = mat(0x3f7f35, { rough: 0.85 });
const lineWhite = mat(0xfff6ea, { rough: 0.6 });
const lineYellow = mat(0xffd24a, { rough: 0.6 });
const strawMat = mat(0xd8c27a, { rough: 0.8 });
const twigMat = mat(0x8a5a33, { rough: 0.9 });
const arch = new THREE.MeshStandardMaterial({ color: 0x78b84a, roughness: 0.55, side: THREE.DoubleSide });
const hoopMat = mat(0x4f8f33, { rough: 0.6 });
const bumperMat = mat(0x3a2a1c, { rough: 0.9 });
const rampMat = mat(0x6cbb45, { rough: 0.7 });

export interface GateOpts {
  /** the number on the gate post plate */
  number?: string;
}

export function makeGate(opts: GateOpts = {}): Piece {
  const root = new THREE.Group();
  const roofs: THREE.Object3D[] = [];
  const blockers: Footprint[] = [];

  // ---- stand + painted lines ----
  const st = new Batch();
  st.at(leafGeometry(STAND_L, STAND_W, 0.25, 0, [24, 12]), standMat, 0, 0.05, 0);
  const lines = new Batch();
  lines.at(new THREE.BoxGeometry(5.6, 0.08, 0.38), lineWhite, 0, 0.3, 3.9); // stop line: nose goes here
  for (let z = -3.8; z < 3; z += 1.7) lines.at(new THREE.BoxGeometry(0.28, 0.08, 1.0), lineYellow, 0, 0.3, z); // centerline dashes
  // wheel / "nose here" tick marks at the stop line ends
  for (const s of [-1, 1]) lines.at(new THREE.BoxGeometry(0.38, 0.08, 1.2), lineWhite, s * 2.8, 0.3, 3.3);
  root.add(st.build({ cast: false }), lines.build({ cast: false }));

  // ---- bridge: deck, rails, legs, ramp ----
  const deckLen = DECK_X1 - DECK_X0;
  const cx = (DECK_X0 + DECK_X1) / 2;
  const br = new Batch();
  // deck: five straw stems side by side
  const stemGeo = new THREE.CylinderGeometry(0.26, 0.26, deckLen, 6).rotateZ(Math.PI / 2);
  for (let i = -2; i <= 2; i++) br.at(stemGeo, strawMat, cx, DECK_Y, i * 0.5);
  // side rails (twig) and four legs
  const rail = capsuleGeometry(deckLen, 0.14, 4).clone().rotateZ(Math.PI / 2);
  for (const s of [-1, 1]) br.at(rail, twigMat, cx, DECK_Y + 0.95, s * 1.25);
  const leg = capsuleGeometry(DECK_Y + 0.6, 0.2, 4);
  for (const x of [DECK_X0 + 1, (DECK_X0 + DECK_X1) / 2, DECK_X1 - 0.6]) {
    for (const s of [-1, 1]) br.at(leg, twigMat, x, (DECK_Y + 0.6) / 2 - 0.2, s * 1.1, { rz: 0 });
  }
  // ramp: a leaf sloping from the ground up to the deck
  const rampLen = 3.4;
  const ramp = new THREE.Mesh(new THREE.BoxGeometry(rampLen, 0.22, 2.0), rampMat);
  ramp.position.set(DECK_X0 - rampLen / 2 + 0.2, DECK_Y / 2 + 0.05, 0);
  ramp.rotation.z = Math.atan2(DECK_Y - 0.1, rampLen);
  ramp.castShadow = true;
  ramp.receiveShadow = true;
  root.add(br.build(), ramp);

  // ---- roof: blade arch over the deck + hoops + the cab on the plane end ----
  const roof = new THREE.Group();
  const archGeo = new THREE.CylinderGeometry(1.35, 1.35, deckLen, 16, 1, true, 0, Math.PI).rotateZ(Math.PI / 2);
  const archMesh = new THREE.Mesh(archGeo, arch);
  archMesh.position.set(cx, DECK_Y + 0.05, 0);
  archMesh.castShadow = true;
  roof.add(archMesh);
  const hoops = new Batch();
  const hoopGeo = new THREE.TorusGeometry(1.4, 0.1, 5, 14, Math.PI).rotateY(Math.PI / 2);
  for (let i = 0; i <= 4; i++) hoops.at(hoopGeo, hoopMat, DECK_X0 + (deckLen * i) / 4, DECK_Y + 0.05, 0);
  // the cab at the plane end: a squat tube with a rubber bumper that touches the plane's door
  hoops.add(new THREE.CylinderGeometry(1.55, 1.55, 2.4, 14), hoopMat, new THREE.Matrix4().makeTranslation(DECK_X1 + 0.2, DECK_Y + 0.9, 0));
  hoops.add(new THREE.TorusGeometry(1.25, 0.28, 6, 14).rotateY(Math.PI / 2), bumperMat, new THREE.Matrix4().makeTranslation(DECK_X1 + 1.55, DECK_Y + 0.8, 0));
  roof.add(hoops.build());
  root.add(roof);
  roofs.push(roof);

  // ---- gate post with a numbered plate ----
  const postX = DECK_X0 - 1.2;
  const postZ = 2.6;
  const post = new Batch();
  post.at(capsuleGeometry(4.0, 0.3, 5), twigMat, postX, 1.8, postZ);
  root.add(post.build());
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 1.7),
    new THREE.MeshStandardMaterial({ map: signTexture(`GATE ${opts.number ?? '1'}`, 2.6, 1.7), roughness: 0.8 }),
  );
  plate.position.set(postX, 4.2, postZ + 0.22);
  plate.rotation.x = -0.25;
  const plateBack = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.9, 0.3), mat(0x5b3a20, { rough: 0.9 }));
  plateBack.position.set(postX, 4.2, postZ + 0.02);
  plateBack.rotation.x = -0.25;
  root.add(plateBack, plate);

  blockers.push(box(cx, 0, deckLen, 2.8), box(postX, postZ, 0.8, 0.8));

  return {
    root,
    blockers,
    roofs,
    spots: {
      gate: v3(DECK_X0 - rampLen - 1.6, 0, 0),
      plane: v3(0, 0.3, 0),
      door: v3(DECK_X1 - 0.3, DECK_Y + 0.3, 0),
      // (the walk aboard, v0.76: the foot of the leaf ramp on the ground, then its top, on the deck)
      rampFoot: v3(DECK_X0 - rampLen + 0.1, 0, 0),
      rampTop: v3(DECK_X0 + 0.3, DECK_Y + 0.3, 0),
    },
  };
}
