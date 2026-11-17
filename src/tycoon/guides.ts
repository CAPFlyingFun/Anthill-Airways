// ============================================================================
// guides.ts — 📖 "HOW IT WORKS" (v0.73).
//
// When something new opens (the café, the recycler, the hangar…) a short card says what it's for, with its chain
// drawn as a row (🗑️ Bin → ♻️ IN → ⚙️ → OUT → ⛽ FUEL pad). Then, the first time, the yellow arrow walks you through
// one full loop of it (Skip is on the card). A guide can also start from something you've just picked up for the
// first time (🍃 wrappers, ⛽ jet fuel): no card, just the arrow to where it goes.
//
// Seen guides are remembered in save.paid['guide-<id>']. ⚙️ Settings → 📖 How to play lists them all again.
// The arrow and the quest card are the tutorial's own (a little Tutorial with this guide's steps).
// ============================================================================
import * as THREE from 'three';
import type { Hud } from '../ui/hud';
import type { SaveData } from '../core/save';
import type { UnlockDef } from '../data/config';
import { Tutorial, type Step, type TutorialWorld } from '../world/tutorial';

export interface GuideDef {
  /** The tile that opens it (or "item-<type>" for something you pick up). */
  id: string;
  title: string;
  /** The chain, one link per entry (drawn with → between them). Empty: no row. */
  chain: string[];
  /** One or two short sentences. */
  text: string;
  /** "Hire the 🧹 Janitor (the tile next to it) to do this for you": shown on the card and when the loop's done. */
  tip?: string;
  /** The loop, shown with the arrow (none: the card is all there is). */
  steps?: (t: Tutorial) => Step[];
  /** 👀 Where the camera looks when the card's button is tapped (a card with no steps). */
  look?: () => THREE.Vector3;
  /** No card: straight to the arrow (the "what do I do with this?" guides). */
  quiet?: boolean;
}

export function chainHtml(chain: string[]) {
  return chain.length ? `<div class="gd-chain">${chain.map((c) => `<span>${c}</span>`).join('<i>➜</i>')}</div>` : '';
}

export class Guides {
  private queue: GuideDef[] = [];
  private run: { def: GuideDef; tut: Tutorial; fake: SaveData } | null = null;
  private wait = 0;
  /** The step that's showing, and when it came up (ms). */
  private stepAt = -1;
  private stepT = 0;
  /** A card is up, waiting for its button. */
  private asking = false;

  constructor(
    private world: TutorialWorld,
    private hud: Hud,
    private save: SaveData,
    private defs: GuideDef[],
    private tiles: UnlockDef[],
    private look: (at: THREE.Vector3) => void,
  ) {}

  /** A guide's arrow is out (the 🎯 quest card waits). */
  get busy() {
    return !!this.run || this.asking || this.queue.length > 0;
  }
  /** Where the arrow points (the 🗺️ minimap shows it too). */
  get target() {
    return this.run?.tut.target ?? null;
  }
  seen(id: string) {
    return !!this.save.paid[`guide-${id}`];
  }
  has(id: string) {
    return this.defs.some((d) => d.id === id);
  }

  /** Something opened (or was picked up) for the first time: its guide joins the line. `again`: even if seen. */
  offer(id: string, again = false) {
    const def = this.defs.find((d) => d.id === id);
    if (!def || (!again && this.seen(id)) || this.queue.includes(def) || this.run?.def === def) return;
    this.save.paid[`guide-${id}`] = 1;
    this.queue.push(def);
  }

  update(dt: number) {
    if (this.run) {
      const r = this.run;
      r.tut.update(dt, true);
      // (busy with something else? A step that's sat for over a minute bows out: the quest card comes back, and
      // the guide is still in ⚙️ Settings → 📖 How to play)
      if (r.fake.tutorial !== this.stepAt) {
        this.stepAt = r.fake.tutorial;
        this.stepT = performance.now();
      }
      if (performance.now() - this.stepT > 70000) r.fake.tutorial = 100;
      if (r.fake.tutorial >= 100) this.end();
      return;
    }
    if (this.asking || !this.queue.length) return;
    // (one thing at a time: not on top of another card)
    if (!document.getElementById('guide')?.classList.contains('hidden')) return;
    if ((this.wait -= dt) > 0) return;
    const def = this.queue.shift()!;
    if (def.quiet) return this.start(def);
    this.asking = true;
    const body = `${chainHtml(def.chain)}<p>${def.text}</p>${def.tip ? `<p class="gd-tip">💡 ${def.tip}</p>` : ''}`;
    const done = () => {
      this.asking = false;
      this.wait = 0.6;
    };
    this.hud.showGuide(def.title, body, def.steps
      ? [
          { label: '▶️ Show me', cls: 'big-btn', onClick: () => (done(), this.start(def)) },
          { label: 'Skip', cls: 'menu-btn', onClick: done },
        ]
      : [
          ...(def.look ? [{ label: '👀 Show me', cls: 'big-btn', onClick: () => (done(), this.look(def.look!())) }] : []),
          { label: 'Got it', cls: def.look ? 'menu-btn' : 'big-btn', onClick: done },
        ]);
  }

  private start(def: GuideDef) {
    if (!def.steps) return;
    const fake = { tutorial: 0, paid: { 'tut-intro': 1 }, unlocked: this.save.unlocked } as unknown as SaveData;
    const steps = def.steps;
    const tut: Tutorial = new Tutorial(this.world, this.hud, fake, {
      intro: { title: '', html: '' },
      finish: { title: '', html: '', button: '' },
      defs: this.tiles,
      steps,
      info: (): { step: number; total: number; label: string } => ({ step: fake.tutorial, total: tut.count, label: `📖 ${def.title.replace(/^\S+\s/, '').toUpperCase()} ${Math.min(fake.tutorial + 1, tut.count)}/${tut.count}` }),
      onSkip: () => {
        fake.tutorial = 100;
      },
      onFinish: () => {
        this.hud.banner('✅ That\'s the whole loop!', def.tip ?? '', def.tip ? 4200 : 2200);
      },
    });
    this.run = { def, tut, fake };
    this.stepAt = -1;
  }

  private end() {
    this.run?.tut.dispose();
    this.run = null;
    this.wait = 1.2;
  }

  /** ⚙️ Settings → 📖 How to play: every guide whose thing is open, as one list. */
  listHtml(open: (id: string) => boolean) {
    const rows = this.defs.filter((d) => !d.quiet && open(d.id)).map((d) => `<div class="gd-item"><b>${d.title}</b>${chainHtml(d.chain)}<p>${d.text}</p>${d.tip ? `<p class="gd-tip">💡 ${d.tip}</p>` : ''}</div>`);
    return rows.length ? rows.join('') : '<p>Nothing new has opened yet: buy a glowing tile and its guide shows up here.</p>';
  }
}
