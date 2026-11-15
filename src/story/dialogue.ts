// ============================================================================
// dialogue.ts — 💬 the story's dialogue bubbles (v0.63).
//
// The remake plan: "dialogue bubbles for everyday talk". A box along the bottom of the screen with the
// speaker's live 3D head on the left (the same little bust as the player card: ui/avatar.ts), their name, and
// the line typing itself out. Tap anywhere: the line finishes at once, or (when it's all there) the next one
// comes. While anyone is talking, you don't walk and your needs don't drain (the world checks `open`).
//
//   await talk.say([{ who: 'rae', text: 'Hey, it's me!' }, { who: 'you', text: 'Rae?' }]);
//
// `who` is someone from the cast (actors/cast.ts), 'you' (whoever you play), 'radio' (a crackly voice with a
// radio for a face) or 'note' (a line of narration, no face).
// ============================================================================
import * as THREE from 'three';
import { Avatar } from '../ui/avatar';
import { CAST, CastId, lookFor, Want } from '../actors/cast';
import { spawnHuman } from '../actors/creatures';

export type Speaker = CastId | 'you' | 'radio' | 'note';
export interface Line {
  who: Speaker;
  text: string;
}

/** Each speaker's background in their portrait. */
const BG: Partial<Record<Speaker, number>> = { you: 0x2f6fdc, rae: 0xd9822b, director: 0x6a4c93 };
/** Letters per second as a line types out. */
const TYPE_RATE = 46;

export class Dialogue {
  private root = document.createElement('div');
  private box = document.createElement('div');
  private face = document.createElement('div');
  private emoji = document.createElement('div');
  private nameEl = document.createElement('b');
  private textEl = document.createElement('p');
  private heads = new Map<Speaker, Avatar | null>();
  private lines: Line[] = [];
  private i = 0;
  private shownChars = 0;
  private done: (() => void) | null = null;
  private current: Avatar | null = null;
  /** Skipping (a cutscene's ⏭): every line ends at once. */
  skipping = false;

  /** `hero` = who you play (and how they look), for 'you'. */
  constructor(private hero: () => { id: CastId; want: Want }) {
    this.root.className = 'talk hidden';
    this.box.className = 'talk-box';
    this.face.className = 'talk-face';
    this.emoji.className = 'talk-emoji';
    this.face.appendChild(this.emoji);
    const body = document.createElement('div');
    body.className = 'talk-body';
    body.append(this.nameEl, this.textEl);
    const next = document.createElement('span');
    next.className = 'talk-next';
    next.textContent = '▶';
    this.box.append(this.face, body, next);
    this.root.appendChild(this.box);
    document.getElementById('hud')!.appendChild(this.root);
    // (a tap anywhere while someone talks: finish the line, or the next one)
    this.root.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.tap();
    });
  }

  /** Someone is talking (the game waits). */
  get open() {
    return this.done !== null;
  }

  /** Say these lines, one after another; resolves after the last one is tapped away. */
  say(lines: Line[]): Promise<void> {
    if (this.skipping || !lines.length) return Promise.resolve();
    this.finish(); // (whatever was being said before ends)
    return new Promise((resolve) => {
      this.lines = lines;
      this.i = 0;
      this.done = resolve;
      this.root.classList.remove('hidden');
      this.showLine();
    });
  }

  /** End the conversation now (a skip). */
  finish() {
    if (!this.done) return;
    const d = this.done;
    this.done = null;
    this.root.classList.add('hidden');
    this.current?.show(false);
    this.current = null;
    d();
  }

  private tap() {
    if (!this.done) return;
    const line = this.lines[this.i];
    if (this.shownChars < line.text.length) {
      this.shownChars = line.text.length;
      this.textEl.textContent = line.text;
      return;
    }
    this.i++;
    if (this.i >= this.lines.length) this.finish();
    else this.showLine();
  }

  private showLine() {
    const line = this.lines[this.i];
    this.shownChars = 0;
    this.textEl.textContent = '';
    this.box.classList.toggle('note', line.who === 'note');
    this.box.classList.toggle('radio', line.who === 'radio');
    this.nameEl.textContent = this.nameOf(line.who);
    // The face: a live head, or an emoji (the radio), or none (narration)
    this.current?.show(false);
    this.current = this.head(line.who);
    this.current?.show(true);
    this.emoji.textContent = line.who === 'radio' ? '📻' : this.current ? '' : line.who === 'note' ? '' : '🙂';
    this.face.classList.toggle('hidden', line.who === 'note');
  }

  private nameOf(who: Speaker) {
    if (who === 'note' ) return '';
    if (who === 'radio') return '📻 Radio';
    if (who === 'you') return CAST[this.hero().id].name;
    return CAST[who].name;
  }

  /** A speaker's live head (made the first time they talk). */
  private head(who: Speaker): Avatar | null {
    if (who === 'note' || who === 'radio') return null;
    if (!this.heads.has(who)) {
      const id = who === 'you' ? this.hero().id : who;
      const want = who === 'you' ? this.hero().want : {};
      const look = lookFor(id, want);
      const model = look ? spawnHuman(look.file, 1.7) : null;
      const ava = model ? Avatar.fromModel(model, this.face, { bg: BG[who] ?? 0x4a6fa5 }) : null;
      ava?.show(false);
      this.heads.set(who, ava);
    }
    return this.heads.get(who) ?? null;
  }

  /** Who you play changed (the character card): your head is made again next time. */
  resetHero() {
    this.heads.get('you')?.dispose();
    this.heads.delete('you');
  }

  /** Every frame: type the line out, and draw the speaker's head. */
  update(renderer: THREE.WebGLRenderer, dt: number) {
    if (!this.done) return;
    const line = this.lines[this.i];
    if (this.shownChars < line.text.length) {
      this.shownChars = Math.min(line.text.length, this.shownChars + TYPE_RATE * dt);
      this.textEl.textContent = line.text.slice(0, Math.floor(this.shownChars));
    }
    this.current?.render(renderer, dt);
  }
}
