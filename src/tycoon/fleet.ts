// ============================================================================
// fleet.ts — ✈️ the FLEET and the ROUTES (v0.70).
//
// THE FLEET: every gate flies the best bug you've unlocked. Each one swaps in at its gate the next time its plane
// is parked and empty (the airfield's `swap`):
//   🐞 Ladybug (2 seats) → 🐝 Honey Bee (3) → 🪽 Dragonfly (4, fast) → 🦋 Butterfly (6) → 🪲 Beetle Freighter (8, slow)
//   → Moth Night-Liner (10). v0.72: they're unlocked (and upgraded: 💺 seats, 💨 speed) in the 🛖 HANGAR's menu.
//
// THE ROUTES: where the flights go. Two short hops are open from the start; the 🗺️ route tiles open longer ones
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
  place: string;
  /** x the ticket: the fare bonus at take-off is tickets × (fare − 1); arrivals pay landing fees × fare. */
  fare: number;
  /** Extra seconds out on the route. */
  extra: number;
  /** The tile that opens it (null: open from the start). */
  unlock: string | null;
}

export const ROUTES: RouteDef[] = [
  { place: '🌼 Flower Field', fare: 1, extra: 0, unlock: null },
  { place: '🍄 Mushroom Ring', fare: 1, extra: 0, unlock: null },
  { place: '🧺 Picnic Table', fare: 1.5, extra: 3, unlock: 'ty-route-picnic' },
  { place: '🪵 Fallen Log Town', fare: 2, extra: 5, unlock: 'ty-route-log' },
  { place: '🐚 Tide Pool', fare: 2.6, extra: 7, unlock: 'ty-route-tide' },
  { place: '🦎 Lizard Rock', fare: 3.3, extra: 9, unlock: 'ty-route-lizard' },
];

/** The routes `owns` has opened. */
export function openRoutes(owns: (id: string) => boolean) {
  return ROUTES.filter((r) => !r.unlock || owns(r.unlock));
}

/** A route by its place name (older saves' flights have only the place). */
export function routeOf(place: string | undefined): RouteDef {
  return ROUTES.find((r) => r.place === place) ?? ROUTES[0];
}
