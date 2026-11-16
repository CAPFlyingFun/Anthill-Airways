// ============================================================================
// baggage.ts — 🧳 the baggage cart: a sunflower-seed HUSK on four seed wheels, pulled by ants (v0.68).
//
// A sunflower seed husk is a striped (black and cream), teardrop-shaped little boat: perfect as a luggage bed.
// It rides on four round dark seed wheels with thin axles, has a twig drawbar with a loop at the front (where
// the ants grab it) and a few bags (pastel squashed beans) inside.
//
// Size: ~8 long (Z) × 4.4 wide (X, wheels included) × ~3 tall. Drawbar points to +Z (so the ants pull it forward).
// Triangles: ~1,300. Meshes: 5.
// Spots: 'hitch' (where the ants pull: just ahead of the drawbar loop), 'load' (the middle of the bed).
// ============================================================================
import * as THREE from 'three';
import { mat } from '../kit';
import { Batch, Piece, box, capsuleGeometry, v3 } from './common';

const huskMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, side: THREE.DoubleSide });
const wheelMat = mat(0x4a3220, { rough: 0.8 });
const axleMat = mat(0x8a5a33, { rough: 0.9 });
const bagColors = [0xff7aa8, 0x5fb4ff, 0xffd24a, 0xa0e060];

/** The husk: the lower half of a sphere pulled into a teardrop, with black and cream stripes. */
function huskGeometry() {
  const g = new THREE.SphereGeometry(1, 30, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  const p = g.getAttribute('position');
  const col: number[] = [];
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const taper = 1 - 0.32 * z; // narrower toward the pointed front (+Z)
    // stripes run along the length: pick by the angle around the Z axis
    const ang = Math.atan2(x, -y);
    const stripe = Math.floor(((ang + Math.PI) / (Math.PI * 2)) * 10) % 2;
    c.setHex(stripe ? 0x2b2622 : 0xf0e6cc);
    col.push(c.r, c.g, c.b);
    p.setXYZ(i, x * 2.1 * taper, y * 1.25, z * 3.6);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

export function makeBaggageCart(): Piece {
  const root = new THREE.Group();
  const bedY = 2.15;

  const husk = new THREE.Mesh(huskGeometry(), huskMat);
  husk.position.set(0, bedY, 0);
  husk.castShadow = true;
  husk.receiveShadow = true;
  root.add(husk);

  const b = new Batch();
  // wheels (squat discs) + two axles
  const wheel = new THREE.CylinderGeometry(0.8, 0.8, 0.42, 12).rotateZ(Math.PI / 2);
  for (const z of [-1.8, 1.7]) {
    for (const x of [-2.15, 2.15]) b.at(wheel, wheelMat, x, 0.8, z);
    b.at(capsuleGeometry(4.6, 0.12, 4).clone().rotateZ(Math.PI / 2), axleMat, 0, 0.8, z);
  }
  // drawbar: a twig sloping down toward the front, with a loop to grab
  b.at(capsuleGeometry(4.2, 0.17, 4).clone().rotateX(Math.PI / 2 + 0.12), axleMat, 0, 1.05, 5.5);
  b.add(new THREE.TorusGeometry(0.55, 0.12, 5, 12).rotateX(Math.PI / 2), axleMat, new THREE.Matrix4().makeTranslation(0, 0.72, 7.5));
  // bags
  const bag = new THREE.SphereGeometry(0.62, 10, 8);
  const bagMats = bagColors.map((hex) => mat(hex, { rough: 0.6 }));
  [[-0.55, -1.0, 0], [0.6, -0.6, 1], [-0.1, 0.4, 2], [0.5, 1.2, 3]].forEach(([x, z, k]) => {
    b.at(bag, bagMats[k], x, bedY - 0.35, z, { sx: 1.1, sy: 0.85, sz: 1.3 });
  });
  root.add(b.build());

  return {
    root,
    blockers: [box(0, 0, 4.6, 7.4)],
    roofs: [],
    spots: { hitch: v3(0, 0, 8.6), load: v3(0, bedY, 0) },
  };
}
