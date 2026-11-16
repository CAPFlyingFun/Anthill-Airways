// ============================================================================
// wings.ts — 🪽 wing shapes and painted wing textures for every flyer (tycoon bugs, v0.68).
//
// A wing is a flat outline (smooth curve through a few control points) turned into a thin double-sided mesh. Its
// "looks" (glassy veins, orange butterfly patterns, moth swirls) are PAINTED onto a small canvas texture, once per
// pattern, and shared by every bug that uses it. That keeps the triangle count tiny while the wings still read as
// clear / veined / patterned from every camera angle.
//
// Coordinates of a wing outline: x runs OUT along the wing (the right wing spans +x), z runs front/back with the
// leading edge toward +z. The left wing is the mirror image.
// ============================================================================
import * as THREE from 'three';
import { cached, mirrorX, outlinePath, smoothOutline, wingMaterial, wingShape, wingTexture, type Draw, type WingShape } from './parts';

export interface WingSet {
  shape: WingShape;
  R: THREE.BufferGeometry;
  L: THREE.BufferGeometry;
  mat: THREE.Material;
}

/** A leaf-shaped wing of length `s` and chord `c`; `lead` shifts the widest part toward the root (0) or tip (1). */
export function leafOutline(s: number, c: number, lead = 0.4): Array<[number, number]> {
  return smoothOutline([
    [0, 0.1 * c],
    [0.25 * s, 0.5 * c],
    [(0.35 + 0.4 * lead) * s, 0.46 * c],
    [s, 0.06 * c],
    [(0.55 + 0.35 * lead) * s, -0.42 * c],
    [0.3 * s, -0.5 * c],
    [0.04 * s, -0.25 * c],
  ], 16);
}

/** Build (once) a wing from an outline + a texture painter. */
export function makeWing(key: string, outline: Array<[number, number]>, draw: Draw, see: boolean): WingSet {
  return cached(`wing|${key}`, () => {
    const shape = wingShape(outline);
    const tex = wingTexture(key, shape, draw);
    return { shape, R: shape.geo, L: mirrorX(shape.geo), mat: wingMaterial(tex, see) };
  });
}

// ---------------------------------------------------------------------------
// Texture painters
// ---------------------------------------------------------------------------
/** Clear glassy wing: translucent tint, thin veins fanning from the root, a darker edge. */
export function clearDraw(tint: string, vein: string, veins = 5, cross = 3): Draw {
  return (c, W, H, to, shape) => {
    c.clearRect(0, 0, W, H);
    outlinePath(c, shape, to);
    c.fillStyle = tint;
    c.fill();
    c.save();
    outlinePath(c, shape, to);
    c.clip();
    c.strokeStyle = vein;
    c.lineWidth = 2;
    const [rx, ry] = to(0, 0.05 * (shape.maxZ - shape.minZ));
    // veins fan out from the root to the far edge
    for (let i = 0; i < veins; i++) {
      const t = i / (veins - 1);
      const [tx, ty] = to(shape.minX + (shape.maxX - shape.minX) * (0.85 + 0.15 * (1 - Math.abs(t - 0.3))), shape.maxZ - (shape.maxZ - shape.minZ) * t * 0.95);
      c.beginPath();
      c.moveTo(rx, ry);
      c.quadraticCurveTo((rx + tx) / 2, ry + (ty - ry) * 0.35, tx, ty);
      c.stroke();
    }
    c.lineWidth = 1.2;
    for (let k = 1; k <= cross; k++) {
      const x = (k / (cross + 1)) * W;
      c.beginPath();
      c.moveTo(x, H * 0.05);
      c.lineTo(x + 8, H * 0.95);
      c.stroke();
    }
    c.restore();
    outlinePath(c, shape, to);
    c.lineWidth = 3;
    c.strokeStyle = vein;
    c.stroke();
  };
}

/** Dragonfly wing: a dense net of cells and a dark "pterostigma" spot near the tip of the leading edge. */
export function dragonDraw(tint: string): Draw {
  return (c, W, H, to, shape) => {
    c.clearRect(0, 0, W, H);
    outlinePath(c, shape, to);
    c.fillStyle = tint;
    c.fill();
    c.save();
    outlinePath(c, shape, to);
    c.clip();
    c.strokeStyle = 'rgba(50,70,95,0.5)';
    c.lineWidth = 1.1;
    for (let x = 0; x <= W; x += 16) { // cross veins
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x + 3, H);
      c.stroke();
    }
    for (const y of [0.1, 0.24, 0.4, 0.55, 0.7, 0.85]) { // long veins
      c.beginPath();
      c.moveTo(0, H * (0.4 + (y - 0.4) * 0.3));
      c.lineTo(W, H * y);
      c.stroke();
    }
    c.restore();
    c.fillStyle = '#2b2118'; // pterostigma
    c.fillRect(W * 0.8, H * 0.02, W * 0.08, H * 0.12);
    outlinePath(c, shape, to);
    c.lineWidth = 3;
    c.strokeStyle = 'rgba(30,40,55,0.9)';
    c.stroke();
  };
}

/** Butterfly patterns: 0 gulf fritillary (orange/black), 1 monarch, 2 blue, 3 swallowtail (yellow). */
export function butterflyDraw(variant: number, base: string): Draw {
  return (c, W, H, to, shape) => {
    c.clearRect(0, 0, W, H);
    c.save();
    outlinePath(c, shape, to);
    c.clip();
    c.fillStyle = base;
    c.fillRect(0, 0, W, H);
    const [rx, ry] = to(0, 0);
    c.strokeStyle = '#1b1210';
    c.fillStyle = '#1b1210';
    // dark veins fanning from the root (all variants)
    c.strokeStyle = 'rgba(27,18,16,0.7)';
    c.lineWidth = variant === 1 ? 4 : 2;
    for (let i = 0; i < 7; i++) {
      const [tx, ty] = to(shape.maxX, shape.maxZ - (shape.maxZ - shape.minZ) * (i / 6));
      c.beginPath();
      c.moveTo(rx, ry);
      c.lineTo(tx * 0.97, ty);
      c.stroke();
    }
    if (variant === 0) { // black spots + a ring of white-ish ones near the edge
      for (let i = 0; i < 9; i++) {
        c.beginPath();
        c.arc(W * (0.3 + 0.07 * i), H * (0.25 + 0.5 * ((i * 37) % 10) / 10), 6 + (i % 3) * 2, 0, 7);
        c.fill();
      }
    }
    if (variant === 3) { // tiger-stripes
      c.lineWidth = 12;
      for (let i = 0; i < 4; i++) {
        c.beginPath();
        c.moveTo(W * (0.15 + i * 0.18), 0);
        c.lineTo(W * (0.05 + i * 0.18), H);
        c.stroke();
      }
    }
    // thick dark border following the outline
    outlinePath(c, shape, to);
    c.strokeStyle = '#1b1210';
    c.lineWidth = variant === 2 ? 28 : 18;
    c.lineJoin = 'round';
    c.stroke();
    // white dots in the border
    c.fillStyle = '#fff8ea';
    if (variant !== 3) for (let i = 0; i < 12; i++) {
      const p = shape.outline[(i * Math.floor(shape.outline.length / 12) + 2) % shape.outline.length];
      const [px, py] = to(p[0] * 0.93, p[1] * 0.9);
      c.beginPath();
      c.arc(px, py, 4, 0, 7);
      c.fill();
    }
    c.restore();
  };
}

/** Moth: soft brown, darker wavy bands, a pale edge and an eyespot. */
export function mothDraw(base: string, dark: string, pale: string): Draw {
  return (c, W, H, to, shape) => {
    c.clearRect(0, 0, W, H);
    c.save();
    outlinePath(c, shape, to);
    c.clip();
    c.fillStyle = base;
    c.fillRect(0, 0, W, H);
    c.strokeStyle = dark;
    c.lineWidth = 6;
    for (const f of [0.28, 0.5, 0.72]) {
      c.beginPath();
      for (let y = 0; y <= H; y += 8) {
        const x = W * f + Math.sin(y * 0.15 + f * 9) * 7;
        if (y === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.stroke();
    }
    c.fillStyle = dark; // eyespot
    c.beginPath();
    c.arc(W * 0.62, H * 0.62, 17, 0, 7);
    c.fill();
    c.fillStyle = pale;
    c.beginPath();
    c.arc(W * 0.62, H * 0.62, 8, 0, 7);
    c.fill();
    outlinePath(c, shape, to);
    c.lineWidth = 16;
    c.strokeStyle = pale;
    c.stroke();
    c.restore();
  };
}
