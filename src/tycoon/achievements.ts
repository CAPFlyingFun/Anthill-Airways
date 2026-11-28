// ============================================================================
// achievements.ts — 🏆 ACHIEVEMENTS AND A RECORDS BOARD (v1.01, Phase 7 of the plan)
//
// Joshua's plan, Phase 7: "Goals to chase across a whole game, and a board of your bests. Achievements with a crown
// or cash reward: first jumbo, 100 night flights, every destination opened, a 5-star day, first Royal Charter, and
// so on (about 30 to start). Records board (a menu): most flights in a day, biggest single fare, longest route
// flown, most cargo in one plane, best rating. Kept across charters, like your level."
//
// An achievement is a lifetime count reaching a number (the airfield's `tally`, and a few counts kept here for it).
// It's checked about once a second and paid at once (cash, or 👑 crowns) with a banner; one that was already true
// when this version first opened is paid too, in one banner. Done ones are kept in save.tycoon.ach, the records in
// save.tycoon.rec: the Royal Charter keeps both. Every number here is GAME TUNING.
// ============================================================================
import { ROUTES } from './fleet';

export interface AchDef {
  id: string;
  icon: string;
  name: string;
  desc: string;
  /** The count it watches (the airfield's `value(kind)`), and the number it needs. */
  kind: string;
  need: number;
  /** Its reward: cash, or crowns. */
  cash?: number;
  crowns?: number;
  /** The group it's listed under. */
  group: string;
}

const a = (group: string, id: string, icon: string, name: string, desc: string, kind: string, need: number, reward: { cash?: number; crowns?: number }): AchDef => ({ group, id, icon, name, desc, kind, need, ...reward });

export const ACHIEVEMENTS: AchDef[] = [
  // ✈️ flying
  a('Flights', 'fly1', '🛫', 'First Flight', 'Fly your first flight', 'flights', 1, { cash: 100 }),
  a('Flights', 'fly100', '✈️', 'Frequent Flyer', 'Fly 100 flights', 'flights', 100, { cash: 2000 }),
  a('Flights', 'fly1000', '🛩️', 'Busy Skies', 'Fly 1,000 flights', 'flights', 1000, { crowns: 1 }),
  a('Flights', 'fly5000', '🌍', 'Sky Highway', 'Fly 5,000 flights', 'flights', 5000, { crowns: 2 }),
  a('Flights', 'land500', '🛬', 'Smooth Landings', 'Land 500 flights', 'landings', 500, { cash: 3000 }),
  a('Flights', 'full1', '🎟️', 'Full House', 'Fly a plane with every seat taken', 'full', 1, { cash: 1000 }),
  a('Flights', 'full100', '🎪', 'Packed Skies', 'Fly 100 full planes', 'full', 100, { cash: 8000 }),
  a('Flights', 'night1', '🌙', 'Night Owl', 'Fly a flight at night', 'night', 1, { cash: 500 }),
  a('Flights', 'night100', '🦉', 'Moonlit Airline', 'Fly 100 night flights', 'night', 100, { crowns: 1 }),
  a('Flights', 'bow10', '🌈', 'Over the Rainbow', 'Fly 10 flights under a rainbow', 'rainbow', 10, { cash: 3000 }),
  // 🧍 travellers and freight
  a('Travellers', 'pax100', '🎫', 'Welcome Aboard', 'Check in 100 travellers', 'pax', 100, { cash: 1000 }),
  a('Travellers', 'pax1000', '🧍', 'Crowd Pleaser', 'Check in 1,000 travellers', 'pax', 1000, { cash: 5000 }),
  a('Travellers', 'pax10000', '🏟️', 'Garden Metropolis', 'Check in 10,000 travellers', 'pax', 10000, { crowns: 1 }),
  a('Travellers', 'bags500', '🧳', 'Bag Handler', 'Load 500 bags', 'bags', 500, { cash: 3000 }),
  a('Travellers', 'cargo1000', '📦', 'Freight Forwarder', 'Fly 1,000 crates of cargo', 'cargo', 1000, { cash: 10000 }),
  a('Travellers', 'star48', '⭐', 'Five-Star Airport', 'Reach an airport rating of 4.8', 'rating10', 48, { crowns: 1 }),
  // 🛩️ the fleet and the map
  a('Fleet & map', 'jumbo1', '🛡️', 'First Jumbo', 'Fly a jumbo', 'jumbo', 1, { cash: 10000 }),
  a('Fleet & map', 'types5', '🦋', 'Mixed Fleet', 'Own 5 kinds of aircraft', 'types', 5, { cash: 5000 }),
  a('Fleet & map', 'paint1', '🎨', 'Make It Yours', 'Paint a plane', 'painted', 1, { cash: 500 }),
  a('Fleet & map', 'routes5', '🗺️', 'Explorer', 'Open 5 destinations', 'routes', 5, { cash: 5000 }),
  a('Fleet & map', 'routesAll', '🧭', 'Every Destination', `Open all ${ROUTES.length} destinations`, 'routes', ROUTES.length, { crowns: 2 }),
  a('Fleet & map', 'creek', '🏞️', 'Far and Away', 'Fly to Creek Crossing, the farthest place', 'creek', 1, { cash: 20000 }),
  a('Fleet & map', 'ads10', '📣', 'Mad Ant', 'Advertise destinations 10 times', 'ads', 10, { cash: 5000 }),
  // 🏗️ the airport
  a('Airport', 'gates8', '🚪', 'All Gates Open', 'Open all 8 gates', 'gates', 8, { crowns: 1 }),
  a('Airport', 'staff20', '🐜', 'Hiring Spree', 'Hire or train staff 20 times', 'staff', 20, { cash: 5000 }),
  a('Airport', 'day3', '📅', 'Perfect Day', 'Finish a day with ⭐⭐⭐', 'days3', 1, { cash: 2000 }),
  a('Airport', 'day3x7', '🗓️', 'Week of Wonders', 'Finish 7 days with ⭐⭐⭐', 'days3', 7, { cash: 15000 }),
  a('Airport', 'earn100k', '💰', 'Hundred Grand', 'Earn $100,000', 'earned', 100000, { cash: 5000 }),
  a('Airport', 'earn1m', '💎', 'Millionaire', 'Earn $1,000,000', 'earned', 1000000, { crowns: 2 }),
  a('Airport', 'charter1', '👑', 'Royal Charter', 'Take your first Royal Charter', 'charters', 1, { crowns: 1 }),
  // 🎲 surprises
  a('Surprises', 'lizard10', '🦎', 'Lizard Wrangler', 'Shoo 10 lizards off the runway', 'ev_lizard', 10, { cash: 3000 }),
  a('Surprises', 'feather10', '🪶', 'Feather Finder', 'Find 10 feathers', 'ev_feather', 10, { cash: 2000 }),
  a('Surprises', 'web5', '🕸️', 'Web Sweeper', 'Clear 5 spider webs', 'ev_web', 5, { cash: 3000 }),
  a('Surprises', 'bird5', '🐦', 'Bird Watcher', 'Shoo 5 birds off the runway', 'ev_bird', 5, { cash: 3000 }),
  a('Surprises', 'bag5', '🔎', 'Lost & Found', 'Return 5 lost bags', 'ev_bag', 5, { cash: 3000 }),
  a('Surprises', 'vip5', '🥂', 'VIP Service', 'Fly 5 VIP charters on time', 'ev_charter', 5, { crowns: 1 }),
];

/** The records board: each is the best one ever (higher is better). `fmt` shows it. */
export interface RecDef {
  id: string;
  icon: string;
  name: string;
  fmt: (v: number) => string;
}
const money = (v: number) => `$${Math.round(v).toLocaleString()}`;
const num = (v: number) => Math.round(v).toLocaleString();
export const RECORDS: RecDef[] = [
  { id: 'dayFlights', icon: '📅', name: 'Most flights in one day', fmt: num },
  { id: 'flightPay', icon: '💵', name: 'Biggest single flight', fmt: money },
  { id: 'paxOne', icon: '🧍', name: 'Most travellers on one flight', fmt: num },
  { id: 'cargoOne', icon: '📦', name: 'Most cargo on one flight', fmt: (v) => `${num(v)} crates` },
  { id: 'farthest', icon: '🗺️', name: 'Farthest place flown', fmt: (v) => { const r = ROUTES[Math.round(v)]; return r ? r.place : '—'; } },
  { id: 'rating', icon: '⭐', name: 'Best airport rating', fmt: (v) => `⭐ ${v.toFixed(1)}` },
  { id: 'fastDay', icon: '⏱️', name: 'Fastest day done', fmt: (v) => `${Math.floor(v / 60)}m ${String(Math.round(v % 60)).padStart(2, '0')}s` },
  { id: 'cash', icon: '🏦', name: 'Most cash at once', fmt: money },
  { id: 'crowns', icon: '👑', name: 'Most crowns from one charter', fmt: num },
];
/** Records where LOWER is better. */
const LOWER = new Set(['fastDay']);

export interface TrophyHooks {
  /** A lifetime count (the airfield's tally, and the rest above). */
  value: (kind: string) => number;
  /** The done list and the records (in the save). */
  done: () => string[];
  records: () => Record<string, number>;
  /** Pay a reward. */
  pay: (cash: number, crowns: number) => void;
  banner: (title: string, sub: string, ms: number) => void;
  sfx: () => void;
}

export class Trophies {
  private t = 0;
  private queue: { title: string; sub: string }[] = [];
  /** When the last banner went up (real time: one after another, never on top of one another). */
  private bannerAt = -1e9;
  /** The 🏆 button's badge: achievements done since the panel was last opened. */
  fresh = 0;
  onChange: () => void = () => {};

  constructor(private h: TrophyHooks) {}

  /** A record: kept if it beats the best (or is the first). True if it's a new best. */
  record(id: string, v: number) {
    const r = this.h.records();
    if (!Number.isFinite(v) || v <= 0) return false;
    const was = r[id];
    const better = was === undefined || (LOWER.has(id) ? v < was : v > was);
    if (better) r[id] = Math.round(v * 100) / 100;
    return better;
  }

  /** Done (won once, it stays won: a count can go back, like gates after a Royal Charter). */
  isDone(d: AchDef) {
    return this.h.done().includes(d.id);
  }

  progress(d: AchDef) {
    return Math.min(d.need, Math.max(0, this.h.value(d.kind)));
  }

  /** Check every achievement (about once a second), and show the banners one after another. */
  update(dt: number) {
    const now = performance.now();
    if (now - this.bannerAt > 3300 && this.queue.length) {
      const b = this.queue.shift()!;
      this.h.banner(b.title, b.sub, 3000);
      this.h.sfx();
      this.bannerAt = now;
    }
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 1;
    const done = this.h.done();
    const got: AchDef[] = [];
    for (const d of ACHIEVEMENTS) {
      if (done.includes(d.id)) continue;
      if (this.h.value(d.kind) >= d.need) {
        done.push(d.id);
        got.push(d);
      }
    }
    if (!got.length) return;
    const cash = got.reduce((s, d) => s + (d.cash ?? 0), 0);
    const crowns = got.reduce((s, d) => s + (d.crowns ?? 0), 0);
    this.h.pay(cash, crowns);
    this.fresh += got.length;
    const prize = (c: number, k: number) => [c ? `+$${c.toLocaleString()}` : '', k ? `+${k} 👑` : ''].filter(Boolean).join(' · ');
    if (got.length > 3) {
      // (a save that had already done many of them, the first time it's opened on this version: one banner)
      this.queue.push({ title: `🏆 ${got.length} ACHIEVEMENTS!`, sub: `${got.slice(0, 4).map((d) => d.icon).join(' ')}… · ${prize(cash, crowns)}` });
    } else {
      for (const d of got) this.queue.push({ title: `🏆 ${d.icon} ${d.name.toUpperCase()}`, sub: `${d.desc} · ${prize(d.cash ?? 0, d.crowns ?? 0)}` });
    }
    this.onChange();
  }
}

// ---- 🏆 The panel ----

export class TrophyPanel {
  private root: HTMLElement;
  private body: HTMLElement;
  private sum: HTMLElement;
  private tab: 'ach' | 'rec' = 'ach';
  private openedAt = 0;
  private trophies: Trophies | null = null;
  private records: () => Record<string, number> = () => ({});

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'gm-overlay hidden';
    this.root.innerHTML = `<div class="gm-panel tr-panel">
      <div class="gm-title">🏆 Trophies</div>
      <div class="tr-tabs"><button data-t="ach" class="on">🏅 Achievements</button><button data-t="rec">📜 Records</button></div>
      <div class="gm-cash tr-sum"></div>
      <div class="tr-body"></div>
      <button class="gm-close">Close</button>
    </div>`;
    parent.appendChild(this.root);
    this.body = this.root.querySelector('.tr-body')!;
    this.sum = this.root.querySelector('.tr-sum')!;
    this.root.querySelector('.gm-close')!.addEventListener('click', () => this.close());
    this.root.addEventListener('click', (e) => {
      if (e.target === this.root && performance.now() - this.openedAt > 350) this.close();
    });
    this.root.querySelectorAll('.tr-tabs button').forEach((b) =>
      b.addEventListener('click', () => {
        this.tab = (b as HTMLElement).dataset.t as 'ach' | 'rec';
        this.root.querySelectorAll('.tr-tabs button').forEach((x) => x.classList.toggle('on', x === b));
        this.render();
        this.body.scrollTop = 0;
      }),
    );
  }

  get isOpen() {
    return !this.root.classList.contains('hidden');
  }

  open(trophies: Trophies, records: () => Record<string, number>) {
    this.trophies = trophies;
    this.records = records;
    this.openedAt = performance.now();
    trophies.fresh = 0;
    trophies.onChange();
    this.root.classList.remove('hidden');
    this.render();
    this.body.scrollTop = 0;
  }

  close() {
    this.root.classList.add('hidden');
  }

  private render() {
    const t = this.trophies;
    if (!t) return;
    if (this.tab === 'ach') {
      const doneN = ACHIEVEMENTS.filter((d) => t.isDone(d)).length;
      this.sum.textContent = `${doneN} of ${ACHIEVEMENTS.length} done`;
      let html = '';
      let group = '';
      for (const d of ACHIEVEMENTS) {
        if (d.group !== group) {
          group = d.group;
          html += `<div class="tr-group">${group}</div>`;
        }
        const have = t.progress(d);
        const done = t.isDone(d);
        const pct = Math.round((have / d.need) * 100);
        const prize = d.crowns ? `👑 ${d.crowns}` : `💵 ${(d.cash ?? 0).toLocaleString()}`;
        const shown = d.kind === 'rating10' ? `⭐ ${(have / 10).toFixed(1)} / ${(d.need / 10).toFixed(1)}` : `${Math.floor(have).toLocaleString()} / ${d.need.toLocaleString()}`;
        html += `<div class="tr-ach ${done ? 'done' : ''}">
          <span class="tr-ic">${d.icon}</span>
          <span class="tr-tx"><b>${d.name}</b><i>${d.desc}</i>${done ? '' : `<span class="tr-bar"><span style="width:${pct}%"></span></span><i class="tr-n">${shown}</i>`}</span>
          <span class="tr-pr">${done ? '✅' : prize}</span>
        </div>`;
      }
      this.body.innerHTML = html;
    } else {
      const r = this.records();
      this.sum.textContent = 'Your bests, kept across charters';
      this.body.innerHTML = RECORDS.map((d) => `<div class="tr-rec"><span class="tr-ic">${d.icon}</span><span class="tr-tx"><b>${d.name}</b></span><span class="tr-v">${r[d.id] !== undefined ? d.fmt(r[d.id]) : '—'}</span></div>`).join('');
    }
  }
}
