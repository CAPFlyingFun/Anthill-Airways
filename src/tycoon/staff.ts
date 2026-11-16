// ============================================================================
// staff.ts — ⬆️ STAFF UPGRADES (v0.70, after AirportPRG's staff levels).
//
// Stand on the ⬆️ STAFF pad by the colony's nest: the upgrade panel opens with one row per job you've hired. Each
// job goes up to Lv 10, each level dearer than the last:
//   ⛽ Fuel Runners · 🧳 Baggage ants · 🍪 Café crew  — walk & work faster (+12% a level), carry more (+1 every 2)
//   🎫 Check-in ant                                  — checks passengers in faster (+15% a level)
//   🎁 Gift shop                                     — restocks faster (+15% a level) and sells dearer (+$1 every 2)
//   🏦 Banker                                        — grabs the cash faster (+20% a level)
//   🎒 Your backpack                                 — carries 1 more a level
// The levels are saved in save.tycoon.staff (by job id). The airfield applies them (applyStaff).
// ============================================================================
import type { UpPanelModel, UpRowModel } from '../ui/hud';

export type StaffId = 'fuel' | 'bags' | 'cafe' | 'checkin' | 'shop' | 'banker' | 'you';

export interface StaffDef {
  id: StaffId;
  icon: string;
  name: string;
  /** The tile that hires the job (null: always there). */
  needs: string | null;
  /** The first level's price (each next one ×STAFF_GROWTH). */
  base: number;
}

export const STAFF_MAX = 10;
export const STAFF_GROWTH = 1.7;

export const STAFF: StaffDef[] = [
  { id: 'fuel', icon: '⛽', name: 'Fuel Runners', needs: 'ty-runner', base: 80 },
  { id: 'bags', icon: '🧳', name: 'Baggage ants', needs: 'ty-bags', base: 90 },
  { id: 'checkin', icon: '🎫', name: 'Check-in ant', needs: 'ty-checkin', base: 100 },
  { id: 'cafe', icon: '🍪', name: 'Café crew', needs: 'ty-crumbs', base: 140 },
  { id: 'shop', icon: '🎁', name: 'Gift shop', needs: 'ty-shop', base: 160 },
  { id: 'banker', icon: '🏦', name: 'Banker', needs: 'ty-banker', base: 150 },
  { id: 'you', icon: '🎒', name: 'Your backpack', needs: null, base: 70 },
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
      return `${x(staffFx.speed(lv))} speed · +${staffFx.carry(lv)} carry`;
    case 'checkin':
      return `${x(staffFx.quick(lv))} check-in speed`;
    case 'shop':
      return `${x(staffFx.quick(lv))} restock · +$${staffFx.shopPrice(lv)} a sale`;
    case 'banker':
      return `${x(staffFx.grab(lv))} grab speed`;
    case 'you':
      return `+${staffFx.backpack(lv)} carry`;
  }
}

/** The panel: one row per hired job. `levels` = save.tycoon.staff. */
export function staffPanel(levels: Record<string, number>, cash: number, owns: (id: string) => boolean): UpPanelModel {
  const rows: UpRowModel[] = STAFF.filter((d) => !d.needs || owns(d.needs)).map((d) => {
    const lv = levels[d.id] ?? 0;
    const maxed = lv >= STAFF_MAX;
    const buys: UpRowModel['buys'] = [];
    if (!maxed) {
      const one = staffCost(d, lv);
      buys.push({ n: 1, label: '×1', cost: one, ok: cash >= one });
      // MAX: as many levels as you can pay for right now
      let n = 0;
      let total = 0;
      while (lv + n < STAFF_MAX && total + staffCost(d, lv + n) <= cash) total += staffCost(d, lv + n++);
      if (n >= 2) buys.push({ n, label: `MAX ×${n}`, cost: total, ok: true });
    }
    return {
      id: d.id,
      icon: d.icon,
      name: d.name,
      sub: '',
      level: maxed ? 'MAX' : `Lv ${lv}/${STAFF_MAX}`,
      pips: Array.from({ length: STAFF_MAX }, (_, i) => ({ filled: i < lv, star: false })),
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
  for (let k = 0; k < n && lv < STAFF_MAX; k++) {
    const c = staffCost(d, lv);
    if (spent + c > cash) break;
    spent += c;
    lv++;
  }
  levels[id] = lv;
  return spent;
}
