// ============================================================================
// luggage.ts — 🧳 WHAT TRAVELLERS CARRY (v1.02, Phase 8 of the plan: "Crowd variety")
//
// Joshua's plan: "Luggage in hand: a rolling suitcase or a backpack on some travellers, dropped at check-in."
// A rolling suitcase rides beside its traveller, its handle up in their hand, and is handed over at the check-in
// desk (it's the seed-bag that goes out to the BAG DROP). A backpack is carry-on: it stays on their back all the
// way, onto the plane too.
//
// Made of a few boxes and cylinders, one shared geometry each and one material a colour, so a hundred cost little.
// Sized and placed in a traveller's OWN units (devRoom's people are CROWD_HEIGHT = 2.8 tall, facing +z, the model
// root's children), so a taller or shorter person's case goes with them. Every number here is GAME TUNING.
// ============================================================================
import * as THREE from 'three';

/** Who carries what (of the builder's people; aphids carry nothing). */
export const LUGGAGE = {
  /** A rolling suitcase (and of those, some with a backpack too), a backpack alone. */
  suitcase: 0.4,
  both: 0.25,
  backpack: 0.25,
};

const CASE_COLOURS = [0x2552d6, 0xd8322a, 0x22222a, 0x1f9a52, 0xf2c230, 0x7a3fd0, 0xa9b2bd, 0xf06aa8, 0x1fb3b0, 0x8a5a2b];
const PACK_COLOURS = [0x1b2a5c, 0x3a3a40, 0xc0392b, 0x2e7d32, 0xf07a1c, 0x5b4a8a, 0x8d6e4b, 0x4fb3f2];

const box = new THREE.BoxGeometry(1, 1, 1);
const cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);
const mats = new Map<string, THREE.MeshStandardMaterial>();
function mat(hex: number, rough = 0.6, metal = 0) {
  const k = `${hex}|${rough}|${metal}`;
  let m = mats.get(k);
  if (!m) mats.set(k, (m = new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: metal })));
  return m;
}
function part(geo: THREE.BufferGeometry, m: THREE.Material, sx: number, sy: number, sz: number, x: number, y: number, z: number) {
  const mesh = new THREE.Mesh(geo, m);
  mesh.scale.set(sx, sy, sz);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}
const pick = <T,>(a: T[], r: number) => a[Math.floor(r * a.length) % a.length];

/**
 * 🧳 A rolling suitcase standing upright at its traveller's right side, its handle pulled up to their hand (about
 * 0.45 of their height, a little out from their hip), two wheels at its back. A carry-on is about a third of a
 * person's height. (Its own group's origin is on the ground at the case's middle.)
 */
export function makeSuitcase(r = Math.random()) {
  const g = new THREE.Group();
  g.name = 'suitcase';
  const body = mat(pick(CASE_COLOURS, r), 0.45);
  const dark = mat(0x1c1c22, 0.7);
  const steel = mat(0xb8bec8, 0.35, 0.6);
  const W = 0.36, H = 0.82, D = 0.6; // (narrow side toward the traveller: it rolls along beside them)
  g.add(part(box, body, W, H, D, 0, 0.07 + H / 2, 0));
  // ribs down its face, and a strap round it
  g.add(part(box, body, W * 1.06, H * 0.92, 0.04, 0, 0.07 + H / 2, D * 0.25));
  g.add(part(box, body, W * 1.06, H * 0.92, 0.04, 0, 0.07 + H / 2, -D * 0.25));
  g.add(part(box, dark, W * 1.08, 0.06, D * 1.04, 0, 0.07 + H * 0.55, 0));
  // wheels (four little spinners)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const w = part(cyl, dark, 0.1, 0.06, 0.1, sx * W * 0.32, 0.05, sz * D * 0.38);
    w.rotation.z = Math.PI / 2;
    g.add(w);
  }
  // the telescopic handle: two rods up from its top to a grip
  const top = 0.07 + H, grip = 1.27;
  for (const sz of [-1, 1]) g.add(part(cyl, steel, 0.035, grip - top, 0.035, 0, (top + grip) / 2, sz * 0.13));
  g.add(part(box, dark, 0.07, 0.07, 0.34, 0, grip, 0));
  // (beside the right hand, a little ahead of the hip so the grip meets the hand as it hangs)
  g.position.set(-0.62, 0, 0.02);
  return g;
}

/** 🎒 A backpack on its traveller's back, between the shoulder blades and the waist, with its two straps over the shoulders. */
export function makeBackpack(r = Math.random(), bump = 0) {
  const g = new THREE.Group();
  g.name = 'backpack';
  const body = mat(pick(PACK_COLOURS, r), 0.75);
  const dark = mat(0x23232a, 0.8);
  const W = 0.52, H = 0.62, D = 0.26;
  g.add(part(box, body, W, H, D, 0, 0, 0));
  // a rounded top, a front pocket and a top loop
  const top = part(cyl, body, W, D, D, 0, H / 2, 0);
  top.rotation.z = Math.PI / 2;
  g.add(top);
  g.add(part(box, mat(pick(PACK_COLOURS, (r * 7.3) % 1), 0.75), W * 0.72, H * 0.42, 0.12, 0, -H * 0.18, -D / 2 - 0.05));
  g.add(part(box, dark, 0.1, 0.1, 0.04, 0, H / 2 + D / 2 + 0.03, 0));
  // the straps, up over each shoulder
  for (const sx of [-1, 1]) {
    const s = part(box, dark, 0.07, 0.62, 0.05, sx * 0.17, 0.1, D / 2 + 0.03);
    s.rotation.x = -0.25;
    g.add(s);
  }
  // (on her back: at three fifths of her height, just behind her shoulder blades; a little further out on a big
  // belly's lean back)
  g.position.set(0, 1.85, -0.36 - Math.min(0.06, bump * 0.0004));
  return g;
}
