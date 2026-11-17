// ============================================================================
// data.ts — 🐜✈️ the Airport Tycoon's layout, tuning and unlocks (v0.68): the FIRST AIRFIELD.
//
// Everything is in game units (1 unit = 2 mm, see scale.ts). The airfield sits in a bare dirt clearing in the
// lawn; to an ant the grass around it is a forest 47 units tall. The camera looks toward -z ("north"):
//
//        z = -58   ════════ RUNWAY (pebble edging, leaf centerline) ════════      (top of the screen)
//        z = -36   ───────── taxiway ─────────   (each gate's link runs up to the runway, with a 🗼 HOLD line)
//        z = -16   GATE 1        GATE 2                 🌼 nectar flowers
//        z =  14   🐚 TERMINAL (check-in)                          🐜 the nest
//                                                                                  (bottom: the camera)
//
// THE LOOP: 🐞 passengers walk in from the lawn → check in at the terminal (they pay a ticket: 💵 on the cash pad,
// and their 🧳 seed-bag goes to the BAG DROP) → wait at their gate → the plane needs nectar (⛽ carried from the
// flowers to the gate's FUEL pad) and its passengers' bags (🧳 carried from the BAG DROP to the gate's BAGS pad)
// → board → taxi to the hold line → 🗼 the tower clears it (one bug on the runway at a time) → fly the route →
// circle until it's cleared to land → land → arriving passengers get off (a landing fee 💵) → again.
// The glowing tiles hire ants who do the jobs for you: a Fuel Runner, a Check-in ant, a Baggage ant, a Banker.
// (v0.69: bags, the runway queue, the flight card and 📅 daily goals came from AirportPRG.)
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
  /** 🐝 Bee Shuttles (an upgrade): every gate flies a honey bee instead, 3 seats. */
  beeLength: mm(13),
  /** Passengers: big aphids (a giant aphid is ~4-5 mm). */
  aphidLength: mm(3.6),
  passengerSpeed: 8,
  /** A new passenger walks in every this many seconds (while the terminal line has room). */
  arriveEvery: 6,
  queueMax: 8,
  /** Checking one passenger in (you or the Check-in ant at the desk). */
  checkInSecs: 1.1,
  /** 💵 What each passenger pays at check-in, and the landing fee per arriving passenger. */
  ticket: 8,
  landingFee: 3,
  /** 🍪 The Nectar Café: what a snack sells for, and how long a passenger waits at the café for one. */
  snackPrice: 5,
  cafeWait: 4,
  /** ⛽ Nectar drops one flight burns, and the most a gate's fuel pad holds. */
  fuelPerFlight: 2,
  fuelMax: 8,
  /** 🌼 A flower makes one drop every this many seconds, up to `flowerMax`. */
  flowerEvery: 2.6,
  flowerMax: 10,
  /** ✈️ Boarding: wait this long for more passengers once one is aboard (if the plane isn't full). */
  boardWait: 3,
  taxiSpeed: 10,
  takeoffSpeed: 30,
  cruiseSpeed: 34,
  cruiseAlt: 46,
  /** Seconds out on the route (out of sight) before coming back. */
  routeSecs: 9,
  /** The 🗼 Control Tower: x this on taxi/route speed. */
  towerBoost: 1.3,
  /** 🧳 Seed-bags: the BAG DROP holds this many (check-in waits when it's full), each gate's BAGS pad, and how
   *  many a Baggage ant carries (more than other ants: bags are light, and there are a lot of them). */
  bagDropMax: 16,
  bagPadMax: 6,
  bagCarry: 8,
  /** 🗼 The tower clears a plane this long after it reaches the HOLD line / the holding pattern (by itself). */
  towerDelay: 0.6,
  /** The holding pattern: arrivals circle this high (each gate 3 higher) and this wide until cleared to land. */
  holdAlt: 22,
  holdRadius: 16,
  /** 🎁 The Pollen Gift Shop (v0.70): a souvenir's price, how often it makes one, how many fit on its counter. */
  shopPrice: 7,
  shopEvery: 2.6,
  shopMax: 6,
  /** 👑 The VIP Lounge (v0.70): the share of travellers who are VIPs once it's open, their ticket (× a normal
   *  one), the lounge fee they pay, and how long they relax there. */
  vipShare: 0.25,
  vipTicket: 3,
  loungeFee: 10,
  loungeSecs: 2.5,
  /** ♻️ The Recycler (v0.71): nectar in for one drop of JET FUEL (worth a whole flight on a FUEL pad), what it
   *  pays for anything else (crumbs, sweets, litter), and how fast it works. 🗑️ A bin shows FULL at `binFull`
   *  wrappers and holds `binMax` before they're lost. */
  recycleNectar: 3,
  recyclePay: 3,
  recycleEvery: 0.7,
  binFull: 8,
  binMax: 12,
  /** 📦 Cargo (v0.90): what a crate pays at take-off (× the route's fare), how often the depot packs one, how many
   *  wait on its dock, the most a gate's CARGO pad holds, and how many a Cargo ant carries. */
  cargoPrice: 15,
  cargoEvery: 2.4,
  cargoMax: 12,
  cargoPadMax: 14,
  cargoCarry: 6,
  /** XP. */
  xpCheckIn: 3,
  xpFuel: 1,
  xpBag: 1,
  xpFlight: 12,
} as const;

/** Where things stand (x, z). */
export const AT = {
  nest: { x: 48, z: 32 },
  start: { x: 30, z: 22 },
  terminal: { x: -22, z: 14 },
  /** Four gates in a row (v0.68.2): 1 to start, 2-4 bought. Each has its own link to the runway, just west of it. */
  gates: [
    { x: -34, z: -16 },
    { x: -10, z: -16 },
    { x: 14, z: -16 },
    { x: 38, z: -16 },
    // (v0.88 🛫 THE NORTH FIELD: Gates 5 to 8, the same row again on the far side of the runway, with a runway of their own)
    { x: -34, z: -100 },
    { x: -10, z: -100 },
    { x: 14, z: -100 },
    { x: 38, z: -100 },
  ],
  flowers: [
    { x: 12, z: 16 },
    { x: 32, z: 12 },
    // (v0.88: the north field's own nectar flower, east of Gate 8)
    { x: 64, z: -94 },
  ],
  /** 📦 The cargo depot (v0.90): on the open ground south-west of the terminal, between the picnic crumbs and the
   *  ANTHILL AIRWAYS sign (west of Gate 1 was tried first: the crumbs' bread crust lies over it). */
  cargo: { x: -50, z: 23 },
  /** 🚸 The crossing over the runway and its taxiway (v0.88): where travellers and ants walk to the north field. */
  crossing: { x: -62, south: -29, north: -73 },
  /** 🍪 The café's kitchen (an oven outside the terminal's west wall) and its crumb pile (picnic crumbs). */
  oven: { x: -42, z: 0 },
  crumbs: { x: -60, z: 14 },
  /** The café counter, inside the terminal (in the terminal's own space: left of the check-in counter). */
  cafeLocal: { x: -9, z: 1.5 },
  tower: { x: 62, z: -30 },
  /** 🧳 The BAG DROP: bags slide out of the terminal here (just outside its airside doorway). */
  bagDrop: { x: 0, z: 1 },
  /** ⬆️ The STAFF OFFICE (upgrades for every ant job): inside the terminal, left of the check-in ant (in the
   *  terminal's own space; v0.71: it was a pad out by the nest). */
  staffLocal: { x: -3.5, z: -5.75 },
  /** 🗑️ The trash bins: by the flowers, outside the terminal's front door, by the gates. */
  bins: [
    { x: 22, z: 19 },
    { x: -13, z: 34 },
    { x: 2, z: -10 },
  ],
  /** ♻️ The Recycler: on the open ground east of the terminal's front door (clear of the tall flowers). */
  recycler: { x: 6, z: 28 },
  /** 🎁 The Pollen Gift Shop's counter, inside the terminal (in its own space: right of the line). */
  shopLocal: { x: 10, z: 5 },
  /** 👑 The VIP Lounge: a leaf sofa on a red carpet, between the terminal and Gates 1-2. */
  lounge: { x: -20, z: -1 },
  /** 🗼 The holding pattern's centre: over the runway's far (west) end, where arrivals circle. */
  hold: { x: -102, z: -62 },
  windsock: { x: 74, z: -42 },
  /** 🛖 The hangar (v0.72.1: nearly twice the size, on the open ground east of the flowers, its door to the field). */
  hangar: { x: 66, z: 6 },
  /** The runway: centred here, running along x. */
  runway: { x: 0, z: -58, length: 170, width: 20 },
  /** The taxiway along the north of the gates (v0.69: moved 8 closer to the gates so each link has room for its
   *  🗼 HOLD line before the runway). */
  taxiZ: -36,
  /** Passengers walk in from the lawn here, and arriving passengers walk off into the lawn here (west). */
  lawnEdge: { x: 62, z: 50 },
  lawnExit: { x: -84, z: 18 },
} as const;

/**
 * v0.88 🛫 THE FIELDS. Joshua, maxed out: "we should add more to the game"; of the bigger airport, "Yes! Keep going".
 * The airport is two fields now: the first, as it always was (Gates 1 to 4 and their runway), and the NORTH FIELD
 * beyond it: Gates 5 to 8 in the same row again, 84 units further north, with their own taxiway, their own runway
 * and their own holding pattern. Each runway takes one bug at a time, so the north field's planes never wait for
 * the first field's. A plane, a taxiway and a HOLD line belong to their gate's field (`fieldOf`).
 */
export interface FieldDef {
  runway: { x: number; z: number; length: number; width: number };
  taxiZ: number;
  hold: { x: number; z: number };
  /** Its first gate's number (from 0), and the tile that builds it (null: there from the start). */
  first: number;
  unlock: string | null;
}
export const GATES_PER_FIELD = 4;
export const NORTH_BY = -84;
export const FIELDS: FieldDef[] = [
  { runway: AT.runway, taxiZ: AT.taxiZ, hold: AT.hold, first: 0, unlock: null },
  {
    runway: { ...AT.runway, z: AT.runway.z + NORTH_BY }, taxiZ: AT.taxiZ + NORTH_BY, hold: { x: AT.hold.x, z: AT.hold.z + NORTH_BY },
    first: GATES_PER_FIELD, unlock: 'ty-gate5',
  },
];
/** The field gate `i` (from 0) belongs to. */
export const fieldOf = (gate: number) => FIELDS[Math.min(FIELDS.length - 1, Math.floor(gate / GATES_PER_FIELD))];

/** The bare-dirt clearings in the lawn (circles): the airfield, the camera side, and the runway strip. */
/** (The first field's own: as they were before the north field. What lies about on the dirt is still dealt by these.) */
export const CLEARINGS_FIRST = [
  { x: 0, z: 0, r: 74 },
  { x: 0, z: 52, r: 56 },
  { x: 40, z: 30, r: 44 },
  // (v0.72.1: the 🛖 hangar's ground, so the grass doesn't lean in over its back wall)
  { x: 70, z: 6, r: 25 },
  ...[-100, -55, -10, 35, 80, 115].map((x) => ({ x, z: -58, r: 34 })),
];
export const CLEARINGS = [
  ...CLEARINGS_FIRST,
  // (v0.88: the north field: its gates' apron, and its runway's strip)
  ...[-64, -22, 20, 62].map((x) => ({ x, z: -102, r: 38 })),
  ...[-100, -55, -10, 35, 80, 115].map((x) => ({ x, z: AT.runway.z + NORTH_BY, r: 34 })),
];

/** Where you can walk: inside the clearings, a little in from their edges. */
export function walkable(x: number, z: number) {
  return CLEARINGS.some((c) => Math.hypot(x - c.x, z - c.z) < c.r - 10);
}

/** The glowing tiles (bought with cash, in this order). v0.73: a BUILDING's tile sits at the middle of where it
 *  will stand (buying it moves you out to its front); the tower's is at its door (the tower's already there, dark),
 *  and the gift shop's is outside the terminal (a tile under the roof couldn't be seen). No tile stands just north of a
 *  nectar flower: from the camera, the flower's head covers the ground there. */
export const TY_UNLOCKS: UnlockDef[] = [
  { id: 'ty-runner', name: 'Fuel Runner Ant', icon: '⛽', cost: 30, pos: [-2, 8], requires: [] },
  { id: 'ty-checkin', name: 'Check-in Ant', icon: '🎫', cost: 70, pos: [-6, 24], requires: ['ty-runner'] },
  { id: 'ty-bags', name: 'Baggage Ant', icon: '🧳', cost: 60, pos: [0, -5], requires: ['ty-checkin'] },
  { id: 'ty-banker', name: 'Banker Ant', icon: '🏦', cost: 120, pos: [-40, 30], requires: ['ty-checkin'] },
  { id: 'ty-flower2', name: 'Nectar Flower 2', icon: '🌼', cost: 160, pos: [32, 12], requires: ['ty-runner'] },
  { id: 'ty-gate2', name: 'Gate 2 + Ladybug', icon: '🐞', cost: 400, pos: [-10, -16], requires: ['ty-banker'], level: 3 },
  { id: 'ty-runner2', name: 'Fuel Runner 2', icon: '⛽', cost: 280, pos: [20, 34], requires: ['ty-gate2', 'ty-flower2'] },
  { id: 'ty-gate3', name: 'Gate 3 + Ladybug', icon: '🐞', cost: 800, pos: [14, -16], requires: ['ty-gate2'], level: 5 },
  { id: 'ty-tower', name: 'Control Tower', icon: '🗼', cost: 900, pos: [53, -27], requires: ['ty-gate2'], level: 5 },
  { id: 'ty-cafe', name: 'Nectar Café', icon: '🍪', cost: 220, pos: [-42, 0], requires: ['ty-banker'], level: 3 },
  { id: 'ty-crumbs', name: 'Crumb Runner Ant', icon: '🍪', cost: 200, pos: [-50, 10], requires: ['ty-cafe'] },
  { id: 'ty-chef', name: 'Chef Ant (faster oven)', icon: '🔥', cost: 650, pos: [-30, -2], requires: ['ty-crumbs'], level: 5 },
  // (v0.72: the 🛖 hangar: new aircraft are unlocked, and upgraded, in its menu; the fleet tiles are gone)
  { id: 'ty-hangar', name: 'Hangar (your fleet)', icon: '🛖', cost: 600, pos: [66, 6], requires: ['ty-gate2'], level: 4 },
  { id: 'ty-gate4', name: 'Gate 4 + Plane', icon: '✈️', cost: 1800, pos: [38, -16], requires: ['ty-gate3'], level: 7 },
  { id: 'ty-runner3', name: 'Fuel Runner 3', icon: '⛽', cost: 700, pos: [32, 32], requires: ['ty-gate4'] },
  { id: 'ty-bags2', name: 'Baggage Ant 2', icon: '🧳', cost: 320, pos: [-6, 2], requires: ['ty-gate2', 'ty-bags'] },
  // ---- v0.71: ♻️ the recycler and the 🧹 janitor ----
  { id: 'ty-recycler', name: 'Recycler (nectar → jet fuel)', icon: '♻️', cost: 500, pos: [6, 28], requires: ['ty-cafe'], level: 4 },
  { id: 'ty-janitor', name: 'Janitor Ant', icon: '🧹', cost: 350, pos: [12, 36], requires: ['ty-recycler'] },
  // ---- v0.70: 🗺️ routes, ✈️ fleet, 🎁 the gift shop, 👑 the VIP lounge ----
  { id: 'ty-route-picnic', name: 'Route: 🧺 Picnic Table (fare ×1.5)', icon: '🗺️', cost: 450, pos: [-40, 44], requires: ['ty-banker'], level: 4 },
  { id: 'ty-route-log', name: 'Route: 🪵 Fallen Log Town (×2)', icon: '🗺️', cost: 1100, pos: [-32, 50], requires: ['ty-route-picnic'], level: 6 },
  { id: 'ty-route-tide', name: 'Route: 🐚 Tide Pool (×2.6)', icon: '🗺️', cost: 2600, pos: [-24, 54], requires: ['ty-route-log'], level: 9 },
  { id: 'ty-route-lizard', name: 'Route: 🦎 Lizard Rock (×3.3)', icon: '🗺️', cost: 5500, pos: [-16, 58], requires: ['ty-route-tide'], level: 12 },
  { id: 'ty-shop', name: 'Pollen Gift Shop', icon: '🎁', cost: 600, pos: [2, 16], requires: ['ty-cafe'], level: 5 },
  { id: 'ty-lounge', name: 'VIP Lounge (VIPs pay ×3)', icon: '👑', cost: 1500, pos: [-20, -1], requires: ['ty-gate2'], level: 7 },
  { id: 'ty-bags3', name: 'Baggage Ant 3', icon: '🧳', cost: 750, pos: [4, -6], requires: ['ty-gate3', 'ty-bags2'] },
  // ---- v0.88: 🛫 the north field: a second runway and Gates 5 to 8, and help to keep them running ----
  { id: 'ty-gate5', name: 'North Field: Runway 2 + Gate 5', icon: '🛫', cost: 60000, pos: [-34, -100], requires: ['ty-gate4'], level: 16 },
  { id: 'ty-gate6', name: 'Gate 6 + Plane', icon: '✈️', cost: 45000, pos: [-10, -100], requires: ['ty-gate5'], level: 18 },
  { id: 'ty-gate7', name: 'Gate 7 + Plane', icon: '✈️', cost: 65000, pos: [14, -100], requires: ['ty-gate6'], level: 20 },
  { id: 'ty-gate8', name: 'Gate 8 + Plane', icon: '✈️', cost: 90000, pos: [38, -100], requires: ['ty-gate7'], level: 22 },
  { id: 'ty-flower3', name: 'Nectar Flower 3 (north field)', icon: '🌼', cost: 15000, pos: [64, -94], requires: ['ty-gate5'] },
  { id: 'ty-runner4', name: 'Fuel Runner 4', icon: '⛽', cost: 12000, pos: [54, -84], requires: ['ty-flower3'] },
  { id: 'ty-bags4', name: 'Baggage Ant 4', icon: '🧳', cost: 12000, pos: [-52, -84], requires: ['ty-gate5'] },
  { id: 'ty-runner5', name: 'Fuel Runner 5', icon: '⛽', cost: 20000, pos: [48, -78], requires: ['ty-runner4', 'ty-gate7'] },
  { id: 'ty-bags5', name: 'Baggage Ant 5', icon: '🧳', cost: 20000, pos: [-44, -78], requires: ['ty-bags4', 'ty-gate7'] },
  // ---- v0.90: 📦 cargo: every departing plane can carry freight in its hold ----
  { id: 'ty-cargo', name: 'Cargo Depot (freight on every flight)', icon: '📦', cost: 50000, pos: [-50, 23], requires: ['ty-gate4'], level: 16 },
  { id: 'ty-cargoant', name: 'Cargo Ant', icon: '📦', cost: 15000, pos: [-57, 18], requires: ['ty-cargo'] },
  { id: 'ty-cargoant2', name: 'Cargo Ant 2', icon: '📦', cost: 25000, pos: [-52, 31], requires: ['ty-cargoant'] },
  { id: 'ty-cargoant3', name: 'Cargo Ant 3', icon: '📦', cost: 40000, pos: [-58, 25], requires: ['ty-cargoant2', 'ty-gate5'] },
];
