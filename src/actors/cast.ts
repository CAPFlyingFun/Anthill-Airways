// ============================================================================
// cast.ts — 🎭 the story's people, each with one or more LOOKS (v0.63).
//
// Joshua (2026-11-15): "we can swap models around and have like pregnant and not pregnant models of the same
// people." So a person isn't one model file: it's a name with a list of looks, each look being one model file
// with what makes it different (the outfit, pregnant or not). The game asks for a person and the look it wants
// ("Sarah, in the company suit, not pregnant"); lookFor() hands back the closest look there is, so the story
// works today with one model each and gets better as each new model is added here. No other file changes.
//
// TO ADD A MODEL: put the .glb in public/models/ as h-<name>.glb, add its name to MORE_HUMANS in creatures.ts,
// and add a look below. The first look of the two you can play is the one a new game starts in.
// (v0.63: the 7 from the "7-more-models" release are in: the company-suit pair is the default outfit.)
// ============================================================================
import { HumanKind, hasModel, spawnHuman } from './creatures';
import type { CreatureModel } from './models';
import { makeAnt } from './models';

/** What a look is for. 'casual' = at home; 'suit' = the airline company's flight suit (the default outfit). */
export type Outfit = 'casual' | 'suit' | 'pilot' | 'business' | 'gear';

export interface Look {
  file: HumanKind;
  outfit: Outfit;
  pregnant?: boolean;
  /** Shown on the character card. */
  label: string;
}

export interface CastMember {
  name: string;
  /** Who they are in the story (working notes: names and roles are still being planned). */
  role: string;
  looks: Look[];
}

export type CastId = 'jack' | 'sarah' | 'rae' | 'director' | 'exec' | 'man' | 'woman';

export const CAST: Record<CastId, CastMember> = {
  // 🧍 The two characters you can play
  // (Joshua, 2026-11-15: the leads are the younger, college-age pair in the company suits)
  jack: {
    name: 'Jack',
    role: 'you (the male lead)',
    looks: [{ file: 'h-cadet', outfit: 'suit', label: 'Company suit' }],
  },
  sarah: {
    name: 'Sarah',
    role: 'you (the female lead)',
    looks: [{ file: 'h-grace', outfit: 'suit', pregnant: true, label: 'Company suit' }],
  },
  // ✈️ Your old friend the bush pilot (Rae is a working name)
  rae: {
    name: 'Rae',
    role: 'bush pilot, your old friend (working name)',
    looks: [
      { file: 'h-azure', outfit: 'pilot', label: 'Adventurer coat' },
      { file: 'h-balance', outfit: 'casual', label: 'Leather jacket' },
      { file: 'h-balance2', outfit: 'casual', pregnant: true, label: 'Leather jacket (pregnant)' },
    ],
  },
  // 📻 For later chapters (not in Chapter 1 yet)
  director: {
    name: 'The Director',
    role: 'not in the story yet',
    looks: [{ file: 'h-director', outfit: 'business', label: 'Suit' }],
  },
  // 🧍 The older pairs: for other people in the story later (who they are is still to be planned)
  man: {
    name: 'A man',
    role: 'not in the story yet (the older Jack models)',
    looks: [
      { file: 'h-jack', outfit: 'casual', label: 'Casual, beard' },
      { file: 'h-jacklab', outfit: 'casual', label: 'T-shirt and jeans' },
    ],
  },
  woman: {
    name: 'A woman',
    role: 'not in the story yet (the older Sarah models)',
    looks: [
      { file: 'h-sarah', outfit: 'casual', pregnant: true, label: 'Casual' },
      { file: 'h-sarah2', outfit: 'casual', pregnant: true, label: 'Casual (smaller bump)' },
    ],
  },
  exec: {
    name: 'The Executive',
    role: 'not in the story yet',
    looks: [
      { file: 'h-enigma', outfit: 'business', label: 'Business suit' },
      { file: 'h-exec', outfit: 'business', pregnant: true, label: 'Business suit (pregnant)' },
    ],
  },
};

/** What we'd like a person to look like (anything left out = don't mind). `file` = exactly this look. */
export interface Want {
  outfit?: Outfit;
  pregnant?: boolean;
  file?: HumanKind;
}

/**
 * The look closest to what's wanted, from the models that are actually loaded: the exact outfit + pregnancy,
 * else the right outfit, else the right pregnancy, else the first look. (Null if none of them loaded.)
 */
export function lookFor(id: CastId, want: Want = {}): Look | null {
  const looks = CAST[id].looks.filter((l) => hasModel(l.file));
  if (!looks.length) return null;
  const exact = want.file && looks.find((l) => l.file === want.file);
  if (exact) return exact;
  const score = (l: Look) =>
    (want.outfit && l.outfit === want.outfit ? 2 : 0) + (want.pregnant !== undefined && !!l.pregnant === want.pregnant ? 1 : 0);
  return looks.reduce((best, l) => (score(l) > score(best) ? l : best), looks[0]);
}

/** Every model file the cast uses (to download only these). */
export function castFiles(ids: CastId[]): HumanKind[] {
  return [...new Set(ids.flatMap((id) => CAST[id].looks.map((l) => l.file)))];
}

/** The outfits and pregnant / not choices a person has (for the character card). */
export function choicesFor(id: CastId) {
  const looks = CAST[id].looks.filter((l) => hasModel(l.file));
  return {
    outfits: [...new Set(looks.map((l) => l.outfit))],
    pregnant: looks.some((l) => l.pregnant) && looks.some((l) => !l.pregnant),
  };
}

/** A person, `height` units tall, in the look closest to `want` (a stand-in shape if no model loaded). */
export function castPerson(id: CastId, want: Want, height: number): CreatureModel {
  const look = lookFor(id, want);
  return (look && spawnHuman(look.file, height)) || makeAnt(0x6688aa, true);
}
