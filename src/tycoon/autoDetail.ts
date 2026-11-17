// ============================================================================
// 🎚️ AUTOMATIC DETAIL for the tiny people
//
// v0.80, Joshua's table to test: everyone's detail by HOW MANY PEOPLE ARE IN VIEW.
//   1-2: 100% · 3-4: 90% · 5-6: 80% · 7-8: 70% · 9-10: 60% · 11-12: 50% · 13-14: 40% · 15-16: 30% ·
//   17-18: 20% · 19-20: 10% · 21-22: 5% · 23-24: 2% · 25 and more: 1%
// Every two people more is one step down the ladder (devRoom.ts CROWD_DETAILS); her distance plays no part.
// A count has to hold for a moment before the step changes: someone walking along the screen's edge would
// otherwise have everyone's body made again and again.
//
// THE GUARD (v0.79's, kept as a safety net; Joshua: "if it starts falling, will lower it if needed down to 1%"):
// if the frame rate falls under four fifths of the best this device has shown, everyone goes a step lower than
// the table says, and another each reading until it holds; the steps come back one at a time while it is good.
// It never gives MORE detail than the table. "The best this device has shown" and not a fixed 60: a phone in Low
// Power Mode draws 30 a second at most. Settings says when the guard is in ("2 lower for fps").
// ============================================================================
/** The ladder: the detail (%) of each step. Joshua's, 2026-11-17. */
export const CROWD_DETAILS = [100, 90, 80, 70, 60, 50, 40, 30, 20, 10, 5, 2, 1];

/** GAME TUNING (the ladder itself is Joshua's). */
export const AUTO_DETAIL = {
  /** People in view for each step of the ladder. */
  perStep: 2,
  /** A new count holds this long (s) before the step follows it. */
  hold: 0.8,
  /** A reading is this long (s); under `low` of the best frame rate seen the guard steps down, over `high` it may step back. */
  window: 1.5, low: 0.8, high: 0.92,
  /** The least "best" it will believe (a heavy first few seconds are not the device's best). */
  bestAtLeast: 30,
  /** This long (s) of good readings before a step back; one that had to be undone within `undo` s isn't retried for `retry` s. */
  upAfter: 4.5, undo: 8, retry: 40,
};

/** The step of the ladder for that many people in view. */
export function stepFor(inView: number) {
  return Math.min(CROWD_DETAILS.length - 1, Math.max(0, Math.ceil(inView / AUTO_DETAIL.perStep) - 1));
}

export class AutoDetail {
  /** People in view, as last counted. */
  inView = 0;
  /** The table's step for the count that has held, and the steps the guard adds. */
  byCount = 0;
  guard = 0;
  /** The last frame-rate reading, and the best one so far. */
  fps = 0;
  best = AUTO_DETAIL.bestAtLeast;
  private last = 0;
  private frames = 0;
  private ms = 0;
  private good = 0;
  private wanted = 0;
  private wantedFor = 0;
  private raisedAt = -1e9;
  private holdUntil = 0;
  private holdAt = 0;

  /** The step of CROWD_DETAILS everyone is drawn at, and its detail in %. */
  get level() {
    return Math.min(CROWD_DETAILS.length - 1, this.byCount + this.guard);
  }
  get percent() {
    return CROWD_DETAILS[this.level];
  }

  /** Once a frame, with how many people are in view (and the clock's own time: the game's dt may be sped up). */
  step(inView: number, now = performance.now()) {
    const d = now - this.last;
    this.last = now;
    this.inView = inView;
    // (the table: a count that has held)
    const want = stepFor(inView);
    if (want !== this.wanted) { this.wanted = want; this.wantedFor = 0; } else this.wantedFor += Math.min(2000, Math.max(0, d)); // (real time, even on a slow frame)
    if (want !== this.byCount && this.wantedFor >= AUTO_DETAIL.hold * 1000) this.byCount = want;
    // (the guard. A hitch, a page that was hidden, a download landing: not a frame rate)
    if (d <= 0 || d > 250) { this.frames = 0; this.ms = 0; return; }
    this.frames++;
    this.ms += d;
    if (this.ms < AUTO_DETAIL.window * 1000) return;
    this.fps = (this.frames * 1000) / this.ms;
    this.frames = 0;
    this.ms = 0;
    this.best = Math.max(this.best, Math.min(120, this.fps));
    if (this.fps < this.best * AUTO_DETAIL.low) {
      this.good = 0;
      if (this.level < CROWD_DETAILS.length - 1) {
        this.guard++;
        // (it was a step back that did it: stay here for a while)
        if (now - this.raisedAt < AUTO_DETAIL.undo * 1000) { this.holdUntil = now + AUTO_DETAIL.retry * 1000; this.holdAt = this.guard; }
      }
    } else if (this.fps >= this.best * AUTO_DETAIL.high) {
      this.good += AUTO_DETAIL.window;
      const held = now < this.holdUntil && this.guard - 1 < this.holdAt;
      if (this.good >= AUTO_DETAIL.upAfter && this.guard > 0 && !held) {
        this.guard--;
        this.raisedAt = now;
        this.good = 0;
      }
    } else this.good = 0;
  }
}
