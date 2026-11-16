// ============================================================================
// kit.ts — shared building blocks for the tycoon's procedural world (v0.68): one palette, cached materials,
// a seeded random, and small geometry helpers. Every procedural module (bugs, flora, airport) uses these so
// the whole world has ONE look: clean, rounded, saturated, toy-like (like the 🐞 app icon), never photoreal,
// so the real fire ant models stand out as "Your Colony".
// ============================================================================
import * as THREE from 'three';

/** The world's colors (from the app icon + a backyard palette). */
export const PAL = {
  sky: 0x8fd3ff,
  lawn: 0x6ab84a,
  lawnDark: 0x3f8a2e,
  lawnLight: 0x9bd36a,
  dirt: 0xb98a58,
  sand: 0xe6cf98,
  soil: 0x7a5434,
  pebble: 0x9a958c,
  pebbleWarm: 0xb7a58c,
  leafGreen: 0x5aa33c,
  leafAutumn: 0xd9822b,
  leafRed: 0xc2452d,
  leafBrown: 0x9a6a3a,
  wood: 0x8a5a33,
  woodDark: 0x5e3b1f,
  ladybugRed: 0xe23b2e,
  beeYellow: 0xf6c431,
  black: 0x1a1a1a,
  white: 0xffffff,
  wingClear: 0xe8f6ff,
  nectar: 0xffb02e,
  water: 0x7cc3ef,
  capBlue: 0x2d6cdf,
  shell: 0xf3e3cc,
  fungusGlow: 0x9dff6a,
} as const;

const cache = new Map<string, THREE.Material>();
/**
 * A shared MeshStandardMaterial (same args = same material object, so meshes can batch).
 * Never dispose the result; never change its properties in place (clone it if you must).
 */
export function mat(color: number, o: { rough?: number; metal?: number; opacity?: number; emissive?: number; side?: THREE.Side; flat?: boolean } = {}) {
  const key = `${color}|${o.rough ?? 0.7}|${o.metal ?? 0}|${o.opacity ?? 1}|${o.emissive ?? 0}|${o.side ?? 0}|${o.flat ? 1 : 0}`;
  let m = cache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      roughness: o.rough ?? 0.7,
      metalness: o.metal ?? 0,
      transparent: (o.opacity ?? 1) < 1,
      opacity: o.opacity ?? 1,
      depthWrite: (o.opacity ?? 1) >= 1,
      emissive: o.emissive ?? 0,
      side: o.side ?? THREE.FrontSide,
      flatShading: !!o.flat,
    });
    cache.set(key, m);
  }
  return m as THREE.MeshStandardMaterial;
}

/** A seeded random (mulberry32): the same seed always gives the same world. */
export function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    /** a..b */
    range: (a0: number, b0: number) => a0 + (b0 - a0) * next(),
    /** one of */
    pick: <T,>(xs: readonly T[]) => xs[Math.floor(next() * xs.length)],
  };
}
export type Rng = ReturnType<typeof rng>;

/** A mesh that casts + receives shadows. */
export function mesh(geo: THREE.BufferGeometry, material: THREE.Material, shadows = true) {
  const m = new THREE.Mesh(geo, material);
  m.castShadow = shadows;
  m.receiveShadow = shadows;
  return m;
}

/** Axis-aligned box (in the parent's space) the player can't walk through: same shape as stations.Blocker. */
export interface Footprint {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}
