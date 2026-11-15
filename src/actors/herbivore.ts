// ============================================================================
// herbivore.ts — 🦕 a small, gentle plant-eating dinosaur, built from simple shapes (v0.63).
//
// The story's first tame (the remake plan: "you free a small dinosaur from debris, feed it, and it helps haul
// your next load"). Procedural for now, like the Lava Rex (rex.ts), until there's a real model: a pony-sized
// four-legged beaked dinosaur with a little frill, big friendly eyes, and a long tail. It plugs into the same
// CreatureModel as everything else, so stepTo() and animateCreature() walk it.
//
// Its moods (set `herb.mood`): 'calm' (looks about), 'scared' (crouched, head low, trembling), 'happy' (tail
// wagging, head bobbing up). Everything is measured in body lengths (L), nose to tail tip, facing +z.
// ============================================================================
import * as THREE from 'three';
import { CreatureModel, newModel } from './models';

const sphere = new THREE.SphereGeometry(1, 16, 12);
const cone = new THREE.ConeGeometry(1, 1, 8);

function blob(m: THREE.Material, rx: number, ry: number, rz: number, x = 0, y = 0, z = 0) {
  const b = new THREE.Mesh(sphere, m);
  b.scale.set(rx, ry, rz);
  b.position.set(x, y, z);
  b.castShadow = true;
  return b;
}

export type HerbMood = 'calm' | 'scared' | 'happy';
export interface HerbParts {
  mood: HerbMood;
  head: THREE.Group;
  neck: THREE.Group;
  tail: THREE.Group[];
  knees: THREE.Group[];
  t: number;
  /** Where carried things sit (on its back), in the bob's space. */
  saddle: THREE.Vector3;
}

export function makeHerbivore(length: number, colors = { skin: 0x5f9e6e, belly: 0xd8d0a0, stripe: 0x3d6b4a, frill: 0xe07a3f }) {
  const L = length;
  const model = newModel(0.42 * L, L) as CreatureModel & { herb: HerbParts };
  const skin = new THREE.MeshStandardMaterial({ color: colors.skin, roughness: 0.8 });
  const belly = new THREE.MeshStandardMaterial({ color: colors.belly, roughness: 0.9 });
  const stripe = new THREE.MeshStandardMaterial({ color: colors.stripe, roughness: 0.85 });
  const frill = new THREE.MeshStandardMaterial({ color: colors.frill, roughness: 0.6, side: THREE.DoubleSide });
  const beak = new THREE.MeshStandardMaterial({ color: 0x3b3328, roughness: 0.5 });
  const eyeW = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
  const eyeB = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.2 });
  const b = model.bob;

  // --- Body: a round barrel, stripes across the back ---------------------------
  b.add(blob(skin, 0.13 * L, 0.12 * L, 0.21 * L, 0, 0.26 * L, 0));
  b.add(blob(belly, 0.11 * L, 0.08 * L, 0.18 * L, 0, 0.21 * L, 0.01 * L));
  for (let i = 0; i < 4; i++) {
    const s = blob(stripe, 0.125 * L, 0.03 * L, 0.025 * L, 0, 0.33 * L, -0.12 * L + i * 0.075 * L);
    b.add(s);
  }

  // --- Neck + head (with a beak and a little frill) ----------------------------
  const neck = new THREE.Group();
  neck.position.set(0, 0.3 * L, 0.17 * L);
  b.add(neck);
  const neckMesh = blob(skin, 0.055 * L, 0.06 * L, 0.09 * L, 0, 0.035 * L, 0.05 * L);
  neckMesh.rotation.x = -0.7;
  neck.add(neckMesh);
  const head = new THREE.Group();
  head.position.set(0, 0.09 * L, 0.11 * L);
  neck.add(head);
  head.add(blob(skin, 0.06 * L, 0.055 * L, 0.075 * L, 0, 0, 0.02 * L));
  head.add(blob(belly, 0.045 * L, 0.035 * L, 0.05 * L, 0, -0.02 * L, 0.07 * L)); // muzzle
  const bk = new THREE.Mesh(cone, beak);
  bk.scale.set(0.03 * L, 0.05 * L, 0.03 * L);
  bk.rotation.x = Math.PI / 2;
  bk.position.set(0, -0.02 * L, 0.12 * L);
  head.add(bk);
  for (const s of [-1, 1]) {
    head.add(blob(eyeW, 0.022 * L, 0.024 * L, 0.018 * L, s * 0.045 * L, 0.02 * L, 0.04 * L));
    head.add(blob(eyeB, 0.012 * L, 0.014 * L, 0.01 * L, s * 0.055 * L, 0.022 * L, 0.048 * L));
  }
  const fr = new THREE.Mesh(new THREE.CircleGeometry(0.09 * L, 14, 0, Math.PI), frill);
  fr.position.set(0, 0.03 * L, -0.03 * L);
  fr.rotation.x = -0.5;
  head.add(fr);

  // --- Tail: 6 segments, each a child of the last ------------------------------
  const tail: THREE.Group[] = [];
  let parent: THREE.Object3D = b;
  let r = 0.09;
  for (let i = 0; i < 6; i++) {
    const seg = new THREE.Group();
    seg.position.set(0, i === 0 ? 0.27 * L : 0, i === 0 ? -0.17 * L : -0.07 * L);
    seg.rotation.x = 0.06;
    seg.add(blob(i % 2 ? stripe : skin, r * L, r * 0.9 * L, 0.055 * L, 0, 0, -0.03 * L));
    parent.add(seg);
    tail.push(seg);
    parent = seg;
    r *= 0.76;
  }

  // --- Four legs: hip (swings) -> knee -> foot. Diagonal pairs step together ----
  const knees: THREE.Group[] = [];
  for (const [side, front] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const hip = new THREE.Group();
    hip.position.set(side * 0.09 * L, 0.24 * L, front * 0.12 * L);
    b.add(hip);
    hip.add(blob(skin, 0.045 * L, 0.07 * L, 0.05 * L, 0, -0.04 * L, 0));
    const knee = new THREE.Group();
    knee.position.set(0, -0.1 * L, 0);
    hip.add(knee);
    knee.add(blob(skin, 0.028 * L, 0.06 * L, 0.03 * L, 0, -0.04 * L, 0));
    knee.add(blob(beak, 0.035 * L, 0.014 * L, 0.04 * L, 0, -0.1 * L, 0.01 * L));
    knees.push(knee);
    model.legs.push(hip);
    model.legBase.push(hip.quaternion.clone());
    model.legAxis.push(new THREE.Vector3(1, 0, 0));
    model.legPhase.push((side < 0) === (front > 0) ? 0 : Math.PI);
  }
  model.legAmp = 0.5;
  model.stride = 0.45;
  b.position.y = -0.015 * L;

  const parts: HerbParts = { mood: 'calm', head, neck, tail, knees, t: Math.random() * 10, saddle: new THREE.Vector3(0, 0.39 * L, -0.02 * L) };
  model.herb = parts;
  let crouch = 0;
  let joy = 0;
  model.extra = (dt) => {
    parts.t += dt;
    const t = parts.t;
    const w = model.walkBlend;
    crouch += ((parts.mood === 'scared' ? 1 : 0) - crouch) * Math.min(1, dt * 4);
    joy += ((parts.mood === 'happy' ? 1 : 0) - joy) * Math.min(1, dt * 4);
    model.legs.forEach((_, i) => {
      const ph = model.walkT + model.legPhase[i];
      knees[i].rotation.x = -Math.max(0, Math.cos(ph)) * 0.5 * w + crouch * 0.5;
    });
    // Tail: a slow sway, or a happy wag
    tail.forEach((seg, i) => {
      seg.rotation.y = Math.sin(t * (1.4 + joy * 7) - i * 0.6) * (0.06 + 0.03 * w + joy * 0.1);
    });
    // Head: looks about when calm; low and trembling when scared; bobbing up when happy
    neck.rotation.x = crouch * 0.6 - joy * 0.25 + Math.sin(t * 0.9) * 0.05 + Math.sin(model.walkT * 2) * 0.04 * w;
    neck.rotation.y = (1 - crouch) * Math.sin(t * 0.43) * 0.35;
    head.rotation.z = joy * Math.sin(t * 5) * 0.12 + crouch * Math.sin(t * 40) * 0.025;
    model.bob.position.y = -0.015 * L - crouch * 0.05 * L + joy * Math.abs(Math.sin(t * 5)) * 0.02 * L + Math.abs(Math.sin(model.walkT)) * 0.012 * L * w;
  };
  return model;
}
