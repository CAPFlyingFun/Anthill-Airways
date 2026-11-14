// ============================================================================
// home.ts — 🏝️ ANTHILL ISLAND (test version): the numbers for the backyard.
//
// The new one-island game from the design doc ("Anthill Island: Design Doc").
// This test is the opening: two stations, each one a full little business
// (raw supply -> converter -> counter -> cash), each run by its own helpers.
//
//   🏡 THE BACKYARD: 🍞 bread box -> 🐜 ANT FARM -> 🍪 SNACK STAND, where the
//      neighbors line up with their 🙋 orders (+ the 📦 delivery crate, by hand)
//   ☕ THE CORNER CAFÉ (the next plot): 🫘 bean sacks -> COFFEE MACHINE -> café counter
//   🛒 THE CORNER STORE (the plot after it, v0.30): 🥬 grocery crates -> PACKING TABLE -> checkout
//
// At every station: a GATHERER ant (raw supply -> converter), a CARRIER ant
// (converter -> the counter), a CASHIER (a person; a 2nd one from the ⬆️ panel's
// LINE upgrade) and a BANKER ant (its cash pad -> your wallet: idle income).
//
// Units: people are AIR.humanH (2.8) tall, like the airport. Helper ants are
// small next to them (HOME.antLength), but big enough to see what they carry.
// ============================================================================
import type { UnlockDef } from './config';
import type { HumanKind } from '../actors/creatures';

export const HOME = {
  /** Where you can walk: the backyard, then the café plot east of it. */
  yard: { minX: -15, maxX: 15, minZ: -11, maxZ: 11 },
  cafePlot: { minX: 16, maxX: 36, minZ: -11, maxZ: 11 },
  /** 🛒 The Corner Store's plot, east of the café (v0.30): the same size, one gate further along. */
  storePlot: { minX: 37, maxX: 57, minZ: -11, maxZ: 11 },
  /** The gate in the east fence, between the yard and the café plot (z range). The café's east fence has the same one, to the store. */
  gate: { z0: -1, z1: 5 },
  /** Helper ants' body length (people are 2.8 tall). */
  antLength: 1.6,
  /** People walk a touch faster than the ant Major did (same as the airport). */
  speedMult: 1.15,
  /** The ant farm: seconds to turn one crumb into a snack pack. */
  farm: { cookTime: 2.2 },
  /**
   * 🍪 The snack stand by the street: your neighbors line up there with their orders
   * (a new one every `interval` seconds, about what the farm makes; 2 lines once the
   * ⬆️ panel's 2nd cashier works there). `serve` = seconds per pack handed over.
   */
  stand: { interval: 20, queueMax: 4, serve: 0.35 },
  order: {
    first: 5,      // the first neighbor wants 5 snack packs...
    second: 10,    // ...the second one 10
    min: 6,        // later orders: 6-11 packs (+1 every 3 levels, x ⬆️ Bigger orders)
    max: 11,
    pay: 7,        // $ per snack pack (+5% per level), paid onto the stand's cash pad
    xpBase: 10,    // XP for a filled order = xpBase + xpPer x packs (+ 1 XP per pack you put on the shelf)...
    xpPer: 3,
    autoXp: 0.25,  // ...a quarter of that when the cashier fills it while you're elsewhere
    firstIn: 8,    // seconds from the farm's first snack pack to the first neighbor
  },
  crate: {
    /** What each trip asks for (goods you can already make). The last one repeats. */
    asks: [
      { snack: 6, crumb: 6 },
      { snack: 8, crumb: 8 },
      { snack: 10, crumb: 10 },
    ] as Record<string, number>[],
    away: 60,      // seconds on the road before it comes back with planks
    planks: 3,     // 🪵 planks per trip
    xp: 30,
  },
  /** The café plot's gate: helpers working + planks (+ the level and price on its tile). */
  plot: { ants: 2, planks: 3 },
  /** ☕ The coffee machine: seconds to turn one sack of beans into a cup ($20 at the café). */
  coffee: { cookTime: 3.0 },
  cafe: {
    interval: 8,    // seconds between new café customers
    queueMax: 5,
    serve: 0.7,     // seconds per cup sold
  },
  chest: { cash: 150, xp: 40 },
  /** 🛒 The store plot's gate: helpers working (the yard's two + the café's two) + planks. */
  storeGate: { ants: 4, planks: 6 },
  /** 🛍️ The packing table: seconds to pack one crate of groceries into a shopping bag ($50 at the checkout). */
  packing: { cookTime: 3.2 },
  store: {
    interval: 7,    // seconds between new shoppers
    queueMax: 5,
    serve: 0.7,     // seconds per bag sold
  },
  storeChest: { cash: 600, xp: 80 },
};

/**
 * Walk-on tiles, in the order you meet them. You hire a helper where it works: the
 * farm levels (ant helpers) share one spot by the farm (only one is out at a time),
 * the stand's and the café's staff are hired at their counters. 'ai-order1' isn't a
 * tile: it's added when the first order is filled. Names are plain words (the
 * ground-text font has no emoji or accents: an unknown letter makes it fetch a
 * fallback font, which hangs offline).
 *
 * (v0.27 had the café's cashier and banker as 'ai-farm4' / 'ai-farm5' at the farm:
 * HomeWorld renames them in older saves, so those two ids are never used again.)
 */
export const HOME_UNLOCKS: UnlockDef[] = [
  // 🐜 The farm levels: a Gatherer (bread box -> farm), then a Carrier (farm -> snack stand)
  { id: 'ai-farm2', name: 'Farm Lv 2: Gatherer', icon: '🐜', cost: 40, pos: [-7.8, -6.6], requires: ['ai-order1'], level: 2 },
  { id: 'ai-farm3', name: 'Farm Lv 3: Carrier', icon: '🐜', cost: 100, pos: [-7.8, -6.6], requires: ['ai-farm2'], level: 3 },
  // 🍪 At the snack stand (the neighbors' orders): a cashier (a person) by the SELL spot, then a banker ant by its cash
  { id: 'ai-stand-cashier', name: 'Stand Cashier', icon: '🍪', cost: 150, pos: [-11.4, 6.6], requires: ['ai-farm3'], level: 4 },
  { id: 'ai-stand-banker', name: 'Stand Banker', icon: '🏦', cost: 250, pos: [0.9, 2.4], requires: ['ai-stand-cashier'], level: 5 },
  { id: 'ai-cafe', name: 'Corner Cafe Plot', icon: '☕', cost: 400, pos: [12.4, 2], requires: ['ai-farm2'], level: 7 },
  // ☕ At the café: the same four, for coffee (beans -> machine -> counter -> cash)
  { id: 'ai-cafe-gatherer', name: 'Cafe Gatherer', icon: '🐜', cost: 300, pos: [22.0, -8.4], requires: ['ai-cafe'], level: 8 },
  { id: 'ai-cafe-carrier', name: 'Cafe Carrier', icon: '🐜', cost: 400, pos: [32.6, -4.4], requires: ['ai-cafe-gatherer'], level: 9 },
  { id: 'ai-cashier', name: 'Cafe Cashier', icon: '☕', cost: 500, pos: [20.4, 5.6], requires: ['ai-cafe-carrier'], level: 10 },
  { id: 'ai-banker', name: 'Cafe Banker', icon: '🏦', cost: 700, pos: [21.3, -2.8], requires: ['ai-cashier'], level: 11 },
  // 🛒 The Corner Store (v0.30): its plot (the tile is by the café's east gate), then the same four, for groceries
  { id: 'ai-store', name: 'Corner Store Plot', icon: '🛒', cost: 2500, pos: [34.2, -1.7], requires: ['ai-cafe-gatherer'], level: 12 }, // (north of the gate: the café's line stands in front of it)
  { id: 'ai-store-gatherer', name: 'Store Gatherer', icon: '🐜', cost: 1500, pos: [43.0, -8.4], requires: ['ai-store'], level: 13 },
  { id: 'ai-store-carrier', name: 'Store Carrier', icon: '🐜', cost: 2000, pos: [53.6, -4.4], requires: ['ai-store-gatherer'], level: 14 },
  { id: 'ai-store-cashier', name: 'Store Cashier', icon: '🛒', cost: 2500, pos: [41.4, 5.6], requires: ['ai-store-carrier'], level: 15 },
  { id: 'ai-store-banker', name: 'Store Banker', icon: '🏦', cost: 3500, pos: [42.3, -2.8], requires: ['ai-store-cashier'], level: 16 },
];

/** Old unlock ids -> new ones (see above). */
export const HOME_RENAMED: Record<string, string> = { 'ai-farm4': 'ai-cashier', 'ai-farm5': 'ai-banker' };

/**
 * The neighbors who come by with orders, in turn. Each name goes with a people model
 * that fits it (men: h-director (grey hair), h-ember, h-crew1, h-crew2; women: h-exec,
 * h-balance, h-crew3, h-crew4, h-sarah).
 */
export const NEIGHBORS: { name: string; kind: HumanKind }[] = [
  { name: 'Rosa', kind: 'h-balance' },
  { name: 'Mr. Lee', kind: 'h-crew1' },
  { name: 'Mia', kind: 'h-crew3' },
  { name: 'Grandpa Joe', kind: 'h-director' },
  { name: 'Mrs. Patel', kind: 'h-exec' },
  { name: 'Coach Dan', kind: 'h-ember' },
  { name: 'Emma', kind: 'h-sarah' },
  { name: 'Sam', kind: 'h-crew2' },
];
