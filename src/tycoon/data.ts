// ============================================================================
// data.ts — 🐜✈️ the Airport Tycoon's layout, tuning and unlocks (v0.68): the FIRST AIRFIELD.
//
// Everything is in game units (1 unit = 2 mm, see scale.ts). The airfield sits in a bare dirt clearing in the
// lawn; to an ant the grass around it is a forest 47 units tall. The camera looks toward -z ("north"):
//
//        z = -58   ════════ RUNWAY (pebble edging, leaf centerline) ════════      (top of the screen)
//        z = -44   ───────── taxiway ─────────
//        z = -16   GATE 1        GATE 2                 🌼 nectar flowers
//        z =  14   🐚 TERMINAL (check-in)                          🐜 the nest
//                                                                                  (bottom: the camera)
//
// THE LOOP: 🐞 passengers walk in from the lawn → check in at the terminal (they pay a ticket: 💵 on the cash pad)
// → wait at their gate → the ladybug needs nectar (⛽ carried from the flowers to the gate's fuel pad) → board →
// taxi → take off → fly the route → land → arriving passengers get off (a landing fee 💵) → again.
// The glowing tiles hire ants who do the jobs for you: a Fuel Runner, a Check-in ant, a Banker.
// ============================================================================
import type { UnlockDef } from '../data/config';
import { mm } from './scale';

/** The save format (TycoonSave.v). */
export const TYCOON_SAVE_V = 1;

/** Tuning. Speeds are game units per second; times in seconds. */
export const TY = {
  /** A ladybug plane (a bigger lady beetle than the 6.5 mm average, so 2 passengers fit). */
  ladybugLength: mm(8),
  ladybugSeats: 2,
  /** Passengers: big aphids (a giant aphid is ~4-5 mm). */
  aphidLength: mm(3.6),
  passengerSpeed: 8,
  /** A new passenger walks in every this many seconds (while the terminal line has room). */
  arriveEvery: 6,
  queueMax: 6,
  /** Checking one passenger in (you or the Check-in ant at the desk). */
  checkInSecs: 1.1,
  /** 💵 What each passenger pays at check-in, and the landing fee per arriving passenger. */
  ticket: 8,
  landingFee: 3,
  /** ⛽ Nectar drops one flight burns, and the most a gate's fuel pad holds. */
  fuelPerFlight: 2,
  fuelMax: 8,
  /** 🌼 A flower makes one drop every this many seconds, up to `flowerMax`. */
  flowerEvery: 2.6,
  flowerMax: 10,
  /** ✈️ Boarding: wait this long for more passengers once one is aboard (if the plane isn't full). */
  boardWait: 5,
  taxiSpeed: 7,
  takeoffSpeed: 26,
  cruiseSpeed: 34,
  cruiseAlt: 46,
  /** Seconds out on the route (out of sight) before coming back. */
  routeSecs: 14,
  /** The 🗼 Control Tower: x this on taxi/route speed. */
  towerBoost: 1.3,
  /** XP. */
  xpCheckIn: 3,
  xpFuel: 1,
  xpFlight: 12,
} as const;

/** Where things stand (x, z). */
export const AT = {
  nest: { x: 30, z: 30 },
  start: { x: 22, z: 20 },
  terminal: { x: -22, z: 14 },
  gates: [
    { x: -32, z: -16 },
    { x: -6, z: -16 },
  ],
  flowers: [
    { x: 16, z: -6 },
    { x: 30, z: 4 },
  ],
  tower: { x: 52, z: -26 },
  windsock: { x: 72, z: -40 },
  hangar: { x: 38, z: -40 },
  /** The runway: centred here, running along x. */
  runway: { x: 0, z: -58, length: 170, width: 20 },
  taxiZ: -44,
  /** Passengers walk in from (and leave to) the lawn here. */
  lawnEdge: { x: 58, z: 44 },
} as const;

/** The bare-dirt clearings in the lawn (circles): the airfield, the camera side, and the runway strip. */
export const CLEARINGS = [
  { x: 0, z: 0, r: 74 },
  { x: 0, z: 52, r: 56 },
  { x: 40, z: 30, r: 44 },
  ...[-100, -55, -10, 35, 80, 115].map((x) => ({ x, z: -58, r: 34 })),
];

/** Where you can walk: inside the clearings, a little in from their edges. */
export function walkable(x: number, z: number) {
  return CLEARINGS.some((c) => Math.hypot(x - c.x, z - c.z) < c.r - 10);
}

/** The glowing tiles (bought with cash, in this order). */
export const TY_UNLOCKS: UnlockDef[] = [
  { id: 'ty-runner', name: 'Fuel Runner Ant', icon: '⛽', cost: 30, pos: [8, 6], requires: [] },
  { id: 'ty-checkin', name: 'Check-in Ant', icon: '🎫', cost: 70, pos: [-6, 24], requires: ['ty-runner'] },
  { id: 'ty-banker', name: 'Banker Ant', icon: '🏦', cost: 120, pos: [-40, 30], requires: ['ty-checkin'] },
  { id: 'ty-flower2', name: 'Nectar Flower 2', icon: '🌼', cost: 160, pos: [30, 14], requires: ['ty-runner'] },
  { id: 'ty-gate2', name: 'Gate 2 + Ladybug', icon: '🐞', cost: 450, pos: [-6, -4], requires: ['ty-banker'], level: 3 },
  { id: 'ty-runner2', name: 'Fuel Runner 2', icon: '⛽', cost: 300, pos: [20, 18], requires: ['ty-gate2', 'ty-flower2'] },
  { id: 'ty-tower', name: 'Control Tower', icon: '🗼', cost: 900, pos: [44, -14], requires: ['ty-gate2'], level: 5 },
];
