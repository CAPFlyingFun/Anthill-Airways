// ============================================================================
// crafting.ts — 🔨 the story's crafting (v0.67), ARK style but cozy.
//
// Joshua (2026-11-15): "should be able to craft many stuff from the workbench... research ARK on it", then
// "unlocking: automatically based on level".
//
// Like ARK: some things you make from your backpack anywhere (🔨 in the 🎒 panel), bigger things at a crafting
// station (🛠️ the workbench). Each recipe has what it needs, a time, and a level: it unlocks by itself when you
// reach that level (no points to spend; a "🔓 New recipe" banner says so). Crafts go in a queue (up to 5) and
// keep going while you walk away. A few future recipes show as "coming soon", so you know what's ahead.
//
// Ingredients come from your backpack, and at the workbench from its storage too (logs you've stored there).
// ============================================================================
import type { ItemType } from '../world/items';
import type { ToolKind, PanelTab } from './backpack';

export type Where = 'pack' | 'bench';
export type Build = 'chest' | 'hammock';

export interface Recipe {
  id: string;
  name: string;
  icon: string;
  where: Where;
  /** Unlocks at this level (999 = coming in a later chapter). */
  level: number;
  secs: number;
  needs: Partial<Record<ItemType, number>>;
  gives: { tool?: ToolKind; build?: Build };
  desc: string;
}

export const ITEM_ICON: Partial<Record<ItemType, string>> = { log: '🪵', stone: '🪨', branch: '🌿', fiber: '🌱', berry: '🍓', fuel: '⛽', mast: '📡' };

export const RECIPES: Recipe[] = [
  // 🎒 from your backpack, anywhere
  {
    id: 'pick', name: 'Stone pick', icon: '⛏️', where: 'pack', level: 1, secs: 4,
    needs: { branch: 1, stone: 2, fiber: 2 }, gives: { tool: 'pick' },
    desc: 'Mines stone from the boulders on the stream bank, much faster than picking stones up.',
  },
  // 🛠️ at the workbench
  {
    id: 'canteen', name: 'Waterskin', icon: '🫗', where: 'bench', level: 2, secs: 6,
    needs: { log: 1, fiber: 4 }, gives: { tool: 'canteen' },
    desc: 'Holds 3 sips. It fills in the stream; tap it to drink, and it sips for you when you get thirsty.',
  },
  {
    id: 'chest', name: 'Storage chest', icon: '📦', where: 'bench', level: 3, secs: 8,
    needs: { log: 4, fiber: 2 }, gives: { build: 'chest' },
    desc: '40 spaces of storage at camp, for anything.',
  },
  {
    id: 'hammock', name: 'Hammock', icon: '🛏️', where: 'bench', level: 4, secs: 10,
    needs: { log: 3, fiber: 6 }, gives: { build: 'hammock' },
    desc: 'Rest in it to heal fast. If you pass out, you wake up here.',
  },
  // 🔒 coming later (so you can see what's ahead)
  { id: 'spear', name: 'Spear', icon: '🗡️', where: 'bench', level: 999, secs: 0, needs: { branch: 2, stone: 1, fiber: 2 }, gives: {}, desc: 'Chapter 2: for fishing, and for keeping things at a distance.' },
  { id: 'torch', name: 'Torch', icon: '🔥', where: 'pack', level: 999, secs: 0, needs: { branch: 1, fiber: 2 }, gives: {}, desc: 'Chapter 2: light for the nights (and the caves).' },
  { id: 'crops', name: 'Crop plot', icon: '🌱', where: 'bench', level: 999, secs: 0, needs: { log: 4, fiber: 4 }, gives: {}, desc: 'Chapter 2: grow berries at camp, for you and your dinos.' },
  { id: 'spar', name: 'Wing spar', icon: '✈️', where: 'bench', level: 999, secs: 0, needs: { log: 8 }, gives: {}, desc: 'Chapter 4: the first piece of a new wing for Rae\'s plane.' },
];

export const recipe = (id: string) => RECIPES.find((r) => r.id === id)!;
export const MAX_QUEUE = 5;

/** A crafting queue (one per place): what's being made, how far along. */
export interface QueueItem {
  id: string;
  t: number;
}

/** What a recipe needs that you're short of (empty = can make it). `have(t)` = how many you can use. */
export function missing(r: Recipe, have: (t: ItemType) => number) {
  return Object.entries(r.needs).filter(([t, n]) => have(t as ItemType) < (n ?? 0)) as [ItemType, number][];
}

/**
 * The 🔨 Craft tab: unlocked recipes (with have / need and a Craft button), the queue with its progress, and
 * the locked ones greyed out ("🔒 Level 3", or "Coming soon").
 */
export function craftTab(o: {
  where: Where;
  level: () => number;
  have: (t: ItemType) => number;
  queue: () => QueueItem[];
  /** Already have this one (a tool you own, a chest you built): shown as "✓ Made". */
  owned: (r: Recipe) => boolean;
  craft: (r: Recipe) => void;
  /** An extra line at the top (e.g. "Rae makes your hatchet"). */
  note?: string;
}): PanelTab {
  return {
    label: o.where === 'pack' ? '🔨 Craft' : '🛠️ Craft',
    html: () => {
      const lv = o.level();
      const q = o.queue();
      const list = RECIPES.filter((r) => r.where === o.where);
      const row = (r: Recipe) => {
        const locked = lv < r.level;
        const soon = r.level >= 999;
        const owned = !locked && o.owned(r);
        const short = missing(r, o.have);
        const needs = Object.entries(r.needs)
          .map(([t, n]) => {
            const h = o.have(t as ItemType);
            return `<span class="need-chip${h >= (n ?? 0) ? ' ok' : ''}">${ITEM_ICON[t as ItemType] ?? '❔'} ${Math.min(h, n ?? 0)}/${n}</span>`;
          })
          .join('');
        const btn = locked
          ? `<span class="craft-lock">${soon ? 'Coming soon' : `🔒 Level ${r.level}`}</span>`
          : owned
            ? '<span class="craft-done">✓ Made</span>'
            : `<button class="craft-btn" data-id="${r.id}" ${short.length || q.length >= MAX_QUEUE ? 'disabled' : ''}>Craft · ${r.secs}s</button>`;
        return `<div class="craft-row${locked ? ' locked' : ''}"><div class="craft-icon">${r.icon}</div><div class="craft-info"><b>${r.name}</b><small>${r.desc}</small><div class="craft-needs">${locked && soon ? '' : needs}</div></div>${btn}</div>`;
      };
      const queue = q.length
        ? `<div class="craft-queue">${q
            .map((it) => {
              const r = recipe(it.id);
              return `<div class="cq-item" title="${r.name}">${r.icon}<i><u style="width:0%"></u></i></div>`;
            })
            .join('')}</div>`
        : '';
      return `${o.note ? `<p class="craft-note">${o.note}</p>` : ''}${queue}<div class="craft-list">${list.map(row).join('')}</div>`;
    },
    // the first item's progress bar, moved in place (rebuilding the panel 4x a second would eat taps)
    tick: (root) => {
      const it = o.queue()[0];
      const bar = root.querySelector<HTMLElement>('.cq-item u');
      if (it && bar) bar.style.width = `${Math.round((it.t / recipe(it.id).secs) * 100)}%`;
    },
    bind: (root, redraw) => {
      root.querySelectorAll<HTMLButtonElement>('.craft-btn').forEach((b) =>
        b.addEventListener('click', () => {
          o.craft(recipe(b.dataset.id!));
          redraw();
        }),
      );
    },
  };
}
