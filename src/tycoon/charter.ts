// ============================================================================
// charter.ts — 👑 THE ROYAL CHARTER (v0.92): the airport's prestige.
//
// When the airfield is grown (the North Field is open), the Queen offers a ROYAL CHARTER: hand this airfield over
// and found a new one from bare ground. What it pays is 👑 CROWNS, by what this airfield has earned
// (`crownsFor`: the square root, so a second million is worth less than the first).
//   • Every crown EVER earned makes everything the airport earns pay `CHARTER.income` more, for good.
//   • Crowns are also SPENT on perks that stay for good (`PERKS`): seed money, swifter ants, tailwinds, a bigger
//     backpack.
// A charter takes away: your cash, every tile, building, aircraft, destination and upgrade, the staff's levels and
// what's stocked. It keeps: your level and your stat points, your crowns and perks, the quests' count, the daily
// goals and their stars, your lifetime counts and your settings.
//
// This file is the numbers, the reset (`takeCharter`, on the save alone: the game is loaded again afterwards) and
// the panel (plain DOM). The airfield owns the state (`CharterHost`). Every number is GAME TUNING.
// ============================================================================
import type { SaveData, TycoonSave } from '../core/save';
import { AT, TYCOON_SAVE_V } from './data';

export const CHARTER = {
  /** The tile that has to be owned before the Queen offers one (the North Field). */
  needs: 'ty-gate5',
  /** A crown for the square root of every this-many dollars the airfield has earned. */
  per: 25000,
  /** How much more everything pays, for each crown ever earned. */
  income: 0.05,
};

export interface PerkDef {
  id: 'seed' | 'ants' | 'planes' | 'pack';
  icon: string;
  name: string;
  max: number;
  /** What a level gives, in words; and just its number (for "now → next"). */
  says: (lv: number) => string;
  val: (lv: number) => string;
}
/** 💰 What a new airfield starts with, by Seed Money's level. */
export const SEED = [0, 2000, 5000, 12000, 30000, 75000];
export const PERK_FX = { ants: 0.06, planes: 0.05, pack: 1 };
const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
export const PERKS: PerkDef[] = [
  { id: 'seed', icon: '💰', name: 'Seed money', max: 5, says: (lv) => (lv ? `A new airfield starts with ${money(SEED[lv])}` : 'A new airfield starts with nothing'), val: (lv) => `${money(SEED[lv])} (and ${money(SEED[lv] - SEED[lv - 1])} now)` },
  { id: 'ants', icon: '🐜', name: 'Swift ants', max: 5, says: (lv) => `Your helper ants walk +${Math.round(lv * PERK_FX.ants * 100)}% faster`, val: (lv) => `+${Math.round(lv * PERK_FX.ants * 100)}%` },
  { id: 'planes', icon: '💨', name: 'Tailwinds', max: 5, says: (lv) => `Planes taxi and fly +${Math.round(lv * PERK_FX.planes * 100)}% faster`, val: (lv) => `+${Math.round(lv * PERK_FX.planes * 100)}%` },
  { id: 'pack', icon: '🎒', name: 'Royal backpack', max: 5, says: (lv) => `You carry +${lv * PERK_FX.pack} more`, val: (lv) => `+${lv * PERK_FX.pack}` },
];
/** Crowns for the next level of a perk that's at `lv`. */
export const perkCost = (lv: number) => lv + 1;

/** 👑 What an airfield that has earned this much is worth. */
export function crownsFor(earned: number) {
  return Math.floor(Math.sqrt(Math.max(0, earned) / CHARTER.per));
}
/** What it has to have earned for `n` crowns. */
export const earnedFor = (n: number) => n * n * CHARTER.per;
/** What THIS airfield has earned (since the last charter). */
export function runEarned(st: TycoonSave) {
  return Math.max(0, (st.tally?.earned ?? 0) - (st.runBase ?? 0));
}
export const crownMult = (st: TycoonSave) => 1 + CHARTER.income * (st.crownsAll ?? 0);

/**
 * 👑 TAKE THE CHARTER: the crowns are paid and the save becomes a new airfield's. Only the save is changed: load
 * the game again straight after (nothing built in the world is taken down here).
 */
export function takeCharter(save: SaveData) {
  const st = save.tycoon;
  if (!st) return 0;
  const won = crownsFor(runEarned(st));
  // (today's goals stay as they are, but for 🍪 snacks: there's no café to sell them until it's built again)
  if (st.day?.g.snacks) {
    delete st.day.g.snacks;
    delete st.day.c.snacks;
  }
  save.cash = SEED[Math.min(SEED.length - 1, st.perks?.seed ?? 0)];
  save.rate = 0;
  // (every tile, building and aircraft is a 'ty-' unlock; the 'ty-v..' marks only say which news has been told)
  save.unlocked = save.unlocked.filter((id) => !id.startsWith('ty-'));
  for (const k of Object.keys(save.paid)) if (k.startsWith('ty-') && !/^ty-v\d+$/.test(k)) delete save.paid[k];
  save.tycoon = {
    v: TYCOON_SAVE_V,
    fuel: [0, 0],
    flowers: [4, 0],
    x: AT.start.x,
    z: AT.start.z,
    // kept: the lifetime counts, the days and their stars, how many quests are done, the sky and the settings
    flights: st.flights,
    passengers: st.passengers,
    seq: st.seq,
    bagsLoaded: st.bagsLoaded,
    landings: st.landings,
    day: st.day,
    tally: st.tally,
    quest: st.quest ? { n: st.quest.n } : undefined,
    sky: st.sky,
    people: st.people,
    mixed: st.mixed,
    // 👑
    crowns: (st.crowns ?? 0) + won,
    crownsAll: (st.crownsAll ?? 0) + won,
    charters: (st.charters ?? 0) + 1,
    perks: st.perks,
    runBase: st.tally?.earned ?? 0,
    // 🏆 (v1.01) achievements and records go with you (and this charter's crowns may be a record)
    ach: st.ach,
    rec: { ...(st.rec ?? {}), crowns: Math.max(st.rec?.crowns ?? 0, won) },
  };
  return won;
}

// ----------------------------------------------------------------------------
// The panel
// ----------------------------------------------------------------------------
export interface CharterState {
  /** Crowns to spend, crowns ever earned, charters taken. */
  crowns: number;
  all: number;
  charters: number;
  /** What this airfield has earned, and the crowns a charter would pay now. */
  earned: number;
  gain: number;
  /** Why it can't be taken yet (null: it can). */
  need: string | null;
  perks: Record<string, number>;
}
export interface CharterHost {
  state: () => CharterState;
  buy: (perk: string) => void;
  take: () => void;
}

const CSS = `
.ch-overlay { position: absolute; inset: 0; z-index: 40; display: flex; align-items: center; justify-content: center; background: rgba(10, 20, 30, 0.6); pointer-events: auto;
  padding: max(8px, env(safe-area-inset-top, 0px)) max(8px, env(safe-area-inset-right, 0px)) max(8px, env(safe-area-inset-bottom, 0px)) max(8px, env(safe-area-inset-left, 0px)); }
.ch-overlay.hidden { display: none; }
.ch-panel { display: flex; flex-direction: column; width: min(100%, 520px); max-height: 100%; background: #fff8ec; color: #3a2a1a; border-radius: 20px; box-shadow: 0 8px 0 rgba(0, 0, 0, 0.22); overflow: hidden; font-family: var(--font); }
.ch-head { display: flex; align-items: center; gap: 10px; padding: 10px 12px 8px 16px; font-size: 20px; font-weight: 900; background: linear-gradient(#ffe9a8, #fff8ec); }
.ch-head .ch-have { margin-left: auto; font-size: 17px; color: #a06a00; white-space: nowrap; }
.ch-x { width: 44px; height: 44px; border-radius: 50%; border: none; background: #ead9bf; color: #3a2a1a; font-size: 20px; font-weight: 900; }
.ch-body { display: flex; flex-direction: column; gap: 12px; min-height: 0; overflow: auto; padding: 4px 14px 14px; }
.ch-col { display: flex; flex-direction: column; min-width: 0; }
.ch-sec { font-size: 12px; font-weight: 900; letter-spacing: 0.8px; color: #8a6a4a; margin: 6px 2px 2px; }
.ch-stats { display: flex; flex-wrap: wrap; gap: 6px; }
.ch-stats span { font-size: 13px; font-weight: 800; padding: 5px 9px; border-radius: 10px; background: #f3e6cf; white-space: nowrap; }
.ch-stats span.gold { background: #ffe08a; }
.ch-perk { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 54px; margin-top: 6px; padding: 7px 12px; border: none; border-radius: 14px; font-family: var(--font); text-align: left; color: #3a2a1a; background: #f3e6cf; box-shadow: 0 3px 0 #d9c7a6; }
.ch-perk .ic { font-size: 24px; flex: none; }
.ch-perk .tx { flex: 1; min-width: 0; font-size: 15px; font-weight: 900; }
.ch-perk .tx small { display: block; font-size: 12px; font-weight: 800; color: #7a5c3e; }
.ch-perk .pips { letter-spacing: 1px; font-size: 10px; color: #c9962b; }
.ch-perk .cost { flex: none; font-size: 15px; font-weight: 900; padding: 6px 10px; border-radius: 10px; color: #fff; background: linear-gradient(#f2b632, #d9921a); white-space: nowrap; }
.ch-perk.no .cost { background: linear-gradient(#cfc6b8, #a79d8e); }
.ch-perk.max .cost { background: #2f8a3a; }
.ch-perk:active { transform: translateY(2px); }
.ch-text { font-size: 13px; font-weight: 700; color: #7a5c3e; line-height: 1.4; margin: 2px 2px 0; }
.ch-text b { color: #3a2a1a; }
.ch-go { display: flex; align-items: center; justify-content: space-between; gap: 10px; width: 100%; min-height: 56px; margin-top: 10px; padding: 9px 14px; border: none; border-radius: 14px; font-family: var(--font); font-size: 16px; font-weight: 900; text-align: left; color: #fff; background: linear-gradient(#f2b632, #d9781a); box-shadow: 0 4px 0 #a85a10; }
.ch-go small { display: block; font-size: 12px; font-weight: 800; opacity: 0.95; }
.ch-go b { white-space: nowrap; font-size: 18px; }
.ch-go.no { background: linear-gradient(#cfc6b8, #a79d8e); box-shadow: 0 4px 0 #7d7466; }
.ch-go.sure { background: linear-gradient(#ff7a5c, #d9402a); box-shadow: 0 4px 0 #9a2a1a; }
.ch-go:active { transform: translateY(2px); }
@media (orientation: landscape) and (max-height: 560px) {
  .ch-panel { width: min(100%, 860px); height: 100%; }
  .ch-body { flex-direction: row; gap: 16px; flex: 1; }
  .ch-col { flex: 1; overflow: auto; }
  .ch-head { padding-top: 6px; padding-bottom: 4px; }
}
`;

export class CharterPanel {
  private root: HTMLElement;
  private haveEl: HTMLElement;
  private body: HTMLElement;
  private sig = '';
  private timer = 0;
  private openedAt = 0;
  /** The CHARTER button was tapped once: until this time, a second tap takes it. */
  private sureUntil = 0;

  constructor(parent: HTMLElement, private host: CharterHost) {
    if (!document.getElementById('ch-css')) {
      const style = document.createElement('style');
      style.id = 'ch-css';
      style.textContent = CSS;
      document.head.appendChild(style);
    }
    this.root = document.createElement('div');
    this.root.className = 'ch-overlay hidden';
    this.root.innerHTML =
      `<div class="ch-panel"><div class="ch-head"><span>👑 Royal Charter</span><span class="ch-have"></span><button class="ch-x" aria-label="Close">✕</button></div>` +
      `<div class="ch-body"></div></div>`;
    parent.appendChild(this.root);
    this.haveEl = this.root.querySelector('.ch-have')!;
    this.body = this.root.querySelector('.ch-body')!;
    this.root.querySelector('.ch-x')!.addEventListener('click', () => this.close());
    this.root.addEventListener('click', (e) => { if (e.target === this.root && performance.now() - this.openedAt > 350) this.close(); });
    this.body.addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest('[data-perk],[data-go]') as HTMLElement | null;
      if (!el || el.classList.contains('no') || el.classList.contains('max')) return;
      if (el.dataset.perk) this.host.buy(el.dataset.perk);
      else if (performance.now() < this.sureUntil) return this.host.take();
      else this.sureUntil = performance.now() + 6000;
      this.render(true);
    });
  }

  get isOpen() {
    return !this.root.classList.contains('hidden');
  }
  open() {
    this.openedAt = performance.now();
    this.sureUntil = 0;
    this.root.classList.remove('hidden');
    this.render(true);
    window.clearInterval(this.timer);
    this.timer = window.setInterval(() => (this.isOpen ? this.render(false) : window.clearInterval(this.timer)), 500);
  }
  close() {
    this.root.classList.add('hidden');
    window.clearInterval(this.timer);
  }

  private render(force: boolean) {
    const s = this.host.state();
    const sure = performance.now() < this.sureUntil;
    const sig = JSON.stringify([s, sure]);
    if (!force && sig === this.sig) return;
    this.sig = sig;
    this.haveEl.textContent = `👑 ${s.crowns}`;
    const perks = PERKS.map((p) => {
      const lv = s.perks[p.id] ?? 0;
      const max = lv >= p.max;
      const cost = perkCost(lv);
      const cls = max ? 'max' : s.crowns < cost ? 'no' : '';
      return (
        `<button class="ch-perk ${cls}" data-perk="${p.id}"><span class="ic">${p.icon}</span><span class="tx">${p.name} <span class="pips">${'●'.repeat(lv)}${'○'.repeat(p.max - lv)}</span>` +
        `<small>${max ? p.says(lv) : `${p.says(lv)} → <b>${p.val(lv + 1)}</b>`}</small></span>` +
        `<span class="cost">${max ? 'MAX' : `👑 ${cost}`}</span></button>`
      );
    }).join('');
    const bonus = Math.round(s.all * CHARTER.income * 100);
    const after = Math.round((s.all + s.gain) * CHARTER.income * 100);
    const go = s.need
      ? `<button class="ch-go no" data-go="1"><span>Not yet<small>${s.need}</small></span><b>👑</b></button>`
      : sure
        ? `<button class="ch-go sure" data-go="1"><span>Tap again to confirm<small>This airfield is handed over. It can't be undone.</small></span><b>+${s.gain} 👑</b></button>`
        : `<button class="ch-go" data-go="1"><span>Take the Royal Charter<small>Found a new airfield · income +${bonus}% → +${after}%</small></span><b>+${s.gain} 👑</b></button>`;
    this.body.innerHTML =
      `<div class="ch-col"><div class="ch-stats"><span class="gold">👑 ${s.all} earned in all</span><span>💵 Everything pays +${bonus}%</span><span>📜 ${s.charters} charter${s.charters === 1 ? '' : 's'}</span></div>` +
      `<div class="ch-sec">A NEW AIRFIELD FOR THE QUEEN</div>` +
      `<div class="ch-text">This airfield has earned <b>${money(s.earned)}</b>: a charter would pay <b>👑 ${s.gain}</b> now${s.gain > 0 ? ` (👑 ${s.gain + 1} at ${money(earnedFor(s.gain + 1))})` : ''}. ` +
      `Every crown you have ever earned makes everything pay <b>+${Math.round(CHARTER.income * 100)}%</b>, for good.<br>` +
      `<b>You hand over:</b> your cash, every tile, building, aircraft, destination and upgrade.<br><b>You keep:</b> your level and stats, your 👑 and perks, your stars and counts.</div>${go}</div>` +
      `<div class="ch-col"><div class="ch-sec">ROYAL PERKS · KEPT FOR GOOD</div>${perks}</div>`;
  }
}
