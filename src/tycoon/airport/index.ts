// ============================================================================
// index.ts — ✈️ the airport kit: everything the game needs to build an insect-scale airport (v0.68).
//
// Every `make…()` returns a Piece: { root, blockers, spots, roofs, update? } (see common.ts). Put `root` in the
// scene, copy `blockers` into the walls list, use `spots` for where ants and bugs go, hide `roofs` for the 2.5D
// cutaway, and call `update(dt)` every frame if it exists.
// ============================================================================
export type { Piece, Footprint } from './common';
export { countStats } from './common';
export { makeRunway, RUNWAY_TOP } from './runway';
export type { RunwayOpts, RunwayPiece } from './runway';
export { makeTaxiway, TAXIWAY_TOP } from './taxiway';
export { makeTerminal } from './terminal';
export { makeHangar } from './hangar';
export type { HangarKind } from './hangar';
export { makeControlTower } from './tower';
export { makeFuelFlower, makeDewTank } from './fuel';
export type { FuelFlowerPiece } from './fuel';
export { makeWindsock } from './windsock';
export { makeFungusLight, fungusRow, glowTick } from './fungus';
export { makeGate } from './gate';
export type { GateOpts } from './gate';
export { makeBaggageCart } from './baggage';
export { makeSign } from './sign';
export type { SignOpts } from './sign';
