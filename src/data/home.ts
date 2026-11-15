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
  /** The street businesses' lots (STREET_LOTS, below): each this wide and this deep, a 1-unit gap between them. */
  lotWidth: 22,
  lotZ: { minZ: -11, maxZ: 11 },
  /** Where the bays stand: on the sidewalk, at the curb. */
  curbZ: 13.9,
};

/**
 * 🚗 THE STREET BUSINESSES (v0.47): the lots along the street east of the Corner Store, on the way to the airport.
 * Each is an open forecourt you walk onto from the sidewalk, with two bays at the curb that cars pull up to
 * (world/carService.ts), a kiosk at the back, a cash pad, and (where goods are used up) a supply pile and a rack.
 *
 * Everything about one is here: where it is, what its gate asks for, what it costs, what its cars buy.
 * PRICES: from the car wash on, 20% dearer than the trend the yard, café, store and gas station set (Joshua,
 * 2026-11-14: "increase the prices of everything by 20% after the gas station"). A FIRST PASS: to be tuned from play.
 */
export interface StreetLotDef {
  key: string;            // also its unlock ids: ai-<key>, ai-<key>-carrier, ai-<key>-<staff.id>, ai-<key>-banker
  kind: 'gas' | 'wash' | 'garage' | 'diner' | 'bakery' | 'post' | 'bank' | 'laundry' | 'fire' | 'police' | 'pharmacy' | 'hospital' | 'taxi' | 'motel' | 'parking' | 'airport';
  /** The sign over its bays (else its key in capitals) and its banker's name (else '<Key> Banker'). */
  sign?: string;
  bankerName?: string;
  minX: number;           // the lot's west edge along the street
  name: string;
  icon: string;
  /** The forecourt's colour on the ground and the map; the kiosk's and the bays' colours. */
  fill: string;
  wall: number;
  trim: number;
  /** Its gate: helpers working + planks, the tile that must be owned before its own tile shows, the level its tile asks. */
  gate: { ants: number; planks: number };
  after: string;
  level: number;
  costs: { plot: number; carrier?: number; staff: number; banker: number };
  /** What a car uses up (null: nothing: a wash) and what each one pays; seconds between cars; units a car takes; seconds per unit. */
  item: 'fuel' | 'part' | 'meal' | 'bread' | 'parcel' | 'laundry' | 'extinguisher' | 'medicine' | 'medkit' | 'luggage' | null;
  unitValue: number;
  interval: number;
  wants: [number, number];
  serve: number;
  /** A delivery truck fills the supply pile (else it restocks by itself). */
  truck?: { every: number; load: number };
  /** The carrier ant (only where goods are used up), the person who serves, and the second one. */
  carrier?: { name: string; title: string; hat: number };
  staff: { id: string; name: string; title: string; kind: HumanKind; title2: string; kind2: HumanKind };
  /** What the banner says when it opens. */
  how: string;
}

/**
 * 🪵 PLANKS FROM INCOME (v0.60; Joshua, 2026-11-15: "you gain 0.01% planks per minute based on money amount per
 * minute, so if you're making 100k per minute, you will gain 10 planks a minute... divide that amount by 60 so it
 * can slowly climb"). Planks a second = income a second x this. Offline too, at the same share as the cash.
 */
export const PLANKS_PER_DOLLAR = 0.0001;

export const STREET_LOTS: StreetLotDef[] = [
  {
    key: 'gas', kind: 'gas', minX: 58, name: 'Gas Station', icon: '⛽', fill: '#c9ccd1', wall: 0xf4f1ea, trim: 0xd62828,
    gate: { ants: 6, planks: 10 }, after: 'ai-store-gatherer', level: 17,
    costs: { plot: 9000, carrier: 5000, staff: 7000, banker: 9000 },
    // (about $720 a car, a car a minute at each pump)
    item: 'fuel', unitValue: 90, interval: 9, wants: [6, 10], serve: 0.5,
    truck: { every: 36, load: 18 },
    carrier: { name: 'Fuel Carrier', title: '🐜 FUEL CARRIER', hat: 0xd62828 },
    staff: { id: 'attendant', name: 'Pump Attendant', title: '⛽ ATTENDANT', kind: 'h-ember', title2: '⛽ ATTENDANT 2', kind2: 'h-crew1' },
    how: '🚚 The tanker fills the depot → carry the cans to the rack by the pumps → stand at the pumps to fill the cars.',
  },
  {
    key: 'wash', kind: 'wash', minX: 81, name: 'Car Wash', icon: '🚿', fill: '#bcd7ea', wall: 0xe8f4ff, trim: 0x2a7fd6,
    gate: { ants: 7, planks: 12 }, after: 'ai-gas-carrier', level: 21,
    costs: { plot: 21500, staff: 14500, banker: 18000 },
    // (nothing to carry: $450 a wash, 7 seconds each: about $600 a minute at each bay, hands off once the Washer is hired)
    item: null, unitValue: 450, interval: 9, wants: [1, 1], serve: 7,
    staff: { id: 'washer', name: 'Car Washer', title: '🚿 WASHER', kind: 'h-crew2', title2: '🚿 WASHER 2', kind2: 'h-crew4' },
    how: '🚗 Cars pull up at the curb → stand at the bays while they are washed → they pay when it is done. Nothing to carry!',
  },
  {
    key: 'garage', kind: 'garage', minX: 104, name: 'Repair Garage', icon: '🔧', fill: '#d6cdbd', wall: 0xf1ead9, trim: 0xf4a000,
    gate: { ants: 7, planks: 15 }, after: 'ai-wash-washer', level: 24,
    costs: { plot: 48000, carrier: 24000, staff: 36000, banker: 42000 },
    // (big, slow jobs: 3 or 4 parts at $600 each, 4 seconds a part: about $2,100 a car, a car a minute at each lift)
    item: 'part', unitValue: 600, interval: 12, wants: [3, 4], serve: 4,
    carrier: { name: 'Parts Carrier', title: '🐜 PARTS CARRIER', hat: 0xf4a000 },
    staff: { id: 'mechanic', name: 'Mechanic', title: '🔧 MECHANIC', kind: 'h-crew1', title2: '🔧 MECHANIC 2', kind2: 'h-ember' },
    how: '🔩 Carry boxes of parts to the rack by the lifts → stand there while each part is fitted. A slow job, a big bill.',
  },
  {
    // 🍔 THE DRIVE-THRU DINER (v0.55; the fourth street business on Joshua's roadmap, 2026-11-14: "1 Gas station,
    // 2 Car wash, 3 Repair garage, 4 Diner/drive-thru"). The busy one: cars come quicker than anywhere else and
    // each takes 2 to 4 meals, handed over fast, so it is the rack that runs dry: the Meal Carrier matters most here.
    key: 'diner', kind: 'diner', minX: 127, name: 'Drive-Thru Diner', icon: '🍔', fill: '#e9c9a6', wall: 0xfff3e0, trim: 0xc1121f,
    gate: { ants: 8, planks: 18 }, after: 'ai-garage-mechanic', level: 28,
    costs: { plot: 105000, carrier: 52000, staff: 78000, banker: 92000 },
    // (2 to 4 meals at $1,300, 1.2 seconds a meal: about $3,900 a car, a car every 40 seconds or so at each window)
    item: 'meal', unitValue: 1300, interval: 7, wants: [2, 4], serve: 1.2,
    carrier: { name: 'Meal Carrier', title: '🐜 MEAL CARRIER', hat: 0xc1121f },
    staff: { id: 'server', name: 'Drive-Thru Server', title: '🍔 SERVER', kind: 'h-crew4', title2: '🍔 SERVER 2', kind2: 'h-crew2' },
    how: '🍔 Carry meal bags from the kitchen to the rack by the windows → stand there to hand them to the cars. Fast and busy!',
  },
  // ---------------------------------------------------------------------------------------------------------
  // WAVES 3 TO 5 (v0.56, built overnight 2026-11-15 at Joshua's ask: "complete all the areas overnight and save it
  // all to your branch... up to the hospital and airport"). His roadmap, in his order: bakery, post office, bank,
  // laundromat (wave 3); fire station, police, pharmacy, hospital (wave 4); bus/taxi, motel, airport parking and
  // the airport (wave 5). Each is a street lot like the four before it, of one of the three sorts there are:
  // carry-and-serve from a pile that restocks (like the garage), carry-and-serve from a pile a truck fills (like
  // the gas station), or served by time alone with nothing to carry (like the car wash).
  // FIRST-PASS NUMBERS, by rule and not yet by play: each plot costs 1.55x the one before, each car's bill is
  // about 1.5x the one before, the helper tiles are 50% / 75% / 88% of the plot, a plot's level is 2 above the
  // last one's. To be tuned from Joshua's playthrough.
  // ---------------------------------------------------------------------------------------------------------
  {
    key: 'bakery', kind: 'bakery', minX: 150, name: 'Bakery', icon: '🥖', fill: '#ecd9b0', wall: 0xfff0d2, trim: 0xb5651d,
    gate: { ants: 8, planks: 19 }, after: 'ai-diner-server', level: 31,
    costs: { plot: 165000, carrier: 82500, staff: 124000, banker: 145000 },
    item: 'bread', unitValue: 2000, interval: 7, wants: [2, 4], serve: 1.0,
    carrier: { name: 'Bread Carrier', title: '🐜 BREAD CARRIER', hat: 0xb5651d },
    staff: { id: 'baker', name: 'Baker', title: '🥖 BAKER', kind: 'h-exec', title2: '🥖 BAKER 2', kind2: 'h-crew1' },
    how: '🥖 Carry warm loaves from the oven to the rack by the windows → stand there to hand them to the cars.',
  },
  {
    key: 'post', kind: 'post', minX: 173, name: 'Post Office', icon: '📮', fill: '#c9d6ea', wall: 0xeef3fb, trim: 0x1d4e9e,
    gate: { ants: 8, planks: 20 }, after: 'ai-bakery-baker', level: 33,
    costs: { plot: 256000, carrier: 128000, staff: 192000, banker: 225000 },
    item: 'parcel', unitValue: 4500, interval: 8, wants: [1, 3], serve: 1.5,
    truck: { every: 40, load: 20 },
    carrier: { name: 'Parcel Carrier', title: '🐜 PARCEL CARRIER', hat: 0x1d4e9e },
    staff: { id: 'clerk', name: 'Postal Clerk', title: '📮 CLERK', kind: 'h-crew2', title2: '📮 CLERK 2', kind2: 'h-exec' },
    how: '📮 The mail truck fills the depot → carry parcels to the rack → stand at the windows while the cars collect them.',
  },
  {
    key: 'bank', kind: 'bank', minX: 196, name: 'Bank', icon: '🏦', fill: '#d3dccb', wall: 0xf2f5ec, trim: 0x2e7d32, bankerName: 'Bank Runner',
    gate: { ants: 8, planks: 21 }, after: 'ai-post-clerk', level: 35,
    costs: { plot: 396500, staff: 297500, banker: 349000 },
    item: null, unitValue: 13500, interval: 8, wants: [1, 1], serve: 5,
    staff: { id: 'teller', name: 'Bank Teller', title: '🏦 TELLER', kind: 'h-director', title2: '🏦 TELLER 2', kind2: 'h-exec' },
    how: '🏦 A drive-up bank: cars pull up, you stand at the teller posts while each one is served. Nothing to carry, big bills.',
  },
  {
    key: 'laundry', kind: 'laundry', minX: 219, name: 'Laundromat', icon: '🧺', fill: '#cfe3e6', wall: 0xeefafa, trim: 0x00838f,
    gate: { ants: 8, planks: 22 }, after: 'ai-bank-teller', level: 37,
    costs: { plot: 614500, carrier: 307000, staff: 461000, banker: 540500 },
    item: 'laundry', unitValue: 13500, interval: 9, wants: [1, 2], serve: 4,
    carrier: { name: 'Laundry Carrier', title: '🐜 LAUNDRY CARRIER', hat: 0x00838f },
    staff: { id: 'washer', name: 'Laundry Attendant', title: '🧺 ATTENDANT', kind: 'h-crew4', title2: '🧺 ATTENDANT 2', kind2: 'h-crew2' },
    how: '🧺 Carry clean laundry to the rack by the drop-off posts → stand there while each car is loaded. Slow, well paid.',
  },
  {
    key: 'fire', kind: 'fire', minX: 242, name: 'Fire Station', icon: '🚒', fill: '#e6c6c0', wall: 0xfbeeea, trim: 0xb71c1c,
    gate: { ants: 8, planks: 23 }, after: 'ai-laundry-washer', level: 39,
    costs: { plot: 952500, carrier: 476000, staff: 714500, banker: 838000 },
    item: 'extinguisher', unitValue: 20000, interval: 10, wants: [1, 2], serve: 3,
    carrier: { name: 'Gear Carrier', title: '🐜 GEAR CARRIER', hat: 0xb71c1c },
    staff: { id: 'firefighter', name: 'Firefighter', title: '🚒 FIREFIGHTER', kind: 'h-ember', title2: '🚒 FIREFIGHTER 2', kind2: 'h-crew1' },
    how: '🧯 Cars stop for fire-safety gear: carry extinguishers to the rack by the hydrants → stand there to fit each one.',
  },
  {
    key: 'police', kind: 'police', minX: 265, name: 'Police Station', icon: '🚓', fill: '#c4cbe0', wall: 0xeceff8, trim: 0x1a237e,
    gate: { ants: 8, planks: 24 }, after: 'ai-fire-firefighter', level: 41,
    costs: { plot: 1476000, staff: 1107000, banker: 1299000 },
    item: null, unitValue: 45000, interval: 10, wants: [1, 1], serve: 6,
    staff: { id: 'officer', name: 'Desk Officer', title: '🚓 OFFICER', kind: 'h-crew1', title2: '🚓 OFFICER 2', kind2: 'h-crew4' },
    how: '🚓 The permit window: cars pull up, you stand at the booths while each permit is checked and stamped. Nothing to carry.',
  },
  {
    key: 'pharmacy', kind: 'pharmacy', minX: 288, name: 'Pharmacy', icon: '💊', fill: '#cfe8d2', wall: 0xf1fbf2, trim: 0x2e9e4f,
    gate: { ants: 8, planks: 25 }, after: 'ai-police-officer', level: 43,
    costs: { plot: 2288000, carrier: 1144000, staff: 1716000, banker: 2013500 },
    item: 'medicine', unitValue: 34000, interval: 8, wants: [1, 3], serve: 1.5,
    truck: { every: 44, load: 18 },
    carrier: { name: 'Medicine Carrier', title: '🐜 MEDICINE CARRIER', hat: 0x2e9e4f },
    staff: { id: 'pharmacist', name: 'Pharmacist', title: '💊 PHARMACIST', kind: 'h-exec', title2: '💊 PHARMACIST 2', kind2: 'h-crew2' },
    how: '💊 The supply van fills the depot → carry medicine to the rack → stand at the drive-up windows while the cars collect.',
  },
  {
    key: 'hospital', kind: 'hospital', minX: 311, name: 'Hospital', icon: '🏥', fill: '#e2e6ea', wall: 0xffffff, trim: 0xd32f2f,
    gate: { ants: 8, planks: 26 }, after: 'ai-pharmacy-pharmacist', level: 45,
    costs: { plot: 3546500, carrier: 1773500, staff: 2660000, banker: 3121000 },
    item: 'medkit', unitValue: 40000, interval: 10, wants: [2, 3], serve: 3,
    carrier: { name: 'Supply Carrier', title: '🐜 SUPPLY CARRIER', hat: 0xd32f2f },
    staff: { id: 'nurse', name: 'Nurse', title: '🏥 NURSE', kind: 'h-exec', title2: '🏥 NURSE 2', kind2: 'h-crew4' },
    how: '🏥 The drive-up clinic: carry medical kits from the stores to the rack → stand at the bays while each visitor is seen.',
  },
  {
    key: 'taxi', kind: 'taxi', minX: 334, name: 'Bus & Taxi Stand', icon: '🚕', fill: '#eadf9f', wall: 0xfff8d6, trim: 0xf9a825, sign: '🚕 TAXI & BUS', bankerName: 'Stand Runner',
    gate: { ants: 8, planks: 27 }, after: 'ai-hospital-nurse', level: 47,
    costs: { plot: 5497000, staff: 4123000, banker: 4837500 },
    item: null, unitValue: 150000, interval: 7, wants: [1, 1], serve: 3,
    staff: { id: 'dispatcher', name: 'Dispatcher', title: '🚕 DISPATCHER', kind: 'h-crew2', title2: '🚕 DISPATCHER 2', kind2: 'h-ember' },
    how: '🚕 Rides pull up, you stand at the stand while the riders board, and each ride pays its fare. Quick and steady.',
  },
  {
    key: 'motel', kind: 'motel', minX: 357, name: 'Motel', icon: '🏨', fill: '#dcc9e3', wall: 0xf7eefb, trim: 0x6a1b9a,
    gate: { ants: 8, planks: 28 }, after: 'ai-taxi-dispatcher', level: 49,
    costs: { plot: 8520500, staff: 6390500, banker: 7498000 },
    item: null, unitValue: 230000, interval: 12, wants: [1, 1], serve: 10,
    staff: { id: 'clerk', name: 'Night Clerk', title: '🏨 CLERK', kind: 'h-director', title2: '🏨 CLERK 2', kind2: 'h-crew4' },
    how: '🏨 Guests pull up to check in: stand at the desk posts while each one gets a key. A long wait, a very big bill.',
  },
  {
    key: 'parking', kind: 'parking', minX: 380, name: 'Airport Parking', icon: '🅿️', fill: '#c8ccd2', wall: 0xeef0f3, trim: 0x1565c0, sign: '🅿️ PARKING',
    gate: { ants: 8, planks: 29 }, after: 'ai-motel-clerk', level: 51,
    costs: { plot: 13207000, staff: 9905000, banker: 11622000 },
    item: null, unitValue: 120000, interval: 5, wants: [1, 1], serve: 2,
    staff: { id: 'attendant', name: 'Parking Attendant', title: '🅿️ ATTENDANT', kind: 'h-crew1', title2: '🅿️ ATTENDANT 2', kind2: 'h-crew2' },
    how: '🅿️ The busiest curb in town: cars stop at the barriers, you stand there while each ticket is stamped. Fast!',
  },
  {
    key: 'airport', kind: 'airport', minX: 403, name: 'Airport', icon: '✈️', fill: '#cfe0ee', wall: 0xf3f9ff, trim: 0x0277bd,
    gate: { ants: 8, planks: 30 }, after: 'ai-parking-attendant', level: 53,
    costs: { plot: 20470500, carrier: 10235500, staff: 15353000, banker: 18014000 },
    item: 'luggage', unitValue: 125000, interval: 6, wants: [3, 5], serve: 0.8,
    truck: { every: 40, load: 30 },
    carrier: { name: 'Baggage Carrier', title: '🐜 BAGGAGE CARRIER', hat: 0x0277bd },
    staff: { id: 'agent', name: 'Check-in Agent', title: '✈️ AGENT', kind: 'h-exec', title2: '✈️ AGENT 2', kind2: 'h-director' },
    how: '✈️ The baggage truck fills the depot → carry suitcases to the rack → stand at the check-in posts while the travellers load up. You made it to the airport!',
  },
];

/** A lot's ground (world). */
export const lotRect = (d: StreetLotDef) => ({ minX: d.minX, maxX: d.minX + HOME.lotWidth, minZ: HOME.lotZ.minZ, maxZ: HOME.lotZ.maxZ });
/** Where things stand on a lot, from its west edge: its tiles, bays, rack, pile, cash pad and kiosk. */
export const LOT_AT = {
  plotTile: [2.4, 13.4], carrierTile: [4, 2.5], staffTile: [16.6, 12.6], bankerTile: [12, 6.6],
  bays: [4.5, 12.5], rack: [8.5, 11.6], pile: [4, -4.5], pad: [14.5, 4.2], ant: [5.5, 1], sale: [11, 0],
  kiosk: { minX: 12.5, maxX: 21.4, minZ: -10.4, maxZ: -2.5 },
} as const;

/** The lots' walk-on tiles: the plot, the carrier ant (if it has one), its person, its banker. */
function streetUnlocks(): UnlockDef[] {
  const out: UnlockDef[] = [];
  for (const d of STREET_LOTS) {
    const at = (p: readonly number[]): [number, number] => [d.minX + p[0], p[1]];
    const id = `ai-${d.key}`;
    out.push({ id, name: `${d.name} Plot`, icon: d.icon, cost: d.costs.plot, pos: at(LOT_AT.plotTile), requires: [d.after], level: d.level });
    let last = id, level = d.level;
    if (d.carrier && d.costs.carrier) {
      out.push({ id: `${id}-carrier`, name: d.carrier.name, icon: '🐜', cost: d.costs.carrier, pos: at(LOT_AT.carrierTile), requires: [last], level: ++level });
      last = `${id}-carrier`;
    }
    out.push({ id: `${id}-${d.staff.id}`, name: d.staff.name, icon: d.icon, cost: d.costs.staff, pos: at(LOT_AT.staffTile), requires: [last], level: ++level });
    out.push({ id: `${id}-banker`, name: d.bankerName ?? `${d.key[0].toUpperCase()}${d.key.slice(1)} Banker`, icon: '🏦', cost: d.costs.banker, pos: at(LOT_AT.bankerTile), requires: [`${id}-${d.staff.id}`], level: ++level });
  }
  return out;
}

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
  // 🚗 The street businesses (the gas station, the car wash, the garage...): made from STREET_LOTS, below
  ...streetUnlocks(),
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
