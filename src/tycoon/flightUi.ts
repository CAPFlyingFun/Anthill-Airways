// ============================================================================
// flightUi.ts — ✈️ the FLIGHT CHIPS and the FLIGHT CARD (v0.69, after AirportPRG).
//
//  • Along the bottom: one chip per open gate (its plane, a ring that fills as the current step goes by, the flight
//    number and the next thing: a clock, BAGS, NECTAR…). Tap a chip (or the plane itself) to open its card.
//    (The tower clears take-offs and landings by itself: v0.69.2.)
//    📋 at the front opens the whole flight board.
//  • On the left: the selected plane's card. A round portrait with the ring, AA 104, the bug and its seats, where
//    it's flying, 🐛 passengers · 🧳 bags · 💧 nectar, and a bar with the step it's on. 🎯 points the camera at
//    the plane until you walk.
//
// The elements are built once and only their text and classes change (rebuilding them every tick swallowed taps).
// ============================================================================

/** What the chips and the card show about one gate's plane (built by Airfield.planeInfo()). */
export interface PlaneInfo {
  /** Gate number (1 = the first). */
  gate: number;
  icon: string;
  /** "Ladybug · 2 seats" */
  type: string;
  /** Its flight number (null before one is booked) and where it's going / coming from. */
  flight: number | null;
  place: string | null;
  dir: 'dep' | 'arr';
  /** [have, of]: passengers aboard / seats, bags loaded / needed, nectar on the pad / needed. */
  pax: [number, number];
  bags: [number, number];
  fuel: [number, number];
  /** The step it's on, in full (the card), short (the chip) and for the flight board. */
  step: string;
  short: string;
  board: string;
  /** Seconds until the next thing (null: no clock). */
  eta: number | null;
  /** 0..1: how far through the step (the portrait's ring). */
  ring: number;
  /** go = on its way, warn = needs something (nectar, bags), info = nothing happening. */
  tone: 'go' | 'warn' | 'info';
  /** 💵 This flight's money: tickets (departures, already paid) or landing fees (arrivals). */
  pay: number;
}

export interface FlightUiHooks {
  info: () => PlaneInfo[];
  /** The card opened / closed on gate `g` (the ring under the plane). */
  select: (g: number | null) => void;
  /** 🎯 Point the camera at gate `g`'s plane. */
  watch: (g: number) => void;
  /** 📋 The whole flight board. */
  board: () => void;
  /** ⬆️ The hangar's fleet menu (false: no hangar yet). */
  fleet: () => boolean;
}

const clock = (secs: number) => {
  const s = Math.max(0, Math.ceil(secs));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, html = '') => {
  const e = document.createElement(tag);
  e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};

/** Set text only when it changed (no layout work every tick). */
const put = (e: Element, text: string) => {
  if (e.textContent !== text) e.textContent = text;
};

interface Chip {
  btn: HTMLButtonElement;
  ring: HTMLElement;
  ic: HTMLElement;
  no: HTMLElement;
  st: HTMLElement;
}

export class FlightUi {
  /** The open card's gate (0-based), or null. */
  open: number | null = null;
  private bar: HTMLElement;
  private chips = new Map<number, Chip>();
  private card: HTMLElement;
  private c: Record<string, HTMLElement> = {};
  private last: PlaneInfo[] = [];

  constructor(parent: HTMLElement, private hooks: FlightUiHooks) {
    // (in the HUD, but before its panels: Settings, the flight board and the cards all cover the chips)
    const before = parent.querySelector(':scope > .overlay');
    // ✈️ the chips
    this.bar = el('div', 'fl-chips');
    const boardBtn = el('button', 'fl-boardbtn', '📋') as HTMLButtonElement;
    boardBtn.setAttribute('aria-label', 'Flight board');
    boardBtn.addEventListener('click', () => hooks.board());
    this.bar.appendChild(boardBtn);
    parent.insertBefore(this.bar, before);

    // 🪪 the card
    this.card = el('div', 'fl-card hidden');
    this.card.innerHTML = `
      <button class="fl-x" aria-label="Close">✕</button>
      <div class="fl-por"><span class="fl-ring"><i class="fl-ic"></i></span></div>
      <button class="fl-aim" aria-label="Watch this plane">🎯</button>
      <button class="fl-up" aria-label="Fleet upgrades">⬆</button>
      <div class="fl-no"></div>
      <div class="fl-type"></div>
      <div class="fl-route"></div>
      <div class="fl-stats">
        <div><span>🐛</span><b class="fl-pax"></b></div>
        <div><span>🧳</span><b class="fl-bags"></b></div>
        <div><span>💧</span><b class="fl-fuel"></b></div>
      </div>
      <div class="fl-pay"></div>
      <div class="fl-step"></div>`;
    for (const k of ['ring', 'ic', 'no', 'type', 'route', 'pax', 'bags', 'fuel', 'pay', 'step']) this.c[k] = this.card.querySelector(`.fl-${k}`)!;
    this.card.querySelector('.fl-x')!.addEventListener('click', () => this.show(null));
    this.card.querySelector('.fl-up')!.addEventListener('click', () => {
      if (!hooks.fleet()) return;
      this.show(null);
    });
    this.card.querySelector('.fl-aim')!.addEventListener('click', () => {
      if (this.open !== null) hooks.watch(this.open);
    });
    parent.insertBefore(this.card, before);
  }

  /** Open gate `g`'s card (null closes it). */
  show(g: number | null) {
    this.open = g;
    this.card.classList.toggle('hidden', g === null);
    this.hooks.select(g);
    this.update();
  }

  /** Hide everything (e.g. while a story card is up), or show it again. */
  setVisible(on: boolean) {
    this.bar.classList.toggle('hidden', !on);
    if (!on) this.card.classList.add('hidden');
    else if (this.open !== null) this.card.classList.remove('hidden');
  }

  /** Refresh the chips and the card (a few times a second). */
  update() {
    const info = this.hooks.info();
    this.last = info;
    // chips: one per open gate, in gate order
    for (const f of info) {
      let chip = this.chips.get(f.gate);
      if (!chip) chip = this.makeChip(f.gate);
      chip.btn.className = `fl-chip ${f.tone}${this.open === f.gate - 1 ? ' sel' : ''}`;
      put(chip.ic, f.icon);
      chip.ring.style.setProperty('--p', `${Math.round(f.ring * 100)}`);
      put(chip.no, f.flight ? `AA ${f.flight}` : `GATE ${f.gate}`);
      put(chip.st, f.eta !== null ? `${f.dir === 'dep' ? '🛫' : '🛬'} ${clock(f.eta)}` : f.short);
    }
    // (a gate that closed: drop its chip)
    for (const [g, chip] of this.chips) {
      if (!info.some((f) => f.gate === g)) {
        chip.btn.remove();
        this.chips.delete(g);
      }
    }
    // the card
    if (this.open === null) return;
    const f = info.find((x) => x.gate === this.open! + 1);
    if (!f) return this.show(null);
    const c = this.c;
    this.card.className = `fl-card ${f.tone}`;
    c.ring.style.setProperty('--p', `${Math.round(f.ring * 100)}`);
    put(c.ic, f.icon);
    put(c.no, f.flight ? `AA ${f.flight} · G${f.gate}` : `GATE ${f.gate}`);
    put(c.type, f.type);
    put(c.route, f.place ? (f.dir === 'dep' ? `🐜 Anthill → ${f.place}` : `${f.place} → 🐜 Anthill`) : 'Next flight: not booked yet');
    put(c.pax, `${f.pax[0]}/${f.pax[1]}`);
    put(c.bags, f.bags[1] ? `${f.bags[0]}/${f.bags[1]}` : '—');
    put(c.fuel, `${f.fuel[0]}/${f.fuel[1]}`);
    put(c.pay, f.pay ? (f.dir === 'dep' ? `🎫 Tickets: $${f.pay}` : `💵 Landing fees: $${f.pay}`) : '');
    put(c.step, f.eta !== null ? `${f.step} · ${clock(f.eta)}` : f.step);
  }

  private makeChip(gate: number): Chip {
    const btn = el('button', 'fl-chip') as HTMLButtonElement;
    btn.innerHTML = `<span class="fl-ring"><i></i></span><span class="tx"><b></b><small></small></span>`;
    const chip: Chip = { btn, ring: btn.querySelector('.fl-ring')!, ic: btn.querySelector('i')!, no: btn.querySelector('b')!, st: btn.querySelector('small')! };
    btn.addEventListener('click', () => {
      const g = gate - 1;
      this.show(this.open === g ? null : g);
    });
    // keep the chips in gate order
    const after = [...this.chips.entries()].filter(([g]) => g < gate).sort((a, b) => b[0] - a[0])[0];
    if (after) after[1].btn.after(btn);
    else this.bar.children[0].after(btn);
    this.chips.set(gate, chip);
    return chip;
  }
}
