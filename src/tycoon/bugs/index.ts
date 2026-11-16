// ============================================================================
// index.ts — 🐞 the tycoon bug library: ONE function, makeBug(kind, opts), builds any creature of the insect airport.
//
//   import { makeBug, BUG_KINDS } from './tycoon/bugs';
//   const lady = makeBug('ladybug');                       // default size from scale.ts SIZE
//   const big  = makeBug('beetle', { seed: 2, length: 20 }); // bronze beetle, a bit bigger
//   scene.add(lady.root);                                  // root sits on the ground under the body centre
//   animateCreature(lady, dt, speed);                      // walks it; set lady.flying = true and it flaps
//
// What you get is a normal CreatureModel (src/actors/models.ts), so the existing animateCreature() walks and
// flaps it, plus `kind` and `seats` (attach points on the back for passengers / cargo, local to model.bob).
//
// Species with their own wing motion or life (butterfly, dragonfly, moth, anole dewlap + tail, gecko tail,
// toad breathing + hop, ladybug shell halves) animate it in CreatureModel.extra, which animateCreature calls last.
//
// Everything is procedural, built once per species + variant and shared by every instance (cheap on a phone).
// ============================================================================
import { SIZE } from '../scale';
import { aphid, beetle, bee, housefly, ladybug, pillbug } from './insects';
import { butterfly, dragonfly, moth } from './flyers';
import { jumpingSpider, wolfSpider } from './spiders';
import { anole, gecko, toad } from './giants';
import type { BArgs, Bug, BugKind, BugOpts } from './types';

export type { Bug, BugKind, BugOpts } from './types';

/** Every kind, in a sensible display order (the fleet, then passengers / traffic, predators, giants). */
export const BUG_KINDS: readonly BugKind[] = [
  'ladybug', 'bee', 'beetle', 'moth', 'dragonfly', 'butterfly',
  'aphid', 'pillbug', 'housefly',
  'jumping-spider', 'wolf-spider',
  'anole', 'gecko', 'toad',
];

/** Default nose-to-tail length of each kind, in game units (from SIZE in scale.ts). */
export const BUG_LENGTH: Record<BugKind, number> = {
  ladybug: SIZE.ladybug, bee: SIZE.honeyBee, beetle: SIZE.beetle, moth: SIZE.moth, dragonfly: SIZE.dragonfly, butterfly: SIZE.butterfly,
  aphid: SIZE.aphid, pillbug: SIZE.pillbug, housefly: SIZE.houseFly,
  'jumping-spider': SIZE.jumpingSpider, 'wolf-spider': SIZE.wolfSpider,
  anole: SIZE.anole, gecko: SIZE.gecko, toad: SIZE.toad,
};

const BUILDERS: Record<BugKind, (a: BArgs) => Bug> = {
  ladybug, bee, beetle, moth, dragonfly, butterfly, aphid, pillbug, housefly,
  'jumping-spider': jumpingSpider, 'wolf-spider': wolfSpider, anole, gecko, toad,
};

/**
 * Build a bug. `length` (game units, nose to tail) stretches the whole creature evenly (default: its SIZE value);
 * `seed` picks the variation (beetle colour, butterfly pattern, flap timing, ...); `color` overrides the body colour.
 * Note: a bug scaled away from its default size scales its seats too (the seats live inside the scaled body).
 */
export function makeBug(kind: BugKind, opts: BugOpts = {}): Bug {
  const build = BUILDERS[kind];
  if (!build) throw new Error(`makeBug: unknown kind "${kind}"`);
  const length = opts.length ?? BUG_LENGTH[kind];
  return build({ scale: length / BUG_LENGTH[kind], seed: opts.seed ?? 0, color: opts.color });
}
