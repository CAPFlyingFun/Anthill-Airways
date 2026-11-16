// ============================================================================
// lawn.ts — 🌿 the forest of grass around the airport (v0.68).
//
// To an ant a mowed lawn is a forest: each blade is ~47 units tall (about 20 ants) and ~3-4 wide.
//
// HOW IT STAYS FAST (tens of thousands of blades on a phone):
//   * One blade = one tiny 14-triangle mesh (curved, with a folded "V" cross-section so it looks 3D
//     from every side, and a cut/rounded tip).
//   * All blades are InstancedMeshes: one draw call per CHUNK, not per blade.
//   * The lawn is split into an 8 x 8 grid of chunks. Each chunk knows its own bounding sphere, so chunks
//     that are off-screen are skipped by the GPU (frustum culling).
//   * update() also thins out chunks that are far from the camera (draws only the first 55% / 30% of their
//     blades; the blades are in random order so the lawn just looks a bit sparser, hidden by fog).
//   * Blades beside the airport clearing (the "near" set) cast + receive shadows; the rest don't.
//   * Wind is done on the GPU: a few lines added to the blade's vertex shader sway the tips; the only
//     CPU work per frame is adding dt to one number (a shared uniform).
//
// Also grown here: clover patches (small "trees"), dandelions, white clover flowers and daisies.
// ============================================================================
import * as THREE from 'three';
import { PAL, rng } from '../kit';
import { SIZE } from '../scale';
import { cloverGeos, floraMaterials, flowerGeos, nectarMaterial } from './props';
import { fbm, smooth, vcMat } from './shared';

export interface LawnOpts {
  /** Side length of the square lawn, centred on 0,0 (same as the ground). */
  size: number;
  /** true where nothing should grow (the clearing, buildings, runways...). Thinning near it is automatic. */
  avoid: (x: number, z: number) => boolean;
  /** Blades per square unit (default 0.26). Lower = faster. */
  density?: number;
  seed?: number;
}

const GRID = 8; // 8 x 8 chunks
const H = SIZE.grassBlade; // 47.5
const BLADE_W = 3.6;

/** One grass blade: 5 rows x 3 vertices (+ a folded middle) = 16 triangles. Base at y=0, grows up +y, bends toward +z. */
function makeBladeGeometry(): THREE.BufferGeometry {
  const rows = [0, 0.3, 0.62, 0.86, 1];
  const width = [1, 1, 0.96, 0.88, 0.62]; // the cut tip is a little narrower
  const bright = [0.5, 0.78, 0.95, 1.05, 1.1]; // dark at the base, lighter at the tip
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  for (let j = 0; j < rows.length; j++) {
    const t = rows[j];
    const y = t * H * (j === rows.length - 1 ? 0.985 : 1);
    const bend = t * t * H * 0.22; // curves over toward +z
    const w = (BLADE_W / 2) * width[j];
    const fold = w * 0.55 * (1 - t * 0.35); // sides lift, the middle is the crease of the V
    // left, centre, right
    pos.push(-w, y, bend + fold, 0, y * (j === rows.length - 1 ? 0.995 : 1), bend, w, y, bend + fold);
    const b = bright[j];
    col.push(b, b, b, b * 0.82, b * 0.82, b * 0.82, b, b, b); // the crease is a bit darker = depth
  }
  for (let j = 0; j < rows.length - 1; j++) {
    const a = j * 3, b = (j + 1) * 3;
    idx.push(a, a + 1, b, a + 1, b + 1, b, a + 1, a + 2, b + 1, a + 2, b + 2, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

interface Chunk {
  main: THREE.InstancedMesh | null;
  near: THREE.InstancedMesh | null;
  cx: number;
  cz: number;
  nMain: number;
  nNear: number;
  level: number;
}

export class Lawn {
  root = new THREE.Group();
  /** Stats for the integrator: how many blades, triangles and chunk meshes exist. */
  stats = { blades: 0, trianglesAll: 0, chunkMeshes: 0, plants: 0 };
  private time = { value: 0 };
  private chunks: Chunk[] = [];
  private cam = new THREE.Vector3();

  constructor(o: LawnOpts) {
    const R = rng((o.seed ?? 3) * 7919 + 11);
    const seed = o.seed ?? 3;
    const density = o.density ?? 0.26;
    this.root.name = 'lawn';
    const half = o.size / 2;
    const cell = o.size / GRID;

    // ----- shared blade geometry + ONE swaying material -----
    const geo = makeBladeGeometry();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.68, metalness: 0 });
    const uTime = this.time;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uTime;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           #ifdef USE_INSTANCING
             float tt = clamp(position.y / ${H.toFixed(1)}, 0.0, 1.0);
             vec3 ip = instanceMatrix[3].xyz;
             float ph = ip.x * 0.045 + ip.z * 0.037;
             float gust = sin(uTime * 1.6 + ph) * 0.65 + sin(uTime * 0.6 + ph * 1.9 + 1.7) * 0.35;
             float bend = tt * tt;
             transformed.x += gust * bend * 3.0;
             transformed.z += cos(uTime * 1.25 + ph * 1.3) * 0.5 * bend * 2.0 + gust * bend * 1.2;
           #endif`
        );
    };
    mat.customProgramCacheKey = () => 'flora-lawn-blade';

    // ----- decide where every blade goes -----
    // per chunk: blades far from the clearing ("main", no shadows) and blades near it ("near", shadows)
    type B = { x: number; z: number; h: number; w: number; yaw: number; tilt: number; c: number };
    const mainB: B[][] = Array.from({ length: GRID * GRID }, () => []);
    const nearB: B[][] = Array.from({ length: GRID * GRID }, () => []);
    const probe: [number, number][] = [];
    for (let k = 0; k < 8; k++) probe.push([Math.cos((k / 8) * Math.PI * 2), Math.sin((k / 8) * Math.PI * 2)]);
    const total = Math.round(o.size * o.size * density);
    for (let n = 0; n < total; n++) {
      const x = (R.next() - 0.5) * o.size, z = (R.next() - 0.5) * o.size;
      if (o.avoid(x, z)) continue;
      // how close to the clearing are we? probe outward at 4 and 12 and 26 units
      let hits4 = 0, hits12 = 0, hits26 = 0, hits44 = 0;
      for (const [dx, dz] of probe) {
        if (o.avoid(x + dx * 4, z + dz * 4)) hits4++;
        if (o.avoid(x + dx * 12, z + dz * 12)) hits12++;
        if (o.avoid(x + dx * 26, z + dz * 26)) hits26++;
        if (o.avoid(x + dx * 44, z + dz * 44)) hits44++;
      }
      const edge = Math.min(1, Math.max(hits4 / 5, hits12 / 8 * 0.8, hits26 / 8 * 0.55, hits44 / 8 * 0.3)); // 0 = deep lawn .. 1 = at the clearing edge
      if (edge > 0.05 && R.next() < edge * edge * 0.7) continue; // thinning toward the edge
      let hScale = 0.62 + R.next() * 0.42;
      if (edge > 0.2 && R.next() < 0.5 * edge + 0.1) hScale = 0.12 + R.next() * 0.38; // short re-growing blades
      else if (R.next() < 0.14) hScale = 0.25 + R.next() * 0.3; // a few short ones in the undergrowth too
      hScale *= 1 - Math.pow(edge, 0.8) * 0.55; // the lawn ramps up like a hill toward the forest
      const b: B = { x, z, h: hScale, w: 0.8 + R.next() * 0.45, yaw: R.next() * Math.PI * 2, tilt: R.next() * 0.38 + edge * 0.1, c: R.next() };
      const ci = Math.min(GRID - 1, Math.floor((x + half) / cell)) + Math.min(GRID - 1, Math.floor((z + half) / cell)) * GRID;
      (edge > 0.12 ? nearB : mainB)[ci].push(b);
    }

    // ----- build the instanced meshes -----
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), pv = new THREE.Vector3(), sv = new THREE.Vector3();
    const cDark = new THREE.Color(PAL.lawnDark), cMid = new THREE.Color(PAL.lawn), cLight = new THREE.Color(PAL.lawnLight), cStraw = new THREE.Color(0xb7b45a);
    const col = new THREE.Color();
    const build = (list: B[], cx: number, cz: number, near: boolean) => {
      if (!list.length) return null;
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((b, i) => {
        e.set(b.tilt, b.yaw, 0, 'YXZ');
        q.setFromEuler(e);
        m4.compose(pv.set(b.x, 0, b.z), q, sv.set(b.w, b.h, 1));
        im.setMatrixAt(i, m4);
        // colour: mostly mid greens, patchy lighter/darker (a slow noise), a few straw-yellow blades
        const patch = fbm(b.x * 0.02, b.z * 0.02, seed + 5, 3);
        col.copy(cDark).lerp(cMid, smooth(0.15, 0.7, patch * 0.7 + b.c * 0.5)).lerp(cLight, smooth(0.6, 1, patch * 0.5 + b.c * 0.5) * 0.7);
        if (b.c > 0.96) col.lerp(cStraw, 0.6);
        im.setColorAt(i, col);
      });
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      // a correct bounding sphere for the chunk (cell + blade height) so off-screen chunks are skipped
      im.boundingSphere = new THREE.Sphere(new THREE.Vector3(cx, H * 0.45, cz), cell * 0.72 + H * 0.6);
      im.castShadow = near;
      im.receiveShadow = near;
      this.root.add(im);
      this.stats.chunkMeshes++;
      this.stats.blades += list.length;
      return im;
    };
    for (let gz = 0; gz < GRID; gz++) {
      for (let gx = 0; gx < GRID; gx++) {
        const i = gx + gz * GRID;
        const cx = -half + (gx + 0.5) * cell, cz = -half + (gz + 0.5) * cell;
        const ch: Chunk = { main: build(mainB[i], cx, cz, false), near: build(nearB[i], cx, cz, true), cx, cz, nMain: mainB[i].length, nNear: nearB[i].length, level: 0 };
        this.chunks.push(ch);
      }
    }
    this.stats.trianglesAll = this.stats.blades * 16;

    // ----- clover patches, dandelions, flowers -----
    this.growPlants(o, R, half);
  }

  /** Clover (tiny trees), plus a few dandelions, white clover heads and daisies standing among the blades. */
  private growPlants(o: LawnOpts, R: ReturnType<typeof rng>, half: number) {
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), pv = new THREE.Vector3(), sv = new THREE.Vector3();
    // pick patch centres in open lawn, at some distance from the clearing
    const centres: { x: number; z: number }[] = [];
    const nPatches = Math.max(4, Math.round((o.size * o.size) / 22000));
    let tries = 0;
    while (centres.length < nPatches && tries < 400) {
      tries++;
      const x = (R.next() - 0.5) * o.size * 0.92, z = (R.next() - 0.5) * o.size * 0.92;
      if (o.avoid(x, z) || o.avoid(x + 12, z) || o.avoid(x - 12, z) || o.avoid(x, z + 12) || o.avoid(x, z - 12)) continue;
      centres.push({ x, z });
    }
    const variants = [1, 2, 3, 4, 5].map((s) => cloverGeos(s + 40));
    const spots: { x: number; z: number }[][] = variants.map(() => []);
    let n = 0;
    for (const c of centres) {
      const k = 14 + Math.floor(R.next() * 16);
      const rad = 10 + R.next() * 14;
      for (let i = 0; i < k; i++) {
        const a = R.next() * Math.PI * 2, r = Math.sqrt(R.next()) * rad;
        const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
        if (o.avoid(x, z) || Math.abs(x) > half || Math.abs(z) > half) continue;
        spots[n++ % variants.length].push({ x, z });
      }
    }
    const group = new THREE.Group();
    group.name = 'lawn-plants';
    const stemMat = vcMat();
    // clover geometries: stem (vertex colours) + leaflets (their own textured material, from props)
    variants.forEach((v, k) => {
      const list = spots[k];
      if (!list.length) return;
      const a = new THREE.InstancedMesh(v.stem, stemMat, list.length);
      const b = new THREE.InstancedMesh(v.leaves, leafMatFor(), list.length);
      list.forEach((p, i) => {
        const s = 0.9 + R.next() * 0.5;
        e.set(0, R.next() * Math.PI * 2, 0);
        q.setFromEuler(e);
        m4.compose(pv.set(p.x, 0, p.z), q, sv.set(s, s, s));
        a.setMatrixAt(i, m4);
        b.setMatrixAt(i, m4);
      });
      for (const im of [a, b]) {
        im.castShadow = false;
        im.receiveShadow = false;
        im.instanceMatrix.needsUpdate = true;
        im.computeBoundingSphere();
        group.add(im);
      }
      this.stats.plants += list.length;
    });
    // flowers: dandelions + clover heads + daisies, in small clumps
    const kinds: ('dandelion' | 'clover-flower' | 'daisy')[] = ['dandelion', 'clover-flower', 'daisy'];
    kinds.forEach((kind, ki) => {
      const geos = [1, 2].map((s) => flowerGeos(kind, s + 7));
      const list: { x: number; z: number }[] = [];
      const want = Math.max(4, Math.round((o.size * o.size) / (kind === 'clover-flower' ? 14000 : 30000)));
      let t = 0;
      while (list.length < want && t < want * 40) {
        t++;
        const base = ki === 1 && centres.length ? centres[Math.floor(R.next() * centres.length)] : null; // white clover blooms grow in the clover patches
        const x = base ? base.x + (R.next() - 0.5) * 22 : (R.next() - 0.5) * o.size * 0.9;
        const z = base ? base.z + (R.next() - 0.5) * 22 : (R.next() - 0.5) * o.size * 0.9;
        if (o.avoid(x, z) || o.avoid(x + 8, z + 8)) continue;
        list.push({ x, z });
      }
      geos.forEach((g, gi) => {
        const sub = list.filter((_, i) => i % geos.length === gi);
        if (!sub.length) return;
        const body = new THREE.InstancedMesh(g.body, vcMat({ side: THREE.DoubleSide }), sub.length);
        const nec = new THREE.InstancedMesh(g.nectar, nectarMaterial(), sub.length);
        sub.forEach((p, i) => {
          const s = 0.85 + R.next() * 0.35;
          e.set(0, R.next() * Math.PI * 2, 0);
          q.setFromEuler(e);
          m4.compose(pv.set(p.x, 0, p.z), q, sv.set(s, s, s));
          body.setMatrixAt(i, m4);
          nec.setMatrixAt(i, m4);
        });
        for (const im of [body, nec]) {
          im.instanceMatrix.needsUpdate = true;
          im.computeBoundingSphere();
          group.add(im);
        }
        this.stats.plants += sub.length;
      });
    });
    this.root.add(group);
  }

  /** Call every frame: advances the wind, and thins far-away chunks (LOD). */
  update(dt: number, camera: THREE.Camera) {
    this.time.value += dt;
    camera.getWorldPosition(this.cam);
    for (const c of this.chunks) {
      const d = Math.hypot(c.cx - this.cam.x, c.cz - this.cam.z);
      const level = d < 170 ? 0 : d < 300 ? 1 : 2;
      if (level === c.level) continue;
      c.level = level;
      const f = level === 0 ? 1 : level === 1 ? 0.55 : 0.3;
      // blades are stored in random order, so drawing only the first part is a fair, thinner lawn
      if (c.main) c.main.count = Math.max(1, Math.ceil(c.nMain * f));
      if (c.near) c.near.count = Math.max(1, Math.ceil(c.nNear * (level === 2 ? 0.6 : 1)));
    }
  }
}

function leafMatFor() {
  return floraMaterials.clover();
}
