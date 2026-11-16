// ============================================================================
// sign.ts — 🪧 a sign: a slab of bark on two twig legs, with words painted on it (v0.68).
//
// The words are a CanvasTexture (drawn with the game's chunky font) on a plain face in front of the slab, and the
// whole board leans back a little so the high game camera can read it. The slab is a closed, rounded shape
// (not a flat billboard), so it also looks right from the ant's-eye camera.
//
// Size: board 9 × 4.2 × 0.5 by default (`width` / `height` change it), on legs 3.2 tall -> ~7.5 units tall overall.
// Triangles: ~290. Meshes: 3 (bark + legs merged, the text face, nothing else).
// Spots: 'front' (where you stand to read it).
// ============================================================================
import * as THREE from 'three';
import { mat } from '../kit';
import { GAME_FONT, gameText, sharpTexture } from '../../world/labels';
import { Batch, Piece, box, capsuleGeometry, roundedSlab, v3 } from './common';

export interface SignOpts {
  /** board width (default 9) */
  width?: number;
  /** board height (default 4.2) */
  height?: number;
  /** a painted arrow next to the words */
  arrow?: 'left' | 'right' | 'up';
  /** text colour (css) */
  fg?: string;
  /** board colour */
  bark?: number;
}

const texCache = new Map<string, THREE.CanvasTexture>();

/** Words (and an optional arrow) painted on a bark-brown canvas. Cached, so the same sign text is drawn once. */
export function signTexture(text: string, w: number, h: number, o: SignOpts = {}): THREE.CanvasTexture {
  const key = `${text}|${w}|${h}|${o.arrow ?? ''}|${o.fg ?? ''}`;
  let t = texCache.get(key);
  if (t) return t;
  const PX = 96; // canvas pixels per world unit: crisp even up close
  const cv = document.createElement('canvas');
  cv.width = Math.round(w * PX);
  cv.height = Math.round(h * PX);
  const c = cv.getContext('2d')!;
  // painted face: warm bark with a lighter inner panel and a thin border
  c.fillStyle = '#5b3a20';
  c.fillRect(0, 0, cv.width, cv.height);
  const m = cv.height * 0.07;
  c.fillStyle = '#7a4f2b';
  c.fillRect(m, m, cv.width - 2 * m, cv.height - 2 * m);
  c.strokeStyle = '#d9b27a';
  c.lineWidth = cv.height * 0.035;
  c.strokeRect(m * 1.6, m * 1.6, cv.width - 3.2 * m, cv.height - 3.2 * m);
  // words: shrink to fit
  const arrowRoom = o.arrow ? cv.height * 0.9 : 0;
  let size = cv.height * 0.5;
  c.font = `900 ${size}px ${GAME_FONT}`;
  const avail = cv.width - cv.height * 0.45 - arrowRoom;
  const need = c.measureText(text).width * 1.08;
  if (need > avail) size = (size * avail) / need;
  const cx = o.arrow === 'left' ? cv.width / 2 + arrowRoom / 2 : o.arrow === 'right' ? cv.width / 2 - arrowRoom / 2 : cv.width / 2;
  gameText(c, text, cx, cv.height * 0.53, size, o.fg ?? '#fff3d6', '#2a1608');
  // arrow: a chunky triangle + tail
  if (o.arrow) {
    const s = cv.height * 0.3;
    const ax = o.arrow === 'right' ? cv.width - cv.height * 0.62 : o.arrow === 'left' ? cv.height * 0.62 : cv.width / 2;
    const ay = cv.height / 2;
    const d = o.arrow === 'right' ? 1 : -1;
    c.fillStyle = '#ffd24a';
    c.strokeStyle = '#2a1608';
    c.lineWidth = cv.height * 0.04;
    c.lineJoin = 'round';
    c.beginPath();
    if (o.arrow === 'up') {
      c.moveTo(ax, ay - s);
      c.lineTo(ax + s, ay);
      c.lineTo(ax + s * 0.4, ay);
      c.lineTo(ax + s * 0.4, ay + s);
      c.lineTo(ax - s * 0.4, ay + s);
      c.lineTo(ax - s * 0.4, ay);
      c.lineTo(ax - s, ay);
    } else {
      c.moveTo(ax + d * s, ay);
      c.lineTo(ax, ay - s);
      c.lineTo(ax, ay - s * 0.4);
      c.lineTo(ax - d * s, ay - s * 0.4);
      c.lineTo(ax - d * s, ay + s * 0.4);
      c.lineTo(ax, ay + s * 0.4);
      c.lineTo(ax, ay + s);
    }
    c.closePath();
    c.fill();
    c.stroke();
  }
  t = sharpTexture(cv);
  texCache.set(key, t);
  return t;
}

/** makeSign(text) — a bark slab on twig legs with `text` painted on it. */
export function makeSign(text: string, opts: SignOpts = {}): Piece {
  const w = opts.width ?? 9;
  const h = opts.height ?? 4.2;
  const root = new THREE.Group();
  const barkMat = mat(opts.bark ?? 0x6b4423, { rough: 0.9 });
  const legMat = mat(0x5e3b1f, { rough: 0.9 });

  // twig legs
  const legH = 3.4;
  const legs = new Batch();
  for (const sx of [-1, 1]) {
    legs.at(capsuleGeometry(legH + 0.8, 0.3), legMat, sx * w * 0.32, (legH + 0.8) / 2 - 0.2, -0.1, { rz: sx * 0.05 });
  }
  const legMesh = legs.build();
  root.add(legMesh);

  // the board leans back toward the high camera
  const board = new THREE.Group();
  board.position.set(0, legH + h / 2 - 0.2, 0);
  board.rotation.x = -0.28;
  // roundedSlab lies flat (thin in Y): stand it up so it is thin in Z, centred on the board's pivot
  const slab = new THREE.Mesh(roundedSlab(w, h, 0.5, 0.6, 0.12).clone().rotateX(Math.PI / 2).translate(0, 0, -0.25), barkMat);
  slab.castShadow = true;
  slab.receiveShadow = true;
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(w - 0.35, h - 0.35),
    new THREE.MeshStandardMaterial({ map: signTexture(text, w - 0.35, h - 0.35, opts), roughness: 0.85 }),
  );
  face.position.z = 0.27;
  board.add(slab, face);
  root.add(board);

  return {
    root,
    blockers: [box(-w * 0.32, 0, 0.9, 0.9), box(w * 0.32, 0, 0.9, 0.9)],
    spots: { front: v3(0, 0, 3.5) },
    roofs: [],
  };
}
