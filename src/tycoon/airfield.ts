// ============================================================================
// airfield.ts — 🐜✈️ THE FIRST AIRFIELD (v0.68): an insect-scale airport run by your fire ant colony.
//
// You play the fire ant Major in the blue pilot cap (the app icon!). Everything is real size (1 unit = 2 mm):
// your colony's ants are the real 3D models, every other creature is built from code (tycoon/bugs), and the
// airport is built from found things (tycoon/airport): a pebble-and-leaf runway, a seashell terminal, nectar
// flowers as fuel pumps. The lawn around the clearing is a forest of grass blades 47 units tall.
//
// THE LOOP (layout and numbers in data.ts):
//   🌼 nectar flower ──(carry drops)──► ⛽ gate fuel pad ──► 🐞 the ladybug can fly
//   🐞 passengers ──► 🎫 CHECK-IN (you or the Check-in ant stand at the desk) ──► 💵 ticket on the cash pad
//                  ──► wait at the gate ──► board ──► taxi, take off, the route, land ──► 💵 landing fees
//   💵 cash pad ──(walk over it, or the Banker ant)──► your cash ──► the glowing tiles: hire ants, grow
//
// The same "stand on it" rule as the colony: items hop one at a time while you stand on a pad.
// ============================================================================
import * as THREE from 'three';
import { clock } from '../core/clock';
import { autoCash } from '../core/income';
import { bump } from '../core/totals';
import { CONFIG } from '../data/config';
import type { Sfx } from '../core/audio';
import type { SaveData, TycoonSave } from '../core/save';
import type { Progress } from '../core/progress';
import type { Hud } from '../ui/hud';
import { Player, fpFov } from '../actors/player';
import { Banker, Worker } from '../actors/worker';
import { spawnCreature } from '../actors/creatures';
import { animateCreature, makeAnt, type CreatureModel } from '../actors/models';
import { Flyers, Stack, makeItem, type StackItem } from '../world/items';
import { TextSprite, TITLE, makePad, titleTag } from '../world/labels';
import { CashPad, UnlockTile, Zone, gridLayout, type Blocker } from '../world/stations';
import { TUTORIAL_DONE, Tutorial, type TutorialScript } from '../world/tutorial';
import type { MapRect, MapView } from '../ui/minimap';
import { AT, CLEARINGS, TY, TYCOON_SAVE_V, TY_UNLOCKS, walkable } from './data';
import { SURFACE, artBaggageCart, artBackdrop, artBug, artDewTank, artFuelFlower, artHangar, artScatter, artGate, artGround, artLawn, artRunway, artSign, artTaxiway, artTerminal, artTower, artWindsock, type ArtLawn, type ArtPiece } from './art';
import { Plane } from './plane';
import { Passengers, type Pax } from './passengers';
import { mat, mesh, PAL } from './kit';

/** A nectar flower: its 3D, the drops waiting on it, the spot you stand to take them. */
interface Flower {
  piece: ArtPiece;
  stack: Stack;
  zone: Zone;
  t: number;
}

/** A gate: its stand, its fuel pad, its plane, who's aboard and boarding. */
interface Gate {
  piece: ArtPiece;
  /** The bridge's end beside the plane: passengers walk here, then hop aboard. */
  door: THREE.Vector3;
  fuel: Stack;
  fuelZone: Zone;
  plane: Plane;
  riders: Pax[];
  boarding: Pax[];
  /** Seconds since the first passenger sat down (waiting for more before going). */
  boardT: number;
  open: boolean;
  label: TextSprite;
}

const SIZE = 760;
/** The lawn's square (the ground and the far backdrop go further). */
const LAWN = 470;
/** 🎓 Steps finished by actions (did()). */
const STEP = { nectar: 0, fuel: 1, checkIn: 2, takeoff: 3, cash: 4 } as const;

export class Airfield {
  static MAP_BOUNDS: MapRect = { minX: -110, maxX: 110, minZ: -84, maxZ: 76 };
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(56, 1, 0.3, 900);
  flyers = new Flyers(this.scene);
  player: Player;
  sun = new THREE.DirectionalLight(0xffffff, 2.2);
  tiles: UnlockTile[] = [];
  cashPads: CashPad[] = [];
  workers: Worker[] = [];
  bankers: Banker[] = [];
  tutorial: Tutorial;
  /** Point the camera follows (the player): the LOD system measures from here. */
  get focus() {
    return this.player.pos;
  }

  private st: TycoonSave;
  private lawn: ArtLawn;
  private pieces: ArtPiece[] = [];
  private blockers: Blocker[] = [];
  private flowers: Flower[] = [];
  private gates: Gate[] = [];
  private pax: Passengers;
  private cashPad: CashPad;
  private deskZone: Zone;
  private checkInAnt: CreatureModel | null = null;
  private timers = new Map<object, number>();
  private camOffset = new THREE.Vector3(0, 22, 20);
  private thirdFov = 56;
  private idlers: CreatureModel[] = [];

  constructor(private hud: Hud, private sfx: Sfx, public save: SaveData, private progress: Progress) {
    this.st = save.tycoon ??= { v: TYCOON_SAVE_V, fuel: [0, 0], flowers: [4, 0], flights: 0, passengers: 0, x: AT.start.x, z: AT.start.z };
    this.buildEnvironment();
    this.lawn = artLawn(LAWN, (x, z) => CLEARINGS.some((c) => Math.hypot(x - c.x, z - c.z) < c.r));
    this.scene.add(this.lawn.root);

    // 🐜 You: the fire ant Major in the pilot cap
    this.player = new Player(this.scene);
    this.player.pos.set(this.st.x, 0, this.st.z);

    this.buildNest();
    this.buildRunway();
    const desk = this.buildTerminal();
    this.cashPad = new CashPad(this.scene, desk.cash.x, desk.cash.z);
    this.cashPads.push(this.cashPad);
    this.deskZone = new Zone(desk.serve.x, desk.serve.z, 1.6, 1.6);
    const serve = makePad(3.2, 3.2, 'CHECK-IN', '#ffd166');
    serve.position.set(desk.serve.x, 0.05, desk.serve.z);
    this.scene.add(serve);

    AT.flowers.forEach((f, i) => this.buildFlower(f.x, f.z, i === 0 || this.owns('ty-flower2')));
    AT.gates.forEach((g, i) => this.buildGate(g.x, g.z, i, i === 0 || this.owns('ty-gate2')));
    this.pax = new Passengers(
      this.scene,
      {
        edge: new THREE.Vector3(AT.lawnEdge.x, 0, AT.lawnEdge.z),
        desk: desk.front,
        lineDir: new THREE.Vector3(1, 0, 0),
        gateWait: this.gates.map((g) => g.piece.root.localToWorld(g.piece.spots.gate.clone())),
        round: new THREE.Vector3(AT.terminal.x + 26, 0, AT.terminal.z - 8),
      },
      AT.gates.length,
      this.groundY,
    );
    this.pax.gates = this.gates.filter((g) => g.open).length;
    this.pax.onCheckIn = () => {
      this.bill(TY.ticket, desk.front);
      this.st.passengers++;
      bump('sold');
      this.progress.addXp(TY.xpCheckIn);
      this.sfx.sale();
      this.tutorial.did(STEP.checkIn);
    };

    this.buildDecor();

    // The glowing tiles
    for (const def of TY_UNLOCKS) {
      const t = new UnlockTile(this.scene, def, save.paid[def.id] ?? 0);
      this.tiles.push(t);
    }
    for (const id of save.unlocked) this.applyUnlock(id, false);
    this.refreshTiles(false);

    this.tutorial = new Tutorial(this, hud, save, this.script());
    hud.setCash(save.cash);
    hud.setZone('🛫 Anthill Airfield');
  }

  /** How high the surface is at (x, z): the runway and taxiways are raised a little above the dirt. */
  groundY = (x: number, z: number) => {
    const rw = AT.runway;
    if (Math.abs(x - rw.x) < rw.length / 2 && Math.abs(z - rw.z) < rw.width / 2) return SURFACE.runway;
    const west = rw.x - rw.length / 2 + 6;
    const onTaxi =
      (Math.abs(z - AT.taxiZ) < 3.5 && x > west - 3.5 && x < 23.5) ||
      ((Math.abs(x - west) < 3.5 || Math.abs(x - 20) < 3.5) && z < AT.taxiZ && z > rw.z) ||
      AT.gates.some((g) => Math.abs(x - g.x) < 3 && z > AT.taxiZ && z < g.z - 6);
    return onTaxi ? SURFACE.taxiway : 0;
  };

  // --------------------------------------------------------------------------
  // Building the world
  // --------------------------------------------------------------------------
  private buildEnvironment() {
    const s = this.scene;
    s.background = new THREE.Color(PAL.sky);
    s.fog = new THREE.Fog(PAL.sky, 220, 620);
    s.add(new THREE.HemisphereLight(0xffffff, 0x8d6e4a, 1.6));
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -48;
    sc.right = 48;
    sc.top = 48;
    sc.bottom = -48;
    sc.near = 1;
    sc.far = 200;
    this.sun.shadow.bias = -0.0006;
    s.add(this.sun, this.sun.target);
    s.add(artGround(SIZE, CLEARINGS));
    s.add(artBackdrop(480));
    // Pebbles, fallen leaves and twigs lying about the dirt (kept off the runway, paths and stations)
    const busy = (x: number, z: number) =>
      Math.abs(z - AT.runway.z) < 16 ||
      Math.abs(z - AT.taxiZ) < 7 ||
      Math.hypot(x - AT.terminal.x, z - AT.terminal.z) < 34 ||
      Math.hypot(x - AT.nest.x, z - AT.nest.z) < 16 ||
      AT.gates.some((g) => Math.abs(x - g.x) < 12 && z > g.z - 30 && z < g.z + 8) ||
      AT.flowers.some((f) => Math.hypot(x - f.x, z - f.z) < 10) ||
      TY_UNLOCKS.some((u) => Math.hypot(x - u.pos[0], z - u.pos[1]) < 5) ||
      !CLEARINGS.some((c) => Math.hypot(x - c.x, z - c.z) < c.r - 4);
    const area = { x: 0, z: 0, w: 240, d: 190 };
    artScatter(s, 'pebbles', area, 46, busy, 3);
    artScatter(s, 'leaves', area, 30, busy, 4);
    artScatter(s, 'twigs', area, 10, busy, 5);
  }

  /** 🐜 The colony's nest: a mound of dug-out soil with the entrance on top. */
  private buildNest() {
    const g = new THREE.Group();
    g.position.set(AT.nest.x, 0, AT.nest.z);
    const mound = mesh(new THREE.CylinderGeometry(3.2, 9, 5, 18, 3), mat(0x9a6a40, { rough: 1, flat: true }));
    mound.position.y = 2.5;
    const hole = mesh(new THREE.CylinderGeometry(1.6, 1.2, 0.6, 14), mat(0x2a1a10, { rough: 1 }), false);
    hole.position.y = 5.05;
    g.add(mound, hole);
    // Loose crumbs of soil around it
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + Math.random() * 0.3;
      const r = 9.5 + Math.random() * 3;
      const clod = mesh(new THREE.DodecahedronGeometry(0.5 + Math.random() * 0.5), mat(0x9a6a40, { rough: 1, flat: true }));
      clod.position.set(Math.cos(a) * r, 0.3, Math.sin(a) * r);
      g.add(clod);
    }
    const tag = new TextSprite(1.4, '#ffd166');
    tag.setText('🐜 YOUR COLONY');
    tag.sprite.position.y = 10;
    g.add(tag.sprite);
    this.scene.add(g);
    this.blockers.push({ minX: AT.nest.x - 6, maxX: AT.nest.x + 6, minZ: AT.nest.z - 6, maxZ: AT.nest.z + 6 });
    // Two of your workers busy at the entrance (just for life)
    for (const [dx, dz, ry] of [[-4, 6, 2.5], [5, 4.5, -2]]) {
      const ant = spawnCreature('worker', 2.1) ?? makeAnt(0x8e2f14);
      ant.root.position.set(AT.nest.x + dx, 0, AT.nest.z + dz);
      ant.root.rotation.y = ry;
      this.scene.add(ant.root);
      this.idlers.push(ant);
    }
  }

  private place(p: ArtPiece, x: number, z: number, ry = 0) {
    p.root.position.set(x, 0, z);
    p.root.rotation.y = ry;
    this.scene.add(p.root);
    p.root.updateMatrixWorld(true);
    for (const b of p.blockers) {
      // (blockers are local: turn their corners into the world)
      const c = [new THREE.Vector3(b.minX, 0, b.minZ), new THREE.Vector3(b.maxX, 0, b.maxZ)].map((v) => p.root.localToWorld(v));
      this.blockers.push({ minX: Math.min(c[0].x, c[1].x), maxX: Math.max(c[0].x, c[1].x), minZ: Math.min(c[0].z, c[1].z), maxZ: Math.max(c[0].z, c[1].z) });
    }
    this.pieces.push(p);
    if (p.roofs.length) {
      // (its size on the ground, for the 2.5D cutaway: see updateRoofs)
      const box = new THREE.Box3().setFromObject(p.root);
      const r = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) / 2;
      this.roofed.push({ p, r, c: box.getCenter(new THREE.Vector3()) });
    }
    return p;
  }
  /** Pieces with roofs (the terminal, the hangar, the tower cab, the gates' bridges): their ground size and centre. */
  private roofed: { p: ArtPiece; r: number; c: THREE.Vector3 }[] = [];

  /**
   * 🏠 The 2.5D cutaway: a roof between the camera and you (or right over you) comes off, so you can always see
   * yourself and look inside. In first person every roof stays on (you're inside: that's your ceiling).
   */
  private updateRoofs() {
    const p = this.player.pos;
    const fp = this.player.firstPerson;
    for (const { p: piece, r, c } of this.roofed) {
      const dx = Math.abs(c.x - p.x);
      const ahead = c.z - p.z; // (+ = toward the camera)
      const off = !fp && dx < r + 6 && ahead > -r - 4 && ahead < r + 34;
      for (const roof of piece.roofs) roof.visible = !off;
    }
  }

  private worldSpot(p: ArtPiece, name: string, fallback: THREE.Vector3) {
    const s = p.spots[name];
    return s ? p.root.localToWorld(s.clone()) : fallback.clone();
  }

  private buildRunway() {
    const rw = AT.runway;
    this.place(artRunway(rw.length, rw.width), rw.x, rw.z);
    // The taxiway: along the north of the gates, joining the runway at both ends
    const west = rw.x - rw.length / 2 + 6;
    const pts = [new THREE.Vector2(west, rw.z), new THREE.Vector2(west, AT.taxiZ), new THREE.Vector2(20, AT.taxiZ), new THREE.Vector2(20, rw.z)];
    this.place(artTaxiway(pts, 7), 0, 0);
    for (const g of AT.gates) this.place(artTaxiway([new THREE.Vector2(g.x, AT.taxiZ), new THREE.Vector2(g.x, g.z - 6)], 6), 0, 0);
  }

  /** 🐚 The terminal, and where its check-in desk, line and cash pad go. */
  private buildTerminal() {
    const t = this.place(artTerminal(), AT.terminal.x, AT.terminal.z);
    const door = this.worldSpot(t, 'door', new THREE.Vector3(AT.terminal.x, 0, AT.terminal.z + 14));
    // An outdoor check-in desk beside the door: you stand on its west side, the line runs east
    const deskAt = door.clone().add(new THREE.Vector3(6, 0, 4));
    const desk = mesh(new THREE.CapsuleGeometry(1.0, 2.6, 4, 12).rotateX(Math.PI / 2).scale(1, 1.1, 1), mat(PAL.pebbleWarm, { rough: 0.55 }));
    desk.position.copy(deskAt).setY(1.0);
    this.scene.add(desk);
    this.blockers.push({ minX: deskAt.x - 0.9, maxX: deskAt.x + 0.9, minZ: deskAt.z - 2.1, maxZ: deskAt.z + 2.1 });
    const sign = new TextSprite(1.3, '#ffffff');
    sign.setText('🎫 CHECK-IN');
    sign.sprite.position.copy(deskAt).setY(5);
    this.scene.add(sign.sprite);
    return {
      front: deskAt.clone().add(new THREE.Vector3(2.2, 0, 0)),
      serve: deskAt.clone().add(new THREE.Vector3(-2.6, 0, 0)),
      cash: door.clone().add(new THREE.Vector3(-7, 0, 7)),
    };
  }

  /** 🌼 A nectar flower (`open` = bought: the second one shows up later). */
  private buildFlower(x: number, z: number, open: boolean) {
    const piece = this.place(artFuelFlower(), x, z);
    piece.root.visible = open;
    const pump = this.worldSpot(piece, 'pump', new THREE.Vector3(x, 0, z + 4));
    const g = new THREE.Group();
    g.position.copy(pump);
    this.scene.add(g);
    const stack = new Stack(g, gridLayout(3, 4, 0.62, 0.62, 0.05), TY.flowerMax);
    const i = this.flowers.length;
    for (let n = 0; n < (this.st.flowers[i] ?? 0); n++) stack.addInstant('nectar');
    const label = new TextSprite(1.0, '#ffd166');
    label.setText('🌼 NECTAR');
    label.sprite.position.copy(pump).setY(3.5);
    label.sprite.visible = open;
    this.scene.add(label.sprite);
    piece.root.userData.label = label;
    this.flowers.push({ piece, stack, zone: new Zone(pump.x, pump.z, 1.8, 1.8), t: 0 });
  }

  /** 🛫 A gate with its plane (`open` = bought). */
  private buildGate(x: number, z: number, i: number, open: boolean) {
    const piece = this.place(artGate(i + 1), x, z);
    const stand = this.worldSpot(piece, 'plane', new THREE.Vector3(x, 0, z - 6));
    const model = artBug('ladybug', TY.ladybugLength, { seed: 3 + i });
    this.scene.add(model.root);
    const plane = new Plane(model, stand, this.groundY);
    // ⛽ the fuel pad beside the stand
    const fuelAt = stand.clone().add(new THREE.Vector3(6.5, 0, 2));
    const pad = makePad(3, 3, 'FUEL', '#ffb02e');
    pad.position.copy(fuelAt).setY(0.05);
    this.scene.add(pad);
    const g = new THREE.Group();
    g.position.copy(fuelAt);
    this.scene.add(g);
    const fuel = new Stack(g, gridLayout(2, 4, 0.62, 0.62, 0.08), TY.fuelMax);
    for (let n = 0; n < (this.st.fuel[i] ?? 0); n++) fuel.addInstant('nectar');
    const label = new TextSprite(1.2, '#ffffff');
    label.setText(`GATE ${i + 1}`);
    label.sprite.position.copy(stand).add(new THREE.Vector3(0, 8, 0));
    this.scene.add(label.sprite);
    const door = this.worldSpot(piece, 'door', stand.clone().add(new THREE.Vector3(-3, 0, 0)));
    const gate: Gate = { door, piece, fuel, fuelZone: new Zone(fuelAt.x, fuelAt.z, 1.5, 1.5), plane, riders: [], boarding: [], boardT: 0, open, label };
    for (const o of [piece.root, model.root, pad, label.sprite]) o.visible = open;
    pad.userData.gatePad = true;
    piece.root.userData.pad = pad;
    plane.onAirborne = () => {
      this.st.flights++;
      this.progress.addXp(TY.xpFlight);
      this.tutorial.did(STEP.takeoff);
      if (this.near(plane.pos, 40)) this.hud.floatAt(plane.pos.clone().setY(plane.pos.y + 3), this.camera, '🛫 Take-off!', 'big');
    };
    plane.onRoute = () => {
      // The travellers have flown off to their destination
      for (const p of gate.riders) {
        p.model.root.removeFromParent();
        this.paxRemove(p);
      }
      plane.riders.fill(null);
      gate.riders = [];
    };
    plane.onApproach = () => {
      // New travellers coming in
      const n = 1 + Math.floor(Math.random() * plane.model.seats.length);
      gate.riders = this.pax.makeArrivals(n);
      for (const p of gate.riders) plane.seat(p.model.root);
    };
    plane.onArrived = () => {
      // Everyone off: they pay their landing fee and walk away into the lawn
      plane.unseat(this.scene);
      for (const p of gate.riders) {
        p.state = 'leaving';
        this.pax.leave(p);
        this.bill(TY.landingFee, plane.pos);
      }
      gate.riders = [];
      if (this.near(plane.pos, 40)) this.hud.floatAt(plane.pos.clone().setY(3), this.camera, '🛬 Landed', '');
    };
    this.gates.push(gate);
  }

  private buildDecor() {
    this.place(artTower(), AT.tower.x, AT.tower.z);
    this.place(artWindsock(), AT.windsock.x, AT.windsock.z);
    this.place(artHangar(), AT.hangar.x, AT.hangar.z + 12);
    this.place(artDewTank(), AT.flowers[1].x + 22, AT.flowers[1].z - 10, -0.4);
    this.place(artBaggageCart(), AT.gates[0].x + 12, AT.gates[0].z + 4, 0.6);
    this.place(artSign('ANTHILL AIRWAYS'), AT.terminal.x - 30, AT.terminal.z + 24, 0.5);
    this.place(artSign('GATES', 'up'), AT.terminal.x + 26, AT.terminal.z - 2, -0.3);
  }

  // --------------------------------------------------------------------------
  // Unlocks
  // --------------------------------------------------------------------------
  private owns(id: string) {
    return this.save.unlocked.includes(id);
  }

  private applyUnlock(id: string, animate: boolean) {
    const nest = new THREE.Vector3(AT.nest.x, 0, AT.nest.z + 7);
    if (id === 'ty-runner' || id === 'ty-runner2') {
      const w = new Worker(this.scene, nest.x, nest.z, () => this.fuelRoute(), { color: 0xffb02e }, 2.1);
      titleTag(w.model, '⛽ FUEL RUNNER', TITLE.ant);
      this.workers.push(w);
      if (animate) this.flyers.grow(w.model.root);
    } else if (id === 'ty-checkin') {
      const a = spawnCreature('worker', 2.1) ?? makeAnt(0x8e2f14);
      a.root.position.set(this.deskZone.x - 0.4, 0, this.deskZone.z);
      a.root.rotation.y = Math.PI / 2; // (facing the line, east)
      titleTag(a, '🎫 CHECK-IN', TITLE.ant);
      this.scene.add(a.root);
      this.checkInAnt = a;
      if (animate) this.flyers.grow(a.root);
    } else if (id === 'ty-banker') {
      const b = new Banker(this.scene, this.cashPad, (amount) => {
        this.addCash(amount);
        autoCash(amount); // (automated income: counts toward +$/min and the offline pay)
      });
      titleTag(b.model, '🏦 BANKER', TITLE.ant);
      this.bankers.push(b);
      if (animate) this.flyers.grow(b.model.root);
    } else if (id === 'ty-flower2') {
      const f = this.flowers[1];
      f.piece.root.visible = true;
      (f.piece.root.userData.label as TextSprite).sprite.visible = true;
      if (animate) this.flyers.grow(f.piece.root);
    } else if (id === 'ty-gate2') {
      const g = this.gates[1];
      g.open = true;
      for (const o of [g.piece.root, g.plane.model.root, g.piece.root.userData.pad as THREE.Object3D, g.label.sprite]) o.visible = true;
      this.pax.gates = 2;
      if (animate) this.flyers.grow(g.plane.model.root);
    } else if (id === 'ty-tower') {
      for (const g of this.gates) g.plane.boost = TY.towerBoost;
    }
  }

  /** ⛽ The fullest open flower -> the open gate with the least fuel. */
  private fuelRoute() {
    const flowers = this.flowers.filter((f) => f.piece.root.visible);
    const f = flowers.reduce((a, b) => (b.stack.count > a.stack.count ? b : a), flowers[0]);
    const gates = this.gates.filter((g) => g.open);
    const g = gates.reduce((a, b) => (b.fuel.count < a.fuel.count ? b : a), gates[0]);
    return { src: f.stack, srcZone: f.zone, dst: g.fuel, dstZone: g.fuelZone };
  }

  private unlock(tile: UnlockTile) {
    const id = tile.def.id;
    this.save.unlocked.push(id);
    delete this.save.paid[id];
    tile.mesh.visible = false;
    this.applyUnlock(id, true);
    this.progress.addXp(CONFIG.xp.tile.home);
    this.sfx.unlocked();
    this.hud.floatAt(tile.mesh.position.clone().setY(2.5), this.camera, 'UNLOCKED!', 'big gold');
    this.refreshTiles(true);
  }

  private refreshTiles(animate: boolean) {
    for (const t of this.tiles) {
      const show = !this.owns(t.def.id) && t.def.requires.every((r) => this.owns(r));
      if (show && !t.mesh.visible && animate) this.flyers.grow(t.mesh);
      t.mesh.visible = show;
    }
  }

  // --------------------------------------------------------------------------
  // Money
  // --------------------------------------------------------------------------
  addCash(amount: number) {
    this.save.cash += amount;
    this.hud.setCash(this.save.cash);
  }

  /** A bill pops out at `from` and lands on the cash pad. */
  private bill(value: number, from: THREE.Vector3) {
    const v = Math.round(value * this.progress.cashMult);
    const pad = this.cashPad.stack;
    if (pad.full) {
      pad.items[pad.count - 1].value += v;
      return;
    }
    const it: StackItem = { mesh: makeItem('cash'), type: 'cash', value: v, flying: false };
    it.mesh.position.copy(from).setY(2);
    this.scene.add(it.mesh);
    this.flyers.pushInto(it, pad, 0.45);
  }

  private paxRemove(p: Pax) {
    const i = this.pax.all.indexOf(p);
    if (i >= 0) this.pax.all.splice(i, 1);
  }

  private near(p: THREE.Vector3, r: number) {
    return Math.hypot(p.x - this.player.pos.x, p.z - this.player.pos.z) < r;
  }

  // --------------------------------------------------------------------------
  // Per frame
  // --------------------------------------------------------------------------
  /** Runs `fn` every `interval` seconds while `active` is true (one timer per `key`). */
  private every(key: object, dt: number, active: boolean, interval: number, fn: () => void) {
    if (!active) {
      this.timers.set(key, interval);
      return;
    }
    let t = (this.timers.get(key) ?? interval) + dt;
    while (t >= interval) {
      t -= interval;
      fn();
    }
    this.timers.set(key, t);
  }

  update(dt: number, move: THREE.Vector2) {
    const p = this.player.pos;
    const me = this.player;
    const prog = this.progress;
    me.carryMax = CONFIG.player.baseCarry + prog.carryBonus;
    me.speedMult = prog.speedMult * 1.6; // (the airfield is big: you walk a bit faster than in the colony)
    me.update(dt, move, this.blockers, walkable);
    p.y = this.groundY(p.x, p.z);
    this.st.x = p.x;
    this.st.z = p.z;
    for (const m of this.idlers) animateCreature(m, dt, 0);
    if (this.checkInAnt) animateCreature(this.checkInAnt, dt, 0);
    for (const piece of this.pieces) piece.update?.(dt);
    this.lawn.update(dt, this.camera);

    const iv = CONFIG.player.pickupInterval / prog.workMult;

    // 🌼 Flowers make nectar; stand at one to take it
    this.flowers.forEach((f, i) => {
      if (!f.piece.root.visible) return;
      f.t += dt;
      if (f.t >= TY.flowerEvery && !f.stack.full) {
        f.t = 0;
        const it = f.stack.addInstant('nectar');
        this.flyers.grow(it.mesh, 0.25);
      }
      f.piece.setLevel?.(f.stack.count / TY.flowerMax);
      this.st.flowers[i] = f.stack.count;
      this.every(f.zone, dt, f.zone.contains(p) && me.canTake('nectar'), iv * 1.5, () => {
        if (me.canTake('nectar') && this.flyers.transfer(f.stack, me.stack)) {
          this.sfx.pickup();
          prog.addXp(CONFIG.xp.pickup);
          this.tutorial.did(STEP.nectar);
        }
      });
    });

    // ⛽ Gates: fuel them, board, go
    this.gates.forEach((g, i) => {
      if (!g.open) return;
      this.every(g.fuelZone, dt, g.fuelZone.contains(p) && me.stack.has('nectar'), iv * 1.5, () => {
        if (this.flyers.transferType(me.stack, g.fuel, 'nectar')) {
          this.sfx.drop();
          prog.addXp(TY.xpFuel);
          if (g.fuel.count >= TY.fuelPerFlight) this.tutorial.did(STEP.fuel);
        }
      });
      this.st.fuel[i] = g.fuel.count;
      this.updateBoarding(g, dt);
      g.plane.update(dt);
    });

    // 🎫 Check-in: you on the CHECK-IN pad, or the Check-in ant
    this.pax.serving = !!this.checkInAnt || this.deskZone.contains(p);
    this.pax.update(dt);

    // 💵 Cash pad -> your wallet
    this.every(this.cashPad.zone, dt, this.cashPad.zone.contains(p), 0.035, () => {
      const bill = this.cashPad.stack.pop();
      if (!bill) return;
      const target = new THREE.Vector3();
      this.flyers.fly(
        bill.mesh,
        () => target.copy(p).setY(2),
        () => {
          bill.mesh.removeFromParent();
          this.addCash(bill.value);
          this.sfx.cash();
          this.tutorial.did(STEP.cash);
        },
        0.22,
        1.2,
      );
    });

    for (const w of this.workers) w.update(dt, this.flyers);
    for (const b of this.bankers) b.update(dt, this.flyers);

    // ✨ Glowing tiles: stand on one to pour cash in
    for (const t of this.tiles) {
      if (!t.mesh.visible) continue;
      const affordable = this.save.cash >= 1 && !t.locked;
      t.update(dt, affordable && this.save.cash >= t.remaining);
      if (affordable && t.zone.contains(p)) {
        const rate = Math.max(t.def.cost / CONFIG.unlockDrainTime, CONFIG.unlockMinRate);
        const pay = Math.min(this.save.cash, rate * dt * clock.scale, t.def.cost - t.paid);
        t.paid += pay;
        this.save.cash -= pay;
        this.save.paid[t.def.id] = t.paid;
        this.hud.setCash(this.save.cash);
        this.sfx.unlockTick();
        if (t.paid >= t.def.cost - 1e-6) this.unlock(t);
      }
    }

    this.hud.setInventory(me.stack.counts(), me.stack.count, me.carryMax);
    this.flyers.update(dt);
    this.updateCamera(dt);
    this.updateRoofs();
    this.tutorial.update(dt, true);
  }

  /** Passengers walk out to a fuelled, parked plane and climb on; it goes when full (or after a wait). */
  private updateBoarding(g: Gate, dt: number) {
    const plane = g.plane;
    if (!plane.parked) return;
    const fuelled = g.fuel.count >= TY.fuelPerFlight;
    const nose = g.door;
    // Call more passengers while there are free seats (and the fuel to go)
    const free = plane.freeSeats - g.boarding.length;
    if (fuelled && free > 0 && this.pax.atGate[this.gates.indexOf(g)].length) {
      g.boarding.push(...this.pax.callToBoard(this.gates.indexOf(g), free, nose));
    }
    for (let i = g.boarding.length - 1; i >= 0; i--) {
      const p = g.boarding[i];
      if (!p.there) continue;
      g.boarding.splice(i, 1);
      if (plane.seat(p.model.root)) {
        p.state = 'seated';
        g.riders.push(p);
        this.sfx.pickup();
      }
    }
    if (plane.aboard > 0) g.boardT += dt;
    const ready = plane.aboard > 0 && !g.boarding.length && (plane.freeSeats === 0 || g.boardT >= TY.boardWait);
    if (ready && fuelled) {
      g.boardT = 0;
      // The nectar flies into the plane
      for (let n = 0; n < TY.fuelPerFlight; n++) {
        const it = g.fuel.pop();
        if (!it) break;
        this.flyers.fly(it.mesh, () => plane.pos.clone().setY(1.5), () => it.mesh.removeFromParent(), 0.3, 1);
      }
      plane.depart();
      this.sfx.unlocked();
    }
  }

  // --------------------------------------------------------------------------
  // Camera
  // --------------------------------------------------------------------------
  private updateCamera(dt: number) {
    const target = this.player.pos;
    const fp = this.player.firstPerson;
    this.setFov(fp ? fpFov(this.camera.aspect) : this.thirdFov);
    if (fp) {
      this.player.placeEyeCamera(this.camera);
    } else {
      const want = new THREE.Vector3().copy(target).add(this.camOffset);
      this.camera.position.lerp(want, Math.min(1, dt * 5));
      this.camera.lookAt(this.camera.position.x - this.camOffset.x, 0, this.camera.position.z - this.camOffset.z);
    }
    this.sun.position.set(target.x + 22, 60, target.z + 26);
    this.sun.target.position.copy(target);
  }
  private setFov(fov: number) {
    if (this.camera.fov === fov) return;
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
  }
  setShadowSize(size: number) {
    this.sun.shadow.mapSize.set(size, size);
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
  }
  resize(w: number, h: number) {
    this.camera.aspect = w / h;
    const portrait = w < h;
    this.camOffset.set(0, portrait ? 31 : 22, portrait ? 26 : 20);
    this.thirdFov = portrait ? 56 : 42;
    this.camera.fov = this.player.firstPerson ? fpFov(this.camera.aspect) : this.thirdFov;
    this.camera.updateProjectionMatrix();
  }

  // --------------------------------------------------------------------------
  // 🗺️ The minimap
  // --------------------------------------------------------------------------
  mapView(): MapView {
    const rw = AT.runway;
    const markers = [
      { x: AT.terminal.x, z: AT.terminal.z, icon: '🐚', label: 'Terminal' },
      { x: AT.nest.x, z: AT.nest.z, icon: '🐜', label: 'Colony' },
      { x: AT.tower.x, z: AT.tower.z, icon: '🗼' },
      ...this.flowers.filter((f) => f.piece.root.visible).map((f) => ({ x: f.zone.x, z: f.zone.z, icon: '🌼', alert: f.stack.full })),
      ...this.gates.filter((g) => g.open).map((g, i) => ({ x: g.fuelZone.x, z: g.fuelZone.z, icon: '⛽', label: `Gate ${i + 1}`, alert: g.fuel.count < TY.fuelPerFlight })),
      ...this.gates.filter((g) => g.open && g.plane.model.root.visible).map((g) => ({ x: g.plane.pos.x, z: g.plane.pos.z, icon: '🐞' })),
      { x: this.cashPad.zone.x, z: this.cashPad.zone.z, icon: '💵', alert: this.cashPad.stack.count > 0 },
    ];
    return {
      areas: [
        ...CLEARINGS.map((c) => ({ rect: { minX: c.x - c.r * 0.8, maxX: c.x + c.r * 0.8, minZ: c.z - c.r * 0.8, maxZ: c.z + c.r * 0.8 }, fill: '#c9a46c' })),
        { rect: { minX: rw.x - rw.length / 2, maxX: rw.x + rw.length / 2, minZ: rw.z - rw.width / 2, maxZ: rw.z + rw.width / 2 }, fill: '#8a7558', label: 'RUNWAY' },
      ],
      trees: [],
      fences: [],
      markers,
      tiles: this.tiles.filter((t) => t.mesh.visible).map((t) => ({ x: t.def.pos[0], z: t.def.pos[1] })),
      player: { x: this.player.pos.x, z: this.player.pos.z, yaw: this.player.model.root.rotation.y },
      target: this.tutorial.target ? { x: this.tutorial.target.x, z: this.tutorial.target.z } : null,
    };
  }

  // --------------------------------------------------------------------------
  // 🎓 The tutorial
  // --------------------------------------------------------------------------
  private script(): TutorialScript {
    const f0 = this.flowers[0];
    const g0 = this.gates[0];
    return {
      intro: {
        title: '🐜✈️ Welcome to Anthill Airways!',
        html: `<p>Your fire ant colony is opening an <b>airport</b>, right here in the backyard. Everything is
          bug-sized: the lawn is a forest, a ladybug is your first plane, and flower <b>nectar</b> is the fuel.</p>
          <p>Let's get the first flight in the air!</p>`,
      },
      finish: {
        title: '🛫 Your airline is flying!',
        html: `<p>Ants now fuel the planes and check the passengers in. Keep growing: a <b>Banker ant</b>, a second
          <b>nectar flower</b>, <b>Gate 2</b> with another ladybug, and the <b>Control Tower</b>.</p>`,
        button: '✈️ Let\'s fly',
      },
      defs: TY_UNLOCKS,
      steps: (t) => [
        { text: () => '🌼 Walk to the flower and pick up nectar', target: () => t.at(f0.zone) },
        {
          text: () => `⛽ Fuel the ladybug: drop nectar on Gate 1's FUEL pad`,
          target: () => t.at(g0.fuelZone),
          done: () => g0.fuel.count >= TY.fuelPerFlight || this.st.flights > 0,
          progress: () => Math.min(1, g0.fuel.count / TY.fuelPerFlight),
        },
        { text: () => '🎫 Stand at CHECK-IN to check a passenger in', target: () => t.at(this.deskZone), done: () => this.st.passengers > 0 },
        { text: () => '🛫 Watch your ladybug take off!', target: () => g0.plane.pos.clone(), done: () => this.st.flights > 0 },
        { text: () => '💵 Pick up your cash', target: () => t.at(this.cashPad.zone) },
        t.unlockStep('ty-runner', '⛽ Hire a Fuel Runner ant'),
        t.unlockStep('ty-checkin', '🎫 Hire a Check-in ant'),
      ],
    };
  }

  /** True while the tutorial is still going. */
  get learning() {
    return this.save.tutorial < TUTORIAL_DONE;
  }
}
