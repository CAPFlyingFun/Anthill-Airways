// EXCERPT of the builder's src/sarahlab/sarahLabTool.ts (the cloth's dials only), copied unchanged: see ../README.md
/**
 * THE CLOTH'S DIALS (Joshua, 2026-10-24: "test making the fabric more weighty (more gravity focused and less moving
 * around), tight/form fitting (less space between body and shirt for a tighter fit)... Could potentially even add sliders
 * to play with values in real time"). Each is a 0-100 slider; these say what it sets in the cloth (`clothSim.ts`'s
 * settings, and the stand-off `clothSkin.ts` keeps) and how its line reads.
 */
export type ClothDial = 'weight' | 'calm' | 'fit' | 'close' | 'stretch' | 'grip' | 'steps';
export type ClothTune = Readonly<Record<ClothDial, number>>;
export interface ClothDialSpec { readonly key: ClothDial; readonly line: (v: number) => string }
const dialAt = (v: number) => Math.max(0, Math.min(100, Number.isFinite(v) ? v : 0)) / 100;
/** Gravity, times the real one: 0.25 to 4 (the slider is logarithmic). */
export const clothGravityScale = (v: number) => 0.25 * 16 ** dialAt(v);
/** Damping per second: 0 to 12. */
export const clothDamping = (v: number) => 12 * dialAt(v);
/** The pattern's size against the fitted tee: 1.05 (roomy) to 0.85 (snug). */
export const clothRestScale = (v: number) => 1.05 - 0.2 * dialAt(v);
/** How far off her skin it keeps, millimetres: 6 to 0.5. */
export const clothStandOffMm = (v: number) => 6 - 5.5 * dialAt(v);
/** How easily it stretches (XPBD compliance, 1e-8 firm to 1e-4 very stretchy) and how far it may (1.15 to 1.65 times). */
export const clothCompliance = (v: number) => 10 ** (-8 + 4 * dialAt(v));
export const clothMaxStretch = (v: number) => 1.15 + 0.5 * dialAt(v);
/**
 * How it holds on her skin: friction 0 to 1 UP AND DOWN her, and a fifth of that ACROSS her (Joshua, 2026-10-24: "I
 * would make grip instead how fast the animation moves vertically, with small changes to horizontally… with only a max
 * of 20% loss horizontally"). So GRIP sets how readily the tee rides up or slides down her and barely changes how it
 * eases round her.
 */
export const clothFriction = (v: number) => dialAt(v);
export const CLOTH_GRIP_ACROSS = 0.2;
export const clothFrictionAcross = (v: number) => CLOTH_GRIP_ACROSS * dialAt(v);
/** Solver substeps a frame, 2 to 16: smoothness against cost. */
export const clothSubsteps = (v: number) => Math.round(2 + 14 * dialAt(v));
export const CLOTH_DIALS: readonly ClothDialSpec[] = Object.freeze([
  { key: 'weight', line: (v) => `WEIGHT · ${clothGravityScale(v).toFixed(2)}× gravity` },
  { key: 'calm', line: (v) => `CALM · damping ${clothDamping(v).toFixed(1)}/s${dialAt(v) > 0.6 ? ' · settles fast' : dialAt(v) < 0.15 ? ' · lively' : ''}` },
  { key: 'fit', line: (v) => `FIT · pattern ${Math.round(clothRestScale(v) * 100)}% of the tee${clothRestScale(v) < 0.95 ? ' · snug' : clothRestScale(v) > 1 ? ' · roomy' : ''}` },
  { key: 'close', line: (v) => `CLOSENESS · ${clothStandOffMm(v).toFixed(1)} mm off her skin` },
  { key: 'stretch', line: (v) => `STRETCH · up to ${clothMaxStretch(v).toFixed(2)}× · give 1e${(-8 + 4 * dialAt(v)).toFixed(1)}` },
  { key: 'grip', line: (v) => `GRIP · up and down ${clothFriction(v).toFixed(2)} · across ${clothFrictionAcross(v).toFixed(2)}` },
  { key: 'steps', line: (v) => `QUALITY · ${clothSubsteps(v)} steps a frame` },
]);
/**
 * Joshua's own setting, found on his phone (2026-10-24: "I found I believe the perfect setting that I would like to be
 * used as the default for the cloth simulation"): half real gravity, settling fast, the snuggest pattern, half a
 * millimetre off her, a middling grip, 8 steps. STRETCH is the one change, to the middle (Joshua, the same morning:
 * "Stretch 50… I can always adjust per outfit's settings"): at his 0 the snug pattern could not give, so the tee rode
 * up her when she sat and above a 150% belly standing. (The first defaults, "weighty and form-fitting", were
 * 65 35 65 75 50 80 43.)
 */
export const CLOTH_TUNE_DEFAULT: ClothTune = Object.freeze({ weight: 25, calm: 100, fit: 100, close: 100, stretch: 50, grip: 50, steps: 43 });
/** The cloth settings a set of dials gives (`ClothSettings` in clothSim.ts), and its stand-off in world units (100 a metre). */
export function clothTuning(t: ClothTune): { readonly settings: { substeps: number; stretchCompliance: number; bendCompliance: number; restScale: number; maxStretch: number; damping: number; gravity: [number, number, number]; friction: number; frictionAcross: number }; readonly standOff: number } {
  return {
    settings: {
      substeps: clothSubsteps(t.steps), stretchCompliance: clothCompliance(t.stretch), bendCompliance: 1e-4, restScale: clothRestScale(t.fit),
      maxStretch: clothMaxStretch(t.stretch), damping: clothDamping(t.calm), gravity: [0, -981 * clothGravityScale(t.weight), 0], friction: clothFriction(t.grip),
      frictionAcross: clothFrictionAcross(t.grip),
    },
    standOff: clothStandOffMm(t.close) / 10,
  };
}

