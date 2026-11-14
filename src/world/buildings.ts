// ============================================================================
// buildings.ts — 🏪 SHOP BUILDINGS you walk into (v0.31, step 3 of "the street
// comes alive").
//
// Joshua (2026-11-14): buildings built "with 3D in mind": real walls and a roof
// you can stand under, and in the top-down view "roofs off so you can see in".
//
// So a shop is built in TWO LAYERS:
//   - LOW:  wall stubs about knee-high (1.0), with gaps at the doors and a trim
//           cap on top. Always there. In the top-down (2.5D) view this is ALL
//           you see: the room's outline, like a floor plan, so nothing hides
//           the people inside.
//   - HIGH: everything above the stubs: the rest of the walls, the bit of wall
//           over each door (the lintel), windows, the roof, the awning, the
//           sign. Shown only when you look through your own eyes (3D).
//   `setCutaway(true)` hides HIGH (roof off), `setCutaway(false)` shows it.
//
// Like the houses (neighborhood.ts), every box gets its colour painted on its
// corners (vertex colours) and the boxes are merged, so a whole shop is only
// 4 meshes: the stubs, the walls, the roof, and the words on the sign.
//
// There is no floor here (the world already draws it) and nothing inside the
// room: the caller furnishes it.
// ============================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MapSeg } from '../ui/minimap';
import { TextSprite } from './labels';
import { cube, piece, HOUSE_MAT } from './neighborhood';

/** A door: an opening in one wall. `from`..`to` run ALONG that wall, in world coordinates: x for the north and south walls, z for the east and west walls. */
export interface DoorSpec { side: 'north' | 'south' | 'east' | 'west'; from: number; to: number }

export interface ShopSpec {
  /** The plot: the OUTSIDE of the walls sits exactly on this rectangle. */
  rect: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** Openings in the walls, from the floor to DOOR_H (people are 2.8 tall). */
  doors: DoorSpec[];
  /** How high the walls are inside. Default 5.6 (things up to 4.6 tall stand inside). */
  height?: number;
  wall: number;       // wall colour
  trim: number;       // the trim: wall caps, window and door frames, the parapet, the sign board
  roof: number;       // roof colour
  /** Words for the sign over the first south door, e.g. '☕ CORNER CAFÉ'. */
  sign?: string;
  /** Colour of a striped awning over the south door(s). Leave out for none. */
  awning?: number;
}

export interface Shop {
  /** Everything. The caller adds it to the scene. */
  group: THREE.Group;
  /** true = the top-down view: only the low wall stubs show. false = first person: full walls, windows, roof, sign. */
  setCutaway(on: boolean): void;
  /** The wall lines without the door openings, for the minimap. */
  outline: MapSeg[];
}

const T = 0.35;        // how thick a wall is
const STUB = 1.0;      // how high the always-there wall stubs are (with their cap)
const CAP = 0.1;       // ...of which this much is the trim cap on top
const DOOR_H = 3.4;    // how high a door opening is
const GLASS = 0x6f93b3;
const WHITE = 0xf6f3ea;

/** The same colour, darker (k < 1) or lighter (k > 1). */
const shade = (color: number, k: number) => {
  const c = new THREE.Color(color);
  return new THREE.Color(Math.min(1, c.r * k), Math.min(1, c.g * k), Math.min(1, c.b * k)).getHex();
};

type Side = DoorSpec['side'];
const SIDES: Side[] = ['north', 'south', 'west', 'east'];

export function buildShop(spec: ShopSpec): Shop {
  const { minX, maxX, minZ, maxZ } = spec.rect;
  const H = Math.max(spec.height ?? 5.6, DOOR_H + 0.4);
  const low: THREE.BufferGeometry[] = [];    // the stubs
  const high: THREE.BufferGeometry[] = [];   // the walls above them, windows, awning, sign board
  const top: THREE.BufferGeometry[] = [];    // the roof
  const outline: MapSeg[] = [];

  // --------------------------------------------------------------------------
  // WALLS. All four are built by the same code. Each wall is described by:
  //   - `a`..`b`: where it runs along its own length (x for north/south, z for
  //     east/west). The north and south walls run the full width; the east and
  //     west walls fit BETWEEN them, so the corners don't overlap.
  //   - `mid`: the middle of its thickness (the wall sits just inside the plot).
  //   - `out`: which way is outside (+1 or -1 on the other axis).
  // `slab` then places a box on that wall: from u0 to u1 along it, y0 to y1 up
  // it, `thick` through it, and pushed `off` toward the outside.
  // --------------------------------------------------------------------------
  const wallOf = (side: Side) => {
    switch (side) {
      case 'north': return { alongX: true, a: minX, b: maxX, mid: minZ + T / 2, out: -1 };
      case 'south': return { alongX: true, a: minX, b: maxX, mid: maxZ - T / 2, out: 1 };
      case 'west': return { alongX: false, a: minZ + T, b: maxZ - T, mid: minX + T / 2, out: -1 };
      default: return { alongX: false, a: minZ + T, b: maxZ - T, mid: maxX - T / 2, out: 1 };
    }
  };
  type Wall = ReturnType<typeof wallOf>;
  const slab = (w: Wall, u0: number, u1: number, y0: number, y1: number, thick: number, color: number, off = 0) => {
    const u = (u0 + u1) / 2, y = (y0 + y1) / 2, m = w.mid + off * w.out;
    return w.alongX ? cube(u1 - u0, y1 - y0, thick, color, u, y, m) : cube(thick, y1 - y0, u1 - u0, color, m, y, u);
  };

  const capColor = spec.trim;
  const winTop = Math.min(DOOR_H, H - 0.5);   // windows line up with the top of the doors

  for (const side of SIDES) {
    const w = wallOf(side);
    // This wall's doors, tidied: kept inside the wall, in order, overlapping ones joined.
    const doors: [number, number][] = [];
    const raw = spec.doors
      .filter((d) => d.side === side)
      .map((d) => [Math.max(w.a, Math.min(d.from, d.to)), Math.min(w.b, Math.max(d.from, d.to))] as [number, number])
      .filter(([f, t]) => t - f > 0.05)
      .sort((p, q) => p[0] - q[0]);
    for (const d of raw) {
      const last = doors[doors.length - 1];
      if (last && d[0] <= last[1]) last[1] = Math.max(last[1], d[1]);
      else doors.push([d[0], d[1]]);
    }
    // The solid stretches of wall: what's left between the doors.
    const solid: [number, number][] = [];
    let at = w.a;
    for (const [f, t] of doors) {
      if (f - at > 0.01) solid.push([at, f]);
      at = t;
    }
    if (w.b - at > 0.01) solid.push([at, w.b]);

    for (const [u0, u1] of solid) {
      // LOW: the stub and its cap. The cap is a touch wider than the wall, so from above
      // the cut reads as a clean coloured line, and from inside it's a rail along the wall.
      low.push(slab(w, u0, u1, 0, STUB - CAP, T, shade(spec.wall, 0.9)));
      low.push(slab(w, u0, u1, STUB - CAP, STUB, T + 0.08, capColor));
      // HIGH: the rest of the wall, up to the top of the doors (the band above that is one
      // long piece, further down)
      high.push(slab(w, u0, u1, STUB, DOOR_H, T, spec.wall));
      // For the minimap: a line down the middle of the wall
      outline.push(w.alongX ? { x0: u0, z0: w.mid, x1: u1, z1: w.mid } : { x0: w.mid, z0: u0, x1: w.mid, z1: u1 });

      // WINDOWS. They are not holes: each is a frame and a pane a little THICKER than
      // the wall, so it pokes out of both faces and shows outside and inside alike.
      const len = u1 - u0;
      if (side === 'south') {
        // The shop front: big windows filling the wall either side of the door.
        const room = len - 1.4;   // (keep 0.7 of plain wall at each end)
        if (room >= 1.6) {
          const n = Math.ceil(room / 4.2);
          const gap = 0.7;        // the pier of wall between two windows
          const ww = (room - (n - 1) * gap) / n;
          for (let i = 0; i < n; i++) {
            const x0 = u0 + 0.7 + i * (ww + gap), x1 = x0 + ww;
            high.push(slab(w, x0 - 0.14, x1 + 0.14, STUB + 0.16, winTop + 0.04, T + 0.1, spec.trim));   // frame
            high.push(slab(w, x0, x1, STUB + 0.3, winTop - 0.1, T + 0.16, GLASS));                      // glass
            high.push(slab(w, x0, x1, winTop - 0.75, winTop - 0.63, T + 0.22, spec.trim));              // a bar across, near the top
            high.push(slab(w, x0 - 0.22, x1 + 0.22, STUB + 0.08, STUB + 0.18, T + 0.3, spec.trim));     // the sill
          }
        }
      } else if (len >= 3) {
        // The other walls: a few smaller windows, spread evenly along each solid stretch
        // (so they can never land on a door).
        const n = Math.max(1, Math.floor(len / 4.5));
        const y0 = 2.0, y1 = Math.min(3.6, H - 0.6);
        for (let i = 0; i < n; i++) {
          const u = u0 + ((i + 0.5) / n) * len;
          high.push(slab(w, u - 1.05, u + 1.05, y0 - 0.15, y1 + 0.15, T + 0.1, spec.trim));   // frame
          high.push(slab(w, u - 0.9, u + 0.9, y0, y1, T + 0.16, GLASS));                      // glass
          high.push(slab(w, u - 0.05, u + 0.05, y0, y1, T + 0.2, spec.trim));                 // the bar down the middle
          high.push(slab(w, u - 1.15, u + 1.15, y0 - 0.25, y0 - 0.15, T + 0.26, spec.trim));  // the sill
        }
      }
    }

    // The top band of the wall, from the top of the doors to the roof, in ONE piece the whole
    // length of the wall. Over each door it is the lintel: the bit of wall above the opening.
    high.push(slab(w, w.a, w.b, DOOR_H, H, T, spec.wall));
    // A thin moulding along the join between the two (a join between two boxes can show as
    // a faint line in the shadows; this covers it, and it looks like a picture rail).
    high.push(slab(w, w.a, w.b, DOOR_H - 0.06, DOOR_H + 0.06, T + 0.06, shade(spec.wall, 0.88)));

    for (const [f, t] of doors) {
      // A trim frame round the opening (it stays out of the doorway... almost: 0.06 each side).
      high.push(slab(w, f - 0.1, t + 0.1, DOOR_H, DOOR_H + 0.18, T + 0.12, spec.trim));
      for (const e of [f, t]) high.push(slab(w, e - 0.1, e + 0.06, STUB, DOOR_H, T + 0.12, spec.trim));
    }

    // 🎪 THE AWNING over each south door: slanted stripes, then a short flap hanging at its edge.
    // Its lowest point (3.2) is still well over people's heads (2.8).
    if (side === 'south' && spec.awning !== undefined) {
      const reach = 1.5, drop = 0.6, yWall = DOOR_H + 0.7;
      const slope = Math.atan2(drop, reach), run = Math.hypot(reach, drop);
      for (const [f, t] of doors) {
        const x0 = Math.max(minX, f - 0.5), x1 = Math.min(maxX, t + 0.5);
        let n = Math.max(3, Math.round((x1 - x0) / 0.5));
        if (n % 2 === 0) n++;   // (an odd count, so both ends are the colour, not white)
        const sw = (x1 - x0) / n;
        for (let i = 0; i < n; i++) {
          const color = i % 2 ? WHITE : spec.awning;
          const x = x0 + (i + 0.5) * sw;
          const strip = new THREE.BoxGeometry(sw, 0.07, run);
          strip.rotateX(slope);   // tips its street end down
          high.push(piece(strip, color, x, yWall - drop / 2, maxZ + reach / 2));
          high.push(cube(sw, 0.3, 0.05, color, x, yWall - drop - 0.13, maxZ + reach));
        }
      }
    }
  }

  // 🪧 THE SIGN: a trim-coloured board on the shop front, over the first south door (or the
  // middle of the front if there's no door there), with the words on it.
  let signMesh: THREE.Mesh | null = null;
  if (spec.sign) {
    const southDoor = spec.doors.find((d) => d.side === 'south');
    const room = H - (DOOR_H + 0.9);                     // the wall between the awning and the roof
    const size = Math.max(0.6, Math.min(1.2, room - 0.2));
    const label = new TextSprite(size, '#ffffff');
    label.setText(spec.sign);
    // (shrink it if the words are wider than the shop)
    const k = Math.min(1, (maxX - minX - 1) / (label.width + 0.6));
    const sw = label.width * k, sh = size * k;
    const bw = sw + 0.6;
    let cx = southDoor ? (southDoor.from + southDoor.to) / 2 : (minX + maxX) / 2;
    cx = Math.max(minX + bw / 2 + 0.2, Math.min(maxX - bw / 2 - 0.2, cx));
    const cy = Math.max(DOOR_H + 0.9 + sh / 2 + 0.1, H - 0.1 - (sh + 0.2) / 2);
    high.push(cube(bw, sh + 0.2, 0.14, spec.trim, cx, cy, maxZ + 0.07));
    high.push(cube(bw + 0.16, sh + 0.36, 0.08, WHITE, cx, cy, maxZ + 0.04));   // a pale edge round the board
    // The words are drawn by TextSprite (so they match every other label in the game), but
    // its picture is put on a FLAT panel on the board instead of a sprite: a sprite always
    // turns to face you, and half of it would swing into the wall when you walk past.
    const mat = new THREE.MeshBasicMaterial({ map: (label.sprite.material as THREE.SpriteMaterial).map, transparent: true });
    signMesh = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), mat);
    signMesh.position.set(cx, cy, maxZ + 0.15);
  }

  // --------------------------------------------------------------------------
  // THE ROOF: a flat slab (its underside is the ceiling you see from inside),
  // a low wall round its edge (the parapet), and two things on top.
  // --------------------------------------------------------------------------
  const W = maxX - minX, D = maxZ - minZ, cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
  const SLAB = 0.3, over = 0.15;   // (the roof sticks out a little past the walls)
  top.push(cube(W + over * 2, SLAB, D + over * 2, spec.roof, cx, H + SLAB / 2, cz));
  top.push(cube(W - T * 2, 0.06, D - T * 2, shade(spec.wall, 0.96), cx, H - 0.03, cz));   // the ceiling: pale, so the room isn't gloomy
  const py0 = H + SLAB, ph = 0.5, pt = 0.3;
  top.push(cube(W + over * 2, ph, pt, spec.trim, cx, py0 + ph / 2, minZ - over + pt / 2));
  top.push(cube(W + over * 2, ph, pt, spec.trim, cx, py0 + ph / 2, maxZ + over - pt / 2));
  top.push(cube(pt, ph, D + over * 2 - pt * 2, spec.trim, minX - over + pt / 2, py0 + ph / 2, cz));
  top.push(cube(pt, ph, D + over * 2 - pt * 2, spec.trim, maxX + over - pt / 2, py0 + ph / 2, cz));
  // An air-conditioning unit (a grey box with a dark fan on top)...
  const s = Math.min(1, Math.min(W, D) / 8);   // (smaller on a small shop)
  const ax = minX + W * 0.3, az = minZ + D * 0.32;
  top.push(cube(1.8 * s, 0.9 * s, 1.3 * s, 0xb9bcc0, ax, py0 + 0.45 * s, az));
  top.push(piece(new THREE.CylinderGeometry(0.45 * s, 0.45 * s, 0.06, 12), 0x3a3d42, ax, py0 + 0.9 * s + 0.03, az));
  // ...and a vent: a short pipe box with a wider cap.
  const vx = maxX - W * 0.25, vz = minZ + D * 0.62;
  top.push(cube(0.6 * s, 0.8 * s, 0.6 * s, 0x8d9096, vx, py0 + 0.4 * s, vz));
  top.push(cube(0.9 * s, 0.12, 0.9 * s, 0x5a5f66, vx, py0 + 0.8 * s + 0.06, vz));

  // --------------------------------------------------------------------------
  // Put it together: 3 merged meshes (stubs, walls, roof) + the sign's words.
  // --------------------------------------------------------------------------
  const group = new THREE.Group();
  const mesh = (parts: THREE.BufferGeometry[], shadow: boolean) => {
    const m = new THREE.Mesh(mergeGeometries(parts, false)!, HOUSE_MAT);
    m.castShadow = shadow;
    m.receiveShadow = true;
    return m;
  };
  group.add(mesh(low, true));
  const upper = new THREE.Group();   // the HIGH layer: one switch hides all of it
  upper.add(mesh(high, true));
  upper.add(mesh(top, false));       // the roof casts NO shadow, so the sun still lights the room
  if (signMesh) upper.add(signMesh);
  group.add(upper);

  const setCutaway = (on: boolean) => { upper.visible = !on; };
  setCutaway(true);   // the game starts top-down: roofs off
  return { group, setCutaway, outline };
}
