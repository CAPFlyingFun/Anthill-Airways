// ============================================================================
// ground.ts — 🟫 the dirt the airport is built on (v0.68).
//
// buildGround() returns ONE flat square of earth at y = 0:
//   * inside each "clearing" it's bare packed dirt / sand with little cracks and pebbly speckles
//   * the edge of a clearing is soft and wobbly (not a perfect circle), fading into dark lawn soil
//   * outside the clearings it's dark lawn soil with thatch (dead grass bits), where the grass forest grows
//
// HOW (all cheap): the big layout (which part is dirt, which is lawn) is painted ONCE into a canvas texture.
// A second small seamless "speckle" texture is tiled over it in the shader, so the ground still looks
// detailed when the camera is a few units away (a single big texture would go blurry up close).
// On top of the dirt sit thousands of tiny sand grains + a few gravel stones as InstancedMeshes
// (one draw call each), only near the clearings.
// ============================================================================
import * as THREE from 'three';
import { PAL, rng } from '../kit';
import { SIZE } from '../scale';
import { fbm, hash2, smooth, vnoise } from './shared';

export interface GroundOpts {
  /** Side length of the square, in game units (centred on 0,0). */
  size: number;
  /** Bare-dirt circles. */
  clearings: { x: number; z: number; r: number }[];
  seed?: number;
}

const TEX = 1024; // layout texture size (pixels)

// colours as 0-255 triples for the per-pixel painter
const rgb = (hex: number): [number, number, number] => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
const SAND = rgb(PAL.sand), DIRT = rgb(PAL.dirt), SOIL = rgb(PAL.soil);
const LAWN_SOIL = rgb(0x4a4a26), THATCH = rgb(0x6a6a34), LAWN_DARK = rgb(0x35481f);
const mix3 = (a: number[], b: number[], t: number): [number, number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** The tiny seamless speckle texture that is tiled over the whole ground (made once, shared). */
let detailTex: THREE.CanvasTexture | null = null;
function getDetailTexture() {
  if (detailTex) return detailTex;
  const N = 256;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d')!;
  const img = g.createImageData(N, N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      // seamless noise: coarse blobs + fine grain, both wrapping around the edge
      const blob = vnoise((x / N) * 6, (y / N) * 6, 3, 6) * 0.5 + vnoise((x / N) * 24, (y / N) * 24, 9, 24) * 0.3;
      let v = 0.55 + (blob - 0.4) * 0.5;
      const h = hash2(x, y, 11);
      if (h > 0.965) v += 0.28; // pale sand grain
      else if (h < 0.05) v -= 0.3; // dark fleck
      v = Math.min(1, Math.max(0, v));
      const k = (y * N + x) * 4;
      img.data[k] = img.data[k + 1] = img.data[k + 2] = v * 255;
      img.data[k + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  detailTex = new THREE.CanvasTexture(c);
  detailTex.wrapS = detailTex.wrapT = THREE.RepeatWrapping;
  detailTex.anisotropy = 8;
  return detailTex;
}

export function buildGround(o: GroundOpts): THREE.Group {
  const seed = o.seed ?? 7;
  const R = rng(seed * 101 + 5);
  const root = new THREE.Group();
  root.name = 'ground';
  const half = o.size / 2;

  // ----- 1. the layout texture: dirt blobs + lawn soil -----
  const cv = document.createElement('canvas');
  cv.width = cv.height = TEX;
  const g = cv.getContext('2d')!;
  const img = g.createImageData(TEX, TEX);
  const upp = o.size / TEX; // units per pixel
  for (let py = 0; py < TEX; py++) {
    const z = (py / TEX - 0.5) * o.size;
    for (let px = 0; px < TEX; px++) {
      const x = (px / TEX - 0.5) * o.size;
      // how far into a clearing (1 = right at the edge, <1 inside), wobbled by noise so the edge is organic
      let d = 99;
      for (const c of o.clearings) {
        const dd = Math.hypot(x - c.x, z - c.z) / c.r;
        if (dd < d) d = dd;
      }
      const wob = (fbm(x * 0.045, z * 0.045, seed, 4) - 0.5) * 0.45 + (fbm(x * 0.2, z * 0.2, seed + 3, 2) - 0.5) * 0.08;
      const e = d + wob; // wobbled distance
      const dirt = 1 - smooth(0.82, 1.1, e); // 1 inside the clearing, 0 in the lawn
      // dirt colour: sand in the middle (worn pale), richer brown toward the edge, patchy
      const patch = fbm(x * 0.09, z * 0.09, seed + 8, 3);
      let col = mix3(SAND, DIRT, smooth(0.15, 0.95, e) * 0.8 + patch * 0.35 - 0.12);
      // a darker, damp band where dirt meets lawn
      const band = smooth(0.7, 0.95, e) * (1 - smooth(1.0, 1.25, e));
      col = mix3(col, SOIL, band * 0.55);
      // lawn floor: dark soil + thatch (dead grass), patchy
      const th = fbm(x * 0.35, z * 0.35, seed + 21, 3);
      let lawn = mix3(LAWN_DARK, LAWN_SOIL, patch);
      lawn = mix3(lawn, THATCH, smooth(0.5, 0.8, th) * 0.5);
      const f = mix3(lawn, col, dirt);
      const k = (py * TEX + px) * 4;
      img.data[k] = f[0];
      img.data[k + 1] = f[1];
      img.data[k + 2] = f[2];
      img.data[k + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const toPx = (x: number, z: number): [number, number] => [(x / o.size + 0.5) * TEX, (z / o.size + 0.5) * TEX];

  // cracks: thin branching dark lines on the dirt
  g.lineCap = 'round';
  for (const c of o.clearings) {
    const n = Math.round(c.r * 0.7);
    for (let i = 0; i < n; i++) {
      const a = R.next() * Math.PI * 2, rr = Math.sqrt(R.next()) * c.r * 0.8;
      let x = c.x + Math.cos(a) * rr, z = c.z + Math.sin(a) * rr;
      let dir = R.next() * Math.PI * 2;
      const segs = 4 + Math.floor(R.next() * 6);
      g.strokeStyle = `rgba(74,48,26,${0.25 + R.next() * 0.3})`;
      g.lineWidth = Math.max(1, (0.35 + R.next() * 0.5) / upp);
      g.beginPath();
      g.moveTo(...toPx(x, z));
      for (let s = 0; s < segs; s++) {
        dir += (R.next() - 0.5) * 1.1;
        const len = 1.6 + R.next() * 3.2;
        x += Math.cos(dir) * len;
        z += Math.sin(dir) * len;
        g.lineTo(...toPx(x, z));
        if (R.next() < 0.22) {
          // a little side crack
          const sx = x + Math.cos(dir + 1) * 2, sz = z + Math.sin(dir + 1) * 2;
          g.moveTo(...toPx(x, z));
          g.lineTo(...toPx(sx, sz));
          g.moveTo(...toPx(x, z));
        }
      }
      g.stroke();
    }
    // darker + paler speckles (tiny clods and pale grit)
    const dots = Math.round(c.r * c.r * 0.9);
    for (let i = 0; i < dots; i++) {
      const a = R.next() * Math.PI * 2, rr = Math.sqrt(R.next()) * c.r * 0.95;
      const [px, py] = toPx(c.x + Math.cos(a) * rr, c.z + Math.sin(a) * rr);
      g.fillStyle = R.next() < 0.5 ? 'rgba(90,60,34,0.35)' : 'rgba(255,240,205,0.35)';
      const s = Math.max(1, (0.3 + R.next() * 0.5) / upp);
      g.fillRect(px, py, s, s);
    }
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;

  // ----- 2. the ground plane (shader adds the tiled speckle detail) -----
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 1, metalness: 0 });
  const detail = getDetailTexture();
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uDetail = { value: detail };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vGround;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGround = (modelMatrix * vec4(position,1.0)).xz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uDetail;\nvarying vec2 vGround;')
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
         float dA = texture2D(uDetail, vGround / 24.0).r;
         float dB = texture2D(uDetail, vGround / 5.5 + 0.37).r;
         diffuseColor.rgb *= (0.62 + dA * 0.5) * (0.78 + dB * 0.44);`
      );
  };
  mat.customProgramCacheKey = () => 'flora-ground';
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(o.size, o.size), mat);
  plane.rotation.x = -Math.PI / 2;
  plane.receiveShadow = true;
  plane.name = 'ground-plane';
  root.add(plane);

  // ----- 3. sand grains + gravel (instanced) near the clearings -----
  const areaSum = o.clearings.reduce((s, c) => s + Math.PI * c.r * c.r, 0);
  const grainN = Math.min(2200, Math.round(areaSum * 0.2)); // (v0.68 integration: fewer, so the dirt reads calm from the game camera)
  const gravelN = Math.min(260, Math.round(areaSum * 0.022));
  const grainGeo = new THREE.OctahedronGeometry(1, 0); // 8 triangles
  const gravelGeo = new THREE.IcosahedronGeometry(1, 0); // 20 triangles
  const grains = new THREE.InstancedMesh(grainGeo, new THREE.MeshStandardMaterial({ roughness: 1 }), grainN);
  const gravel = new THREE.InstancedMesh(gravelGeo, new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }), gravelN);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), pv = new THREE.Vector3(), sv = new THREE.Vector3();
  const col = new THREE.Color();
  const sandTones = [0xdcc48c, 0xcfb27a, 0xe6d3a2, 0xc09a68, 0xd2b886];
  const gravelTones = [0xa39d92, PAL.pebbleWarm, 0xb5b0a6, 0x9a8c7c, 0xc9bfae];
  const scatterOn = (n: number, put: (x: number, z: number) => void) => {
    let placed = 0, tries = 0;
    while (placed < n && tries < n * 20) {
      tries++;
      const c = o.clearings[Math.floor(R.next() * o.clearings.length)];
      const a = R.next() * Math.PI * 2, rr = Math.sqrt(R.next()) * c.r * 1.1;
      // fewer grains toward the edge so the lawn doesn't get a sandy ring
      if (R.next() > 1 - Math.pow(rr / (c.r * 1.1), 3)) continue;
      put(c.x + Math.cos(a) * rr, c.z + Math.sin(a) * rr);
      placed++;
    }
    return placed;
  };
  let gi = 0;
  scatterOn(grainN, (x, z) => {
    const s = SIZE.sandGrain * (0.5 + R.next() * 1.2) + 0.06; // ~0.2-0.6 units
    e.set(R.next() * 3, R.next() * 3, R.next() * 3);
    q.setFromEuler(e);
    m4.compose(pv.set(x, s * 0.05, z), q, sv.set(s, s * 0.5, s));
    grains.setMatrixAt(gi, m4);
    grains.setColorAt(gi, col.setHex(R.pick(sandTones)).multiplyScalar(0.8 + R.next() * 0.22));
    gi++;
  });
  grains.count = gi;
  let vi = 0;
  scatterOn(gravelN, (x, z) => {
    const s = SIZE.gravel * (0.1 + R.next() * 0.28); // ~0.25-0.95 units
    e.set(R.next() * 0.5, R.next() * 6, R.next() * 0.5);
    q.setFromEuler(e);
    m4.compose(pv.set(x, s * 0.1, z), q, sv.set(s, s * 0.55, s * (0.7 + R.next() * 0.5)));
    gravel.setMatrixAt(vi, m4);
    gravel.setColorAt(vi, col.setHex(R.pick(gravelTones)).multiplyScalar(0.85 + R.next() * 0.3));
    vi++;
  });
  gravel.count = vi;
  for (const im of [grains, gravel]) {
    im.receiveShadow = true;
    im.castShadow = im === gravel;
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.computeBoundingSphere();
    root.add(im);
  }
  grains.name = 'sand-grains';
  gravel.name = 'gravel';
  root.userData = { size: o.size, half, tris: 2 + gi * 8 + vi * 20 };
  return root;
}
