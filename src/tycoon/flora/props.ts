// ============================================================================
// props.ts — 🍃 the small things on the ground, at REAL insect scale (v0.68).
//
// 1 game unit = 2 mm (see ../scale.ts). To an ant a pebble is a boulder, a fallen leaf is a big slab, and a
// clover is a small tree. Every maker below returns an object whose ORIGIN IS ON THE GROUND (y = 0) and that
// is SEEDED: the same seed always gives the same shape.
//
// Each prop is built from a few merged pieces (so it's 1-2 draw calls), is real 3D (no flat "cards"), and
// looks right from the high game camera AND from a low ant's-eye view.
//
// Rough triangle costs: pebble 320 | leaf ~230 | twig ~250 | clover plant ~190 | daisy ~270 | dandelion ~330
// | morning-glory ~330 | mushroom ~300 | seed ~120 | acorn cap ~170 | dewdrop ~150
//
//   scatter(...) drops lots of pebbles / leaves / twigs / clover with InstancedMesh (one draw call per kind).
// ============================================================================
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PAL, mat, rng } from '../kit';
import { SIZE } from '../scale';
import { clamp01, colorize, fbm, grounded, hash2, vnoise, merge, noise3, paint, plain, propMesh, smooth, stem, tube, vcMat, xf } from './shared';

const C = (hex: number) => new THREE.Color(hex);
const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------
// LEAF-LIKE GRIDS + their little textures (veins, clover chevron)
// ---------------------------------------------------------------------------
/**
 * A rows-by-columns sheet whose shape you describe: fn(u, v) -> [x, y, z].
 * u runs along the length (a list of values, base -> tip), v runs across (-1..1). UVs are
 * (across, along) so a texture painted "base at the bottom, tip at the top" fits.
 */
function leafGrid(across: number, us: number[], fn: (u: number, v: number) => [number, number, number]): THREE.BufferGeometry {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let j = 0; j < us.length; j++) {
    for (let i = 0; i <= across; i++) {
      const v = (i / across) * 2 - 1;
      pos.push(...fn(us[j], v));
      uv.push(i / across, clamp01(us[j]));
    }
  }
  const w = across + 1;
  for (let j = 0; j < us.length - 1; j++) {
    for (let i = 0; i < across; i++) {
      const a = j * w + i, b = a + 1, c = a + w, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Add a per-vertex colour to a geometry while KEEPING its uv + index (for textured leaves). */
function tint(geo: THREE.BufferGeometry, fn: (u: number, v: number, x: number, y: number, z: number) => THREE.Color) {
  const p = geo.getAttribute('position'), uv = geo.getAttribute('uv');
  const arr = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const c = fn(uv.getY(i), uv.getX(i) * 2 - 1, p.getX(i), p.getY(i), p.getZ(i));
    arr.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

/** Paint leaf veins: midrib + curving side veins. Base of the leaf is the BOTTOM of the canvas. */
function drawVeins(g: CanvasRenderingContext2D, W: number, H: number, col: string, lw: number) {
  g.strokeStyle = col;
  g.lineCap = 'round';
  g.lineWidth = lw * 1.7;
  g.beginPath();
  g.moveTo(W / 2, H);
  g.lineTo(W / 2, H * 0.04);
  g.stroke();
  g.lineWidth = lw;
  for (let k = 1; k <= 8; k++) {
    const y0 = H * (1 - k * 0.105);
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(W / 2, y0);
      g.quadraticCurveTo(W / 2 + s * W * 0.3, y0 - H * 0.04, W / 2 + s * W * (0.46 - k * 0.02), y0 - H * 0.16);
      g.stroke();
    }
  }
}

let leafMatCache: THREE.MeshStandardMaterial | null = null;
/** Shared material for fallen leaves: grey base (veins show lighter) x vertex colours, + a pale emissive vein map. */
function leafMaterial() {
  if (leafMatCache) return leafMatCache;
  const W = 128, H = 256;
  const a = document.createElement('canvas'), b = document.createElement('canvas');
  a.width = b.width = W;
  a.height = b.height = H;
  const ga = a.getContext('2d')!, gb = b.getContext('2d')!;
  ga.fillStyle = '#d4d4d4';
  ga.fillRect(0, 0, W, H);
  drawVeins(ga, W, H, '#ffffff', 3);
  gb.fillStyle = '#000';
  gb.fillRect(0, 0, W, H);
  drawVeins(gb, W, H, '#6a6a50', 3);
  const map = new THREE.CanvasTexture(a), emi = new THREE.CanvasTexture(b);
  map.colorSpace = emi.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = emi.anisotropy = 8;
  leafMatCache = new THREE.MeshStandardMaterial({ map, emissiveMap: emi, emissive: 0xffffff, emissiveIntensity: 0.55, vertexColors: true, side: THREE.DoubleSide, roughness: 0.78 });
  return leafMatCache;
}

let cloverMatCache: THREE.MeshStandardMaterial | null = null;
/** Shared material for clover leaflets: the pale chevron is an emissive map so it reads whitish-green. */
function cloverMaterial() {
  if (cloverMatCache) return cloverMatCache;
  const N = 64;
  const a = document.createElement('canvas'), b = document.createElement('canvas');
  a.width = b.width = N;
  a.height = b.height = N;
  const ga = a.getContext('2d')!, gb = b.getContext('2d')!;
  ga.fillStyle = '#e0e0e0';
  ga.fillRect(0, 0, N, N);
  gb.fillStyle = '#000';
  gb.fillRect(0, 0, N, N);
  // the chevron: a "V" whose point faces the base of the leaflet (the bottom of the canvas)
  for (const [g, col, w] of [[ga, '#ffffff', 9], [gb, '#9fb898', 9]] as const) {
    g.strokeStyle = col;
    g.lineWidth = w;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(N * 0.12, N * 0.4);
    g.lineTo(N * 0.5, N * 0.64);
    g.lineTo(N * 0.88, N * 0.4);
    g.stroke();
  }
  const map = new THREE.CanvasTexture(a), emi = new THREE.CanvasTexture(b);
  map.colorSpace = emi.colorSpace = THREE.SRGBColorSpace;
  cloverMatCache = new THREE.MeshStandardMaterial({ map, emissiveMap: emi, emissive: 0xffffff, emissiveIntensity: 0.6, vertexColors: true, side: THREE.DoubleSide, roughness: 0.65 });
  return cloverMatCache;
}

// ---------------------------------------------------------------------------
// PEBBLE
// ---------------------------------------------------------------------------
const PEBBLE_TONES = [PAL.pebble, PAL.pebbleWarm, 0x8b929a, 0xcfc4b0, 0x8f7060, 0xa8a49a];

/** A rounded, lumpy stone of the given longest size (1 = unit size, scale it later). */
function pebbleGeo(size: number, seed: number): THREE.BufferGeometry {
  const R = rng(seed * 7919 + 3);
  const ico = new THREE.IcosahedronGeometry(0.5, 2);
  ico.deleteAttribute('normal');
  ico.deleteAttribute('uv');
  const g = mergeVertices(ico, 1e-4); // weld, so the stone shades smoothly
  const sy = 0.5 + R.next() * 0.25, sz = 0.72 + R.next() * 0.3;
  const p = g.getAttribute('position');
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const n = noise3(v.x * 1.7, v.y * 1.7, v.z * 1.7, seed) * 0.28 + noise3(v.x * 4, v.y * 4, v.z * 4, seed + 4) * 0.07;
    const r = 0.5 * (1 + n);
    let y = v.y * r * sy * 2 * 0.5;
    if (y < -0.2 * sy) y = -0.2 * sy + (y + 0.2 * sy) * 0.25; // flatten the underside so it sits
    p.setXYZ(i, v.x * r, y, v.z * r * sz);
  }
  g.computeVertexNormals();
  const tone = PEBBLE_TONES[seed % PEBBLE_TONES.length];
  const base = C(tone);
  const out = colorize(g, (x, y, z) => {
    const k = 0.84 + noise3(x * 9, y * 9, z * 9, seed + 2) * 0.35;
    const vein = Math.abs(noise3(x * 3 + y, z * 3, y * 2, seed + 9)) < 0.035 ? 1.28 : 1; // pale quartz streak
    const top = 0.92 + clamp01(y * 3) * 0.14;
    return base.clone().multiplyScalar(k * vein * top);
  });
  // UVs for the granite-speckle texture (a cheap box-ish projection; speckles hide any stretching)
  const op = out.getAttribute('position');
  const uvs = new Float32Array(op.count * 2);
  const on = out.getAttribute('normal');
  for (let i = 0; i < op.count; i++) {
    const ax = Math.abs(on.getX(i)), ay = Math.abs(on.getY(i)), az = Math.abs(on.getZ(i));
    const x = op.getX(i), y = op.getY(i), z = op.getZ(i);
    // project along whichever axis the surface faces most (no stretching; the speckles hide the seams)
    const [u, v] = ay >= ax && ay >= az ? [x, z] : ax >= az ? [z, y] : [x, y];
    uvs[i * 2] = u * 3.2;
    uvs[i * 2 + 1] = v * 3.2;
  }
  out.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  xf(out, [0, 0, 0], [0, R.next() * TAU, 0], size);
  grounded(out, -size * 0.01);
  return out;
}

let pebbleMatCache: THREE.MeshStandardMaterial | null = null;
/** Stone material: vertex colour x a tiny seamless speckle map (dark flecks, pale grains). */
function pebbleMaterial() {
  if (pebbleMatCache) return pebbleMatCache;
  const N = 128;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d')!;
  const img = g.createImageData(N, N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const blob = vnoise((x / N) * 5, (y / N) * 5, 2, 5);
      let v = 0.82 + (blob - 0.5) * 0.3;
      const h = hash2(x, y, 4);
      if (h > 0.93) v += 0.22;
      else if (h < 0.07) v -= 0.4;
      v = Math.min(1, Math.max(0, v));
      const k = (y * N + x) * 4;
      img.data[k] = img.data[k + 1] = img.data[k + 2] = v * 255;
      img.data[k + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const map = new THREE.CanvasTexture(c);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  pebbleMatCache = new THREE.MeshStandardMaterial({ map, vertexColors: true, roughness: 0.9 });
  return pebbleMatCache;
}

/** A rounded irregular stone, `size` = its longest side. A few colour variants by seed. Origin on the ground. */
export function makePebble(size: number, seed = 1): THREE.Mesh {
  const m = propMesh(pebbleGeo(size, seed), pebbleMaterial());
  m.name = 'pebble';
  return m;
}

// ---------------------------------------------------------------------------
// FALLEN LEAF
// ---------------------------------------------------------------------------
export type LeafKind = 'green' | 'autumn' | 'brown' | 'red';
const LEAF_KINDS: LeafKind[] = ['green', 'autumn', 'brown', 'red'];
const LEAF_ROWS = [-0.14, 0, 0.07, 0.15, 0.24, 0.33, 0.42, 0.51, 0.6, 0.69, 0.78, 0.87, 0.94, 1];

/** A curled leaf lying on the ground, `length` long (unit size when length = 1). Stalk included. */
function leafGeo(kind: LeafKind, length: number, seed: number): THREE.BufferGeometry {
  const R = rng(seed * 131 + LEAF_KINDS.indexOf(kind) * 17 + 1);
  const W = (kind === 'red' ? 0.36 : kind === 'autumn' ? 0.33 : 0.29) * (0.92 + R.next() * 0.16);
  const cup = { green: 0.2, autumn: 0.3, brown: 0.62, red: 0.28 }[kind];
  const tipUp = { green: 0.05, autumn: 0.1, brown: 0.34, red: 0.12 }[kind];
  const twist = (R.next() - 0.5) * (kind === 'brown' ? 1.1 : 0.5);
  const ph = R.next() * 10;
  const hw = (u: number) => {
    if (u <= 0) return 0.018;
    const base = Math.pow(Math.max(0, Math.sin(Math.PI * Math.pow(u, 0.72))), 0.85);
    // brown leaves are ragged and dried; red ones are a bit lobed
    const wob = kind === 'brown' ? 0.12 * Math.sin(u * 23 + ph) : kind === 'red' ? 0.1 * Math.sin(u * 15 + ph) : 0.04 * Math.sin(u * 17 + ph);
    return Math.max(0.018, W * base * (1 + wob));
  };
  const g = leafGrid(6, LEAF_ROWS, (u, v) => {
    const w = hw(u);
    let x = u, z = v * w, y = 0;
    if (u > 0) {
      y += cup * v * v * w; // edges curl up
      y += tipUp * Math.pow(u, 3); // tip lifts
      y += 0.5 * 0.1 * Math.pow(u - 0.45, 2); // gentle arch end to end
      y += 0.03 * Math.max(0, 1 - Math.abs(v) * 3); // raised midrib
      const a = twist * u * u; // twist the length a little
      const yy = y * Math.cos(a) - z * Math.sin(a), zz = y * Math.sin(a) + z * Math.cos(a);
      y = yy;
      z = zz;
    } else {
      y = 0.012;
    }
    return [(x - 0.5) * 1, y, z];
  });
  const cols = {
    green: [C(0x3f8a2e), C(0x6fb844), C(0x9bd36a)],
    autumn: [C(0xc95f1c), C(0xe69a2e), C(0xf0c040)],
    brown: [C(0x6b4423), C(0x9a6a3a), C(0xb98a58)],
    red: [C(0x8a2a1f), C(0xc2452d), C(0xe0693c)],
  }[kind];
  const stalk = C(0x7a5a2c);
  tint(g, (u, v, x, _y, z) => {
    if (u <= 0.0) return stalk.clone();
    const blot = fbm(x * 9 + ph, z * 9, seed, 3);
    const c = cols[0].clone().lerp(cols[1], smooth(0.2, 0.8, blot)).lerp(cols[2], smooth(0.55, 1, Math.abs(v)) * 0.5 * blot + smooth(0.8, 1, u) * 0.2);
    if (kind === 'autumn') c.lerp(C(0x8aa63a), smooth(0.45, 0.7, fbm(x * 5, z * 5 + 3, seed + 5, 2)) * (1 - Math.abs(v)) * 0.7);
    if (kind === 'brown') c.multiplyScalar(0.8 + blot * 0.4);
    return c;
  });
  xf(g, [0, 0, 0], [0, R.next() * TAU, 0], length);
  grounded(g, 0.06 * length * 0.2);
  return g;
}

/** A curled 3D leaf with a midrib + veins; both sides look right. Origin on the ground, `length` long. */
export function makeFallenLeaf(kind: LeafKind, length: number, seed = 1): THREE.Object3D {
  const m = propMesh(leafGeo(kind, length, seed), leafMaterial());
  m.name = `leaf-${kind}`;
  return m;
}

// ---------------------------------------------------------------------------
// TWIG
// ---------------------------------------------------------------------------
function twigGeo(length: number, seed: number): THREE.BufferGeometry {
  const R = rng(seed * 313 + 9);
  const r0 = length * 0.038;
  const dark = C(PAL.woodDark), mid = C(PAL.wood), pale = C(0xc9a878), lichen = C(0x9aa58a);
  const parts: THREE.BufferGeometry[] = [];
  const bark = (g: THREE.BufferGeometry, tip: number) =>
    colorize(g, (x, y, z) => {
      const stripe = fbm(x * 0.5 + seed, (y + z) * 2.6, seed, 3);
      const c = dark.clone().lerp(mid, smooth(0.25, 0.8, stripe));
      if (fbm(x * 0.15, z * 0.3 + 4, seed + 1, 2) > 0.7) c.lerp(lichen, 0.4); // a patch of grey lichen
      if (Math.abs(x) > tip) c.lerp(pale, 0.85); // the freshly broken ends are pale wood
      return c;
    });
  // trunk: lies along x, a little crooked, arching up a touch so it rests on its middle
  const pts: THREE.Vector3[] = [];
  const n = 5;
  const bendY = (R.next() - 0.5) * 0.06, bendZ = (R.next() - 0.5) * 0.14;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    pts.push(new THREE.Vector3((t - 0.5) * length, r0 + Math.sin(t * Math.PI) * length * 0.02 + bendY * length * t, Math.sin(t * Math.PI * 1.3) * bendZ * length));
  }
  parts.push(bark(tube(pts, (t) => r0 * (1.05 - t * 0.5) * (1 + 0.1 * Math.sin(t * 17 + seed)), 6), length * 0.495));
  // side branches (and little knobs where they join)
  const nb = 1 + Math.floor(R.next() * 2.4);
  for (let b = 0; b < nb; b++) {
    const t = 0.28 + R.next() * 0.45;
    const k = Math.min(n - 2, Math.floor(t * (n - 1)));
    const a = pts[k], c = pts[k + 1];
    const f = t * (n - 1) - k;
    const o = a.clone().lerp(c, f);
    const side = R.next() < 0.5 ? -1 : 1;
    const bl = length * (0.22 + R.next() * 0.2);
    const ang = 0.45 + R.next() * 0.5;
    const e = o.clone().add(new THREE.Vector3(Math.cos(ang) * bl * 0.8, Math.sin(0.5 + R.next() * 0.5) * bl * 0.45, side * Math.sin(ang) * bl * 0.8));
    const br = r0 * (0.45 - b * 0.05);
    parts.push(bark(stem(o, e, br, br * 0.4, side * bl * 0.06, 5), 99));
    parts.push(bark(xf(new THREE.IcosahedronGeometry(r0 * 0.75, 0), [o.x, o.y, o.z]), 99));
  }
  const g = merge(parts);
  xf(g, [0, 0, 0], [0, R.next() * TAU, 0]);
  return g;
}

/** A twig with bark and a side branch or two, lying on the ground. */
export function makeTwig(length: number, seed = 1): THREE.Object3D {
  const m = propMesh(twigGeo(length, seed), vcMat({ rough: 0.9 }));
  m.name = 'twig';
  return m;
}

// ---------------------------------------------------------------------------
// CLOVER (three-leaflet plant on a stem: a small tree to an ant)
// ---------------------------------------------------------------------------
/** The two geometries of one clover plant: a green stem (vertex colours) and the 3 textured leaflets. */
export function cloverGeos(seed: number): { stem: THREE.BufferGeometry; leaves: THREE.BufferGeometry } {
  const R = rng(seed * 4231 + 7);
  const h = 22 + R.next() * 12;
  const lean = 0.12 + R.next() * 0.25;
  const dir = R.next() * TAU;
  const top = new THREE.Vector3(Math.cos(dir) * Math.sin(lean) * h, Math.cos(lean) * h, Math.sin(dir) * Math.sin(lean) * h);
  const sc = C(0x66b04a), sc2 = C(0x9ccf72);
  const stemG = colorize(stem(new THREE.Vector3(0, 0, 0), top, 0.55, 0.32, h * 0.04, 5), (_x, y) => sc.clone().lerp(sc2, clamp01(y / h)));
  const L = SIZE.cloverLeaflet * (0.95 + R.next() * 0.15);
  const rows = [0, 0.1, 0.22, 0.36, 0.5, 0.64, 0.78, 0.9, 1];
  const parts: THREE.BufferGeometry[] = [];
  const g1 = C(0x3f9a35), g2 = C(0x6cc04a);
  for (let k = 0; k < 3; k++) {
    const leaflet = leafGrid(4, rows, (u, v) => {
      // an obovate (egg-wide-near-the-tip) blade with a small notch at the very tip
      const w = L * 0.46 * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.85) * 0.93 + 0.08), 0.9);
      const notch = u > 0.85 ? L * 0.1 * (1 - Math.abs(v) * 1.6 > 0 ? 1 - Math.abs(v) * 1.6 : 0) * smooth(0.85, 1, u) : 0;
      const x = u * L - notch;
      const z = v * w;
      const y = Math.abs(v) * w * 0.28 - Math.pow(u, 2) * L * 0.12; // folded up along the midrib, tip droops
      return [x, y, z];
    });
    tint(leaflet, (u, v) => g1.clone().lerp(g2, clamp01(u * 0.7 + Math.abs(v) * 0.3)));
    const yaw = (k / 3) * TAU + R.next() * 0.4;
    const droop = -0.35 + R.next() * 0.45;
    leaflet.applyMatrix4(
      new THREE.Matrix4()
        .makeTranslation(top.x, top.y, top.z)
        .multiply(new THREE.Matrix4().makeRotationY(yaw))
        .multiply(new THREE.Matrix4().makeRotationZ(droop))
    );
    parts.push(leaflet);
  }
  return { stem: stemG, leaves: merge(parts) };
}

/** A clover plant: stem + 3 leaflets (each with the pale chevron). */
export function makeClover(seed = 1): THREE.Object3D {
  const { stem: s, leaves } = cloverGeos(seed);
  const g = new THREE.Group();
  g.name = 'clover';
  g.add(propMesh(s, vcMat()), propMesh(leaves, cloverMaterial()));
  return g;
}

// ---------------------------------------------------------------------------
// FLOWERS (stem + petals + a glowing nectar centre)
// ---------------------------------------------------------------------------
export type FlowerKind = 'daisy' | 'clover-flower' | 'dandelion' | 'morning-glory';

/** One petal: a folded 4-triangle diamond lying along +x, base at the origin. */
function petalGeo(len: number, wid: number, fold: number): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const v = [0, 0, 0, len * 0.5, 0, -wid, len * 0.5, -fold, 0, len * 0.5, 0, wid, len, 0.1 * fold, 0];
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.setIndex([0, 2, 1, 0, 3, 2, 1, 2, 4, 2, 3, 4]);
  g.computeVertexNormals();
  return g;
}

/** Petals around a centre: `n` of them, each tilted `tilt` radians up from flat. */
function petalRing(n: number, len: number, wid: number, tilt: number, hex: number, y: number, offset = 0, fold = 0.25, jitter = 0.06): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const col = C(hex);
  for (let i = 0; i < n; i++) {
    const p = paint(petalGeo(len, wid, fold * wid), hex, jitter);
    // darker toward the base, lighter at the tip (gives the petals depth)
    const pa = p.getAttribute('position'), ca = p.getAttribute('color');
    for (let k = 0; k < pa.count; k++) {
      const t = clamp01(pa.getX(k) / len);
      const s = 0.72 + t * 0.34;
      ca.setXYZ(k, col.r * s, col.g * s, col.b * s);
    }
    xf(p, [0, y, 0], [0, 0, tilt], 1);
    xf(p, [0, 0, 0], [0, offset + (i / n) * TAU, 0]);
    out.push(p);
  }
  return out;
}

/** The pieces of a flower: `body` (vertex colours) and `nectar` (a small glowing centre to render emissive). */
export function flowerGeos(kind: FlowerKind, seed = 1): { body: THREE.BufferGeometry; nectar: THREE.BufferGeometry } {
  const R = rng(seed * 2711 + kind.length * 31);
  const parts: THREE.BufferGeometry[] = [];
  const green = PAL.leafGreen, greenDark = 0x3f8a2e;
  let nectar: THREE.BufferGeometry;
  const lean = (R.next() - 0.5) * 0.35, dir = R.next() * TAU;

  if (kind === 'daisy') {
    const h = 44 + R.next() * 10;
    const top = new THREE.Vector3(Math.cos(dir) * h * lean, h, Math.sin(dir) * h * lean);
    parts.push(paint(stem(new THREE.Vector3(), top, 0.5, 0.38, 2, 5), 0x6cc04a));
    // head: petals face "out" from the stem top, tilted a little away from the lean
    const head: THREE.BufferGeometry[] = [];
    head.push(...petalRing(16, 7.5, 1.35, 0.1, 0xffffff, 0.2, 0, 0.25, 0.03));
    head.push(...petalRing(14, 6.4, 1.3, 0.28, 0xf6f6f2, 0.45, 0.2, 0.25, 0.03));
    head.push(paint(xf(new THREE.SphereGeometry(3, 12, 6, 0, TAU, 0, Math.PI / 2), [0, 0.4, 0], [0, 0, 0], [1, 0.55, 1]), 0xf2b01e, 0.05));
    head.push(paint(xf(new THREE.ConeGeometry(1.8, 2.2, 8), [0, -0.9, 0], [Math.PI, 0, 0]), greenDark)); // green cup under the petals
    const hm = new THREE.Matrix4().compose(top, new THREE.Quaternion().setFromEuler(new THREE.Euler(lean * 1.6 * Math.sin(dir), 0, -lean * 1.6 * Math.cos(dir))), new THREE.Vector3(1, 1, 1));
    head.forEach((x) => x.applyMatrix4(hm));
    parts.push(...head);
    nectar = xf(new THREE.SphereGeometry(1.7, 10, 6, 0, TAU, 0, Math.PI / 2), [0, 1.6, 0], [0, 0, 0], [1, 0.6, 1]);
    nectar.applyMatrix4(hm);
  } else if (kind === 'clover-flower') {
    const h = 30 + R.next() * 8;
    const top = new THREE.Vector3(Math.cos(dir) * h * lean * 0.8, h, Math.sin(dir) * h * lean * 0.8);
    parts.push(paint(stem(new THREE.Vector3(), top, 0.45, 0.35, 1.5, 5), 0x6cc04a));
    // the ball of tiny florets: a bumpy sphere, white fading to pink at the base
    const ball = new THREE.IcosahedronGeometry(3.6, 2);
    ball.deleteAttribute('normal');
    ball.deleteAttribute('uv');
    const bg = mergeVertices(ball, 1e-4);
    const bp = bg.getAttribute('position');
    for (let i = 0; i < bp.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(bp, i);
      const k = 1 + noise3(v.x * 5, v.y * 5, v.z * 5, seed) * 0.2;
      bp.setXYZ(i, v.x * k, v.y * k * 0.85, v.z * k);
    }
    bg.computeVertexNormals();
    const white = C(0xfdfbf2), pink = C(0xf3c4d4), tan = C(0xe8c98a);
    const ballC = colorize(bg, (x, y, z) => {
      const t = clamp01((3.6 - y) / 7.2);
      const c = white.clone().lerp(pink, smooth(0.45, 1, t) * 0.8);
      c.lerp(tan, smooth(0.6, 1, fbm(x * 1.4, z * 1.4 + y, seed, 2)) * 0.25 * (1 - t));
      return c.multiplyScalar(0.92 + 0.12 * noise3(x * 6, y * 6, z * 6, seed));
    });
    xf(ballC, [top.x, top.y + 2.2, top.z]);
    parts.push(ballC);
    parts.push(paint(xf(new THREE.ConeGeometry(1.5, 2.2, 6), [top.x, top.y - 0.2, top.z], [Math.PI, 0, 0]), greenDark));
    nectar = xf(new THREE.SphereGeometry(0.9, 8, 6), [top.x, top.y + 5.2, top.z], [0, 0, 0], [1, 0.6, 1]);
  } else if (kind === 'dandelion') {
    const h = 48 + R.next() * 14;
    const top = new THREE.Vector3(Math.cos(dir) * h * lean * 0.7, h, Math.sin(dir) * h * lean * 0.7);
    parts.push(paint(stem(new THREE.Vector3(), top, 0.62, 0.5, 2.5, 5), 0x78b85a));
    const head: THREE.BufferGeometry[] = [];
    head.push(...petalRing(20, 5.2, 0.75, 0.55, 0xf9d21a, 0.4, 0, 0.2, 0.05));
    head.push(...petalRing(16, 4.2, 0.7, 0.95, 0xf5c312, 0.9, 0.15, 0.2, 0.05));
    head.push(...petalRing(10, 3, 0.6, 1.25, 0xf9b514, 1.4, 0.3, 0.2, 0.05));
    head.push(paint(xf(new THREE.ConeGeometry(2.2, 3, 8), [0, -0.9, 0], [Math.PI, 0, 0]), greenDark));
    const hm = new THREE.Matrix4().makeTranslation(top.x, top.y, top.z);
    head.forEach((x) => x.applyMatrix4(hm));
    parts.push(...head);
    nectar = xf(new THREE.SphereGeometry(1.6, 10, 6, 0, TAU, 0, Math.PI / 2), [top.x, top.y + 1.5, top.z], [0, 0, 0], [1, 0.55, 1]);
  } else {
    // morning-glory: a big funnel on a curling vine, with a heart-shaped leaf
    const h = 56;
    const pts = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(4, h * 0.3, 3), new THREE.Vector3(-3, h * 0.6, 6), new THREE.Vector3(-1, h * 0.85, 2), new THREE.Vector3(0, h, 0)];
    parts.push(paint(tube(pts, (t) => 0.7 - 0.25 * t, 5), 0x5a9c3c));
    const top = new THREE.Vector3(0, h, 0);
    const prof: THREE.Vector2[] = [[0.5, 0], [0.9, 3], [1.9, 7], [4, 11.5], [7.5, 15.5], [11.5, 18.5], [13.5, 19.5]].map(([r, y]) => new THREE.Vector2(r, y));
    const fun = new THREE.LatheGeometry(prof, 20);
    const fp = fun.getAttribute('position');
    for (let i = 0; i < fp.count; i++) {
      const x = fp.getX(i), z = fp.getZ(i), y = fp.getY(i);
      const a = Math.atan2(z, x);
      const sc = 1 + 0.06 * Math.cos(a * 5) * smooth(10, 19.5, y); // 5 shallow scallops at the rim
      fp.setX(i, x * sc);
      fp.setZ(i, z * sc);
    }
    fun.computeVertexNormals();
    const outer = C(0x5a6df0), mid = C(0xb26be0), white = C(0xffffff);
    const funC = colorize(fun, (x, y, z) => {
      const a = Math.atan2(z, x);
      const star = Math.pow(Math.max(0, Math.cos(a * 5 / 1)), 6); // 5 pale stripes up the funnel
      const t = clamp01(y / 19.5);
      const c = white.clone().lerp(outer, smooth(0.15, 0.6, t)).lerp(mid, smooth(0.5, 1, t) * 0.4);
      c.lerp(white, star * 0.55 * smooth(0.2, 0.9, t));
      return c;
    });
    // the funnel opens upward; tip it a little toward the camera-ish
    xf(funC, [top.x, top.y - 4, top.z], [0.18, 0, 0.1]);
    parts.push(funC);
    // heart-shaped leaf on a short stalk
    const leaf = leafGrid(4, [0, 0.1, 0.25, 0.45, 0.65, 0.85, 1], (u, v) => {
      const w = 9 * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.6)), 0.8);
      return [u * 15, 3 * v * v * w / 9 * 2 - u * u * 3, v * w];
    });
    parts.push(xf(colorize(leaf, (_x, _y, z) => C(0x4f9a35).lerp(C(0x7acb52), clamp01(Math.abs(z) / 9))), [3, h * 0.45, 3], [0, 0.6, 0.3]));
    nectar = xf(new THREE.SphereGeometry(1.5, 8, 6), [top.x, top.y - 2.6, top.z], [0.18, 0, 0.1], [1, 0.7, 1]);
    nectar = xf(nectar, [0, 0, 0]);
  }
  return { body: merge(parts), nectar: plain(nectar) };
}

/** A flower with a visible glowing nectar centre. Origin on the ground. */
export function makeFlower(kind: FlowerKind, seed = 1): THREE.Object3D {
  const { body, nectar } = flowerGeos(kind, seed);
  const g = new THREE.Group();
  g.name = `flower-${kind}`;
  g.add(propMesh(body, vcMat({ side: THREE.DoubleSide, rough: 0.7 })));
  g.add(propMesh(nectar, nectarMaterial(), false));
  return g;
}

/** Warm glowing nectar (self-lit, so it reads from far away). */
export function nectarMaterial() {
  return mat(PAL.nectar, { emissive: 0xff8a10, rough: 0.35 });
}

// ---------------------------------------------------------------------------
// MUSHROOM
// ---------------------------------------------------------------------------
function mushroomParts(glow: boolean, seed: number): { body: THREE.BufferGeometry; cap: THREE.BufferGeometry } {
  const R = rng(seed * 997 + 13);
  const H = 12 + R.next() * 5, capR = 6.5 + R.next() * 2.5, capH = capR * (0.62 + R.next() * 0.25);
  const lean = (R.next() - 0.5) * 0.18;
  // stem: slightly swollen at the bottom, a skirt ring near the top
  const sp: THREE.Vector2[] = [[0.1, 0], [3.2, 0.1], [3.0, 1.8], [2.2, H * 0.45], [2.0, H * 0.8], [2.4, H]].map(([r, y]) => new THREE.Vector2(r, y));
  const stemG = paint(new THREE.LatheGeometry(sp, 12), glow ? 0xdfffd0 : 0xf3ead8, 0.04);
  // gills: a dark-ish cone under the cap
  const gills = paint(xf(new THREE.ConeGeometry(capR * 0.97, capH * 0.35, 18, 1, true), [0, H - capH * 0.12, 0], [Math.PI, 0, 0]), glow ? 0xb6f58a : 0xd8b890, 0.05);
  // cap: a smooth dome (profile -> lathe)
  const prof: THREE.Vector2[] = [];
  for (let i = 0; i <= 7; i++) {
    const a = (i / 7) * (Math.PI / 2);
    prof.push(new THREE.Vector2(Math.max(0.01, Math.cos(a) * capR * (1 + 0.04 * Math.sin(a * 3))), Math.sin(a) * capH));
  }
  prof.reverse(); // top -> rim
  const capBase = C(glow ? PAL.fungusGlow : 0xe23b2e), capEdge = C(glow ? 0x5fe0a0 : 0xb82c22);
  let capG = colorize(new THREE.LatheGeometry(prof.reverse(), 18), (x, y, z) => capBase.clone().lerp(capEdge, smooth(0.5, 1, Math.hypot(x, z) / capR) * 0.8).multiplyScalar(0.94 + 0.1 * noise3(x, y, z, seed)));
  xf(capG, [0, H - capH * 0.1, 0]);
  const spots: THREE.BufferGeometry[] = [];
  const nsp = 5 + Math.floor(R.next() * 5);
  for (let i = 0; i < nsp; i++) {
    // spots sit on the dome surface
    const a = R.next() * TAU, e = 0.15 + R.next() * 1.0;
    const x = Math.cos(a) * Math.cos(e) * capR * 0.93, z = Math.sin(a) * Math.cos(e) * capR * 0.93, y = Math.sin(e) * capH * 0.97 + H - capH * 0.1;
    const s = 0.45 + R.next() * 0.55;
    const sp2 = paint(xf(new THREE.SphereGeometry(s, 7, 4), [x, y, z], [0, 0, 0], [1, 0.35, 1]), glow ? 0xf4ffd8 : 0xfff8ec);
    spots.push(xf(sp2, [0, 0, 0], [0, 0, 0]));
  }
  capG = merge([capG, ...spots]);
  const bodyG = merge([stemG, gills]);
  for (const g of [bodyG, capG]) xf(g, [0, 0, 0], [lean, 0, -lean * 0.6]);
  return { body: bodyG, cap: capG };
}

/** A mushroom; `glow` gives it a soft self-lit cap (no real lights). Origin on the ground. */
export function makeMushroom(glow = false, seed = 1): THREE.Object3D {
  const { body, cap } = mushroomParts(glow, seed);
  const g = new THREE.Group();
  g.name = glow ? 'mushroom-glow' : 'mushroom';
  g.add(propMesh(body, vcMat({ side: THREE.DoubleSide })));
  g.add(propMesh(cap, glow ? vcMat({ emissive: PAL.fungusGlow, emissiveIntensity: 0.55, rough: 0.5 }) : vcMat({ rough: 0.45 })));
  return g;
}

// ---------------------------------------------------------------------------
// DANDELION SEED, ACORN CAP, DEWDROP
// ---------------------------------------------------------------------------
/** A dandelion seed: a slim brown seed, a thin beak, and a fluffy umbrella of bristles (pappus). ~6 units tall. */
export function makeDandelionSeed(seed = 1): THREE.Object3D {
  const R = rng(seed * 811 + 5);
  const s = SIZE.dandelionSeed / 6;
  const parts: THREE.BufferGeometry[] = [];
  // seed body (a ridged spindle) + beak
  parts.push(colorize(xf(new THREE.CylinderGeometry(0.28, 0.08, 1.8, 6, 1), [0, 0.9, 0]), (_x, y) => C(0x8a6a3c).lerp(C(0xc9a46a), clamp01(y / 1.8))));
  parts.push(paint(xf(new THREE.ConeGeometry(0.28, 0.5, 6), [0, 0.1, 0], [Math.PI, 0, 0]), 0x6e5030));
  parts.push(paint(tube([new THREE.Vector3(0, 1.8, 0), new THREE.Vector3(0.03, 3, 0.02), new THREE.Vector3(0, 4.1, 0)], () => 0.06, 4), 0xe9dcc0));
  // pappus: bristles fan out of the top, each a skinny triangle with a feathery tip
  const n = 26;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + R.next() * 0.1;
    const len = 2.6 + R.next() * 0.5;
    const up = 0.35 + R.next() * 0.2; // umbrella: bristles lean out + up
    const bristle = new THREE.BufferGeometry();
    bristle.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.05, 0, 0, 0.05, len * 0.98, len * up, 0], 3));
    bristle.setIndex([0, 1, 2]);
    bristle.computeVertexNormals();
    const b = paint(bristle, 0xffffff);
    // soft feathery fuzz at the tip
    const fuzz = paint(xf(new THREE.IcosahedronGeometry(0.28, 0), [len, len * up, 0], [0, 0, 0], [1.2, 0.8, 1.2]), 0xfffff4);
    xf(b, [0, 0, 0], [0, a, 0]);
    xf(fuzz, [0, 0, 0], [0, a, 0]);
    parts.push(xf(b, [0, 4.1, 0]), xf(fuzz, [0, 4.1, 0]));
  }
  parts.push(paint(xf(new THREE.SphereGeometry(0.22, 6, 4), [0, 4.1, 0]), 0xcdbf9a));
  const g = merge(parts);
  g.scale(s, s, s);
  const m = propMesh(g, vcMat({ side: THREE.DoubleSide, rough: 0.9 }));
  m.name = 'dandelion-seed';
  const o = new THREE.Group();
  o.add(m);
  return o;
}

/** An acorn cap: a scaly brown bowl (opening up) with a rim and a little stem nub. ~9 units across. */
export function makeAcornCap(seed = 1): THREE.Object3D {
  const R = rng(seed * 577 + 3);
  const D = SIZE.acornCap * (0.92 + R.next() * 0.16); // diameter
  const r = D / 2;
  const outer = [[0.15, 0], [r * 0.45, 0.05], [r * 0.78, r * 0.2], [r * 0.95, r * 0.5], [r * 1.0, r * 0.78], [r * 1.0, r * 0.88]];
  const inner = [[r * 0.88, r * 0.9], [r * 0.86, r * 0.7], [r * 0.7, r * 0.38], [r * 0.4, r * 0.24], [0.1, r * 0.2]];
  const pts = [...outer, ...inner].map(([x, y]) => new THREE.Vector2(x, y));
  const g = new THREE.LatheGeometry(pts, 14);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    // scale pattern: little ridged bands on the outside
    const y = p.getY(i), x = p.getX(i), z = p.getZ(i);
    const rr = Math.hypot(x, z);
    if (rr > r * 0.45 && y < r * 0.8) {
      const band = 1 + 0.045 * Math.sin(y * (5 / r) * 3.1 + Math.atan2(z, x) * 7);
      p.setX(i, x * band);
      p.setZ(i, z * band);
    }
  }
  g.computeVertexNormals();
  const dark = C(0x6e4a28), mid = C(0x9a6a3a), lip = C(0xb88a52), inn = C(0xcfa468);
  const body = colorize(g, (x, y, z) => {
    const rr = Math.hypot(x, z);
    const isInner = y > r * 0.18 && rr < r * 0.9 && y < r * 0.76 && rr < r * (0.35 + y * 0.7 / r * 0.55) - 0.01 ? true : false;
    if (y > r * 0.84 || isInner) return lip.clone().lerp(inn, 0.4);
    return dark.clone().lerp(mid, smooth(0, r, y) * 0.8 + 0.12 * Math.sin(Math.atan2(z, x) * 7 + y));
  });
  const nub = paint(xf(new THREE.CylinderGeometry(0.6, 0.9, 1.6, 6), [0, -0.3, 0]), 0x6e4a28);
  const m = propMesh(merge([body, nub]), vcMat({ side: THREE.DoubleSide, rough: 0.8 }));
  m.name = 'acorn-cap';
  return grounded2(m);
}

/** Lift an object so its lowest point is at y = 0. */
function grounded2(o: THREE.Mesh): THREE.Mesh {
  o.geometry.computeBoundingBox();
  o.geometry.translate(0, -o.geometry.boundingBox!.min.y, 0);
  return o;
}

let dewMat: THREE.MeshStandardMaterial | null = null;
let dewGeo: THREE.BufferGeometry | null = null;
/** A clear, shiny water bead (a squashed dome with a bright highlight). `size` = its diameter. */
export function makeDewdrop(size: number): THREE.Mesh {
  dewMat ??= new THREE.MeshStandardMaterial({ color: 0xcfeeff, transparent: true, opacity: 0.55, roughness: 0.04, metalness: 0.15, emissive: 0x2a5878, emissiveIntensity: 0.35, depthWrite: false });
  dewGeo ??= (() => {
    const g = new THREE.SphereGeometry(0.5, 20, 12, 0, TAU, 0, Math.PI * 0.62);
    g.scale(1, 0.85, 1);
    return g;
  })();
  const m = new THREE.Mesh(dewGeo, dewMat);
  m.scale.setScalar(size);
  m.name = 'dewdrop';
  m.castShadow = false;
  m.receiveShadow = false;
  // the bright window-glint + a soft blue bounce light inside, so it reads as water from any angle
  const glint = new THREE.Mesh(hlGeo(), mat(0xffffff, { emissive: 0xffffff, rough: 0.2 }));
  glint.position.set(-0.17, 0.28, 0.14);
  glint.scale.set(1, 0.7, 0.6);
  glint.rotation.y = 0.5;
  const bounce = new THREE.Mesh(hlGeo(), mat(0xbfe8ff, { emissive: 0x9fd8ff, rough: 0.2, opacity: 0.8 }));
  bounce.position.set(0.14, 0.08, -0.12);
  bounce.scale.setScalar(0.45);
  m.add(glint, bounce);
  return m;
}
let _hl: THREE.BufferGeometry | null = null;
function hlGeo() {
  return (_hl ??= new THREE.SphereGeometry(0.1, 8, 6));
}

// ---------------------------------------------------------------------------
// SCATTER: lots of one kind of prop, cheaply
// ---------------------------------------------------------------------------
/**
 * Drops `count` props of one kind over a rectangle (`x`,`z` = its CENTRE, `w` wide in x, `d` deep in z).
 * `avoid(x, z)` returns true for spots to leave empty. Pebbles, leaves, twigs and clover are InstancedMeshes
 * (one draw call per variant); mushrooms are cloned from a few shared templates.
 */
export function scatter(
  root: THREE.Object3D,
  what: 'pebbles' | 'leaves' | 'twigs' | 'clover' | 'mushrooms',
  area: { x: number; z: number; w: number; d: number },
  count: number,
  avoid?: (x: number, z: number) => boolean,
  seed = 1
): void {
  const R = rng(seed * 6007 + what.length);
  const spots: { x: number; z: number }[] = [];
  let tries = 0;
  while (spots.length < count && tries < count * 30) {
    tries++;
    const x = area.x + (R.next() - 0.5) * area.w, z = area.z + (R.next() - 0.5) * area.d;
    if (avoid && avoid(x, z)) continue;
    spots.push({ x, z });
  }
  const group = new THREE.Group();
  group.name = `scatter-${what}`;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), pv = new THREE.Vector3(), sv = new THREE.Vector3();

  /** Build one InstancedMesh per geometry variant and share the spots round-robin. */
  const instance = (geos: { geo: THREE.BufferGeometry; material: THREE.Material }[], place: (i: number) => { s: [number, number, number]; tiltMax?: number; y?: number }) => {
    const buckets: number[][] = geos.map(() => []);
    spots.forEach((_, i) => buckets[i % geos.length].push(i));
    geos.forEach((gm, k) => {
      if (!buckets[k].length) return;
      const im = new THREE.InstancedMesh(gm.geo, gm.material, buckets[k].length);
      buckets[k].forEach((si, n) => {
        const p = place(si);
        const tm = p.tiltMax ?? 0;
        e.set((R.next() - 0.5) * tm, R.next() * TAU, (R.next() - 0.5) * tm);
        q.setFromEuler(e);
        m4.compose(pv.set(spots[si].x, p.y ?? 0, spots[si].z), q, sv.set(...p.s));
        im.setMatrixAt(n, m4);
      });
      im.castShadow = true;
      im.receiveShadow = true;
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      group.add(im);
    });
  };

  if (what === 'pebbles') {
    const geos = [1, 2, 3, 4, 5, 6].map((s) => ({ geo: pebbleGeo(1, s + seed * 10), material: pebbleMaterial() }));
    instance(geos, () => {
      const s = SIZE.pebble * (0.14 + Math.pow(R.next(), 2.2) * 0.8); // lots of small, a few big
      return { s: [s * (0.9 + R.next() * 0.3), s * (0.85 + R.next() * 0.3), s * (0.9 + R.next() * 0.3)], y: 0 };
    });
  } else if (what === 'leaves') {
    const kinds: LeafKind[] = ['green', 'autumn', 'brown', 'red', 'brown', 'autumn'];
    const geos = kinds.map((k, i) => ({ geo: leafGeo(k, 1, seed + i), material: leafMaterial() }));
    instance(geos, () => {
      const s = SIZE.fallenLeafSmall * (0.5 + R.next() * 0.9);
      return { s: [s, s, s], y: 0.02 };
    });
  } else if (what === 'twigs') {
    const geos = [1, 2, 3, 4].map((s) => ({ geo: twigGeo(1, s + seed * 10), material: vcMat({ rough: 0.9 }) }));
    instance(geos, () => {
      const s = SIZE.twig * (0.4 + R.next() * 1.1);
      return { s: [s, s, s] };
    });
  } else if (what === 'clover') {
    // each variant = stems (vertex colours) + leaflets (textured), two instanced meshes sharing the same spots
    const variants = [1, 2, 3, 4].map((s) => cloverGeos(s + seed * 10));
    const per = variants.map(() => [] as number[]);
    spots.forEach((_, i) => per[i % variants.length].push(i));
    variants.forEach((v, k) => {
      if (!per[k].length) return;
      const a = new THREE.InstancedMesh(v.stem, vcMat(), per[k].length);
      const b = new THREE.InstancedMesh(v.leaves, cloverMaterial(), per[k].length);
      per[k].forEach((si, n) => {
        const s = 0.75 + R.next() * 0.6;
        e.set(0, R.next() * TAU, 0);
        q.setFromEuler(e);
        m4.compose(pv.set(spots[si].x, 0, spots[si].z), q, sv.set(s, s, s));
        a.setMatrixAt(n, m4);
        b.setMatrixAt(n, m4);
      });
      for (const im of [a, b]) {
        im.castShadow = true;
        im.receiveShadow = true;
        im.instanceMatrix.needsUpdate = true;
        im.computeBoundingSphere();
        group.add(im);
      }
    });
  } else {
    const templates = [makeMushroom(false, seed + 1), makeMushroom(true, seed + 2), makeMushroom(false, seed + 3), makeMushroom(true, seed + 4)];
    spots.forEach((p, i) => {
      const o = templates[i % templates.length].clone(); // clones SHARE geometry + materials
      const s = 0.7 + R.next() * 0.7;
      o.position.set(p.x, 0, p.z);
      o.rotation.y = R.next() * TAU;
      o.scale.setScalar(s);
      group.add(o);
    });
  }
  root.add(group);
}

/** Exposed so other modules (backdrop) can reuse the cached shared materials. */
export const floraMaterials = { leaf: leafMaterial, clover: cloverMaterial };
