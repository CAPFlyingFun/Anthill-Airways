// ============================================================================
// fungus.ts — 🍄 the little glowing mushrooms that act as airport lights (v0.68).
//
// They are "lights" made only of an EMISSIVE material (a color that glows by itself). There is no real
// light source, so a hundred of them cost almost nothing. All mushrooms share ONE glow material, and
// `glowTick()` makes that one material breathe gently, so every mushroom pulses together for free.
//
// Triangles: ~60 per mushroom (stem 24 + cap 36). 2 meshes per row of mushrooms (stems + caps), however long.
// ============================================================================
import * as THREE from 'three';
import { PAL, mat } from '../kit';
import { Piece, cached, scatter, v3, Item } from './common';

/** The glowing cap material, shared by every mushroom in the airport. */
const glow = new THREE.MeshStandardMaterial({
  color: 0xd9ffb0,
  emissive: PAL.fungusGlow,
  emissiveIntensity: 1.5,
  roughness: 0.55,
});
const stemMat = mat(0xece4d0, { rough: 0.8 });

/** Gently pulse the shared glow (call from any piece's update; calling it twice a frame is harmless). */
export function glowTick() {
  const t = performance.now() / 1000;
  glow.emissiveIntensity = 1.35 + 0.3 * Math.sin(t * 1.7) + 0.08 * Math.sin(t * 5.3);
}

const stemGeo = () => cached('fungus-stem', () => new THREE.CylinderGeometry(0.2, 0.3, 1, 7).translate(0, 0.5, 0));
/** A squashed dome: 1 unit wide, 0.55 tall, sitting on y = 0. */
const capGeo = () => cached('fungus-cap', () => new THREE.SphereGeometry(0.5, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 1.1, 1));

/**
 * A group of mushroom lights, `items` = where (y is the ground height). `h` is the stem height, `cap` the cap
 * width. Two InstancedMeshes in total (stems + caps), no matter how many mushrooms.
 */
export function fungusRow(items: { x: number; y: number; z: number; s?: number }[], h = 1.6, cap = 1.9): THREE.Group {
  const g = new THREE.Group();
  const stems: Item[] = items.map((i) => ({ x: i.x, y: i.y, z: i.z, sx: 1, sy: h * (i.s ?? 1), sz: 1 }));
  const caps: Item[] = items.map((i) => ({ x: i.x, y: i.y + h * (i.s ?? 1) * 0.92, z: i.z, s: cap * (i.s ?? 1) }));
  g.add(scatter(stemGeo(), stemMat, stems, { receive: false }), scatter(capGeo(), glow, caps, { receive: false }));
  return g;
}

/**
 * makeFungusLight() — one small glowing mushroom (about 3 units tall, cap 2 wide) for taxiway/apron lights.
 * Spots: 'top' (the glowing cap).
 */
export function makeFungusLight(): Piece {
  const root = new THREE.Group();
  root.add(fungusRow([{ x: 0, y: 0, z: 0 }], 2.2, 2.4));
  return {
    root,
    blockers: [],
    spots: { top: v3(0, 3, 0) },
    roofs: [],
    update: glowTick,
  };
}
