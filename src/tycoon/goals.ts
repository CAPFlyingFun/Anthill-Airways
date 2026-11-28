// ============================================================================
// goals.ts — 📅 DAILY GOALS with ⭐ stars (v0.69, after AirportPRG's levels).
//
// Every day at Anthill Airways has two or three goals ("🛫 Fly 4 flights", "🧳 Load 6 bags"…). Finish them all
// and the day is done: you earn ⭐ for how quickly (⭐⭐⭐ within the day's par time, ⭐⭐ within half as long
// again, ⭐ after that) and a cash bonus that grows with the stars. Then the next day starts, a little busier.
// The first days are written by hand to teach the airport; after them the days are made up as you go, forever.
//
// Only time you PLAY counts (being away doesn't cost you stars). The days start once the tutorial is done.
// The bar under the airfield's name shows today's goals; tap it for this panel: the days you've flown (with
// their stars), today, and the days ahead wearing their red REMOVE BEFORE FLIGHT tags.
// ============================================================================
import type { DaySave, TycoonSave } from '../core/save';

export type GoalKind = 'flights' | 'pax' | 'bags' | 'landings' | 'snacks' | 'earned';

/** How each kind of goal reads. */
export const GOAL_INFO: Record<GoalKind, { icon: string; verb: string; noun: string }> = {
  flights: { icon: '🛫', verb: 'Fly', noun: 'flights' },
  pax: { icon: '🎫', verb: 'Check in', noun: 'passengers' },
  bags: { icon: '🧳', verb: 'Load', noun: 'bags' },
  landings: { icon: '🛬', verb: 'Land', noun: 'flights' },
  snacks: { icon: '🍪', verb: 'Sell', noun: 'snacks' },
  earned: { icon: '💵', verb: 'Earn', noun: 'cash' },
};

interface DayDef {
  name: string;
  goals: Partial<Record<GoalKind, number>>;
  /** Seconds for ⭐⭐⭐. */
  par: number;
}

/** The first days: written by hand, each one teaching a bit more of the airport. */
const FIRST_DAYS: DayDef[] = [
  { name: 'Opening Day', goals: { flights: 2, pax: 4 }, par: 300 },
  { name: 'Bags on Board', goals: { flights: 3, bags: 6 }, par: 300 },
  { name: 'Busy Skies', goals: { landings: 4, pax: 10 }, par: 360 },
  { name: 'Cash Flow', goals: { earned: 300, flights: 5 }, par: 420 },
  { name: 'Rush Hour', goals: { pax: 20, bags: 16 }, par: 480 },
  { name: 'Round Trips', goals: { flights: 10, landings: 8 }, par: 540 },
  { name: 'Big Business', goals: { earned: 900, pax: 30 }, par: 600 },
  { name: 'Full Service', goals: { flights: 14, bags: 30, landings: 12 }, par: 660 },
];
const LATER_NAMES = ['Tailwind Tuesday', 'Nectar Rush', 'Holiday Crowds', 'Picnic Season', 'Dewdrop Morning', 'Heatwave', 'Night Owls', 'Pollen Storm', 'Fair Weather', 'Long Haul'];
/** The days after the first ones: which goals (cycling), and how big they start. */
const LATER_SETS: GoalKind[][] = [['flights', 'pax'], ['bags', 'landings'], ['earned', 'flights'], ['pax', 'bags', 'landings'], ['snacks', 'pax']];
const LATER_BASE: Record<GoalKind, number> = { flights: 14, pax: 34, bags: 30, landings: 12, snacks: 10, earned: 1100 };

/** Day `n`'s name, goals and par (the made-up days skip 🍪 snacks until the café is open). */
export function dayDef(n: number, cafe: boolean): DayDef {
  if (n <= FIRST_DAYS.length) return FIRST_DAYS[n - 1];
  const k = n - FIRST_DAYS.length;
  let set = LATER_SETS[k % LATER_SETS.length];
  if (!cafe && set.includes('snacks')) set = ['landings', 'earned'];
  const scale = 1 + k * 0.18;
  const goals: Partial<Record<GoalKind, number>> = {};
  for (const g of set) goals[g] = g === 'earned' ? Math.round((LATER_BASE[g] * scale) / 50) * 50 : Math.round(LATER_BASE[g] * scale);
  return { name: LATER_NAMES[k % LATER_NAMES.length], goals, par: 660 + k * 30 };
}

/** ⭐ for finishing in `t` seconds with par `par`. */
export function starsFor(t: number, par: number) {
  return t <= par ? 3 : t <= par * 1.5 ? 2 : 1;
}

/** The cash bonus for finishing day `n` with `stars`. */
export function dayReward(n: number, stars: number) {
  return Math.round(((20 + 15 * n) * [1, 1.5, 2][stars - 1]) / 5) * 5;
}

/** "3:05" */
function mmss(secs: number) {
  const s = Math.max(0, Math.floor(secs));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** The saved day (its goals keyed by kind). */
type Day = Omit<DaySave, 'g'> & { g: Partial<Record<GoalKind, number>> };

export class Goals {
  /** Called when a day's goals are all done (the airfield pays the bonus and shows the banner). */
  onDayDone: (n: number, stars: number, reward: number, name: string, secs: number) => void = () => {};

  constructor(private st: TycoonSave, private opts: { cafe: () => boolean }) {}

  /** Started yet? (Once the tutorial is done.) */
  get started() {
    return !!this.st.day;
  }
  get day(): Day | null {
    return (this.st.day as Day | undefined) ?? null;
  }
  get name() {
    const d = this.day;
    return d ? dayDef(d.n, this.opts.cafe()).name : '';
  }
  /** Every ⭐ won so far. */
  get totalStars() {
    return (this.st.day?.stars ?? []).reduce((a, b) => a + b, 0);
  }

  /** Day 1 (if it hasn't started already). */
  begin() {
    if (!this.st.day) this.startDay(1, []);
  }

  private startDay(n: number, stars: number[]) {
    const def = dayDef(n, this.opts.cafe());
    this.st.day = { n, t: 0, c: {}, stars, g: { ...def.goals } as Record<string, number>, par: def.par };
  }

  /** Something happened (a flight, a check-in…): counts toward today's goals. */
  add(kind: GoalKind, amount: number) {
    const d = this.day;
    if (!d || !d.g[kind] || amount <= 0) return;
    d.c[kind] = Math.min(d.g[kind]!, (d.c[kind] ?? 0) + amount);
    if (this.done(d)) this.finishDay(d);
  }

  update(dt: number) {
    const d = this.day;
    if (d) d.t += dt;
  }

  private done(d: Day) {
    return (Object.keys(d.g) as GoalKind[]).every((k) => (d.c[k] ?? 0) >= d.g[k]!);
  }

  private finishDay(d: Day) {
    const stars = starsFor(d.t, d.par);
    const reward = dayReward(d.n, stars);
    const name = dayDef(d.n, this.opts.cafe()).name;
    this.startDay(d.n + 1, [...d.stars, stars]);
    this.onDayDone(d.n, stars, reward, name, d.t);
  }

  /** ⭐⭐☆: what you'd get if you finished right now. */
  private starsNow(d: Day) {
    const s = starsFor(d.t, d.par);
    return '⭐'.repeat(s) + '☆'.repeat(3 - s);
  }

  /** The bar under the airfield's name: "📅 DAY 2 · 🛫 1/3 · 🧳 2/6 · ⭐⭐⭐". */
  barText(): string | null {
    const d = this.day;
    if (!d) return null;
    const parts = (Object.keys(d.g) as GoalKind[]).map((k) => {
      const have = d.c[k] ?? 0;
      const need = d.g[k]!;
      return k === 'earned' ? `💵 ${have}/${need}` : `${GOAL_INFO[k].icon} ${have}/${need}`;
    });
    return `📅 ${d.n} · ${parts.join(' · ')} · ${this.starsNow(d)}`;
  }

  /** The panel's insides (rebuilt each time it opens, and while it's open). */
  panelHtml(): string {
    const d = this.day;
    if (!d) return '<p class="gl-none">The daily goals start once the tutorial is done. 🎓</p>';
    const won = d.stars;
    const total = won.reduce((a, b) => a + b, 0);
    const rows = (Object.keys(d.g) as GoalKind[])
      .map((k) => {
        const have = d.c[k] ?? 0;
        const need = d.g[k]!;
        const i = GOAL_INFO[k];
        const label = k === 'earned' ? `${i.verb} $${need}` : `${i.verb} ${need} ${i.noun}`;
        const ok = have >= need;
        return `<div class="gl-goal${ok ? ' ok' : ''}"><span class="ic">${ok ? '✅' : i.icon}</span><span class="nm">${label}</span>` +
          `<b>${k === 'earned' ? '$' : ''}${have}/${need}</b><span class="bar"><i style="width:${Math.round((have / need) * 100)}%"></i></span></div>`;
      })
      .join('');
    const s = starsFor(d.t, d.par);
    const nextAt = s === 3 ? d.par : s === 2 ? d.par * 1.5 : null;
    const timer = nextAt !== null ? `⏱️ ${mmss(d.t)} · ${'⭐'.repeat(s)} until ${mmss(nextAt)}` : `⏱️ ${mmss(d.t)} · ⭐ (still a bonus!)`;
    // the days flown, today, and the next two (still wearing their REMOVE BEFORE FLIGHT tags)
    const past = won
      .map((st, i) => `<div class="gl-day done"><b>DAY ${i + 1}</b><span>${'⭐'.repeat(st)}${'☆'.repeat(3 - st)}</span></div>`)
      .slice(-6)
      .join('');
    const ahead = [1, 2]
      .map((k) => `<div class="gl-day locked"><b>DAY ${d.n + k}</b><span class="rbf">REMOVE BEFORE FLIGHT</span></div>`)
      .join('');
    return `
      <div class="gl-total">⭐ ${total} stars · ${won.length} day${won.length === 1 ? '' : 's'} flown</div>
      <div class="gl-today">
        <div class="gl-head"><b>DAY ${d.n}</b><span>${dayDef(d.n, this.opts.cafe()).name}</span></div>
        ${rows}
        <div class="gl-timer">${timer}</div>
        <div class="gl-reward">Bonus: 💵 $${dayReward(d.n, s)} for ${'⭐'.repeat(s)}</div>
      </div>
      <div class="gl-days">${past}<div class="gl-day now"><b>DAY ${d.n}</b><span>TODAY</span></div>${ahead}</div>`;
  }
}
