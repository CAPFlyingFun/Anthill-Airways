// ============================================================================
// fleet.ts — ✈️ the FLEET and the ROUTES (v0.70).
//
// THE FLEET: every gate flies the best bug you've unlocked. Each one swaps in at its gate the next time its plane
// is parked and empty (the airfield's `swap`):
//   🐞 Ladybug (2 seats) → 🐝 Honey Bee (3) → 🪽 Dragonfly (4, fast) → 🦋 Butterfly (6) → 🪲 Beetle Freighter (8, slow)
//   → Moth Night-Liner (10). v0.72: they're unlocked (and upgraded: 💺 seats, 💨 speed) in the 🛖 HANGAR's menu.
//
// v0.74 🎲 MIXED FLEET: with two or more aircraft unlocked, each gate picks a different one of them every time its
// plane comes home (no two gates the same while there are enough to go round). The hangar's menu switches it off
// (then every gate flies the biggest one again, for the most income).
//
// THE ROUTES: where the flights go (v0.87: the 🗺️ DESTINATIONS MAP opens eight more, below). Two short hops are
// open from the start; the 🗺️ route tiles open longer ones
// that pay a higher FARE. A departure earns its fare bonus as it lifts off (on top of the tickets paid at check-in:
// tickets × (fare − 1)), and an arrival from far away pays bigger landing fees (× fare). Longer routes keep the plane
// away for longer (`extra` seconds), so a new route is a trade: more money per flight, fewer flights.
// ============================================================================
import type { BugKind } from './bugs';
import { mm } from './scale';

export interface PlaneType {
  kind: BugKind;
  name: string;
  icon: string;
  /** Nose to tail, game units (big enough to read, small enough for a gate's 9 × 11 stand). */
  length: number;
  /** Passengers it carries (before the hangar's 💺 Extra Seat upgrades). */
  seats: number;
  /** What it costs to unlock in the 🛖 hangar, and the level you need. */
  cost: number;
  level: number;
  /** x taxi, take-off, cruise and route speed. */
  speed: number;
  /** The tile that brings it (null: the first plane). */
  unlock: string | null;
}

/** In order: each one replaces the one before it. */
export const FLEET: PlaneType[] = [
  { kind: 'ladybug', name: 'Ladybug', icon: '🐞', length: mm(8), speed: 1, unlock: null, seats: 2, cost: 0, level: 1 },
  { kind: 'bee', name: 'Honey Bee', icon: '🐝', length: mm(13), speed: 1.1, unlock: 'ty-bees', seats: 3, cost: 1300, level: 6 },
  { kind: 'dragonfly', name: 'Dragonfly', icon: '🪽', length: mm(20), speed: 1.4, unlock: 'ty-dragonfly', seats: 4, cost: 3500, level: 9 },
  { kind: 'butterfly', name: 'Butterfly', icon: '🦋', length: mm(11), speed: 1.05, unlock: 'ty-butterfly', seats: 6, cost: 8000, level: 12 },
  { kind: 'beetle', name: 'Beetle Freighter', icon: '🪲', length: mm(15), speed: 0.85, unlock: 'ty-beetle', seats: 8, cost: 15000, level: 15 },
  { kind: 'moth', name: 'Moth Night-Liner', icon: '🌙', length: mm(15), speed: 1.0, unlock: 'ty-moth', seats: 10, cost: 28000, level: 18 },
];

/** The best plane `owns` has unlocked. */
export function bestPlane(owns: (id: string) => boolean): PlaneType {
  let best = FLEET[0];
  for (const t of FLEET) if (!t.unlock || owns(t.unlock)) best = t;
  return best;
}

export interface RouteDef {
  /** Its name in the save (v0.87). */
  id: string;
  icon: string;
  name: string;
  /** "🧺 Picnic Table": what a flight carries (older saves' flights have only this). */
  place: string;
  /** x the ticket: the fare bonus at take-off is tickets × (fare − 1); arrivals pay landing fees × fare. */
  fare: number;
  /** Extra seconds out on the route. */
  extra: number;
  /** The tile that opens it (null: not a tile's). */
  unlock: string | null;
  /** Opened on the 🗺️ DESTINATIONS MAP instead (v0.87): what that costs, and the level you need. */
  cost?: number;
  level?: number;
  /** Where its pin is on the map (0..100 across, 0..100 down), and a line about the place. */
  at: [number, number];
  blurb: string;
}

const route = (id: string, icon: string, name: string, fare: number, extra: number, at: [number, number], blurb: string, how: { unlock?: string; cost?: number; level?: number } = {}): RouteDef =>
  ({ id, icon, name, place: `${icon} ${name}`, fare, extra, unlock: how.unlock ?? null, cost: how.cost, level: how.level, at, blurb });

/**
 * v0.87 🗺️ THE DESTINATIONS MAP (Joshua, maxed out at level 26 with everything bought: "we should add more to the
 * game"; of the five ideas offered, this one first). The garden round the anthill, drawn as a map: the first six
 * places are as they were (two open from the start, four opened by their 🗺️ tiles out on the field), and eight
 * further ones are opened ON THE MAP for cash, each further away, dearer, and better paid. An open destination can
 * be ADVERTISED (📣, up to ROUTE_LV_MAX levels: its fare a little higher each time) and switched off and on
 * (flights pick at random among the ones that are on). All GAME TUNING.
 */
export const ROUTES: RouteDef[] = [
  route('flowers', '🌼', 'Flower Field', 1, 0, [41, 56], 'A short hop over the daisies. Everyone\'s first flight.'),
  route('mushrooms', '🍄', 'Mushroom Ring', 1, 0, [60, 58], 'A shady circle of toadstools just past the lawn\'s edge.'),
  route('picnic', '🧺', 'Picnic Table', 1.5, 3, [27, 44], 'Crumbs for days. Busy at lunchtime.', { unlock: 'ty-route-picnic' }),
  route('log', '🪵', 'Fallen Log Town', 2, 5, [76, 45], 'A whole town of beetles living in one old log.', { unlock: 'ty-route-log' }),
  route('tide', '🐚', 'Tide Pool', 2.6, 7, [15, 79], 'Where the creek slows down: shells, snails and a sea breeze.', { unlock: 'ty-route-tide' }),
  route('lizard', '🦎', 'Lizard Rock', 3.3, 9, [85, 66], 'Warm stones, and a landlord who naps all day. Mostly.', { unlock: 'ty-route-lizard' }),
  route('pond', '🌊', 'Garden Pond', 3.8, 10, [78, 29], 'Lily pads for runways and dragonflies for neighbours.', { cost: 40000, level: 14 }),
  route('veg', '🥕', 'Vegetable Patch', 4.3, 11, [16, 30], 'Rows of carrots and lettuce: the farmers\' market of the garden.', { cost: 65000, level: 16 }),
  route('shed', '🛖', 'Garden Shed', 4.9, 12, [14, 12], 'Dusty, dark and full of spiders who love to travel.', { cost: 100000, level: 18 }),
  route('birdbath', '⛲', 'Bird Bath', 5.5, 13, [52, 30], 'A spa in the sky. Check for birds before landing.', { cost: 150000, level: 20 }),
  route('oak', '🌳', 'Old Oak', 6.2, 14, [86, 87], 'A city in a tree: a thousand floors, no elevator.', { cost: 220000, level: 22 }),
  route('porch', '💡', 'Porch Light', 7, 15, [50, 8], 'The brightest nightlife in the garden. Moths can\'t stay away.', { cost: 320000, level: 24 }),
  route('driveway', '🚗', 'Driveway', 7.9, 16, [88, 10], 'A hot grey desert with one giant, sleeping machine.', { cost: 450000, level: 26 }),
  route('creek', '🏞️', 'Creek Crossing', 9, 18, [44, 92], 'The far bank. Nobody has flown further and come back.', { cost: 600000, level: 28 }),
];

/** 📣 Advertising a destination: its levels, what each adds to its fare, and what the next one costs. */
export const ROUTE_LV_MAX = 5;
export const ROUTE_LV_FARE = 0.08;
export function routeFare(r: RouteDef, lv: number) {
  return Math.round(r.fare * (1 + ROUTE_LV_FARE * lv) * 100) / 100;
}
export function routeLvCost(r: RouteDef, lv: number) {
  // (a fifth of what the place cost to open, more each level; the near ones by what their tile cost)
  const base = r.cost ?? ({ 'ty-route-picnic': 450, 'ty-route-log': 1100, 'ty-route-tide': 2600, 'ty-route-lizard': 5500 } as Record<string, number>)[r.unlock ?? ''] ?? 300;
  return Math.round((Math.max(300, base) * 0.2 * (lv + 1)) / 10) * 10;
}

/** A route by its place name (older saves' flights have only the place). */
export function routeOf(place: string | undefined): RouteDef {
  return ROUTES.find((r) => r.place === place) ?? ROUTES[0];
}
