// ============================================================================
// bellyMotion.ts — AN EXCERPT of the builder's src/sarahlab/sarahLabTool.ts
// (CAPFlyingFun/Custom-Character-Builder-System at 46f95d3): the weight of her
// belly and bust as she moves. The numbers and the maths are the builder's own
// (its GAME TUNING, by Joshua, 2026-10-07/08); only what the DEV Room needs is
// here, and her resting tilt (a slider in the builder) is left at its default.
// The builder is the source of truth: re-copy, don't edit.
// ============================================================================

/** Her four motion shapes: the belly's sag, drop and sideways swing, and the bust's drop. */
export const MOTION_TARGETS = Object.freeze(['bellyTilt', 'bellyBob', 'bellySway', 'breastBob'] as const);

const BUMP_MAX_PERCENT = 200;
const TILT_RAD = (20 * Math.PI) / 180; // bellyTilt at weight 1
const BOB_M = 0.01;                    // bellyBob, bellySway and breastBob at weight 1, metres
const BELLY_SPRING = Object.freeze({ hz: 2.2, damping: 0.32, maxM: 0.015, maxAccel: 40 });
const BREAST_SPRING = Object.freeze({ hz: 2.8, damping: 0.28, maxM: 0.012, maxAccel: 40 });
const SIZE_TILT_DEG_PER_PERCENT = 0.2;
const BOUNCE_TILT = 0.25 * (0.1 / TILT_RAD);
const BELLY_SWING = 0.45;
const BREAST_SWING = 0.45;
export const WALK_BOUNCE_M = 0.02 * 0.4;
export const WALK_SWAY_M = 0.025 * 0.4;

/** A soft part's displacement from where it hangs, metres (y down, x to her left), and how fast. */
export interface BellySpring { y: number; vy: number; x: number; vx: number }
export const restingBellySpring = (): BellySpring => ({ y: 0, vy: 0, x: 0, vx: 0 });

interface SpringTuning { readonly hz: number; readonly damping: number; readonly maxM: number; readonly maxAccel: number }
function stepSpring(s: BellySpring, dt: number, upAccel: number, leftAccel: number, tune: SpringTuning): BellySpring {
  const w = 2 * Math.PI * tune.hz, c = 2 * tune.damping * w;
  const clampA = (a: number) => (Number.isFinite(a) ? Math.max(-tune.maxAccel, Math.min(tune.maxAccel, a)) : 0);
  const ay = clampA(upAccel), ax = clampA(leftAccel);
  const total = Math.min(Math.max(0, Number.isFinite(dt) ? dt : 0), 0.1);
  const steps = Math.max(1, Math.ceil(total / (1 / 240)));
  const h = total / steps;
  for (let k = 0; k < steps && h > 0; k += 1) {
    s.vy += (-w * w * s.y - c * s.vy + ay) * h;
    s.vx += (-w * w * s.x - c * s.vx - ax) * h;
    s.y += s.vy * h;
    s.x += s.vx * h;
    const m = tune.maxM;
    if (Math.abs(s.y) > m) { s.y = Math.sign(s.y) * m; s.vy = 0; }
    if (Math.abs(s.x) > m) { s.x = Math.sign(s.x) * m; s.vx = 0; }
  }
  return s;
}
export const stepBellySpring = (s: BellySpring, dt: number, up: number, left: number) => stepSpring(s, dt, up, left, BELLY_SPRING);
export const stepBreastSpring = (s: BellySpring, dt: number, up: number, left: number) => stepSpring(s, dt, up, left, BREAST_SPRING);

/** A walk's own bounce, as the acceleration of the body (two steps a stride). */
export function walkBounceAccel(phase: number, strideSeconds: number): number {
  if (!(strideSeconds > 0)) return 0;
  const w = (4 * Math.PI) / strideSeconds;
  return -w * w * WALK_BOUNCE_M * Math.cos(4 * Math.PI * phase);
}
/** The sideways acceleration of a walk's sway, toward her left (one cycle a stride). */
export function walkSwayAccel(phase: number, strideSeconds: number): number {
  if (!(strideSeconds > 0)) return 0;
  const w = (2 * Math.PI) / strideSeconds;
  return -w * w * WALK_SWAY_M * Math.sin(2 * Math.PI * phase);
}

function breastVolumeRatio(bumpPercent: number): number {
  const p = Math.min(BUMP_MAX_PERCENT, Math.max(0, Number.isFinite(bumpPercent) ? bumpPercent : 100));
  return p <= 100 ? 1 + (0.3 * p) / 100 : 1.3 + (0.25 * (p - 100)) / 100;
}

/** This frame's weights for her four motion shapes, in MOTION_TARGETS' order. */
export function motionWeights(bumpPercent: number, belly: BellySpring, breast: BellySpring, out: number[]): number[] {
  const size = Math.min(BUMP_MAX_PERCENT, Math.max(0, bumpPercent)) / 100;
  const bob = belly.y / BOB_M;
  const swing = BELLY_SWING * Math.min(1, size);
  const sizeTilt = (Math.min(BUMP_MAX_PERCENT, Math.max(100, bumpPercent)) - 100) * SIZE_TILT_DEG_PER_PERCENT * (Math.PI / 180);
  out[0] = sizeTilt / TILT_RAD + swing * BOUNCE_TILT * bob;
  out[1] = swing * bob;
  out[2] = swing * (belly.x / BOB_M);
  out[3] = BREAST_SWING * breastVolumeRatio(bumpPercent) * (breast.y / BOB_M);
  return out;
}
