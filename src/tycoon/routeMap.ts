// ============================================================================
// routeMap.ts — 🗺️ the DESTINATIONS MAP (v0.87)
//
// The garden round the anthill as a map (fleet.ts ROUTES says what and where): a pin a destination, a dashed line
// to each one flights go to. Tap a pin for its card: what it pays, how far it is, how often you've flown there, and
// what you can do: open it (the far ones, for cash), 📣 advertise it (a higher fare), or switch its flights off and on.
//
// Plain DOM and one SVG: it is drawn once and its pins re-drawn when something changes. The airfield owns every
// number (`RouteMapHost`); this keeps none.
// ============================================================================

/** One destination as the map shows it. */
export interface RoutePin {
  id: string;
  icon: string;
  name: string;
  at: [number, number];
  blurb: string;
  /** open: flights go there · off: open, switched off · locked: not opened yet. */
  state: 'open' | 'off' | 'locked';
  /** Its fare now (× a ticket), and after the next 📣 level (null: at the top). */
  fare: number;
  fareNext: number | null;
  /** Seconds longer out than the nearest places. */
  extra: number;
  flown: number;
  lv: number;
  lvMax: number;
  /** The next 📣 level's price (null: at the top, or not open). */
  upCost: number | null;
  /** Locked: its price on the map (null: opened another way), and why it can't be bought yet (a level, a tile). */
  openCost: number | null;
  need: string | null;
}

export interface RouteMapHost {
  pins: () => RoutePin[];
  cash: () => number;
  act: (id: string, what: 'open' | 'up' | 'toggle') => void;
}

const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const HOME: [number, number] = [50, 67];

const CSS = `
.rm-overlay { position: absolute; inset: 0; z-index: 40; display: flex; align-items: center; justify-content: center; background: rgba(10, 20, 30, 0.6); pointer-events: auto;
  padding: max(8px, env(safe-area-inset-top, 0px)) max(8px, env(safe-area-inset-right, 0px)) max(8px, env(safe-area-inset-bottom, 0px)) max(8px, env(safe-area-inset-left, 0px)); }
.rm-overlay.hidden { display: none; }
.rm-panel { display: flex; flex-direction: column; width: min(100%, 520px); max-height: 100%; background: #fff8ec; color: #3a2a1a; border-radius: 20px; box-shadow: 0 8px 0 rgba(0, 0, 0, 0.22); overflow: hidden; font-family: var(--font); }
.rm-head { display: flex; align-items: center; gap: 10px; padding: 10px 12px 8px 16px; font-size: 20px; font-weight: 900; }
.rm-head .rm-cash { margin-left: auto; font-size: 16px; color: #2f8a3a; white-space: nowrap; }
.rm-x { width: 44px; height: 44px; border-radius: 50%; border: none; background: #ead9bf; color: #3a2a1a; font-size: 20px; font-weight: 900; }
.rm-body { display: flex; flex-direction: column; min-height: 0; overflow: auto; }
.rm-map { flex: none; padding: 0 10px; }
.rm-map svg { display: block; width: 100%; height: auto; border-radius: 14px; touch-action: manipulation; }
.rm-map .pin { cursor: pointer; }
.rm-map text { font-family: var(--font); user-select: none; -webkit-user-select: none; pointer-events: none; }
.rm-card { padding: 10px 16px 14px; }
.rm-name { font-size: 20px; font-weight: 900; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.rm-chip { font-size: 11px; letter-spacing: 0.5px; padding: 3px 9px; border-radius: 999px; color: #fff; background: #9a8f80; }
.rm-chip.open { background: #2f8a3a; } .rm-chip.off { background: #7b8794; }
.rm-blurb { margin: 4px 0 8px; font-size: 14px; font-weight: 700; color: #7a5c3e; line-height: 1.35; }
.rm-stats { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
.rm-stats span { font-size: 13px; font-weight: 800; padding: 5px 9px; border-radius: 10px; background: #f3e6cf; white-space: nowrap; }
.rm-btn { display: flex; align-items: center; justify-content: space-between; gap: 10px; width: 100%; min-height: 48px; margin: 6px 0 0; padding: 8px 14px; border: none; border-radius: 14px; font-family: var(--font); font-size: 15px; font-weight: 900; text-align: left; color: #fff; background: linear-gradient(#6fd36a, #2f9a3a); box-shadow: 0 3px 0 #1f6e28; }
.rm-btn small { display: block; font-size: 12px; font-weight: 800; opacity: 0.92; }
.rm-btn b { white-space: nowrap; font-size: 16px; }
.rm-btn.no { background: linear-gradient(#cfc6b8, #a79d8e); box-shadow: 0 3px 0 #7d7466; }
.rm-btn.plain { color: #3a2a1a; background: #ead9bf; box-shadow: 0 3px 0 #c9b594; }
.rm-btn:active { transform: translateY(2px); }
.rm-need { margin-top: 6px; padding: 9px 12px; border-radius: 12px; background: #f3e6cf; font-size: 14px; font-weight: 800; }
.rm-note { margin-top: 10px; font-size: 12px; font-weight: 700; color: #8a6a4a; }
@media (orientation: landscape) and (max-height: 560px) {
  .rm-panel { width: min(100%, 860px); height: 100%; }
  .rm-body { flex-direction: row; overflow: hidden; flex: 1; }
  .rm-map { height: 100%; aspect-ratio: 1 / 1; padding: 0 0 10px 10px; }
  .rm-map svg { width: auto; height: 100%; }
  .rm-card { flex: 1; min-width: 0; overflow: auto; }
  .rm-head { padding-top: 6px; padding-bottom: 4px; }
}
`;

/** The garden, drawn once under the pins (0..100 across and down; the house is at the top, the creek at the bottom). */
const GARDEN = `
<rect width="100" height="100" fill="#9ccf74"/>
<g fill="#a6d77f" opacity="0.55"><rect x="0" y="14" width="100" height="7"/><rect x="0" y="28" width="100" height="7"/><rect x="0" y="42" width="100" height="7"/><rect x="0" y="56" width="100" height="7"/><rect x="0" y="70" width="100" height="7"/></g>
<path d="M-2 68 C 10 72, 14 82, 30 87 S 62 94, 102 97" fill="none" stroke="#5aa9df" stroke-width="7" stroke-linecap="round"/>
<path d="M-2 68 C 10 72, 14 82, 30 87 S 62 94, 102 97" fill="none" stroke="#8ccbf0" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="5 6"/>
<ellipse cx="14" cy="79" rx="8" ry="5.5" fill="#5aa9df"/><ellipse cx="14" cy="79" rx="5" ry="3" fill="#8ccbf0"/>
<polygon points="76,0 100,0 100,22 82,22" fill="#b9b9b4"/><polygon points="80,0 84,0 88,22 85,22" fill="#cfcfca" opacity="0.6"/>
<rect x="28" y="0" width="44" height="7" fill="#cdb99c"/><rect x="28" y="6" width="44" height="2" fill="#a8906e"/><rect x="44" y="7" width="12" height="4" fill="#bda886"/>
<rect x="33" y="1.5" width="6" height="3.5" fill="#8fc4e8"/><rect x="61" y="1.5" width="6" height="3.5" fill="#8fc4e8"/>
<rect x="6" y="4" width="17" height="15" rx="1" fill="#a0714a"/><polygon points="5,4 14.5,0.5 24,4" fill="#7c5434"/><rect x="12" y="11" width="5" height="8" fill="#6b4628"/>
<rect x="5" y="23" width="23" height="16" rx="1.5" fill="#8a6238"/>
<g stroke="#5fae4a" stroke-width="1.4" stroke-linecap="round"><path d="M8 27h17M8 31h17M8 35h17"/></g>
<ellipse cx="78" cy="29" rx="14" ry="9.5" fill="#5aa9df"/><ellipse cx="78" cy="29" rx="11" ry="7" fill="#74bbe8"/>
<g fill="#4f9e4a"><circle cx="70" cy="26" r="1.8"/><circle cx="85" cy="33" r="2.1"/><circle cx="83" cy="24" r="1.5"/></g>
<circle cx="52" cy="30" r="6" fill="#d9d6cf"/><circle cx="52" cy="30" r="4.2" fill="#8ccbf0"/>
<g transform="translate(-2 2) rotate(-14 29 42)"><rect x="22" y="37" width="14" height="10" rx="1" fill="#e9574a"/><path d="M22 40.3h14M22 43.6h14M26.6 37v10M31.3 37v10" stroke="#fff" stroke-width="0.9"/></g>
<g transform="translate(5 1) rotate(18 71 44)"><rect x="61" y="41" width="20" height="6" rx="3" fill="#8b5e3c"/><circle cx="80" cy="44" r="2.6" fill="#c69c6d"/><circle cx="80" cy="44" r="1.2" fill="#8b5e3c"/></g>
<g fill="#9a9a96"><ellipse cx="85" cy="67" rx="7.5" ry="5"/><ellipse cx="79" cy="70" rx="4" ry="2.8" fill="#aeaeaa"/><ellipse cx="91" cy="63" rx="3.5" ry="2.5" fill="#aeaeaa"/></g>
<rect x="84.5" y="88" width="3" height="9" fill="#7c5434"/><circle cx="86" cy="85" r="11.5" fill="#3f8f3f"/><circle cx="82" cy="82" r="5" fill="#57a857"/><circle cx="90" cy="88" r="4" fill="#57a857"/>
<g fill="#ffd84a" transform="translate(2 1)"><circle cx="34" cy="52" r="1.1"/><circle cx="43" cy="51" r="1.1"/><circle cx="36" cy="59" r="1.1"/><circle cx="44" cy="58" r="1.1"/><circle cx="33" cy="56" r="1.1"/></g>
<g fill="#fff" transform="translate(2 1)"><circle cx="40" cy="50" r="1"/><circle cx="45" cy="54.5" r="1"/><circle cx="38" cy="60.5" r="1"/></g>
<g fill="#e9574a" transform="translate(-2 2)"><circle cx="57" cy="53" r="1.3"/><circle cx="66" cy="52.5" r="1.3"/><circle cx="68" cy="58" r="1.3"/><circle cx="64" cy="61.5" r="1.3"/><circle cx="57.5" cy="59.5" r="1.3"/></g>
<rect x="38" y="70.6" width="24" height="2.6" rx="1.3" fill="#e9dfc6"/><path d="M40 71.9h20" stroke="#fff" stroke-width="0.5" stroke-dasharray="1.6 1.6"/>
<ellipse cx="50" cy="68.6" rx="7" ry="3.4" fill="#a8763f"/><ellipse cx="50" cy="66.6" rx="4.6" ry="3.2" fill="#b98548"/><ellipse cx="50" cy="65.2" rx="1.6" ry="1" fill="#5a3a1c"/>
`;

export class RouteMap {
  private root: HTMLElement;
  private cashEl: HTMLElement;
  private lines: SVGGElement;
  private pinsEl: SVGGElement;
  private card: HTMLElement;
  private picked: string | null = null;
  private sig = '';
  private timer = 0;
  private openedAt = 0;
  /** Told when it closes (the game's own menus stay shut while it is open). */
  onClose: () => void = () => {};

  constructor(parent: HTMLElement, private host: RouteMapHost) {
    if (!document.getElementById('rm-css')) {
      const style = document.createElement('style');
      style.id = 'rm-css';
      style.textContent = CSS;
      document.head.appendChild(style);
    }
    this.root = document.createElement('div');
    this.root.className = 'rm-overlay hidden';
    this.root.innerHTML =
      `<div class="rm-panel"><div class="rm-head"><span>🗺️ Destinations</span><span class="rm-cash"></span><button class="rm-x" aria-label="Close the map">✕</button></div>` +
      `<div class="rm-body"><div class="rm-map"><svg viewBox="0 0 100 100" role="img" aria-label="Map of the garden">${GARDEN}<g class="rm-lines"></g>` +
      `<text x="50" y="76.6" text-anchor="middle" font-size="2.7" font-weight="900" fill="#3a2a1a" stroke="#fff" stroke-width="0.7" paint-order="stroke">YOUR ANTHILL</text>` +
      `<g class="rm-pins"></g></svg></div><div class="rm-card"></div></div></div>`;
    parent.appendChild(this.root);
    this.cashEl = this.root.querySelector('.rm-cash')!;
    this.lines = this.root.querySelector('.rm-lines')!;
    this.pinsEl = this.root.querySelector('.rm-pins')!;
    this.card = this.root.querySelector('.rm-card')!;
    this.root.querySelector('.rm-x')!.addEventListener('click', () => this.close());
    // (a tap on the dim backdrop closes it; not the very tap that opened it)
    this.root.addEventListener('click', (e) => { if (e.target === this.root && performance.now() - this.openedAt > 350) this.close(); });
    this.pinsEl.addEventListener('click', (e) => {
      const pin = (e.target as Element).closest('.pin') as SVGElement | null;
      if (!pin) return;
      this.picked = pin.dataset.id!;
      this.render(true);
    });
    this.card.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
      if (!btn || btn.classList.contains('no') || !this.picked) return;
      this.host.act(this.picked, btn.dataset.act as 'open' | 'up' | 'toggle');
      this.render(true);
    });
  }

  get isOpen() {
    return !this.root.classList.contains('hidden');
  }

  open(pick?: string) {
    const pins = this.host.pins();
    // (it opens on what you asked for, else the next place you could open, else where you last were)
    const next = pins.filter((p) => p.state === 'locked' && p.openCost !== null && !p.need).sort((a, b) => a.openCost! - b.openCost!)[0];
    this.picked = pick ?? next?.id ?? this.picked ?? pins[0]?.id ?? null;
    this.openedAt = performance.now();
    this.root.classList.remove('hidden');
    this.render(true);
    window.clearInterval(this.timer);
    this.timer = window.setInterval(() => this.render(false), 500); // (your cash goes on changing behind it)
  }

  close() {
    if (!this.isOpen) return;
    window.clearInterval(this.timer);
    this.root.classList.add('hidden');
    this.onClose();
  }

  private render(force: boolean) {
    const pins = this.host.pins(), cash = this.host.cash();
    const sig = JSON.stringify([pins.map((p) => [p.state, p.lv, p.flown, p.need, p.openCost !== null && cash >= p.openCost, p.upCost !== null && cash >= p.upCost]), this.picked]);
    this.cashEl.textContent = `💵 ${money(cash)}`;
    if (!force && sig === this.sig) return;
    this.sig = sig;
    // the lines: a gentle curve from the anthill to each place flights go
    this.lines.innerHTML = pins.filter((p) => p.state !== 'locked').map((p) => {
      const [x, y] = p.at, mx = (HOME[0] + x) / 2 + (y - HOME[1]) * 0.12, my = (HOME[1] + y) / 2 - (x - HOME[0]) * 0.12;
      return `<path d="M${HOME[0]} ${HOME[1]} Q ${mx.toFixed(1)} ${my.toFixed(1)} ${x} ${y}" fill="none" stroke="${p.state === 'open' ? '#fff' : '#d8d2c6'}" stroke-width="0.8" stroke-linecap="round" stroke-dasharray="1.8 1.6" opacity="${p.state === 'open' ? 0.95 : 0.6}"/>`;
    }).join('');
    this.pinsEl.innerHTML = pins.map((p) => {
      const [x, y] = p.at, sel = p.id === this.picked;
      const can = p.state === 'locked' && p.openCost !== null && !p.need && cash >= p.openCost;
      const ring = p.state === 'open' ? '#2f8a3a' : p.state === 'off' ? '#7b8794' : can ? '#f2a51a' : '#9a8f80';
      const fill = p.state === 'locked' ? '#efe6d6' : '#fff';
      const below = y < 88;
      return `<g class="pin" data-id="${p.id}" transform="translate(${x} ${y})"><circle r="7" fill="transparent"/>` +
        (sel ? `<circle r="6.3" fill="none" stroke="#ff8a1e" stroke-width="1.1"/>` : '') +
        `<circle r="4.7" fill="${fill}" stroke="${ring}" stroke-width="1.1"${p.state === 'locked' ? ' opacity="0.92"' : ''}/>` +
        `<text y="1.75" text-anchor="middle" font-size="5"${p.state === 'locked' ? ' opacity="0.55"' : ''}>${p.icon}</text>` +
        (p.state === 'locked' ? `<text x="3.9" y="-2.3" text-anchor="middle" font-size="3.1">🔒</text>` : p.state === 'off' ? `<text x="3.9" y="-2.3" text-anchor="middle" font-size="3">⏸️</text>` : '') +
        `<text y="${below ? 8.3 : -6.4}" text-anchor="middle" font-size="2.7" font-weight="900" fill="#3a2a1a" stroke="#fff" stroke-width="0.75" paint-order="stroke">${p.name}</text></g>`;
    }).join('');
    const p = pins.find((q) => q.id === this.picked);
    if (!p) { this.card.innerHTML = ''; return; }
    const chip = p.state === 'open' ? `<span class="rm-chip open">FLYING</span>` : p.state === 'off' ? `<span class="rm-chip off">SWITCHED OFF</span>` : `<span class="rm-chip">NOT OPEN YET</span>`;
    const stats = `<div class="rm-stats"><span>🎟️ Fare ×${p.fare}</span><span>⏱️ ${p.extra ? `+${p.extra} s flight` : 'Shortest flight'}</span>${p.state === 'locked' ? '' : `<span>🛫 Flown ${p.flown.toLocaleString('en-US')}</span><span>📣 Lv ${p.lv}/${p.lvMax}</span>`}</div>`;
    let actions = '';
    if (p.state === 'locked') {
      if (p.need) actions = `<div class="rm-need">${p.need}</div>`;
      else if (p.openCost !== null) actions = `<button class="rm-btn${cash >= p.openCost ? '' : ' no'}" data-act="open"><span>Open this destination<small>${cash >= p.openCost ? 'Some flights will go here' : `You need ${money(p.openCost - cash)} more`}</small></span><b>${money(p.openCost)}</b></button>`;
    } else {
      actions =
        (p.upCost !== null
          ? `<button class="rm-btn${cash >= p.upCost ? '' : ' no'}" data-act="up"><span>📣 Advertise it<small>Fare ×${p.fare} → ×${p.fareNext}${cash >= p.upCost ? '' : ` · you need ${money(p.upCost - cash)} more`}</small></span><b>${money(p.upCost)}</b></button>`
          : `<div class="rm-need">📣 Advertised as far as it goes (Lv ${p.lvMax})</div>`) +
        `<button class="rm-btn plain" data-act="toggle"><span>Flights here<small>${p.state === 'open' ? 'Tap to stop flying here for now' : 'Tap to fly here again'}</small></span><b>${p.state === 'open' ? 'ON' : 'OFF'}</b></button>`;
    }
    const open = pins.filter((q) => q.state === 'open').length, have = pins.filter((q) => q.state !== 'locked').length;
    this.card.innerHTML = `<div class="rm-name"><span>${p.icon} ${p.name}</span>${chip}</div><div class="rm-blurb">${p.blurb}</div>${stats}${actions}` +
      `<div class="rm-note">Each flight picks one of the ${open} destination${open === 1 ? '' : 's'} that are on. A higher fare pays more per passenger at take-off, and a longer flight keeps the plane away longer. ${have} of ${pins.length} opened.</div>`;
  }
}
