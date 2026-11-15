// ============================================================================
// storyWorld.ts — 🦖 THE STORY, Chapter 1: "The Landing" (v0.63, a test version behind its own save slot).
//
// The first playable slice of the remake plan (the "Anthill Airways Remake Plan" doc): one 10 to 15 minute
// chapter, from an old friend's phone call to the first signal from a radio, to find out whether a trip away
// from camp that's then handed over to a helper is fun enough to repeat.
//
//   🏠 PROLOGUE (your house): the phone rings (Rae, your bush-pilot friend: she's found an island that isn't on
//      any map), you pack (clothes, and your ant farm), you head out the door.
//   ✈️ THE FLIGHT: a cutscene over the ocean, down onto an old overgrown airstrip.
//   ⛽ THE ERRAND: Rae sends you up the trail to an abandoned research camp for fuel. You find the expedition's
//      notebook. Then a ROAR: a rex wrecks the plane while you're away (a cutscene), and Rae is hurt.
//   🏕️ SURVIVE: 💧 water drains while you're out (drink at the stream; run dry and you pass out and wake at camp).
//      Gather wood, build a campfire and a workbench. Your ants escaped in the crash: feed them berries and one
//      becomes your first helper, carrying wood to the workbench (the job you just did by hand).
//   📡 THE RADIO: the workbench makes a radio mast. The radio's power module is dead, and the spare in the
//      research camp is too heavy for you... but a little dinosaur is pinned under a tree the rex knocked down.
//      Free it, feed it, and it trusts you: it carries the module home. The radio crackles: someone heard you.
//
// The current objective is save.tutorial (the Tutorial class shows it in the quest card with the arrow); what
// has happened is save.story.flags. Everything is put back as it was when you load (storyMain.ts saves often).
// ============================================================================
import * as THREE from 'three';
import { CONFIG } from '../data/config';
import { Sfx } from '../core/audio';
import { SaveData, StorySave, writeSave } from '../core/save';
import { Progress } from '../core/progress';
import { Hud } from '../ui/hud';
import { Player, fpFov, handsSpot } from '../actors/player';
import { Route, Worker } from '../actors/worker';
import { CreatureModel, animateCreature, faceToward } from '../actors/models';
import { spawnTree, TreeKind } from '../actors/creatures';
import { castPerson, CastId, Want } from '../actors/cast';
import { makeRex, roar, RexParts } from '../actors/rex';
import { makeHerbivore, HerbParts } from '../actors/herbivore';
import { Flyers, ItemType, Stack, StackItem } from '../world/items';
import { TextSprite, makePad, titleTag } from '../world/labels';
import { Blocker, CashPad, UnlockTile, Zone, gridLayout } from '../world/stations';
import { Step, Tutorial, TutorialScript } from '../world/tutorial';
import { stepTo } from '../world/airportWorld';
import { buildAircraftModel } from '../world/aircraft';
import type { MapView } from '../ui/minimap';
import { Dialogue, Line } from './dialogue';
import { Cutscene, glide } from './cutscene';
import * as D from './storyData';

const { P, T, HOME_X } = D;
const STORY_V = 1;
const mat = (color: number, roughness = 0.8, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
function box(w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) {
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  b.position.set(x, y, z);
  b.castShadow = true;
  b.receiveShadow = true;
  return b;
}
function disc(rx: number, rz: number, m: THREE.Material, y: number, x = 0, z = 0) {
  const d = new THREE.Mesh(new THREE.CircleGeometry(1, 48), m);
  d.scale.set(rx, rz, 1);
  d.rotation.x = -Math.PI / 2;
  d.position.set(x, y, z);
  d.receiveShadow = true;
  return d;
}
/** The same "random" numbers every time (so the jungle grows the same way on every load). */
function seeded(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
/** Show / hide a creature. (The LOD system shows anything on screen again, unless it's marked hidden like this.) */
function setShown(o: THREE.Object3D, on: boolean) {
  o.userData.hidden = !on;
  o.visible = on;
}
/** Items that are part of the story (never dropped when you pass out). */
const STORY_ITEMS: ItemType[] = ['fuel', 'mast', 'radio', 'antfarm', 'clothes'];

// ----------------------------------------------------------------------------
// A pile you take things from (the dresser, the fallen trees, the berry bush, the fuel shed)
// ----------------------------------------------------------------------------
class Pile {
  group = new THREE.Group();
  zone: Zone;
  stack: Stack;
  private t = 0;
  constructor(parent: THREE.Object3D, x: number, z: number, public type: ItemType, count: number, max: number, public regrow: number, private flyers: Flyers, padColor = '#ffe07a', cols = 3) {
    this.group.position.set(x, 0, z);
    parent.add(this.group);
    const pad = makePad(2.8, 2.8, '', padColor);
    pad.position.y = 0.04;
    this.group.add(pad);
    this.zone = new Zone(this.wx(x), z, 1.5, 1.5);
    this.stack = new Stack(this.group, gridLayout(cols, 2, type === 'log' ? 0.42 : 0.5, 0.75, 0.1), max);
    for (let i = 0; i < count; i++) this.stack.addInstant(type);
  }
  /** (piles inside the house: the zone is in world space) */
  private wx(x: number) {
    return x + (this.group.parent?.position.x ?? 0);
  }
  update(dt: number) {
    if (this.regrow <= 0 || this.stack.full) return;
    this.t += dt;
    if (this.t >= this.regrow) {
      this.t = 0;
      this.flyers.grow(this.stack.addInstant(this.type).mesh, 0.25);
    }
  }
}

// ----------------------------------------------------------------------------
// Somewhere you drop things (the suitcase, a build plot, the ants' nest, the workbench...)
// ----------------------------------------------------------------------------
class Bin {
  group = new THREE.Group();
  zone: Zone;
  stack: Stack;
  pad: THREE.Mesh;
  sign: TextSprite | null = null;
  constructor(parent: THREE.Object3D, x: number, z: number, max: number, w = 2.8, label = '', color = '#4fe3ff', y0 = 0.08, cols = 3) {
    this.group.position.set(x, 0, z);
    parent.add(this.group);
    this.pad = makePad(w, w, '', color);
    this.pad.position.y = 0.04;
    this.group.add(this.pad);
    this.zone = new Zone(x + parent.position.x, z, w / 2 + 0.2, w / 2 + 0.2);
    this.stack = new Stack(this.group, gridLayout(cols, 2, 0.5, 0.6, y0), max);
    if (label) {
      this.sign = new TextSprite(0.6, '#ffffff');
      this.sign.setText(label);
      this.sign.sprite.position.set(0, 2.6, 0);
      this.group.add(this.sign.sprite);
    }
  }
  /** Landed items of a type in it. */
  count(type?: ItemType) {
    return this.stack.items.filter((it) => !it.flying && (!type || it.type === type)).length;
  }
  /** Take `n` landed items out for good (used up: a fire, a mast). */
  consume(n: number, type?: ItemType) {
    for (let k = 0; k < n; k++) {
      const it = type ? this.stack.popType(type) : this.stack.pop();
      it?.mesh.removeFromParent();
    }
  }
  show(on: boolean) {
    this.group.visible = on;
  }
}

// ----------------------------------------------------------------------------
type Area = 'home' | 'island';
type Plane = {
  root: THREE.Group;        // where it is (and which way: nose toward +x)
  pitch: THREE.Group;       // nose up / down while flying
  body: THREE.Group;        // the model
  props: THREE.Object3D[];
  wing: THREE.Object3D[];   // the whole high wing (hidden once it's broken)
  broken: THREE.Group;      // the broken wing, the bent prop, the smoke
  mast: THREE.Group;        // the radio mast on the roof (once you've put it up)
  smoke: THREE.Mesh[];
};

export class StoryWorld {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(42, 1, 0.1, 900);
  /** (the Tutorial's arrow needs these; the story has no tiles or cash pads) */
  tiles: UnlockTile[] = [];
  cashPads: CashPad[] = [];
  ups = null;
  player: Player;
  tutorial: Tutorial;
  talk: Dialogue;
  cut = new Cutscene();
  st: StorySave;
  area: Area = 'home';
  private flyers: Flyers;
  private sun = new THREE.DirectionalLight(0xffffff, 2.6);
  private hemi = new THREE.HemisphereLight(0xffffff, 0x5a7a5a, 1.5);
  private camOffset = new THREE.Vector3(0, 16, 15.5);
  private thirdFov = 42;
  private timers = new Map<object, number>();
  private homeG = new THREE.Group();
  private islandG = new THREE.Group();
  private blockersHome: Blocker[] = [];
  private blockersIsland: Blocker[] = [];
  /** A story moment is playing (talking, a cutscene, a card): you can't walk and needs don't drain. */
  private seq: Promise<void> | null = null;
  private t = 0;
  // 🏠 the house
  private phoneRing: TextSprite;
  private phoneZone: Zone;
  private dresser: Pile;
  private desk: Pile;
  private suitcase: Bin;
  private doorZone: Zone;
  // 🏝️ the island
  private plane!: Plane;
  private rae: CreatureModel;
  private raeCrate: THREE.Mesh;
  private fuel: Pile;
  private fuelDrop: Bin;
  private logs: Pile;
  private berries: Pile;
  private campfire: Bin;
  private fireObj = new THREE.Group();
  private flames: THREE.Mesh[] = [];
  private fireLight = new THREE.PointLight(0xff9a3c, 0, 18);
  private benchPlot: Bin;
  private benchObj = new THREE.Group();
  private benchIn: Bin;
  private benchOut: Bin;
  private benchSign = new TextSprite(0.55, '#ffd166');
  private nest: Bin;
  private nestObj = new THREE.Group();
  private runner: Worker | null = null;
  private radio: Bin;
  private dino: CreatureModel & { herb: HerbParts };
  private dinoZone = new Zone(0, 0, 2.4, 2.4);
  private dinoFeed: Stack;
  private dinoLoad: Stack;
  private trapLog: THREE.Group;
  private liftZone: Zone;
  private liftT = 0;
  private trustT = 0;
  private rex: CreatureModel & { rex: RexParts };
  private wreckBits = new THREE.Group();
  private researchZone: Zone;
  private tableZone: Zone;
  private shedZone: Zone;
  private treeSpots: { x: number; z: number; r: number }[] = [];
  private trailSegs: { x0: number; z0: number; x1: number; z1: number }[] = [];
  // 💧 needs (the HUD's pills)
  private needsEl = document.createElement('div');
  private warned = false;
  private passing = false;

  constructor(private hud: Hud, private sfx: Sfx, public save: SaveData, private progress: Progress) {
    this.st = this.loadStory(save);
    this.flyers = new Flyers(this.scene);
    this.talk = new Dialogue(() => ({ id: this.heroId, want: this.heroWant }));
    this.cut.onSkip = () => {
      this.talk.skipping = true;
      this.talk.finish();
    };
    this.scene.add(this.homeG, this.islandG);
    this.homeG.position.x = HOME_X;
    this.scene.add(this.hemi, this.sun, this.sun.target);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -30;
    sc.right = sc.top = 30;
    sc.near = 1;
    sc.far = 90;
    this.sun.shadow.bias = -0.0005;

    // ------------------------------------------------------------------ 🏠 the house
    const H = this.homeG;
    this.buildHouse();
    this.phoneZone = new Zone(HOME_X + P.phone.x, P.phone.z + 1.5, 1.6, 1.4);
    this.phoneRing = new TextSprite(0.7, '#ffd166');
    this.phoneRing.setText('📱 RING RING!');
    this.phoneRing.sprite.position.set(P.phone.x, 2.6, P.phone.z);
    H.add(this.phoneRing.sprite);
    this.dresser = new Pile(H, P.dresser.x - 1.9, P.dresser.z, 'clothes', 2, 2, 0, this.flyers, '#ffe07a', 2);
    this.desk = new Pile(H, P.desk.x, P.desk.z + 1.6, 'antfarm', 1, 1, 0, this.flyers, '#ffe07a', 1);
    this.suitcase = new Bin(H, P.suitcase.x, P.suitcase.z, 3, 2.4, '', '#7df9a0', 0.3, 3);
    this.doorZone = new Zone(HOME_X + P.frontDoor.x, P.house.maxZ - 1.1, 1.6, 0.9);

    // ------------------------------------------------------------------ 🏝️ the island
    const I = this.islandG;
    this.buildIsland();
    this.buildPlane();
    this.rae = castPerson('rae', {}, P.human);
    this.rae.root.position.set(P.rae.x, 0, P.rae.z);
    this.rae.root.rotation.y = Math.PI / 2;
    titleTag(this.rae, '✈️ RAE', 0.55);
    I.add(this.rae.root);
    this.raeCrate = box(1.3, 0.75, 1.0, mat(0x8a6a3e, 0.9), P.raeHurt.x, 0.375, P.raeHurt.z - 0.15);
    this.raeCrate.visible = false;
    I.add(this.raeCrate);
    // ⛽ the fuel shed's cans, and where you leave them by the plane
    this.fuel = new Pile(I, P.fuelShed.x - 0.5, P.fuelShed.z + 2.6, 'fuel', 2, 2, 0, this.flyers, '#ffe07a', 2);
    this.fuelDrop = new Bin(I, P.fuelDrop.x, P.fuelDrop.z, 2, 2.4, '⛽ FUEL', '#ffe07a');
    // 🪵 the fallen trees, 🍓 the berry bush
    this.logs = new Pile(I, P.logs.x, P.logs.z, 'log', T.logPile, T.logPile, T.logRegrow, this.flyers, '#ffe07a', 2);
    this.berries = new Pile(I, P.berries.x, P.berries.z, 'berry', T.berryPile, T.berryPile, T.berryRegrow, this.flyers, '#ffe07a', 3);
    this.decorPiles();
    // 🔥 the campfire and 🛠️ the workbench (plots until they're built)
    this.campfire = new Bin(I, P.campfire.x, P.campfire.z, T.campfire, 3, '', '#ffd23f');
    this.benchPlot = new Bin(I, P.bench.x, P.bench.z, T.bench, 3, '', '#ffd23f');
    this.benchIn = new Bin(I, P.bench.x - 2.2, P.bench.z + 2.4, T.benchMax, 2.2, '🪵 IN', '#4fe3ff', 0.1, 2);
    this.benchOut = new Bin(I, P.bench.x + 2.2, P.bench.z + 2.4, 1, 2.2, '📡 OUT', '#7df9a0');
    this.buildFire();
    this.buildBench();
    // 🐜 the ants' nest (by the tail), 📻 the radio (by the plane's door)
    this.nest = new Bin(I, P.nest.x, P.nest.z, T.antFeed, 2.6, '', '#ffd23f');
    this.buildNest();
    this.radio = new Bin(I, P.radio.x, P.radio.z, 2, 2.6, '📻 RADIO', '#4fe3ff');
    // 🦕 the little dino (pinned under a tree after the rex goes through)
    this.dino = makeHerbivore(5.6);
    this.dino.root.position.set(P.trap.x, 0, P.trap.z);
    this.dino.root.rotation.y = 0.6;
    I.add(this.dino.root);
    this.dinoFeed = new Stack(this.dino.bob, gridLayout(2, 1, 0.4, 0.4, 0), T.dinoFeed);
    const sad = this.dino.herb.saddle;
    this.dinoLoad = new Stack(this.dino.bob, (i, _t, out) => out.set(sad.x, sad.y + 0.25 + i * 0.5, sad.z), 1);
    this.trapLog = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 9, 10), mat(0x6b4a2e, 0.95));
    trunk.rotation.z = Math.PI / 2;
    trunk.castShadow = true;
    this.trapLog.add(trunk);
    for (const x of [-3, 2.5]) {
      const branch = new THREE.Mesh(new THREE.SphereGeometry(1.2, 10, 8), mat(0x3f7f3a, 0.9));
      branch.scale.set(1.2, 0.8, 1);
      branch.position.set(x, 0.6, 0.4);
      this.trapLog.add(branch);
    }
    this.trapLog.position.set(P.trap.x, 2.3, P.trap.z);
    this.trapLog.rotation.y = 0.6;
    I.add(this.trapLog);
    this.liftZone = new Zone(P.trap.x + 3.4, P.trap.z, 1.6, 1.8);
    // 🦖 the rex (only during the cutscene)
    this.rex = makeRex(14, false, { skin: 0x4b5a3a, belly: 0x9a8a62, stripe: 0x2f3a24, eye: 0xffc93c });
    setShown(this.rex.root, false);
    I.add(this.rex.root);
    this.wreckBits.visible = false;
    I.add(this.wreckBits);
    this.researchZone = new Zone(P.research.x, P.research.z, P.research.r - 2, P.research.r - 2);
    this.tableZone = new Zone(P.table.x, P.table.z + 1.6, 1.5, 1.1);
    this.shedZone = new Zone(P.radioShed.x, P.radioShed.z + 3, 3.4, 2.6);

    // ------------------------------------------------------------------ you
    const me = castPerson(this.heroId, this.heroWant, P.human);
    this.player = new Player(this.scene, { model: me, spot: handsSpot(me) });
    this.restore();
    this.needsEl.className = 'needs hidden';
    this.needsEl.innerHTML = `<div class="need water"><span>💧</span><i><b></b></i></div><div class="need health hidden"><span>❤️</span><i><b></b></i></div>`;
    document.querySelector('#hud .tr')?.prepend(this.needsEl);
    this.tutorial = new Tutorial(this, hud, save, storySteps(this));
    this.camera.position.copy(this.player.pos).add(this.camOffset);
    this.camera.lookAt(this.player.pos);
  }

  // --------------------------------------------------------------------------
  // Save / load
  // --------------------------------------------------------------------------
  private loadStory(save: SaveData): StorySave {
    save.paid['tut-intro'] = 1; // (the story has no tutorial welcome card: the phone call is the welcome)
    const fresh: StorySave = {
      v: STORY_V, hero: null, area: 'home', x: HOME_X + P.spawnHome.x, z: P.spawnHome.z, ry: Math.PI, water: 100, health: 100, carry: [],
      flags: {}, plots: {}, bench: { logs: 0, t: 0, made: 0 }, fed: { ants: 0, dino: 0, fuel: 0 },
      dino: { state: 'hidden', x: P.trap.x, z: P.trap.z, carrying: false }, pages: [],
    };
    save.story = { ...fresh, ...(save.story ?? {}) };
    return save.story;
  }

  get heroId(): CastId {
    return this.st.hero?.id ?? 'jack';
  }
  get heroWant() {
    // (st.hero.outfit holds the look's model file: the one picked on the character card)
    return { file: this.st.hero?.outfit as Want['file'], pregnant: this.st.hero?.pregnant };
  }

  /** Copy where everything is into the save (then storyMain writes it). */
  sync() {
    const st = this.st;
    const p = this.player.pos;
    st.x = p.x;
    st.z = p.z;
    st.ry = this.player.model.root.rotation.y;
    st.area = this.area;
    st.carry = this.player.stack.items.map((it) => it.type);
    st.plots.campfire = this.campfire.count();
    st.plots.bench = this.benchPlot.count();
    st.bench.logs = this.benchIn.count('log');
    st.bench.made = this.benchOut.count('mast');
    st.fed.ants = Math.max(st.fed.ants, this.nest.count('berry'));
    st.fed.fuel = Math.max(st.fed.fuel, this.fuelDrop.count('fuel'));
    st.dino.x = this.dino.root.position.x;
    st.dino.z = this.dino.root.position.z;
  }

  /** Put the world back the way the save says it was. */
  private restore() {
    const st = this.st;
    const f = st.flags;
    // 🏠 packing
    const clothes = Math.min(2, f.clothes ?? 0);
    for (let i = 0; i < clothes; i++) {
      this.dresser.stack.pop()?.mesh.removeFromParent();
      this.suitcase.stack.addInstant('clothes');
    }
    if (f.antsPacked) {
      this.desk.stack.pop()?.mesh.removeFromParent();
      this.suitcase.stack.addInstant('antfarm');
    }
    if (f.called) this.phoneRing.sprite.visible = false;
    // ✈️ landed / 💥 wrecked
    if (f.landed) this.parkPlane();
    else this.plane.root.visible = false;
    for (let i = 0; i < Math.min(2, f.fuelTaken ?? 0); i++) this.fuel.stack.pop()?.mesh.removeFromParent();
    if (f.crash) this.wreck(true);
    this.showCamp(!!f.back);
    for (let i = 0; i < st.fed.fuel; i++) this.fuelDrop.stack.addInstant('fuel');
    // 🔥 🛠️
    if (f.campfire) this.buildCampfire(true);
    else for (let i = 0; i < (st.plots.campfire ?? 0); i++) this.campfire.stack.addInstant('log');
    if (f.bench) this.buildWorkbench(true);
    else for (let i = 0; i < (st.plots.bench ?? 0); i++) this.benchPlot.stack.addInstant('log');
    for (let i = 0; i < st.bench.logs; i++) this.benchIn.stack.addInstant('log');
    if (st.bench.made > 0) this.benchOut.stack.addInstant('mast');
    // 🐜
    for (let i = 0; i < Math.min(T.antFeed, st.fed.ants); i++) this.nest.stack.addInstant('berry');
    if (f.runner) this.hireRunner();
    if (f.mast) this.raiseMast();
    // 🦕
    const d = st.dino;
    setShown(this.dino.root, d.state !== 'hidden');
    this.trapLog.visible = d.state === 'trapped';
    if (d.state !== 'trapped') this.dino.root.position.set(d.x, 0, d.z);
    this.dino.herb.mood = d.state === 'trust' ? 'calm' : 'scared';
    for (let i = 0; i < Math.min(T.dinoFeed, st.fed.dino); i++) this.dinoFeed.addInstant('berry');
    if (d.carrying) this.dinoLoad.addInstant('radio');
    else if (!f.signal) this.shedModule.addInstant('radio');
    if (f.signal) this.radio.stack.addInstant('radio');
    // 🧍 you
    this.setArea(st.area);
    this.player.pos.set(st.x, 0, st.z);
    this.player.model.root.rotation.y = st.ry;
    for (const t of st.carry) this.player.stack.addInstant(t as ItemType);
  }

  // --------------------------------------------------------------------------
  // 🏠 Building the house
  // --------------------------------------------------------------------------
  private buildHouse() {
    const G = this.homeG;
    const h = P.house;
    const B = this.blockersHome;
    const block = (x0: number, x1: number, z0: number, z1: number) => B.push({ minX: HOME_X + x0, maxX: HOME_X + x1, minZ: z0, maxZ: z1 });
    // The lawn, the porch path, the street out front
    G.add(disc(70, 70, mat(0x6fb14f, 1), -0.02));
    const path = box(3.2, 0.04, 9, mat(0xcfc7b8, 1), P.frontDoor.x, 0, h.maxZ + 4.5);
    G.add(path, box(80, 0.04, 6, mat(0x55595e, 0.9), 0, 0, h.maxZ + 12));
    // Floors: wood in the living room, carpet in the bedroom, a rug by the couch
    G.add(box(P.partition.x - h.minX, 0.06, h.maxZ - h.minZ, mat(0xb9895a, 0.7), (h.minX + P.partition.x) / 2, 0, 0));
    G.add(box(h.maxX - P.partition.x, 0.06, h.maxZ - h.minZ, mat(0x8fa6c8, 1), (h.maxX + P.partition.x) / 2, 0, 0));
    G.add(box(5.5, 0.07, 3.6, mat(0xc0584a, 1), P.couch.x, 0, P.couch.z - 2.6));
    // Walls (cut low so the camera sees in), with a gap for the front door and one into the bedroom
    const wall = mat(0xf1e6d2, 0.9);
    const W = 0.3;
    const wh = h.wallH;
    const wallX = (x0: number, x1: number, z: number) => {
      G.add(box(x1 - x0, wh, W, wall, (x0 + x1) / 2, wh / 2, z));
      block(x0, x1, z - W / 2, z + W / 2);
    };
    const wallZ = (z0: number, z1: number, x: number) => {
      G.add(box(W, wh, z1 - z0, wall, x, wh / 2, (z0 + z1) / 2));
      block(x - W / 2, x + W / 2, z0, z1);
    };
    wallX(h.minX, h.maxX, h.minZ);
    wallX(h.minX, P.frontDoor.from, h.maxZ);
    wallX(P.frontDoor.to, h.maxX, h.maxZ);
    wallZ(h.minZ, h.maxZ, h.minX);
    wallZ(h.minZ, h.maxZ, h.maxX);
    wallZ(h.minZ, P.partition.doorFrom, P.partition.x);
    wallZ(P.partition.doorTo, h.maxZ, P.partition.x);
    // Windows (light blue panes on top of the walls)
    const glass = new THREE.MeshStandardMaterial({ color: 0xbfe6ff, roughness: 0.1, transparent: true, opacity: 0.7 });
    for (const x of [-5, 5]) G.add(box(3, 0.5, 0.34, glass, x, wh - 0.3, h.minZ));
    // The front door (open), a doormat
    const door = box(0.12, 2.2, 3, mat(0x7a4b2a, 0.7), P.frontDoor.from + 0.1, 1.1, h.maxZ + 1.5);
    G.add(door, box(2.2, 0.03, 1.2, mat(0x6b5a3a, 1), P.frontDoor.x, 0.04, h.maxZ - 0.9));
    const exit = new TextSprite(0.6, '#7df9a0');
    exit.setText('🚪 FRONT DOOR');
    exit.sprite.position.set(P.frontDoor.x, 2.4, h.maxZ - 0.4);
    G.add(exit.sprite);
    // Living room: couch, coffee table, TV, the phone on its side table, your desk (the ant farm's on it)
    const c = P.couch;
    G.add(box(5, 0.7, 1.6, mat(0x3f6e8c, 0.9), c.x, 0.35, c.z), box(5, 1.1, 0.4, mat(0x34607c, 0.9), c.x, 0.75, c.z + 0.8));
    block(c.x - 2.5, c.x + 2.5, c.z - 0.8, c.z + 1);
    G.add(box(2.4, 0.45, 1.2, mat(0x8a5a33, 0.6), c.x, 0.225, c.z - 2.6));
    G.add(box(3.6, 0.6, 0.8, mat(0x3b2a1e, 0.6), c.x, 0.3, h.minZ + 0.6), box(3, 1.6, 0.12, mat(0x111418, 0.3), c.x, 1.4, h.minZ + 0.6));
    block(c.x - 1.8, c.x + 1.8, h.minZ, h.minZ + 1);
    const ph = P.phone;
    G.add(box(1.2, 0.8, 1.0, mat(0x8a5a33, 0.6), ph.x, 0.4, ph.z), box(0.25, 0.04, 0.45, mat(0x222831, 0.3), ph.x, 0.82, ph.z));
    const screen = box(0.2, 0.02, 0.38, new THREE.MeshStandardMaterial({ color: 0x9fe8ff, emissive: 0x3fbfff, emissiveIntensity: 1.2 }), ph.x, 0.85, ph.z);
    G.add(screen);
    block(ph.x - 0.6, ph.x + 0.6, ph.z - 0.5, ph.z + 0.5);
    const dk = P.desk;
    G.add(box(3.2, 0.9, 1.3, mat(0x9b6b3f, 0.6), dk.x, 0.45, dk.z), box(1, 0.6, 1, mat(0x333a44, 0.7), dk.x + 0.6, 0.3, dk.z + 1.3));
    block(dk.x - 1.6, dk.x + 1.6, dk.z - 0.65, dk.z + 0.65);
    // (a little sign so you know the ant farm is yours)
    const farmTag = new TextSprite(0.5, '#ffd166');
    farmTag.setText('🐜 YOUR ANT FARM');
    farmTag.sprite.position.set(dk.x, 2.2, dk.z + 1.6);
    G.add(farmTag.sprite);
    // A plant and a lamp
    G.add(box(0.7, 0.6, 0.7, mat(0xb5652b, 0.8), h.minX + 0.8, 0.3, h.maxZ - 0.8));
    const leaves = new THREE.Mesh(new THREE.SphereGeometry(0.8, 10, 8), mat(0x3f8f3a, 0.8));
    leaves.position.set(h.minX + 0.8, 1.2, h.maxZ - 0.8);
    G.add(leaves);
    // Bedroom: bed, dresser, the open suitcase on the floor
    const bd = P.bed;
    G.add(box(3.4, 0.6, 4.6, mat(0x6b4a2e, 0.7), bd.x, 0.3, bd.z), box(3.2, 0.3, 4.2, mat(0xf4f1ea, 0.9), bd.x, 0.75, bd.z + 0.1));
    G.add(box(3.25, 0.32, 2.6, mat(0x2d6cdf, 0.9), bd.x, 0.8, bd.z + 0.9), box(1.2, 0.25, 0.7, mat(0xffffff, 0.9), bd.x - 0.8, 0.95, bd.z - 1.6), box(1.2, 0.25, 0.7, mat(0xffffff, 0.9), bd.x + 0.8, 0.95, bd.z - 1.6));
    block(bd.x - 1.7, bd.x + 1.7, bd.z - 2.3, bd.z + 2.3);
    const dr = P.dresser;
    G.add(box(1.2, 1.4, 2.6, mat(0x8a5a33, 0.6), dr.x, 0.7, dr.z));
    for (const y of [0.35, 0.8, 1.2]) G.add(box(1.25, 0.05, 2.4, mat(0x6b4426, 0.6), dr.x, y, dr.z));
    block(dr.x - 0.6, dr.x + 0.6, dr.z - 1.3, dr.z + 1.3);
    const sc = P.suitcase;
    G.add(box(1.9, 0.3, 1.3, mat(0x2f6fb3, 0.6), sc.x, 0.15, sc.z));
    const lid = box(1.9, 1.2, 0.12, mat(0x2a5f98, 0.6), sc.x, 0.75, sc.z - 0.7);
    G.add(lid);
    const tag = new TextSprite(0.5, '#7df9a0');
    tag.setText('🧳 SUITCASE');
    tag.sprite.position.set(sc.x, 2.3, sc.z);
    G.add(tag.sprite);
  }

  // --------------------------------------------------------------------------
  // 🏝️ Building the island
  // --------------------------------------------------------------------------
  private buildIsland() {
    const I = this.islandG;
    const L = P.land;
    // The ocean (a scrolling sparkle texture), the shallows, the beach, the grass
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d')!;
    g.fillStyle = '#1f7fc4';
    g.fillRect(0, 0, 256, 256);
    const rnd = seeded(7);
    for (let i = 0; i < 160; i++) {
      g.fillStyle = `rgba(255,255,255,${0.05 + rnd() * 0.17})`;
      g.fillRect(rnd() * 256, rnd() * 256, 6 + rnd() * 20, 1.5 + rnd() * 1.5);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(60, 60);
    const ocean = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.25, metalness: 0.1 }));
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.y = -0.45;
    I.add(ocean);
    this.oceanTex = tex;
    I.add(disc(L.rx + 14, L.rz + 14, new THREE.MeshStandardMaterial({ color: 0x46c6c9, roughness: 0.3, transparent: true, opacity: 0.75 }), -0.4, L.x, L.z));
    I.add(disc(L.rx + 5, L.rz + 5, mat(0xf1d9a0, 1), -0.08, L.x, L.z));
    I.add(disc(L.rx, L.rz, mat(0x5fa645, 1), 0, L.x, L.z));
    // Clearings: the camp (worn grass), the research camp (bare dirt)
    I.add(disc(24, 18, mat(0x7fb257, 1), 0.01, -2, 21));
    I.add(disc(P.research.r, P.research.r, mat(0x9c8158, 1), 0.012, P.research.x, P.research.z));
    // The old airstrip: packed dirt, grass growing through, faded edge markers
    const s = P.strip;
    I.add(box(s.to - s.from, 0.03, s.w, mat(0xb49a6a, 1), (s.from + s.to) / 2, 0.0, s.z));
    for (let x = s.from + 3; x < s.to; x += 7) {
      for (const side of [-1, 1]) I.add(box(1.4, 0.06, 0.4, mat(0xe8e2d0, 0.8), x, 0.02, s.z + side * (s.w / 2 - 0.4)));
      I.add(disc(1.2 + rnd(), 0.8 + rnd() * 0.6, mat(0x6fa84f, 1), 0.035, x + 2, s.z + (rnd() - 0.5) * 4));
    }
    const sockPole = box(0.12, 4, 0.12, mat(0xdddddd, 0.5), s.to - 4, 2, s.z - 6);
    const sock = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.6, 10, 1, true), mat(0xff7a1a, 0.6));
    sock.rotation.z = Math.PI / 2 + 0.3;
    sock.position.set(s.to - 3.2, 3.6, s.z - 6);
    I.add(sockPole, sock);
    // The stream, east to west across the trail (stepping stones where the trail crosses)
    const water = new THREE.MeshStandardMaterial({ color: 0x3fa9e0, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.85 });
    const stream = box(130, 0.04, P.stream.half * 2, water, 0, 0.02, P.stream.z);
    stream.castShadow = false;
    I.add(stream);
    for (const x of [-0.9, 0.9]) I.add(box(0.9, 0.18, 0.9, mat(0x8d8d8d, 0.9), x, 0.06, P.stream.z + (x > 0 ? 0.6 : -0.6)));
    const drink = new TextSprite(0.5, '#9fe8ff');
    drink.setText('💧 STREAM: STAND IN IT TO DRINK');
    drink.sprite.position.set(-6, 1.8, P.stream.z);
    I.add(drink.sprite);
    // The trail (sandy segments) from the camp to the research camp
    const sand = mat(0xd8c08a, 1);
    for (let i = 0; i < P.trail.length - 1; i++) {
      const [x0, z0] = P.trail[i];
      const [x1, z1] = P.trail[i + 1];
      const len = Math.hypot(x1 - x0, z1 - z0);
      const seg = new THREE.Mesh(new THREE.PlaneGeometry(3.2, len + 3), sand);
      seg.rotation.x = -Math.PI / 2;
      seg.rotation.z = -Math.atan2(x1 - x0, -(z1 - z0)) ;
      seg.position.set((x0 + x1) / 2, 0.02, (z0 + z1) / 2);
      seg.receiveShadow = true;
      I.add(seg);
      this.trailSegs.push({ x0, z0, x1, z1 });
    }
    this.buildResearchCamp();
    // The volcano, far off to the north, smoking
    const volcano = new THREE.Mesh(new THREE.CylinderGeometry(14, 60, 70, 28, 1, true), mat(0x4e3b33, 1));
    volcano.position.set(-40, 33, -300);
    I.add(volcano);
    for (let i = 0; i < 5; i++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(8, 10, 8), new THREE.MeshStandardMaterial({ color: 0x8a8a8a, transparent: true, opacity: 0.45, roughness: 1 }));
      puff.position.set(-40 + i * 3, 74 + i * 9, -300);
      I.add(puff);
    }
    // The jungle: trees everywhere except the trail, the clearings and the airstrip
    this.plantJungle(rnd);
  }

  private oceanTex: THREE.CanvasTexture | null = null;

  /** Distance from (x, z) to the trail. */
  private trailDist(x: number, z: number) {
    let best = Infinity;
    for (const s of this.trailSegs) {
      const dx = s.x1 - s.x0;
      const dz = s.z1 - s.z0;
      const k = THREE.MathUtils.clamp(((x - s.x0) * dx + (z - s.z0) * dz) / (dx * dx + dz * dz), 0, 1);
      best = Math.min(best, Math.hypot(x - (s.x0 + dx * k), z - (s.z0 + dz * k)));
    }
    return best;
  }

  /** Clear ground: places things are, and paths. */
  private isClear(x: number, z: number, pad = 0) {
    if (this.trailDist(x, z) < 4.5 + pad) return true;
    if (Math.hypot((x + 2) / 26, (z - 21) / 20) < 1) return true;                         // the camp
    if (Math.hypot(x - P.research.x, z - P.research.z) < P.research.r + 2 + pad) return true; // the research camp
    if (Math.abs(z - P.strip.z) < P.strip.w / 2 + 4 && x > P.strip.from - 6 && x < P.strip.to + 6) return true;
    if (Math.abs(z - P.stream.z) < P.stream.half + 1.2) return true;
    if (Math.hypot(x - P.logs.x, z - P.logs.z) < 6 || Math.hypot(x - P.berries.x, z - P.berries.z) < 5) return true;
    if (Math.hypot(x - P.trap.x, z - P.trap.z) < 7) return true;
    return false;
  }

  private plantJungle(rnd: () => number) {
    const L = P.land;
    const kinds: TreeKind[] = ['t-banyan', 't-fern', 't-monkeypuzzle', 't-conifer', 't-fern'];
    const bush = mat(0x3d7f35, 0.9);
    const bush2 = mat(0x4f9a3c, 0.9);
    let n = 0;
    for (let i = 0; i < 900 && n < 120; i++) {
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd()) * 0.92;
      const x = L.x + Math.cos(a) * L.rx * r;
      const z = L.z + Math.sin(a) * L.rz * r;
      if (this.isClear(x, z, 1.5)) continue;
      const edge = r > 0.85;
      const t = spawnTree(edge ? 't-palm' : kinds[Math.floor(rnd() * kinds.length)], 6 + rnd() * 4);
      if (t) {
        t.position.set(x, 0, z);
        t.rotation.y = rnd() * Math.PI * 2;
        this.islandG.add(t);
      } else {
        // (no tree models: a simple trunk + crown)
        this.islandG.add(box(0.5, 5, 0.5, mat(0x6b4a2e), x, 2.5, z));
        const crown = new THREE.Mesh(new THREE.SphereGeometry(2.4, 10, 8), bush);
        crown.position.set(x, 5.5, z);
        this.islandG.add(crown);
      }
      this.treeSpots.push({ x, z, r: 1.6 });
      n++;
    }
    // Bushes along the trail's edges (the jungle crowding in)
    for (let i = 0; i < 400 && n < 260; i++) {
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd()) * 0.9;
      const x = L.x + Math.cos(a) * L.rx * r;
      const z = L.z + Math.sin(a) * L.rz * r;
      if (this.isClear(x, z, -1.2)) continue;
      const b = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), rnd() > 0.5 ? bush : bush2);
      const k = 1 + rnd() * 1.2;
      b.scale.set(k * 1.3, k * 0.8, k * 1.2);
      b.position.set(x, k * 0.45, z);
      b.castShadow = true;
      this.islandG.add(b);
      n++;
    }
  }

  private buildResearchCamp() {
    const I = this.islandG;
    const R = P.research;
    const plank = mat(0x8a7356, 0.95);
    const roof = mat(0x5b6b4a, 0.9);
    const hut = (x: number, z: number, w: number, d: number, ry: number) => {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.rotation.y = ry;
      g.add(box(w, 2.6, 0.25, plank, 0, 1.3, -d / 2), box(0.25, 2.6, d, plank, -w / 2, 1.3, 0), box(0.25, 2.6, d, plank, w / 2, 1.3, 0));
      g.add(box(w * 0.3, 2.6, 0.25, plank, -w * 0.35, 1.3, d / 2), box(w * 0.3, 2.6, 0.25, plank, w * 0.35, 1.3, d / 2));
      const top = box(w + 0.8, 0.2, d + 0.8, roof, 0, 2.8, 0);
      top.rotation.z = 0.08;
      g.add(top);
      // vines
      for (let i = 0; i < 3; i++) g.add(box(0.15, 1.6, 0.15, mat(0x3f7f3a, 0.9), -w / 2 + i * w * 0.4, 1.8, d / 2 + 0.15));
      I.add(g);
      this.blockersIsland.push({ minX: x - w / 2 - 0.2, maxX: x + w / 2 + 0.2, minZ: z - d / 2 - 0.2, maxZ: z + d / 2 - 0.6 });
    };
    hut(R.x - 2, R.z - 9, 7, 5, 0);
    hut(R.x + 11, R.z - 8, 5, 4.5, -0.2);
    // The radio shed and the fuel shed (open fronts)
    const shed = (x: number, z: number, label: string) => {
      I.add(box(5.5, 2.4, 0.25, plank, x, 1.2, z - 1.6), box(0.25, 2.4, 3.2, plank, x - 2.7, 1.2, z), box(0.25, 2.4, 3.2, plank, x + 2.7, 1.2, z));
      I.add(box(6.2, 0.18, 4, roof, x, 2.5, z));
      const t = new TextSprite(0.55, '#ffe7b0');
      t.setText(label);
      t.sprite.position.set(x, 3.4, z);
      I.add(t.sprite);
      this.blockersIsland.push({ minX: x - 2.9, maxX: x + 2.9, minZ: z - 1.8, maxZ: z - 1.2 });
    };
    shed(P.fuelShed.x, P.fuelShed.z, '⛽ FUEL SHED');
    shed(P.radioShed.x, P.radioShed.z, '📻 RADIO SHED');
    // Drums in the fuel shed (empty, rusted: just two cans left), the heavy module on a crate in the radio shed
    for (const dx of [-1.6, 1.5]) {
      const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.3, 12), mat(0x8a3a24, 0.8, 0.2));
      drum.position.set(P.fuelShed.x + dx, 0.65, P.fuelShed.z - 0.6);
      drum.castShadow = true;
      I.add(drum);
    }
    I.add(box(1.4, 0.8, 1.2, mat(0x6b5a3a, 0.9), P.radioShed.x, 0.4, P.radioShed.z - 0.3));
    this.shedModule = new Stack(this.islandG, (_i, _t, out) => out.set(P.radioShed.x, 1.05, P.radioShed.z - 0.3), 1);
    // The table with the notebook, a toppled chair, the camp's sign
    const tb = P.table;
    I.add(box(2.4, 0.9, 1.2, mat(0x7a5a3a, 0.8), tb.x, 0.45, tb.z), box(0.5, 0.06, 0.65, mat(0xe9dfc4, 0.9), tb.x + 0.2, 0.93, tb.z));
    const chair = box(0.8, 0.8, 0.8, mat(0x5b4026, 0.8), tb.x - 1.8, 0.3, tb.z + 0.6);
    chair.rotation.z = 1.4;
    I.add(chair);
    this.blockersIsland.push({ minX: tb.x - 1.2, maxX: tb.x + 1.2, minZ: tb.z - 0.6, maxZ: tb.z + 0.6 });
    const sign = new TextSprite(0.8, '#ffe7b0');
    sign.setText('🏚️ RESEARCH STATION');
    sign.sprite.position.set(P.trail[P.trail.length - 1][0] - 4, 3.2, P.trail[P.trail.length - 1][1]);
    I.add(sign.sprite);
    const note = new TextSprite(0.45, '#ffffff');
    note.setText('📖');
    note.sprite.position.set(tb.x + 0.2, 1.9, tb.z);
    note.sprite.userData.bob = true;
    this.noteIcon = note;
    I.add(note.sprite);
  }
  private shedModule!: Stack;
  private noteIcon!: TextSprite;

  /** Fallen trunks behind the log pile, a berry bush behind the berries. */
  private decorPiles() {
    const I = this.islandG;
    for (const [dx, dz, ry] of [[-1, -3.2, 0.3], [1.5, -3.6, -0.2], [0.2, -4.6, 0.1]]) {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 7, 10), mat(0x6b4a2e, 0.95));
      t.rotation.set(0, ry, Math.PI / 2);
      t.position.set(P.logs.x + dx, 0.5, P.logs.z + dz);
      t.castShadow = true;
      I.add(t);
    }
    const tl = new TextSprite(0.55, '#ffe7b0');
    tl.setText('🪵 FALLEN TREES');
    tl.sprite.position.set(P.logs.x, 2.6, P.logs.z - 3);
    I.add(tl.sprite);
    const bush = mat(0x2f7a35, 0.85);
    const berry = mat(0xc2185b, 0.4);
    for (const [dx, dz, k] of [[-1.2, -2.6, 1.3], [1.1, -2.8, 1.1], [0, -3.8, 1.4]]) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), bush);
      b.scale.set(k * 1.2, k, k);
      b.position.set(P.berries.x + dx, k * 0.8, P.berries.z + dz);
      b.castShadow = true;
      I.add(b);
      for (let i = 0; i < 6; i++) {
        const bb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 5), berry);
        bb.position.set(P.berries.x + dx + Math.cos(i) * k, k * 0.8 + Math.sin(i * 2) * 0.5, P.berries.z + dz + Math.sin(i) * k * 0.9);
        I.add(bb);
      }
    }
    const tb = new TextSprite(0.55, '#ffe7b0');
    tb.setText('🍓 BERRY BUSH');
    tb.sprite.position.set(P.berries.x, 3.2, P.berries.z - 3);
    I.add(tb.sprite);
  }

  // --------------------------------------------------------------------------
  // ✈️ Rae's plane
  // --------------------------------------------------------------------------
  private buildPlane() {
    const built = buildAircraftModel('cessna');
    const body = built.group;
    body.scale.setScalar(P.plane.scale);
    const pitch = new THREE.Group();
    pitch.add(body);
    const root = new THREE.Group();
    root.add(pitch);
    root.rotation.y = Math.PI; // (the model's nose is -x: turned round, it lands heading east)
    this.islandG.add(root);
    // The wing is the long flat box (and its tips + struts): find them by size
    const wing: THREE.Object3D[] = [];
    for (const o of body.children) {
      const g = (o as THREE.Mesh).geometry as THREE.BoxGeometry | undefined;
      const p = g?.parameters as { width: number; height: number; depth: number } | undefined;
      if (!p) continue;
      if (p.depth > 10 || (p.depth === 0.6 && p.height === 0.3) || (p.width === 0.08 && p.height === 1.9)) wing.push(o);
    }
    // The broken version: one half of the wing snapped and lying on the ground, the other drooping; a bent prop
    const broken = new THREE.Group();
    broken.visible = false;
    const white = mat(0xf4f6f8, 0.4);
    const half1 = box(1.6, 0.14, 5.6, white, -0.6, 2.2, -2.9);
    half1.rotation.x = 0.28;
    const half2 = box(1.6, 0.14, 5.4, white, -0.3, 0.4, 7.2);
    half2.rotation.set(0.12, 0.5, 0.25);
    const tip = box(1.0, 0.3, 0.6, mat(0xc0392b, 0.45), -0.6, 1.4, -5.4);
    broken.add(half1, half2, tip);
    for (let i = 0; i < 5; i++) broken.add(box(0.3 + i * 0.1, 0.06, 0.4, white, -2 + i * 0.9, 0.08, 4 + (i % 2) * 1.5));
    body.add(broken);
    // The radio mast (on the roof, once you've built one)
    const mast = latticeMast(3.4);
    this.mastLight = mast.userData.light as THREE.Mesh;
    mast.position.set(0.6, 2.4, 0);
    mast.visible = false;
    body.add(mast);
    const smoke: THREE.Mesh[] = [];
    for (let i = 0; i < 6; i++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), new THREE.MeshStandardMaterial({ color: 0x5a5a5a, transparent: true, opacity: 0.5, roughness: 1 }));
      puff.visible = false;
      this.islandG.add(puff);
      smoke.push(puff);
    }
    this.plane = { root, pitch, body, props: built.spinners, wing, broken, mast, smoke };
    this.blockersIsland.push({ minX: P.plane.x - 8.6, maxX: P.plane.x + 6.2, minZ: P.plane.z - 1.2, maxZ: P.plane.z + 1.2 });
  }

  private parkPlane() {
    const pl = this.plane;
    pl.root.visible = true;
    pl.root.position.set(P.plane.x, 0, P.plane.z);
    pl.pitch.rotation.z = 0;
  }

  /** 💥 What the rex leaves: the wing snapped, the plane down on one side, smoke, your ant farm in pieces. */
  private wreck(instant = false) {
    const pl = this.plane;
    this.parkPlane();
    for (const o of pl.wing) o.visible = false;
    pl.broken.visible = true;
    pl.root.rotation.x = 0.07; // (down on its broken side)
    for (const p of pl.props) p.rotation.x = 0.9;
    pl.smoke.forEach((s, i) => {
      s.visible = true;
      s.position.set(P.plane.x + 6, 2 + i * 0.8, P.plane.z);
    });
    // The rex is gone; Rae is hurt (sitting on a crate by the camp); the ant farm's broken glass by the tail
    setShown(this.rex.root, false);
    this.raeSit();
    this.wreckBits.clear();
    const glass = new THREE.MeshStandardMaterial({ color: 0xcfeaff, roughness: 0.1, transparent: true, opacity: 0.5 });
    for (let i = 0; i < 6; i++) {
      const g = box(0.25 + (i % 3) * 0.1, 0.03, 0.2, glass, P.nest.x + 1.5 + Math.cos(i) * 0.8, 0.03, P.nest.z + 1.8 + Math.sin(i * 2) * 0.6);
      g.rotation.y = i;
      this.wreckBits.add(g);
    }
    this.wreckBits.visible = true;
    this.nestObj.visible = true;
    if (this.st.dino.state === 'hidden') {
      this.st.dino.state = 'trapped';
      setShown(this.dino.root, true);
      this.trapLog.visible = true;
      this.dino.herb.mood = 'scared';
    }
    if (!instant) this.flyers.grow(this.nestObj, 0.5);
  }

  private mastLight: THREE.Mesh | null = null;
  private raiseMast(instant = true) {
    this.plane.mast.visible = true;
    if (!instant) {
      this.flyers.grow(this.plane.mast, 0.5);
      this.hud.floatAt(v3(P.radio.x, 6, P.radio.z + 2), this.camera, '📡 MAST UP!', 'big gold');
    }
  }

  // --------------------------------------------------------------------------
  // ✈️ Rae: standing by the engine; then sitting on a crate (hurt)
  // --------------------------------------------------------------------------
  private raeSeated = false;
  private raeSit() {
    const m = this.rae;
    this.raeSeated = true;
    m.root.position.set(P.raeHurt.x, 0, P.raeHurt.z);
    m.root.rotation.y = Math.PI * 0.85; // (facing the camp)
    this.raeCrate.visible = true;
    sitPose(m, 0.75);
  }

  // --------------------------------------------------------------------------
  // 🔥 the campfire, 🛠️ the workbench, 🐜 the nest
  // --------------------------------------------------------------------------
  private buildFire() {
    const g = this.fireObj;
    g.position.set(P.campfire.x, 0, P.campfire.z);
    for (let i = 0; i < 8; i++) {
      const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.32), mat(0x7d7d7d, 0.9));
      stone.position.set(Math.cos((i / 8) * Math.PI * 2) * 1.1, 0.2, Math.sin((i / 8) * Math.PI * 2) * 1.1);
      g.add(stone);
    }
    for (let i = 0; i < 4; i++) {
      const lg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 1.6, 7), mat(0x6b4a2e, 0.95));
      lg.rotation.set(Math.PI / 2 - 0.5, (i / 4) * Math.PI * 2, 0);
      lg.position.y = 0.4;
      g.add(lg);
    }
    for (let i = 0; i < 3; i++) {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.35 - i * 0.08, 1.1 - i * 0.2, 8), new THREE.MeshBasicMaterial({ color: [0xff7a1a, 0xffb02e, 0xffe07a][i], transparent: true, opacity: 0.9 }));
      f.position.y = 0.75 + i * 0.05;
      g.add(f);
      this.flames.push(f);
    }
    this.fireLight.position.set(0, 1.6, 0);
    g.add(this.fireLight);
    g.visible = false;
    this.islandG.add(g);
  }

  private buildBench() {
    const g = this.benchObj;
    g.position.set(P.bench.x, 0, P.bench.z);
    const wood = mat(0x9b6b3f, 0.7);
    g.add(box(4.2, 0.25, 1.8, wood, 0, 1.35, 0));
    for (const [x, z] of [[-1.8, -0.7], [1.8, -0.7], [-1.8, 0.7], [1.8, 0.7]]) g.add(box(0.25, 1.3, 0.25, wood, x, 0.65, z));
    g.add(box(0.8, 0.4, 0.5, mat(0x6b7a8a, 0.5, 0.4), -1.2, 1.7, -0.3)); // a vise
    g.add(box(1.2, 0.08, 0.2, mat(0x9aa3ab, 0.3, 0.6), 0.8, 1.52, 0.2));  // a saw blade
    this.benchSign.setText('🛠️ WORKBENCH');
    this.benchSign.sprite.position.set(0, 3.4, 0);
    g.add(this.benchSign.sprite);
    g.visible = false;
    this.islandG.add(g);
  }

  private buildNest() {
    const g = this.nestObj;
    g.position.set(P.nest.x, 0, P.nest.z - 2.2);
    const mound = new THREE.Mesh(new THREE.SphereGeometry(1.4, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x9c7a4f, 1));
    mound.scale.y = 0.7;
    g.add(mound);
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.25, 10), mat(0x2a1d12, 1));
    hole.rotation.x = -Math.PI / 2;
    hole.position.y = 0.99;
    g.add(hole);
    // little ants running around it (a few dark dots going round)
    for (let i = 0; i < 6; i++) {
      const ant = box(0.18, 0.08, 0.1, mat(0x3a1a0c, 0.6), 0, 0.05, 0);
      ant.userData.ant = i;
      g.add(ant);
    }
    const t = new TextSprite(0.5, '#ffd166');
    t.setText('🐜 ANT NEST');
    t.sprite.position.set(0, 2.4, 0);
    g.add(t.sprite);
    g.visible = false;
    this.islandG.add(g);
  }

  private buildCampfire(instant = false) {
    this.campfire.consume(this.campfire.stack.count);
    this.campfire.show(false);
    this.fireObj.visible = true;
    this.fireLight.intensity = 3;
    this.st.flags.campfire = 1;
    if (!instant) this.flyers.grow(this.fireObj, 0.5);
  }

  private buildWorkbench(instant = false) {
    this.benchPlot.consume(this.benchPlot.stack.count);
    this.benchPlot.show(false);
    this.benchObj.visible = true;
    this.benchIn.show(true);
    this.benchOut.show(true);
    this.st.flags.bench = 1;
    if (!instant) this.flyers.grow(this.benchObj, 0.5);
  }

  /** Show the camp's spots once you're back from the research camp (fire pit, workbench plot...). */
  private showCamp(on: boolean) {
    const f = this.st.flags;
    this.fuelDrop.show(on);
    this.campfire.show(on && !f.campfire);
    this.benchPlot.show(on && !!f.campfire && !f.bench);
    this.benchIn.show(!!f.bench);
    this.benchOut.show(!!f.bench);
    this.nest.show(on && !!f.antsSeen && !f.runner);
    this.radio.show(on);
    this.nestObj.visible = !!f.crash;
  }

  /** 🐜 Your first helper: an ant carrying logs from the fallen trees to the workbench. */
  private hireRunner() {
    if (this.runner) return;
    const route: Route = { src: this.logs.stack, srcZone: this.logs.zone, dst: this.benchIn.stack, dstZone: this.benchIn.zone };
    this.runner = new Worker(this.scene, P.nest.x, P.nest.z - 1, () => route, { color: 0xffd166 }, 1.1);
    titleTag(this.runner.model, '🐜 RUNNER', 0.5);
    this.nest.show(false);
  }

  // --------------------------------------------------------------------------
  // Areas
  // --------------------------------------------------------------------------
  setArea(a: Area) {
    this.area = a;
    this.homeG.visible = a === 'home';
    this.islandG.visible = a === 'island';
    if (a === 'home') {
      this.scene.background = new THREE.Color(0xa9d8f5);
      this.scene.fog = new THREE.Fog(0xa9d8f5, 60, 160);
      this.hemi.intensity = 1.7;
    } else {
      this.scene.background = new THREE.Color(0x8fd3ff);
      this.scene.fog = new THREE.Fog(0x8fd3ff, 140, 520);
      this.hemi.intensity = 1.5;
    }
    this.sfx.setMusic(a === 'home' ? 'colony' : 'island');
    this.sfx.setAmbience(a === 'island' ? 'island' : null);
    document.getElementById('mapSlot')?.classList.toggle('hidden', a !== 'island');
    this.resizeCam();
  }

  // --------------------------------------------------------------------------
  // Walking
  // --------------------------------------------------------------------------
  private canWalk = (x: number, z: number) => {
    if (this.area === 'home') {
      const h = P.house;
      const lx = x - HOME_X;
      return lx > h.minX + 0.5 && lx < h.maxX - 0.5 && z > h.minZ + 0.5 && z < h.maxZ - 0.5;
    }
    const L = P.land;
    return Math.hypot((x - L.x) / (L.rx - 5), (z - L.z) / (L.rz - 5)) < 1;
  };

  private every(key: object, dt: number, on: boolean, interval: number, fn: () => void) {
    if (!on) {
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

  /** How many of an item you carry. */
  carrying(type: ItemType) {
    return this.player.stack.items.filter((it) => it.type === type).length;
  }

  /** Something is happening that you watch instead of play. */
  get busy() {
    return !!this.seq || this.talk.open || this.cut.active || this.passing;
  }

  /** Play a story moment (only one at a time); the game saves when it's over. */
  private run(fn: () => Promise<void>) {
    if (this.seq) return;
    this.seq = (async () => {
      try {
        await fn();
      } catch (e) {
        console.error('Story moment failed:', e);
        if (this.cut.active) this.cut.end();
      }
      this.seq = null;
      this.talk.skipping = false;
      this.sync();
      writeSave(this.save);
    })();
  }

  private say(lines: Line[]) {
    return this.talk.say(lines);
  }

  /** A card that waits for its button. */
  private card(title: string, html: string, button: string) {
    return new Promise<void>((resolve) => this.hud.showGuide(title, html, [{ label: button, cls: 'big-btn', onClick: () => resolve() }]));
  }

  // --------------------------------------------------------------------------
  // Every frame
  // --------------------------------------------------------------------------
  update(dt: number, move: THREE.Vector2) {
    this.t += dt;
    const busy = this.busy;
    const me = this.player;
    const prog = this.progress;
    me.carryMax = CONFIG.player.baseCarry + prog.carryBonus;
    me.speedMult = prog.speedMult * 1.15;
    const still = new THREE.Vector2();
    me.update(dt, busy ? still : move, this.area === 'home' ? this.blockersHome : this.blockersIsland, this.canWalk);
    this.flyers.update(dt);
    this.hud.setInventory(me.stack.counts(), me.stack.count, me.carryMax);
    this.tutorial.update(dt, !busy);
    if (this.area === 'home') this.updateHome(dt, busy);
    else this.updateIsland(dt, busy);
    this.updateCamera(dt);
    const zone = this.zoneName();
    if (zone !== this.zoneShown) this.hud.setZone((this.zoneShown = zone));
  }
  private zoneShown = '';

  /** The area name under the level card. */
  private zoneName() {
    if (this.area === 'home') return '🏠 Your house';
    const p = this.player.pos;
    if (this.researchZone.contains(p)) return '🏚️ The old research camp';
    if (p.z > 10) return this.st.flags.crash ? '🏕️ Camp' : '✈️ The airstrip';
    return '🌿 The trail';
  }

  private updateHome(dt: number, busy: boolean) {
    const st = this.st;
    const f = st.flags;
    const p = this.player.pos;
    // 📱 the phone rings (until you answer it)
    if (!f.called) {
      this.phoneRing.sprite.position.y = 2.6 + Math.abs(Math.sin(this.t * 6)) * 0.3;
      this.phoneRing.sprite.visible = Math.sin(this.t * 3) > -0.6;
      if (Math.floor(this.t * 0.5) !== Math.floor((this.t - dt) * 0.5)) this.sfx.bell();
    }
    if (busy) return;
    const iv = CONFIG.player.pickupInterval * 3;
    if (!f.called && this.phoneZone.contains(p)) {
      this.run(async () => {
        this.phoneRing.sprite.visible = false;
        await this.say(D.CALL);
        f.called = 1;
        this.progress.addXp(10);
      });
      return;
    }
    if (!f.called) return;
    // 👕 clothes from the dresser, 🐜 the ant farm from the desk, into the suitcase
    this.every(this.dresser, dt, this.dresser.zone.contains(p) && this.player.canTake() && this.dresser.stack.count > 0, iv, () => {
      if (this.flyers.transfer(this.dresser.stack, this.player.stack)) this.sfx.pickup();
    });
    this.every(this.desk, dt, this.desk.zone.contains(p) && this.player.canTake() && this.desk.stack.count > 0, iv, () => {
      if (this.flyers.transfer(this.desk.stack, this.player.stack)) this.sfx.pickup();
    });
    const packable = (['clothes', 'antfarm'] as ItemType[]).find((t) => this.player.stack.has(t));
    this.every(this.suitcase, dt, this.suitcase.zone.contains(p) && !!packable, iv, () => {
      const t = (['clothes', 'antfarm'] as ItemType[]).find((k) => this.player.stack.has(k));
      if (!t || !this.flyers.transferType(this.player.stack, this.suitcase.stack, t)) return;
      this.sfx.drop();
      this.progress.addXp(4);
      if (t === 'clothes') f.clothes = (f.clothes ?? 0) + 1;
      else f.antsPacked = 1;
    });
    if ((f.clothes ?? 0) >= 2 && f.antsPacked && !f.packedLine) {
      this.run(async () => {
        await this.say(D.PACKED);
        f.packedLine = 1;
      });
      return;
    }
    // 🚪 out the door: the flight
    if (f.packedLine && this.doorZone.contains(p)) this.run(() => this.flight());
  }

  private updateIsland(dt: number, busy: boolean) {
    const st = this.st;
    const f = st.flags;
    const p = this.player.pos;
    const me = this.player;
    // The world keeps going (piles regrow, the ant works, the fire flickers, the dino follows you)
    this.logs.update(dt);
    this.berries.update(dt);
    this.runner?.update(dt, this.flyers);
    this.updateBench(dt);
    this.animateScenery(dt);
    this.updateDino(dt, busy);
    if (!f.crash) this.raeIdle(dt);
    if (busy) return;
    this.updateNeeds(dt);
    if (this.passing) return;

    const iv = CONFIG.player.pickupInterval / this.progress.workMult;
    const take = (key: object, zone: Zone, from: Stack, type: ItemType, ok = true, onTake?: () => void) =>
      this.every(key, dt, ok && zone.contains(p) && me.canTake(type) && from.canPop(), iv, () => {
        if (me.canTake(type) && this.flyers.transfer(from, me.stack)) {
          this.sfx.pickup();
          this.progress.addXp(CONFIG.xp.pickup);
          onTake?.();
        }
      });
    const drop = (key: object, zone: Zone, to: Stack, type: ItemType, ok = true, onDrop?: (it: StackItem) => void) =>
      this.every(key, dt, ok && zone.contains(p) && me.stack.has(type) && !to.full, iv, () => {
        const it = !to.full ? this.flyers.transferType(me.stack, to, type) : null;
        if (!it) return;
        this.sfx.drop();
        this.progress.addXp(CONFIG.xp.drop);
        onDrop?.(it);
      });

    // ⛽ the fuel shed (two cans), and leaving them by the plane
    take(this.fuel, this.fuel.zone, this.fuel.stack, 'fuel', true, () => (f.fuelTaken = (f.fuelTaken ?? 0) + 1));
    drop(this.fuelDrop, this.fuelDrop.zone, this.fuelDrop.stack, 'fuel', !!f.back, () => (st.fed.fuel += 1));
    // 🪵 logs, 🍓 berries
    take(this.logs, this.logs.zone, this.logs.stack, 'log', !!f.back);
    take(this.berries, this.berries.zone, this.berries.stack, 'berry', !!f.back);
    // 🔥 the fire pit, 🛠️ the workbench plot, then the workbench itself
    drop(this.campfire, this.campfire.zone, this.campfire.stack, 'log', !!f.back && !f.campfire);
    drop(this.benchPlot, this.benchPlot.zone, this.benchPlot.stack, 'log', !!f.campfire && !f.bench);
    drop(this.benchIn, this.benchIn.zone, this.benchIn.stack, 'log', !!f.bench);
    take(this.benchOut, this.benchOut.zone, this.benchOut.stack, 'mast', !!f.bench);
    // 🐜 berries for the ants
    drop(this.nest, this.nest.zone, this.nest.stack, 'berry', !!f.antsSeen && !f.runner, () => (st.fed.ants += 1));
    // 📡 the mast onto the plane
    drop(this.radio, this.radio.zone, this.radio.stack, 'mast', !!f.back && !f.mast);
    // 🦕 berries for the little dino (once it's free)
    this.dinoZone.x = this.dino.root.position.x;
    this.dinoZone.z = this.dino.root.position.z;
    drop(this.dinoFeed, this.dinoZone, this.dinoFeed, 'berry', st.dino.state === 'free', () => (st.fed.dino += 1));

    if (this.campfire.count() >= T.campfire && !f.campfire) {
      this.buildCampfire();
      this.sfx.unlocked();
      this.progress.addXp(25);
      this.hud.floatAt(v3(P.campfire.x, 3, P.campfire.z), this.camera, '🔥 CAMPFIRE!', 'big gold');
      this.showCamp(true);
    }
    if (this.benchPlot.count() >= T.bench && !f.bench) {
      this.buildWorkbench();
      this.sfx.unlocked();
      this.progress.addXp(30);
      this.hud.floatAt(v3(P.bench.x, 3, P.bench.z), this.camera, '🛠️ WORKBENCH!', 'big gold');
      this.showCamp(true);
    }
    this.beats();
  }

  /** The story's moments: each one happens once, when you get to it. */
  private beats() {
    const st = this.st;
    const f = st.flags;
    const p = this.player.pos;
    const near = (x: number, z: number, r: number) => Math.hypot(p.x - x, p.z - z) < r;
    if (f.landed && !f.campSeen && this.researchZone.contains(p)) {
      return this.run(async () => {
        await this.say(D.CAMP);
        f.campSeen = 1;
      });
    }
    if (f.landed && !f.page1 && this.tableZone.contains(p)) {
      return this.run(async () => {
        await this.card(D.PAGE_1.title, D.PAGE_1.html, 'Close the notebook');
        f.page1 = 1;
        if (!st.pages.includes(1)) st.pages.push(1);
        this.noteIcon.sprite.visible = false;
        this.progress.addXp(20);
      });
    }
    if (f.page1 && (f.fuelTaken ?? 0) >= 2 && !f.crash) return this.run(() => this.crash());
    if (f.crash && !f.back && near(P.raeHurt.x, P.raeHurt.z, 5.5)) {
      return this.run(async () => {
        await this.say(D.RETURN);
        f.back = 1;
        this.showCamp(true);
        this.hud.banner('💧 Watch your water', 'It drains while you work. The stream is just north of camp.', 3200);
      });
    }
    if (f.campfire && !f.fireLine) {
      return this.run(async () => {
        await this.say(D.FIRE);
        f.fireLine = 1;
        this.showCamp(true);
      });
    }
    if (f.bench && !f.antsSeen) {
      return this.run(async () => {
        await this.say(D.ANTS);
        f.antsSeen = 1;
        this.showCamp(true);
      });
    }
    if (st.fed.ants >= T.antFeed && !f.runner) {
      return this.run(async () => {
        this.nest.consume(this.nest.stack.count);
        this.hireRunner();
        await this.say(D.RUNNER);
        f.runner = 1;
        this.progress.addXp(30);
        this.hud.banner('🐜 Your first helper!', 'It carries wood from the fallen trees to the workbench', 3400);
      });
    }
    if (!f.mast && this.radio.count('mast') > 0) {
      return this.run(async () => {
        this.radio.consume(1, 'mast');
        this.raiseMast(false);
        f.mast = 1;
        await this.say(D.MAST);
        this.progress.addXp(30);
      });
    }
    // 🦕
    const d = st.dino;
    if (d.state === 'trapped' && f.back && !f.trapLine && near(P.trap.x, P.trap.z, 8)) {
      return this.run(async () => {
        await this.say(D.TRAPPED);
        f.trapLine = 1;
      });
    }
    if (d.state === 'free' && st.fed.dino >= T.dinoFeed) {
      return this.run(async () => {
        d.state = 'trust';
        this.dinoFeed.clear();
        this.dino.herb.mood = 'happy';
        this.trustT = 6;
        this.sfx.unlocked();
        await this.say(D.TRUST);
        this.progress.addXp(40);
        this.hud.banner('🦕 It trusts you!', 'It follows you now. Lead the way!', 3200);
      });
    }
    if (f.mast && !d.carrying && !f.signal && this.shedZone.contains(p)) {
      const dinoNear = d.state === 'trust' && Math.hypot(this.dino.root.position.x - p.x, this.dino.root.position.z - p.z) < 8;
      if (dinoNear) {
        return this.run(async () => {
          const it = this.shedModule.pop();
          if (it) this.flyers.pushInto(it, this.dinoLoad, 0.6);
          else this.dinoLoad.addInstant('radio');
          d.carrying = true;
          await this.say(D.LOADED);
          this.progress.addXp(25);
        });
      }
      if (!f.shedLine) {
        return this.run(async () => {
          await this.say(D.SHED_ALONE);
          f.shedLine = 1;
        });
      }
    }
    if (d.carrying && !f.signal) {
      const dp = this.dino.root.position;
      if (near(P.radio.x, P.radio.z, 6) && Math.hypot(dp.x - P.radio.x, dp.z - P.radio.z) < 9) return this.run(() => this.signal());
    }
  }

  // --------------------------------------------------------------------------
  // 🎬 The cutscenes
  // --------------------------------------------------------------------------
  /** ✈️ Out the door: the flight over the ocean, and down onto the old airstrip. */
  private async flight() {
    const f = this.st.flags;
    const cut = this.cut;
    const pl = this.plane;
    const z = P.strip.z;
    const at = (x: number, y: number) => {
      pl.root.position.set(x, y, z);
      pl.pitch.rotation.z = y > 0.05 ? 0.06 : 0;
    };
    const spin = (dt: number) => pl.props.forEach((p) => (p.rotation.x += dt * 40));
    const planePos = () => pl.root.position;
    cut.begin();
    this.suitcase.stack.clear(); // (it's coming with you)
    await cut.shot({
      dur: 5,
      caption: 'Dawn, the next morning. Far out over the ocean...',
      start: () => {
        this.setArea('island');
        pl.root.visible = true;
        setShown(this.rae.root, false);
        setShown(this.player.model.root, false);
        this.sfx.takeoff();
      },
      tick: (u, dt) => {
        at(-330 + 120 * u, 46 - 10 * u);
        spin(dt);
      },
      cam: () => [planePos().clone().add(v3(-16, 5, 16)), planePos().clone().add(v3(8, 0, 0))],
    });
    await cut.shot({
      dur: 4.5,
      caption: 'Rae: "There it is. Not on a single chart I own."',
      tick: (u, dt) => {
        at(-210 + 90 * u, 36 - 18 * u);
        spin(dt);
      },
      cam: () => [v3(-60, 9, 64), planePos().clone()],
    });
    await cut.shot({
      dur: 4,
      caption: 'Rae: "Hold on. This strip hasn\'t seen a plane in years!"',
      tick: (u, dt) => {
        at(-120 + 74 * u, 18 * (1 - u));
        spin(dt);
      },
      cam: () => [v3(-22, 4, 46), planePos().clone()],
    });
    await cut.shot({
      dur: 3.5,
      tick: (u, dt) => {
        const k = 1 - (1 - u) * (1 - u); // (slowing down)
        at(-46 + (P.plane.x + 46) * k, 0);
        spin(dt * (1 - u));
      },
      cam: (u) => [glide(v3(14, 5, 44), v3(8, 9, 40), u), planePos().clone().add(v3(0, 1.5, 0))],
      end: () => {
        this.parkPlane();
        setShown(this.rae.root, true);
        this.rae.root.position.set(P.rae.x, 0, P.rae.z);
        setShown(this.player.model.root, true);
        this.player.pos.set(P.spawnIsland.x, 0, P.spawnIsland.z);
        this.player.model.root.rotation.y = Math.PI / 2;
        this.camera.position.copy(this.player.pos).add(this.camOffset);
      },
    });
    cut.end();
    this.talk.skipping = false;
    f.landed = 1;
    this.st.area = 'island';
    this.st.water = 100;
    await this.say(D.LANDING);
    this.progress.addXp(15);
    this.hud.banner('💧 Water', 'It drains while you explore. Drink at the stream (stand in it).', 3400);
  }

  /** 🦖 The roar: the rex wrecks the plane while you're at the research camp. */
  private async crash() {
    const cut = this.cut;
    const rex = this.rex;
    const rae = this.rae;
    const me = this.player.pos.clone();
    let broke = false;
    const shake = (amt: number) => v3((Math.random() - 0.5) * amt, (Math.random() - 0.5) * amt, 0);
    cut.begin();
    await cut.shot({
      dur: 2.4,
      caption: 'A ROAR shakes the jungle... from the direction of the airstrip.',
      start: () => this.sfx.roar(),
      cam: () => [me.clone().add(v3(0, 6, 9)).add(shake(0.5)), me.clone().add(v3(0, 2, -6))],
    });
    await cut.shot({
      dur: 4,
      start: () => {
        setShown(rex.root, true);
        rex.root.position.set(P.rexFrom.x, 0, P.rexFrom.z);
      },
      tick: (u, dt) => {
        const from = v3(P.rexFrom.x, 0, P.rexFrom.z);
        const to = v3(P.rexAt.x, 0, P.rexAt.z);
        rex.root.position.lerpVectors(from, to, u);
        faceToward(rex, to.x - from.x, to.z - from.z, Math.max(dt, 0.016), 20);
        animateCreature(rex, dt, 7);
        if (!this.raeSeated) {
          faceToward(rae, rex.root.position.x - rae.root.position.x, rex.root.position.z - rae.root.position.z, Math.max(dt, 0.016), 4);
          animateCreature(rae, dt, 0);
        }
      },
      cam: (u) => [glide(v3(-10, 9, 10), v3(-6, 8, 13), u), v3(9, 3, 27)],
    });
    await cut.shot({
      dur: 2.8,
      start: () => {
        roar(rex);
        this.sfx.roar();
      },
      tick: (u, dt) => {
        animateCreature(rex, dt, 0);
        if (u > 0.4 && !broke) {
          broke = true;
          this.wreck();
          this.sfx.thunder();
        }
      },
      cam: (u) => [v3(-5, 8, 13).add(shake(u > 0.4 ? 0.9 * (1 - u) * 2 : 0.2)), v3(6, 3, 28)],
      end: () => {
        if (!broke) this.wreck(true);
      },
    });
    await cut.shot({
      dur: 3.6,
      tick: (u, dt) => {
        const from = v3(P.rexAt.x, 0, P.rexAt.z);
        const to = v3(P.rexTo.x, 0, P.rexTo.z);
        setShown(rex.root, true);
        rex.root.position.lerpVectors(from, to, u);
        faceToward(rex, to.x - from.x, to.z - from.z, Math.max(dt, 0.016), 6);
        animateCreature(rex, dt, 8);
      },
      cam: (u) => [glide(v3(-14, 14, 6), v3(-22, 22, 2), u), v3(16, 2, 14)],
      end: () => setShown(rex.root, false),
    });
    cut.end();
    this.talk.skipping = false;
    this.st.flags.crash = 1;
    await this.say(D.ROAR);
  }

  /** 📻 The radio: the chapter's last moment. */
  private async signal() {
    const cut = this.cut;
    const d = this.st.dino;
    cut.begin();
    await cut.shot({
      dur: 2.2,
      start: () => {
        const it = this.dinoLoad.pop();
        if (it) this.flyers.pushInto(it, this.radio.stack, 0.6);
        d.carrying = false;
      },
      cam: (u) => [glide(v3(2, 8, 14), v3(-1, 5, 17), u), v3(-6, 2.2, 26)],
    });
    await this.say(D.SIGNAL_1);
    cut.end();
    this.talk.skipping = false;
    this.st.flags.signal = 1;
    this.progress.addXp(60);
  }

  /** 🎉 Chapter 1 is over (the quest card's last step is done). */
  chapterEnd() {
    this.run(async () => {
      this.sfx.levelUp();
      await this.card(
        '🎉 CHAPTER 1 COMPLETE · The Landing',
        `<div class="chapter-end">
          <p>📱 A phone call. ✈️ An island on no map. 🦖 A rex, and a broken plane.</p>
          <p>🐜 Your ants run wood to the workbench. 🦕 A little dinosaur trusts you. 📻 And someone, somewhere, heard you.</p>
          <p class="next"><b>Next: Chapter 2 · Survive</b> <i>(coming soon)</i><br>Three days until the weather window.</p>
          <p class="small">Keep playing: your camp keeps running, and your ant keeps the workbench stocked.</p>
        </div>`,
        '🏕️ Back to camp',
      );
      this.hud.setHint('🏕️ Chapter 2 is coming soon. Your camp keeps running!');
    });
  }

  // --------------------------------------------------------------------------
  // 💧 needs: water, and health once the water's gone
  // --------------------------------------------------------------------------
  private updateNeeds(dt: number) {
    const st = this.st;
    if (!st.flags.landed) return;
    const p = this.player.pos;
    const inStream = Math.abs(p.z - P.stream.z) < P.stream.half + 0.4;
    if (inStream) {
      if (st.water < 99 && Math.floor(this.t * 4) !== Math.floor((this.t - dt) * 4)) this.sfx.splash();
      st.water = Math.min(100, st.water + T.drink * dt);
      if (st.water > T.thirsty + 10) this.warned = false;
    } else {
      st.water = Math.max(0, st.water - (100 / T.waterSecs) * dt);
    }
    if (st.water <= 0) st.health = Math.max(0, st.health - (100 / T.hurtSecs) * dt);
    else if (st.water > 20) st.health = Math.min(100, st.health + 4 * dt);
    if (st.water < T.thirsty && !this.warned) {
      this.warned = true;
      this.hud.banner('💧 Thirsty!', 'Drink at the stream: stand in it. (North of camp, on the trail.)', 3600);
    }
    if (st.health <= 0) this.passOut();
  }

  /** 😵 Out cold: you wake at camp (minus the ordinary things you carried). */
  private passOut() {
    if (this.passing) return;
    this.passing = true;
    const fade = document.getElementById('fade');
    fade?.classList.add('on');
    window.setTimeout(() => {
      const st = this.st;
      // Drop what isn't part of the story (logs, berries)
      const keep = this.player.stack.items.filter((it) => STORY_ITEMS.includes(it.type));
      for (const it of this.player.stack.items) if (!keep.includes(it)) it.mesh.removeFromParent();
      this.player.stack.items = keep;
      const wake = st.flags.campfire ? v3(P.campfire.x - 2.5, 0, P.campfire.z + 1.5) : v3(P.spawnIsland.x, 0, P.spawnIsland.z);
      this.player.pos.copy(wake);
      st.water = 60;
      st.health = 60;
      this.warned = false;
      this.camera.position.copy(this.player.pos).add(this.camOffset);
      fade?.classList.remove('on');
      this.passing = false;
      this.hud.banner('😵 You passed out', 'You wake up back at camp, without the wood and berries you carried. Drink often!', 4200);
      this.sync();
      writeSave(this.save);
    }, 1300);
  }

  /** The HUD's 💧 / ❤️ bars. */
  renderNeeds() {
    const st = this.st;
    const show = this.area === 'island' && !!st.flags.landed && !this.cut.active;
    this.needsEl.classList.toggle('hidden', !show);
    if (!show) return;
    const w = this.needsEl.querySelector<HTMLElement>('.water b')!;
    w.style.width = `${Math.round(st.water)}%`;
    this.needsEl.querySelector('.water')!.classList.toggle('low', st.water < T.thirsty);
    const h = this.needsEl.querySelector<HTMLElement>('.health')!;
    h.classList.toggle('hidden', st.health >= 99.5);
    h.querySelector<HTMLElement>('b')!.style.width = `${Math.round(st.health)}%`;
  }

  // --------------------------------------------------------------------------
  // 🛠️ the workbench makes the radio mast (once)
  // --------------------------------------------------------------------------
  private updateBench(dt: number) {
    const st = this.st;
    const f = st.flags;
    if (!f.bench) return;
    const wantMast = !f.mast && this.benchOut.count('mast') === 0 && this.carrying('mast') === 0 && this.radio.count('mast') === 0;
    if (wantMast && st.bench.t === 0 && this.benchIn.count('log') >= T.mast) {
      this.benchIn.consume(T.mast, 'log');
      st.bench.t = 0.001;
    }
    if (st.bench.t > 0) {
      st.bench.t += dt;
      this.benchSign.setText(`🛠️ MAKING A MAST ${Math.min(99, Math.floor((st.bench.t / T.mastSecs) * 100))}%`);
      if (st.bench.t >= T.mastSecs) {
        st.bench.t = 0;
        this.benchOut.stack.addInstant('mast');
        this.flyers.grow(this.benchOut.stack.items[0].mesh, 0.4);
        this.sfx.unlocked();
        this.hud.floatAt(v3(P.bench.x + 2.2, 3, P.bench.z + 2.4), this.camera, '📡 RADIO MAST!', 'big gold');
      }
    } else {
      this.benchSign.setText(f.mast ? `🛠️ WORKBENCH · 🪵 ${this.benchIn.count('log')}/${T.benchMax}` : `🛠️ MAST: 🪵 ${Math.min(T.mast, this.benchIn.count('log'))}/${T.mast}`);
    }
  }

  /** Mast progress for the quest card (0..1). */
  mastProgress() {
    const st = this.st;
    if (st.bench.t > 0) return 0.5 + 0.5 * (st.bench.t / T.mastSecs);
    return Math.min(1, this.benchIn.count('log') / T.mast) * 0.5;
  }

  // --------------------------------------------------------------------------
  // 🦕 the little dino
  // --------------------------------------------------------------------------
  private updateDino(dt: number, busy: boolean) {
    const d = this.st.dino;
    const m = this.dino;
    if (d.state === 'hidden') return;
    const p = this.player.pos;
    if (d.state === 'trapped') {
      animateCreature(m, dt, 0);
      if (busy || !this.st.flags.back) return;
      // Lift the tree off it: stand at its side for a moment
      if (this.liftZone.contains(p)) this.liftT += dt;
      else this.liftT = Math.max(0, this.liftT - dt * 2);
      this.trapLog.position.y = 2.3 + Math.min(1, this.liftT / T.lift) * 0.8;
      if (this.liftT >= T.lift) {
        this.liftT = 0;
        d.state = 'free';
        this.trapLog.visible = false;
        this.sfx.dodo();
        this.progress.addXp(20);
        // (it scrambles a few steps away from you)
        m.root.position.set(P.trap.x - 2.5, 0, P.trap.z - 1.5);
        this.run(() => this.say(D.FREED));
      }
      return;
    }
    if (d.state === 'free') {
      faceToward(m, p.x - m.root.position.x, p.z - m.root.position.z, dt, 3);
      animateCreature(m, dt, 0);
      return;
    }
    // trust: follow you (a few steps behind), happy for a moment after being fed
    this.trustT = Math.max(0, this.trustT - dt);
    m.herb.mood = this.trustT > 0 ? 'happy' : 'calm';
    const dx = p.x - m.root.position.x;
    const dz = p.z - m.root.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 30 && !busy) {
      // (left far behind: it catches up)
      m.root.position.set(p.x - 3, 0, p.z + 3);
    } else if (dist > 4.2) {
      const target = v3(p.x - (dx / dist) * 3.2, 0, p.z - (dz / dist) * 3.2);
      stepTo(m, target, Math.min(9, 4 + dist * 0.6), dt);
    } else {
      faceToward(m, dx, dz, dt, 3);
      animateCreature(m, dt, 0);
    }
  }

  /** 🐜 While you were away: your ant brought `n` logs (as many as the workbench has room for). How many fit. */
  stockBench(n: number) {
    if (!this.st.flags.bench) return 0;
    const k = Math.max(0, Math.min(T.benchMax - this.benchIn.stack.count, n));
    for (let i = 0; i < k; i++) this.benchIn.stack.addInstant('log');
    return k;
  }
  benchLogs() {
    return this.benchIn.count('log');
  }

  /** Where the little dino is right now. */
  dinoAt() {
    return this.dino.root.position;
  }
  /** A mast is waiting on the workbench. */
  mastReady() {
    return this.benchOut.count('mast') > 0;
  }

  liftProgress() {
    return this.st.dino.state === 'trapped' ? Math.min(1, this.liftT / T.lift) : 1;
  }

  // --------------------------------------------------------------------------
  // Little things that move
  // --------------------------------------------------------------------------
  private raeIdle(dt: number) {
    const r = this.rae;
    // (once she's hurt and sitting, the walk cycle would straighten her legs back out: v0.63's "standing in the box")
    if (r.root.userData.hidden || this.raeSeated) return;
    // (looking the engine over: facing the nose, shifting about)
    faceToward(r, -1, 0.2 * Math.sin(this.t * 0.4), dt, 2);
    animateCreature(r, dt, 0);
  }

  private animateScenery(dt: number) {
    if (this.oceanTex) this.oceanTex.offset.x += dt * 0.004;
    const f = this.st.flags;
    // 🔥 flames flicker
    if (f.campfire) {
      this.flames.forEach((fl, i) => {
        const k = 1 + Math.sin(this.t * (9 + i * 3) + i) * 0.15;
        fl.scale.set(1, k, 1);
        fl.rotation.y += dt * (1 + i);
      });
      this.fireLight.intensity = 2.6 + Math.sin(this.t * 13) * 0.4;
    }
    // 💨 the wreck smokes for a while
    if (f.crash) {
      this.plane.smoke.forEach((s, i) => {
        const u = (this.t * 0.25 + i / 6) % 1;
        s.position.set(P.plane.x + 6 + u * 1.5, 2 + u * 6, P.plane.z - u * 0.8);
        s.scale.setScalar(0.6 + u * 1.8);
        (s.material as THREE.MeshStandardMaterial).opacity = 0.45 * (1 - u);
      });
    }
    // 📡 the mast's light blinks
    if (this.mastLight) this.mastLight.visible = Math.sin(this.t * 4) > 0;
    // 🐜 the ants run round their nest
    if (this.nestObj.visible) {
      for (const c of this.nestObj.children) {
        const i = c.userData.ant as number | undefined;
        if (i === undefined) continue;
        const a = this.t * (0.9 + i * 0.13) + i;
        c.position.set(Math.cos(a) * (1.6 + (i % 2) * 0.3), 0.05, Math.sin(a) * (1.6 + (i % 2) * 0.3));
        c.rotation.y = -a;
      }
    }
    // 📖 the notebook's icon bobs until you've read it
    if (this.noteIcon.sprite.visible) this.noteIcon.sprite.position.y = 1.9 + Math.abs(Math.sin(this.t * 3)) * 0.3;
  }

  // --------------------------------------------------------------------------
  // Camera
  // --------------------------------------------------------------------------
  /** Where the camera looks (for the level-of-detail culling). */
  get focus() {
    return this.player.pos;
  }

  setShadowSize(size: number) {
    this.sun.shadow.mapSize.set(size, size);
    this.sun.shadow.map?.dispose();
    (this.sun.shadow as { map: THREE.WebGLRenderTarget | null }).map = null;
  }

  private look = new THREE.Vector3();
  private updateCamera(dt: number) {
    const target = this.player.pos;
    if (this.cut.update(dt, this.camera)) {
      // (the sun follows what the camera looks at, so the cutscene has shadows too)
      this.camera.getWorldDirection(this.look);
      const at = this.camera.position.clone().addScaledVector(this.look, 16);
      this.sun.position.set(at.x + 10, 26, at.z + 12);
      this.sun.target.position.set(at.x, 0, at.z);
      if (this.camera.fov !== this.thirdFov) {
        this.camera.fov = this.thirdFov;
        this.camera.updateProjectionMatrix();
      }
      return;
    }
    const fov = this.player.firstPerson ? fpFov(this.camera.aspect) : this.thirdFov;
    if (this.camera.fov !== fov) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    this.sun.position.set(target.x + 10, 26, target.z + 12);
    this.sun.target.position.copy(target);
    if (this.player.firstPerson) {
      this.player.placeEyeCamera(this.camera);
      return;
    }
    const want = new THREE.Vector3().copy(target).add(this.camOffset);
    this.camera.position.lerp(want, Math.min(1, dt * 5));
    this.camera.lookAt(this.camera.position.x - this.camOffset.x, 0, this.camera.position.z - this.camOffset.z);
  }

  private w = 1;
  private h = 1;
  resize(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.resizeCam();
  }
  private resizeCam() {
    const { w, h } = this;
    this.camera.aspect = w / h;
    const portrait = w < h;
    // (closer inside the house)
    const k = this.area === 'home' ? 0.72 : 1;
    this.camOffset.set(0, (portrait ? 20 : 16) * k, (portrait ? 17.5 : 15.5) * k);
    this.thirdFov = portrait ? 56 : 42;
    if (this.player) this.camera.fov = this.player.firstPerson ? fpFov(this.camera.aspect) : this.thirdFov;
    this.camera.updateProjectionMatrix();
  }

  // --------------------------------------------------------------------------
  // 🗺️ The minimap (the island)
  // --------------------------------------------------------------------------
  static readonly MAP_BOUNDS = { minX: -60, maxX: 60, minZ: -108, maxZ: 44 };
  mapView(): MapView {
    const f = this.st.flags;
    const markers: MapView['markers'] = [
      { x: P.plane.x, z: P.plane.z, icon: '✈️', label: f.crash ? 'The wreck' : 'Rae\'s plane' },
      { x: P.research.x, z: P.research.z, icon: '🏚️', label: 'Research camp' },
      { x: 30, z: P.stream.z, icon: '💧', label: 'Stream' },
    ];
    if (f.back) {
      markers.push({ x: P.logs.x, z: P.logs.z, icon: '🪵', label: 'Fallen trees' }, { x: P.berries.x, z: P.berries.z, icon: '🍓', label: 'Berries' });
      markers.push({ x: P.campfire.x, z: P.campfire.z, icon: '🔥', label: f.campfire ? 'Campfire' : 'Fire pit' });
      if (f.campfire) markers.push({ x: P.bench.x, z: P.bench.z, icon: '🛠️', label: 'Workbench' });
    }
    if (this.st.dino.state !== 'hidden') markers.push({ x: this.dino.root.position.x, z: this.dino.root.position.z, icon: '🦕', alert: this.st.dino.state === 'trapped' });
    const st = this.tutorial.target;
    return {
      areas: [
        { rect: { minX: P.strip.from, maxX: P.strip.to, minZ: P.strip.z - P.strip.w / 2, maxZ: P.strip.z + P.strip.w / 2 }, fill: '#b49a6a', label: 'Airstrip' },
        { rect: { minX: -70, maxX: 70, minZ: P.stream.z - P.stream.half, maxZ: P.stream.z + P.stream.half }, fill: '#3fa9e0' },
        { rect: { minX: P.research.x - 12, maxX: P.research.x + 12, minZ: P.research.z - 10, maxZ: P.research.z + 10 }, fill: '#9c8158' },
      ],
      trees: this.treeSpots,
      fences: this.trailSegs,
      markers,
      tiles: [],
      player: { x: this.player.pos.x, z: this.player.pos.z, yaw: this.player.model.root.rotation.y },
      target: st ? { x: st.x, z: st.z } : null,
    };
  }
}

// ============================================================================
// 📡 A radio mast: a three-legged lattice tower with a little dish and a red light on top. `h` tall.
// (v0.63: the carried one looked like a sword; this is the one on the plane's roof)
// ============================================================================
export function latticeMast(h: number) {
  const g = new THREE.Group();
  const metal = mat(0xb8c0c8, 0.35, 0.6);
  const r = h * 0.06;
  const legs: THREE.Vector3[] = [];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.012, h * 0.014, h, 5), metal);
    leg.position.set(Math.cos(a) * r, h / 2, Math.sin(a) * r);
    g.add(leg);
    legs.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
  }
  // zig-zag braces between the legs
  for (let k = 0; k < 6; k++) {
    for (let i = 0; i < 3; i++) {
      const p0 = legs[i].clone().setY((k / 6) * h);
      const p1 = legs[(i + 1) % 3].clone().setY(((k + 1) / 6) * h);
      const len = p0.distanceTo(p1);
      const brace = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.006, h * 0.006, len, 4), metal);
      brace.position.copy(p0).add(p1).multiplyScalar(0.5);
      brace.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p1.clone().sub(p0).normalize());
      g.add(brace);
    }
  }
  const dish = new THREE.Mesh(new THREE.SphereGeometry(h * 0.12, 12, 6, 0, Math.PI * 2, 0, Math.PI / 3), new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.4, side: THREE.DoubleSide }));
  dish.rotation.x = -Math.PI / 2 - 0.4;
  dish.position.set(0, h * 0.78, h * 0.08);
  const light = new THREE.Mesh(new THREE.SphereGeometry(h * 0.035, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
  light.position.y = h + h * 0.03;
  g.add(dish, light);
  g.userData.light = light;
  return g;
}

// ============================================================================
// 🪑 Sitting (a person on a crate `seat` high): thighs forward, shins down, the body lowered onto the seat.
// Set once; the walk cycle isn't run on a sitting person.
// ============================================================================
function sitPose(m: CreatureModel, seat: number) {
  const b = m.biped;
  if (!b) return;
  const q = new THREE.Quaternion();
  for (const limb of b.limbs) {
    if (limb.arm) {
      // (hands on the knees)
      q.setFromAxisAngle(limb.hip.axis, -0.3);
      limb.hip.bone.quaternion.copy(limb.hip.base).multiply(q);
      if (limb.mid) limb.mid.bone.quaternion.copy(limb.mid.base).multiply(q.setFromAxisAngle(limb.mid.axis, -0.7));
      continue;
    }
    q.setFromAxisAngle(limb.hip.axis, -1.45);
    limb.hip.bone.quaternion.copy(limb.hip.base).multiply(q);
    if (limb.mid) limb.mid.bone.quaternion.copy(limb.mid.base).multiply(q.setFromAxisAngle(limb.mid.axis, 1.45));
  }
  // Standing, the hips are legLen up; sitting, they rest on the seat
  m.bob.position.y = seat - b.legLen * 0.97;
  m.bob.userData.baseY = m.bob.position.y;
}

// ============================================================================
// 🎯 Chapter 1's objectives (the quest card + arrow)
// ============================================================================
function storySteps(w: StoryWorld): TutorialScript {
  const at = (x: number, z: number, home = false) => v3(x + (home ? HOME_X : 0), 0, z);
  const st = () => w.st;
  const f = () => w.st.flags;
  const has = (t: ItemType) => w.carrying(t);
  return {
    intro: { title: '', html: '' },
    finish: { title: '', html: '', button: '' },
    defs: [],
    skippable: false,
    onFinish: () => w.chapterEnd(),
    steps: (): Step[] => [
      // 🏠 the prologue
      { text: () => '📱 Your phone is ringing! Answer it (living room)', target: () => at(P.phone.x, P.phone.z + 1.5, true), done: () => !!f().called },
      {
        text: () => '👕 Pack 2 sets of clothes: from the dresser (bedroom) into your suitcase',
        target: () => (has('clothes') ? at(P.suitcase.x, P.suitcase.z, true) : at(P.dresser.x - 1.9, P.dresser.z, true)),
        progress: () => (f().clothes ?? 0) / 2,
        done: () => (f().clothes ?? 0) >= 2,
      },
      {
        text: () => '🐜 Pack your ant farm too: it\'s on the desk',
        target: () => (has('antfarm') ? at(P.suitcase.x, P.suitcase.z, true) : at(P.desk.x, P.desk.z + 1.6, true)),
        done: () => !!f().antsPacked,
      },
      { text: () => '🚪 Rae is waiting at the airfield. Head out the front door', target: () => at(P.frontDoor.x, P.house.maxZ - 1.1, true), done: () => !!f().landed },
      // ⛽ the errand
      { text: () => '⛽ Follow the trail north to the old research camp', target: () => at(P.research.x, P.research.z + 6), done: () => !!f().campSeen },
      {
        text: () => '⛽ Grab the 2 fuel cans in the fuel shed',
        target: () => at(P.fuelShed.x - 0.5, P.fuelShed.z + 2.6),
        progress: () => (f().fuelTaken ?? 0) / 2,
        done: () => (f().fuelTaken ?? 0) >= 2,
      },
      { text: () => '📖 Someone left a notebook on the table. Read it', target: () => at(P.table.x, P.table.z + 1.6), done: () => !!f().page1 },
      { text: () => '🏃 That roar came from the airstrip. Get back to Rae!', target: () => at(P.raeHurt.x, P.raeHurt.z), done: () => !!f().back },
      // 🏕️ survive
      {
        text: () => '⛽ Leave the fuel cans by the plane',
        target: () => at(P.fuelDrop.x, P.fuelDrop.z),
        progress: () => st().fed.fuel / 2,
        done: () => st().fed.fuel >= 2 || has('fuel') === 0,
      },
      {
        text: () => `🪵 Gather ${T.campfire} logs at the fallen trees (west of camp)`,
        target: () => at(P.logs.x, P.logs.z),
        progress: () => has('log') / T.campfire,
        done: () => has('log') >= T.campfire || !!f().campfire,
      },
      {
        text: () => `🔥 Build a campfire: drop ${T.campfire} logs on the fire pit`,
        target: () => (has('log') ? at(P.campfire.x, P.campfire.z) : at(P.logs.x, P.logs.z)),
        progress: () => (st().plots.campfire ?? 0) / T.campfire,
        done: () => !!f().campfire,
      },
      {
        text: () => `🛠️ Build a workbench: ${T.bench} logs`,
        target: () => (has('log') ? at(P.bench.x, P.bench.z) : at(P.logs.x, P.logs.z)),
        progress: () => (st().plots.bench ?? 0) / T.bench,
        done: () => !!f().bench,
      },
      {
        text: () => `🍓 Pick ${T.antFeed} bunches of berries (the bush east of the fire)`,
        target: () => at(P.berries.x, P.berries.z),
        progress: () => has('berry') / T.antFeed,
        done: () => has('berry') >= T.antFeed || !!f().runner,
      },
      {
        text: () => '🐜 Feed your ants: drop the berries at their nest by the plane\'s tail',
        target: () => (has('berry') ? at(P.nest.x, P.nest.z) : at(P.berries.x, P.berries.z)),
        progress: () => st().fed.ants / T.antFeed,
        done: () => !!f().runner,
      },
      {
        text: () => `📡 Make a radio mast: the workbench needs ${T.mast} logs (your ant helps!)`,
        target: () => (has('log') ? at(P.bench.x - 2.2, P.bench.z + 2.4) : at(P.logs.x, P.logs.z)),
        progress: () => w.mastProgress(),
        done: () => st().bench.made > 0 || has('mast') > 0 || !!f().mast || w.mastReady(),
      },
      {
        text: () => '📡 Take the mast to the radio, by the plane\'s door',
        target: () => (has('mast') ? at(P.radio.x, P.radio.z) : at(P.bench.x + 2.2, P.bench.z + 2.4)),
        done: () => !!f().mast,
      },
      // 🦕 the little dino
      {
        text: () => '🦕 Something is pinned under a fallen tree on the trail. Lift it off (stand beside it)',
        target: () => at(P.trap.x + 3.4, P.trap.z),
        progress: () => w.liftProgress(),
        done: () => st().dino.state !== 'trapped' && st().dino.state !== 'hidden',
      },
      {
        text: () => `🍓 It's scared and hungry. Bring it ${T.dinoFeed} bunches of berries`,
        target: () => {
          const d = w.dinoAt();
          return has('berry') ? at(d.x, d.z) : at(P.berries.x, P.berries.z);
        },
        progress: () => st().fed.dino / T.dinoFeed,
        done: () => st().dino.state === 'trust',
      },
      {
        text: () => '📦 Lead your dino to the radio shed at the research camp',
        target: () => at(P.radioShed.x, P.radioShed.z + 3),
        done: () => st().dino.carrying || !!f().signal,
      },
      {
        text: () => '🏕️ Lead it back to the radio at the plane (it follows you)',
        target: () => at(P.radio.x, P.radio.z),
        done: () => !!f().signal,
      },
    ],
  };
}
