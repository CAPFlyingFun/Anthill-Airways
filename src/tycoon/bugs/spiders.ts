// ============================================================================
// spiders.ts — 🕷️ the predators: jumping spider and wolf spider (tycoon bugs, v0.68).
//
// Both have 8 legs (4 pairs) that walk in an ALTERNATING gait (animateCreature swings each pivot; neighbours
// move in opposite phase), a two-part body (head-thorax + abdomen), fuzzy matte skin and a face you can read from far away.
//   jumping spider : small, stout, fuzzy black with white abdomen spots and two BIG forward-facing eyes (cute + a little scary)
//   wolf spider    : bigger, brown with a pale stripe down the back, long legs, a row of eyes
// Triangle counts (default build): jumping spider ~1,100 · wolf spider ~1,500
// ============================================================================
import { SIZE } from '../scale';
import {
  addBody, addLegs, cached, ell, finishBug, legChain, legPair, merge, mix, newBug, newRig, octoPhase, rowYaw, spotOn, tube, MATTE, SHINY, type LegSpec,
} from './parts';
import type { BArgs, Bug } from './types';

/** Eight legs: 4 rows x 2 sides. `reach[row]` scales how far each pair reaches (front + back pairs differ). */
function legs8(key: string, color: number, rows: number[], x: number, y: number, knee: [number, number], foot: [number, number], rad: number[], reach: number[], spread: number, knees = true) {
  const specs: LegSpec[] = [];
  rows.forEach((z, row) => {
    const k = reach[row];
    const pair = legPair(`${key}|${row}`, () => legChain(color, [[0, 0, 0], [knee[0] * k, knee[1], 0], [foot[0] * k, foot[1], 0]], rad, { knees }));
    for (const side of [-1, 1] as const) {
      specs.push({ at: [side * x, y, z], side, yaw: rowYaw(row, rows.length, side, spread), phase: octoPhase(row, side), geo: side === 1 ? pair.R : pair.L });
    }
  });
  return specs;
}

// ===========================================================================
// 🕷️ JUMPING SPIDER — fuzzy black, white spots on the abdomen, two big front eyes with a sparkle, little green fangs.
// ===========================================================================
export function jumpingSpider(a: BArgs): Bug {
  const L = SIZE.jumpingSpider;
  const m = newBug('jumping-spider', 0.4 * L, L, a.scale);
  const rig = newRig(0.35);
  const fur = a.color ?? 0x24242c;
  const g = cached(`jspider|${fur}`, () => {
    const ac: [number, number, number] = [0, 0.2 * L, -0.27 * L];
    const ar: [number, number, number] = [0.2 * L, 0.17 * L, 0.26 * L];
    return merge([
      ell(fur, [0, 0.22 * L, 0.17 * L], [0.2 * L, 0.16 * L, 0.24 * L], { w: 10, h: 7 }),    // head-thorax
      ell(fur, [0, 0.24 * L, 0.34 * L], [0.17 * L, 0.14 * L, 0.12 * L], { w: 10, h: 7 }),    // tall front of the head
      ell(fur, ac, ar, { w: 10, h: 7 }),                                                    // abdomen
      ell(0xf4f4f0, [0, 0.21 * L, -0.07 * L], [0.04 * L, 0.03 * L, 0.04 * L], { w: 6, h: 4 }), // waist-spot
      spotOn(0xf4f4f0, ac, ar, 0, -0.12 * L, 0.06 * L, 0.04 * L),
      spotOn(0xf4f4f0, ac, ar, 0, -0.27 * L, 0.05 * L, 0.035 * L),
      spotOn(0xf4f4f0, ac, ar, 0.09 * L, -0.2 * L, 0.04 * L, 0.03 * L),
      spotOn(0xf4f4f0, ac, ar, -0.09 * L, -0.2 * L, 0.04 * L, 0.03 * L),
      spotOn(0xf4f4f0, ac, ar, 0, -0.4 * L, 0.04 * L, 0.03 * L),
      ...[-1, 1].flatMap((s) => [
        ell(0x0a0a0e, [s * 0.075 * L, 0.27 * L, 0.405 * L], [0.07 * L, 0.075 * L, 0.06 * L], { w: 10, h: 7 }),        // BIG front eyes
        ell(0xffffff, [s * 0.09 * L, 0.3 * L, 0.45 * L], [0.024 * L, 0.024 * L, 0.016 * L], { w: 6, h: 4 }),        // sparkle
        ell(0x0c0c10, [s * 0.15 * L, 0.31 * L, 0.3 * L], [0.04 * L, 0.04 * L, 0.035 * L], { w: 7, h: 5 }),          // side eyes
        ell(0xf2f2ee, [s * 0.15 * L, 0.2 * L, 0.38 * L], [0.04 * L, 0.04 * L, 0.05 * L], { w: 6, h: 4 }),            // fuzzy pale face
        tube(0x4aa59a, [s * 0.045 * L, 0.13 * L, 0.4 * L], [s * 0.04 * L, 0.07 * L, 0.44 * L], 0.025 * L, 0.012 * L, 4), // fangs
        tube(0xe8e8e0, [s * 0.1 * L, 0.18 * L, 0.4 * L], [s * 0.06 * L, 0.16 * L, 0.5 * L], 0.018 * L, 0.012 * L, 4),    // palps
      ]),
    ]);
  });
  addBody(m, g, MATTE);
  addLegs(m, rig, MATTE, legs8('jspider', mix(fur, 0x555566, 0.15), [0.3 * L, 0.18 * L, 0.06 * L, -0.06 * L], 0.17 * L, 0.15 * L,
    [0.14 * L, 0.14 * L], [0.28 * L, -0.15 * L], [0.04 * L, 0.032 * L, 0.02 * L], [1, 0.9, 1, 1.15], 0.85, false));
  finishBug(m, rig);
  return m;
}

// ===========================================================================
// 🕷️ WOLF SPIDER — brown with a pale stripe down the back, long legs, a row of small eyes + 2 big ones, chunky fangs.
// ===========================================================================
export function wolfSpider(a: BArgs): Bug {
  const L = SIZE.wolfSpider;
  const m = newBug('wolf-spider', 0.34 * L, L, a.scale);
  const rig = newRig(0.35);
  const brown = a.color ?? 0x6b4a2a;
  const g = cached(`wspider|${brown}`, () => {
    const stripe = (x: number, _y: number, z: number) => (Math.abs(x) < 0.035 * L ? 0xd9bf8a : Math.abs(x) < 0.1 * L && z < 0 ? mix(brown, 0x2a1a0c, 0.35) : brown);
    return merge([
      ell(stripe, [0, 0.2 * L, 0.2 * L], [0.17 * L, 0.13 * L, 0.22 * L], { w: 12, h: 8 }),
      ell((x, y, z) => (Math.abs(x) < 0.04 * L ? 0xe0c894 : (Math.floor(z / (0.06 * L)) % 2 ? mix(brown, 0x2a1a0c, 0.4) : brown)),
        [0, 0.19 * L, -0.26 * L], [0.19 * L, 0.15 * L, 0.28 * L], { w: 12, h: 8 }),
      ...[-1, 1].flatMap((s) => [
        ell(0x111111, [s * 0.065 * L, 0.3 * L, 0.37 * L], [0.04 * L, 0.04 * L, 0.035 * L], { w: 7, h: 5 }),        // 2 big eyes
        ell(0xffffff, [s * 0.075 * L, 0.32 * L, 0.395 * L], [0.011 * L, 0.011 * L, 0.009 * L], { w: 4, h: 3 }),
        ell(0x111111, [s * 0.04 * L, 0.24 * L, 0.42 * L], [0.022 * L, 0.022 * L, 0.02 * L], { w: 6, h: 4 }),       // front row
        ell(0x111111, [s * 0.1 * L, 0.3 * L, 0.3 * L], [0.025 * L, 0.025 * L, 0.022 * L], { w: 6, h: 4 }),         // side eyes
        tube(0x3a2412, [s * 0.05 * L, 0.18 * L, 0.4 * L], [s * 0.045 * L, 0.08 * L, 0.45 * L], 0.035 * L, 0.018 * L, 5), // fangs
        tube(mix(brown, 0xffffff, 0.15), [s * 0.1 * L, 0.2 * L, 0.38 * L], [s * 0.07 * L, 0.17 * L, 0.5 * L], 0.022 * L, 0.014 * L, 4), // palps
      ]),
    ]);
  });
  addBody(m, g, MATTE);
  addLegs(m, rig, MATTE, legs8('wspider', mix(brown, 0x2a1a0c, 0.2), [0.28 * L, 0.17 * L, 0.06 * L, -0.06 * L], 0.14 * L, 0.14 * L,
    [0.17 * L, 0.2 * L], [0.5 * L, -0.14 * L], [0.034 * L, 0.026 * L, 0.012 * L], [0.9, 0.85, 0.95, 1.1], 0.9));
  finishBug(m, rig);
  return m;
}
