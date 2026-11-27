// ============================================================================
// staff.ts — ⬆️ STAFF UPGRADES (v0.70, after AirportPRG's staff levels).
//
// Stand on the ⬆️ STAFF OFFICE pad inside the terminal (left of the check-in ant): the upgrade panel opens with one row per job you've hired. Each
// job goes up to Lv 10, each level dearer than the last:
//   ⛽ Fuel Runners · 🧳 Baggage ants · 🍪 Café crew · 🧹 Janitor — walk & work faster (+12% a level), carry more (+1 every 2)
//   🎫 Check-in ant                                  — checks passengers in faster (+15% a level)
//   🎁 Gift shop                                     — restocks faster (+15% a level) and sells dearer (+$1 every 2)
//   🏦 Banker                                        — grabs the cash faster (+20% a level)
//   🎒 Your backpack                                 — carries 1 more a level
// The levels are saved in save.tycoon.staff (by job id). The airfield applies them (applyStaff).
// ============================================================================
import type { UpPanelModel, UpRowModel } from '../ui/hud';

export type StaffId = 'fuel' | 'bags' | 'cafe' | 'janitor' | 'checkin' | 'shop' | 'banker' | 'cargo' | 'you' | 'ticket' | 'gateAgent' | 'securityAnt' | 'atc';

export interface StaffDef {
  id: StaffId;
  icon: string;
  name: string;
  /** The tile that hires the job (null: always there). */
  needs: string | null;
  /** The first level's price (each next one ×STAFF_GROWTH). */
  base: number;
  /** (v0.98) Its top level, if not STAFF_MAX (the ticket agents: one more at the counter a level, three at most). */
  max?: number;
}

/** A job's top level. */
export function maxOf(def: StaffDef) {
  return def.max ?? STAFF_MAX;
}

export const STAFF_MAX = 10;
export const STAFF_GROWTH = 1.7;

export const STAFF: StaffDef[] = [
  { id: 'fuel', icon: '⛽', name: 'Fuel Runners', needs: 'ty-runner', base: 80 },
  { id: 'bags', icon: '🧳', name: 'Baggage ants', needs: 'ty-bags', base: 90 },
  { id: 'checkin', icon: '🎫', name: 'Check-in ant', needs: 'ty-checkin', base: 100 },
  { id: 'cafe', icon: '🍪', name: 'Café crew', needs: 'ty-crumbs', base: 140 },
  { id: 'banker', icon: '🏦', name: 'Banker', needs: 'ty-banker', base: 150 },
  { id: 'janitor', icon: '🧹', name: 'Janitor ant', needs: 'ty-janitor', base: 120 },
  { id: 'cargo', icon: '📦', name: 'Cargo ants', needs: 'ty-cargoant', base: 400 },
  { id: 'you', icon: '🎒', name: 'Your backpack', needs: null, base: 70 },
  // 👷 (v0.98, Phase 4: "Ants you can see working at their posts, instead of upgrades that only change numbers")
  { id: 'ticket', icon: '🎫', name: 'Ticket agents', needs: 'ty-checkin', base: 600, max: 3 },
  { id: 'gateAgent', icon: '🛫', name: 'Gate agents', needs: 'ty-gate2', base: 500 },
  { id: 'securityAnt', icon: '🛂', name: 'Security ants', needs: 'ty-security', base: 700 },
  { id: 'atc', icon: '🎧', name: 'Tower controller', needs: 'ty-atc', base: 800 },
];

/** What a level does, in numbers. */
export const staffFx = {
  /** Helpers: x walk and work speed. */
  speed: (lv: number) => 1 + 0.12 * lv,
  /** Helpers: extra carry. */
  carry: (lv: number) => Math.floor(lv / 2),
  /** Check-in / the shop's restock: x speed. */
  quick: (lv: number) => 1 + 0.15 * lv,
  /** The shop: + $ per sale. */
  shopPrice: (lv: number) => Math.floor(lv / 2),
  /** The Banker: x grab speed. */
  grab: (lv: number) => 1 + 0.2 * lv,
  /** You: extra carry. */
  backpack: (lv: number) => lv,
  /** 🎫 (v0.98) Ticket agents: each one more at the counter checks the line in that much faster (x1.9 with one, x3.7
   *  with three, beside the check-in ant). GAME TUNING. */
  ticket: (lv: number) => 1 + 0.9 * lv,
  /** 🛫 Gate agents: the wait before a plane leaves is shorter (÷1.12 a level), and an agent stands at every gate. */
  gateAgent: (lv: number) => 1 / (1 + 0.12 * lv),
  /** 🛂 Security ants: scanning is quicker (÷1.15 a level), an ant at every lane. */
  securityAnt: (lv: number) => 1 / (1 + 0.15 * lv),
  /** 🎧 Tower controller: every plane taxis, takes off and lands faster (+4% a level). */
  atc: (lv: number) => 1 + 0.04 * lv,
};

/** The price of the next level. */
export function staffCost(def: StaffDef, lv: number) {
  return Math.round(def.base * Math.pow(STAFF_GROWTH, lv));
}

/** What a job does at a level, in words (for the panel). */
function effect(id: StaffId, lv: number) {
  const x = (v: number) => `×${Math.round(v * 100) / 100}`;
  switch (id) {
    case 'fuel':
    case 'bags':
    case 'cafe':
    case 'janitor':
    case 'cargo':
      return `${x(staffFx.speed(lv))} speed · +${staffFx.carry(lv)} carry`;
    case 'checkin':
      return `${x(staffFx.quick(lv))} check-in speed`;
    case 'shop':
      return `${x(staffFx.quick(lv))} restock · +$${staffFx.shopPrice(lv)} a sale`;
    case 'banker':
      return `${x(staffFx.grab(lv))} grab speed`;
    case 'you':
      return `+${staffFx.backpack(lv)} carry`;
    case 'ticket':
      return `${lv} agent${lv === 1 ? '' : 's'} · ${x(staffFx.ticket(lv))} check-in`;
    case 'gateAgent':
      return `${x(1 / staffFx.gateAgent(lv))} boarding`;
    case 'securityAnt':
      return `${x(1 / staffFx.securityAnt(lv))} scanning`;
    case 'atc':
      return `${x(staffFx.atc(lv))} plane speed`;
  }
}

/** The panel: one row per hired job. `levels` = save.tycoon.staff. */
export function staffPanel(levels: Record<string, number>, cash: number, owns: (id: string) => boolean): UpPanelModel {
  const rows: UpRowModel[] = STAFF.filter((d) => !d.needs || owns(d.needs)).map((d) => {
    const lv = levels[d.id] ?? 0;
    const top = maxOf(d);
    const maxed = lv >= top;
    const buys: UpRowModel['buys'] = [];
    if (!maxed) {
      const one = staffCost(d, lv);
      buys.push({ n: 1, label: '×1', cost: one, ok: cash >= one });
      // MAX: as many levels as you can pay for right now
      let n = 0;
      let total = 0;
      while (lv + n < top && total + staffCost(d, lv + n) <= cash) total += staffCost(d, lv + n++);
      if (n >= 2) buys.push({ n, label: `MAX ×${n}`, cost: total, ok: true });
    }
    return {
      id: d.id,
      icon: d.icon,
      name: d.name,
      sub: '',
      level: maxed ? 'MAX' : `Lv ${lv}/${top}`,
      pips: Array.from({ length: top }, (_, i) => ({ filled: i < lv, star: false })),
      now: effect(d.id, lv),
      next: maxed ? null : effect(d.id, lv + 1),
      star: '',
      buys,
    };
  });
  return { tabs: [], title: '⬆️ Staff upgrades', warn: rows.length > 1 ? '' : 'Hire ants on the glowing tiles: their jobs show up here', cash, rows };
}

/** Buy `n` levels of job `id` if there's the cash: returns what it cost (0 = nothing bought). */
export function buyStaff(levels: Record<string, number>, id: string, n: number, cash: number): number {
  const d = STAFF.find((s) => s.id === id);
  if (!d) return 0;
  let lv = levels[id] ?? 0;
  let spent = 0;
  for (let k = 0; k < n && lv < maxOf(d); k++) {
    const c = staffCost(d, lv);
    if (spent + c > cash) break;
    spent += c;
    lv++;
  }
  levels[id] = lv;
  return spent;
}
