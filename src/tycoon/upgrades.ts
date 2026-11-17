// ============================================================================
// upgrades.ts — ⬆️ BUILDING UPGRADES and their MENU (v0.72), in the style of Joshua's Galaxy Defenders:
//
//  • A bouncing green arrow floats over anything that has an upgrade you can afford right now.
//  • Tap the thing itself (a gate, a flower, the terminal, the hangar…), or walk near it and tap the ⬆️ button:
//    a dark navy menu opens in the middle of the screen. One row per upgrade: icon + name and the price on the
//    first line, "Lv 2/8" and what a level does on the second. Green-edged = you can afford it, dim red = not yet,
//    MAX = done. Tap a row to buy one level; Close (or a tap outside) shuts it.
//  • Glowing tiles only BUILD things now; everything after that is upgraded here. Levels are permanent
//    (save.tycoon.ups, by "<building>.<upgrade>"; each level costs base × 1.5 per level already bought).
//
// This file has the numbers (UPS) and the menu's DOM; the airfield decides what each building's menu shows and puts
// the levels to work.
// ============================================================================

export interface UpDef {
  k: string;
  ic: string;
  name: string;
  /** What ONE level does, in a few words ("+8% speed"). */
  desc: string;
  max: number;
  base: number;
}

/** Each kind of building's upgrades. (The 🛖 hangar's and the ⬆️ staff's rows are built by the airfield.) */
export const UPS = {
  gate: [
    { k: 'board', ic: '🚪', name: 'Quick Boarding', desc: '-10% boarding wait', max: 5, base: 120 },
    { k: 'fuel', ic: '⛽', name: 'Bigger FUEL pad', desc: '+2 nectar', max: 4, base: 100 },
    { k: 'seats', ic: '🪑', name: 'Waiting Area', desc: '+2 passengers wait', max: 4, base: 140 },
  ],
  flower: [
    { k: 'speed', ic: '🌼', name: 'Sweeter Bloom', desc: '+15% nectar speed', max: 8, base: 90 },
    { k: 'cap', ic: '🍯', name: 'Deeper Cup', desc: '+2 nectar held', max: 5, base: 80 },
  ],
  terminal: [
    { k: 'ticket', ic: '🎫', name: 'Ticket Price', desc: '+$1 a ticket', max: 10, base: 150 },
    { k: 'line', ic: '🧍', name: 'Longer Line', desc: '+1 in the check-in line', max: 6, base: 110 },
  ],
  cafe: [
    { k: 'oven', ic: '🔥', name: 'Hotter Oven', desc: '+15% baking speed', max: 6, base: 130 },
    { k: 'price', ic: '🍪', name: 'Tastier Snacks', desc: '+$1 a snack', max: 8, base: 140 },
  ],
  shop: [
    { k: 'stock', ic: '📦', name: 'Faster Restock', desc: '+15% restock speed', max: 6, base: 150 },
    { k: 'price', ic: '🎁', name: 'Fancier Sweets', desc: '+$1 a sweet', max: 8, base: 160 },
  ],
  lounge: [
    { k: 'vips', ic: '👑', name: 'Word of Mouth', desc: '+3% more VIPs', max: 5, base: 400 },
    { k: 'fee', ic: '🛋️', name: 'Softer Sofa', desc: '+$3 lounge fee', max: 8, base: 300 },
  ],
  recycler: [
    { k: 'speed', ic: '♻️', name: 'Faster Wheel', desc: '+20% speed', max: 5, base: 160 },
    { k: 'pay', ic: '💵', name: 'Better Sorting', desc: '+$1 a piece', max: 8, base: 180 },
  ],
  tower: [{ k: 'boost', ic: '🗼', name: 'Sharper Controllers', desc: '+5% taxi & flight speed', max: 6, base: 500 }],
  /** Per aircraft type (in the 🛖 hangar). */
  plane: [
    { k: 'seats', ic: '💺', name: 'Extra Seat', desc: '+1 seat', max: 2, base: 600 },
    { k: 'speed', ic: '💨', name: 'Stronger Wings', desc: '+6% speed', max: 5, base: 350 },
  ],
} satisfies Record<string, UpDef[]>;

/** The price of the next level. */
export function upPrice(d: { base: number }, lv: number) {
  return Math.round((d.base * Math.pow(1.5, lv)) / 5) * 5;
}

/** One row of a menu. */
export interface MenuRow {
  id: string;
  ic: string;
  name: string;
  desc: string;
  /** "Lv 2/8" (or 'NEW' for something to unlock). */
  lv: string;
  /** null = maxed. */
  cost: number | null;
  /** What to say instead of MAX when there's no cost (an aircraft you own: "OWNED"). */
  done?: string;
  /** Why it can't be bought yet ("🔒 Lv 9"), if so. */
  lock?: string;
  /** A free switch (🎲 Mixed fleet): what its button says instead of a price. */
  tap?: string;
}
export interface MenuModel {
  title: string;
  rows: MenuRow[];
  cash: number;
}

/** The menu: built once, its rows updated in place while it's open (so a row never jumps under your finger). */
export class UpMenu {
  private root: HTMLElement;
  private title: HTMLElement;
  private cash: HTMLElement;
  private rows: HTMLElement;
  private model: (() => MenuModel | null) | null = null;
  private buy: (id: string) => void = () => {};
  private onClose: () => void = () => {};
  private sig = '';
  private timer = 0;
  private openedAt = 0;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'gm-overlay hidden';
    this.root.innerHTML = `<div class="gm-panel"><div class="gm-title"></div><div class="gm-cash"></div><div class="gm-rows"></div><button class="gm-close">Close</button></div>`;
    parent.appendChild(this.root);
    this.title = this.root.querySelector('.gm-title')!;
    this.cash = this.root.querySelector('.gm-cash')!;
    this.rows = this.root.querySelector('.gm-rows')!;
    this.root.querySelector('.gm-close')!.addEventListener('click', () => this.close());
    // (a tap on the dim backdrop closes it; not the very tap that opened it)
    this.root.addEventListener('click', (e) => {
      if (e.target === this.root && performance.now() - this.openedAt > 350) this.close();
    });
    this.rows.addEventListener('click', (e) => {
      const row = (e.target as HTMLElement).closest('.gm-row') as HTMLElement | null;
      if (!row || !row.classList.contains('ok')) return;
      this.buy(row.dataset.id!);
      this.render();
    });
  }

  get isOpen() {
    return !this.root.classList.contains('hidden');
  }

  open(model: () => MenuModel | null, buy: (id: string) => void, onClose: () => void = () => {}) {
    this.model = model;
    this.buy = buy;
    this.onClose = onClose;
    this.sig = '';
    this.openedAt = performance.now();
    this.root.classList.remove('hidden');
    this.render();
    window.clearInterval(this.timer);
    this.timer = window.setInterval(() => this.render(), 300);
  }

  close() {
    if (!this.isOpen) return;
    window.clearInterval(this.timer);
    this.root.classList.add('hidden');
    this.model = null;
    this.onClose();
  }

  private render() {
    const m = this.model?.();
    if (!m) return this.close();
    const put = (e: Element, t: string) => {
      if (e.textContent !== t) e.textContent = t;
    };
    put(this.title, m.title);
    put(this.cash, `💵 ${Math.floor(m.cash).toLocaleString()} available`);
    const sig = m.rows.map((r) => r.id).join('|');
    if (sig !== this.sig) {
      this.sig = sig;
      this.rows.innerHTML = m.rows
        .map((r) => `<button class="gm-row" data-id="${r.id}"><span class="l1"><b class="nm"></b><b class="pr"></b></span><span class="l2"><i class="lv"></i><i class="ds"></i></span></button>`)
        .join('');
    }
    m.rows.forEach((r, i) => {
      const el = this.rows.children[i] as HTMLElement;
      const maxed = r.cost === null;
      const ok = !maxed && !r.lock && (!!r.tap || m.cash >= r.cost!);
      el.className = `gm-row ${maxed ? 'max' : r.lock ? 'lock' : ok ? 'ok' : 'no'}`;
      put(el.querySelector('.nm')!, `${r.ic}  ${r.name}`);
      put(el.querySelector('.pr')!, maxed ? (r.done ?? 'MAX') : r.lock ? r.lock : r.tap ? r.tap : `💵 ${r.cost!.toLocaleString()}`);
      put(el.querySelector('.lv')!, r.lv);
      put(el.querySelector('.ds')!, r.desc);
    });
  }
}
