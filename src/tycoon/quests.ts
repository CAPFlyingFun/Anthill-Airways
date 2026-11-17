// ============================================================================
// quests.ts — 🎯 QUESTS (v0.73).
//
// Once the tutorial's done there's always one quest on the card under the airfield's name, with a cash reward:
//   • first a fixed line of STARTER quests that get the airport earning (a Banker, a second flower, Gate 2, the
//     café, the hangar, your first new aircraft, the recycler…). Ones you've already done are passed over.
//   • after them, RANDOM quests for ever: fly N flights, check in N passengers, buy the next aircraft, upgrade the
//     fleet in the hangar, buy an upgrade, buy a tile, recycle N things… A little bigger (and better paid) each time.
// The yellow arrow shows where to go when there's somewhere to go. Skip passes a quest over (no reward).
//
// Saved in save.tycoon.quest: how many are done, and the random one that's on (its id, where its count started,
// how many it needs and what it pays), so a quest never changes on reload.
// ============================================================================
import * as THREE from 'three';
import type { Hud } from '../ui/hud';
import type { SaveData, TycoonSave } from '../core/save';
import type { UnlockDef } from '../data/config';
import { Tutorial, type TutorialWorld } from '../world/tutorial';

/** What the quests need to know about the airfield. */
export interface QuestHost {
  owns: (id: string) => boolean;
  /** Lifetime counts by kind: flights, pax, bags, landings, snacks, earned, recycled, ups (upgrade levels bought), fleet. */
  tally: (kind: string) => number;
  /** The tile to walk to for `id` (or the one needed first). */
  tile: (id: string) => THREE.Vector3 | null;
  /** A building's spot (hangar, an upgradable building you can afford…). */
  spot: (what: 'hangar' | 'upgrade') => THREE.Vector3 | null;
  /** The cheapest tile that's out, and the next aircraft to unlock (null: none). */
  cheapestTile: () => UnlockDef | null;
  nextPlane: () => { id: string; name: string; icon: string; cost: number } | null;
  /** 🗺️ The next destination you could open on the map (null: none), and whether one is open. */
  nextRoute: () => { id: string; name: string; cost: number } | null;
  routeOpen: (id: string) => boolean;
  cafe: () => boolean;
  /** 📦 Is the cargo depot open? */
  cargo: () => boolean;
  recycler: () => boolean;
  fleetMaxed: () => boolean;
  level: () => number;
  pay: (cash: number) => void;
}

interface Quest {
  text: string;
  target: () => THREE.Vector3 | null;
  /** How far along, and how far it has to get. */
  have: () => number;
  need: number;
  reward: number;
}

interface Starter {
  text: string;
  reward: number;
  /** A tile to buy… */
  tile?: string;
  /** …or a count to reach (lifetime). */
  kind?: string;
  need?: number;
  at?: 'hangar' | 'upgrade';
}

const STARTERS: Starter[] = [
  { text: '🏦 Hire a Banker ant: he collects the cash for you', tile: 'ty-banker', reward: 40 },
  { text: '🌼 Grow a second Nectar Flower', tile: 'ty-flower2', reward: 50 },
  { text: '🛫 Fly 5 flights', kind: 'flights', need: 5, reward: 60 },
  { text: '⬆️ Buy an upgrade: walk up to a building with a green arrow and tap ⬆️', kind: 'ups', need: 1, at: 'upgrade', reward: 60 },
  { text: '🐞 Open Gate 2: a second plane', tile: 'ty-gate2', reward: 120 },
  { text: '🍪 Open the Nectar Café: passengers buy snacks', tile: 'ty-cafe', reward: 100 },
  { text: '🍪 Hire a Crumb Runner for the café', tile: 'ty-crumbs', reward: 80 },
  { text: '🛖 Build the Hangar', tile: 'ty-hangar', reward: 150 },
  { text: '🐝 Unlock the Honey Bee in the hangar (3 seats)', tile: 'ty-bees', at: 'hangar', reward: 300 },
  { text: '♻️ Build the Recycler', tile: 'ty-recycler', reward: 150 },
];

const round = (v: number, to: number) => Math.max(to, Math.round(v / to) * to);

export class Quests {
  private tut: Tutorial;
  private cur: Quest | null = null;
  private doneT = 0;

  constructor(world: TutorialWorld, private hud: Hud, save: SaveData, private st: TycoonSave, private h: QuestHost, tiles: UnlockDef[]) {
    const fake = { tutorial: 0, paid: { 'tut-intro': 1 }, unlocked: save.unlocked } as unknown as SaveData;
    this.tut = new Tutorial(world, hud, fake, {
      intro: { title: '', html: '' },
      finish: { title: '', html: '', button: '' },
      defs: tiles,
      steps: () => [
        {
          text: () => (this.cur ? `${this.cur.text}${this.cur.need > 1 ? ` · ${Math.min(this.cur.need, Math.floor(this.cur.have()))}/${this.cur.need}` : ''}` : ''),
          target: () => this.cur?.target() ?? null,
          done: () => false,
          progress: () => (this.cur && this.cur.need > 1 ? this.cur.have() / this.cur.need : null),
        },
      ],
      info: () => ({ step: this.q.n, total: STARTERS.length, label: `🎯 QUEST${this.q.n < STARTERS.length ? ` ${this.q.n + 1}/${STARTERS.length}` : ''} · 🎁 $${this.cur?.reward ?? 0}` }),
      onSkip: () => this.next(false),
    });
  }

  private get q() {
    return (this.st.quest ??= { n: 0 });
  }
  /** Where the arrow points (the 🗺️ minimap shows it too). */
  get target() {
    return this.tut.target;
  }

  /** `show`: the card and the arrow are the quest's right now (no tutorial step or 📖 guide is using them). */
  update(dt: number, show: boolean) {
    if (!this.cur) this.cur = this.load();
    const c = this.cur;
    if (c && c.have() >= c.need && (this.doneT += dt) > 0.4) this.next(true);
    this.tut.update(dt, show && !!this.cur);
    if (!show) this.tut.refresh();
  }

  /** The current quest is over (`won`: it pays), on to the next. */
  private next(won: boolean) {
    const c = this.cur;
    this.doneT = 0;
    if (c && won) {
      this.h.pay(c.reward);
      this.hud.banner('🎯 Quest done!', `+$${c.reward.toLocaleString('en-US')} · ${c.text.replace(/:.*/, '')}`, 2600);
    }
    const q = this.q;
    q.n++;
    delete q.id;
    this.cur = null;
  }

  /** The quest that's on: the next starter that isn't done yet, or the saved (or a new) random one. */
  private load(): Quest | null {
    const q = this.q;
    while (q.n < STARTERS.length) {
      const quest = this.starter(STARTERS[q.n]);
      if (quest.have() < quest.need) return quest;
      q.n++; // (done before it was asked for: no reward, no fuss)
    }
    if (!q.id) this.roll();
    return this.random();
  }

  private starter(s: Starter): Quest {
    const at = s.at;
    if (s.tile) {
      const id = s.tile;
      return { text: s.text, reward: s.reward, need: 1, have: () => (this.h.owns(id) ? 1 : 0), target: () => (at ? this.h.spot(at) : this.h.tile(id)) };
    }
    const kind = s.kind!;
    return { text: s.text, reward: s.reward, need: s.need!, have: () => this.h.tally(kind), target: () => (at ? this.h.spot(at) : null) };
  }

  /** Pick a new random quest (not the kind that just finished) and save it. */
  private roll() {
    const q = this.q;
    const k = q.n - STARTERS.length; // (how many random ones are behind you)
    const grow = 1 + Math.min(k, 40) * 0.12;
    const pay = (base: number) => round(base * grow * (1 + this.h.level() * 0.05), 10);
    const plane = this.h.nextPlane();
    const tile = this.h.cheapestTile();
    const pool: { id: string; need: number; reward: number }[] = [
      { id: 'flights', need: round(4 * grow, 1), reward: pay(70) },
      { id: 'pax', need: round(10 * grow, 1), reward: pay(60) },
      { id: 'bags', need: round(8 * grow, 1), reward: pay(60) },
      { id: 'landings', need: round(4 * grow, 1), reward: pay(70) },
      { id: 'earned', need: round(300 * grow * (1 + this.h.level() * 0.15), 50), reward: pay(80) },
      { id: 'ups', need: Math.min(3, 1 + Math.floor(k / 6)), reward: pay(90) },
    ];
    if (this.h.cafe()) pool.push({ id: 'snacks', need: round(6 * grow, 1), reward: pay(60) });
    if (this.h.recycler()) pool.push({ id: 'recycled', need: round(6 * grow, 1), reward: pay(60) });
    if (this.h.cargo()) pool.push({ id: 'cargo', need: round(8 * grow, 1), reward: pay(80) });
    if (this.h.owns('ty-hangar') && !this.h.fleetMaxed()) pool.push({ id: 'fleet', need: 1, reward: pay(150) });
    if (this.h.owns('ty-hangar') && plane) pool.push({ id: `plane:${plane.id}`, need: 1, reward: round(plane.cost * 0.1, 10) });
    if (tile) pool.push({ id: `tile:${tile.id}`, need: 1, reward: round(tile.cost * 0.15, 10) });
    const dest = this.h.nextRoute();
    if (dest) pool.push({ id: `route:${dest.id}`, need: 1, reward: round(dest.cost * 0.08, 10) });
    const fresh = pool.filter((p) => p.id.split(':')[0] !== q.last);
    const pick = fresh[Math.floor(Math.random() * fresh.length)] ?? pool[0];
    q.id = pick.id;
    q.need = pick.need;
    q.reward = pick.reward;
    q.last = pick.id.split(':')[0];
    const kind = pick.id.includes(':') ? null : pick.id;
    q.base = kind ? this.h.tally(kind) : 0;
  }

  private random(): Quest {
    const q = this.q;
    const [kind, arg] = q.id!.split(':');
    const need = q.need ?? 1;
    const reward = q.reward ?? 50;
    const base = q.base ?? 0;
    const since = (k: string) => () => this.h.tally(k) - base;
    const none = () => null;
    switch (kind) {
      case 'tile': {
        const def = this.h.cheapestTile();
        const name = def?.id === arg ? `${def.icon} ${def.name}` : 'the glowing tile';
        return { text: `✨ Buy ${name}`, need: 1, reward, have: () => (this.h.owns(arg) ? 1 : 0), target: () => this.h.tile(arg) };
      }
      case 'plane': {
        const p = this.h.nextPlane();
        return { text: `🛖 Unlock the ${p?.id === arg ? `${p.icon} ${p.name}` : 'next aircraft'} in the hangar`, need: 1, reward, have: () => (this.h.owns(arg) ? 1 : 0), target: () => this.h.spot('hangar') };
      }
      case 'route': {
        const d = this.h.nextRoute();
        return { text: `🗺️ Open ${d?.id === arg ? d.name : 'a new destination'} on the map (the 🗺️ button, top right)`, need: 1, reward, have: () => (this.h.routeOpen(arg) ? 1 : 0), target: none };
      }
      case 'fleet':
        return { text: '🛖 Upgrade your fleet in the hangar (💺 seats or 💨 speed)', need, reward, have: since('fleet'), target: () => this.h.spot('hangar') };
      case 'ups':
        return { text: need > 1 ? `⬆️ Buy ${need} upgrades (buildings or staff)` : '⬆️ Buy an upgrade (a building or your staff)', need, reward, have: since('ups'), target: () => this.h.spot('upgrade') };
      case 'pax':
        return { text: `🎫 Check in ${need} passengers`, need, reward, have: since('pax'), target: none };
      case 'bags':
        return { text: `🧳 Load ${need} bags`, need, reward, have: since('bags'), target: none };
      case 'landings':
        return { text: `🛬 Land ${need} flights`, need, reward, have: since('landings'), target: none };
      case 'snacks':
        return { text: `🍪 Sell ${need} snacks`, need, reward, have: since('snacks'), target: none };
      case 'cargo':
        return { text: `📦 Ship ${need} crates of cargo`, need, reward, have: since('cargo'), target: none };
      case 'recycled':
        return { text: `♻️ Recycle ${need} things`, need, reward, have: since('recycled'), target: none };
      case 'earned':
        return { text: `💵 Earn $${need.toLocaleString('en-US')}`, need, reward, have: since('earned'), target: none };
      default:
        return { text: `🛫 Fly ${need} flights`, need, reward, have: since('flights'), target: none };
    }
  }
}
