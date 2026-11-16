// ============================================================================
// index.ts — 🌱 the flora module's public door: import everything from here.
//   import { buildGround, Lawn, makePebble, scatter, buildBackdrop } from './tycoon/flora';
// ============================================================================
export { buildGround } from './ground';
export type { GroundOpts } from './ground';
export { Lawn } from './lawn';
export type { LawnOpts } from './lawn';
export { buildBackdrop } from './backdrop';
export {
  makePebble,
  makeFallenLeaf,
  makeTwig,
  makeClover,
  makeFlower,
  makeMushroom,
  makeDandelionSeed,
  makeAcornCap,
  makeDewdrop,
  scatter,
} from './props';
