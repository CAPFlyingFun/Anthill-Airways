// ============================================================================
// airfield.ts — 🐜✈️ THE FIRST AIRFIELD (v0.68): an insect-scale airport run by your fire ant colony.
//
// You play the fire ant Major in the blue pilot cap (the app icon!). Everything is real size (1 unit = 2 mm):
// your colony's ants are the real 3D models, every other creature is built from code (tycoon/bugs), and the
// airport is built from found things (tycoon/airport): a pebble-and-leaf runway, a seashell terminal, nectar
// flowers as fuel pumps. The lawn around the clearing is a forest of grass blades 47 units tall.
//
// THE LOOP (layout and numbers in data.ts):
//   🌼 nectar flower ──(carry drops)──► ⛽ gate FUEL pad ──► 🐞 the ladybug can fly
//   🐞 passengers ──► 🎫 CHECK-IN (you or the Check-in ant stand at the desk) ──► 💵 ticket on the cash pad
//                  ──► wait at the gate ──► board ──► taxi to the hold line ──► 🗼 cleared ──► take off, the route,
//                  circle ──► 🗼 cleared to land ──► land ──► 💵 landing fees
//   🧳 each check-in's seed-bag ──► BAG DROP ──(carry)──► the gate's BAGS pad (a plane waits for its passengers' bags)
//   💵 cash pad ──(walk over it, or the Banker ant)──► your cash ──► the glowing tiles: hire ants, grow
//
// v0.69 (after AirportPRG): 🧳 bags, 🗼 runway clearance (one bug on the runway at a time: tap a plane's chip, or
// hire the Tower ant), the flight card + chips (tycoon/flightUi.ts) and 📅 daily goals with ⭐ (tycoon/goals.ts).
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
import { Bakery, CashPad, OVEN, ResourcePile, TrashBin, UnlockTile, Zone, gridLayout, type Blocker } from '../world/stations';
import { TUTORIAL_DONE, Tutorial, type TutorialScript } from '../world/tutorial';
import type { MapRect, MapView } from '../ui/minimap';
import { AT, CLEARINGS, CLEARINGS_FIRST, FIELDS, GATES_PER_FIELD, TY, TYCOON_SAVE_V, TY_UNLOCKS, fieldOf, walkable, type FieldDef } from './data';
import { SURFACE, artBaggageCart, artBackdrop, artBug, artDewTank, artFuelFlower, artHangar, artScatter, artGate, artGround, artLawn, artRunway, artSign, artTaxiway, artTerminal, artTower, artWindsock, type ArtLawn, type ArtPiece } from './art';
import { Plane } from './plane';
import { Passengers, type Pax, type Stop } from './passengers';
import { Nav } from './nav';
import { FLEET, ROUTES, ROUTE_LV_MAX, bestPlane, routeFare, routeLvCost, routeOf, type PlaneType, type RouteDef } from './fleet';
import { RouteMap, type RoutePin } from './routeMap';
import { STAFF, STAFF_MAX, buyStaff, staffCost, staffFx, type StaffId } from './staff';
import { UPS, UpMenu, upPrice, type MenuRow, type UpDef } from './upgrades';
import { Events } from './events';
import { Guides, type GuideDef } from './guides';
import { Quests } from './quests';
import { seeThroughAll, setSee } from './seeThrough';
import type { Crowd } from '../devRoom';
import { trash } from '../world/trash';
import { mat, mesh, PAL } from './kit';
import { Weather } from './weather';
import { CHARTER, CharterPanel, PERKS, PERK_FX, SEED, crownMult, crownsFor, earnedFor, perkCost, runEarned, takeCharter, type CharterState } from './charter';
import { writeSave } from '../core/save';
import { distToPath } from './airport/common';
import { Goals, type GoalKind } from './goals';
import type { PlaneInfo } from './flightUi';

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
  /** The walk aboard: the foot of the bridge's ramp, its top, the door (v0.76: on the walkway, not through it). */
  path: THREE.Vector3[];
  fuel: Stack;
  fuelZone: Zone;
  plane: Plane;
  riders: Pax[];
  boarding: Pax[];
  /** Seconds since the first passenger sat down (waiting for more before going). */
  boardT: number;
  /** 🐝 Swap the plane for the upgraded one the next time it's parked and empty. */
  swap?: boolean;
  /** 🎲 …and pick a different aircraft when it does (the mixed fleet). */
  reroll?: boolean;
  open: boolean;
  label: TextSprite;
  /** 🧳 Its BAGS pad: the passengers' seed-bags waiting to be loaded. */
  bags: Stack;
  bagZone: Zone;
  /** 📦 Its CARGO pad (v0.90): crates for the next departure's hold, what makes it up (shown once there's a depot),
   *  and how many crates are in the hold of the plane that's leaving. */
  cargo: Stack;
  cargoZone: Zone;
  cargoParts: THREE.Object3D[];
  cargoAboard: number;
}

/** Where a gate's own link joins the runway: just west of its stand (planes enter and leave there). */
const linkX = (gateX: number) => gateX - 12;

/**
 * Show or put away a piece of the airport. (lod.ts shows whatever the camera can see unless it's marked
 * `userData.hidden`: without that, the unbought café's kitchen and an unbought gate's ladybug popped up.)
 */
function shown(o: THREE.Object3D, on: boolean) {
  o.visible = on;
  o.userData.hidden = !on;
}

/** 🛖 The hangar is the bottle-cap piece at this size (so the biggest aircraft fit inside). */
const HANGAR_SCALE = 1.8;

/** A taxiway: its centre points (x, world z) and half its width. */
interface PathDef {
  pts: THREE.Vector2[];
  hw: number;
  /** Which gate's spur / link it is (-1: its field's main taxiway). */
  gate: number;
  /** 🛫 The field it is on (v0.88). */
  field: FieldDef;
}
/** Where a field's main taxiway runs: from the runway's west end, along the north of its gates. */
const taxiWest = (f: FieldDef) => f.runway.x - f.runway.length / 2 + 6;
const taxiEast = (f: FieldDef) => AT.gates[f.first + GATES_PER_FIELD - 1].x + 8;
/** Every taxiway: for each field, the main one along its gates, then each gate's spur and runway link. */
function airfieldPaths(): PathDef[] {
  const V = (x: number, z: number) => new THREE.Vector2(x, z);
  return FIELDS.flatMap((f) => {
    const rw = f.runway, west = taxiWest(f), east = taxiEast(f);
    return [
      { pts: [V(west, rw.z), V(west, f.taxiZ), V(east, f.taxiZ)], hw: 3.5, gate: -1, field: f },
      ...AT.gates.slice(f.first, f.first + GATES_PER_FIELD).flatMap((g, k) => [
        { pts: [V(g.x, f.taxiZ), V(g.x, g.z - 6)], hw: 3, gate: f.first + k, field: f },
        { pts: [V(linkX(g.x), f.taxiZ), V(linkX(g.x), rw.z)], hw: 3, gate: f.first + k, field: f },
      ]),
    ];
  });
}
const PATHS = airfieldPaths();
/** On a field's runway (or within `pad` of it)? Without a field: on any runway. */
function onRunway(x: number, z: number, pad = 0, field?: FieldDef) {
  return (field ? [field] : FIELDS).some((f) => Math.abs(x - f.runway.x) < f.runway.length / 2 + pad && Math.abs(z - f.runway.z) < f.runway.width / 2 + pad);
}
/** On one of `paths` (or within `pad` of it)? */
function onPaths(x: number, z: number, paths: PathDef[], pad = 0) {
  return paths.some((p) => distToPath(x, z, p.pts) < p.hw + pad);
}

/** One line of the ✈️ flight board. */
export interface FlightRow {
  kind: 'dep' | 'arr';
  /** "AA 104" (or '' while nothing's booked yet). */
  no: string;
  place: string;
  gate: number;
  status: string;
  /** Seconds to go (null = no clock: waiting on you, or done). */
  eta: number | null;
  tone: 'go' | 'warn' | 'info' | 'done';
}

const SIZE = 760;
/** The lawn's square (the ground and the far backdrop go further). */
const LAWN = 470;
/** 🎓 Steps finished by actions (did()). */
const STEP = { nectar: 0, fuel: 1, checkIn: 2, bags: 3, takeoff: 4, cash: 5 } as const;

export class Airfield {
  static MAP_BOUNDS: MapRect = { minX: -110, maxX: 110, minZ: -84, maxZ: 76 };
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(56, 1, 0.3, 900);
  flyers = new Flyers(this.scene);
  player: Player;
  sun = new THREE.DirectionalLight(0xffffff, 2.2);
  /** The sky light (v0.91: the 🌙 day and night turn it, with the sun: tycoon/weather.ts). */
  private hemi = new THREE.HemisphereLight(0xffffff, 0x8d6e4a, 1.6);
  /** 🌙🌧️🌬️ Day and night, rain and wind (v0.91). */
  weather!: Weather;
  private windsock: ArtPiece | null = null;
  private zoneShown = '';
  tiles: UnlockTile[] = [];
  cashPads: CashPad[] = [];
  workers: Worker[] = [];
  bankers: Banker[] = [];
  tutorial: Tutorial;
  /** 📅 The daily goals (start once the tutorial's done). */
  goals: Goals;
  /** 🦎🌧️🪶 Events & visitors (v0.70). */
  events!: Events;
  /** 🎯 The gate whose plane the camera is watching (null = you). Moving cancels it. */
  watch: number | null = null;
  /** 🎯 A spot the camera is looking at instead (an event: the lizard, the feather). Moving cancels it. */
  watchAt: THREE.Vector3 | null = null;
  /** …and it's an event's spot (the camera comes back when the event's over). */
  watchEvent = false;
  /** The selected plane's gate (its flight card is open; a ring glows under it). */
  selected: number | null = null;
  /** Point the camera follows (you, or the plane you're watching): the LOD system measures from here. */
  get focus() {
    const g = this.watch !== null ? this.gates[this.watch] : null;
    return g ? g.plane.pos : this.player.pos;
  }

  private st: TycoonSave;
  private lawn: ArtLawn;
  private pieces: ArtPiece[] = [];
  private blockers: Blocker[] = [];
  /** 🧭 The travellers' way round the blockers (nav.ts). */
  readonly nav = new Nav();
  private flowers: Flower[] = [];
  private gates: Gate[] = [];
  private pax: Passengers;
  private cashPad: CashPad;
  private deskZone: Zone;
  private checkInAnt: CreatureModel | null = null;
  /** 🎧 The Tower ant (clears waiting planes by itself), and who's on the runway right now. */
  private towerAnt: CreatureModel | null = null;
  private runwayUser: (Plane | null)[] = FIELDS.map(() => null);
  /** 🧳 The BAG DROP outside the terminal's airside doorway. */
  private bagDrop!: Stack;
  private bagDropZone!: Zone;
  /** 🧳 (v0.95; Phase 1: "A second bag drop on the north side, so bags for Gates 5 to 8 don't cross the whole field")
   *  The north BAG DROP, what is still in the 🕳️ bag tunnel on its way there, and what shows only once the north field
   *  is open. */
  private bagDropN!: Stack;
  private bagDropNZone!: Zone;
  private tunnel!: Stack;
  private tunnelT = 0;
  private northBagBits: THREE.Object3D[] = [];
  private selRing: THREE.Group;
  private deskSign!: TextSprite;
  private timers = new Map<object, number>();
  private camOffset = new THREE.Vector3(0, 22, 20);
  private thirdFov = 56;
  private idlers: CreatureModel[] = [];

  constructor(private hud: Hud, private sfx: Sfx, public save: SaveData, private progress: Progress) {
    this.st = save.tycoon ??= { v: TYCOON_SAVE_V, fuel: [0, 0], flowers: [4, 0], flights: 0, passengers: 0, x: AT.start.x, z: AT.start.z };
    this.goals = new Goals(this.st, { cafe: () => this.owns('ty-cafe') });
    this.goals.onDayDone = (n, stars, reward, name) => {
      this.addCash(reward);
      this.sfx.contract();
      this.hud.banner(`📅 DAY ${n} DONE! ${'⭐'.repeat(stars)}`, `${name} · +$${reward} bonus · Day ${n + 1} starts now`, 3800);
    };
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
    this.deskZone = new Zone(desk.serve.x, desk.serve.z, 1.4, 1.0);
    const serve = makePad(3.0, 2.2, 'CHECK-IN', '#ffd166');
    serve.position.set(desk.serve.x, desk.serve.y + 0.06, desk.serve.z);
    this.scene.add(serve);
    this.buildBagDrop();

    AT.flowers.forEach((f, i) => this.buildFlower(f.x, f.z, i === 0 || this.owns(`ty-flower${i + 1}`)));
    AT.gates.forEach((g, i) => this.buildGate(g.x, g.z, i, i === 0 || this.owns(`ty-gate${i + 1}`)));
    this.pax = new Passengers(
      this.scene,
      {
        edge: new THREE.Vector3(AT.lawnEdge.x, 0, AT.lawnEdge.z),
        exit: new THREE.Vector3(AT.lawnExit.x, 0, AT.lawnExit.z),
        desk: desk.front,
        lineDir: new THREE.Vector3(0, 0, 1), // (the line runs back along the red carpet, out of the front door)
        gateWait: this.gates.map((g) => g.piece.root.localToWorld(g.piece.spots.gate.clone())),
        inbound: [desk.door],
        outbound: [desk.inside, desk.exit],
        // 🚸 (the north field's gates are over the crossing: out by its south end, back by its north)
        cross: (g) => (g >= GATES_PER_FIELD ? [new THREE.Vector3(AT.crossing.x, 0, AT.crossing.south), new THREE.Vector3(AT.crossing.x, 0, AT.crossing.north)] : []),
      },
      AT.gates.length,
      this.groundY,
    );
    this.pax.gates = this.gates.filter((g) => g.open).length;
    this.pax.onCheckIn = (p) => {
      // (👑 a VIP pays more for the same seat)
      this.bill(this.ticket * (p.vip ? TY.vipTicket : 1), desk.front);
      this.st.passengers++;
      bump('sold');
      this.progress.addXp(TY.xpCheckIn);
      this.sfx.sale();
      this.count('pax', 1);
      // 🧳 their seed-bag goes over the counter and out to the BAG DROP (every passenger has exactly one: check-in
      // waits while the BAG DROP is full, so it never overflows by more than this one)
      const it: StackItem = { mesh: makeItem('seedbag'), type: 'seedbag', value: 0, flying: false };
      it.mesh.position.copy(desk.front).setY(1.5);
      this.scene.add(it.mesh);
      // (🕳️ v0.95: a north gate's bag goes down the bag tunnel by the BAG DROP and comes up at the north BAG DROP)
      this.flyers.pushInto(it, p.gate >= GATES_PER_FIELD && this.fieldOpen(FIELDS[1]) ? this.tunnel : this.bagDrop, 0.8);
      this.tutorial.did(STEP.checkIn);
    };

    this.buildDecor();
    this.buildCafe(desk.cafe);
    this.buildShop(desk.shop);
    this.buildLounge();
    this.buildStaffPad(desk.staff);
    this.buildBins();
    this.buildRecycler();
    this.buildCargo();
    this.events = new Events({
      scene: this.scene,
      camera: this.camera,
      hud,
      sfx,
      player: () => this.player.pos,
      reward: (cash, xp, at, text) => {
        this.addCash(cash);
        this.progress.addXp(xp);
        this.count('earned', cash);
        this.hud.floatAt(at, this.camera, `${text} +$${cash}`, 'big gold');
      },
      level: () => this.save.level,
    });

    // The glowing tiles
    for (const def of TY_UNLOCKS) {
      const t = new UnlockTile(this.scene, def, save.paid[def.id] ?? 0);
      this.tiles.push(t);
    }
    for (const id of save.unlocked) this.applyUnlock(id, false);
    this.refreshTiles(false);

    // (v0.72 migrations: a fleet bought on the old tiles comes with the hangar; the gift shop's old staff level
    // becomes its Faster Restock level)
    if (this.owns('ty-bees') && !this.owns('ty-hangar')) {
      save.unlocked.push('ty-hangar');
      this.applyUnlock('ty-hangar', false);
    }
    if (this.st.staff?.shop) {
      (this.st.ups ??= {})['shop.stock'] = Math.min(6, this.st.staff.shop);
      delete this.st.staff.shop;
    }
    this.buildTargets(desk.door);
    this.refreshTiles(false);

    this.tutorial = new Tutorial(this, hud, save, this.script());
    if (this.st.people) this.setPeople(true, true);
    this.buildGuides();
    // 👀 nothing tall hides your ant (flowers, leaves, signs, walls: seeThrough.ts)
    seeThroughAll(this.scene, [this.player.model.root]);
    hud.setCash(save.cash);
    hud.setZone('🛫 Anthill Airfield');
    // 🌙🌧️🌬️ the sky: day and night, rain, and the wind the planes take off into
    this.weather = new Weather({
      scene: this.scene,
      camera: this.camera,
      sun: this.sun,
      hemi: this.hemi,
      hud,
      ground: this.groundY,
      sock: (yaw) => this.windsock && (this.windsock.root.userData.windYaw = yaw),
    }, this.st.sky);

    // 🎯 The ring under the selected plane (a green target, like a tower's radar pick)
    this.selRing = new THREE.Group();
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x5cff7a, transparent: true, opacity: 0.9, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 48).rotateX(-Math.PI / 2), ringMat);
    this.selRing.add(ring);
    for (let k = 0; k < 4; k++) {
      const tick = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.36), ringMat);
      const a = (k / 4) * Math.PI * 2;
      tick.position.set(Math.sin(a) * 1.18, 0, Math.cos(a) * 1.18);
      tick.rotation.y = a;
      this.selRing.add(tick);
    }
    this.selRing.renderOrder = 3;
    this.selRing.visible = false;
    this.scene.add(this.selRing);
    // (a game whose tutorial is long done starts its 📅 days straight away, and hears what's new once)
    if (!this.learning) this.goals.begin();
    if (!save.paid['ty-v69']) {
      save.paid['ty-v69'] = 1; // (a brand-new game learns it all in the tutorial)
      if (!this.learning) window.setTimeout(() => hud.banner('🆕 New at Anthill Airways!', '🧳 Bags · 🗼 Runway clearance · ✈️ Flight cards · 📅 Daily goals ⭐', 5200), 1500);
    }
    // (v0.91: and the sky, once, for a game that began before it had one)
    if (!save.paid['ty-v91']) {
      save.paid['ty-v91'] = 1;
      if (!this.learning) window.setTimeout(() => hud.banner('🆕 The sky is new!', '🌙 Night flights pay +25% · 🌧️ rain, then a 🌈 rainbow +50% · 🌬️ the wind turns the runways', 6000), 1500);
    }
  }

  /** 🛫 Is this field built? (The first always; the north field with Gate 5.) */
  private fieldOpen(f: FieldDef) {
    return !f.unlock || this.owns(f.unlock);
  }
  /** How high the surface is at (x, z): the runway and taxiways are raised a little above the dirt. */
  groundY = (x: number, z: number) => {
    // inside the 🐚 terminal: its floor (a fan 22 from the hinge, ±60°, the hinge 11 behind its centre)
    const lx = x - AT.terminal.x;
    const lz = z - AT.terminal.z + 11;
    if (lz > 0 && Math.hypot(lx, lz) < 21 && Math.abs(Math.atan2(lx, lz)) < Math.PI / 3) return 0.5;
    // (🛫 each field that is built: its runway, its main taxiway, its gates' spurs and links)
    for (const f of FIELDS) {
      if (!this.fieldOpen(f)) continue;
      const rw = f.runway;
      if (Math.abs(x - rw.x) < rw.length / 2 && Math.abs(z - rw.z) < rw.width / 2) return SURFACE.runway;
      const west = taxiWest(f), east = taxiEast(f);
      const onTaxi =
        (Math.abs(z - f.taxiZ) < 3.5 && x > west - 3.5 && x < east + 3.5) ||
        (Math.abs(x - west) < 3.5 && z < f.taxiZ && z > rw.z) ||
        AT.gates.slice(f.first, f.first + GATES_PER_FIELD).some((g) => (Math.abs(x - g.x) < 3 && z > f.taxiZ && z < g.z - 6) || (Math.abs(x - linkX(g.x)) < 3 && z < f.taxiZ && z > rw.z));
      if (onTaxi) return SURFACE.taxiway;
    }
    return 0;
  };

  // --------------------------------------------------------------------------
  // Building the world
  // --------------------------------------------------------------------------
  private buildEnvironment() {
    const s = this.scene;
    s.background = new THREE.Color(PAL.sky);
    s.fog = new THREE.Fog(PAL.sky, 220, 620);
    s.add(this.hemi);
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
    // (v0.90, a fault found and fixed: WHAT LIES ABOUT IS DEALT AS IT WAS BEFORE THE NORTH FIELD. Each piece's size
    // and kind goes by its place in the deal, so one more spot ruled out, anywhere, reshuffled every pebble and
    // leaf on the airfield: v0.88 and v0.89 had a boulder and a fallen leaf by Gate 3 that had been a small stone.
    // So the deal is ruled by what stood before v0.88, to the letter, and whatever has been built since then
    // HIDES the pieces that would lie on it: the north field, the crossing, the newer tiles, the cargo depot.)
    const first = FIELDS[0], firstPaths = PATHS.filter((p) => p.field === first);
    const dealtTiles = TY_UNLOCKS.slice(0, TY_UNLOCKS.findIndex((u) => u.id === 'ty-bags3') + 1), newerTiles = TY_UNLOCKS.slice(dealtTiles.length);
    const busy = (x: number, z: number) =>
      Math.abs(z - first.runway.z) < 16 ||
      Math.abs(z - first.taxiZ) < 7 ||
      Math.hypot(x - AT.terminal.x, z - AT.terminal.z) < 34 ||
      Math.hypot(x - AT.nest.x, z - AT.nest.z) < 16 ||
      AT.gates.slice(0, GATES_PER_FIELD).some((g) => Math.abs(x - g.x) < 12 && z > g.z - 30 && z < g.z + 8) ||
      AT.flowers.slice(0, 2).some((f) => Math.hypot(x - f.x, z - f.z) < 10) ||
      Math.hypot(x - AT.recycler.x, z - AT.recycler.z) < 11 ||
      Math.hypot(x - AT.hangar.x, z - AT.hangar.z) < 19 ||
      AT.bins.some((b) => Math.hypot(x - b.x, z - b.z) < 6) ||
      dealtTiles.some((u) => Math.hypot(x - u.pos[0], z - u.pos[1]) < 8) ||
      !CLEARINGS_FIRST.some((c) => Math.hypot(x - c.x, z - c.z) < c.r - 4);
    const built = (x: number, z: number) =>
      z < AT.runway.z - 12 || // (🛫 the north field's apron: planes and travellers use all of it)
      (Math.abs(x - AT.crossing.x) < 10 && z < -10) || // (🚸 the way to the crossing)
      Math.hypot(x - AT.cargo.x, z - AT.cargo.z) < 13 || // (📦 the depot and its dock)
      newerTiles.some((u) => Math.hypot(x - u.pos[0], z - u.pos[1]) < 8);
    const area = { x: 0, z: 0, w: 240, d: 190 };
    // (and off every taxiway: no stones lying out on a path; a fallen leaf is big, so it stays well clear)
    // 🪨 (v0.92.1) a stone taller than a knee, and every twig, is solid: you and the travellers go round it, not
    // through it. (A fallen leaf lies flat: it's walked over.)
    const pebble = (x: number, z: number, sc: [number, number, number]) => {
      if (sc[1] < SOLID_PEBBLE) return;
      const r = Math.max(sc[0], sc[2]) * 0.42;
      this.blockers.push({ minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r });
    };
    artScatter(s, 'pebbles', area, 46, (x, z) => busy(x, z) || onPaths(x, z, firstPaths, 3), 3, built, pebble);
    // 🍂 (v0.95) the big leaf south of Gate 3 (at 24, 0) is hidden, as a built tile hides one: the deal is as it was.
    const leafGone = (x: number, z: number) => built(x, z) || Math.hypot(x - 24, z) < 4;
    artScatter(s, 'leaves', area, 30, (x, z) => busy(x, z) || onPaths(x, z, firstPaths, 10) || onRunway(x, z, 10, first), 4, leafGone);
    // (twigs are long: only out by the edge, where they can't lie across a tile or a path)
    const twig = (x: number, z: number, sc: [number, number, number], yaw: number) =>
      this.blockers.push(...along(x, z, yaw, sc[0], sc[0] * 0.05 + 0.2));
    artScatter(s, 'twigs', area, 8, (x, z) => busy(x, z) || Math.hypot(x, z - 10) < 70, 5, built, twig);
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

  /** Put a piece in the world. `solid` = its walls block you now (a gate not bought yet: only once it opens). */
  private place(p: ArtPiece, x: number, z: number, ry = 0, solid = true) {
    p.root.position.set(x, 0, z);
    p.root.rotation.y = ry;
    this.scene.add(p.root);
    p.root.updateMatrixWorld(true);
    const walls: Blocker[] = p.blockers.map((b) => {
      // (blockers are local: turn their corners into the world)
      const c = [new THREE.Vector3(b.minX, 0, b.minZ), new THREE.Vector3(b.maxX, 0, b.maxZ)].map((v) => p.root.localToWorld(v));
      return { minX: Math.min(c[0].x, c[1].x), maxX: Math.max(c[0].x, c[1].x), minZ: Math.min(c[0].z, c[1].z), maxZ: Math.max(c[0].z, c[1].z) };
    });
    p.root.userData.walls = walls;
    if (solid) this.blockers.push(...walls);
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

  /**
   * The runway, the taxiway along the north of the gates (joining the runway's west end), and for each gate a spur
   * up to its stand and its own short link onto the runway (planes take off and turn off there: quick turnarounds).
   * Only the BORDERS are edged with stones: wherever two paths meet (or a link meets the runway) the junction is
   * left open, like a real airfield (v0.69). The runway and the main taxiway leave openings only for gates that
   * are open, so they're rebuilt when a gate is bought (buildPaved).
   */
  private buildRunway() {
    this.buildPaved();
    PATHS.filter((p) => p.gate >= 0).forEach((path) => {
      const others = PATHS.filter((p) => p !== path);
      const piece = this.place(
        artTaxiway(path.pts, path.hw * 2, {
          keepClear: (x, z) => onRunway(x, z, 1) || onPaths(x, z, others, 1),
          noDash: (x, z) => onRunway(x, z, 0.5),
        }),
        0,
        0,
      );
      (this.gateRoads[path.gate] ??= []).push(piece.root);
    });
    AT.gates.forEach((g, i) => {
      // 🗼 the HOLD line across the link: two solid + two dashed yellow petal stripes (planes wait behind it)
      const rw = fieldOf(i).runway;
      const hold = new THREE.Group();
      const yellow = mat(0xffd24a, { rough: 0.6 });
      const z0 = rw.z + rw.width / 2 + 0.2;
      for (const [dz, dashed] of [[0, false], [0.45, false], [1.1, true], [1.55, true]] as const) {
        for (let k = 0; k < (dashed ? 4 : 1); k++) {
          const w = dashed ? 0.9 : 5.4;
          const bar = mesh(new THREE.BoxGeometry(w, 0.05, 0.22), yellow, false);
          bar.position.set(linkX(g.x) + (dashed ? -2.2 + k * 1.45 : 0), SURFACE.taxiway + 0.03, z0 + dz);
          hold.add(bar);
        }
      }
      this.scene.add(hold);
      this.gateRoads[i].push(hold);
    });
    this.buildCrossing();
  }

  /**
   * 🚸 The crossing (v0.88): white petal stripes over the first field's taxiway and runway, west of Gate 1's link,
   * where travellers (and you) walk over to the north field. Shown once the north field is built.
   */
  private crossing = new THREE.Group();
  private buildCrossing() {
    const c = AT.crossing, white = mat(0xf4f1e6, { rough: 0.7 });
    for (let z = c.south - 1; z >= c.north + 1; z -= 2.2) {
      const on = onRunway(c.x, z, 0, FIELDS[0]) ? SURFACE.runway : Math.abs(z - FIELDS[0].taxiZ) < 3.5 ? SURFACE.taxiway : 0;
      const bar = mesh(new THREE.BoxGeometry(5, 0.05, 1.1), white, false);
      bar.position.set(c.x, on + 0.04, z);
      this.crossing.add(bar);
    }
    this.scene.add(this.crossing);
    shown(this.crossing, this.fieldOpen(FIELDS[1]));
  }

  /** 🧳 The BAG DROP: a pad just outside the terminal's airside doorway, where checked-in bags pile up. */
  private buildBagDrop() {
    const { x, z } = AT.bagDrop;
    const pad = makePad(3.4, 3.4, 'BAG DROP', '#5fb4ff');
    pad.position.set(x, 0.05, z);
    this.scene.add(pad);
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    this.scene.add(g);
    this.bagDrop = new Stack(g, gridLayout(4, 4, 0.7, 0.62, 0.08), TY.bagDropMax);
    this.bagDropZone = new Zone(x, z, 1.7, 1.7);
    const label = new TextSprite(1.0, '#8fd3ff');
    label.setText('🧳 BAG DROP');
    label.sprite.position.set(x, 3.6, z);
    this.scene.add(label.sprite);
    // 🕳️ (v0.95) the bag tunnel's mouth beside it, and the north BAG DROP where it comes up (shown with the north field)
    const hole = (hx: number, hz: number) => {
      const h = new THREE.Group();
      h.position.set(hx, 0, hz);
      const rim = mesh(new THREE.CylinderGeometry(1.05, 1.3, 0.35, 16), mat(0x9a6a40, { rough: 1, flat: true }));
      rim.position.y = 0.17;
      const pit = mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.05, 16), mat(0x1c120a, { rough: 1 }), false);
      pit.position.y = 0.36;
      h.add(rim, pit);
      this.scene.add(h);
      return h;
    };
    const T = AT.tunnel;
    const mouth = hole(x + T.x, z + T.z);
    const tsign = new TextSprite(0.8, '#e8c9a0');
    tsign.setText('🧳 TO NORTH');
    tsign.sprite.position.set(x + T.x, 2.4, z + T.z);
    this.scene.add(tsign.sprite);
    const tg = new THREE.Group();
    tg.position.set(x + T.x, -1, z + T.z); // (in it: out of sight)
    this.scene.add(tg);
    this.tunnel = new Stack(tg, (_i, _t, out) => out.set(0, 0, 0), 99);
    const N = AT.bagDropNorth;
    const npad = makePad(3.4, 3.4, 'BAG DROP', '#5fb4ff');
    npad.position.set(N.x, 0.05, N.z);
    this.scene.add(npad);
    const ng = new THREE.Group();
    ng.position.set(N.x, 0, N.z);
    this.scene.add(ng);
    this.bagDropN = new Stack(ng, gridLayout(4, 4, 0.7, 0.62, 0.08), TY.bagDropMax);
    this.bagDropNZone = new Zone(N.x, N.z, 1.7, 1.7);
    const nlabel = new TextSprite(1.0, '#8fd3ff');
    nlabel.setText('🧳 NORTH BAGS');
    nlabel.sprite.position.set(N.x, 3.6, N.z);
    this.scene.add(nlabel.sprite);
    const exitHole = hole(N.x + T.x, N.z + T.z);
    this.northBagBits = [mouth, tsign.sprite, npad, nlabel.sprite, exitHole];
    for (const o of this.northBagBits) shown(o, this.fieldOpen(FIELDS[1]));
  }

  /** 🕳️ The bag tunnel: a bag at a time comes up at the north BAG DROP (when there's room on it). GAME TUNING: 0.6 s. */
  private stepTunnel(dt: number) {
    if ((this.tunnelT -= dt) > 0) return;
    if (!this.tunnel.canPop() || this.bagDropN.full) return;
    this.tunnelT = 0.6;
    const it = this.tunnel.pop()!;
    it.mesh.removeFromParent();
    const up = this.bagDropN.addInstant('seedbag');
    this.flyers.grow(up.mesh, 0.3);
  }
  /** Each gate's spur + runway link (hidden until the gate is bought). */
  private gateRoads: THREE.Object3D[][] = [];

  /** Each field's runway + main taxiway, and which gates' junctions they were built open for. */
  private paved: ArtPiece[][] = FIELDS.map(() => []);
  private pavedFor: string[] = FIELDS.map(() => '');
  /** (Re)build each built field's runway and main taxiway with an opening at each OPEN gate's link and spur. */
  private buildPaved() {
    FIELDS.forEach((f, k) => {
      const open = AT.gates.map((_, i) => i === 0 || this.owns(`ty-gate${i + 1}`));
      const mine = PATHS.filter((p) => p.field === f);
      // 🚸 (the first field's borders are left open where the crossing goes over them, once there is a north field)
      const cross = k === 0 && this.fieldOpen(FIELDS[1]);
      const onCross = (x: number) => cross && Math.abs(x - AT.crossing.x) < 3.4;
      const key = this.fieldOpen(f) ? mine.filter((p) => p.gate >= 0).map((p) => (open[p.gate] ? 1 : 0)).join('') + (cross ? 'x' : '') : 'none';
      if (key === this.pavedFor[k]) return;
      this.pavedFor[k] = key;
      for (const p of this.paved[k]) p.root.removeFromParent();
      this.paved[k] = [];
      if (!this.fieldOpen(f)) return;
      const rw = f.runway;
      const main = mine[0];
      const joining = mine.filter((p) => p.gate >= 0 && open[p.gate]);
      const runway = artRunway(rw.length, rw.width, (x, z) => onCross(x + rw.x) || onPaths(x + rw.x, z + rw.z, [main, ...joining], 1));
      runway.root.position.set(rw.x, 0, rw.z);
      const taxi = artTaxiway(main.pts, main.hw * 2, {
        keepClear: (x, z) => onCross(x) || onRunway(x, z, 1, f) || onPaths(x, z, joining, 1),
        noDash: (x, z) => onRunway(x, z, 0.5, f),
      });
      this.paved[k] = [runway, taxi];
      for (const p of this.paved[k]) this.scene.add(p.root);
    });
  }

  /**
   * 🐚 The terminal: the main LOBBY (v0.68.3). Passengers come in through the front door, line up along the red
   * carpet, check in at the shell's pebble counter (you, or the Check-in ant, stand BEHIND it), stop at the 🍪 café
   * (once it's open) and leave through the airside doorway in the right wall, toward the gates.
   */
  private buildTerminal() {
    const T = AT.terminal;
    const t = this.place(artTerminal(), T.x, T.z);
    const at = (x: number, y: number, z: number) => t.root.localToWorld(new THREE.Vector3(x, y, z));
    const door = this.worldSpot(t, 'door', at(0, 0, 13.5));
    const front = this.worldSpot(t, 'counter', at(0, 0.5, -0.6));
    const sign = new TextSprite(1.3, '#ffffff');
    this.deskSign = sign;
    sign.setText('🎫 CHECK-IN');
    sign.sprite.position.copy(at(0, 7.5, -3));
    (sign.sprite.material as THREE.SpriteMaterial).depthTest = false; // (readable through the roof)
    sign.sprite.renderOrder = 5;
    this.scene.add(sign.sprite);
    return {
      /** where the front of the line stands (in front of the counter) */
      front,
      /** where you / the Check-in ant stand: behind the counter */
      serve: at(0, 0.5, -5.7),
      /** outside the front door (newcomers walk here first) */
      door: door.clone().add(new THREE.Vector3(0, 0, 3)),
      /** inside, past the counter's end, then out the airside doorway */
      inside: at(8, 0.5, -0.4),
      exit: this.worldSpot(t, 'exit', at(12.6, 0.5, -5.3)).add(new THREE.Vector3(2, 0, 0)),
      cash: door.clone().add(new THREE.Vector3(-7, 0, 7)),
      cafe: at(AT.cafeLocal.x, 0.5, AT.cafeLocal.z),
      shop: at(AT.shopLocal.x, 0.5, AT.shopLocal.z),
      staff: at(AT.staffLocal.x, 0.5, AT.staffLocal.z),
    };
  }

  // --------------------------------------------------------------------------
  // 🍪 The Nectar Café (bought): picnic crumbs -> the kitchen's oven (outside the west wall) -> snacks pass
  // through a hatch onto the café counter inside -> passengers buy one on the way to their gate.
  // --------------------------------------------------------------------------
  private cafe!: { pile: ResourcePile; oven: Bakery; shelf: Stack; parts: THREE.Object3D[]; spot: THREE.Vector3; chef: CreatureModel | null };
  private buildCafe(at: THREE.Vector3) {
    const pile = new ResourcePile(this.scene, AT.crumbs.x, AT.crumbs.z, this.flyers, 'crumb', 'bread');
    pile.spawnEvery = () => 2.2;
    // a big picnic crust lying behind the pile (where the crumbs come from)
    const crust = new THREE.Group();
    crust.position.set(AT.crumbs.x - 1, 0, AT.crumbs.z - 9);
    const bread = mesh(new THREE.CapsuleGeometry(4, 9, 6, 14).rotateZ(Math.PI / 2).scale(1, 0.55, 1), mat(0xe8b86a, { rough: 0.9 }));
    bread.position.y = 2.2;
    const top = mesh(new THREE.CapsuleGeometry(4.1, 9, 6, 14).rotateZ(Math.PI / 2).scale(1, 0.2, 1.02), mat(0xa8622a, { rough: 0.85 }));
    top.position.y = 4.1;
    crust.add(bread, top);
    crust.rotation.y = 0.4;
    this.scene.add(crust);
    // (🍞 v0.92.1: and it's solid: a row of boxes along it, so nobody walks through the bread)
    this.blockers.push(...along(crust.position.x, crust.position.z, crust.rotation.y, 17, 3.7));
    const crumbSign = new TextSprite(1.0, '#ffd166');
    crumbSign.setText('🧺 PICNIC CRUMBS');
    crumbSign.sprite.position.set(AT.crumbs.x, 8, AT.crumbs.z - 4);
    this.scene.add(crumbSign.sprite);

    const oven = new Bakery(this.scene, AT.oven.x, AT.oven.z, this.flyers, { ...OVEN, label: '🍪 KITCHEN' });

    // the café counter inside the shell: a little round pebble bar with the snacks on top
    const bar = new THREE.Group();
    bar.position.copy(at);
    const top2 = mesh(new THREE.CylinderGeometry(2.6, 2.4, 1.6, 22), mat(0xd9566a, { rough: 0.6 }));
    top2.position.y = 0.8;
    const lip = mesh(new THREE.TorusGeometry(2.6, 0.18, 8, 26).rotateX(Math.PI / 2), mat(0xffd166, { rough: 0.4, metal: 0.3 }));
    lip.position.y = 1.6;
    bar.add(top2, lip);
    this.scene.add(bar);
    const shelf = new Stack(bar, gridLayout(3, 2, 0.62, 0.62, 1.65, 0, 0), 6);
    const cafeSign = new TextSprite(1.1, '#ffd166');
    cafeSign.setText('🍪 NECTAR CAFÉ');
    cafeSign.sprite.position.copy(at).setY(6.5);
    (cafeSign.sprite.material as THREE.SpriteMaterial).depthTest = false;
    cafeSign.sprite.renderOrder = 5;
    this.scene.add(cafeSign.sprite);

    this.cafe = { pile, oven, shelf, parts: [pile.group, crust, crumbSign.sprite, oven.group, bar, cafeSign.sprite], spot: at.clone().add(new THREE.Vector3(0, 0, 3.4)), chef: null };
    for (const o of this.cafe.parts) shown(o, false);
  }

  /** The café opens: show it, let the walls block, and send passengers past it. */
  private openCafe(animate: boolean) {
    const c = this.cafe;
    for (const o of c.parts) {
      shown(o, true);
      if (animate) this.flyers.grow(o);
    }
    this.blockers.push(c.oven.blocker, { minX: c.spot.x - 2.6, maxX: c.spot.x + 2.6, minZ: c.spot.z - 6, maxZ: c.spot.z - 1 });
    this.addStop({
      key: 'cafe',
      spot: c.spot,
      who: () => true,
      maxWait: TY.cafeWait,
      has: () => c.shelf.count > 0,
      buy: (p) => {
        const it = c.shelf.pop();
        if (!it) return;
        this.flyers.fly(it.mesh, () => p.pos.clone().setY(p.pos.y + 1), () => it.mesh.removeFromParent(), 0.3, 0.6);
        this.bill(TY.snackPrice + this.up('cafe.price'), c.spot);
        this.dropLitter(p.pos);
        this.count('snacks', 1);
        this.progress.addXp(1);
        this.sfx.sale();
      },
    });
    this.cafeOpen = true;
  }
  private cafeOpen = false;

  /** A new stop for passengers (kept in visiting order: 🍪 café, 🎁 shop, 👑 lounge). */
  private addStop(s: Stop) {
    const order = ['cafe', 'shop', 'lounge'];
    this.pax.stops = [...this.pax.stops.filter((x) => x.key !== s.key), s].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  }

  // --------------------------------------------------------------------------
  // 🎁 The Pollen Gift Shop (v0.70): a round counter inside the terminal, right of the line. It makes a pollen sweet
  // every few seconds; passengers stop on their way through and buy one.
  // --------------------------------------------------------------------------
  private shop!: { shelf: Stack; parts: THREE.Object3D[]; spot: THREE.Vector3; t: number; open: boolean };
  private buildShop(at: THREE.Vector3) {
    const bar = new THREE.Group();
    bar.position.copy(at);
    const top = mesh(new THREE.CylinderGeometry(2.3, 2.1, 1.6, 22), mat(0x8e5ad9, { rough: 0.6 }));
    top.position.y = 0.8;
    const lip = mesh(new THREE.TorusGeometry(2.3, 0.18, 8, 26).rotateX(Math.PI / 2), mat(0xffd166, { rough: 0.4, metal: 0.3 }));
    lip.position.y = 1.6;
    // a pollen-ball "awning" post with a sunflower top
    const post = mesh(new THREE.CylinderGeometry(0.15, 0.15, 3.4, 8), mat(0x5b8a3a, { rough: 0.8 }));
    post.position.set(1.6, 2.6, -0.8);
    const bloom = mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.2, 14).rotateX(Math.PI / 2.4), mat(0xffcf3a, { rough: 0.6 }));
    bloom.position.set(1.6, 4.4, -0.8);
    bar.add(top, lip, post, bloom);
    this.scene.add(bar);
    const shelf = new Stack(bar, gridLayout(3, 2, 0.62, 0.62, 1.65, -0.3, 0), TY.shopMax);
    const sign = new TextSprite(1.1, '#e6c8ff');
    sign.setText('🎁 GIFT SHOP');
    sign.sprite.position.copy(at).setY(6.5);
    (sign.sprite.material as THREE.SpriteMaterial).depthTest = false;
    sign.sprite.renderOrder = 5;
    this.scene.add(sign.sprite);
    this.shop = { shelf, parts: [bar, sign.sprite], spot: at.clone().add(new THREE.Vector3(-3.5, 0, 0)), t: 0, open: false };
    for (const o of this.shop.parts) shown(o, false);
  }

  private openShop(animate: boolean) {
    const s = this.shop;
    s.open = true;
    for (const o of s.parts) {
      shown(o, true);
      if (animate) this.flyers.grow(o);
    }
    this.blockers.push({ minX: s.spot.x + 1.2, maxX: s.spot.x + 5.8, minZ: s.spot.z - 2.3, maxZ: s.spot.z + 2.3 });
    this.addStop({
      key: 'shop',
      spot: s.spot,
      who: () => true,
      maxWait: 2,
      has: () => s.shelf.count > 0,
      buy: (p) => {
        const it = s.shelf.pop();
        if (!it) return;
        this.flyers.fly(it.mesh, () => p.pos.clone().setY(p.pos.y + 1), () => it.mesh.removeFromParent(), 0.3, 0.6);
        this.bill(TY.shopPrice + this.up('shop.price'), s.spot);
        this.dropLitter(p.pos);
        this.progress.addXp(1);
        this.sfx.sale();
      },
    });
  }

  // --------------------------------------------------------------------------
  // 👑 The VIP Lounge (v0.70): a leaf sofa on a red carpet with golden rope posts. Once it's open, some travellers
  // are VIPs (golden, with a crown): they pay ×3 for their ticket, relax here for a moment (a lounge fee), then
  // board first.
  // --------------------------------------------------------------------------
  private lounge!: { parts: THREE.Object3D[]; spot: THREE.Vector3; open: boolean };
  private buildLounge() {
    const { x, z } = AT.lounge;
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const carpet = mesh(new THREE.BoxGeometry(6, 0.08, 12), mat(0xc0392b, { rough: 0.9 }), false);
    carpet.position.set(0, 0.04, 1);
    const sofa = mesh(new THREE.CapsuleGeometry(1.3, 6, 6, 12).rotateZ(Math.PI / 2).scale(1, 0.7, 1), mat(0x4f9a3a, { rough: 0.7 }));
    sofa.position.set(0, 1.0, -4.4);
    const back = mesh(new THREE.CapsuleGeometry(0.9, 6.4, 6, 12).rotateZ(Math.PI / 2), mat(0x3f8a2e, { rough: 0.7 }));
    back.position.set(0, 2.2, -5.4);
    g.add(carpet, sofa, back);
    const gold = mat(0xffd166, { rough: 0.35, metal: 0.5 });
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1.4]) {
        const post = mesh(new THREE.CylinderGeometry(0.16, 0.2, 2.2, 8), gold);
        post.position.set(sx * 3.4, 1.1, sz * 3.4);
        const knob = mesh(new THREE.SphereGeometry(0.3, 10, 8), gold);
        knob.position.set(sx * 3.4, 2.3, sz * 3.4);
        g.add(post, knob);
      }
    }
    this.scene.add(g);
    const sign = new TextSprite(1.1, '#ffd166');
    sign.setText('👑 VIP LOUNGE');
    sign.sprite.position.set(x, 6, z - 3);
    this.scene.add(sign.sprite);
    this.lounge = { parts: [g, sign.sprite], spot: new THREE.Vector3(x, 0, z - 2.2), open: false };
    for (const o of this.lounge.parts) shown(o, false);
  }

  private openLounge(animate: boolean) {
    const l = this.lounge;
    l.open = true;
    for (const o of l.parts) {
      shown(o, true);
      if (animate) this.flyers.grow(o);
    }
    this.blockers.push({ minX: l.spot.x - 4, maxX: l.spot.x + 4, minZ: l.spot.z - 4.4, maxZ: l.spot.z - 1.4 });
    this.pax.vipChance = TY.vipShare;
    this.addStop({
      key: 'lounge',
      spot: l.spot,
      who: (p) => p.vip,
      maxWait: TY.loungeSecs + 1,
      // (a VIP relaxes for a moment, then pays the lounge fee and heads for the gate)
      has: (p) => p.stopT >= TY.loungeSecs,
      buy: () => {
        this.bill(TY.loungeFee + 3 * this.up('lounge.fee'), l.spot);
        this.progress.addXp(2);
      },
    });
  }

  // --------------------------------------------------------------------------
  // ⬆️ STAFF upgrades (v0.70): near the manager in the terminal, tap the ⬆️ button: a row per hired job.
  // --------------------------------------------------------------------------
  private padHintT = 0;
  /** The STAFF OFFICE: a pad behind the counter, left of the check-in ant, with the manager ant up on the counter. */
  private staffAt = new THREE.Vector3();
  private buildStaffPad(at: THREE.Vector3) {
    this.staffAt.copy(at);
    const label = new TextSprite(0.9, '#7df9a0');
    label.setText('⬆️ STAFF OFFICE');
    label.sprite.position.set(at.x - 2.5, 5.4, at.z - 2);
    (label.sprite.material as THREE.SpriteMaterial).depthTest = false; // (readable through the roof)
    label.sprite.renderOrder = 5;
    this.scene.add(label.sprite);
    // the manager ant: up on the end of the counter, looking down at the pad
    const boss = spawnCreature('worker', 1.8) ?? makeAnt(0x8e2f14);
    boss.root.position.set(at.x - 1.2, at.y + 1.25, at.z + 2.7);
    boss.root.rotation.y = Math.PI;
    titleTag(boss, '⬆️ MANAGER', TITLE.ant);
    this.scene.add(boss.root);
    this.idlers.push(boss);
    this.staffAt.set(boss.root.position.x, 0, boss.root.position.z); // (the office is wherever the manager is)
  }

  // --------------------------------------------------------------------------
  // 🗑️ Trash bins (v0.71): stand on one to toss what you don't want ($1 a piece: world/trash.ts, 100 pieces every
  // 5 minutes; never seed-bags, they're luggage). Once the ♻️ Recycler is open, passengers put their snack and
  // sweet wrappers (leaves) in the bins: stand on a bin to pick the wrappers up and carry them to the recycler.
  // --------------------------------------------------------------------------
  private bins: { bin: TrashBin; litter: Stack; label: TextSprite }[] = [];
  private buildBins() {
    for (const b of AT.bins) {
      const bin = new TrashBin(this.scene, b.x, b.z);
      const g = new THREE.Group();
      g.position.set(b.x + 1.7, 0, b.z - 1.5);
      this.scene.add(g);
      const litter = new Stack(g, gridLayout(2, 2, 0.5, 0.5, 0.06), TY.binMax);
      const label = new TextSprite(0.8, '#c9d1d9');
      label.setText('🗑️');
      label.sprite.position.set(b.x, 3.4, b.z - 1.7);
      this.scene.add(label.sprite);
      this.bins.push({ bin, litter, label });
      this.blockers.push({ minX: b.x - 0.8, maxX: b.x + 0.8, minZ: b.z - 2.5, maxZ: b.z - 0.95 });
    }
  }
  /** A passenger's wrapper goes into the nearest bin with room (once there's a recycler to take it to). */
  private dropLitter(from: THREE.Vector3) {
    if (!this.recycler.open) return;
    const open = this.bins.filter((b) => !b.litter.full);
    if (!open.length) return;
    const b = open.reduce((a, c) => (Math.hypot(c.bin.zone.x - from.x, c.bin.zone.z - from.z) < Math.hypot(a.bin.zone.x - from.x, a.bin.zone.z - from.z) ? c : a));
    const it: StackItem = { mesh: makeItem('leaf'), type: 'leaf', value: 0, flying: false };
    it.mesh.position.copy(from).setY(1.5);
    this.scene.add(it.mesh);
    this.flyers.pushInto(it, b.litter, 0.9);
  }

  // --------------------------------------------------------------------------
  // ♻️ The Recycler (v0.71, a tile): a seed-husk machine. Drop things on its IN pad: every 3 nectar become one drop
  // of JET FUEL on its OUT pad (one drop on a FUEL pad fuels a whole flight; Fuel Runners fetch it too), and
  // anything else (crumbs, sweets, wrappers) pays cash onto the cash pad.
  // --------------------------------------------------------------------------
  // --------------------------------------------------------------------------
  // 📦 CARGO (v0.90; Joshua, of the five ideas for a maxed-out airport: "I do like all 5", this one third).
  // The depot packs a crate every few seconds onto its dock. Carried to a gate's CARGO pad (by you, or a Cargo
  // ant), the crates go into the hold of that gate's next departure, as many as the plane carries (half its seats,
  // rounded up), and are paid for as it lifts off: a crate's price × the route's fare. A plane never waits for cargo.
  // --------------------------------------------------------------------------
  private cargoDepot!: { parts: THREE.Object3D[]; stock: Stack; zone: Zone; t: number; open: boolean };
  /** 💵 A crate's price now, and how many crates gate `g`'s plane carries. */
  private get cargoPrice() {
    return TY.cargoPrice + 2 * this.up('cargo.price');
  }
  private cargoCap(g: Gate) {
    return Math.min(TY.cargoPadMax, Math.ceil(g.plane.model.seats.length / 2));
  }
  private buildCargo() {
    const { x, z } = AT.cargo;
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    // a twig pallet deck, crates stacked along its back, and a leaf awning on two twig posts
    const wood = mat(0xb98a55, { rough: 0.8 }), dark = mat(0x8a6238, { rough: 0.85 }), tape = mat(0xe9dfc6, { rough: 0.7 });
    const deck = mesh(new THREE.BoxGeometry(7.6, 0.36, 5), wood);
    deck.position.y = 0.18;
    g.add(deck);
    for (const dz of [-1.6, 0, 1.6]) {
      const slat = mesh(new THREE.BoxGeometry(7.7, 0.08, 0.16), dark, false);
      slat.position.set(0, 0.38, dz);
      g.add(slat);
    }
    const crate = (cx: number, cy: number, cz: number, s: number, ry: number) => {
      const c = mesh(new THREE.BoxGeometry(s, s, s), wood);
      c.position.set(cx, 0.36 + cy + s / 2, cz);
      c.rotation.y = ry;
      const band = mesh(new THREE.BoxGeometry(s + 0.04, s * 0.16, s + 0.04), tape, false);
      c.add(band);
      g.add(c);
    };
    crate(-2.6, 0, -1.4, 1.5, 0.1); crate(-0.9, 0, -1.5, 1.3, -0.15); crate(0.7, 0, -1.4, 1.5, 0.05); crate(-1.7, 1.45, -1.4, 1.2, 0.3); crate(-2.7, 0, 0.5, 1.1, -0.2);
    for (const px of [-3.4, 3.4]) {
      const post = mesh(new THREE.CylinderGeometry(0.14, 0.18, 4.6, 7), dark);
      post.position.set(px, 2.3, -2.2);
      g.add(post);
    }
    const awning = mesh(new THREE.SphereGeometry(1, 14, 8).scale(4.3, 0.14, 2.4), mat(0x6fb24a, { rough: 0.7 }));
    awning.position.set(0, 4.5, -1.2);
    awning.rotation.x = 0.22;
    g.add(awning);
    const pad = makePad(3, 2.6, 'OUT 📦', '#d39a4a');
    pad.position.set(2.2, 0.42, 1.0);
    const dock = new THREE.Group();
    dock.position.set(2.2, 0.38, 0.6);
    g.add(pad, dock);
    this.scene.add(g);
    const sign = new TextSprite(1.0, '#f2c98a');
    sign.setText('📦 CARGO DEPOT');
    sign.sprite.position.set(x, 6.4, z);
    this.scene.add(sign.sprite);
    const stock = new Stack(dock, gridLayout(3, 2, 0.7, 0.62, 0.06), TY.cargoMax);
    for (let n = 0; n < (this.st.cargo ?? 0); n++) stock.addInstant('parcel');
    // (you stand in front of the deck, by the dock)
    this.cargoDepot = { parts: [g, sign.sprite], stock, zone: new Zone(x + 2.2, z + 3.6, 1.6, 1.2), t: 0, open: false };
    for (const o of this.cargoDepot.parts) shown(o, false);
  }
  private openCargo(animate: boolean) {
    const c = this.cargoDepot;
    c.open = true;
    for (const o of c.parts) {
      shown(o, true);
      if (animate) this.flyers.grow(o);
    }
    for (const g of this.gates) for (const o of g.cargoParts) shown(o, g.open);
    this.blockers.push({ minX: AT.cargo.x - 3.9, maxX: AT.cargo.x + 3.9, minZ: AT.cargo.z - 2.6, maxZ: AT.cargo.z + 2.6 });
  }
  /** 📦 The depot's dock -> the open gate with the most room on its CARGO pad (nothing to carry: wait at the dock). */
  private idleCargo = new Stack(new THREE.Group(), gridLayout(1, 1, 1, 1, 0), 1);
  private cargoRoute() {
    const c = this.cargoDepot;
    const room = (g: Gate) => this.cargoCap(g) - g.cargo.count;
    const gates = this.gates.filter((g) => g.open && room(g) > 0);
    if (!gates.length || !c.stock.count) return { src: this.idleCargo, srcZone: c.zone, dst: c.stock, dstZone: c.zone };
    const pick = gates.reduce((a, b) => (room(b) > room(a) ? b : a));
    return { src: c.stock, srcZone: c.zone, dst: pick.cargo, dstZone: pick.cargoZone };
  }

  private recycler!: { parts: THREE.Object3D[]; input: Stack; output: Stack; inZone: Zone; outZone: Zone; nectar: number; t: number; open: boolean; spin: THREE.Object3D };
  private buildRecycler() {
    const { x, z } = AT.recycler;
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    // a striped sunflower-seed husk on its side, with a spinning leaf wheel on top
    const husk = mesh(new THREE.SphereGeometry(1, 20, 12).scale(2.6, 1.7, 1.7), mat(0x3d3a36, { rough: 0.6 }));
    husk.position.y = 1.5;
    g.add(husk);
    for (const dx of [-1.3, 0, 1.3]) {
      const stripe = mesh(new THREE.TorusGeometry(1.62 * Math.sqrt(1 - (dx / 2.6) ** 2), 0.09, 6, 20).rotateY(Math.PI / 2), mat(0xefe6d2, { rough: 0.7 }), false);
      stripe.position.set(dx, 1.5, 0);
      g.add(stripe);
    }
    const spin = new THREE.Group();
    spin.position.set(0, 3.5, 0);
    for (let k = 0; k < 3; k++) {
      const blade = mesh(new THREE.SphereGeometry(0.5, 8, 6).scale(1.6, 0.12, 0.6), mat(0x58b947, { rough: 0.6 }));
      blade.position.set(Math.cos((k / 3) * Math.PI * 2) * 0.8, 0, Math.sin((k / 3) * Math.PI * 2) * 0.8);
      blade.rotation.y = -(k / 3) * Math.PI * 2;
      spin.add(blade);
    }
    g.add(spin);
    const inPad = makePad(2.4, 2.2, 'IN 💧🍃', '#58b947');
    inPad.position.set(-3, 0.05, 3);
    const outPad = makePad(2.4, 2.2, 'OUT ⛽', '#ffb02e');
    outPad.position.set(3, 0.05, 3);
    const inG = new THREE.Group();
    inG.position.set(-3, 0, 1.2);
    const outG = new THREE.Group();
    outG.position.set(3, 0, 1.2);
    g.add(inPad, outPad, inG, outG);
    this.scene.add(g);
    const sign = new TextSprite(1.0, '#9be38c');
    sign.setText('♻️ RECYCLER');
    sign.sprite.position.set(x, 5.6, z);
    this.scene.add(sign.sprite);
    this.recycler = {
      parts: [g, sign.sprite],
      input: new Stack(inG, gridLayout(3, 2, 0.6, 0.6, 0.06), 12),
      output: new Stack(outG, gridLayout(3, 2, 0.6, 0.6, 0.06), 6),
      inZone: new Zone(x - 3, z + 3, 1.2, 1.1),
      outZone: new Zone(x + 3, z + 3, 1.2, 1.1),
      nectar: 0,
      t: 0,
      open: false,
      spin,
    };
    for (const o of this.recycler.parts) shown(o, false);
  }
  private openRecycler(animate: boolean) {
    const r = this.recycler;
    r.open = true;
    for (const o of r.parts) {
      shown(o, true);
      if (animate) this.flyers.grow(o);
    }
    this.blockers.push({ minX: AT.recycler.x - 2.6, maxX: AT.recycler.x + 2.6, minZ: AT.recycler.z - 1.7, maxZ: AT.recycler.z + 1.7 });
  }
  /** ⛽ How much fuel is on gate `g`'s pad, in nectar drops (a drop of jet fuel counts as a whole flight's worth). */
  private fuelUnits(g: Gate) {
    return g.fuel.items.reduce((n, it) => n + (it.type === 'fuel' ? TY.fuelPerFlight : 1), 0);
  }
  /** A job's staff level. */
  staffLv(id: StaffId) {
    return this.st.staff?.[id] ?? 0;
  }
  // --------------------------------------------------------------------------
  // ⬆️ UPGRADES (v0.72, tycoon/upgrades.ts): every building is a TARGET. A green arrow bobs over it when there's a
  // level you can afford; tap it (or walk near and tap the ⬆️ button) for its menu.
  // --------------------------------------------------------------------------
  private hangar!: ArtPiece;
  private menu = new UpMenu(document.getElementById('hud')!);
  private targets: { id: string; name: string; at: THREE.Vector3; r: number; live: () => boolean; rows: () => MenuRow[]; buy: (row: string) => void; arrow: THREE.Sprite; can: boolean }[] = [];
  private targetT = 0;
  private arrowT = 0;
  /**
   * 🛖 What's parked in the hangar (v0.72.1): the aircraft you fly now, full size, in the middle with its nose to
   * the door; the types you've retired as little display models along the back wall; and the mechanic ant.
   * Rebuilt when the fleet changes.
   */
  private hangarStuff: CreatureModel[] = [];
  private fillHangar() {
    for (const m of this.hangarStuff) {
      m.root.removeFromParent();
      const k = this.idlers.indexOf(m);
      if (k >= 0) this.idlers.splice(k, 1);
    }
    this.hangarStuff = [];
    const at = (x: number, z: number) => this.hangar.root.localToWorld(new THREE.Vector3(x, 0.3 / HANGAR_SCALE, z));
    const ry = this.hangar.root.rotation.y;
    const park = (m: CreatureModel, p: THREE.Vector3, turn: number) => {
      m.root.position.copy(p);
      m.root.rotation.y = ry + turn;
      this.scene.add(m.root);
      this.idlers.push(m);
      this.hangarStuff.push(m);
    };
    const flying = bestPlane((id) => this.owns(id));
    park(artBug(flying.kind, flying.length, { seed: 21, color: flying.color }), at(0, -0.6), 0);
    // (retired types: small models in an arc along the back wall, oldest on the left)
    const retired = FLEET.filter((t) => t !== flying && (!t.unlock || this.owns(t.unlock)));
    retired.forEach((t, i) => {
      const a = Math.PI + (i - (retired.length - 1) / 2) * Math.min(0.42, 2.3 / retired.length); // (v0.89: closer together once there are more than six)
      park(artBug(t.kind, Math.min(t.length, 4.5) * 0.6, { seed: 30 + i, color: t.color }), at(Math.sin(a) * 5.6, Math.cos(a) * 5.6), a + Math.PI);
    });
    const mech = spawnCreature('worker', 2.1) ?? makeAnt(0x8e2f14);
    titleTag(mech, '🔧 MECHANIC', TITLE.ant);
    park(mech, at(3.6, 3.4), -2.4);
  }

  /** A building upgrade's level ("gate0.fuel"). */
  up(key: string) {
    return this.st.ups?.[key] ?? 0;
  }
  /** 🎫 A ticket's price now. */
  private get ticket() {
    return TY.ticket + this.up('terminal.ticket');
  }
  /** How long gate `g`'s plane waits for more passengers once one's aboard. */
  private boardWait(g: Gate) {
    return TY.boardWait * (1 - 0.1 * this.up(`gate${this.gates.indexOf(g)}.board`));
  }
  private pay(cost: number) {
    if (this.save.cash < cost) return false;
    this.save.cash -= cost;
    this.hud.setCash(this.save.cash);
    this.sfx.upgrade();
    return true;
  }

  private addTarget(id: string, name: string, at: THREE.Vector3, r: number, live: () => boolean, rows: () => MenuRow[], buy: (row: string) => void, arrowY = 7) {
    const arrow = new THREE.Sprite(Airfield.arrowMat());
    arrow.scale.set(1.8, 1.8, 1);
    arrow.position.copy(at).setY(arrowY);
    arrow.renderOrder = 6;
    arrow.visible = false;
    arrow.userData.y = arrowY;
    this.scene.add(arrow);
    this.targets.push({ id, name, at, r, live, rows, buy, arrow, can: false });
  }
  /** A building whose menu is a plain list of upgrades (`defs`), saved as "<id>.<k>". */
  private addBuilding(id: string, name: string, at: THREE.Vector3, r: number, defs: UpDef[], live: () => boolean, arrowY = 7) {
    this.addTarget(
      id, name, at, r, live,
      () => defs.map((d) => {
        const lv = this.up(`${id}.${d.k}`);
        return { id: d.k, ic: d.ic, name: d.name, desc: d.desc, lv: `Lv ${lv}/${d.max}`, cost: lv >= d.max ? null : upPrice(d, lv) };
      }),
      (k) => {
        const d = defs.find((x) => x.k === k);
        if (!d) return;
        const key = `${id}.${k}`;
        const lv = this.up(key);
        if (lv < d.max && this.pay(upPrice(d, lv))) (this.st.ups ??= {})[key] = lv + 1;
      },
      arrowY,
    );
  }
  /** The green ⬆ arrow (one texture for all of them). */
  private static arrowMaterial: THREE.SpriteMaterial | null = null;
  private static arrowMat() {
    if (Airfield.arrowMaterial) return Airfield.arrowMaterial;
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d')!;
    x.translate(64, 64);
    x.shadowColor = '#7CFC9B';
    x.shadowBlur = 18;
    x.fillStyle = '#7CFC9B';
    x.strokeStyle = '#0e3a22';
    x.lineWidth = 5;
    x.beginPath();
    x.moveTo(0, -46); x.lineTo(44, 4); x.lineTo(16, 4); x.lineTo(16, 44); x.lineTo(-16, 44); x.lineTo(-16, 4); x.lineTo(-44, 4);
    x.closePath();
    x.stroke();
    x.fill();
    Airfield.arrowMaterial = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: false });
    return Airfield.arrowMaterial;
  }

  private buildTargets(doorAt: THREE.Vector3) {
    const v = (x: number, z: number) => new THREE.Vector3(x, 0, z);
    this.gates.forEach((g, i) => {
      const post = g.piece.root.localToWorld(new THREE.Vector3(-14.2, 0, 2.6));
      this.addBuilding(`gate${i}`, `Gate ${i + 1}`, post, 8, UPS.gate, () => g.open, 8);
    });
    this.flowers.forEach((f, i) => this.addBuilding(`flower${i}`, `Nectar flower ${i + 1}`, v(f.zone.x, f.zone.z), 6, UPS.flower, () => f.piece.root.visible, 6));
    this.addBuilding('terminal', 'Terminal', doorAt.clone().setY(0), 7, UPS.terminal, () => true, 9);
    this.addBuilding('cafe', 'Café kitchen', v(AT.oven.x, AT.oven.z + 3), 7, UPS.cafe, () => this.cafeOpen, 6);
    this.addBuilding('shop', 'Gift shop', this.shop.spot.clone().setY(0), 5, UPS.shop, () => this.shop.open, 8);
    this.addBuilding('lounge', 'VIP Lounge', this.lounge.spot.clone().setY(0), 7, UPS.lounge, () => this.lounge.open, 7);
    this.addBuilding('cargo', 'Cargo Depot', v(AT.cargo.x + 2, AT.cargo.z + 2), 9, UPS.cargo, () => this.cargoDepot.open, 7);
    this.addBuilding('recycler', 'Recycler', v(AT.recycler.x, AT.recycler.z + 2), 8, UPS.recycler, () => this.recycler.open, 7);
    this.addBuilding('tower', 'Control Tower', v(AT.tower.x, AT.tower.z + 5), 10, UPS.tower, () => this.owns('ty-tower'), 9);

    // ⬆️ The Staff Office: a row per hired job (levels in save.tycoon.staff)
    const staffDesc: Record<string, string> = { cargo: '+12% speed · +1 carry / 2 Lv', fuel: '+12% speed · +1 carry / 2 Lv', bags: '+12% speed · +1 carry / 2 Lv', cafe: '+12% speed · +1 carry / 2 Lv', janitor: '+12% speed · +1 carry / 2 Lv', checkin: '+15% check-in speed', banker: '+20% grab speed', you: '+1 carry' };
    this.addTarget(
      'staff', 'Staff upgrades', this.staffAt.clone(), 6, () => true,
      () => STAFF.filter((d) => !d.needs || this.owns(d.needs)).map((d) => {
        const lv = this.staffLv(d.id);
        return { id: d.id, ic: d.icon, name: d.name, desc: staffDesc[d.id] ?? '', lv: `Lv ${lv}/${STAFF_MAX}`, cost: lv >= STAFF_MAX ? null : staffCost(d, lv) };
      }),
      (id) => {
        const spent = buyStaff((this.st.staff ??= {}), id, 1, this.save.cash);
        if (spent > 0) this.pay(spent);
      },
      7,
    );

    // 🛖 The Hangar: your fleet. Upgrades for whatever flies, then each aircraft: owned, the next to unlock, later ones.
    this.addTarget(
      'hangar', 'Hangar', v(AT.hangar.x, AT.hangar.z), 17, () => this.owns('ty-hangar'),
      () => {
        const rows: MenuRow[] = UPS.plane.map((d) => {
          const lv = this.up(`fleet.${d.k}`);
          return { id: `fleet.${d.k}`, ic: d.ic, name: `${d.name} (all aircraft)`, desc: d.desc, lv: `Lv ${lv}/${d.max}`, cost: lv >= d.max ? null : upPrice(d, lv) };
        });
        const flying = bestPlane((id) => this.owns(id));
        const mixed = this.st.mixed !== false;
        rows.push({ id: 'mixed', ic: '🎲', name: 'Mixed fleet', desc: mixed ? 'Gates take turns with every aircraft you own. Smaller ones carry fewer passengers.' : 'Every gate flies your biggest aircraft (the most income).', lv: mixed ? 'ON' : 'OFF', cost: 0, tap: mixed ? 'Turn OFF' : 'Turn ON' });
        let nextShown = false;
        for (const t of FLEET) {
          const seats = `${t.seats + this.up('fleet.seats')} seats · ×${t.speed} speed`;
          if (!t.unlock || this.owns(t.unlock)) rows.push({ id: t.id, ic: t.icon, name: t.name, desc: seats, lv: mixed ? '✈️ IN THE MIX' : t === flying ? '✈️ FLYING NOW' : 'Retired', cost: null, done: 'OWNED' });
          else {
            const lock = nextShown ? '🔒 Later' : this.save.level < t.level ? `🔒 Lv ${t.level}` : undefined;
            rows.push({ id: t.id, ic: t.icon, name: `Unlock ${t.name}`, desc: seats, lv: 'NEW AIRCRAFT', cost: t.cost, lock });
            nextShown = true;
          }
        }
        return rows;
      },
      (id) => {
        if (id === 'mixed') {
          this.st.mixed = this.st.mixed === false;
          this.gates.forEach((g) => (g.swap = g.reroll = true)); // (each gate re-picks as its plane comes home)
          this.sfx.popup();
          return;
        }
        const d = UPS.plane.find((x) => `fleet.${x.k}` === id);
        if (d) {
          const lv = this.up(id);
          if (lv < d.max && this.pay(upPrice(d, lv))) {
            (this.st.ups ??= {})[id] = lv + 1;
            if (d.k === 'seats') for (const g of this.gates) g.swap = true; // (each plane gets its new seat at its gate)
          }
          return;
        }
        const t = FLEET.find((f) => f.id === id);
        if (!t?.unlock || this.owns(t.unlock) || this.save.level < t.level || !this.pay(t.cost)) return;
        this.save.unlocked.push(t.unlock);
        this.applyUnlock(t.unlock, true);
      },
      15,
    );
  }

  /** Open a target's menu. */
  openTarget(id: string) {
    const t = this.targets.find((x) => x.id === id);
    if (!t || !t.live()) return false;
    if (id === 'hangar') this.hangarSeen = true;
    this.sfx.popup();
    this.menu.open(() => ({ title: `⬆️ ${t.name}`, cash: this.save.cash, rows: t.rows() }), (row) => t.buy(row));
    return true;
  }
  /** A tap on the 3D view: the building nearest the tap (within a thumb's reach) opens its menu. */
  tapTarget(x: number, y: number, w: number, h: number) {
    let best: string | null = null;
    let bestD = 58;
    const v = new THREE.Vector3();
    for (const t of this.targets) {
      if (!t.live()) continue;
      for (const yy of [1.5, t.arrow.userData.y as number]) {
        v.copy(t.at).setY(yy).project(this.camera);
        if (v.z > 1) continue;
        const d = Math.hypot((v.x * 0.5 + 0.5) * w - x, (-v.y * 0.5 + 0.5) * h - y);
        if (d < bestD) {
          bestD = d;
          best = t.id;
        }
      }
    }
    return best ? this.openTarget(best) : false;
  }
  /** Arrows over what you can afford, and the ⬆️ button for the building you're standing by. */
  private updateTargets(dt: number) {
    this.arrowT += dt;
    this.targetT -= dt;
    if (this.targetT <= 0) {
      this.targetT = 0.5;
      for (const t of this.targets) t.can = t.live() && t.rows().some((r) => r.cost !== null && !r.lock && this.save.cash >= r.cost);
    }
    const p = this.player.pos;
    let near: (typeof this.targets)[number] | null = null;
    let nearD = Infinity;
    for (const t of this.targets) {
      t.arrow.visible = t.can;
      if (t.can) t.arrow.position.y = (t.arrow.userData.y as number) + Math.sin(this.arrowT * 5) * 0.4;
      if (!t.live()) continue;
      const d = Math.hypot(p.x - t.at.x, p.z - t.at.z);
      if (d < t.r && d < nearD) {
        nearD = d;
        near = t;
      }
    }
    if (near && !this.menu.isOpen) {
      const id = near.id;
      this.hud.setUpgradeButton(near.name, () => this.openTarget(id), near.can, this);
    } else if (this.hud.ownsUpgradeButton(this)) this.hud.setUpgradeButton(null);
  }
  /** Put the building upgrade levels to work (pads, lines, VIPs, the oven, every plane's speed). */
  private applyUps() {
    const boost = (this.owns('ty-tower') ? TY.towerBoost * (1 + 0.05 * this.up('tower.boost')) : 1) * (1 + 0.06 * this.up('fleet.speed'));
    this.gates.forEach((g, i) => {
      g.fuel.max = TY.fuelMax + 2 * this.up(`gate${i}.fuel`);
      this.pax.gateCap[i] = Math.max(6, g.plane.model.seats.length + 2) + 2 * this.up(`gate${i}.seats`);
      // (🌧️ a little slower in the rain; 🌬️ and it takes off and lands into the wind)
      g.plane.boost = boost * this.typeFor(i).speed * this.weather.planeMult * (1 + PERK_FX.planes * this.perk('planes'));
      g.plane.wind = this.weather.dir;
    });
    this.flowers.forEach((f, i) => (f.stack.max = TY.flowerMax + 2 * this.up(`flower${i}.cap`)));
    this.pax.queueMax = TY.queueMax + this.up('terminal.line');
    if (this.lounge.open) this.pax.vipChance = TY.vipShare + 0.03 * this.up('lounge.vips');
    (this.cafe.oven as unknown as { cookTime: number }).cookTime = OVEN.cookTime / (this.owns('ty-chef') ? CONFIG.bakery.fastOvenMultiplier : 1) / (1 + 0.15 * this.up('cafe.oven'));
  }

  /**
   * 🚸 Is a plane on Runway 1, or taxiing past the crossing (v0.95; Phase 1: "Travellers wait at the north crossing
   * while a plane is on Runway 1, then cross")? On the runway: lining up, rolling for take-off, or landing (from its
   * final approach to turning off). Taxiing: on the first field's taxiway within 12 of the crossing. GAME TUNING.
   */
  private planeAtCrossing() {
    const f = FIELDS[0], c = AT.crossing;
    if (this.runwayUser[0]?.onRunway) return true;
    return this.gates.some((g) => {
      if (!g.open || g.plane.field !== f) return false;
      if (g.plane.onRunway) return true;
      const p = g.plane.pos;
      return (g.plane.state === 'taxiOut' || g.plane.state === 'taxiIn') && Math.abs(p.z - f.taxiZ) < 5 && Math.abs(p.x - c.x) < 12;
    });
  }

  /** Put the staff levels to work: helpers' speed and carry, check-in speed, the Banker's grab, your backpack. */
  private applyStaff() {
    for (const w of this.workers) {
      const job = w.model.root.userData.job as StaffId | undefined;
      if (!job) continue;
      const lv = this.staffLv(job);
      w.boost = staffFx.speed(lv) * (1 + PERK_FX.ants * this.perk('ants'));
      w.stack.max = (w.model.root.userData.carry0 as number) + staffFx.carry(lv);
    }
    for (const b of this.bankers) b.boost = staffFx.grab(this.staffLv('banker'));
    this.pax.checkMult = staffFx.quick(this.staffLv('checkin'));
  }

  /** 🌼 A nectar flower (`open` = bought: the second one shows up later). */
  private buildFlower(x: number, z: number, open: boolean) {
    // (not bought yet: no walls, so you can stand on its tile, in the middle of where it'll grow)
    const piece = this.place(artFuelFlower(), x, z, 0, open);
    shown(piece.root, open);
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
    shown(label.sprite, open);
    this.scene.add(label.sprite);
    piece.root.userData.label = label;
    this.flowers.push({ piece, stack, zone: new Zone(pump.x, pump.z, 1.8, 1.8), t: 0 });
  }

  /** 🛫 A gate with its plane (`open` = bought). */
  /** A gate's plane: a ladybug (2 seats), or a bee (3) after 🐝 Bee Shuttles. */
  /** 🎲 MIXED FLEET (v0.74): is it on, and are there at least two aircraft to mix? */
  private get mixed() {
    return this.st.mixed !== false && FLEET.filter((f) => !f.unlock || this.owns(f.unlock)).length > 1;
  }
  /** The aircraft gate `i` flies: its own pick when the fleet's mixed, else the best one you've unlocked. */
  private typeFor(i: number): PlaneType {
    const best = bestPlane((id) => this.owns(id));
    if (!this.mixed) return best;
    const t = FLEET.find((f) => f.id === this.st.types?.[i]);
    return t && (!t.unlock || this.owns(t.unlock)) ? t : best;
  }
  /** Pick gate `i`'s next aircraft: any you've unlocked, but not the one it has, nor one another gate's flying
   *  (while there are enough to go round): so the apron's always a mix. */
  private rollType(i: number) {
    const types = (this.st.types ??= []);
    if (!this.mixed) return void (types[i] = bestPlane((id) => this.owns(id)).id);
    const owned = FLEET.filter((f) => !f.unlock || this.owns(f.unlock));
    const taken = new Set<string | undefined>();
    this.gates.forEach((g, k) => {
      if (k !== i && g.open) taken.add(types[k]);
    });
    let pool = owned.filter((f) => f.id !== types[i] && !taken.has(f.id));
    if (!pool.length) pool = owned.filter((f) => f.id !== types[i]);
    if (!pool.length) pool = owned;
    types[i] = pool[Math.floor(Math.random() * pool.length)].id;
  }
  private planeModel(i: number) {
    if (this.mixed && !this.st.types?.[i]) this.rollType(i); // (its first pick)
    const t = this.typeFor(i);
    const m = artBug(t.kind, t.length, { seed: 3 + i * 4, color: t.color });
    m.root.userData.planeType = t.id;
    // 💺 as many seats as its type has (+ the hangar's Extra Seat levels): extra ones sit between the model's own
    // seats, a little to each side
    const want = t.seats + this.up('fleet.seats');
    const own = m.seats.length;
    m.seats.length = Math.min(own, want);
    for (let e = 0; m.seats.length < want; e++) {
      const a = m.seats[e % own];
      const b = m.seats[(e + 1) % own] ?? a;
      const seat = new THREE.Object3D();
      const d = a.position.distanceTo(b.position) || 0.5;
      seat.position.copy(a.position).lerp(b.position, 0.5);
      seat.position.x += (e % 2 ? 1 : -1) * d * (0.3 + 0.12 * Math.floor(e / own));
      (a.parent ?? m.bob).add(seat);
      m.seats.push(seat);
    }
    return m;
  }

  private buildGate(x: number, z: number, i: number, open: boolean) {
    const piece = this.place(artGate(i + 1), x, z, 0, open);
    const stand = this.worldSpot(piece, 'plane', new THREE.Vector3(x, 0, z - 6));
    const model = this.planeModel(i);
    this.scene.add(model.root);
    const plane = new Plane(model, stand, linkX(x), this.groundY, i % GATES_PER_FIELD, fieldOf(i));
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
    label.sprite.position.copy(stand).add(new THREE.Vector3(0, 2.4, 9)); // (just in front of the stand: never under the quest card)
    (label.sprite.material as THREE.SpriteMaterial).depthTest = false; // (always readable: never hidden behind the plane)
    label.sprite.renderOrder = 5;
    this.scene.add(label.sprite);
    // 🧳 the BAGS pad on the far side of the fuel pad (toward the runway)
    const bagsAt = stand.clone().add(new THREE.Vector3(6.5, 0, -4.5));
    const bagPad = makePad(3, 3, 'BAGS', '#5fb4ff');
    bagPad.position.copy(bagsAt).setY(0.05);
    this.scene.add(bagPad);
    const bg = new THREE.Group();
    bg.position.copy(bagsAt);
    this.scene.add(bg);
    const bags = new Stack(bg, gridLayout(2, 4, 0.7, 0.62, 0.08), TY.bagPadMax);
    // 📦 the CARGO pad (v0.90): beyond the BAGS pad, clear of the next gate's bridge
    const cargoAt = stand.clone().add(new THREE.Vector3(11, 0, -5.5));
    const cargoPad = makePad(3, 3, 'CARGO', '#d39a4a');
    cargoPad.position.copy(cargoAt).setY(0.05);
    this.scene.add(cargoPad);
    const cg = new THREE.Group();
    cg.position.copy(cargoAt);
    this.scene.add(cg);
    const cargo = new Stack(cg, gridLayout(3, 3, 0.62, 0.62, 0.08), TY.cargoPadMax);
    for (let n = 0; n < (this.st.cargoPads?.[i] ?? 0); n++) cargo.addInstant('parcel');
    const door = this.worldSpot(piece, 'door', stand.clone().add(new THREE.Vector3(-3, 0, 0)));
    const path = [this.worldSpot(piece, 'rampFoot', door.clone().setY(0)), this.worldSpot(piece, 'rampTop', door), door];
    const gate: Gate = {
      door, path, piece, fuel, fuelZone: new Zone(fuelAt.x, fuelAt.z, 1.5, 1.5), plane, riders: [], boarding: [], boardT: 0, open, label,
      bags, bagZone: new Zone(bagsAt.x, bagsAt.z, 1.5, 1.5),
      cargo, cargoZone: new Zone(cargoAt.x, cargoAt.z, 1.5, 1.5), cargoParts: [cargoPad, cg], cargoAboard: 0,
    };
    piece.root.userData.link = this.gateRoads[i] ?? [];
    piece.root.userData.bags = [bagPad, bg];
    for (const o of gate.cargoParts) shown(o, open && this.owns('ty-cargo'));
    for (const o of [piece.root, model.root, pad, bagPad, bg, label.sprite, ...this.gateRoads[i]]) shown(o, open);
    pad.userData.gatePad = true;
    piece.root.userData.pad = pad;
    plane.onAirborne = () => {
      this.st.flights++;
      this.progress.addXp(TY.xpFlight);
      this.count('flights', 1);
      this.tutorial.did(STEP.takeoff);
      // 🗺️ a longer route's fare: the rest of each passenger's fare is paid as it lifts off
      const fare = plane.outbound?.fare ?? 1;
      const went = routeOf(plane.outbound?.place);
      // 📦 the freight in its hold is paid for as it lifts off: each crate its price × the route's fare
      const freight = gate.cargoAboard;
      if (gate.cargoAboard > 0) {
        const paid = Math.round(gate.cargoAboard * this.cargoPrice * fare);
        this.bill(paid, plane.pos);
        (this.st.tally ??= {}).cargo = (this.st.tally.cargo ?? 0) + gate.cargoAboard;
        if (this.near(plane.pos, 40)) this.hud.floatAt(plane.pos.clone().setY(plane.pos.y + 9), this.camera, `📦 ${gate.cargoAboard} crates +$${paid}`, 'gold');
        gate.cargoAboard = 0;
      }
      (this.st.routeFlown ??= {})[went.id] = (this.st.routeFlown[went.id] ?? 0) + 1;
      if (fare > 1 && plane.aboard > 0) {
        const bonus = Math.round(plane.aboard * this.ticket * (fare - 1));
        this.bill(bonus, plane.pos);
        if (this.near(plane.pos, 40)) this.hud.floatAt(plane.pos.clone().setY(plane.pos.y + 6), this.camera, `🗺️ ${routeOf(plane.outbound?.place).place} fares +$${bonus}`, 'gold');
      }
      // 🌙🌈 night flights, and flights under a rainbow, pay more: that share of every fare aboard (and of its freight)
      const more = this.weather.bonus;
      if (more > 0 && plane.aboard + freight > 0) {
        const extra = Math.round((plane.aboard * this.ticket + freight * this.cargoPrice) * fare * more);
        this.bill(extra, plane.pos);
        (this.st.tally ??= {}).skyBonus = (this.st.tally.skyBonus ?? 0) + extra;
        if (this.near(plane.pos, 40)) this.hud.floatAt(plane.pos.clone().setY(plane.pos.y + 12), this.camera, `${this.weather.bonusName} +$${extra}`, 'gold');
      }
      if (this.near(plane.pos, 40)) {
        this.hud.floatAt(plane.pos.clone().setY(plane.pos.y + 3), this.camera, '🛫 Take-off!', 'big');
        this.sfx.takeoff();
      }
    };
    plane.onRoute = () => {
      // (its next trip: the flight that will bring it home)
      plane.inbound = this.newFlight();
      plane.outbound = null;
      // The travellers have flown off to their destination
      for (const p of gate.riders) {
        p.model.root.removeFromParent();
        this.pax.gone(p);
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
      // Everyone off (the landing fees are counted with the fare of where they came from: then it's done): they pay their landing fee and walk away into the lawn
      plane.unseat(this.scene);
      for (const p of gate.riders) {
        p.state = 'leaving';
        this.pax.leave(p, [...gate.path].reverse(), this.gates.indexOf(gate));
        this.bill(TY.landingFee * (plane.inbound?.fare ?? 1), plane.pos);
      }
      gate.riders = [];
      plane.inbound = null;
      this.st.landings = (this.st.landings ?? 0) + 1;
      this.count('landings', 1);
      // 🎲 mixed fleet: a different aircraft takes the next flight (once everyone's off)
      if (this.mixed) gate.swap = gate.reroll = true;
      if (this.near(plane.pos, 40)) this.hud.floatAt(plane.pos.clone().setY(3), this.camera, '🛬 Landed', '');
    };
    this.gates.push(gate);
  }

  private buildDecor() {
    this.place(artTower(), AT.tower.x, AT.tower.z);
    this.windsock = this.place(artWindsock(), AT.windsock.x, AT.windsock.z);
    // (🛖 the hangar is built with its tile: until then it's put away, and not solid)
    // (a bottle cap 27 across: big enough to park any aircraft inside; its door faces the field, west)
    const hangar = artHangar();
    hangar.root.scale.setScalar(HANGAR_SCALE);
    this.hangar = this.place(hangar, AT.hangar.x, AT.hangar.z, -1.25, false);
    shown(this.hangar.root, false);
    const sign = new TextSprite(1.3, '#8fd3ff');
    sign.setText('🛖 HANGAR');
    sign.sprite.position.set(AT.hangar.x, 11, AT.hangar.z);
    (sign.sprite.material as THREE.SpriteMaterial).depthTest = false;
    sign.sprite.renderOrder = 5;
    shown(sign.sprite, false);
    this.scene.add(sign.sprite);
    this.hangar.root.userData.sign = sign.sprite;
    this.place(artDewTank(), 70, -18, -0.4);
    this.place(artBaggageCart(), 64, -14, 0.6);
    // (🛢️🧳 v0.92.1: those two had no footprint: solid now)
    this.blockers.push(...propWalls(this.pieces[this.pieces.length - 2].root), ...propWalls(this.pieces[this.pieces.length - 1].root));
    this.place(artSign('ANTHILL AIRWAYS'), AT.terminal.x - 30, AT.terminal.z + 24, 0.5);
    this.place(artSign('GATES', 'up'), -64, -14, 0.3);
    this.place(artSign('NORTH FIELD'), -70, -27, 0.2); // (🚸 by the crossing's south end)
  }

  // --------------------------------------------------------------------------
  // Unlocks
  // --------------------------------------------------------------------------
  private owns(id: string) {
    return this.save.unlocked.includes(id);
  }

  private applyUnlock(id: string, animate: boolean) {
    const nest = new THREE.Vector3(AT.nest.x, 0, AT.nest.z + 7);
    if (/^ty-runner\d?$/.test(id)) {
      const w = new Worker(this.scene, nest.x, nest.z, () => this.fuelRoute(), { color: 0xffb02e }, 2.1);
      Object.assign(w.model.root.userData, { job: 'fuel', carry0: w.baseCarry });
      titleTag(w.model, '⛽ FUEL RUNNER', TITLE.ant);
      this.workers.push(w);
      if (animate) this.flyers.grow(w.model.root);
    } else if (id === 'ty-checkin') {
      const a = spawnCreature('worker', 2.1) ?? makeAnt(0x8e2f14);
      a.root.position.set(this.deskZone.x, 0.5, this.deskZone.z);
      a.root.rotation.y = 0; // (behind the counter, facing the line)
      titleTag(a, '🎫 CHECK-IN', TITLE.ant);
      this.scene.add(a.root);
      this.checkInAnt = a;
      if (animate) this.flyers.grow(a.root);
    } else if (/^ty-bags\d?$/.test(id)) {
      // 🧳 carries seed-bags from the BAG DROP to the gate that needs them most
      // (🧳 v0.95: Baggage Ants 4 and 5 are the north field's: they start at the north BAG DROP and work its gates)
      const north = id === 'ty-bags4' || id === 'ty-bags5';
      const home = north ? AT.bagDropNorth : nest;
      const w = new Worker(this.scene, home.x, home.z, () => this.bagRoute(north), { color: 0x5fb4ff }, 2.1);
      w.baseCarry = w.stack.max = TY.bagCarry;
      Object.assign(w.model.root.userData, { job: 'bags', carry0: w.baseCarry });
      titleTag(w.model, '🧳 BAGGAGE', TITLE.ant);
      this.workers.push(w);
      if (animate) this.flyers.grow(w.model.root);
    } else if (id === 'ty-atc') {
      // 🎧 stands at the tower's door with a headset and clears waiting planes for you
      const a = spawnCreature('worker', 2.1) ?? makeAnt(0x8e2f14);
      a.root.position.set(AT.tower.x, 0, AT.tower.z + 4.6);
      a.root.rotation.y = 0;
      titleTag(a, '🎧 TOWER', TITLE.ant);
      this.scene.add(a.root);
      this.towerAnt = a;
      if (animate) {
        this.flyers.grow(a.root);
        this.hud.banner('🎧 Tower ant on duty!', 'Planes are cleared for take-off and landing by themselves now', 3000);
      }
    } else if (id === 'ty-banker') {
      const b = new Banker(this.scene, this.cashPad, (amount) => {
        this.addCash(amount);
        autoCash(amount); // (automated income: counts toward +$/min and the offline pay)
      });
      titleTag(b.model, '🏦 BANKER', TITLE.ant);
      this.bankers.push(b);
      if (animate) this.flyers.grow(b.model.root);
    } else if (id === 'ty-flower2' || id === 'ty-flower3') {
      const f = this.flowers[Number(id.slice(-1)) - 1];
      if (!f.piece.root.visible) this.blockers.push(...(f.piece.root.userData.walls as Blocker[]));
      shown(f.piece.root, true);
      shown((f.piece.root.userData.label as TextSprite).sprite, true);
      if (animate) this.flyers.grow(f.piece.root);
    } else if (/^ty-gate\d$/.test(id)) {
      const n = Number(id.slice(-1)) - 1;
      const g = this.gates[n];
      // 🛫 (Gate 5 builds the north field: its runway and taxiway are laid, and the crossing to it is painted)
      shown(this.crossing, this.fieldOpen(FIELDS[1]));
      for (const o of this.northBagBits) shown(o, this.fieldOpen(FIELDS[1]));
      if (animate && id === 'ty-gate5') this.hud.banner('🛫 The NORTH FIELD is open!', 'A second runway and Gate 5: walk over the 🚸 crossing, west of Gate 1', 4200);
      this.buildPaved(); // (open the runway's and the taxiway's borders where this gate's paths join them)
      g.open = true;
      for (const o of [g.piece.root, g.plane.model.root, g.piece.root.userData.pad as THREE.Object3D, g.label.sprite, ...(g.piece.root.userData.link as THREE.Object3D[]), ...(g.piece.root.userData.bags as THREE.Object3D[])]) shown(o, true);
      for (const o of g.cargoParts) shown(o, this.cargoDepot.open);
      this.blockers.push(...(g.piece.root.userData.walls as Blocker[])); // (its bridge is solid now)
      this.pax.gates = this.gates.filter((x) => x.open).length;
      if (animate) {
        this.flyers.grow(g.piece.root);
        this.flyers.grow(g.plane.model.root);
      }
    } else if (id === 'ty-tower') {
      for (const g of this.gates) g.plane.boost = TY.towerBoost;
    } else if (id === 'ty-cafe') {
      this.openCafe(animate);
    } else if (id === 'ty-crumbs') {
      const c = this.cafe;
      const w = new Worker(this.scene, nest.x, nest.z, () => ({ src: c.pile.stack, srcZone: c.pile.zone, dst: c.oven.input, dstZone: c.oven.inZone }), { color: 0xe8b86a }, 2.1);
      Object.assign(w.model.root.userData, { job: 'cafe', carry0: w.baseCarry });
      titleTag(w.model, '🍪 CRUMB RUNNER', TITLE.ant);
      this.workers.push(w);
      if (animate) this.flyers.grow(w.model.root);
    } else if (id === 'ty-chef') {
      const c = this.cafe;
      c.oven.makeFaster();
      const chef = spawnCreature('worker', 2.1) ?? makeAnt(0x8e2f14);
      chef.root.position.set(AT.oven.x, 0, AT.oven.z + 4.6);
      titleTag(chef, '🔥 CHEF', TITLE.ant);
      this.scene.add(chef.root);
      c.chef = chef;
      if (animate) this.flyers.grow(chef.root);
    } else if (FLEET.some((f) => f.unlock === id)) {
      // ✈️ every gate swaps its plane for the new one (✈️ fleet.ts) as soon as it's parked and empty
      const t = FLEET.find((f) => f.unlock === id)!;
      // (the next gate home gets the new one; with the fleet mixed, the others keep taking turns)
      this.gates.forEach((g, k) => {
        g.swap = true;
        if (animate && k === 0) (this.st.types ??= [])[k] = t.id;
      });
      if (this.owns('ty-hangar') && this.hangar) this.fillHangar();
      if (animate) this.hud.banner(`${t.icon} ${t.name} unlocked!`, this.st.mixed !== false ? 'It joins the mix: your gates take turns with every aircraft you own' : 'Nothing to assign: each gate switches to it as its plane comes home', 4200);
    } else if (id === 'ty-route-picnic' || id === 'ty-route-log' || id === 'ty-route-tide' || id === 'ty-route-lizard') {
      if (animate) this.hud.banner('🗺️ New route open!', 'Longer routes pay higher fares: some flights go there now', 3000);
    } else if (id === 'ty-cargo') {
      this.openCargo(animate);
    } else if (/^ty-cargoant\d?$/.test(id)) {
      // 📦 carries crates from the depot's dock to the gate with the most room for them
      const w = new Worker(this.scene, nest.x, nest.z, () => this.cargoRoute(), { color: 0xc9853f }, 2.1);
      w.baseCarry = w.stack.max = TY.cargoCarry;
      Object.assign(w.model.root.userData, { job: 'cargo', carry0: w.baseCarry });
      titleTag(w.model, '📦 CARGO', TITLE.ant);
      this.workers.push(w);
      if (animate) this.flyers.grow(w.model.root);
    } else if (id === 'ty-recycler') {
      this.openRecycler(animate);
    } else if (id === 'ty-janitor') {
      // 🧹 empties the fullest bin into the recycler
      const w = new Worker(this.scene, nest.x, nest.z, () => this.janitorRoute(), { color: 0x58b947 }, 2.1);
      Object.assign(w.model.root.userData, { job: 'janitor', carry0: w.baseCarry });
      titleTag(w.model, '🧹 JANITOR', TITLE.ant);
      this.workers.push(w);
      if (animate) this.flyers.grow(w.model.root);
    } else if (id === 'ty-hangar') {
      shown(this.hangar.root, true);
      shown(this.hangar.root.userData.sign as THREE.Object3D, true);
      this.blockers.push(...(this.hangar.root.userData.walls as Blocker[]));
      this.fillHangar();
      if (animate) {
        this.flyers.grow(this.hangar.root);
      }
    } else if (id === 'ty-shop') {
      this.openShop(animate);
    } else if (id === 'ty-lounge') {
      this.openLounge(animate);
    }
  }

  /**
   * 🧳 The bags gate `g` should hold: one for each of its passengers (aboard while it's parked, boarding, and
   * checked in for it), up to what its pad holds. Its pad takes no more than that (its `max` follows this), so
   * bags never pile up at a gate whose passengers don't need them while another gate waits.
   */
  private bagsWanted(g: Gate) {
    const i = this.gates.indexOf(g);
    const aboard = g.plane.parked ? g.plane.aboard : 0; // (in the air, its riders' bags are already in its hold)
    return Math.min(Math.max(TY.bagPadMax, g.plane.model.seats.length), aboard + g.boarding.length + this.pax.atGate[i].length);
  }
  private bagsNeeded(g: Gate) {
    return this.bagsWanted(g) - g.bags.count;
  }

  /** 🧳 The BAG DROP -> the open gate that needs bags most. Nobody needing any: wait at the BAG DROP (and bring
   *  back any bags still carried). */
  private idleBags = new Stack(new THREE.Group(), gridLayout(1, 1, 1, 1, 0), 1);
  private bagRoute(north = false) {
    // 🧳 (v0.95) each side's gates from its own BAG DROP: the first field's from the BAG DROP by the terminal, the north
    // field's from the north BAG DROP (its bags come up the 🕳️ tunnel). North ants work only the north; the others
    // work the south, and the north too while no north ant is hired. A north gate still short of bags with none
    // coming up the tunnel (a save from before the tunnel, its bags at the terminal) is taken from the terminal's.
    const isNorth = (g: Gate) => this.gates.indexOf(g) >= GATES_PER_FIELD;
    const most = (list: Gate[]) => list.reduce((a, b) => (this.bagsNeeded(b) > this.bagsNeeded(a) ? b : a));
    const needs = this.gates.filter((g) => g.open && this.bagsNeeded(g) > 0);
    const northNeeds = needs.filter(isNorth), southNeeds = needs.filter((g) => !isNorth(g));
    const comingNorth = this.bagDropN.count + this.tunnel.count;
    if (north) {
      if (!northNeeds.length || !this.bagDropN.count) return { src: this.idleBags, srcZone: this.bagDropNZone, dst: this.bagDropN, dstZone: this.bagDropNZone };
      const g = most(northNeeds);
      return { src: this.bagDropN, srcZone: this.bagDropNZone, dst: g.bags, dstZone: g.bagZone };
    }
    if (southNeeds.length) {
      const g = most(southNeeds);
      return { src: this.bagDrop, srcZone: this.bagDropZone, dst: g.bags, dstZone: g.bagZone };
    }
    const northAnts = this.owns('ty-bags4') || this.owns('ty-bags5');
    if (northNeeds.length && !northAnts && this.bagDropN.count) {
      const g = most(northNeeds);
      return { src: this.bagDropN, srcZone: this.bagDropNZone, dst: g.bags, dstZone: g.bagZone };
    }
    const short = northNeeds.filter(() => comingNorth === 0);
    if (short.length && this.bagDrop.count) {
      const g = most(short);
      return { src: this.bagDrop, srcZone: this.bagDropZone, dst: g.bags, dstZone: g.bagZone };
    }
    return { src: this.idleBags, srcZone: this.bagDropZone, dst: this.bagDrop, dstZone: this.bagDropZone };
  }

  /** ⛽ The fullest open flower -> the open gate with the least fuel. */
  private fuelRoute() {
    const flowers = this.flowers.filter((f) => f.piece.root.visible);
    const gates = this.gates.filter((g) => g.open);
    const g = gates.reduce((a, b) => (this.fuelUnits(b) < this.fuelUnits(a) ? b : a), gates[0]);
    // (v0.88: the nearest flower to that gate that has a flight's worth of nectar: the fullest, if none has.
    // With one field the fullest was always near enough; the north field's flower is a long walk from Gate 1)
    const far = (f: (typeof flowers)[number]) => Math.hypot(f.zone.x - g.fuelZone.x, f.zone.z - g.fuelZone.z);
    const ready = flowers.filter((x) => x.stack.count >= TY.fuelPerFlight);
    const f = ready.length ? ready.reduce((a, b) => (far(b) < far(a) ? b : a)) : flowers.reduce((a, b) => (b.stack.count > a.stack.count ? b : a), flowers[0]);
    // (♻️ jet fuel waiting at the recycler goes first)
    const r = this.recycler;
    if (r.open && r.output.count > 0) return { src: r.output, srcZone: r.outZone, dst: g.fuel, dstZone: g.fuelZone };
    return { src: f.stack, srcZone: f.zone, dst: g.fuel, dstZone: g.fuelZone };
  }

  /** 🧹 The fullest bin's wrappers -> the recycler (nothing to carry: wait by the recycler). */
  private idleLitter = new Stack(new THREE.Group(), gridLayout(1, 1, 1, 1, 0), 1);
  private janitorRoute() {
    const r = this.recycler;
    const b = this.bins.reduce((a, c) => (c.litter.count > a.litter.count ? c : a));
    if (!b.litter.count) return { src: this.idleLitter, srcZone: r.inZone, dst: r.input, dstZone: r.inZone };
    return { src: b.litter, srcZone: b.bin.zone, dst: r.input, dstZone: r.inZone };
  }

  /** What each hired ant does, said once as it's hired (v0.73). */
  private static HIRED: Record<string, [string, string]> = {
    'ty-banker': ['🏦 Banker hired!', 'He carries the cash from the pad to your wallet: income while you work'],
    'ty-runner2': ['⛽ Fuel Runner 2 hired!', 'Flower → the gate with the least fuel, by himself'],
    'ty-runner3': ['⛽ Fuel Runner 3 hired!', 'Flower → the gate with the least fuel, by himself'],
    'ty-runner4': ['⛽ Fuel Runner 4 hired!', 'The nearest flower with nectar → the gate with the least fuel'],
    'ty-runner5': ['⛽ Fuel Runner 5 hired!', 'The nearest flower with nectar → the gate with the least fuel'],
    'ty-bags4': ['🧳 Baggage Ant 4 hired!', 'NORTH BAG DROP → the north gate that needs bags most'],
    'ty-bags5': ['🧳 Baggage Ant 5 hired!', 'NORTH BAG DROP → the north gate that needs bags most'],
    'ty-flower3': ['🌼 Nectar Flower 3 is growing!', 'Nectar for the north field, right beside its gates'],
    'ty-bags2': ['🧳 Baggage Ant 2 hired!', 'BAG DROP → the gate that needs bags most'],
    'ty-bags3': ['🧳 Baggage Ant 3 hired!', 'BAG DROP → the gate that needs bags most'],
    'ty-crumbs': ['🍪 Crumb Runner hired!', 'Picnic crumbs → the kitchen\'s IN pad: the café runs by itself now'],
    'ty-chef': ['🔥 Chef hired!', 'The oven bakes much faster'],
    'ty-cargoant': ['📦 Cargo Ant hired!', 'Depot dock → the gate with the most room on its CARGO pad'],
    'ty-cargoant2': ['📦 Cargo Ant 2 hired!', 'Depot dock → the gate with the most room on its CARGO pad'],
    'ty-cargoant3': ['📦 Cargo Ant 3 hired!', 'Depot dock → the gate with the most room on its CARGO pad'],
    'ty-janitor': ['🧹 Janitor hired!', '🗑️ Bins → ♻️ Recycler IN: wrappers turn into cash by themselves'],
  };
  private unlock(tile: UnlockTile) {
    const id = tile.def.id;
    this.save.unlocked.push(id);
    delete this.save.paid[id];
    tile.mesh.visible = false;
    this.applyUnlock(id, true);
    seeThroughAll(this.scene, [this.player.model.root]); // (whatever was just built, too)
    this.freePlayer(id);
    this.guides.offer(id);
    const hired = Airfield.HIRED[id];
    if (hired && !this.learning) this.hud.banner(hired[0], hired[1], 3400);
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
    // (👑 every crown ever earned makes it pay more)
    const v = Math.round(value * this.progress.cashMult * crownMult(this.st));
    this.count('earned', v);
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

  /** Book a flight: a number and one of the 🗺️ routes you've opened (with its fare and length). */
  private newFlight() {
    this.st.seq ??= 101;
    // (one of the destinations that are open and switched on: the 🗺️ map)
    const on = ROUTES.filter((x) => this.routeOn(x));
    const routes = on.length ? on : ROUTES.filter((x) => this.routeOpen(x));
    const r = routes[Math.floor(Math.random() * routes.length)] ?? ROUTES[0];
    return { no: this.st.seq++, place: r.place, fare: routeFare(r, this.routeLv(r)), extra: r.extra };
  }

  // --------------------------------------------------------------------------
  // 🗺️ The destinations map (v0.87: fleet.ts ROUTES, routeMap.ts)
  // --------------------------------------------------------------------------
  /** Is this destination open: from the start, by its tile out on the field, or bought on the map? */
  routeOpen(r: RouteDef) {
    return r.unlock ? this.owns(r.unlock) : !r.cost || !!this.st.routes?.includes(r.id);
  }
  private routeLv(r: RouteDef) {
    return this.st.routeLv?.[r.id] ?? 0;
  }
  /** Open, and not switched off on the map. */
  private routeOn(r: RouteDef) {
    return this.routeOpen(r) && !this.st.routeOff?.includes(r.id);
  }
  /** The next destination to open on the map that your level allows (the cheapest), or null. */
  nextRoute() {
    return ROUTES.filter((r) => r.cost && !this.routeOpen(r) && this.save.level >= (r.level ?? 0)).sort((a, b) => a.cost! - b.cost!)[0] ?? null;
  }
  /** What the map shows of each destination. */
  private routePins(): RoutePin[] {
    return ROUTES.map((r) => {
      const open = this.routeOpen(r), lv = this.routeLv(r);
      let need: string | null = null;
      if (!open && r.unlock) {
        const tile = this.tiles.find((t) => t.def.id === r.unlock)?.def;
        need = `🗺️ Opened by its glowing tile out on the field${tile ? ` ($${tile.cost.toLocaleString('en-US')}, level ${tile.level ?? 1})` : ''}`;
      } else if (!open && this.save.level < (r.level ?? 0)) need = `🔒 Reach level ${r.level} to open it (you are level ${this.save.level}) · $${r.cost!.toLocaleString('en-US')}`;
      return {
        id: r.id, icon: r.icon, name: r.name, at: r.at, blurb: r.blurb,
        state: !open ? 'locked' : this.routeOn(r) ? 'open' : 'off',
        fare: routeFare(r, lv), fareNext: lv < ROUTE_LV_MAX ? routeFare(r, lv + 1) : null,
        extra: r.extra, flown: this.st.routeFlown?.[r.id] ?? 0, lv, lvMax: ROUTE_LV_MAX,
        upCost: open && lv < ROUTE_LV_MAX ? routeLvCost(r, lv) : null,
        openCost: !open && r.cost ? r.cost : null, need,
      };
    });
  }
  /** A button on a destination's card: open it, 📣 advertise it, or switch its flights off and on. */
  private routeAct(id: string, what: 'open' | 'up' | 'toggle') {
    const r = ROUTES.find((x) => x.id === id);
    if (!r) return;
    if (what === 'open') {
      if (this.routeOpen(r) || !r.cost || this.save.level < (r.level ?? 0) || !this.pay(r.cost)) return;
      (this.st.routes ??= []).push(r.id);
      this.progress.addXp(TY.xpFlight * 4);
      this.sfx.unlocked();
      this.hud.banner(`🗺️ ${r.place} is open!`, `Fare ×${r.fare}: some of your flights go there now`, 3200);
    } else if (what === 'up') {
      const lv = this.routeLv(r);
      if (!this.routeOpen(r) || lv >= ROUTE_LV_MAX || !this.pay(routeLvCost(r, lv))) return;
      (this.st.routeLv ??= {})[r.id] = lv + 1; // (an upgrade, for the quests: `tally('ups')` adds these up)
    } else {
      if (!this.routeOpen(r)) return;
      const off = (this.st.routeOff ??= []);
      const k = off.indexOf(r.id);
      if (k >= 0) off.splice(k, 1);
      // (one has to stay on: the planes have to go somewhere)
      else if (ROUTES.filter((x) => this.routeOn(x)).length > 1) off.push(r.id);
      else this.hud.banner('🗺️ One destination has to stay on', 'Switch another one on first', 2200);
      this.sfx.popup();
    }
  }
  // --------------------------------------------------------------------------
  // 👑 The Royal Charter (v0.92: charter.ts): hand the airfield over for crowns, and found a new one
  // --------------------------------------------------------------------------
  private charterPanel: CharterPanel | null = null;
  /** The charter's been taken: nothing more happens here (the game is being loaded again). */
  private chartered = false;
  private perk(id: string) {
    return this.st.perks?.[id] ?? 0;
  }
  /** The 👑 button is there once the Queen has offered a charter (the North Field is open), or you hold crowns. */
  get charterOffered() {
    return !this.learning && (this.owns(CHARTER.needs) || (this.st.crownsAll ?? 0) > 0);
  }
  private charterState(): CharterState {
    const earned = runEarned(this.st);
    const gain = crownsFor(earned);
    const need = !this.owns(CHARTER.needs)
      ? 'Open the North Field (Gate 5) first'
      : gain < 1
        ? `This airfield has to earn $${Math.ceil(earnedFor(1) - earned).toLocaleString('en-US')} more for its first crown`
        : null;
    return { crowns: this.st.crowns ?? 0, all: this.st.crownsAll ?? 0, charters: this.st.charters ?? 0, earned, gain, need, perks: { ...(this.st.perks ?? {}) } };
  }
  openCharter() {
    this.charterPanel ??= new CharterPanel(document.getElementById('hud')!, {
      state: () => this.charterState(),
      buy: (id) => {
        const def = PERKS.find((p) => p.id === id);
        const lv = this.perk(id);
        if (!def || lv >= def.max || (this.st.crowns ?? 0) < perkCost(lv)) return;
        this.st.crowns = (this.st.crowns ?? 0) - perkCost(lv);
        (this.st.perks ??= {})[id] = lv + 1;
        // (💰 seed money is for the NEXT airfield: so that it's worth something today, this one gets the difference now)
        if (id === 'seed') this.addCash(SEED[lv + 1] - SEED[lv]);
        this.sfx.upgrade();
        this.hud.banner(`${def.icon} ${def.name}`, def.says(lv + 1), 2200);
      },
      take: () => {
        if (this.chartered || this.charterState().need) return;
        // (the save becomes a new airfield's, and the game is loaded again on it: nothing here is taken down)
        this.chartered = true;
        const won = takeCharter(this.save);
        writeSave(this.save);
        this.sfx.unlocked();
        this.charterPanel?.close();
        this.hud.banner('👑 The Royal Charter!', `+${won} crowns · a new airfield awaits`, 2600);
        window.setTimeout(() => location.reload(), 1500);
      },
    });
    this.sfx.popup();
    this.charterPanel.open();
  }

  private routeMap: RouteMap | null = null;
  /** Open the 🗺️ map (on `pick`'s card, if given). */
  openRouteMap(pick?: string) {
    this.routeMap ??= new RouteMap(document.getElementById('hud')!, { pins: () => this.routePins(), cash: () => this.save.cash, act: (id, what) => this.routeAct(id, what) });
    this.sfx.popup();
    this.routeMap.open(pick);
  }

  // --------------------------------------------------------------------------
  // ✈️ The flight board: what each gate's plane is doing, and when the next thing happens
  // --------------------------------------------------------------------------
  flightBoard(): FlightRow[] {
    const rows: FlightRow[] = [];
    this.planeInfo().forEach((f) => {
      const g = this.gates[f.gate - 1];
      const kind = f.dir === 'arr' ? 'arr' : 'dep';
      const place = f.place ?? (kind === 'dep' ? 'Next flight' : '');
      const tone = f.tone;
      rows.push({ kind, no: f.flight ? `AA ${f.flight}` : '', place, gate: f.gate, status: f.board, eta: f.eta, tone });
      // (a full gate holds up check-in: say so)
      const waiting = this.pax.atGate[f.gate - 1].length + g.boarding.length;
      if (waiting >= (this.pax.gateCap[f.gate - 1] ?? 6) && !g.plane.parked) rows.push({ kind: 'dep', no: '', place: `Gate ${f.gate} is full`, gate: f.gate, status: `${waiting} WAITING`, eta: g.plane.etaGate(), tone: 'warn' });
    });
    return rows;
  }

  /**
   * ✈️ Everything the flight card and the chips show about each open gate's plane: its flight, who and what is
   * aboard, the step it's on, how long until the next thing, and whether it's waiting for YOU (🗼 clearance).
   */
  planeInfo(): PlaneInfo[] {
    const out: PlaneInfo[] = [];
    this.gates.forEach((g, i) => {
      if (!g.open) return;
      const p = g.plane;
      const seats = p.model.seats.length;
      const kind = (p.model.root.userData.planeType as string | undefined) ?? 'ladybug';
      const pt = FLEET.find((f) => f.id === kind) ?? FLEET[0];
      const dep = p.state === 'parked' || p.state === 'taxiOut' || p.state === 'hold' || p.state === 'lineUp' || p.state === 'takeoff';
      const flight = dep ? p.outbound : p.inbound;
      const per = TY.fuelPerFlight;
      const info: PlaneInfo = {
        gate: i + 1,
        icon: pt.icon,
        type: `${pt.name} · ${seats} seats`,
        flight: flight?.no ?? null,
        place: flight?.place ?? null,
        dir: dep ? 'dep' : 'arr',
        pax: [p.aboard, seats],
        bags: [p.aboard, p.aboard],
        fuel: [per, per],
        step: '',
        short: '',
        board: '',
        eta: null,
        ring: 1,
        tone: 'go',
        pay: dep ? p.aboard * this.ticket : p.aboard * TY.landingFee,
      };
      const set = (step: string, short: string, tone: PlaneInfo['tone'], eta: number | null = null, ring = 1, board = step) =>
        Object.assign(info, { step, short, tone, eta, ring, board });
      switch (p.state) {
        case 'parked': {
          const need = p.aboard + g.boarding.length;
          info.bags = [Math.min(g.bags.count, Math.max(need, 0)), need];
          const fu = this.fuelUnits(g);
          info.fuel = [Math.min(fu, per), per];
          const waiting = this.pax.atGate[i].length + g.boarding.length;
          if (fu < per) set('⛽ NEEDS NECTAR', 'NECTAR', 'warn', null, fu / per, `NEEDS NECTAR ⛽ ${fu}/${per}`);
          else if (p.aboard > 0) {
            const full = p.freeSeats === 0 && !g.boarding.length;
            const done = full || g.boardT >= this.boardWait(g);
            if (done && g.bags.count < p.aboard) set('🧳 NEEDS BAGS', 'BAGS', 'warn', null, g.bags.count / p.aboard, `NEEDS BAGS 🧳 ${g.bags.count}/${p.aboard}`);
            else set('BOARDING', 'BOARDING', 'go', full ? 0 : Math.max(0, this.boardWait(g) - g.boardT), Math.min(1, g.boardT / this.boardWait(g)), `BOARDING ${p.aboard}/${seats}`);
          } else if (waiting > 0) set('BOARDING SOON', 'BOARDING', 'go');
          else set('WAITING FOR PASSENGERS', 'WAITING', 'info', null, 0.15);
          break;
        }
        case 'taxiOut':
          set('TAXIING TO THE RUNWAY', 'TAXI', 'go', p.etaTakeoff(), 1, 'TAXIING');
          break;
        case 'hold':
          if (this.events.runwayBlocked) set('🦎 LIZARD ON THE RUNWAY', '🦎 BLOCKED', 'warn', null, 1, 'RUNWAY BLOCKED 🦎');
          else set('🗼 HOLDING SHORT · NEXT UP', 'HOLDING', 'go', null, 1, 'HOLDING SHORT');
          break;
        case 'lineUp':
          set('LINING UP', 'LINE UP', 'go', p.etaTakeoff(), 1);
          break;
        case 'takeoff':
          // (once it's off the ground there's nothing to count down: it's climbing away)
          if (p.etaTakeoff() === 0) set('CLIMBING OUT ✈️', 'AIRBORNE', 'go', null, 1, 'AIRBORNE');
          else set('TAKING OFF 🛫', 'TAKE-OFF', 'go', p.etaTakeoff(), 1, 'TAKING OFF');
          break;
        case 'route':
          set('ON ITS WAY BACK', 'IN THE AIR', 'info', p.etaLanding(), p.routeFrac, 'ON TIME');
          break;
        case 'holding':
          if (this.events.runwayBlocked) set('🦎 LIZARD ON THE RUNWAY', '🦎 BLOCKED', 'warn', null, 1, 'RUNWAY BLOCKED 🦎');
          else set('🗼 CIRCLING · NEXT TO LAND', 'CIRCLING', 'go', null, 1, 'CIRCLING');
          break;
        case 'landing':
          set('LANDING 🛬', 'LANDING', 'go', p.etaLanding(), 1, 'LANDING');
          break;
        case 'taxiIn':
          set('TAXIING TO THE GATE', 'TAXI', 'go', p.etaGate(), 1, 'TAXIING TO GATE');
          break;
      }
      out.push(info);
    });
    return out;
  }

  /** The little chip under the zone name: the most useful next thing (a problem first, else the soonest). */
  nextChip(): string | null {
    const rows = this.flightBoard();
    const warn = rows.find((r) => r.tone === 'warn' && r.status.startsWith('NEEDS'));
    if (warn) return `⛽ Gate ${warn.gate} needs nectar`;
    const timed = rows.filter((r) => r.eta !== null).sort((a, b) => (a.eta ?? 0) - (b.eta ?? 0))[0];
    if (timed) return `${timed.kind === 'dep' ? '🛫' : '🛬'} ${timed.no ? `${timed.no} · ` : ''}Gate ${timed.gate} · ${clockText(timed.eta)}`;
    return rows.length ? `✈️ Gate ${rows[0].gate}: ${rows[0].status.toLowerCase()}` : null;
  }

  /** Each gate's sign shows its plane's next event; the check-in sign says when the gates are full. */
  private statusT = 0;
  private updateSigns(dt: number) {
    this.statusT -= dt;
    if (this.statusT > 0) return;
    this.statusT = 0.5;
    for (const f of this.planeInfo()) {
      let text = `GATE ${f.gate}`;
      if (f.short === 'NECTAR') text += ' · ⛽ NEEDS NECTAR';
      else if (f.short === 'BAGS') text += ' · 🧳 NEEDS BAGS';
      else if (f.eta !== null) text += ` · ${f.dir === 'dep' ? '🛫' : '🛬'} ${clockText(f.eta)}`;
      this.gates[f.gate - 1].label.setText(text);
    }
    const full = this.gates.every((g, i) => !g.open || this.pax.atGate[i].length >= (this.pax.gateCap[i] ?? 6));
    this.deskSign.setText(this.bagDrop.full ? '🧳 BAG DROP FULL · MOVE THE BAGS' : full ? '🎫 GATES FULL · WAIT FOR A PLANE' : '🎫 CHECK-IN');
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
    if (this.chartered) return; // (👑 handed over: the new airfield is loading)
    const p = this.player.pos;
    const me = this.player;
    const prog = this.progress;
    me.carryMax = CONFIG.player.baseCarry + prog.carryBonus + staffFx.backpack(this.staffLv('you')) + PERK_FX.pack * this.perk('pack');
    me.speedMult = prog.speedMult * 1.6; // (the airfield is big: you walk a bit faster than in the colony)
    me.update(dt, move, this.blockers, walkable);
    p.y = this.groundY(p.x, p.z);
    if (move.lengthSq() > 0.02) this.watch = this.watchAt = null; // (walking brings the camera back to you)
    this.st.x = p.x;
    this.st.z = p.z;
    for (const m of this.idlers) animateCreature(m, dt, 0);
    if (this.checkInAnt) animateCreature(this.checkInAnt, dt, 0);
    if (this.towerAnt) animateCreature(this.towerAnt, dt, 0);
    for (const piece of this.pieces) piece.update?.(dt);
    for (const piece of this.paved.flat()) piece.update?.(dt);
    if (!this.seeDone) {
      this.seeDone = true; // (once everything from the save is standing)
      seeThroughAll(this.scene, [this.player.model.root]);
    }
    const see = this.player.firstPerson ? undefined : (this.watchAt ?? this.focus);
    this.lawn.update(dt, this.camera, see);
    setSee(this.camera, see);
    this.camera.getWorldPosition(this.pax.eye);

    const iv = CONFIG.player.pickupInterval / prog.workMult;

    // 🎒 You pick up as much nectar as you can carry (v0.71: extras go in a 🗑️ bin or the ♻️ recycler), but only
    // the bags the gates' passengers still need (bags can't be thrown away: they're luggage)
    const carrying = (t: string) => me.stack.items.reduce((n, it) => n + (it.type === t ? 1 : 0), 0);
    const open = this.gates.filter((g) => g.open);
    const wantsNectar = me.canTake('nectar');
    const wantsBags = me.canTake('seedbag') && carrying('seedbag') < open.reduce((n, g) => n + Math.max(0, this.bagsNeeded(g)), 0);

    // 🌼 Flowers make nectar; stand at one to take it
    this.flowers.forEach((f, i) => {
      if (!f.piece.root.visible) return;
      f.t += dt;
      if (f.t >= TY.flowerEvery / this.weather.flowerMult / (1 + 0.15 * this.up(`flower${i}.speed`)) && !f.stack.full) {
        f.t = 0;
        const it = f.stack.addInstant('nectar');
        this.flyers.grow(it.mesh, 0.25);
      }
      f.piece.setLevel?.(f.stack.count / f.stack.max);
      this.st.flowers[i] = f.stack.count;
      this.every(f.zone, dt, f.zone.contains(p) && wantsNectar, iv * 1.5, () => {
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
      const hasFuel = me.stack.has('nectar') || me.stack.has('fuel');
      this.every(g.fuelZone, dt, g.fuelZone.contains(p) && hasFuel, iv * 1.5, () => {
        const jet = this.flyers.transferType(me.stack, g.fuel, 'fuel');
        if (jet) this.jetUsed = true;
        if (jet || this.flyers.transferType(me.stack, g.fuel, 'nectar')) {
          this.sfx.drop();
          prog.addXp(TY.xpFuel);
          if (this.fuelUnits(g) >= TY.fuelPerFlight) this.tutorial.did(STEP.fuel);
        }
      });
      // (a full pad, and you're still holding nectar: say where the extras can go)
      if (g.fuelZone.contains(p) && hasFuel && g.fuel.full && (this.padHintT -= dt) <= 0) {
        this.padHintT = 6;
        this.hud.banner('⛽ This FUEL pad is full', this.recycler.open ? 'Extras: the ♻️ recycler turns 3 nectar into jet fuel' : 'Extras: toss them in a 🗑️ bin for a little cash', 2600);
      }
      // 🧳 drop your seed-bags on its BAGS pad (it takes only as many as its passengers need)
      g.bags.max = Math.max(g.bags.count, this.bagsWanted(g));
      this.every(g.bagZone, dt, g.bagZone.contains(p) && me.stack.has('seedbag'), iv, () => {
        if (this.flyers.transferType(me.stack, g.bags, 'seedbag')) {
          this.sfx.drop();
          prog.addXp(TY.xpBag);
          this.tutorial.did(STEP.bags);
        }
      });
      // 📦 and your crates on its CARGO pad (it takes one plane-load)
      if (this.cargoDepot.open) {
        g.cargo.max = Math.max(g.cargo.count, this.cargoCap(g));
        this.every(g.cargoZone, dt, g.cargoZone.contains(p) && me.stack.has('parcel'), iv, () => {
          if (this.flyers.transferType(me.stack, g.cargo, 'parcel')) this.sfx.drop();
        });
        (this.st.cargoPads ??= [])[i] = g.cargo.count;
      }
      this.st.fuel[i] = g.fuel.count;
      this.updateBoarding(g, dt);
      g.plane.update(dt);
    });
    this.updateRunway();

    // 🧳 The BAG DROP: stand on it to pick up the seed-bags
    // (bags waiting, but your backpack is full of other things: say what to do about it)
    if (this.bagDropZone.contains(p) && me.stack.full && this.bagDrop.count > 0 && carrying('seedbag') === 0 && (this.padHintT -= dt) <= 0) {
      this.padHintT = 6;
      this.hud.banner('🎒 Backpack full!', 'Drop the nectar on a FUEL pad, or toss it in a 🗑️ bin, to carry bags', 2800);
    }
    this.every(this.bagDropZone, dt, this.bagDropZone.contains(p) && wantsBags, iv, () => {
      if (me.canTake('seedbag') && this.flyers.transfer(this.bagDrop, me.stack)) this.sfx.pickup();
    });
    // 🕳️ (v0.95) bags come up the tunnel at the north BAG DROP, and you can take them there too
    this.stepTunnel(dt);
    this.every(this.bagDropNZone, dt, this.fieldOpen(FIELDS[1]) && this.bagDropNZone.contains(p) && wantsBags, iv, () => {
      if (me.canTake('seedbag') && this.flyers.transfer(this.bagDropN, me.stack)) this.sfx.pickup();
    });


    // 🍪 The café: take crumbs at the pile, drop them at the kitchen's IN; snacks hop through the hatch
    if (this.cafeOpen) {
      const c = this.cafe;
      c.pile.update(dt);
      c.oven.update(dt);
      if (c.chef) animateCreature(c.chef, dt, 0);
      this.every(c.pile.zone, dt, c.pile.zone.contains(p) && me.canTake('crumb'), iv, () => {
        if (me.canTake('crumb') && this.flyers.transfer(c.pile.stack, me.stack)) this.sfx.pickup();
      });
      this.every(c.oven.inZone, dt, c.oven.inZone.contains(p) && me.stack.has('crumb'), iv, () => {
        if (this.flyers.transferType(me.stack, c.oven.input, 'crumb')) this.sfx.drop();
      });
      this.every(c.shelf, dt, c.oven.output.count > 0 && !c.shelf.full, 0.5, () => this.flyers.transfer(c.oven.output, c.shelf));
    }

    // 🎫 Check-in: you on the CHECK-IN pad, or the Check-in ant (it waits while the BAG DROP is full)
    this.pax.serving = (!!this.checkInAnt || this.deskZone.contains(p)) && !this.bagDrop.full;
    // 🧭 (the travellers' grid follows what is built and shown)
    this.nav.sync(this.blockers);
    this.pax.nav = this.nav;
    this.pax.crossingOpen = () => !this.planeAtCrossing();
    this.pax.update(dt);
    if (this.crowd && this.crowd !== 'loading') this.crowd.step(dt);

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

    // 🎁 the gift shop makes a pollen sweet every few seconds
    if (this.shop.open && !this.shop.shelf.full) {
      this.shop.t += dt * (1 + 0.15 * this.up('shop.stock'));
      if (this.shop.t >= TY.shopEvery) {
        this.shop.t = 0;
        this.flyers.grow(this.shop.shelf.addInstant('candy').mesh, 0.25);
      }
    }
    // 🗑️ Bins: pick up the wrappers in one (to recycle), or toss what you're carrying (not bags, not wrappers)
    let atBin: THREE.Vector3 | null = null;
    let dumping = false;
    for (const b of this.bins) {
      b.label.setText(b.litter.count >= TY.binFull ? '🗑️ FULL' : b.litter.count ? `🗑️ ${b.litter.count}/${TY.binFull}` : '🗑️');
      if (!b.bin.zone.contains(p)) continue;
      atBin = b.bin.mouth;
      // (not bags: they're luggage; not wrappers: they came out of a bin; not jet fuel: it's worth a whole flight)
      const junk = me.stack.items.find((it) => !it.flying && it.type !== 'seedbag' && it.type !== 'leaf' && it.type !== 'fuel' && it.type !== 'parcel');
      dumping = !!junk;
      if (!junk && (me.stack.has('fuel') || (me.stack.has('leaf') && !b.litter.count)) && (this.padHintT -= dt) <= 0) {
        this.padHintT = 5;
        if (me.stack.has('fuel')) this.hud.banner('⛽ Not in the bin!', 'Jet fuel goes on a gate\'s FUEL pad: one drop fuels a whole flight', 3000);
        else this.hud.banner('🍃 Wrappers came out of the bin', 'Drop them on the ♻️ RECYCLER\'s IN pad for cash', 3000);
      }
      this.every(b.bin, dt, !!junk && trash.open(), iv, () => {
        const it = junk && me.stack.popType(junk.type);
        if (!it) return;
        this.flyers.fly(it.mesh, () => b.bin.mouth, () => it.mesh.removeFromParent(), 0.25, 1);
        this.addCash(trash.pay(b.bin.mouth, this.camera));
        this.sfx.trash();
      });
      this.every(b.litter, dt, !junk && me.canTake('leaf') && b.litter.count > 0, iv, () => {
        if (this.flyers.transfer(b.litter, me.stack)) this.sfx.pickup();
      });
    }
    trash.wait(dt, dumping, atBin ?? p, this.camera);

    // 📦 The cargo depot: it packs crates onto its dock; stand in front of it to pick them up
    const cd = this.cargoDepot;
    if (cd.open) {
      cd.stock.max = Math.max(cd.stock.count, TY.cargoMax + 4 * this.up('cargo.cap'));
      cd.t += dt;
      if (cd.t >= TY.cargoEvery / (1 + 0.15 * this.up('cargo.speed')) && !cd.stock.full) {
        cd.t = 0;
        const it = cd.stock.addInstant('parcel');
        this.flyers.grow(it.mesh, 0.25);
      }
      const wanted = this.gates.some((g) => g.open && g.cargo.count < this.cargoCap(g));
      this.every(cd.zone, dt, cd.zone.contains(p) && wanted && me.canTake('parcel') && cd.stock.count > 0, iv, () => {
        if (this.flyers.transfer(cd.stock, me.stack)) this.sfx.pickup();
      });
      this.st.cargo = cd.stock.count;
    }

    // ♻️ The recycler: drop things on IN; 3 nectar -> 1 jet fuel on OUT, anything else -> cash
    const rc = this.recycler;
    if (rc.open) {
      rc.spin.rotation.y += dt * (rc.input.count ? 6 : 0.6);
      const mine = me.stack.items.find((it) => !it.flying && it.type !== 'seedbag' && it.type !== 'fuel' && it.type !== 'parcel');
      this.every(rc.inZone, dt, rc.inZone.contains(p) && !!mine && !rc.input.full, iv, () => {
        if (mine && this.flyers.transferType(me.stack, rc.input, mine.type)) this.sfx.drop();
      });
      this.every(rc.outZone, dt, rc.outZone.contains(p) && me.canTake('fuel') && rc.output.count > 0, iv, () => {
        if (this.flyers.transfer(rc.output, me.stack)) this.sfx.pickup();
      });
      rc.t += dt;
      const top = rc.input.items[rc.input.items.length - 1];
      const blocked = top?.type === 'nectar' && rc.nectar >= TY.recycleNectar - 1 && rc.output.full;
      if (rc.t >= TY.recycleEvery / (1 + 0.2 * this.up('recycler.speed')) && rc.input.canPop() && !blocked) {
        rc.t = 0;
        const it = rc.input.pop()!;
        const at = new THREE.Vector3(AT.recycler.x, 2.5, AT.recycler.z);
        this.flyers.fly(it.mesh, () => at, () => it.mesh.removeFromParent(), 0.25, 0.8);
        if (it.type === 'nectar') {
          if (++rc.nectar >= TY.recycleNectar) {
            rc.nectar = 0;
            this.flyers.grow(rc.output.addInstant('fuel').mesh, 0.25);
          }
        } else this.bill(TY.recyclePay + this.up('recycler.pay'), at);
        this.count('recycled', 1);
      }
    }

    // ⬆️ the STAFF OFFICE pad: step on it to open the upgrades
    this.updateTargets(dt);
    this.applyStaff();
    this.applyUps();
    // 🦎🪶 now and then, something happens
    this.events.update(dt, !this.learning);
    // 👑 the Queen offers a Royal Charter, once this airfield is worth a crown (told once an airfield)
    if (!this.save.paid['ty-charter'] && !this.learning && this.owns(CHARTER.needs) && crownsFor(runEarned(this.st)) >= 1) {
      this.save.paid['ty-charter'] = 1;
      this.hud.banner('👑 The Queen offers a Royal Charter!', 'Tap the 👑 button (top right): found a new airfield, and keep crowns for good', 5200);
      this.sfx.unlocked();
    }
    // 🌙🌧️🌬️ the sky turns (and the corner of the screen tells the time)
    this.weather.update(dt, !this.learning, p, FIELDS.filter((f) => this.fieldOpen(f)));
    this.st.sky = this.weather.saved();
    const zone = `🛫 Anthill Airfield · ${this.weather.label()}`;
    if (zone !== this.zoneShown) this.hud.setZone((this.zoneShown = zone));

    // 🧭 (v0.95) the worker ants go round things on the travellers' grid
    for (const w of this.workers) { w.nav = this.nav; w.update(dt, this.flyers); }
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
    this.updateSigns(dt);
    this.updateRing(dt);
    this.tutorial.update(dt, true);
    if (!this.learning) {
      // 📖 a guide for something you've just picked up for the first time, then the guides, then the 🎯 quest
      if (this.recycler.open && me.stack.has('leaf')) this.guides.offer('item-leaf');
      if (this.jetUsed) this.save.paid['guide-item-fuel'] = 1; // (you've already put one on a FUEL pad: nothing to explain)
      if (me.stack.has('fuel') && !this.guides.busy) this.guides.offer('item-fuel');
      this.guides.update(dt);
      this.quests.update(dt, !this.guides.busy);
    }
    this.updateCarry();
    if (!this.learning) {
      if (!this.goals.started) this.goals.begin();
      this.goals.update(dt);
    }
  }

  // --------------------------------------------------------------------------
  // 🗼 The runway: one bug at a time
  // --------------------------------------------------------------------------
  /**
   * The tower runs the runway by itself (v0.69.2: no taps needed). Planes reach their HOLD line (or circle in) and
   * are cleared a moment later; the runway goes to one cleared plane at a time (landings first: they're burning
   * nectar up there), and is free again once it's airborne, or has rolled out and turned off.
   */
  private updateRunway() {
    const open = this.gates.filter((g) => g.open);
    for (const g of open) {
      const p = g.plane;
      if (p.waiting && !p.cleared && p.waitT >= TY.towerDelay) p.clear();
    }
    // 🛫 (v0.88: each field's runway is handed out by itself: the north field never waits for the first)
    FIELDS.forEach((f, k) => {
      if (this.runwayUser[k] && !this.runwayUser[k]!.onRunway) this.runwayUser[k] = null;
      if (this.runwayUser[k] || (k === 0 && this.events.runwayBlocked)) return; // (🦎 nobody uses the first runway while the lizard's on it)
      const next = open
        .map((g) => g.plane)
        .filter((p) => p.field === f && p.waiting && p.cleared)
        .sort((a, b) => (a.state === 'holding' ? 0 : 1) - (b.state === 'holding' ? 0 : 1) || a.clearedAt - b.clearedAt)[0];
      if (next) {
        next.grant();
        this.runwayUser[k] = next;
      }
    });
  }

  // --------------------------------------------------------------------------
  // 🎯 Picking a plane: tap it (or its chip): a ring under it, its flight card open
  // --------------------------------------------------------------------------
  /** A tap on the 3D view at screen (x, y): the plane nearest the tap (within a thumb's reach), or null. */
  planeAt(x: number, y: number, w: number, h: number): number | null {
    let best: number | null = null;
    let bestD = 46;
    const v = new THREE.Vector3();
    this.gates.forEach((g, i) => {
      if (!g.open || !g.plane.inSight) return;
      v.copy(g.plane.pos).setY(g.plane.pos.y + 1).project(this.camera);
      if (v.z > 1) return;
      const d = Math.hypot((v.x * 0.5 + 0.5) * w - x, (-v.y * 0.5 + 0.5) * h - y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  }

  /** The glowing ring follows the selected plane (on the ground under it, or with it in the air). */
  private ringT = 0;
  private updateRing(dt: number) {
    const g = this.selected !== null ? this.gates[this.selected] : null;
    const show = !!g && g.open && g.plane.inSight;
    this.selRing.visible = show;
    if (!show || !g) return;
    this.ringT += dt;
    const p = g.plane.pos;
    const ground = this.groundY(p.x, p.z);
    const air = p.y > ground + 0.5;
    this.selRing.position.set(p.x, air ? p.y - 0.4 : ground + 0.08, p.z);
    this.selRing.scale.setScalar(g.plane.model.length * 0.72 * (1 + Math.sin(this.ringT * 5) * 0.05));
    this.selRing.rotation.y = this.ringT * 0.8;
  }

  /** Passengers walk out to a fuelled, parked plane and climb on; it goes when full (or after a wait). */
  private updateBoarding(g: Gate, dt: number) {
    const plane = g.plane;
    if (!plane.parked) return;
    if (g.swap && plane.aboard === 0 && !g.boarding.length) {
      g.swap = false;
      const i = this.gates.indexOf(g);
      const was = plane.model.root.userData.planeType as string | undefined;
      if (g.reroll) this.rollType(i);
      const mix = g.reroll;
      g.reroll = false;
      const old = plane.setModel(this.planeModel(i));
      void old;
      if (g.open) this.flyers.grow(plane.model.root);
      shown(plane.model.root, g.open);
      // (a new type at this gate: say so, once per gate and type)
      const type = this.typeFor(i);
      this.applyUps(); // (its seats and speed)
      if (g.open && was && was !== type.id && !mix) this.hud.banner(`${type.icon} Gate ${i + 1} now flies the ${type.name}`, `${plane.model.seats.length} seats`, 2600);
    }
    const fuelled = this.fuelUnits(g) >= TY.fuelPerFlight;
    const nose = g.door;
    // Call more passengers while there are free seats (and the fuel to go)
    const free = plane.freeSeats - g.boarding.length;
    if (fuelled && free > 0 && this.pax.atGate[this.gates.indexOf(g)].length) {
      plane.outbound ??= this.newFlight();
      g.boarding.push(...this.pax.callToBoard(this.gates.indexOf(g), free, g.path));
    }
    for (let i = g.boarding.length - 1; i >= 0; i--) {
      const p = g.boarding[i];
      if (!p.there || p.via.length) continue; // (still on the bridge)
      g.boarding.splice(i, 1);
      if (plane.seat(p.model.root)) {
        p.state = 'seated';
        g.riders.push(p);
        this.sfx.pickup();
      }
    }
    if (plane.aboard > 0) g.boardT += dt;
    // 🧳 everyone aboard needs their bag on the gate's BAGS pad (counted after this frame's passengers sat down)
    const bagsOk = g.bags.count >= plane.aboard;
    const ready = plane.aboard > 0 && !g.boarding.length && (plane.freeSeats === 0 || g.boardT >= this.boardWait(g));
    // (and nothing still flying onto its pads: a stack only gives up items that have landed)
    const settled = g.fuel.canPop() && (plane.aboard === 0 || g.bags.canPop());
    if (ready && fuelled && bagsOk && settled) {
      g.boardT = 0;
      // The nectar flies into the plane, and the bags go into the hold
      // (one drop of ♻️ jet fuel if there is one, else the nectar)
      const jet = g.fuel.popType('fuel');
      for (let n = 0; n < (jet ? 1 : TY.fuelPerFlight); n++) {
        const it = jet ?? g.fuel.pop();
        if (!it) break;
        this.flyers.fly(it.mesh, () => plane.pos.clone().setY(1.5), () => it.mesh.removeFromParent(), 0.3, 1);
      }
      const loaded = plane.aboard;
      for (let n = 0; n < loaded; n++) {
        const it = g.bags.pop();
        if (!it) break;
        this.flyers.fly(it.mesh, () => plane.pos.clone().setY(1.2), () => it.mesh.removeFromParent(), 0.35, 1.2);
      }
      this.st.bagsLoaded = (this.st.bagsLoaded ?? 0) + loaded;
      this.count('bags', loaded);
      // 📦 and whatever freight is on its CARGO pad goes in the hold, as much as it carries (it never waits for any)
      g.cargoAboard = 0;
      for (let n = 0; n < this.cargoCap(g); n++) {
        const it = g.cargo.pop();
        if (!it) break;
        g.cargoAboard++;
        this.flyers.fly(it.mesh, () => plane.pos.clone().setY(1.2), () => it.mesh.removeFromParent(), 0.35, 1.2);
      }
      plane.depart();
      this.sfx.unlocked();
    }
  }

  // --------------------------------------------------------------------------
  // Camera
  // --------------------------------------------------------------------------
  private updateCamera(dt: number) {
    // (a watched plane flying off on its route, out of sight: back to you)
    if (this.watch !== null && !this.gates[this.watch].plane.inSight) this.watch = null;
    if (this.watchAt && this.watchEvent && !this.events.alert()?.at) this.watchAt = null; // (the event's over)
    const target = this.watchAt ? this.tmpCam.copy(this.watchAt).setY(0) : this.watch !== null ? this.tmpCam.copy(this.gates[this.watch].plane.pos).setY(0) : this.player.pos;
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
    this.weather?.follow(target);
  }
  private tmpCam = new THREE.Vector3();
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
    const markers = [
      { x: AT.terminal.x, z: AT.terminal.z, icon: '🐚', label: 'Terminal' },
      { x: AT.nest.x, z: AT.nest.z, icon: '🐜', label: 'Colony' },
      { x: AT.tower.x, z: AT.tower.z, icon: '🗼' },
      ...this.flowers.filter((f) => f.piece.root.visible).map((f) => ({ x: f.zone.x, z: f.zone.z, icon: '🌼', alert: f.stack.full })),
      ...this.gates.flatMap((g, i) => (g.open ? [{ x: g.fuelZone.x, z: g.fuelZone.z, icon: '⛽', label: `Gate ${i + 1}`, alert: this.fuelUnits(g) < TY.fuelPerFlight }] : [])),
      ...this.gates.filter((g) => g.open && g.plane.inSight).map((g) => ({ x: g.plane.pos.x, z: g.plane.pos.z, icon: FLEET.find((f) => f.id === g.plane.model.root.userData.planeType)?.icon ?? '🐞' })),
      { x: this.staffAt.x, z: this.staffAt.z, icon: '⬆️', label: 'Staff' },
      ...this.bins.map((b) => ({ x: b.bin.zone.x, z: b.bin.zone.z, icon: '🗑️', alert: b.litter.count >= TY.binFull })),
      ...(this.recycler.open ? [{ x: AT.recycler.x, z: AT.recycler.z, icon: '♻️', alert: this.recycler.output.full }] : []),
      ...(this.cargoDepot.open ? [{ x: AT.cargo.x, z: AT.cargo.z, icon: '📦', label: 'Cargo', alert: this.cargoDepot.stock.full }] : []),
      ...this.events.markers(),
      { x: this.cashPad.zone.x, z: this.cashPad.zone.z, icon: '💵', alert: this.cashPad.stack.count > 0 },
      { x: this.bagDropZone.x, z: this.bagDropZone.z, icon: '🧳', label: 'Bags', alert: this.bagDrop.count >= TY.bagDropMax - 2 },
      ...(this.fieldOpen(FIELDS[1]) ? [{ x: this.bagDropNZone.x, z: this.bagDropNZone.z, icon: '🧳', label: 'North bags', alert: this.bagDropN.count >= TY.bagDropMax - 2 }] : []),
      ...(this.cafeOpen
        ? [
            { x: this.cafe.pile.zone.x, z: this.cafe.pile.zone.z, icon: '🧺' },
            { x: this.cafe.oven.inZone.x, z: this.cafe.oven.inZone.z, icon: '🍪', label: 'Café', alert: this.cafe.oven.input.count === 0 && this.cafe.shelf.count === 0 },
          ]
        : []),
    ];
    return {
      areas: [
        ...CLEARINGS.map((c) => ({ rect: { minX: c.x - c.r * 0.8, maxX: c.x + c.r * 0.8, minZ: c.z - c.r * 0.8, maxZ: c.z + c.r * 0.8 }, fill: '#c9a46c' })),
        ...FIELDS.filter((f) => this.fieldOpen(f)).map(({ runway: rw }, k) => ({ rect: { minX: rw.x - rw.length / 2, maxX: rw.x + rw.length / 2, minZ: rw.z - rw.width / 2, maxZ: rw.z + rw.width / 2 }, fill: '#8a7558', label: k ? 'RUNWAY 2' : 'RUNWAY' })),
      ],
      trees: [],
      fences: [],
      markers,
      tiles: this.tiles.filter((t) => t.mesh.visible).map((t) => ({ x: t.def.pos[0], z: t.def.pos[1] })),
      player: { x: this.player.pos.x, z: this.player.pos.z, yaw: this.player.model.root.rotation.y },
      target: ((t) => (t ? { x: t.x, z: t.z } : null))(this.tutorial.target ?? this.guides.target ?? this.quests.target),
    };
  }


  // --------------------------------------------------------------------------
  // 📖 Guides, 🎯 quests and "where does this go?" (v0.73)
  // --------------------------------------------------------------------------
  private seeDone = false;
  guides!: Guides;
  quests!: Quests;
  /** A drop of jet fuel has reached a FUEL pad (the recycler's guide), and the hangar's menu has been opened. */
  private jetUsed = false;
  private hangarSeen = false;

  /** A lifetime count by kind (the quests count from these). */
  tally(kind: string): number {
    const sum = (o: Record<string, number> | undefined) => Object.values(o ?? {}).reduce((a, b) => a + b, 0);
    switch (kind) {
      case 'flights': return this.st.flights;
      case 'pax': return this.st.passengers;
      case 'bags': return this.st.bagsLoaded ?? 0;
      case 'landings': return this.st.landings ?? 0;
      case 'ups': return sum(this.st.ups) + sum(this.st.staff) + sum(this.st.routeLv);
      case 'fleet': return this.up('fleet.seats') + this.up('fleet.speed');
      default: return this.st.tally?.[kind] ?? 0;
    }
  }
  /** Something happened: it counts toward today's 📅 goals and the 🎯 quest. */
  private count(kind: GoalKind | 'recycled', n: number) {
    if (kind !== 'recycled') this.goals.add(kind, n);
    if (kind === 'snacks' || kind === 'earned' || kind === 'recycled') (this.st.tally ??= {})[kind] = (this.st.tally?.[kind] ?? 0) + n;
  }

  /** 🧍 Tiny people or bugs as passengers (⚙️ Settings). Their models download the first time it's switched on. */
  get people() {
    return !!this.st.people;
  }
  /** "12/17": how many of the people's models are ready. */
  peopleReady() {
    // (the builder's two bodies: hers, then his)
    const c = this.crowd && this.crowd !== 'loading' ? this.crowd : null;
    return `${(c ? 1 : 0) + (c?.men ? 1 : 0)}/2`;
  }
  /** What Settings says of the builder's women: the DEV Room's own readout (how many drawn, smart FPS, the frame rate). */
  detailText() {
    return this.crowd && this.crowd !== 'loading' ? this.crowd.info() : 'the builder\'s women are loading';
  }
  /** The game's renderer (tycoonMain hands it over: the builder's crowd draws with it) and the crowd itself. */
  renderer: THREE.WebGLRenderer | null = null;
  private crowd: Crowd | 'loading' | null = null;
  setPeople(on: boolean, quiet = false) {
    this.st.people = on;
    this.pax.people = on;
    if (!on) return void (this.pax.crowd = null);
    if (!quiet) this.hud.banner('🧍 Tiny people are on their way', 'New passengers are miniature people: they join as their models arrive', 4200);
    // 👩 the Character Builder's women: its body and hair load once (from the builder's own site), then every woman
    // who walks in is one of them (devRoom.ts's crowd, drawn in this scene)
    if (!this.crowd && this.renderer) {
      this.crowd = 'loading';
      void import('../devRoom')
        .then((room) => room.startDevRoom({ scene: this.scene, camera: this.camera, renderer: this.renderer!, focus: () => this.player.pos }))
        .then(async (crowd) => {
          if (!crowd || !(await crowd.ready)) throw new Error('the builder\'s body did not load');
          this.crowd = crowd;
          this.pax.crowd = this.pax.people ? crowd : null;
          if (this.pax.people) this.pax.hurry();
          if (!quiet && this.pax.people) this.hud.banner('🧍 The tiny people are here!', 'Every traveller has their own hair, face, height and outfit: the men join once theirs is in', 4200);
        })
        .catch((e) => {
          console.warn('No builder crowd', e);
          this.crowd = null;
        });
    } else if (this.crowd && this.crowd !== 'loading') this.pax.crowd = this.crowd;
    // (v0.93.1, Joshua: "replace all the other male models, so it's only the models from CCBS": the story's men are
    // no longer downloaded. Everyone who walks in is the builder's: hers first, his once his body is in.)
  }

  /** 👀 Point the camera at a spot until you walk (a guide's "Show me"). */
  lookAt(at: THREE.Vector3) {
    this.watch = null;
    this.watchAt = at.clone();
    this.watchEvent = false;
    this.hud.banner('👀 Over here!', 'Walk to come back to your ant', 2200);
  }

  private buildGuides() {
    const tw = { scene: this.scene, camera: this.camera, tiles: this.tiles, cashPads: [this.cashPad] };
    this.guides = new Guides(tw, this.hud, this.save, this.guideDefs(), TY_UNLOCKS, (at) => this.lookAt(at));
    const cheapest = () => {
      let best: UnlockTile | null = null;
      for (const t of this.tiles) if (t.mesh.visible && !t.locked && (!best || t.remaining < best.remaining)) best = t;
      return best;
    };
    this.quests = new Quests(tw, this.hud, this.save, this.st, {
      owns: (id) => this.owns(id),
      tally: (k) => this.tally(k),
      tile: (id) => this.tutorial.pathTo(id),
      spot: (what) => {
        if (what === 'hangar') return this.owns('ty-hangar') ? new THREE.Vector3(AT.hangar.x - 14, 0, AT.hangar.z + 5) : this.tutorial.pathTo('ty-hangar');
        const t = this.targets.find((x) => x.can);
        return t ? t.at.clone().setY(0) : null;
      },
      cheapestTile: () => cheapest()?.def ?? null,
      nextPlane: () => {
        const t = FLEET.find((f) => f.unlock && !this.owns(f.unlock));
        return t ? { id: t.unlock!, name: t.name, icon: t.icon, cost: t.cost } : null;
      },
      nextRoute: () => { const r = this.nextRoute(); return r ? { id: r.id, name: r.place, cost: r.cost! } : null; },
      routeOpen: (id) => { const r = ROUTES.find((x) => x.id === id); return !!r && this.routeOpen(r); },
      cafe: () => this.cafeOpen,
      cargo: () => this.cargoDepot.open,
      recycler: () => this.recycler.open,
      fleetMaxed: () => UPS.plane.every((d) => this.up(`fleet.${d.k}`) >= d.max),
      level: () => this.save.level,
      pay: (cash) => {
        this.addCash(cash);
        this.progress.addXp(5);
        this.sfx.cash();
      },
    }, TY_UNLOCKS);
    // 🎒 the backpack's list says where each thing goes
    this.hud.invHelp = (type) => this.whereGoes(type);
  }

  /** "→ a gate's FUEL pad": where the thing you're carrying goes (the 🎒 list, v0.73). */
  private whereGoes(type: string): string {
    const rc = this.recycler.open;
    switch (type) {
      case 'nectar': return rc ? 'a gate\'s FUEL pad · or 3 on ♻️ IN = jet fuel' : 'a gate\'s FUEL pad';
      case 'fuel': return 'any gate\'s FUEL pad (fuels a whole flight)';
      case 'seedbag': return 'a gate\'s BAGS pad';
      case 'parcel': return 'a gate\'s 📦 CARGO pad (paid at take-off)';
      case 'crumb': return 'the 🍪 KITCHEN\'s IN pad';
      case 'leaf': return 'the ♻️ RECYCLER\'s IN pad (cash)';
      default: return rc ? 'a 🗑️ bin or ♻️ IN (cash)' : 'a 🗑️ bin (a little cash)';
    }
  }

  /** The pads that take what you're carrying right now (small green arrows bob over them). */
  private carrySpots(): Zone[] {
    const me = this.player.stack;
    const out: Zone[] = [];
    if (!me.count) return out;
    const open = this.gates.filter((g) => g.open);
    if (me.has('nectar') || me.has('fuel')) for (const g of open) if (!g.fuel.full && this.fuelUnits(g) < TY.fuelPerFlight * 2) out.push(g.fuelZone);
    if (me.has('seedbag')) for (const g of open) if (this.bagsNeeded(g) > 0) out.push(g.bagZone);
    if (me.has('parcel')) for (const g of open) if (g.cargo.count < this.cargoCap(g)) out.push(g.cargoZone);
    if (me.has('crumb') && this.cafeOpen) out.push(this.cafe.oven.inZone);
    const rc = this.recycler;
    if (me.has('leaf') && rc.open) out.push(rc.inZone);
    const junk = me.items.some((it) => !['nectar', 'fuel', 'seedbag', 'crumb', 'leaf', 'parcel'].includes(it.type));
    if (junk) {
      for (const b of this.bins) out.push(b.bin.zone);
      if (rc.open) out.push(rc.inZone);
    }
    return out;
  }
  private carryArrows: THREE.Sprite[] = [];
  private updateCarry() {
    const spots = this.learning ? [] : this.carrySpots();
    const skip = this.guides.target ?? this.quests.target;
    let n = 0;
    for (const z of spots) {
      if (skip && Math.hypot(skip.x - z.x, skip.z - z.z) < 1.5) continue; // (the yellow arrow's already there)
      let a = this.carryArrows[n];
      if (!a) {
        a = new THREE.Sprite(Airfield.dropMat());
        a.scale.set(1.0, 1.0, 1);
        a.renderOrder = 6;
        this.scene.add(a);
        this.carryArrows.push(a);
      }
      a.visible = true;
      a.position.set(z.x, 2.3 + Math.abs(Math.sin(this.arrowT * 4 + n)) * 0.5, z.z);
      if (++n >= 8) break;
    }
    for (let i = n; i < this.carryArrows.length; i++) this.carryArrows[i].visible = false;
  }
  private static dropMaterial: THREE.SpriteMaterial | null = null;
  private static dropMat() {
    if (Airfield.dropMaterial) return Airfield.dropMaterial;
    const c = document.createElement('canvas');
    c.width = c.height = 96;
    const x = c.getContext('2d')!;
    x.translate(48, 48);
    x.fillStyle = '#7CFC9B';
    x.strokeStyle = '#0e3a22';
    x.lineWidth = 6;
    x.lineJoin = 'round';
    x.beginPath();
    x.moveTo(0, 36); x.lineTo(34, -6); x.lineTo(13, -6); x.lineTo(13, -34); x.lineTo(-13, -34); x.lineTo(-13, -6); x.lineTo(-34, -6);
    x.closePath();
    x.stroke();
    x.fill();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return (Airfield.dropMaterial = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  }

  /** What each building covers (its tile sits at its centre): buying it moves you out to its front. */
  private static FOOT: Record<string, { x: number; z: number; r: number; dx?: number; dz?: number }> = {
    'ty-flower2': { ...AT.flowers[1], r: 4.5 },
    'ty-flower3': { ...AT.flowers[2], r: 4.5 },
    ...Object.fromEntries(AT.gates.slice(1).map((g, i) => [`ty-gate${i + 2}`, { ...g, r: 9 }])),
    'ty-cafe': { ...AT.oven, r: 5 },
    'ty-recycler': { ...AT.recycler, r: 5.5 },
    'ty-cargo': { ...AT.cargo, r: 5.5 },
    'ty-hangar': { ...AT.hangar, r: 16, dx: -1, dz: 0.45 },
    'ty-lounge': { ...AT.lounge, r: 6 },
  };
  /** After a building appears: you're never left standing inside it (or in a wall). */
  private freePlayer(id: string) {
    const p = this.player.pos;
    const f = Airfield.FOOT[id];
    if (f && Math.hypot(p.x - f.x, p.z - f.z) < f.r) {
      const d = new THREE.Vector2(f.dx ?? 0, f.dz ?? 1).normalize();
      p.x = f.x + d.x * (f.r + 1.5);
      p.z = f.z + d.y * (f.r + 1.5);
    }
    const hit = (x: number, z: number) =>
      !walkable(x, z) || this.blockers.some((b) => (!b.obj || b.obj.visible) && x > b.minX - 0.9 && x < b.maxX + 0.9 && z > b.minZ - 0.9 && z < b.maxZ + 0.9);
    if (!hit(p.x, p.z)) return;
    for (let r = 1; r < 30; r += 0.75) {
      for (let k = 0; k < 16; k++) {
        const a = Math.PI / 2 + (k / 16) * Math.PI * 2;
        const x = p.x + Math.cos(a) * r;
        const z = p.z + Math.sin(a) * r;
        if (!hit(x, z)) {
          p.x = x;
          p.z = z;
          return;
        }
      }
    }
  }

  /** 📖 The guides: one per thing that needs explaining (see guides.ts). */
  private guideDefs(): GuideDef[] {
    const me = () => this.player.stack;
    const z = (zone: { x: number; z: number }) => new THREE.Vector3(zone.x, 0, zone.z);
    const rc = () => this.recycler;
    const emptiest = () => this.gates.filter((g) => g.open).reduce((a, b) => (this.fuelUnits(b) < this.fuelUnits(a) ? b : a));
    const jetOnPad = () => this.jetUsed || this.gates.some((g) => g.fuel.items.some((it) => it.type === 'fuel'));
    const g2 = this.gates[1];
    return [
      {
        id: 'ty-gate2',
        title: '🐞 Gate 2',
        chain: ['🌼 Nectar', '⛽ Gate 2 FUEL', '🧳 Gate 2 BAGS', '🛫'],
        text: 'A second plane! Each gate has its own <b>FUEL</b> and <b>BAGS</b> pads. Passengers and bags are shared out between the gates by themselves.',
        tip: 'A second ⛽ Fuel Runner and 🧳 Baggage ant (new tiles) keep both gates going.',
        steps: () => [{ text: () => '⛽ Fuel Gate 2: drop nectar on its FUEL pad', target: () => z(g2.fuelZone), done: () => this.fuelUnits(g2) >= TY.fuelPerFlight || !g2.plane.parked, progress: () => Math.min(1, this.fuelUnits(g2) / TY.fuelPerFlight) }],
      },
      {
        id: 'ty-cargo',
        title: '📦 Cargo Depot',
        chain: ['📦 Depot OUT', '📦 a gate\'s CARGO pad', '🛫 paid at take-off'],
        text: 'The depot packs <b>crates</b> onto its dock. Carry them to any gate\'s <b>CARGO</b> pad: the next plane to leave takes as many as it can hold (half its seats), and each one pays as it lifts off, more on a far route.',
        tip: 'A plane never waits for cargo. The 📦 Cargo Ant tiles (by the depot) carry the crates for you.',
        steps: () => {
          const c = this.cargoDepot;
          const onPad = () => this.gates.some((g) => g.open && g.cargo.count > 0) || (this.st.tally?.cargo ?? 0) > 0;
          return [
            { text: () => '📦 Pick up crates at the CARGO DEPOT (stand in front of it)', target: () => z(c.zone), done: () => me().has('parcel') || onPad() },
            { text: () => '📦 Drop them on a gate\'s CARGO pad', target: () => z(this.gates.filter((g) => g.open).reduce((a, b) => (b.cargo.count < a.cargo.count ? b : a)).cargoZone), done: onPad },
          ];
        },
      },
      {
        id: 'ty-cafe',
        title: '🍪 Nectar Café',
        chain: ['🧺 Crumbs', '🔥 Kitchen IN', '🍪 Snacks', '🐛 Passengers buy'],
        text: 'Carry <b>picnic crumbs</b> to the kitchen\'s <b>IN</b> pad. The oven bakes snacks and passes them to the café counter in the terminal <b>by itself</b>: passengers buy one on their way to the gate.',
        tip: 'The 🍪 Crumb Runner tile (by the crumbs) carries the crumbs for you.',
        steps: () => {
          const c = this.cafe;
          const baked = () => c.oven.output.count > 0 || c.shelf.count > 0;
          return [
            { text: () => '🧺 Pick up crumbs at the PICNIC CRUMBS pile', target: () => z(c.pile.zone), done: () => me().has('crumb') || c.oven.input.count > 0 || baked() },
            { text: () => '🔥 Drop them on the KITCHEN\'s IN pad', target: () => z(c.oven.inZone), done: () => c.oven.input.count > 0 || baked() },
            { text: () => '🍪 The snacks go to the CAFÉ counter by themselves. Nothing to carry!', target: () => c.spot.clone().setY(0), done: () => c.shelf.count > 0 },
          ];
        },
      },
      {
        id: 'ty-recycler',
        title: '♻️ Recycler',
        chain: ['💧 3 nectar', '♻️ IN', '⛽ Jet fuel on OUT', '⛽ Gate FUEL pad'],
        text: '<b>3 nectar</b> on IN become <b>1 jet fuel</b> on OUT. Carry it to any gate\'s FUEL pad: one drop fuels a <b>whole flight</b>. Your Fuel Runners fetch it too.<br>🍃 Passengers now leave <b>wrappers</b> in the 🗑️ bins: stand on a bin to take them, then drop them on IN for cash.',
        tip: 'The 🧹 Janitor tile (next to the recycler) empties the bins for you.',
        steps: () => {
          const made = () => rc().output.count > 0 || me().has('fuel') || jetOnPad();
          const inside = () => rc().nectar + rc().input.items.filter((it) => it.type === 'nectar').length;
          return [
            {
              text: () => (me().has('nectar') ? '♻️ Drop the nectar on the RECYCLER\'s IN pad (3 nectar → 1 jet fuel)' : inside() >= TY.recycleNectar ? '⚙️ The recycler is working: jet fuel comes out on OUT' : '💧 Pick up 3 nectar at a flower'),
              target: () => (me().has('nectar') ? z(rc().inZone) : inside() >= TY.recycleNectar ? z(rc().outZone) : z(this.flowers[0].zone)),
              done: made,
              progress: () => Math.min(1, inside() / TY.recycleNectar),
            },
            { text: () => '⛽ Pick up the jet fuel from the OUT pad', target: () => z(rc().outZone), done: () => me().has('fuel') || jetOnPad() },
            { text: () => '⛽ Drop it on a gate\'s FUEL pad: one drop fuels a whole flight', target: () => z(emptiest().fuelZone), done: jetOnPad },
          ];
        },
      },
      {
        id: 'ty-hangar',
        title: '🛖 Hangar',
        chain: ['🛖 Hangar ⬆️', '🐝 Unlock aircraft', '✈️ Gates switch over'],
        text: 'Walk up to the hangar and tap <b>⬆️</b> (or tap the hangar) to unlock bigger aircraft and upgrade the fleet. A new aircraft replaces the old one at <b>each gate as its plane comes home</b>: nothing to assign.',
        steps: () => [{ text: () => '🛖 Walk up to the hangar and tap ⬆️ to see your aircraft', target: () => new THREE.Vector3(AT.hangar.x - 14, 0, AT.hangar.z + 5), done: () => this.hangarSeen }],
      },
      {
        id: 'ty-tower',
        title: '🗼 Control Tower',
        chain: [],
        text: 'The tower gets planes on and off the runway <b>faster</b>: quicker taxi, take-off and landing for every gate. Nothing to carry.',
        look: () => new THREE.Vector3(AT.tower.x, 0, AT.tower.z),
      },
      {
        id: 'ty-shop',
        title: '🎁 Pollen Gift Shop',
        chain: ['🎁 Sweets (made by themselves)', '🐛 Passengers buy'],
        text: 'The shop in the terminal makes pollen sweets <b>by itself</b> and passengers buy them on the way through. Nothing to carry: upgrade it with ⬆️ at the terminal.',
        look: () => this.shop.spot.clone().setY(0),
      },
      {
        id: 'ty-lounge',
        title: '👑 VIP Lounge',
        chain: ['👑 Golden VIPs', '🛋️ Lounge', '✈️ Board first'],
        text: 'Golden VIP passengers now turn up. They pay <b>×3</b>, rest in the lounge and board first. Nothing to carry.',
        look: () => new THREE.Vector3(AT.lounge.x, 0, AT.lounge.z),
      },
      {
        id: 'ty-route-picnic',
        title: '🗺️ New routes',
        chain: ['🗺️ Longer route', '⏱️ Longer flight', '💵 Higher fare'],
        text: 'Some flights now go to the new place. They take longer, but pay a <b>higher fare</b> at take-off and bigger landing fees on the way back. Each route tile opens a longer one.',
      },
      // (what you've just picked up for the first time: no card, the arrow shows where it goes)
      { id: 'item-leaf', title: '🍃 Wrappers', chain: [], text: '', quiet: true, steps: () => [{ text: () => '🍃 Wrappers! Drop them on the ♻️ RECYCLER\'s IN pad for cash', target: () => z(rc().inZone), done: () => !me().has('leaf') }] },
      { id: 'item-fuel', title: '⛽ Jet fuel', chain: [], text: '', quiet: true, steps: () => [{ text: () => '⛽ Jet fuel goes on any gate\'s FUEL pad: one drop fuels a whole flight', target: () => z(emptiest().fuelZone), done: () => !me().has('fuel') }] },
    ];
  }

  /** ⚙️ Settings → 📖 How things work: every guide for what's open. */
  guideList() {
    return this.guides.listHtml((id) => this.owns(id));
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
        html: `<p>Ants now fuel the planes, check passengers in and load the bags. Keep growing: a
          <b>Banker ant</b>, a second <b>nectar flower</b>, <b>Gates 2, 3 and 4</b>, new 🗺️ <b>routes</b>, bigger planes,
          a 🎁 <b>Gift Shop</b> and a 👑 <b>VIP Lounge</b>. The ⬆️ <b>STAFF OFFICE</b> in the terminal upgrades your ants.</p>
          <p>📅 <b>Daily goals</b> start now: finish each day's goals quickly for ⭐⭐⭐ and a cash bonus. Tap the
          📅 bar under the airfield's name to see them. Tap a ✈️ chip at the bottom (or a plane) for its flight card.</p>`,
        button: '✈️ Let\'s fly',
      },
      defs: TY_UNLOCKS,
      steps: (t) => [
        { text: () => '🌼 Walk to the flower and pick up nectar', target: () => t.at(f0.zone) },
        {
          text: () => `⛽ Fuel the ladybug: drop nectar on Gate 1's FUEL pad`,
          target: () => t.at(g0.fuelZone),
          done: () => this.fuelUnits(g0) >= TY.fuelPerFlight || this.st.flights > 0,
          progress: () => Math.min(1, this.fuelUnits(g0) / TY.fuelPerFlight),
        },
        { text: () => '🎫 Go behind the CHECK-IN counter in the 🐚 terminal', target: () => t.at(this.deskZone), done: () => this.st.passengers > 0 },
        {
          // 🧳 the passenger's bag went to the BAG DROP: carry it to the gate
          text: () => (this.player.stack.has('seedbag') ? '🧳 Drop the bag on Gate 1\'s BAGS pad' : '🧳 Pick up the seed-bag at the BAG DROP'),
          target: () => (this.player.stack.has('seedbag') ? t.at(g0.bagZone) : t.at(this.bagDropZone)),
          done: () => g0.bags.count > 0 || this.st.flights > 0 || !g0.plane.parked,
        },
        { text: () => '🛫 Your ladybug boards and taxis out: watch it take off!', target: () => g0.plane.pos.clone(), done: () => this.st.flights > 0 },
        { text: () => '💵 Pick up your cash', target: () => t.at(this.cashPad.zone) },
        t.unlockStep('ty-runner', '⛽ Hire a Fuel Runner ant'),
        t.unlockStep('ty-checkin', '🎫 Hire a Check-in ant'),
        t.unlockStep('ty-bags', '🧳 Hire a Baggage ant'),
      ],
    };
  }

  /** True while the tutorial is still going. */
  get learning() {
    return this.save.tutorial < TUTORIAL_DONE;
  }
}

/** 0:07, 1:12 */
export function clockText(secs: number | null) {
  const s = Math.max(0, Math.ceil(secs ?? 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ----------------------------------------------------------------------------
// 🧱 Footprints for things lying about (v0.92.1)
// ----------------------------------------------------------------------------
/** How tall a stone has to be (in units: a traveller is 4.72) before it's walked round, not over. */
const SOLID_PEBBLE = 1.6;

/** A long thing of `length`, `r` either side of its middle line, turned `yaw` about y (its length along its own x),
 *  as a row of square boxes (the walls are boxes square to the world, so a slanted thing is a row of them). */
function along(x: number, z: number, yaw: number, length: number, r: number): Blocker[] {
  const dx = Math.cos(yaw), dz = -Math.sin(yaw);
  const n = Math.max(1, Math.ceil(length / (r * 1.4)));
  const out: Blocker[] = [];
  for (let i = 0; i < n; i++) {
    const t = ((i + 0.5) / n - 0.5) * (length - r * 0.6);
    const cx = x + dx * t, cz = z + dz * t;
    out.push({ minX: cx - r, maxX: cx + r, minZ: cz - r, maxZ: cz + r });
  }
  return out;
}

/** A prop's footprint: its bounding box on the ground, a little in from its edges. */
function propWalls(root: THREE.Object3D): Blocker[] {
  root.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(root);
  if (b.isEmpty()) return [];
  const w = b.max.x - b.min.x, d = b.max.z - b.min.z;
  // (a long thing turned on the slant: a row along its long side; else one box)
  if (Math.max(w, d) > Math.min(w, d) * 1.6) {
    const yaw = root.rotation.y;
    const box = new THREE.Box3().setFromObject(root.clone().rotateY(-yaw));
    const len = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
    const r = Math.min(box.max.x - box.min.x, box.max.z - box.min.z) * 0.45;
    const long = box.max.x - box.min.x >= box.max.z - box.min.z ? yaw : yaw + Math.PI / 2;
    return along((b.min.x + b.max.x) / 2, (b.min.z + b.max.z) / 2, long, len * 0.92, r);
  }
  const k = 0.42;
  const cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2;
  return [{ minX: cx - w * k, maxX: cx + w * k, minZ: cz - d * k, maxZ: cz + d * k }];
}
