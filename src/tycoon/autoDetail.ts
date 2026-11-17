// ============================================================================
// 🎚️ AUTOMATIC DETAIL for the tiny people (v0.79)
//
// Joshua: "Can we try 30% or is it set on automatic so the less there is on the screen and FPS good, will show
// more details but if it starts falling, will lower it if needed down to 1%?"
//
// It is automatic now. Each person has a level by how far she is from the camera (the builder's women: devRoom.ts
// CROWD_TABLE, 30% down to 1%; the story's men: creatures.ts PEOPLE_LOD). This adds a SHIFT to everyone's level:
//   - the frame rate holds near the best this device has shown  -> one level MORE detail, every few seconds,
//     up to 30% for everyone in the usual view;
//   - the frame rate falls under four fifths of that best        -> one level LESS, straight away, down to 1%.
// "The best this device has shown" and not a fixed 60: a phone in Low Power Mode draws 30 a second at most.
// A step up that brought the frame rate down is not tried again for a while, so it doesn't see-saw.
// ============================================================================

/** GAME TUNING. `shift` runs from `most` (more detail than her distance says) to `least` (everyone at the lightest). */
export const AUTO_DETAIL = {
  most: -2, least: 6, start: 1,
  /** A reading is this long (s); under `low` of the best frame rate seen it steps down, over `high` it may step up. */
  window: 1.5, low: 0.8, high: 0.92,
  /** The least "best" it will believe (a heavy first few seconds are not the device's best). */
  bestAtLeast: 30,
  /** This long (s) of good readings before a step up; a step up that had to be undone within `undo` s isn't retried for `retry` s. */
  upAfter: 4.5, undo: 8, retry: 40,
};

export class AutoDetail {
  /** Added to every person's level by distance (0: as her distance says). */
  shift = AUTO_DETAIL.start;
  /** The last reading, and the best one so far. */
  fps = 0;
  best = AUTO_DETAIL.bestAtLeast;
  private last = 0;
  private frames = 0;
  private ms = 0;
  private good = 0;
  private raisedAt = -1e9;
  private holdUntil = 0;
  private holdAt = AUTO_DETAIL.most;

  /** Once a frame, with the clock's own time (the game's dt is clamped and may be sped up). */
  step(now = performance.now()) {
    const d = now - this.last;
    this.last = now;
    // (a hitch, a page that was hidden, a download landing: not a frame rate)
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
      if (this.shift < AUTO_DETAIL.least) {
        this.shift++;
        // (it was a step up that did it: stay at this level for a while)
        if (now - this.raisedAt < AUTO_DETAIL.undo * 1000) { this.holdUntil = now + AUTO_DETAIL.retry * 1000; this.holdAt = this.shift; }
      }
    } else if (this.fps >= this.best * AUTO_DETAIL.high) {
      this.good += AUTO_DETAIL.window;
      const held = now < this.holdUntil && this.shift - 1 < this.holdAt;
      if (this.good >= AUTO_DETAIL.upAfter && this.shift > AUTO_DETAIL.most && !held) {
        this.shift--;
        this.raisedAt = now;
        this.good = 0;
      }
    } else this.good = 0;
  }
}
