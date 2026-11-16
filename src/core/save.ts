// ============================================================================
// save.ts — saves progress to the browser (localStorage).
//
// THREE SAVE SLOTS: each is a completely separate game (own cash, levels,
// unlocks). Slot 1 uses the original key, so existing progress is Slot 1.
// Only the slot you're playing earns offline: switching slots pauses the one
// you leave (its "last seen" is cleared), so slots never stack offline income.
// Everything is wrapped in try/catch because private browsing or a full
// disk can make localStorage throw; the game still works, it just won't save.
// ============================================================================
import { CONFIG } from '../data/config';

export interface SaveData {
  cash: number;
  unlocked: string[];                 // ids of unlock tiles already bought
  paid: Record<string, number>;       // partial payments on tiles not finished yet
  tutorial: number;                   // index of the next tutorial hint
  sound: boolean;
  xp: number;                         // XP toward the next level
  level: number;
  points: number;                     // unspent stat points
  stats: Record<string, number>;      // points spent per stat id
  hatched: number;                    // worker ants born in the Hatchery
  queen: QueenSave;                   // the Queen's own level + stats (crowned at Lv 20)
  world: 'ant' | 'air' | 'island' | 'volcano' | 'hotel'; // which world you're playing (Act 2 airport … Act 5 hotel)
  airSeen: boolean;                   // seen the airport intro?
  view: 'third' | 'first';            // camera: behind you, or through your eyes
  lastSeen: number;                   // when the game last saved (ms) -> offline earnings
  rate: number;                       // measured income ($ per second) while playing
  // Prestige (The Big Eruption)
  shards: number;                     // 💎 Obsidian Shards to spend
  eruptions: number;                  // how many times you've erupted the volcano
  shardUps: Record<string, number>;   // levels bought in each shard upgrade
  cycleEarned: number;                // island + volcano cash earned since the last eruption (sets the shard payout)
  // ⬆️ Upgrade pads
  upgrades: Record<string, number>;   // level bought on each upgrade pad (by pad id)
  upPaid: Record<string, number>;     // cash poured into the next level so far
  crewXp: Record<string, number[]>;   // each world's helpers' XP, in hiring order
  totals: Record<string, number>;     // 📊 lifetime stats (cash earned, items sold...)
  trash: { start: number; count: number }; // 🗑️ paid trash: pieces dumped in this 5-min window
  contracts: Record<string, number>;       // 📦 usual load per run type (sets contract goals)
  /** Which game this slot plays: the classic Anthill Airways (default), or 🏝️ Anthill
   *  Island (the new one-island campaign, a test version for now: see world/homeWorld.ts). */
  campaign?: 'classic' | 'anthill' | 'story';
  /** 🏝️ Anthill Island's own progress (orders, the delivery crate, materials...). */
  home?: HomeSave;
  /** 🦖 The story remake's progress (v0.63: Chapter 1, a test): see story/storyWorld.ts. */
  story?: StorySave;
}

/** 🦖 The story: where you are and what's happened. (The current objective is save.tutorial.) */
export interface StorySave {
  v: number;
  /** Who you play, and how they look (null until you've picked). */
  hero: { id: 'jack' | 'sarah'; outfit?: string; pregnant?: boolean } | null;
  area: 'home' | 'island';
  x: number;
  z: number;
  ry: number;
  /** 💧 water and ❤️ health, 0..100 */
  water: number;
  health: number;
  /** What you carry (bottom to top). */
  carry: string[];
  /** Story moments that have happened (each happens once). */
  flags: Record<string, number>;
  /** Logs dropped into each build plot so far (campfire, workbench). */
  plots: Record<string, number>;
  /** The workbench: logs waiting in it, the mast being made (seconds in), masts made and not taken yet. */
  bench: { logs: number; t: number; made: number };
  /** Berries given to the ants / to the little dino; fuel cans left by the plane. */
  fed: { ants: number; dino: number; fuel: number };
  /** The little dino: hidden (before the rex), trapped, free (scared), trust (follows you). Where it is. */
  dino: { state: 'hidden' | 'trapped' | 'free' | 'trust'; x: number; z: number; carrying: boolean };
  /** Logbook pages found (their numbers). */
  pages: number[];
  /** 🪓 Tools: uses left on the stone you're using, the hatchet's uses left (0 = none), Rae's crafting (seconds in). */
  tools: { stoneHp: number; hatchet: number; raeT: number };
  /** 🎒 v0.66: the backpack (counts per item), the 5 hotbar slots (tool kinds), the slot in your hand (-1 none). */
  inv?: Record<string, number>;
  hotbar?: (string | null)[];
  held?: number;
}

/** 🏝️ Anthill Island: what the backyard remembers between sessions. */
export interface HomeSave {
  made: number;      // snack packs the ant farm has made (the first one brings the first order)
  orders: number;    // neighbors' orders filled (they line up at the snack stand; the line isn't saved)
  crate: { trips: number; got: Record<string, number>; away: number }; // goods in the crate; away = seconds until it's back
  planks: number;    // 🪵 building materials (from the crate), for new plots
  plankBits?: number; // 🪵 the part-plank your income has brought in so far (v0.60: income brings planks)
  chest: boolean;    // the café plot's chest is open
  cafeSales: number; // sales at the café (snack packs until v0.28, coffee since)
  standSales: number; // snack packs handed over at the backyard's snack stand (v0.28: older saves get 0)
  storeChest?: boolean; // 🛒 the store plot's chest is open (v0.30)
  storeSales?: number;  // bags of groceries sold at the Corner Store (v0.30)
  gasCars?: number;     // ⛽ cars filled at the Gas Station (v0.45)
  cars?: Record<string, number>; // 🚗 cars served at each street business, by its key (v0.47)
  v?: number;        // save format (missing = v0.27: see HOME_RENAMED in data/home.ts)
}

export interface QueenSave {
  active: boolean;
  level: number;
  xp: number;
  points: number;
  stats: Record<string, number>;
}

export function newSave(): SaveData {
  return { cash: 0, unlocked: [], paid: {}, tutorial: 0, sound: true, xp: 0, level: 1, points: 0, stats: {}, hatched: 0, queen: { active: false, level: 1, xp: 0, points: 0, stats: {} }, world: 'ant', airSeen: false, view: 'third', lastSeen: 0, rate: 0, shards: 0, eruptions: 0, shardUps: {}, cycleEarned: 0, upgrades: {}, upPaid: {}, crewXp: {}, totals: {}, trash: { start: 0, count: 0 }, contracts: {} };
}

export const SLOTS = [1, 2, 3] as const;
export type Slot = (typeof SLOTS)[number];
const SLOT_KEY = 'anthill-airways-slot';

/** The localStorage key for a slot (slot 1 = the original key). */
function keyFor(slot: Slot) {
  return slot === 1 ? CONFIG.saveKey : `${CONFIG.saveKey}-slot${slot}`;
}

/** The localStorage key of the slot being played. */
export function activeSaveKey() {
  return keyFor(activeSlot());
}

/** Which slot is being played. */
export function activeSlot(): Slot {
  try {
    const n = Number(localStorage.getItem(SLOT_KEY));
    return (SLOTS as readonly number[]).includes(n) ? (n as Slot) : 1;
  } catch {
    return 1;
  }
}

/** Once we're switching slots, nothing more may be written to the old one. */
let locked = false;

/** A slot's headline numbers (for the slot picker); null = empty slot. */
export function slotSummary(slot: Slot) {
  try {
    const raw = localStorage.getItem(keyFor(slot));
    if (!raw) return null;
    const d = { ...newSave(), ...JSON.parse(raw) } as SaveData;
    if (d.campaign === 'anthill') return { level: d.level, cash: d.cash, act: '🏝️ Anthill Island (test)', lastSeen: d.lastSeen };
    if (d.campaign === 'story') return { level: d.level, cash: d.cash, act: '🦖 Story: Chapter 1 (test)', lastSeen: d.lastSeen };
    const act = d.unlocked.includes('h5-open') ? '🏨 Act 5' : d.unlocked.includes('i3-volcano') ? '🌋 Act 4' : d.unlocked.includes('a2-island') ? '🏝️ Act 3' : d.unlocked.includes('expand3') ? '✈️ Act 2' : '🐜 Act 1';
    return { level: d.level, cash: d.cash, act: d.eruptions ? `${act} · 🌋×${d.eruptions}` : act, lastSeen: d.lastSeen };
  } catch {
    return null;
  }
}

/**
 * Save + pause the current slot, then make `slot` the active one. The caller
 * reloads the page to start it. The slot we leave gets no offline earnings
 * for the time spent in other slots.
 */
export function switchSlot(current: SaveData, slot: Slot) {
  if (locked) return; // (already switching: a second tap would write this game into the new slot)
  try {
    current.lastSeen = 0; // paused: no offline income while you're elsewhere
    localStorage.setItem(keyFor(activeSlot()), JSON.stringify(current));
    localStorage.setItem(SLOT_KEY, String(slot));
  } catch {
    /* ignore */
  }
  locked = true;
}

/**
 * Put a brand-new game in `slot` (e.g. a 🏝️ Anthill Island one). Used when you
 * start a new game from the slot list, and when a slot is reset (it keeps its game).
 */
export function seedSlot(slot: Slot, extra: Partial<SaveData>) {
  try {
    localStorage.setItem(keyFor(slot), JSON.stringify({ ...newSave(), ...extra }));
  } catch {
    /* ignore */
  }
}

/** Erase one slot (if it's the one being played, the caller reloads). */
export function eraseSlot(slot: Slot) {
  try {
    localStorage.removeItem(keyFor(slot));
  } catch {
    /* ignore */
  }
  if (slot === activeSlot()) locked = true;
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(keyFor(activeSlot()));
    if (!raw) return newSave();
    // Merge with defaults so older saves still load after we add new fields.
    return { ...newSave(), ...JSON.parse(raw) };
  } catch {
    return newSave();
  }
}

export function writeSave(data: SaveData) {
  if (locked) return; // switching slots: don't touch the one we left
  try {
    data.lastSeen = Date.now(); // offline earnings count from the last save
    localStorage.setItem(keyFor(activeSlot()), JSON.stringify(data));
  } catch {
    /* saving is best-effort */
  }
}

/** Reset the slot being played. */
export function clearSave() {
  eraseSlot(activeSlot());
}
