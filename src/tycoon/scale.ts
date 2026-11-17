// ============================================================================
// scale.ts — 🐜 the size of everything in the insect airport tycoon (v0.68).
//
// ONE RULE: 1 game unit = 2 mm. Everything is its REAL size around a fire ant worker (4.2 mm = 2.1 units),
// from the TMB-Story 1:180 scale sheet (UF/IFAS + NC State Extension rows) and TRADDOMIUM's fire ant research.
// Rows marked (approx.) are general figures, not yet checked against a source.
//
// Why 2 mm: a worker is then ~2.1 units, a major 3 and the queen 4, almost exactly the ant sizes the game
// already used (2.0, 2.6, 4.2), so the cameras, walking speeds and controls need little retuning.
//
// Use `mm(…)` for anything with a real-world size: `mm(6.5)` = a ladybug's length in game units.
// ============================================================================

/** Game units per millimetre (1 unit = 2 mm). */
export const UNITS_PER_MM = 0.5;
/** A real size in millimetres -> game units. */
export const mm = (v: number) => v * UNITS_PER_MM;

/** Real sizes in GAME UNITS (body length unless it says otherwise). */
export const SIZE = {
  // 🐜 your colony (the only real 3D models; other species reuse them, resized + recolored)
  workerAnt: mm(4.2),        // fire ant worker, 2.4–6 mm (polymorphic: "major" = the top of the range)
  majorAnt: mm(6),
  queenAnt: mm(8),           // 7–9.5 mm
  carpenterAnt: mm(7.75),    // black, a recolored fire ant model
  // ✈️ the fleet (procedural)
  ladybug: mm(6.5),
  honeyBee: mm(13),          // (approx.) 12–15 mm
  beetle: mm(30),            // (approx.) a large beetle, 25–40 mm
  moth: mm(20),              // (approx.) body; wingspan ~45 mm
  mothWingspan: mm(45),
  dragonfly: mm(76),         // (approx.) green darner body
  dragonflyWingspan: mm(100),
  butterfly: mm(25),         // (approx.) body
  butterflyWingspan: mm(80), // (approx.) 65–95 mm
  // 🧍 TRADDOMIUM's miniature people (v0.77): 1:180, so a 1.70 m adult stands about 9.4 mm tall
  person: mm(1700 / 180),
  // 🐞 other bugs (procedural): passengers, wild traffic, predators
  aphid: mm(2.5),
  pillbug: mm(10),
  houseFly: mm(6.5),
  mosquito: mm(4.1),
  jumpingSpider: mm(13),
  wolfSpider: mm(30),
  // 🦎 the giants (procedural; no real dinosaurs)
  anole: mm(160),            // (approx.) 125–200 mm with tail
  gecko: mm(115),            // (approx.) 100–130 mm
  toad: mm(70),              // (approx.) a small toad
  // 🌱 the landscape
  grassBlade: mm(95),        // mowed lawn: a 47-unit forest wall
  cloverLeaflet: mm(12),     // (approx.)
  pebble: mm(25),
  gravel: mm(5),             // (approx.) runway edging stones
  sandGrain: mm(0.7),
  raindrop: mm(3.5),
  dewdrop: mm(4),            // (approx.)
  fallenLeafSmall: mm(30),   // (approx.) a small fallen leaf
  twig: mm(60),              // (approx.) length
  dandelionSeed: mm(12),     // (approx.) seed + pappus
  acornCap: mm(18),          // (approx.)
  bottleCap: mm(30),
  seashell: mm(75),
  sodaCan: mm(123),
} as const;
