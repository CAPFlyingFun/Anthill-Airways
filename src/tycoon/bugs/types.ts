// ============================================================================
// types.ts — 🐞 the public types of the tycoon bug library (kept separate so the builders can share them
// without importing each other in circles).
// ============================================================================
import type * as THREE from 'three';
import type { CreatureModel } from '../../actors/models';

/** Every creature this library can build (all procedural; no dinosaurs). */
export type BugKind =
  | 'ladybug' | 'bee' | 'beetle' | 'moth' | 'dragonfly' | 'butterfly'
  | 'aphid' | 'pillbug' | 'housefly'
  | 'jumping-spider' | 'wolf-spider'
  | 'anole' | 'gecko' | 'toad';

/** A normal CreatureModel (so animateCreature walks + flaps it) plus its kind and its passenger / cargo spots. */
export interface Bug extends CreatureModel {
  kind: BugKind;
  /** Attach points on its back for passengers / cargo (empty for non-flyers). Local to model.bob. */
  seats: THREE.Object3D[];
}

/** Options every builder understands. */
export interface BugOpts {
  /** Nose-to-tail length in game units (default: the species' SIZE value from scale.ts). */
  length?: number;
  /** Seed for the little variations (beetle colour, butterfly pattern, spot positions, dewlap timing). */
  seed?: number;
  /** Override the main body colour (hex). */
  color?: number;
}

/** What the internal builders receive: the options with defaults already worked out. */
export interface BArgs {
  /** length / default length of the species: 1 = normal size */
  scale: number;
  seed: number;
  color?: number;
}
