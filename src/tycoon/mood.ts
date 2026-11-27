// ============================================================================
// mood.ts — 😀 TRAVELLERS' MOODS AND THE AIRPORT'S ⭐ RATING (v0.96, Phase 2 of the plan)
//
// Joshua's plan, Phase 2: "Each traveller has a mood (a small face over their head when you're near): happy, then
// impatient after waiting too long in a queue, at check-in or for a late plane. An airport rating out of 5 stars,
// from the last 50 travellers' moods, shown in the HUD. The rating matters: more stars bring travellers more often
// and add a tip to each fare; low stars slow them down. Things that please them: flowers... nearby, short queues,
// on-time flights; things that annoy them: long waits, crowding, a lizard on the runway."
//
// A mood is a number from 0 (furious) to 1 (delighted). Every traveller starts at MOOD.start, it moves a little each
// second by what is happening to them, and when they are done with the airport (flown off, or walked out after
// landing) it is written down. The rating is the mean of the last MOOD.keep written down, as stars from 1 to 5.
// Every number here is GAME TUNING: first guesses, tuned after Joshua plays.
// ============================================================================

export const MOOD = {
  /** Where a traveller starts (happy, with room to be happier). */
  start: 0.8,
  /** 🎫 The check-in line: seconds before waiting in it starts to wear on them, and how much a second after that. */
  queuePatience: 25,
  queueDrop: 0.012,
  /** 🧍🧍🧍 Crowding: a line longer than this is unpleasant for everyone in it (a second). */
  crowdLine: 8,
  crowdDrop: 0.004,
  /** ...and a short one is a little pleasant (a second). */
  shortLine: 3,
  shortLift: 0.002,
  /** 🛂 (v0.97) Queuing at security: seconds before it wears on them, and how much a second after. */
  securityPatience: 20,
  securityDrop: 0.012,
  /** 🛫 Waiting at the gate: seconds before it wears on them, and how much a second after. */
  gatePatience: 45,
  gateDrop: 0.008,
  /** ⏰ A late plane: seated aboard (or circling to land) for longer than this, and how much a second after. */
  latePatience: 20,
  lateDrop: 0.01,
  /** ...and a plane that went on time cheers its riders up as it lifts off. */
  onTimeLift: 0.06,
  /** 🦎 A lizard on the runway: everyone on the ground frets (a second). */
  lizardDrop: 0.004,
  /** 🌼 Within this of an open nectar flower (or other garden pretty), a little happier each second. */
  flowerNear: 22,
  flowerLift: 0.004,
  /** 🍪🎁 A stop they enjoyed (bought something), and 👑 the VIP lounge. */
  stopLift: 0.08,
  loungeLift: 0.12,
  /** The rating: how many moods it remembers, and the "everyone was fairly happy" it starts from (as if this many
   *  travellers had this mood already: a new airport is about four stars, not a wild guess from one traveller). */
  keep: 50,
  prior: 10,
  priorMood: 0.75,
  /** 👁️ How near you must be to see a traveller's face (world units). */
  faceNear: 18,
};

/** The face for a mood. */
export function faceFor(mood: number) {
  return mood >= 0.75 ? '😀' : mood >= 0.55 ? '🙂' : mood >= 0.35 ? '😐' : mood >= 0.15 ? '😠' : '😡';
}

/** Keep a mood between 0 and 1. */
export function clampMood(m: number) {
  return m < 0 ? 0 : m > 1 ? 1 : m;
}

/** Write a finished traveller's mood down (the list keeps the last MOOD.keep, two decimals each: it's saved). */
export function recordMood(list: number[], mood: number) {
  list.push(Math.round(clampMood(mood) * 100) / 100);
  if (list.length > MOOD.keep) list.splice(0, list.length - MOOD.keep);
}

/** The airport's rating, 1 to 5 stars (one decimal), from the moods written down. */
export function starsFrom(list: number[]) {
  const n = list.length;
  const pad = Math.max(0, MOOD.prior - n);
  const mean = (list.reduce((a, b) => a + b, 0) + pad * MOOD.priorMood) / Math.max(1, n + pad);
  return Math.round((1 + 4 * mean) * 10) / 10;
}

/** ⭐ What the rating does. More stars: travellers come more often (×0.7 at 1 star, ×1 at 3, ×1.3 at 5)... */
export function arriveMultFor(stars: number) {
  return 0.7 + 0.15 * (stars - 1);
}
/** ...and above 3 stars every ticket carries a tip (+5% a star: +10% at 5). */
export function tipFor(stars: number) {
  return Math.max(0, stars - 3) * 0.05;
}

/** The rating as stars to show: "⭐ 4.2". */
export function starLabel(stars: number) {
  return `⭐ ${stars.toFixed(1)}`;
}
