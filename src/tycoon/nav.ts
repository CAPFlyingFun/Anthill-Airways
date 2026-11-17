// ============================================================================
// nav.ts — 🧭 finding a way round things (v0.86)
//
// Joshua: "can we go through everything and make the people not walking through objects like in the check in and
// basically start adding collisions, smart path finding, etc…?"
//
// Passengers walked in straight lines from one hand-placed waypoint to the next, and anything not on that line's
// mind (the check-in counter, the café's oven, a shop, a gate's bridge) they walked through. Now the airport's own
// BLOCKERS (the same boxes that stop the player's ant) are laid on a grid, each grown by a walker's half-width, and
// a traveller asks for a path over the free cells: A* (eight ways, no cutting a corner), then pulled straight
// wherever it can see ahead. The grid is laid again whenever something is built or shown.
//
// A walker's own place or goal may be inside a grown box (the front of a counter, a seat by a wall): the path then
// starts or ends at the nearest free cell and the last step is walked straight.
// ============================================================================
import * as THREE from 'three';
import type { Blocker } from '../world/stations';

/** GAME TUNING: a cell's size, a walker's half-width (the room kept from every wall), and the margin round the airport. */
export const NAV = { cell: 0.8, radius: 0.85, margin: 24 };

export class Nav {
  /** Goes up each time the grid is laid again: a path planned on an older one is planned afresh. */
  version = 0;
  private x0 = 0;
  private z0 = 0;
  private w = 0;
  private h = 0;
  private solid = new Uint8Array(0);
  private signature = '';
  // A*'s own tables, kept between paths
  private g = new Float32Array(0);
  private from = new Int32Array(0);
  private seen = new Uint32Array(0);
  private done = new Uint32Array(0);
  private stamp = 0;
  private heap: number[] = [];
  private f = new Float32Array(0);

  /** Lay the grid if what is solid has changed (cheap to call often). */
  sync(blockers: Blocker[]) {
    let live = 0;
    for (const b of blockers) if (!b.obj || b.obj.visible) live++;
    const signature = `${blockers.length}:${live}`;
    if (signature === this.signature) return;
    this.signature = signature;
    this.version++;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const b of blockers) { minX = Math.min(minX, b.minX); maxX = Math.max(maxX, b.maxX); minZ = Math.min(minZ, b.minZ); maxZ = Math.max(maxZ, b.maxZ); }
    if (!Number.isFinite(minX)) { minX = maxX = minZ = maxZ = 0; }
    const c = NAV.cell;
    this.x0 = minX - NAV.margin; this.z0 = minZ - NAV.margin;
    this.w = Math.ceil((maxX - minX + 2 * NAV.margin) / c); this.h = Math.ceil((maxZ - minZ + 2 * NAV.margin) / c);
    const n = this.w * this.h;
    this.solid = new Uint8Array(n);
    this.g = new Float32Array(n); this.f = new Float32Array(n); this.from = new Int32Array(n); this.seen = new Uint32Array(n); this.done = new Uint32Array(n);
    this.stamp = 0;
    const r = NAV.radius;
    for (const b of blockers) {
      if (b.obj && !b.obj.visible) continue;
      // (a cell is solid when its middle is within a walker's half-width of the box)
      const i0 = Math.max(0, Math.floor((b.minX - r - this.x0) / c)), i1 = Math.min(this.w - 1, Math.floor((b.maxX + r - this.x0) / c));
      const j0 = Math.max(0, Math.floor((b.minZ - r - this.z0) / c)), j1 = Math.min(this.h - 1, Math.floor((b.maxZ + r - this.z0) / c));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const x = this.x0 + (i + 0.5) * c, z = this.z0 + (j + 0.5) * c;
        if (x > b.minX - r && x < b.maxX + r && z > b.minZ - r && z < b.maxZ + r) this.solid[j * this.w + i] = 1;
      }
    }
  }

  private cellOf(x: number, z: number) {
    const i = Math.floor((x - this.x0) / NAV.cell), j = Math.floor((z - this.z0) / NAV.cell);
    return i < 0 || j < 0 || i >= this.w || j >= this.h ? -1 : j * this.w + i;
  }
  /** Is there room to stand here? (Off the grid is open lawn: yes.) */
  free(x: number, z: number) {
    const k = this.cellOf(x, z);
    return k < 0 || !this.solid[k];
  }
  /** Can a walker go straight from one place to the other? */
  clear(ax: number, az: number, bx: number, bz: number) {
    const d = Math.hypot(bx - ax, bz - az), steps = Math.max(1, Math.ceil(d / (NAV.cell * 0.4)));
    for (let s = 0; s <= steps; s++) { const t = s / steps; if (!this.free(ax + (bx - ax) * t, az + (bz - az) * t)) return false; }
    return true;
  }
  /** The free cell nearest a place (itself, if it is free), or -1 off the grid. */
  private nearestFree(x: number, z: number) {
    const k = this.cellOf(x, z);
    if (k < 0 || !this.solid[k]) return k;
    const ci = k % this.w, cj = (k - ci) / this.w;
    for (let ring = 1; ring < 40; ring++) {
      let best = -1, bestD = Infinity;
      for (let j = cj - ring; j <= cj + ring; j++) for (let i = ci - ring; i <= ci + ring; i++) {
        if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== ring || i < 0 || j < 0 || i >= this.w || j >= this.h) continue;
        const q = j * this.w + i;
        if (this.solid[q]) continue;
        const d = Math.hypot(this.x0 + (i + 0.5) * NAV.cell - x, this.z0 + (j + 0.5) * NAV.cell - z);
        if (d < bestD) { bestD = d; best = q; }
      }
      if (best >= 0) return best;
    }
    return -1;
  }
  private centre(k: number, out: THREE.Vector3) {
    const i = k % this.w, j = (k - i) / this.w;
    return out.set(this.x0 + (i + 0.5) * NAV.cell, 0, this.z0 + (j + 0.5) * NAV.cell);
  }

  /**
   * The way from `a` to `b`: the places to walk to in turn, the last of them `b` itself. Straight there when
   * nothing is in the way, or when no way round can be found (as travellers always walked).
   */
  path(a: THREE.Vector3, b: THREE.Vector3): THREE.Vector3[] {
    const goal = b.clone();
    if (!this.w || this.clear(a.x, a.z, b.x, b.z)) return [goal];
    const s = this.nearestFree(a.x, a.z), e = this.nearestFree(b.x, b.z);
    if (s < 0 || e < 0) return [goal];
    const cells = s === e ? [s] : this.search(s, e);
    if (!cells) return [goal];
    // the cells' middles, then pulled straight: from each kept point, on to the furthest one it can see
    const pts = cells.map((k) => this.centre(k, new THREE.Vector3()));
    const out: THREE.Vector3[] = [];
    let at = this.solid[this.cellOf(a.x, a.z)] ? pts[0] : a;
    if (at === pts[0]) out.push(pts[0]);
    let i = 0;
    while (i < pts.length - 1) {
      let far = i + 1;
      for (let j = pts.length - 1; j > i + 1; j--) if (this.clear(at.x, at.z, pts[j].x, pts[j].z)) { far = j; break; }
      out.push(pts[far]);
      at = pts[far];
      i = far;
    }
    if (out.length && this.clear(at.x, at.z, b.x, b.z) && out[out.length - 1].distanceToSquared(goal) < NAV.cell * NAV.cell) out.pop();
    out.push(goal);
    return out;
  }

  /** A* over the free cells, eight ways, never between two solid corners. */
  private search(s: number, e: number): number[] | null {
    const w = this.w, h = this.h, stamp = ++this.stamp, heap = this.heap, f = this.f;
    heap.length = 0;
    const ei = e % w, ej = (e - ei) / w;
    const est = (k: number) => { const i = k % w, j = (k - i) / w, dx = Math.abs(i - ei), dz = Math.abs(j - ej); return Math.max(dx, dz) + 0.4142 * Math.min(dx, dz); };
    const push = (k: number) => { heap.push(k); let c = heap.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (f[heap[p]] <= f[heap[c]]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; } };
    const pop = () => {
      const top = heap[0], last = heap.pop()!;
      if (heap.length) {
        heap[0] = last;
        let p = 0;
        for (;;) { const l = 2 * p + 1, r = l + 1; let m = p; if (l < heap.length && f[heap[l]] < f[heap[m]]) m = l; if (r < heap.length && f[heap[r]] < f[heap[m]]) m = r; if (m === p) break; [heap[p], heap[m]] = [heap[m], heap[p]]; p = m; }
      }
      return top;
    };
    this.g[s] = 0; f[s] = est(s); this.from[s] = -1; this.seen[s] = stamp;
    push(s);
    let budget = 60000;
    while (heap.length && budget-- > 0) {
      const k = pop();
      if (k === e) { const out: number[] = []; for (let c = e; c >= 0; c = this.from[c]) out.push(c); return out.reverse(); }
      if (this.done[k] === stamp) continue;
      this.done[k] = stamp;
      const i = k % w, j = (k - i) / w;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= w || nj >= h) continue;
        const q = nj * w + ni;
        if (this.solid[q] || this.done[q] === stamp) continue;
        if (di && dj && (this.solid[j * w + ni] || this.solid[nj * w + i])) continue;
        const cost = this.g[k] + (di && dj ? 1.4142 : 1);
        if (this.seen[q] === stamp && cost >= this.g[q]) continue;
        this.seen[q] = stamp; this.g[q] = cost; f[q] = cost + est(q); this.from[q] = k;
        push(q);
      }
    }
    return null;
  }

  /** (a probe) The grid round a place as text: '#' solid, '.' free. */
  dump(x: number, z: number, half = 24) {
    const rows: string[] = [];
    for (let dz = -half; dz <= half; dz++) { let row = ''; for (let dx = -half; dx <= half; dx++) row += this.free(x + dx * NAV.cell, z + dz * NAV.cell) ? '.' : '#'; rows.push(row); }
    return rows.join('\n');
  }
}
