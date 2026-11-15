// ============================================================================
// homeWorld.ts — 🏝️ ANTHILL ISLAND (test version): YOUR BACKYARD.
//
// The new one-island game from the design doc. You're a person (Jack's model)
// with an ant farm in the backyard; the ants become your workforce as the farm
// grows. This test covers the opening (see data/home.ts). Every station is a
// little business of its own: raw supply -> converter -> counter -> cash pad.
//
//   🍞 BREAD BOX -> 🐜 ANT FARM (crumbs in, snack packs out) -> 🍪 SNACK STAND,
//   where the neighbors line up with their 🙋 ORDERS (cash + lots of XP) -> its
//   💵 cash pad. On the side: the 📦 DELIVERY CRATE (🪵 planks).
//   Farm Lv 2: a GATHERER ant (bread box -> farm). Farm Lv 3: a CARRIER ant
//              (farm -> the stand's shelf) + the crate shows up.
//   At the stand (you hire helpers where they work): a CASHIER (a person), then
//              a BANKER ant by its cash pad: the backyard runs by itself.
//   The CORNER CAFÉ PLOT: player level + ants working + planks + cash, on one
//              tile by the east gate. Coffee: 🫘 BEAN SACKS -> ☕ COFFEE MACHINE
//              -> the café counter, with its own gatherer, carrier, cashier and
//              banker. The new plot hides a 🎁 chest.
//
// Everything is "stand on a pad" like the classic game, and the building panels
// (⬆️) work here too (world key 'home').
// ============================================================================
import * as THREE from 'three';
import { clock } from '../core/clock';
import { autoCash } from '../core/income';
import { bump } from '../core/totals';
import { Upgrades } from './upgradePad';
import { trash } from './trash';
import { CONFIG } from '../data/config';
import { HOME, HOME_RENAMED, HOME_UNLOCKS, LOT_AT, NEIGHBORS, STREET_LOTS, StreetLotDef, lotRect } from '../data/home';
import { Sfx } from '../core/audio';
import { HomeSave, SaveData } from '../core/save';
import { Progress } from '../core/progress';
import { Hud } from '../ui/hud';
import { HumanKind } from '../actors/creatures';
import { Player, fpFov, handsSpot } from '../actors/player';
import { Banker, Route, Worker } from '../actors/worker';
import { Flyers, ITEM_VALUE, ItemType, Stack, StackItem, makeItem } from './items';
import { TextSprite, makePad, titleTag } from './labels';
import { Blocker, CashPad, ProcessorOpts, ResourcePile, TrashBin, UnlockTile, Zone, gridLayout } from './stations';
import { Desk, person } from './airportWorld';
import { TUTORIAL_DONE, Tutorial, TutorialScript } from './tutorial';
import { Neighborhood } from './neighborhood';
import { Shop, buildShop } from './buildings';
import { Ride, Traffic } from './traffic';
import { CarService } from './carService';
import { pace } from '../core/pace';
import type { MapArea, MapMarker, MapRect, MapSeg, MapView } from '../ui/minimap';

const mat = (color: number, roughness = 0.7, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
/** How far east you can walk along the street: just past the last street business. */
const STREET_END = Math.max(62, ...STREET_LOTS.map((d) => d.minX + HOME.lotWidth)) + 4;
function box(w: number, h: number, d: number, material: THREE.Material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Title tags over the helper ants (smaller than the people's). */
const ANT_TITLE = 0.6;
/**
 * The backyard's save format (HomeSave.v). 2: the café's staff are hired at the café.
 * 3: the snack stand + the café's coffee. 4: the neighbors' orders at the snack stand
 * (the garden table is gone). Both changed the tutorial's steps (see homeTutorial).
 */
const HOME_SAVE_V = 5; // (5: v0.30, the Corner Store)
/** 🎓 The tutorial steps that an action finishes (their places in homeTutorial's list). */
const STEP = { crumbs: 0, feed: 1, packs: 2, cash: 4, beans: 12, coffee: 13 } as const;
/** v3's tutorial step -> v4's (the stand's sale became the first order; the order steps merged in). */
const TUTORIAL_V3: number[] = [0, 1, 2, 3, 4, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
/** Who shows up with orders / at the café (the people models). */
const CAFE_KINDS: HumanKind[] = ['h-exec', 'h-balance', 'h-ember', 'h-crew1', 'h-crew2', 'h-crew4'];
/** A stretch of fence that can be taken down again: its meshes and its lines on the minimap. */
interface FenceBag { objs: THREE.Object3D[]; segs: MapSeg[] }
/** 🚗 One of the street's businesses (data/home.ts STREET_LOTS), as it stands in the world. */
interface StreetLot {
  def: StreetLotDef;
  rect: MapRect;
  open: boolean;
  lot: THREE.Group;        // the empty lot (until it's bought)
  fence: FenceBag;         // the fence along the sidewalk: down when the forecourt opens
  signs: TextSprite[];     // what its plot needs, over its tile on the sidewalk
  service: CarService | null;
  pile: ResourcePile | null;
  pad: CashPad | null;
}
/** Who shops at the Corner Store. */
const STORE_KINDS: HumanKind[] = ['h-director', 'h-balance', 'h-crew3', 'h-crew1', 'h-sarah', 'h-ember', 'h-crew4'];

// ----------------------------------------------------------------------------
// The sand-and-tunnels picture inside the ant farm.
// ----------------------------------------------------------------------------
function sandTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#d9b77a';
  g.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 1400; i++) {
    g.fillStyle = Math.random() < 0.5 ? 'rgba(120,85,40,0.25)' : 'rgba(255,240,200,0.3)';
    g.fillRect(Math.random() * 512, Math.random() * 256, 2, 2);
  }
  // Grass on top
  g.fillStyle = '#5cbf43';
  g.fillRect(0, 0, 512, 14);
  // Tunnels and chambers
  g.strokeStyle = '#6b4426';
  g.lineCap = 'round';
  g.lineWidth = 16;
  const tunnel = (pts: number[]) => {
    g.beginPath();
    g.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
    g.stroke();
  };
  tunnel([70, 10, 90, 70, 60, 120, 120, 170, 210, 190]);
  tunnel([90, 70, 220, 90, 300, 70, 420, 110, 450, 180]);
  tunnel([300, 70, 330, 10]);
  tunnel([210, 190, 330, 210, 450, 180]);
  tunnel([220, 90, 250, 140, 330, 210]);
  g.fillStyle = '#6b4426';
  for (const [x, y, rx, ry] of [[60, 120, 34, 18], [210, 190, 40, 20], [420, 110, 36, 18], [250, 140, 28, 16]]) {
    g.beginPath();
    g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    g.fill();
  }
  // Eggs in a chamber, and a crumb stash
  g.fillStyle = '#fff6dd';
  for (let i = 0; i < 5; i++) {
    g.beginPath();
    g.ellipse(196 + i * 8, 190 + (i % 2) * 5, 4, 6, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = '#e8b45a';
  for (let i = 0; i < 6; i++) g.fillRect(405 + (i % 3) * 9, 104 + Math.floor(i / 3) * 8, 7, 6);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ----------------------------------------------------------------------------
// 🐜 THE ANT FARM: a glass frame full of sand and tunnels on a table. Crumbs go
// in on the left (IN), snack packs come out on the right (OUT). Same shape as
// the colony's oven (inZone / outZone / speedMult), so the ⬆️ panel and the ⚠️
// status tag work with it too.
// ----------------------------------------------------------------------------
const FARM: ProcessorOpts = { inType: 'crumb', outType: 'snack', label: '🐜 ANT FARM', cookTime: HOME.farm.cookTime, body: 0x9b6a3c, trim: 0x6b4426, glow: 0xffd166 };

class AntFarm {
  group = new THREE.Group();
  input: Stack;
  output: Stack;
  inZone: Zone;
  outZone: Zone;
  blocker: Blocker;
  opts = FARM;
  /** ⬆️ Upgrade: makes snack packs this many times faster. */
  speedMult = 1;
  /** Making one right now (the ⚠️ status tag reads it). */
  cooking = false;
  /** A snack pack came out. */
  onMade: () => void = () => {};
  private cookT = 0;
  private feed = new THREE.Object3D();  // crumbs drop in here (the funnel on top)
  private hatch = new THREE.Object3D(); // snack packs come out here
  private sign = new TextSprite(0.7);
  private ants: THREE.InstancedMesh;
  private walkers: { x: number; y: number; vx: number; vy: number; t: number }[] = [];
  private shown = 0;
  private dummy = new THREE.Object3D();
  private sand = { x0: -1.85, x1: 1.85, y0: 1.35, y1: 3.0, z: 0.17 };

  constructor(private scene: THREE.Scene, x: number, z: number, private flyers: Flyers) {
    this.group.position.set(x, 0, z);
    scene.add(this.group);
    const wood = mat(0x9b6a3c, 0.85);
    const dark = mat(0x6b4426, 0.9);
    // The table
    this.group.add(box(5.2, 0.16, 2.0, wood, 0, 1.0, 0));
    for (const [lx, lz] of [[-2.4, -0.8], [2.4, -0.8], [-2.4, 0.8], [2.4, 0.8]]) this.group.add(box(0.16, 1.0, 0.16, dark, lx, 0.5, lz));
    // The ant farm: a tall, thin frame with sand and tunnels behind glass
    const W = 4.0;
    const H = 2.2;
    const y0 = 1.08;
    this.group.add(box(W + 0.3, 0.16, 0.6, dark, 0, y0 + 0.08, 0));
    this.group.add(box(W + 0.3, 0.16, 0.6, dark, 0, y0 + H + 0.24, 0));
    for (const s of [-1, 1]) this.group.add(box(0.15, H + 0.16, 0.6, dark, s * (W / 2 + 0.07), y0 + 0.16 + H / 2, 0));
    const sand = new THREE.Mesh(new THREE.BoxGeometry(W, H * 0.86, 0.3), new THREE.MeshStandardMaterial({ map: sandTexture(), roughness: 1 }));
    sand.position.set(0, y0 + 0.16 + H * 0.43, 0);
    sand.receiveShadow = true;
    this.group.add(sand);
    const glass = new THREE.Mesh(
      new THREE.BoxGeometry(W, H, 0.5),
      new THREE.MeshStandardMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.2, roughness: 0.1, metalness: 0.1, depthWrite: false }),
    );
    glass.position.set(0, y0 + 0.16 + H / 2, 0);
    glass.renderOrder = 3;
    this.group.add(glass);
    // A feeding funnel on top (crumbs drop in) and a little hatch at the bottom (snacks out)
    const funnel = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.12, 0.5, 16, 1, true), new THREE.MeshStandardMaterial({ color: 0xe9c46a, roughness: 0.5, side: THREE.DoubleSide }));
    funnel.position.set(-1.3, y0 + H + 0.58, 0);
    this.group.add(funnel);
    this.feed.position.set(-1.3, y0 + H + 0.6, 0);
    this.hatch.position.set(1.6, y0 + 0.5, 0.45);
    this.group.add(this.feed, this.hatch);
    this.group.add(box(0.6, 0.35, 0.25, mat(0x2a9d8f, 0.5), 1.6, y0 + 0.38, 0.3));

    // Tiny ants scurrying through the tunnels (one InstancedMesh = one draw call)
    const antGeo = new THREE.CapsuleGeometry(0.035, 0.09, 3, 6);
    antGeo.rotateZ(Math.PI / 2);
    this.ants = new THREE.InstancedMesh(antGeo, mat(0x3a1208, 0.6), 30);
    this.ants.count = 0;
    this.group.add(this.ants);
    for (let i = 0; i < 30; i++) {
      this.walkers.push({
        x: THREE.MathUtils.lerp(this.sand.x0, this.sand.x1, Math.random()),
        y: THREE.MathUtils.lerp(this.sand.y0, this.sand.y1, Math.random()),
        vx: (Math.random() < 0.5 ? -1 : 1) * (0.25 + Math.random() * 0.35),
        vy: 0,
        t: Math.random() * 3,
      });
    }

    // IN / OUT trays at hand height, with their pads in front
    for (const s of [-1, 1]) this.group.add(box(1.4, 1.0, 1.4, wood, s * 3.6, 0.5, 0.4));
    this.input = new Stack(this.group, gridLayout(3, 3, 0.44, 0.44, 1.0, -3.6, 0.4), CONFIG.bakery.inputMax);
    this.output = new Stack(this.group, gridLayout(2, 3, 0.62, 0.44, 1.0, 3.6, 0.4), CONFIG.bakery.outputMax);
    const inPad = makePad(2.4, 2.4, 'IN');
    inPad.position.set(-3.6, 0.03, 2.9);
    const outPad = makePad(2.4, 2.4, 'OUT');
    outPad.position.set(3.6, 0.03, 2.9);
    this.group.add(inPad, outPad);
    this.inZone = new Zone(x - 3.6, z + 2.9, 1.2, 1.2);
    this.outZone = new Zone(x + 3.6, z + 2.9, 1.2, 1.2);
    this.blocker = { minX: x - 4.35, maxX: x + 4.35, minZ: z - 1.1, maxZ: z + 1.2 };

    this.sign.sprite.position.set(0, 4.4, 0);
    this.group.add(this.sign.sprite);
    this.setLevel(1);
  }

  /** The farm's level: more ants inside, and it says so on its sign. */
  setLevel(level: number) {
    this.sign.setText(`🐜 ANT FARM · Lv ${level}`);
    this.shown = Math.min(30, 6 + (level - 1) * 6);
  }

  update(dt: number) {
    const feedAt = new THREE.Vector3();
    this.feed.getWorldPosition(feedAt);
    const hatchAt = new THREE.Vector3();
    this.hatch.getWorldPosition(hatchAt);
    // Start one: a crumb drops into the funnel
    if (!this.cooking && this.input.canPop() && !this.output.full) {
      const it = this.input.pop()!;
      this.flyers.fly(it.mesh, () => feedAt, () => it.mesh.removeFromParent(), 0.3, 0.9);
      this.cooking = true;
      this.cookT = 0;
    }
    if (this.cooking) {
      this.cookT += dt;
      if (this.cookT >= this.opts.cookTime / this.speedMult) {
        this.cooking = false;
        bump('made'); // 📊 lifetime: items made
        const it: StackItem = { mesh: makeItem('snack'), type: 'snack', value: 0, flying: false };
        it.mesh.position.copy(hatchAt);
        this.scene.add(it.mesh);
        this.flyers.pushInto(it, this.output, 0.3);
        this.onMade();
      }
    }
    // The tiny ants: busier while the farm is working
    const s = this.sand;
    const busy = this.cooking ? 1.8 : 1;
    this.ants.count = this.shown;
    for (let i = 0; i < this.shown; i++) {
      const w = this.walkers[i];
      w.t -= dt;
      if (w.t <= 0) {
        // now and then: turn, or dig up / down a level
        w.t = 0.6 + Math.random() * 2;
        w.vx = (Math.random() < 0.5 ? -1 : 1) * (0.25 + Math.random() * 0.35);
        w.vy = Math.random() < 0.35 ? (Math.random() < 0.5 ? -1 : 1) * 0.25 : 0;
      }
      w.x += w.vx * dt * busy;
      w.y += w.vy * dt * busy;
      if (w.x < s.x0 || w.x > s.x1) w.vx = -w.vx;
      if (w.y < s.y0 || w.y > s.y1) w.vy = -w.vy;
      w.x = THREE.MathUtils.clamp(w.x, s.x0, s.x1);
      w.y = THREE.MathUtils.clamp(w.y, s.y0, s.y1);
      this.dummy.position.set(w.x, w.y, s.z);
      this.dummy.rotation.set(0, 0, Math.atan2(w.vy, w.vx));
      this.dummy.updateMatrix();
      this.ants.setMatrixAt(i, this.dummy.matrix);
    }
    this.ants.instanceMatrix.needsUpdate = true;
  }
}

// ----------------------------------------------------------------------------
// ☕ THE COFFEE MACHINE (the Corner Café's converter): sacks of beans go in on
// the left (IN), cups of coffee come out on the right (OUT). Same shape as the
// ant farm (inZone / outZone / speedMult / cooking), so the ⬆️ panel and the ⚠️
// status tag work with it too.
// ----------------------------------------------------------------------------
const COFFEE: ProcessorOpts = { inType: 'beans', outType: 'coffee', label: '☕ COFFEE MACHINE', cookTime: HOME.coffee.cookTime, body: 0x3a3f45, trim: 0xc9ccd1, glow: 0xffb347 };

class CoffeeMachine {
  group = new THREE.Group();
  input: Stack;
  output: Stack;
  inZone: Zone;
  outZone: Zone;
  blocker: Blocker;
  opts = COFFEE;
  /** ⬆️ Upgrade: brews this many times faster. */
  speedMult = 1;
  /** Brewing one right now (the ⚠️ status tag reads it). */
  cooking = false;
  private cookT = 0;
  private hopper = new THREE.Object3D(); // beans drop in here (the glass hopper on top)
  private spout = new THREE.Object3D();  // cups come out here
  private lamp: THREE.MeshStandardMaterial;
  private puffs: { mesh: THREE.Mesh; mat: THREE.MeshStandardMaterial }[] = [];

  constructor(private scene: THREE.Scene, x: number, z: number, private flyers: Flyers) {
    this.group.position.set(x, 0, z);
    scene.add(this.group);
    const steel = mat(0x3a3f45, 0.35, 0.6);
    const chrome = mat(0xc9ccd1, 0.25, 0.8);
    const wood = mat(0x9b6a3c, 0.85);
    // A counter, and the big espresso machine on it
    this.group.add(box(3.0, 1.0, 1.7, mat(0x6b4426, 0.85), 0, 0.5, -0.1));
    this.group.add(box(3.1, 0.08, 1.8, mat(0xe9e4da, 0.5), 0, 1.04, -0.1));
    this.group.add(box(2.4, 1.5, 1.1, steel, 0, 1.83, -0.3));
    this.group.add(box(2.5, 0.14, 1.2, chrome, 0, 2.65, -0.3));
    // The bean hopper on top: a glass cone with beans in it
    const glass = new THREE.MeshStandardMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.45, roughness: 0.1, side: THREE.DoubleSide, depthWrite: false });
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.18, 0.75, 16, 1, true), glass);
    cone.position.set(-0.6, 3.1, -0.3);
    const inside = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.18, 0.4, 14), mat(0x4a2c1a, 0.6));
    inside.position.set(-0.6, 2.93, -0.3);
    this.group.add(cone, inside);
    this.hopper.position.set(-0.6, 3.5, -0.3);
    // Two group heads over a drip tray, a pressure gauge and a "brewing" lamp
    for (const gx of [-0.45, 0.45]) {
      const head = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.22, 14), chrome);
      head.position.set(gx, 1.55, 0.32);
      head.castShadow = true;
      this.group.add(head);
    }
    this.group.add(box(1.7, 0.06, 0.45, chrome, 0, 1.1, 0.5));
    const gauge = new THREE.Mesh(new THREE.CircleGeometry(0.2, 18), mat(0xffffff, 0.4));
    gauge.position.set(0.75, 2.2, 0.255);
    this.lamp = new THREE.MeshStandardMaterial({ color: 0x331a0f, emissive: COFFEE.glow, emissiveIntensity: 0.25 });
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), this.lamp);
    lamp.position.set(-0.75, 2.2, 0.27);
    this.spout.position.set(0, 1.35, 0.55);
    this.group.add(gauge, lamp, this.hopper, this.spout);
    // Steam over the machine while it brews
    for (let i = 0; i < 3; i++) {
      const m = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0, roughness: 1, depthWrite: false });
      const puff = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), m);
      puff.visible = false;
      this.group.add(puff);
      this.puffs.push({ mesh: puff, mat: m });
    }

    // IN / OUT tables, with their pads in front (like the colony's oven)
    for (const s of [-1, 1]) this.group.add(box(1.5, 0.8, 1.5, wood, s * 2.3, 0.4, 0.6));
    this.input = new Stack(this.group, gridLayout(3, 3, 0.46, 0.46, 0.8, -2.3, 0.6), CONFIG.bakery.inputMax);
    this.output = new Stack(this.group, gridLayout(3, 3, 0.46, 0.46, 0.8, 2.3, 0.6), CONFIG.bakery.outputMax);
    const inPad = makePad(2.2, 2.2, 'IN');
    inPad.position.set(-2.3, 0.03, 2.6);
    const outPad = makePad(2.2, 2.2, 'OUT');
    outPad.position.set(2.3, 0.03, 2.6);
    this.group.add(inPad, outPad);
    this.inZone = new Zone(x - 2.3, z + 2.6, 1.15, 1.15);
    this.outZone = new Zone(x + 2.3, z + 2.6, 1.15, 1.15);
    this.blocker = { minX: x - 3.05, maxX: x + 3.05, minZ: z - 1.1, maxZ: z + 1.4 };
    const sign = new TextSprite(0.8);
    sign.setText(COFFEE.label);
    sign.sprite.position.set(0, 4.3, 0);
    this.group.add(sign.sprite);
  }

  update(dt: number) {
    // Start one: a sack of beans drops into the hopper
    if (!this.cooking && this.input.canPop() && !this.output.full) {
      const it = this.input.pop()!;
      const hopperAt = this.hopper.getWorldPosition(new THREE.Vector3());
      this.flyers.fly(it.mesh, () => hopperAt, () => it.mesh.removeFromParent(), 0.3, 0.9);
      this.cooking = true;
      this.cookT = 0;
    }
    if (this.cooking) {
      this.cookT += dt;
      if (this.cookT >= this.opts.cookTime / this.speedMult) {
        this.cooking = false;
        bump('made'); // 📊 lifetime: items made
        const it: StackItem = { mesh: makeItem('coffee'), type: 'coffee', value: 0, flying: false };
        this.spout.getWorldPosition(it.mesh.position);
        this.scene.add(it.mesh);
        this.flyers.pushInto(it, this.output, 0.3);
      }
    }
    this.lamp.emissiveIntensity = this.cooking ? 0.9 + Math.sin(this.cookT * 10) * 0.5 : 0.25;
    // Steam: three puffs rising from the top, one after another
    this.puffs.forEach(({ mesh, mat: m }, i) => {
      mesh.visible = this.cooking;
      if (!this.cooking) return;
      const k = (this.cookT * 0.9 + i / 3) % 1;
      mesh.position.set(0.55 + Math.sin(k * 6 + i * 2) * 0.12, 2.85 + k * 1.3, -0.3);
      mesh.scale.setScalar(0.6 + k * 1.1);
      m.opacity = 0.55 * (1 - k);
    });
  }
}

// ----------------------------------------------------------------------------
// 🛍️ THE PACKING TABLE (the Corner Store's converter, v0.30): crates of groceries
// go in on the left (IN), packed shopping bags come out on the right (OUT). The
// same shape as the coffee machine (inZone / outZone / speedMult / cooking), so
// the ⬆️ panel and the ⚠️ status tag work with it too.
// ----------------------------------------------------------------------------
const PACKING: ProcessorOpts = { inType: 'grocery', outType: 'shopbag', label: '🛍️ PACKING TABLE', cookTime: HOME.packing.cookTime, body: 0x2f7d4f, trim: 0xf4f1de, glow: 0x9be37a };

class PackingTable {
  group = new THREE.Group();
  input: Stack;
  output: Stack;
  inZone: Zone;
  outZone: Zone;
  blocker: Blocker;
  opts = PACKING;
  /** ⬆️ Upgrade: packs this many times faster. */
  speedMult = 1;
  /** Packing one right now (the ⚠️ status tag reads it). */
  cooking = false;
  private cookT = 0;
  private bench = new THREE.Object3D(); // crates are opened here
  private bagSpot = new THREE.Object3D(); // packed bags come off here
  private bag: THREE.Mesh;              // the bag being filled (it grows as it's packed)
  private lamp: THREE.MeshStandardMaterial;

  constructor(private scene: THREE.Scene, x: number, z: number, private flyers: Flyers) {
    this.group.position.set(x, 0, z);
    scene.add(this.group);
    const wood = mat(0x9b6a3c, 0.85);
    // A long workbench under a green-and-white striped shade, with shelves of produce behind it
    this.group.add(box(3.0, 1.0, 1.7, mat(PACKING.body, 0.8), 0, 0.5, -0.1));
    this.group.add(box(3.1, 0.08, 1.8, mat(0xe9e4da, 0.5), 0, 1.04, -0.1));
    this.group.add(box(3.0, 1.9, 0.3, wood, 0, 1.95, -0.85));
    for (const y of [1.6, 2.3]) this.group.add(box(2.8, 0.08, 0.5, mat(PACKING.trim, 0.7), 0, y, -0.6));
    const produce = [0xe63946, 0xf4a261, 0x4caf50, 0xffd166, 0x9b5de5, 0x4caf50, 0xe63946, 0xf4a261];
    produce.forEach((color, i) => {
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), mat(color, 0.7));
      ball.position.set(-1.1 + (i % 4) * 0.73, i < 4 ? 1.8 : 2.5, -0.55);
      this.group.add(ball);
    });
    for (let i = 0; i < 5; i++) this.group.add(box(0.62, 0.1, 1.5, mat(i % 2 ? PACKING.trim : PACKING.body, 0.7), -1.24 + i * 0.62, 3.1, 0.1));
    for (const px of [-1.5, 1.5]) this.group.add(box(0.08, 3.1, 0.08, mat(0x5a5f66, 0.4, 0.5), px, 1.55, 0.8));
    this.bench.position.set(-0.6, 1.5, 0);
    this.bagSpot.position.set(0.6, 1.3, 0.2);
    this.bag = box(0.36, 0.44, 0.26, mat(0xc9a36b, 0.95), 0.6, 1.3, 0.1);
    this.bag.visible = false;
    this.lamp = new THREE.MeshStandardMaterial({ color: 0x1d3320, emissive: PACKING.glow, emissiveIntensity: 0.25 });
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), this.lamp);
    lamp.position.set(-1.3, 1.25, 0.75);
    this.group.add(this.bench, this.bagSpot, this.bag, lamp);

    // IN / OUT tables, with their pads in front (like the coffee machine)
    for (const k of [-1, 1]) this.group.add(box(1.5, 0.8, 1.5, wood, k * 2.3, 0.4, 0.6));
    this.input = new Stack(this.group, gridLayout(3, 3, 0.46, 0.46, 0.8, -2.3, 0.6), CONFIG.bakery.inputMax);
    this.output = new Stack(this.group, gridLayout(3, 3, 0.46, 0.46, 0.8, 2.3, 0.6), CONFIG.bakery.outputMax);
    const inPad = makePad(2.2, 2.2, 'IN');
    inPad.position.set(-2.3, 0.03, 2.6);
    const outPad = makePad(2.2, 2.2, 'OUT');
    outPad.position.set(2.3, 0.03, 2.6);
    this.group.add(inPad, outPad);
    this.inZone = new Zone(x - 2.3, z + 2.6, 1.15, 1.15);
    this.outZone = new Zone(x + 2.3, z + 2.6, 1.15, 1.15);
    this.blocker = { minX: x - 3.05, maxX: x + 3.05, minZ: z - 1.1, maxZ: z + 1.4 };
    const sign = new TextSprite(0.8);
    sign.setText(PACKING.label);
    sign.sprite.position.set(0, 4.3, 0);
    this.group.add(sign.sprite);
  }

  update(dt: number) {
    // Start one: a crate of groceries lands on the bench
    if (!this.cooking && this.input.canPop() && !this.output.full) {
      const it = this.input.pop()!;
      const benchAt = this.bench.getWorldPosition(new THREE.Vector3());
      this.flyers.fly(it.mesh, () => benchAt, () => it.mesh.removeFromParent(), 0.3, 0.9);
      this.cooking = true;
      this.cookT = 0;
    }
    if (this.cooking) {
      this.cookT += dt;
      const k = Math.min(1, this.cookT / (this.opts.cookTime / this.speedMult));
      this.bag.scale.setScalar(0.3 + 0.7 * k); // (the bag fills up)
      if (k >= 1) {
        this.cooking = false;
        bump('made'); // 📊 lifetime: items made
        const it: StackItem = { mesh: makeItem('shopbag'), type: 'shopbag', value: 0, flying: false };
        this.bagSpot.getWorldPosition(it.mesh.position);
        this.scene.add(it.mesh);
        this.flyers.pushInto(it, this.output, 0.3);
      }
    }
    this.bag.visible = this.cooking;
    this.lamp.emissiveIntensity = this.cooking ? 0.9 + Math.sin(this.cookT * 10) * 0.5 : 0.25;
  }
}

// ----------------------------------------------------------------------------
// 📦 The delivery crate: fill it with goods you can make, it goes off on a truck
// and comes back with 🪵 planks (the building material new plots need).
// ----------------------------------------------------------------------------
class Crate {
  group = new THREE.Group();
  body = new THREE.Group();
  zone: Zone;
  stack: Stack;
  blocker: Blocker;
  sign = new TextSprite(0.66, '#ffffff');
  constructor(scene: THREE.Scene, x: number, z: number) {
    this.group.position.set(x, 0, z);
    scene.add(this.group);
    this.group.add(this.body);
    const wood = mat(0xb5803f, 0.85);
    this.body.add(box(2.0, 0.16, 1.6, mat(0x7a5530, 0.9), 0, 0.08, 0)); // pallet
    this.body.add(box(1.8, 1.1, 1.4, wood, 0, 0.71, 0));
    for (const y of [0.35, 1.05]) this.body.add(box(1.86, 0.1, 1.46, mat(0x8a5a2b, 0.85), 0, y, 0));
    this.stack = new Stack(this.body, gridLayout(3, 3, 0.5, 0.42, 1.27), 40);
    const pad = makePad(2.4, 2.4, 'CRATE', '#ffb347');
    pad.position.set(-2.4, 0.03, 0);
    this.group.add(pad);
    this.zone = new Zone(x - 2.4, z, 1.2, 1.2);
    // (solid only while it's here: away on the truck, you can walk through its spot)
    this.blocker = { minX: x - 1.05, maxX: x + 1.05, minZ: z - 0.85, maxZ: z + 0.85, obj: this.body };
    this.sign.sprite.position.set(0, 3.1, 0);
    this.group.add(this.sign.sprite);
  }
}

// ----------------------------------------------------------------------------
// 🎁 A chest hidden on a new plot. Walk into it to open it.
// ----------------------------------------------------------------------------
class Chest {
  group = new THREE.Group();
  zone: Zone;
  private lid = new THREE.Group();
  private openT = -1;
  /** Opened and cleared away (the world drops it then). */
  gone = false;
  constructor(scene: THREE.Scene, x: number, z: number) {
    this.group.position.set(x, 0, z);
    scene.add(this.group);
    const wood = mat(0x8a4b22, 0.8);
    const gold = mat(0xf2c14e, 0.35, 0.6);
    this.group.add(box(1.4, 0.75, 0.9, wood, 0, 0.375, 0));
    for (const x2 of [-0.55, 0.55]) this.group.add(box(0.12, 0.78, 0.94, gold, x2, 0.39, 0));
    this.lid.position.set(0, 0.75, -0.45);
    const lidBox = box(1.4, 0.32, 0.9, wood, 0, 0.16, 0.45);
    this.lid.add(lidBox, box(0.24, 0.2, 0.08, gold, 0, 0.05, 0.92));
    this.group.add(this.lid);
    this.zone = new Zone(x, z, 1.3, 1.3);
  }
  /** Pop the lid open (animated). */
  open() {
    this.openT = 0;
  }
  /** The lid pops open, it sits there a moment, then it shrinks away. */
  update(dt: number) {
    if (this.openT < 0 || this.gone) return;
    this.openT += dt;
    const k = Math.min(1, this.openT / 0.5);
    this.lid.rotation.x = -1.9 * (1 - (1 - k) ** 3);
    const out = (this.openT - 2.5) / 0.4; // (after 2.5 s: gone in 0.4 s)
    if (out > 0) this.group.scale.setScalar(Math.max(0.001, 1 - out));
    if (out >= 1) {
      this.group.removeFromParent();
      this.gone = true;
    }
  }
}

// ============================================================================
// The backyard
// ============================================================================
export class HomeWorld {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(42, 1, 0.1, 300);
  flyers = new Flyers(this.scene);
  player: Player;
  /** (always the world on screen: there's only one for now) */
  active = true;
  /** ⬆️ The building panels. */
  ups: Upgrades | null = null;
  tutorial: Tutorial;

  // Stations (field names matter: the ⬆️ panels look through them)
  piles: ResourcePile[] = [];
  processors: (AntFarm | CoffeeMachine | PackingTable)[] = [];
  desks: Desk[] = [];
  cashPads: CashPad[] = [];
  tiles: UnlockTile[] = [];
  workers: Worker[] = [];
  bankers: Banker[] = [];
  bin: TrashBin;

  farm: AntFarm;
  bread: ResourcePile;
  /**
   * 🍪 The snack stand by the street, its cash pad, and where the Carrier stocks it from:
   * past the back corner of the counter (not behind it: the awning would hide the ant).
   */
  stand: Desk;
  standPad: CashPad;
  standLoad = new Zone(-8.6, 3.4, 0.6, 0.6);
  crate: Crate | null = null;
  /** ☕ The Corner Café (once its plot is yours): bean sacks -> coffee machine -> the counter, its own cash pad. */
  beans: ResourcePile | null = null;
  machine: CoffeeMachine | null = null;
  cafe: Desk | null = null;
  cafePad: CashPad | null = null;
  cafeLoad = new Zone(24.4, -1.6, 0.6, 0.6); // (the Carrier's spot: past the counter's back corner, like the stand's)
  chest: Chest | null = null;
  /** 🛒 The Corner Store (once its plot is yours, v0.30): grocery crates -> packing table -> the checkout, its own cash pad. */
  groceries: ResourcePile | null = null;
  packing: PackingTable | null = null;
  store: Desk | null = null;
  storePad: CashPad | null = null;
  storeLoad = new Zone(45.4, -1.6, 0.6, 0.6); // (the Carrier's spot, as at the café)
  storeChest: Chest | null = null;
  /**
   * 🚗 The street businesses, east of the store on the way to the airport (v0.47: the gas station, the car wash,
   * the garage). (The field's name matters: the ⬆️ panels look through it for each one's bays and supply pile.)
   */
  lots: StreetLot[] = [];

  private home: HomeSave;
  private blockers: Blocker[] = [];
  private timers = new Map<object, number>();
  private sun = new THREE.DirectionalLight(0xffffff, 2.6);
  private camOffset = new THREE.Vector3(0, 16, 15.5);
  private thirdFov = 42;
  private zoneName = '';
  private gate = new THREE.Group();     // the closed gate to the café plot
  private lot = new THREE.Group();      // the empty lot (before the café is bought)
  private plotSign: TextSprite[] = [];  // what the café plot needs, over its gate
  private plotSignT = 0;
  private cafeOpen = false;
  /** 🏘️ The streets and houses around you: where your customers come from and go home to. */
  private hood!: Neighborhood;
  private gate2 = new THREE.Group();    // the closed gate from the café to the store plot
  private lot2 = new THREE.Group();     // the store's empty lot
  private plotSign2: TextSprite[] = []; // what the store plot needs, over its gate
  private storeOpen = false;
  /** Just bought a tile here: the next one on this spot (the farm levels share one) waits until you step off. */
  private stepOff: Zone | null = null;
  /** 🗺️ For the minimap: the fences and trees, as they're built. */
  private fenceSegs: MapSeg[] = [];
  /** The picket fences round the two empty lots: each comes down when its shop's building goes up (v0.32). */
  private cafeFence: FenceBag = { objs: [], segs: [] };
  private storeFence: FenceBag = { objs: [], segs: [] };
  /**
   * 🏬 The shops' buildings (v0.32): real walls and a roof when you look through your own eyes; in the
   * top-down view only their low wall stubs show, so you can see in ("roofs off").
   */
  private shops: Shop[] = [];
  /**
   * 🚗 The street's cars (v0.32): through-traffic, and some customers come by car. A car that has
   * parked at a shop waits for the people it brought: `seats` still to get out, `owed` still to come back.
   */
  private traffic!: Traffic;
  private walkerList: THREE.Vector3[] = [];
  private rides = new Map<number, { ride: Ride; seats: number; owed: number; age: number }>();
  private rideDue = new Set<number>(); // (a car is on its way to this shop)
  private cutaway = true;
  private treeSpots: { x: number; z: number; r: number }[] = [];
  /** 🙋 Neighbors who've come by (names and looks cycle; the first two order 5, then 10). */
  private neighborsSeen = 0;

  /** Where you start (between the farm's IN and OUT, south of it). */
  static readonly SPAWN = { x: -1, z: -0.5 };
  /** A save from before v0.29 (with progress) just got the orders at the stand (and maybe the coffee): homeMain says what's new. */
  readonly fromOld: boolean;
  /** A save from before v0.30 (no Corner Store yet): the 📰 news card tells them about it, once. */
  readonly preStore: boolean;

  constructor(private hud: Hud, private sfx: Sfx, public save: SaveData, private progress: Progress) {
    this.home = save.home ??= { made: 0, orders: 0, crate: { trips: 0, got: {}, away: 0 }, planks: 0, chest: false, cafeSales: 0, standSales: 0, v: HOME_SAVE_V };
    if ((this.home.v ?? 1) < 2) {
      // v0.27 save: the café's cashier and banker were farm levels (same prices): rename them
      // (and never twice: a save holding both names would hire two of each)
      const renamed = [...new Set(save.unlocked.map((id) => HOME_RENAMED[id] ?? id))];
      save.unlocked.splice(0, save.unlocked.length, ...renamed);
      for (const [from, to] of Object.entries(HOME_RENAMED)) {
        if (save.paid[from] === undefined) continue;
        if (save.paid[to] === undefined && !save.unlocked.includes(to)) save.paid[to] = save.paid[from];
        delete save.paid[from];
      }
    }
    this.fromOld = (this.home.v ?? 1) < 4 && this.home.made > 0;
    this.preStore = (this.home.v ?? 1) < 5 && this.home.made > 0;
    if ((this.home.v ?? 1) < 3) {
      // v0.27 save: no snack stand yet, and the café sold snack packs. Mid-tutorial, the
      // steps moved (the stand's came in after "take the snack packs"): anyone past that
      // goes back to the stand's first step, and the steps they've done skip themselves.
      this.home.standSales ??= 0;
      if (save.tutorial >= 3 && save.tutorial < TUTORIAL_DONE) save.tutorial = 3;
    }
    if ((this.home.v ?? 1) < 4) {
      // v0.28 save: the neighbors' orders were at a garden table of their own (an open
      // one there is dropped: the neighbors line up at the stand now, and lines aren't
      // saved), and the tutorial had a step for the stand's first sale.
      delete (this.home as { order?: unknown }).order;
      if (save.tutorial < TUTORIAL_DONE) save.tutorial = TUTORIAL_V3[save.tutorial] ?? save.tutorial;
    }
    this.home.v = HOME_SAVE_V;
    this.neighborsSeen = this.home.orders;
    this.buildEnvironment();

    // You: Jack's model, in front of the ant farm (on open grass: never on a tile, or
    // loading the game would start paying into it)
    const me = person('h-jack');
    me.root.position.set(HomeWorld.SPAWN.x, 0, HomeWorld.SPAWN.z);
    me.root.rotation.y = Math.PI;
    this.player = new Player(this.scene, { model: me, spot: handsSpot(me) });

    // The bread box, the ant farm, the order table, the trash bin
    this.bread = new ResourcePile(this.scene, -10, -2.5, this.flyers, 'crumb', 'bread');
    this.piles.push(this.bread);
    this.farm = new AntFarm(this.scene, -1, -6, this.flyers);
    this.processors.push(this.farm);
    this.blockers.push(this.farm.blocker);
    this.farm.onMade = () => {
      this.home.made++;
    };
    this.bin = new TrashBin(this.scene, -11.6, 2.6);

    // 🍪 The snack stand by the street: your neighbors line up there with their orders.
    // They come in through the gap in the south fence and line up east of the counter
    // (in along z 9.6, out along z 10.4, so the two don't walk through each other).
    this.standPad = new CashPad(this.scene, -2, 2.6);
    this.cashPads.push(this.standPad);
    this.stand = new Desk(this.scene, -6, 6.6, this.flyers, this.standPad, null, {
      mode: 'cafe', sells: 'snack', machine: false, awning: 0xe76f51, label: '🍪 SNACK STAND', color: 0xc8975a, kinds: CAFE_KINDS,
      interval: HOME.stand.interval, queueMax: HOME.stand.queueMax, serve: HOME.stand.serve,
      // (they come out of a house across the street, over the crosswalk and in by the gap in the fence; and go home again)
      entry: () => this.wayIn(13.8, [new THREE.Vector3(13.8, 0, 9.6), new THREE.Vector3(5, 0, 9.6)], this.home.orders < 2),
      exit: (from) => this.wayOut(13.8, [new THREE.Vector3(from.x, 0, 10.4), new THREE.Vector3(13.8, 0, 10.4)]),
      staff2: () => person('h-crew1'), // (the ⬆️ panel's 2nd cashier: a 2nd line, two neighbors at once)
      order: () => this.nextNeighbor(),
      firstIn: HOME.order.firstIn,
    });
    this.stand.onServe = () => {
      this.home.standSales++;
    };
    this.stand.onOrder = (o, byPlayer) => this.orderFilled(o, byPlayer);
    // (a pack pays the order price: $7, +5% per level)
    this.stand.valueMult = () => (HOME.order.pay / ITEM_VALUE.snack) * (1 + 0.05 * (this.save.level - 1)) * this.progress.cashMult;
    this.desks.push(this.stand);
    this.blockers.push(this.stand.blocker);

    for (const def of HOME_UNLOCKS) this.tiles.push(new UnlockTile(this.scene, def, save.paid[def.id] ?? 0));
    const plot = this.tiles.find((t) => t.def.id === 'ai-cafe');
    if (plot) plot.need = () => this.plotNeed();
    const plot2 = this.tiles.find((t) => t.def.id === 'ai-store');
    if (plot2) plot2.need = () => this.storeNeed();
    for (const lot of this.lots) {
      const tile = this.tiles.find((t) => t.def.id === `ai-${lot.def.key}`);
      if (tile) tile.need = () => this.lotNeed(lot);
    }
    // (in the tiles' order, whatever order the save lists them in: a café helper needs its café)
    const order = (id: string) => HOME_UNLOCKS.findIndex((d) => d.id === id);
    for (const id of [...save.unlocked].sort((a, b) => order(a) - order(b))) this.applyUnlock(id, false);
    this.refreshTiles(false);

    // An order that was open when you left: the neighbor is still waiting

    this.hud.setCash(save.cash);
    this.tutorial = new Tutorial(this, hud, save, homeTutorial(this));
    this.camera.position.copy(this.player.pos).add(this.camOffset);
    this.camera.lookAt(this.player.pos);
  }

  // --------------------------------------------------------------------------
  // Building the backyard
  // --------------------------------------------------------------------------
  private buildEnvironment() {
    const s = this.scene;
    s.background = new THREE.Color(0x9fd8ff);
    s.fog = new THREE.Fog(0x9fd8ff, 60, 150);
    s.add(new THREE.HemisphereLight(0xffffff, 0x7a8a5a, 1.7));
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -24;
    sc.right = sc.top = 24;
    sc.near = 1;
    sc.far = 70;
    this.sun.shadow.bias = -0.0005;
    s.add(this.sun, this.sun.target);

    // The lawn (mowing stripes), the sidewalk and the street
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d')!;
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 ? '#79c257' : '#6fb84e';
      g.fillRect(i * 32, 0, 32, 256);
    }
    const lawnTex = new THREE.CanvasTexture(c);
    lawnTex.colorSpace = THREE.SRGBColorSpace;
    lawnTex.wrapS = lawnTex.wrapT = THREE.RepeatWrapping;
    lawnTex.repeat.set(8, 8);
    // (v0.47: twice as long, for the street running on east to the car wash and the garage)
    lawnTex.repeat.set(35, 8); // (v0.56: the lawn runs on under the whole street, to the airport)
    const lawn = new THREE.Mesh(new THREE.PlaneGeometry(700, 160), new THREE.MeshStandardMaterial({ map: lawnTex, roughness: 1 }));
    lawn.rotation.x = -Math.PI / 2;
    lawn.position.set(190, -0.01, 0);
    lawn.receiveShadow = true;
    s.add(lawn);
    const flat = (w: number, d: number, color: number, x: number, z: number, y = 0) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat(color, 0.95));
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, y, z);
      m.receiveShadow = true;
      s.add(m);
      return m;
    };
    // 🏘️ The neighborhood (v0.31): the streets, the sidewalks, the houses across the street and up the
    // side street, and your own house north of the yard, its back door onto the deck
    this.hood = new Neighborhood(s);
    this.traffic = new Traffic(s, { ambient: 3, pedestrians: () => this.walkerList });
    Neighborhood.yourHouse(s);
    s.add(box(14, 0.3, 2.2, mat(0xa0703f, 0.85), -5, 0.15, -12)); // deck
    // A big shade tree, a smaller one behind the picnic table, and some bushes
    this.tree(12, -8.5, 1.0);
    this.tree(-12.5, -9.2, 0.8);
    for (const [bx, bz] of [[-14, -6], [-14, 2], [5, -10.3], [14, -10.2], [-6, 10.3]]) {
      const bush = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 8), mat(0x3f8f3a, 0.9));
      bush.scale.set(1.3, 0.8, 1);
      bush.position.set(bx, 0.6, bz);
      bush.castShadow = true;
      s.add(bush);
    }
    // A picnic table by the bread box
    const wood = mat(0xa0703f, 0.85);
    s.add(box(3.0, 0.14, 1.3, wood, -11.8, 1.15, -6.4), box(3.0, 0.1, 0.4, wood, -11.8, 0.65, -5.3), box(3.0, 0.1, 0.4, wood, -11.8, 0.65, -7.5));
    this.blockers.push({ minX: -13.4, maxX: -10.2, minZ: -7.8, maxZ: -5.0 });

    // The fences: around the yard (a gap in the south for the neighbors, a gate east to the café plot)
    const Y = HOME.yard;
    // (open along the deck: your back door leads straight out into the yard)
    this.fence(Y.minX, Y.minZ, -12, Y.minZ);
    this.fence(2, Y.minZ, Y.maxX, Y.minZ);
    this.fence(Y.minX, Y.minZ, Y.minX, Y.maxZ);
    this.fence(Y.minX, Y.maxZ, 11.2, Y.maxZ);
    this.fence(Y.maxX, Y.minZ, Y.maxX, HOME.gate.z0);
    this.fence(Y.maxX, HOME.gate.z1, Y.maxX, Y.maxZ);
    // The gate (closed until the café plot is yours)
    const gateMat = mat(0xffffff, 0.6);
    const len = HOME.gate.z1 - HOME.gate.z0;
    this.gate.position.set(Y.maxX, 0, HOME.gate.z0);
    for (const y of [0.5, 1.1]) this.gate.add(box(0.1, 0.12, len, gateMat, 0, y, len / 2));
    for (let zz = 0.2; zz < len; zz += 0.45) this.gate.add(box(0.12, 1.3, 0.16, gateMat, 0, 0.65, zz));
    s.add(this.gate);
    // The café plot next door: an empty lot for now
    const P = HOME.cafePlot;
    this.fence(P.minX, P.minZ, P.maxX, P.minZ, this.cafeFence);
    // (its east fence has a gate too: to the store plot, closed until that one is yours)
    this.fence(P.maxX, P.minZ, P.maxX, HOME.gate.z0, this.cafeFence);
    this.fence(P.maxX, HOME.gate.z1, P.maxX, P.maxZ, this.cafeFence);
    this.gate2.position.set(P.maxX, 0, HOME.gate.z0);
    for (const y of [0.5, 1.1]) this.gate2.add(box(0.1, 0.12, len, gateMat, 0, y, len / 2));
    for (let zz = 0.2; zz < len; zz += 0.45) this.gate2.add(box(0.12, 1.3, 0.16, gateMat, 0, 0.65, zz));
    s.add(this.gate2);
    this.fence(P.minX, P.maxZ, 28.5, P.maxZ, this.cafeFence);
    // 🛒 The store plot after it: another empty lot
    const S = HOME.storePlot;
    this.fence(S.minX, S.minZ, S.maxX, S.minZ, this.storeFence);
    this.fence(S.maxX, S.minZ, S.maxX, S.maxZ, this.storeFence);
    this.fence(S.minX, S.maxZ, 49.5, S.maxZ, this.storeFence);
    this.lot2.add(flat(S.maxX - S.minX, S.maxZ - S.minZ, 0xb39368, (S.minX + S.maxX) / 2, (S.minZ + S.maxZ) / 2, 0.006));
    const sale2 = new TextSprite(0.8, '#ffd166');
    sale2.setText('🏷️ LOT FOR SALE');
    sale2.sprite.position.set(47, 3.2, 0);
    this.lot2.add(sale2.sprite);
    this.lot2.add(box(0.15, 2.4, 0.15, mat(0x6b4426), 47, 1.2, 0));
    s.add(this.lot2);
    for (let i = 0; i < 3; i++) {
      const t = new TextSprite(i === 0 ? 0.78 : 0.6, i === 0 ? '#ffd166' : '#ffffff');
      t.sprite.position.set(34.2, 5.0 - i * 0.78, -1.7); // (over its tile)
      t.sprite.visible = false;
      s.add(t.sprite);
      this.plotSign2.push(t);
    }
    // 🚗 The lots along the street after the store: each fenced off along the sidewalk until it's yours, then an open forecourt
    for (const def of STREET_LOTS) {
      const G = lotRect(def);
      const lot: StreetLot = { def, rect: G, open: false, lot: new THREE.Group(), fence: { objs: [], segs: [] }, signs: [], service: null, pile: null, pad: null };
      this.fence(G.minX, G.minZ, G.maxX, G.minZ);
      this.fence(G.maxX, G.minZ, G.maxX, G.maxZ);
      this.fence(G.minX, G.maxZ, G.maxX, G.maxZ, lot.fence);
      lot.lot.add(flat(G.maxX - G.minX, G.maxZ - G.minZ, 0xb39368, (G.minX + G.maxX) / 2, (G.minZ + G.maxZ) / 2, 0.006));
      const sale3 = new TextSprite(0.8, '#ffd166');
      sale3.setText('🏷️ LOT FOR SALE');
      sale3.sprite.position.set(G.minX + LOT_AT.sale[0], 3.2, LOT_AT.sale[1]);
      lot.lot.add(sale3.sprite);
      lot.lot.add(box(0.15, 2.4, 0.15, mat(0x6b4426), G.minX + LOT_AT.sale[0], 1.2, LOT_AT.sale[1]));
      s.add(lot.lot);
      for (let i = 0; i < 3; i++) {
        const t = new TextSprite(i === 0 ? 0.78 : 0.6, i === 0 ? '#ffd166' : '#ffffff');
        t.sprite.position.set(G.minX + LOT_AT.plotTile[0], 5.0 - i * 0.78, LOT_AT.plotTile[1]); // (over its tile)
        t.sprite.visible = false;
        s.add(t.sprite);
        lot.signs.push(t);
      }
      this.lots.push(lot);
    }
    this.lot.add(flat(P.maxX - P.minX, P.maxZ - P.minZ, 0xb39368, (P.minX + P.maxX) / 2, (P.minZ + P.maxZ) / 2, 0.006));
    const sale = new TextSprite(0.8, '#ffd166');
    sale.setText('🏷️ LOT FOR SALE');
    sale.sprite.position.set(26, 3.2, 0);
    this.lot.add(sale.sprite);
    this.lot.add(box(0.15, 2.4, 0.15, mat(0x6b4426), 26, 1.2, 0));
    s.add(this.lot);
    // What the plot needs (shown over the gate until it's bought)
    // (over the plot's tile, just inside the gate, so it's on screen as you walk up)
    for (let i = 0; i < 3; i++) {
      const t = new TextSprite(i === 0 ? 0.78 : 0.6, i === 0 ? '#ffd166' : '#ffffff');
      t.sprite.position.set(12.4, 5.0 - i * 0.78, (HOME.gate.z0 + HOME.gate.z1) / 2);
      s.add(t.sprite);
      this.plotSign.push(t);
    }
  }

  /**
   * A customer's way in to the shop whose crosswalk is at `cx`. If a car is parked there with someone still
   * in it, they get out of it; otherwise they walk from a house, and now and then a car sets off to bring the next ones.
   */
  private wayIn(cx: number, rest: THREE.Vector3[], quick = false) {
    const r = this.rides.get(cx);
    if (r && r.seats > 0 && r.ride.state === 'parked') {
      r.seats--;
      r.owed++;
      return [r.ride.curb.clone(), new THREE.Vector3(r.ride.curb.x, 0, 13.6), new THREE.Vector3(cx, 0, 13.6), ...rest];
    }
    if (!quick && !r && !this.rideDue.has(cx) && Math.random() < 0.45) {
      this.rideDue.add(cx);
      this.traffic.arrive(cx, 'north', {
        kind: Math.random() < 0.75 ? 'car' : 'van',
        onParked: (ride) => {
          this.rideDue.delete(cx);
          this.rides.set(cx, { ride, seats: 1 + Math.floor(Math.random() * 2), owed: 0, age: 0 });
        },
      });
    }
    return this.hood.routeIn(cx, rest, quick);
  }

  /** ...and the way home: back to the car they came in (it drives off once everyone is in), or to a house on foot. */
  private wayOut(cx: number, first: THREE.Vector3[]) {
    const r = this.rides.get(cx);
    if (r && r.owed > 0 && r.ride.state === 'parked') {
      r.owed--;
      const path = [...first, new THREE.Vector3(cx, 0, 13.6), new THREE.Vector3(r.ride.curb.x, 0, 13.6), r.ride.curb.clone()];
      if (r.owed === 0 && r.seats === 0) {
        // (the last one back: the car leaves when they reach it. People walk at 4.2 x the movement speed setting)
        let len = 0;
        for (let i = 1; i < path.length; i++) len += path[i].distanceTo(path[i - 1]);
        r.ride.leaveIn(len / (4.2 * Math.max(0.2, pace.move)) + 1.2);
        this.rides.delete(cx);
      }
      return path;
    }
    return this.hood.routeOut(cx, first);
  }

  /** 🏬 A shop's building goes up on its plot: the lot's fence comes down, its walls go on the map. */
  private raiseShop(bag: FenceBag, spec: Parameters<typeof buildShop>[0], animate: boolean) {
    this.dropFence(bag);
    const shop = buildShop(spec);
    shop.setCutaway(this.cutaway);
    this.scene.add(shop.group);
    this.shops.push(shop);
    this.fenceSegs.push(...shop.outline);
    if (animate) this.flyers.grow(shop.group);
  }

  /** Take a lot's picket fence down (its shop's walls stand there now). */
  private dropFence(bag: FenceBag) {
    for (const o of bag.objs) o.removeFromParent();
    this.fenceSegs = this.fenceSegs.filter((seg) => !bag.segs.includes(seg));
    bag.objs.length = bag.segs.length = 0;
  }

  /** A simple round tree. */
  private tree(x: number, z: number, k: number) {
    const trunk = box(0.6 * k, 4 * k, 0.6 * k, mat(0x7a4b2a, 0.9), x, 2 * k, z);
    const crown = new THREE.Mesh(new THREE.SphereGeometry(3 * k, 14, 10), mat(0x4f9a35, 0.85));
    crown.position.set(x, 5.2 * k, z);
    crown.castShadow = true;
    this.scene.add(trunk, crown);
    this.blockers.push({ minX: x - 0.5 * k, maxX: x + 0.5 * k, minZ: z - 0.5 * k, maxZ: z + 0.5 * k });
    this.treeSpots.push({ x, z, r: 3 * k });
  }

  /** A white picket fence from (x1, z1) to (x2, z2): one InstancedMesh of pickets + two rails. */
  private fence(x1: number, z1: number, x2: number, z2: number, bag?: FenceBag) {
    const seg = { x0: x1, z0: z1, x1: x2, z1: z2 };
    this.fenceSegs.push(seg);
    bag?.segs.push(seg);
    const len = Math.hypot(x2 - x1, z2 - z1);
    const n = Math.max(2, Math.round(len / 0.45));
    const white = mat(0xffffff, 0.6);
    const pickets = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 1.3, 0.12), white, n);
    const m = new THREE.Matrix4();
    const angle = Math.atan2(x2 - x1, z2 - z1);
    for (let i = 0; i < n; i++) {
      const k = i / (n - 1);
      m.makeRotationY(angle);
      m.setPosition(x1 + (x2 - x1) * k, 0.65, z1 + (z2 - z1) * k);
      pickets.setMatrixAt(i, m);
    }
    pickets.castShadow = true;
    this.scene.add(pickets);
    bag?.objs.push(pickets);
    for (const y of [0.45, 1.05]) {
      const rail = box(0.08, 0.12, len, white, (x1 + x2) / 2, y, (z1 + z2) / 2);
      rail.rotation.y = angle;
      this.scene.add(rail);
      bag?.objs.push(rail);
    }
  }

  // --------------------------------------------------------------------------
  // Where you can walk
  // --------------------------------------------------------------------------
  private canWalk = (x: number, z: number) => {
    const Y = HOME.yard;
    if (x > Y.minX + 0.6 && x < Y.maxX - 0.6 && z > Y.minZ + 0.6 && z < Y.maxZ - 0.6) return true;
    if (this.onStreet(x, z)) return true;
    if (!this.cafeOpen) return false;
    const P = HOME.cafePlot;
    if (x > P.minX + 0.6 && x < P.maxX - 0.6 && z > P.minZ + 0.6 && z < P.maxZ - 0.6) return true;
    const inGate = z > HOME.gate.z0 + 0.4 && z < HOME.gate.z1 - 0.4;
    if (x >= Y.maxX - 0.6 && x <= P.minX + 0.6 && inGate) return true; // through the gate
    // 🚗 A street business's forecourt: open to the sidewalk all along its front
    for (const lot of this.lots) {
      const G = lot.rect;
      if (lot.open && x > G.minX + 0.6 && x < G.maxX - 0.6 && z > G.minZ + 0.6 && z <= 12.4) return true;
    }
    if (!this.storeOpen) return false;
    const S = HOME.storePlot;
    if (x > S.minX + 0.6 && x < S.maxX - 0.6 && z > S.minZ + 0.6 && z < S.maxZ - 0.6) return true;
    return x >= P.maxX - 0.6 && x <= S.minX + 0.6 && inGate; // through the café's east gate
  };

  /**
   * 🚶 OUT ON THE STREET (v0.33): once your first order is filled you can leave the yard by the gap in its
   * fence (and a shop by its front door) and walk the sidewalks, cross the street, and go up the side
   * street to the corner. Not into the neighbors' gardens. The cars brake for you.
   */
  private onStreet(x: number, z: number) {
    if (!this.owns('ai-order1')) return false;
    // The main street, sidewalk to sidewalk
    if (z > 12.4 && z < 26.6 && x > -33 && x < STREET_END) return true; // (on past the store, along the street businesses)
    // The side street and its sidewalks, north from the corner
    if (x > -32.6 && x < -18.4 && z > -46 && z <= 12.4) return true;
    // The ways out to the sidewalk: the gap in your fence, and each shop's front door
    if (z >= HOME.yard.maxZ - 0.7 && z <= 12.4) {
      if (x > 11.9 && x < 14.4) return true;
      if (this.cafeOpen && x > 32.1 && x < 33.9) return true;
      if (this.storeOpen && x > 53.1 && x < 54.9) return true;
    }
    return false;
  }

  // --------------------------------------------------------------------------
  // Helpers (the ants)
  // --------------------------------------------------------------------------
  private antWorker(title: string, x: number, z: number, route: () => Route, hat: { color: number; flat?: boolean }, animate: boolean) {
    const w = new Worker(this.scene, x, z, route, hat, HOME.antLength);
    titleTag(w.model, title, ANT_TITLE);
    this.workers.push(w);
    if (animate) this.flyers.grow(w.model.root);
    return w;
  }

  // --------------------------------------------------------------------------
  // Unlocks
  // --------------------------------------------------------------------------
  private owns(id: string) {
    return this.save.unlocked.includes(id);
  }

  /** What the café plot still needs besides level and cash ('' = nothing). */
  private storeNeed() {
    if (this.workers.length < HOME.storeGate.ants) return `NEEDS ${HOME.storeGate.ants} ANTS WORKING`;
    if (this.home.planks < HOME.storeGate.planks) return `NEEDS ${HOME.storeGate.planks} PLANKS`;
    return '';
  }

  /** What a street lot still needs besides level and cash. */
  private lotNeed(lot: StreetLot) {
    const g = lot.def.gate;
    if (this.workers.length < g.ants) return `NEEDS ${g.ants} ANTS WORKING`;
    if (this.home.planks < g.planks) return `NEEDS ${g.planks} PLANKS`;
    return '';
  }

  private plotNeed() {
    if (this.workers.length < HOME.plot.ants) return `NEEDS ${HOME.plot.ants} ANTS WORKING`;
    if (this.home.planks < HOME.plot.planks) return `NEEDS ${HOME.plot.planks} PLANKS`;
    return '';
  }

  private applyUnlock(id: string, animate: boolean) {
    const grow = (o: THREE.Object3D) => animate && this.flyers.grow(o);
    switch (id) {
      case 'ai-farm2':
        // 🐜 The Gatherer: the bread box -> the farm's IN tray, all day
        this.antWorker('🐜 GATHERER', -8, -1, () => ({ src: this.bread.stack, srcZone: this.bread.zone, dst: this.farm.input, dstZone: this.farm.inZone }), { color: 0xffc928 }, animate);
        this.farm.setLevel(2);
        break;
      case 'ai-farm3': {
        // 🐜 The Carrier: the farm's OUT tray -> the snack stand's shelf (it stocks it from
        // the back corner of the counter, so it never walks through the stand or its line)
        const shelf = this.stand.shelf!;
        this.antWorker('🐜 CARRIER', 1, -1, () => ({ src: this.farm.output, srcZone: this.farm.outZone, dst: shelf, dstZone: this.standLoad }), { color: 0xe63946, flat: true }, animate);
        this.farm.setLevel(3);
        // ...and the delivery crate turns up by the south fence
        this.crate = new Crate(this.scene, 9, 7);
        this.blockers.push(this.crate.blocker);
        grow(this.crate.group);
        if (this.home.crate.away === 0) {
          for (const [t, n] of Object.entries(this.home.crate.got)) for (let i = 0; i < n; i++) this.crate.stack.addInstant(t as ItemType);
        }
        break;
      }
      case 'ai-stand-cashier':
        // 🍪 A person behind the stand's counter: sells your snack packs for you
        this.stand.hireStaff(person('h-crew4'), animate, '🍪 CASHIER');
        break;
      case 'ai-stand-banker':
        this.hireBanker(this.standPad, animate);
        break;
      case 'ai-cafe':
        this.openCafe(animate);
        break;
      case 'ai-cafe-gatherer': {
        // 🐜 The café's Gatherer: the bean sacks -> the coffee machine's IN tray
        const beans = this.beans;
        const machine = this.machine;
        if (beans && machine) this.antWorker('🐜 GATHERER', 21, -5.2, () => ({ src: beans.stack, srcZone: beans.zone, dst: machine.input, dstZone: machine.inZone }), { color: 0xffc928 }, animate);
        break;
      }
      case 'ai-cafe-carrier': {
        // 🐜 The café's Carrier: the coffee machine's OUT tray -> the café's shelf (from its back corner)
        const machine = this.machine;
        const shelf = this.cafe?.shelf;
        if (machine && shelf) this.antWorker('🐜 CARRIER', 31.5, -3, () => ({ src: machine.output, srcZone: machine.outZone, dst: shelf, dstZone: this.cafeLoad }), { color: 0xe63946, flat: true }, animate);
        break;
      }
      case 'ai-cashier':
        // ☕ A person behind the café's counter: sells the coffee for you
        this.cafe?.hireStaff(person('h-crew3'), animate, '☕ CASHIER');
        break;
      case 'ai-banker':
        if (this.cafePad) this.hireBanker(this.cafePad, animate);
        break;
      case 'ai-store':
        this.openStore(animate);
        break;
      case 'ai-store-gatherer': {
        // 🐜 The store's Gatherer: the grocery crates -> the packing table's IN tray
        const crates = this.groceries;
        const table = this.packing;
        if (crates && table) this.antWorker('🐜 GATHERER', 42, -5.2, () => ({ src: crates.stack, srcZone: crates.zone, dst: table.input, dstZone: table.inZone }), { color: 0xffc928 }, animate);
        break;
      }
      case 'ai-store-carrier': {
        // 🐜 The store's Carrier: the packing table's OUT tray -> the checkout's shelf
        const table = this.packing;
        const shelf = this.store?.shelf;
        if (table && shelf) this.antWorker('🐜 CARRIER', 52.5, -3, () => ({ src: table.output, srcZone: table.outZone, dst: shelf, dstZone: this.storeLoad }), { color: 0xe63946, flat: true }, animate);
        break;
      }
      case 'ai-store-cashier':
        // 🛒 A person at the checkout: sells the groceries for you
        this.store?.hireStaff(person('h-crew2'), animate, '🛒 CASHIER');
        break;
      case 'ai-store-banker':
        if (this.storePad) this.hireBanker(this.storePad, animate);
        break;
      default: {
        // 🚗 A street business's tiles: its plot, its carrier ant, its person, its banker
        const lot = this.lots.find((l) => id === `ai-${l.def.key}` || id.startsWith(`ai-${l.def.key}-`));
        if (!lot) break;
        const d = lot.def;
        const what = id.slice(`ai-${d.key}`.length + 1);
        if (what === '') this.openLot(lot, animate);
        else if (what === 'carrier') {
          const pile = lot.pile;
          const service = lot.service;
          if (pile && service && d.carrier) this.antWorker(d.carrier.title, d.minX + LOT_AT.ant[0], LOT_AT.ant[1], () => ({ src: pile.stack, srcZone: pile.zone, dst: service.shelf, dstZone: service.loadZone }), { color: d.carrier.hat, flat: true }, animate);
        } else if (what === d.staff.id) lot.service?.hireStaff(person(d.staff.kind), animate, d.staff.title);
        else if (what === 'banker' && lot.pad) this.hireBanker(lot.pad, animate);
        break;
      }
    }
  }

  /** 🏦 A banker ant by a cash pad: sweeps the bills into your wallet (idle income). */
  private hireBanker(pad: CashPad, animate: boolean) {
    const b = new Banker(this.scene, pad, (amount) => {
      const v = amount * (this.ups?.bonus ?? 1); // (+ 💼 collectors upgrade)
      this.addCash(v);
      autoCash(v); // automated income: the +$/min rate
    }, HOME.antLength);
    titleTag(b.model, '🏦 BANKER', ANT_TITLE);
    this.bankers.push(b);
    if (animate) this.flyers.grow(b.model.root);
  }

  /** ☕ The Corner Café plot: the gate opens, the café and its coffee go up, a chest is hidden on it. */
  private openCafe(animate: boolean) {
    if (this.cafeOpen) return;
    this.cafeOpen = true;
    this.gate.visible = false;
    this.lot.visible = false;
    for (const t of this.plotSign) t.sprite.visible = false;
    const P = HOME.cafePlot;
    // A paved patio
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d')!;
    g.fillStyle = '#d8cbb3';
    g.fillRect(0, 0, 256, 256);
    g.strokeStyle = 'rgba(120,100,70,0.35)';
    g.lineWidth = 3;
    for (let i = 0; i <= 256; i += 32) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.stroke();
      g.beginPath(); g.moveTo(0, i); g.lineTo(256, i); g.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(5, 5);
    const patio = new THREE.Mesh(new THREE.PlaneGeometry(P.maxX - P.minX, P.maxZ - P.minZ), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
    patio.rotation.x = -Math.PI / 2;
    patio.position.set((P.minX + P.maxX) / 2, 0.007, (P.minZ + P.maxZ) / 2);
    patio.receiveShadow = true;
    this.scene.add(patio);
    // 🏬 Its building: doors to your yard (west) and to the next plot (east), the shop front on the street
    this.raiseShop(this.cafeFence, {
      rect: P, wall: 0xf3e9dc, trim: 0x2d6cdf, roof: 0x5a5f66, sign: '☕ CORNER CAFÉ', awning: 0x2d6cdf,
      doors: [{ side: 'west', from: HOME.gate.z0, to: HOME.gate.z1 }, { side: 'east', from: HOME.gate.z0, to: HOME.gate.z1 }, { side: 'south', from: 31.5, to: 34.5 }],
    }, animate);
    // ☕ The coffee: bean sacks -> the coffee machine (north side of the plot)...
    this.beans = new ResourcePile(this.scene, 18.6, -7.6, this.flyers, 'beans', 'beans');
    this.piles.push(this.beans);
    this.machine = new CoffeeMachine(this.scene, 27.5, -8, this.flyers);
    this.processors.push(this.machine);
    this.blockers.push(this.machine.blocker);
    // ...and the café: a counter that sells it, with its own cash pad
    // (the counter sits level with the gate; its line runs east to the gap in the fence)
    const pad = new CashPad(this.scene, 18.6, -2.6);
    this.cafePad = pad;
    this.cashPads.push(pad);
    const cafe = new Desk(this.scene, 23, 1.5, this.flyers, pad, null, {
      mode: 'cafe', sells: 'coffee', awning: 0x2d6cdf, label: '☕ CORNER CAFÉ', color: 0xd9a066, kinds: CAFE_KINDS,
      interval: HOME.cafe.interval, queueMax: HOME.cafe.queueMax, serve: HOME.cafe.serve,
      entry: () => this.wayIn(33, [new THREE.Vector3(33, 0, 5)]),
      exit: (from) => this.wayOut(33, [new THREE.Vector3(from.x, 0, 5), new THREE.Vector3(33, 0, 8)]), // (out by the front door)
      staff2: () => person('h-balance'), // (the ⬆️ panel's 2nd cashier: someone who looks different from the first)
    });
    cafe.onServe = (byPlayer) => {
      this.progress.addXp(byPlayer ? CONFIG.xp.sale : CONFIG.xp.autoSale);
      this.home.cafeSales++;
      this.tutorial.did(STEP.coffee);
    };
    cafe.valueMult = () => this.progress.cashMult;
    this.cafe = cafe;
    this.desks.push(cafe);
    this.blockers.push(cafe.blocker);
    // Patio tables with umbrellas
    const tables: THREE.Object3D[] = [];
    for (const [tx, tz, color] of [[33, -8, 0x2a9d8f], [18.4, 8.6, 0xf4a261]] as [number, number, number][]) {
      const t = new THREE.Group();
      t.position.set(tx, 0, tz);
      t.add(box(1.4, 0.1, 1.4, mat(0xf4f1de, 0.5), 0, 1.0, 0), box(0.1, 1.0, 0.1, mat(0x5a5f66, 0.4, 0.5), 0, 0.5, 0), box(0.07, 2.6, 0.07, mat(0x5a5f66, 0.4, 0.5), 0, 1.3, 0));
      const umbrella = new THREE.Mesh(new THREE.ConeGeometry(1.35, 0.55, 8), mat(color, 0.6));
      umbrella.position.y = 2.65;
      umbrella.castShadow = true;
      t.add(umbrella);
      this.scene.add(t);
      tables.push(t);
      this.blockers.push({ minX: tx - 0.8, maxX: tx + 0.8, minZ: tz - 0.8, maxZ: tz + 0.8 });
    }
    // 🎁 The chest (once it's been opened, it's gone)
    if (!this.home.chest) this.chest = new Chest(this.scene, 28, 8.5);
    if (animate) {
      for (const o of [patio, cafe.group, pad.group, this.beans.group, this.machine.group, ...tables]) this.flyers.grow(o);
      if (this.chest) this.flyers.grow(this.chest.group);
      this.hud.banner('☕ The Corner Café is yours!', '🫘 Beans → ☕ the coffee machine → the counter. And something is hidden on the new plot…', 4500);
    }
  }

  /** 🛒 The Corner Store plot (v0.30): the café's east gate opens, the store goes up, another chest is hidden. */
  private openStore(animate: boolean) {
    if (this.storeOpen) return;
    this.storeOpen = true;
    this.gate2.visible = false;
    this.lot2.visible = false;
    for (const t of this.plotSign2) t.sprite.visible = false;
    const S = HOME.storePlot;
    // A tiled floor (pale green and cream, like a little market)
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d')!;
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      g.fillStyle = (i + j) % 2 ? '#dfe9d2' : '#f1ecdd';
      g.fillRect(i * 64, j * 64, 64, 64);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 3);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(S.maxX - S.minX, S.maxZ - S.minZ), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set((S.minX + S.maxX) / 2, 0.007, (S.minZ + S.maxZ) / 2);
    floor.receiveShadow = true;
    this.scene.add(floor);
    // 🏬 Its building: a door to the café (west), the shop front on the street
    this.raiseShop(this.storeFence, {
      rect: S, wall: 0xeef3e6, trim: 0x2f9e5b, roof: 0x5a5f66, sign: '🛒 CORNER STORE', awning: 0x2f9e5b,
      doors: [{ side: 'west', from: HOME.gate.z0, to: HOME.gate.z1 }, { side: 'south', from: 52.5, to: 55.5 }],
    }, animate);
    // 🥬 The groceries: delivery crates -> the packing table (north side of the plot)...
    this.groceries = new ResourcePile(this.scene, 39.6, -7.6, this.flyers, 'grocery', 'pantry');
    this.piles.push(this.groceries);
    this.packing = new PackingTable(this.scene, 48.5, -8, this.flyers);
    this.processors.push(this.packing);
    this.blockers.push(this.packing.blocker);
    // ...and the checkout: a counter that sells the bags, with its own cash pad
    const pad = new CashPad(this.scene, 39.6, -2.6);
    this.storePad = pad;
    this.cashPads.push(pad);
    const store = new Desk(this.scene, 44, 1.5, this.flyers, pad, null, {
      mode: 'cafe', sells: 'shopbag', machine: false, awning: 0x2f9e5b, label: '🛒 CORNER STORE', color: 0xbfd8a8, kinds: STORE_KINDS,
      interval: HOME.store.interval, queueMax: HOME.store.queueMax, serve: HOME.store.serve,
      entry: () => this.wayIn(54, [new THREE.Vector3(54, 0, 5)]),
      exit: (from) => this.wayOut(54, [new THREE.Vector3(from.x, 0, 5), new THREE.Vector3(54, 0, 8)]),
      staff2: () => person('h-exec'),
    });
    store.onServe = (byPlayer) => {
      this.progress.addXp(byPlayer ? CONFIG.xp.sale : CONFIG.xp.autoSale);
      this.home.storeSales = (this.home.storeSales ?? 0) + 1;
    };
    store.valueMult = () => this.progress.cashMult;
    this.store = store;
    this.desks.push(store);
    this.blockers.push(store.blocker);
    // Crates of fruit by the fence, and a row of shopping carts
    const extras: THREE.Object3D[] = [];
    for (const [fx, fz, color] of [[54, -8.6, 0xe63946], [55.2, -6.8, 0xf4a261], [38.6, 9.2, 0x4caf50]] as [number, number, number][]) {
      const stall = new THREE.Group();
      stall.position.set(fx, 0, fz);
      stall.add(box(1.3, 0.7, 1.0, mat(0xb5803f, 0.85), 0, 0.35, 0));
      for (let i = 0; i < 6; i++) {
        const fruit = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 8), mat(color, 0.7));
        fruit.position.set(-0.38 + (i % 3) * 0.38, 0.82, -0.18 + Math.floor(i / 3) * 0.36);
        stall.add(fruit);
      }
      this.scene.add(stall);
      extras.push(stall);
      this.blockers.push({ minX: fx - 0.75, maxX: fx + 0.75, minZ: fz - 0.6, maxZ: fz + 0.6 });
    }
    // 🎁 The store plot's own chest
    if (!this.home.storeChest) this.storeChest = new Chest(this.scene, 49, 8.5);
    if (animate) {
      for (const o of [floor, store.group, pad.group, this.groceries.group, this.packing.group, ...extras]) this.flyers.grow(o);
      if (this.storeChest) this.flyers.grow(this.storeChest.group);
      this.hud.banner('🛒 The Corner Store is yours!', '🥬 Grocery crates → 🛍️ the packing table → the checkout. And another chest is hidden here…', 4500);
    }
  }

  /** 🚗 A street business opens: the fence along the sidewalk comes down; the forecourt, its kiosk, its supply pile and its bays go up. */
  private openLot(lot: StreetLot, animate: boolean) {
    if (lot.open) return;
    lot.open = true;
    lot.lot.visible = false;
    for (const t of lot.signs) t.sprite.visible = false;
    this.dropFence(lot.fence);
    const d = lot.def;
    const G = lot.rect;
    const x = (o: number) => d.minX + o;
    // The forecourt: from the back fence out to the sidewalk
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(G.maxX - G.minX, G.maxZ - G.minZ + 1.4), mat(new THREE.Color(d.fill).getHex(), 0.95));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set((G.minX + G.maxX) / 2, 0.007, (G.minZ + G.maxZ + 1.4) / 2);
    floor.receiveShadow = true;
    this.scene.add(floor);
    // 🏬 Its kiosk at the back (you look in from the forecourt: it is not a room you work in)
    const K = { minX: x(LOT_AT.kiosk.minX), maxX: x(LOT_AT.kiosk.maxX), minZ: LOT_AT.kiosk.minZ, maxZ: LOT_AT.kiosk.maxZ };
    const shop = buildShop({ rect: K, wall: d.wall, trim: d.trim, roof: 0x5a5f66, sign: `${d.icon} ${d.name.toUpperCase()}`, awning: d.trim, doors: [{ side: 'south', from: K.minX + 2.9, to: K.maxX - 2.8 }] });
    shop.setCutaway(this.cutaway);
    this.scene.add(shop.group);
    this.shops.push(shop);
    this.fenceSegs.push(...shop.outline);
    this.blockers.push(K);
    const inside = new THREE.Group();
    inside.add(box(5.5, 1.0, 0.8, mat(0x8d99ae, 0.8), x(17), 0.5, -8.6), box(1.0, 1.5, 3.0, mat(0xe9c46a, 0.8), x(13.6), 0.75, -6.4), box(1.0, 1.5, 3.0, mat(0x2a9d8f, 0.8), x(20.3), 0.75, -6.4));
    this.scene.add(inside);
    const grown: THREE.Object3D[] = [floor, shop.group, inside];
    // Its supply pile (where its cars use something up), its cash pad, and the bays at the curb
    if (d.item) {
      lot.pile = new ResourcePile(this.scene, x(LOT_AT.pile[0]), LOT_AT.pile[1], this.flyers, d.item, 'pantry');
      this.piles.push(lot.pile);
      grown.push(lot.pile.group);
    }
    const pad = new CashPad(this.scene, x(LOT_AT.pad[0]), LOT_AT.pad[1]);
    lot.pad = pad;
    this.cashPads.push(pad);
    const service = new CarService(this.scene, this.traffic, this.flyers, pad, {
      kind: d.kind, bays: [x(LOT_AT.bays[0]), x(LOT_AT.bays[1])], curbZ: HOME.curbZ, rack: { x: x(LOT_AT.rack[0]), z: LOT_AT.rack[1] },
      item: d.item, unitValue: d.unitValue, interval: d.interval, wants: d.wants, serve: d.serve,
      truck: d.truck && lot.pile ? { every: d.truck.every, load: d.truck.load, pile: lot.pile } : undefined,
      icon: d.icon, sign: d.sign ?? `${d.icon} ${d.key.toUpperCase()}`, staff2: { title: d.staff.title2, kind: d.staff.kind2 },
      label: `${d.icon} ${d.name.toUpperCase()}`, itemType: d.item ?? d.key,
    });
    service.onServe = (byPlayer) => this.progress.addXp(byPlayer ? CONFIG.xp.sale : CONFIG.xp.autoSale);
    service.onCar = () => { const cars = (this.home.cars ??= {}); cars[d.key] = (cars[d.key] ?? 0) + 1; };
    service.valueMult = () => this.progress.cashMult;
    service.setCutaway(this.cutaway);
    lot.service = service;
    this.blockers.push(...service.blockers);
    grown.push(pad.group, service.group);
    if (animate) {
      for (const o of grown) this.flyers.grow(o);
      this.hud.banner(`${d.icon} The ${d.name} is yours!`, d.how, 5000);
    }
  }

  private unlock(tile: UnlockTile) {
    const id = tile.def.id;
    this.save.unlocked.push(id);
    delete this.save.paid[id];
    tile.mesh.visible = false;
    if (id === 'ai-cafe') this.home.planks -= HOME.plot.planks; // (the planks get used)
    if (id === 'ai-store') this.home.planks -= HOME.storeGate.planks;
    const bought = this.lots.find((l) => id === `ai-${l.def.key}`);
    if (bought) this.home.planks -= bought.def.gate.planks;
    this.applyUnlock(id, true);
    this.progress.addXp(CONFIG.xp.tile.home);
    this.sfx.unlocked();
    this.hud.floatAt(tile.mesh.position.clone().setY(2), this.camera, 'UNLOCKED!', 'big gold');
    this.refreshTiles(true);
  }

  /** Show tiles whose requirements are met and that aren't bought yet. */
  private refreshTiles(animate: boolean) {
    for (const t of this.tiles) {
      const show = !this.owns(t.def.id) && t.def.requires.every((r) => this.owns(r));
      if (show && !t.mesh.visible && animate) this.flyers.grow(t.mesh);
      t.mesh.visible = show;
    }
  }

  // --------------------------------------------------------------------------
  // 🙋 Orders from the neighbors
  // --------------------------------------------------------------------------
  /** 🙋 Who comes by next, and how many snack packs they want (the first two: 5, then 10). */
  private nextNeighbor() {
    const n = this.neighborsSeen++;
    const o = HOME.order;
    const later = o.min + Math.floor(Math.random() * (o.max - o.min + 1)) + Math.floor((this.save.level - 1) / 3);
    const wants = n === 0 ? o.first : n === 1 ? o.second : Math.min(30, Math.round(later * this.stand.bulk)); // (x ⬆️ Bigger orders)
    return { ...NEIGHBORS[n % NEIGHBORS.length], wants };
  }

  /** 🙋 An order's last pack is in their arms: XP (all of it when you served it), a thank-you, off they go. */
  private orderFilled(o: { name: string; wants: number; paid: number; at: THREE.Vector3 }, byPlayer: boolean) {
    const full = HOME.order.xpBase + HOME.order.xpPer * o.wants;
    const xp = Math.round(full * (byPlayer ? 1 : HOME.order.autoXp));
    this.progress.addXp(xp);
    this.sfx.contract();
    this.hud.floatAt(o.at.setY(3.4), this.camera, `Thank you! 😊 +$${o.paid} · +${xp} XP`, byPlayer ? 'big gold' : 'gold');
    this.home.orders++;
    if (this.home.orders === 1) {
      this.save.unlocked.push('ai-order1'); // (brings out the first farm upgrade)
      this.refreshTiles(true);
    }
  }

  // --------------------------------------------------------------------------
  // 📦 The delivery crate
  // --------------------------------------------------------------------------
  private crateAsk() {
    const asks = HOME.crate.asks;
    return asks[Math.min(this.home.crate.trips, asks.length - 1)];
  }

  private updateCrate(dt: number) {
    const crate = this.crate;
    if (!crate) return;
    const st = this.home.crate;
    if (st.away > 0) {
      st.away = Math.max(0, st.away - dt);
      crate.body.visible = false;
      crate.sign.setText(`🚚 Planks on the way · ${Math.ceil(st.away)}s`);
      if (st.away === 0) {
        // Back, with planks!
        this.home.planks += HOME.crate.planks;
        this.sfx.unlocked();
        this.hud.floatAt(crate.group.position.clone().setY(3), this.camera, `+${HOME.crate.planks} 🪵 planks!`, 'big gold');
      }
      return;
    }
    // The crate itself shows up again once you're not standing in its spot (it doesn't shove you)
    if (!crate.body.visible) {
      const b = crate.blocker;
      const p = this.player.pos;
      if (!(p.x > b.minX && p.x < b.maxX && p.z > b.minZ && p.z < b.maxZ)) {
        crate.body.visible = true;
        this.flyers.grow(crate.body);
      }
    }
    const ask = this.crateAsk();
    crate.sign.setText(`📦 CRATE · 🍪 ${st.got.snack ?? 0}/${ask.snack} · 🍞 ${st.got.crumb ?? 0}/${ask.crumb}`);
    this.crateFilled();
  }

  /** Is the crate full (and has the last item landed)? Then it's off on the truck. */
  private crateFilled() {
    const crate = this.crate!;
    const st = this.home.crate;
    const ask = this.crateAsk();
    if (Object.keys(ask).some((t) => (st.got[t] ?? 0) < ask[t])) return;
    if (crate.stack.items.some((it) => it.flying)) return;
    st.trips++;
    st.got = {};
    st.away = HOME.crate.away;
    this.traffic.arrive(9, 'north', { kind: 'truck', onParked: (ride) => ride.leaveIn(3) }); // 🚚 (the delivery truck comes for it)
    crate.stack.clear();
    this.progress.addXp(HOME.crate.xp);
    this.sfx.contract();
    this.hud.banner('📦 The crate is on its way!', `It comes back with ${HOME.crate.planks} 🪵 planks for building`, 3200);
  }

  // --------------------------------------------------------------------------
  // Money
  // --------------------------------------------------------------------------
  addCash(amount: number) {
    this.save.cash += amount;
    this.hud.setCash(this.save.cash);
  }

  // --------------------------------------------------------------------------
  // Per-frame update
  // --------------------------------------------------------------------------
  /** Runs `fn` every `interval` seconds while `on` is true (one timer per `key`). */
  private every(key: object, dt: number, on: boolean, interval: number, fn: () => void) {
    if (!on) {
      this.timers.set(key, interval); // first item hops right away next time
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
    // ⬆️ Building panels (made on the first frame, once the world is built)
    this.ups ??= new Upgrades(
      { scene: this.scene, camera: this.camera, workers: this.workers, collectors: () => this.bankers, ready: () => this.owns('ai-order1') },
      'home', this.save, this.hud, this.sfx, this.flyers, this.progress,
    );
    this.ups.update(dt, this, this.player.pos, true);
    const me = this.player;
    const p = me.pos;
    const prog = this.progress;
    const xp = CONFIG.xp;
    me.carryMax = CONFIG.player.baseCarry + prog.carryBonus;
    me.speedMult = prog.speedMult * HOME.speedMult;
    me.update(dt, move, this.blockers, this.canWalk);

    this.bread.update(dt);
    this.farm.update(dt);
    this.beans?.update(dt);
    this.machine?.update(dt);
    this.groceries?.update(dt);
    this.hood.update(dt);
    // 🚗 The cars: they brake for whoever is on the street; a parked car nobody else gets out of stops waiting
    this.walkerList.length = 0;
    for (const d of this.desks) d.walkers(this.walkerList);
    this.hood.walkers(this.walkerList);
    this.walkerList.push(this.player.pos); // (you too)
    this.traffic.update(dt);
    for (const [cx, r] of this.rides) {
      r.age += dt;
      if (r.age > 30 && r.seats > 0) r.seats = 0;
      if (r.seats === 0 && r.owed === 0) {
        r.ride.leaveIn(0.5);
        this.rides.delete(cx);
      }
    }
    // 🏬 Roofs: on when you look through your own eyes, off (walls cut low) in the top-down view
    const cut = !this.player.firstPerson;
    if (cut !== this.cutaway) {
      this.cutaway = cut;
      for (const shop of this.shops) shop.setCutaway(cut);
      for (const lot of this.lots) lot.service?.setCutaway(cut);
    }
    this.packing?.update(dt);
    for (const w of this.workers) w.update(dt, this.flyers);
    for (const b of this.bankers) b.update(dt, this.flyers);
    // (the stand opens once the farm has made its first snack pack: then people start coming by)
    if (this.home.made > 0 || this.stand.waiting > 0) this.stand.update(dt, this.stand.staffZone.contains(p), this.sfx);
    this.cafe?.update(dt, !!this.cafe && this.cafe.staffZone.contains(p), this.sfx);
    this.chest?.update(dt);
    if (this.chest?.gone) this.chest = null;
    this.storeChest?.update(dt);
    if (this.storeChest?.gone) this.storeChest = null;
    this.store?.update(dt, !!this.store && this.store.staffZone.contains(p), this.sfx);
    for (const lot of this.lots) {
      lot.pile?.update(dt);
      lot.service?.update(dt, lot.service.staffZone.contains(p), this.sfx);
    }
    this.updateCrate(dt);

    const iv = CONFIG.player.pickupInterval / prog.workMult;
    const has = (t: ItemType) => me.stack.has(t);
    const take = (key: object, zone: Zone, from: Stack, type: ItemType, step: number) =>
      this.every(key, dt, zone.contains(p) && me.canTake(type), iv, () => {
        if (me.canTake(type) && this.flyers.transfer(from, me.stack)) {
          this.sfx.pickup();
          prog.addXp(xp.pickup);
          this.tutorial.did(step);
        }
      });
    const drop = (key: object, zone: Zone, to: Stack, type: ItemType, step: number, onDrop?: () => void) =>
      this.every(key, dt, zone.contains(p) && has(type) && !to.full, iv, () => {
        if (!to.full && this.flyers.transferType(me.stack, to, type)) {
          this.sfx.drop();
          prog.addXp(xp.drop);
          this.tutorial.did(step);
          onDrop?.();
        }
      });

    // 1) Crumbs: from the bread box into the farm
    take(this.bread.zone, this.bread.zone, this.bread.stack, 'crumb', STEP.crumbs);
    drop(this.farm.inZone, this.farm.inZone, this.farm.input, 'crumb', STEP.feed);
    // 2) Snack packs off the farm's OUT tray...
    take(this.farm.outZone, this.farm.outZone, this.farm.output, 'snack', STEP.packs);
    // ...onto the snack stand's shelf (and while you stand there, you serve the neighbors' orders)
    drop(this.stand.staffZone, this.stand.staffZone, this.stand.shelf!, 'snack', -1);
    // 4) The crate takes what it still needs
    const crate = this.crate;
    if (crate && this.home.crate.away === 0) {
      const ask = this.crateAsk();
      const got = this.home.crate.got;
      const wanted = (Object.keys(ask) as ItemType[]).find((t) => (got[t] ?? 0) < ask[t] && has(t));
      this.every(crate.zone, dt, crate.zone.contains(p) && !!wanted, iv, () => {
        const t = (Object.keys(ask) as ItemType[]).find((k) => (got[k] ?? 0) < ask[k] && has(k));
        if (!t || !this.flyers.transferType(me.stack, crate.stack, t)) return;
        got[t] = (got[t] ?? 0) + 1; // (it leaves once the last one lands: updateCrate)
        this.sfx.drop();
        prog.addXp(xp.drop);
      });
    }
    // 5) ☕ The café: beans into the coffee machine, the coffee onto the counter's shelf
    // (and you sell while you stand there)
    const beans = this.beans;
    const machine = this.machine;
    if (beans && machine) {
      take(beans.zone, beans.zone, beans.stack, 'beans', -1);
      drop(machine.inZone, machine.inZone, machine.input, 'beans', STEP.beans);
      take(machine.outZone, machine.outZone, machine.output, 'coffee', -1);
    }
    const cafe = this.cafe;
    if (cafe?.shelf) drop(cafe.staffZone, cafe.staffZone, cafe.shelf, 'coffee', -1);
    // 5b) 🛒 The store: grocery crates onto the packing table, the bags onto the checkout's shelf
    const crates = this.groceries;
    const table = this.packing;
    if (crates && table) {
      take(crates.zone, crates.zone, crates.stack, 'grocery', -1);
      drop(table.inZone, table.inZone, table.input, 'grocery', -1);
      take(table.outZone, table.outZone, table.output, 'shopbag', -1);
    }
    const store = this.store;
    if (store?.shelf) drop(store.staffZone, store.staffZone, store.shelf, 'shopbag', -1);
    // 5c) 🚗 The street businesses: their goods from the supply pile onto the rack by the bays (and you serve while you stand there)
    for (const lot of this.lots) {
      const pile = lot.pile;
      const service = lot.service;
      if (!pile || !service) continue;
      take(pile.zone, pile.zone, pile.stack, pile.type, -1);
      drop(service.staffZone, service.staffZone, service.shelf, pile.type, -1);
    }
    // 6) Cash pads -> wallet
    for (const pad of this.cashPads) {
      this.every(pad.zone, dt, pad.zone.contains(p), 0.035, () => {
        const bill = pad.stack.pop();
        if (!bill) return;
        this.tutorial.did(STEP.cash);
        const target = new THREE.Vector3();
        this.flyers.fly(bill.mesh, () => target.copy(p).setY(1.7), () => {
          bill.mesh.removeFromParent();
          this.addCash(bill.value);
          this.sfx.cash();
        }, 0.22, 0.8);
      });
    }
    // 7) 🎁 The chest
    const chest = this.chest;
    if (chest && !this.home.chest && chest.zone.contains(p)) {
      this.home.chest = true;
      chest.open();
      const c = HOME.chest;
      const cash = Math.round(c.cash * prog.cashMult);
      this.addCash(cash);
      prog.addXp(c.xp);
      this.sfx.contract();
      this.hud.floatAt(chest.group.position.clone().setY(2.4), this.camera, `🎁 A chest! +$${cash} · +${c.xp} XP`, 'big gold');
    }
    const chest2 = this.storeChest;
    if (chest2 && !this.home.storeChest && chest2.zone.contains(p)) {
      this.home.storeChest = true;
      chest2.open();
      const c = HOME.storeChest;
      const cash = Math.round(c.cash * prog.cashMult);
      this.addCash(cash);
      prog.addXp(c.xp);
      this.sfx.contract();
      this.hud.floatAt(chest2.group.position.clone().setY(2.4), this.camera, `🎁 A chest! +$${cash} · +${c.xp} XP`, 'big gold');
    }
    // 8) Trash bin (each piece pays a little: world/trash.ts)
    const onBin = this.bin.zone.contains(p) && me.stack.count > 0;
    this.every(this.bin.zone, dt, onBin && trash.open(), 0.04, () => {
      const it = me.stack.pop();
      if (!it) return;
      this.flyers.fly(it.mesh, () => this.bin.mouth, () => it.mesh.removeFromParent(), 0.25, 1.0);
      this.sfx.trash();
      this.addCash(trash.pay(this.bin.mouth, this.camera));
    });
    trash.wait(dt, onBin, this.bin.mouth, this.camera);
    // 9) Unlock tiles: stand on one to pour cash in
    if (this.stepOff && !this.stepOff.contains(p)) this.stepOff = null;
    for (const t of this.tiles) {
      if (!t.mesh.visible) continue;
      const affordable = this.save.cash >= 1 && !t.locked;
      t.update(dt, affordable && this.save.cash >= t.remaining);
      if (affordable && t.zone.contains(p) && !this.stepOff) {
        const rate = Math.max(t.def.cost / CONFIG.unlockDrainTime, CONFIG.unlockMinRate);
        const pay = Math.min(this.save.cash, rate * dt * clock.scale, t.def.cost - t.paid);
        t.paid += pay;
        this.save.cash -= pay;
        this.save.paid[t.def.id] = t.paid;
        this.hud.setCash(this.save.cash);
        this.sfx.unlockTick();
        if (t.paid >= t.def.cost - 1e-6) {
          this.unlock(t);
          this.stepOff = t.zone;
        }
      }
    }
    this.updatePlotSign(dt);

    this.hud.setInventory(me.stack.counts(), me.stack.count, me.carryMax);
    // Where you are (+ your planks, once you have some)
    const onLot = this.lots.find((l) => l.open && p.x > l.rect.minX && p.x < l.rect.maxX && p.z < 15.2);
    const place = onLot ? `${onLot.def.icon} ${onLot.def.name}` : p.z > 12 || p.x < HOME.yard.minX ? '🏘️ Your Street' : p.x > HOME.cafePlot.maxX + 0.5 ? '🛒 Corner Store' : p.x > HOME.yard.maxX ? '☕ Corner Café' : '🏡 Your Backyard';
    const name = this.home.planks > 0 ? `${place} · 🪵 ${this.home.planks}` : place;
    if (name !== this.zoneName) {
      this.zoneName = name;
      this.hud.setZone(name);
    }
    this.flyers.update(dt);
    this.updateCamera(dt);
    this.tutorial.update(dt, true);
  }

  /** Over the gate: what the café plot needs, ticked off as you get there. */
  private updatePlotSign(dt: number) {
    if (this.cafeOpen && this.storeOpen && this.lots.every((l) => l.open)) return;
    this.plotSignT -= dt;
    if (this.plotSignT > 0) return;
    this.plotSignT = 0.5;
    const ok = (b: boolean) => (b ? '✅' : '⬜');
    // 🚗 Each street lot's sign, over its tile on the sidewalk (once the business before it is going)
    for (const lot of this.lots) {
      if (lot.open) continue;
      const d = lot.def;
      const show = this.owns(d.after);
      for (const t of lot.signs) t.sprite.visible = show;
      if (!show) continue;
      const def = HOME_UNLOCKS.find((u) => u.id === `ai-${d.key}`)!;
      const ants = Math.min(this.workers.length, d.gate.ants);
      const planks = Math.min(this.home.planks, d.gate.planks);
      lot.signs[0].setText(`${d.icon} ${d.name.toUpperCase()} PLOT`);
      lot.signs[1].setText(`${ok(this.save.level >= (def.level ?? 0))} Lv ${def.level} · ${ok(ants >= d.gate.ants)} 🐜 ${ants}/${d.gate.ants} ants`);
      lot.signs[2].setText(`${ok(planks >= d.gate.planks)} 🪵 ${planks}/${d.gate.planks} planks · 💵 $${def.cost}`);
    }
    if (this.cafeOpen && this.storeOpen) return;
    if (this.cafeOpen) {
      // 🛒 The store plot's sign, over its tile by the café's east gate
      const show2 = this.owns('ai-cafe-gatherer');
      for (const t of this.plotSign2) t.sprite.visible = show2;
      if (!show2) return;
      const def2 = HOME_UNLOCKS.find((d) => d.id === 'ai-store')!;
      const G = HOME.storeGate;
      const ants2 = Math.min(this.workers.length, G.ants);
      const planks2 = Math.min(this.home.planks, G.planks);
      this.plotSign2[0].setText('🛒 CORNER STORE PLOT');
      this.plotSign2[1].setText(`${ok(this.save.level >= (def2.level ?? 0))} Lv ${def2.level} · ${ok(ants2 >= G.ants)} 🐜 ${ants2}/${G.ants} ants`);
      this.plotSign2[2].setText(`${ok(planks2 >= G.planks)} 🪵 ${planks2}/${G.planks} planks · 💵 $${def2.cost}`);
      return;
    }
    const show = this.owns('ai-farm2');
    for (const t of this.plotSign) t.sprite.visible = show;
    if (!show) return;
    const def = HOME_UNLOCKS.find((d) => d.id === 'ai-cafe')!;
    const ants = Math.min(this.workers.length, HOME.plot.ants);
    const planks = Math.min(this.home.planks, HOME.plot.planks);
    this.plotSign[0].setText('☕ CORNER CAFÉ PLOT');
    this.plotSign[1].setText(`${ok(this.save.level >= (def.level ?? 0))} Lv ${def.level} · ${ok(ants >= HOME.plot.ants)} 🐜 ${ants}/${HOME.plot.ants} ants`);
    this.plotSign[2].setText(`${ok(planks >= HOME.plot.planks)} 🪵 ${planks}/${HOME.plot.planks} planks · 💵 $${def.cost}`);
  }

  // --------------------------------------------------------------------------
  // 🗺️ The minimap
  // --------------------------------------------------------------------------
  /** The whole map (the big view fits it): your house to the street, the yard and the café plot. */
  static readonly MAP_BOUNDS: MapRect = { minX: -34, maxX: STREET_END - 2, minZ: -22, maxZ: 38 };

  /** What the minimap draws right now. */
  mapView(): MapView {
    const Y = HOME.yard;
    const P = HOME.cafePlot;
    const areas: MapArea[] = [
      ...this.hood.mapAreas(), // the streets, the sidewalks and the neighbors' houses
      { rect: Y, fill: '#79c257', label: 'Your backyard' },
      this.cafeOpen
        ? { rect: P, fill: '#d8cbb3', label: 'Corner Café' }
        : { rect: P, fill: '#b39368', edge: 'rgba(255, 220, 140, 0.9)', dashed: true, label: 'Lot for sale' },
      this.storeOpen
        ? { rect: HOME.storePlot, fill: '#dfe9d2', label: 'Corner Store' }
        : { rect: HOME.storePlot, fill: '#b39368', edge: 'rgba(255, 220, 140, 0.9)', dashed: true, label: 'Lot for sale' },
      ...this.lots.map((l): MapArea => (l.open
        ? { rect: l.rect, fill: l.def.fill, label: l.def.name }
        : { rect: l.rect, fill: '#b39368', edge: 'rgba(255, 220, 140, 0.9)', dashed: true, label: 'Lot for sale' })),
      { rect: { minX: -15, maxX: 5, minZ: -21, maxZ: -13 }, fill: '#f1e3c8', edge: '#8d5b4c', label: 'Your house' },
      { rect: { minX: -12, maxX: 2, minZ: -13.1, maxZ: -10.9 }, fill: '#a0703f' }, // deck
    ];
    // (the gate to the café plot is a fence until the plot is yours)
    const fences = [...this.fenceSegs];
    if (!this.cafeOpen) fences.push({ x0: Y.maxX, z0: HOME.gate.z0, x1: Y.maxX, z1: HOME.gate.z1 });
    if (!this.storeOpen) fences.push({ x0: P.maxX, z0: HOME.gate.z0, x1: P.maxX, z1: HOME.gate.z1 });
    // (a red ! on a counter whose buyers are waiting at an empty shelf; at the snack stand,
    // also on a neighbor waiting with no cashier there: someone has to serve them)
    const starved = (d: Desk) => d.waiting >= 2 && (d.shelf?.count ?? 0) === 0;
    const stand = this.stand;
    const waitingOrder = !!stand.frontOrder && (!stand.hasStaff || (stand.shelf?.count ?? 0) === 0);
    const markers: MapMarker[] = [
      { x: -10, z: -2.5, icon: '🍞', label: 'Bread' },
      { x: -1, z: -6, icon: '🐜', label: 'Ant farm' },
      { x: stand.group.position.x, z: stand.group.position.z, icon: '🍪', label: 'Snack stand (orders)', alert: waitingOrder },
      { x: this.standPad.zone.x, z: this.standPad.zone.z, icon: '💵', label: 'Cash' },
      { x: this.bin.zone.x, z: this.bin.zone.z, icon: '🗑️', label: 'Trash' },
    ];
    if (this.crate) markers.push(this.home.crate.away > 0 ? { x: 9, z: 7, icon: '🚚', label: 'Crate (away)' } : { x: 9, z: 7, icon: '📦', label: 'Crate' });
    const cafe = this.cafe;
    if (cafe) {
      markers.push({ x: cafe.group.position.x, z: cafe.group.position.z, icon: '☕', label: 'Café', alert: starved(cafe) });
      if (this.cafePad) markers.push({ x: this.cafePad.zone.x, z: this.cafePad.zone.z, icon: '💵', label: 'Cash' });
      if (this.beans) markers.push({ x: this.beans.zone.x, z: this.beans.zone.z, icon: '🫘', label: 'Beans' });
      if (this.machine) markers.push({ x: this.machine.group.position.x, z: this.machine.group.position.z, icon: '⚙️', label: 'Coffee machine' });
      if (!this.home.chest) markers.push({ x: 28, z: 8.5, icon: '🎁', label: 'Chest' });
    } else {
      markers.push({ x: 26, z: 0, icon: '🏷️', label: 'For sale' });
    }
    const shop = this.store;
    if (shop) {
      markers.push({ x: shop.group.position.x, z: shop.group.position.z, icon: '🛒', label: 'Store', alert: starved(shop) });
      if (this.storePad) markers.push({ x: this.storePad.zone.x, z: this.storePad.zone.z, icon: '💵', label: 'Cash' });
      if (this.groceries) markers.push({ x: this.groceries.zone.x, z: this.groceries.zone.z, icon: '🥬', label: 'Groceries' });
      if (this.packing) markers.push({ x: this.packing.group.position.x, z: this.packing.group.position.z, icon: '🛍️', label: 'Packing table' });
      if (!this.home.storeChest) markers.push({ x: 49, z: 8.5, icon: '🎁', label: 'Chest' });
    } else {
      markers.push({ x: 47, z: 0, icon: '🏷️', label: 'For sale' });
    }
    for (const l of this.lots) {
      const service = l.service;
      if (service) {
        markers.push({ x: service.group.position.x, z: service.group.position.z, icon: l.def.icon, label: l.def.name, alert: service.starved });
        if (l.pad) markers.push({ x: l.pad.zone.x, z: l.pad.zone.z, icon: '💵', label: 'Cash' });
        if (l.pile) markers.push({ x: l.pile.zone.x, z: l.pile.zone.z, icon: '📦', label: 'Supplies' });
      } else {
        markers.push({ x: l.rect.minX + LOT_AT.sale[0], z: LOT_AT.sale[1], icon: '🏷️', label: 'For sale' });
      }
    }
    const p = this.player.pos;
    const target = this.tutorial.target;
    return {
      areas,
      trees: this.treeSpots,
      fences,
      markers,
      tiles: this.tiles.filter((t) => t.mesh.visible).map((t) => ({ x: t.zone.x, z: t.zone.z })),
      player: { x: p.x, z: p.z, yaw: this.player.model.root.rotation.y },
      target: target ? { x: target.x, z: target.z } : null,
    };
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

  private updateCamera(dt: number) {
    const target = this.player.pos;
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

  resize(w: number, h: number) {
    this.camera.aspect = w / h;
    const portrait = w < h;
    this.camOffset.set(0, portrait ? 20 : 16, portrait ? 17.5 : 15.5);
    this.thirdFov = portrait ? 56 : 42;
    this.camera.fov = this.player.firstPerson ? fpFov(this.camera.aspect) : this.thirdFov;
    this.camera.updateProjectionMatrix();
  }
}

// ============================================================================
// 🎓 Anthill Island's tutorial: the arrow + hints through the backyard
// ============================================================================
function homeTutorial(w: HomeWorld): TutorialScript {
  const home = () => w.save.home!;
  // 🎯 The quest card's bar: the packs handed over for the order at the front of the line...
  const orderProgress = () => {
    const o = w.stand.frontOrder;
    return o ? (o.total - o.left) / o.total : null;
  };
  // ...what's in the crate (of what this trip asks for)...
  const crateProgress = () => {
    const st = home().crate;
    if (!w.crate || st.away > 0) return null;
    const ask = HOME.crate.asks[Math.min(st.trips, HOME.crate.asks.length - 1)];
    let got = 0;
    let want = 0;
    for (const [t, n] of Object.entries(ask)) {
      got += Math.min(st.got[t] ?? 0, n);
      want += n;
    }
    return want ? got / want : null;
  };
  const carrying = (t: ItemType) => w.player.stack.has(t);
  return {
    intro: {
      title: '🏝️ Welcome to Anthill Island!',
      html: `<p>You've set up an <b>ant farm</b> in your backyard. Feed your ants, and bring their snack packs to your
        <b>snack stand</b>, where your neighbors line up with their orders. As the farm grows, <b>the ants take over the
        chores</b>: gathering, carrying, selling.</p>
        <p>🧪 This is a <b>test version</b>: just the backyard and the first café plot, so you can see how it feels.</p>
        <p>Want a quick walkthrough? A yellow arrow 🔽 shows you where to go.</p>`,
    },
    finish: {
      title: '🎉 That\'s the first test!',
      html: `<p>Your backyard runs by itself, and the <b>Corner Café</b> sells coffee.</p>
        <ul>
          <li>☕ Hire the café's own helpers: a <b>gatherer</b> (Lv 8) and a <b>carrier</b> ant (Lv 9), a <b>cashier</b> (Lv 10)
            and a <b>banker ant</b> (Lv 11). Then it runs by itself too.</li>
          <li>👥 A 2nd cashier: tap a counter's ⬆️ (the LINE upgrade).</li>
          <li>📦 The crate keeps bringing 🪵 planks: they're for the next plots.</li>
          <li>🛒 Next door: the <b>Corner Store</b> plot (Lv 12, 4 ants working, 6 planks). The sign by the café's east gate
            ticks off what it needs.</li>
          <li>💤 While you're away, your ants keep earning (the +$/min under your cash).</li>
        </ul>
        <p>Thanks for testing! 🐜</p>`,
      button: '👍 Got it',
    },
    defs: HOME_UNLOCKS,
    // (an action finishes the steps listed in STEP: keep the two in the same order)
    steps: (t) => [
      // 0-2: the farm
      { text: () => '👆 Drag anywhere to walk. Grab some crumbs from the bread box 🍞', target: () => t.at(w.bread.zone) },
      { text: () => '🐜 Drop the crumbs on your ANT FARM\'s IN tray: the ants turn them into snack packs', target: () => t.at(w.farm.inZone) },
      { text: () => '📦 Take the snack packs from the OUT tray', target: () => t.at(w.farm.outZone) },
      // 3-5: the neighbors' orders, at the snack stand
      {
        text: () => {
          const o = w.stand.frontOrder;
          return o ? `🙋 ${o.name} wants ${o.total} snack packs! Bring them to your SNACK STAND and stand on SELL` : '🙋 A neighbor is coming to your snack stand… take a few snack packs';
        },
        target: () => (carrying('snack') || w.stand.shelf!.count > 0 ? t.at(w.stand.staffZone) : t.at(w.farm.outZone)),
        done: () => home().orders >= 1,
        progress: orderProgress,
      },
      {
        text: () => '💵 Your neighbor paid on the stand\'s cash pad: pick it up',
        target: () => t.at(w.standPad.zone),
        done: () => t.owns('ai-stand-banker'), // (or picking up a bill: STEP.cash)
      },
      {
        text: () => '📋 More neighbors, more orders: each one pays, plus lots of XP',
        target: () => (!w.stand.frontOrder ? null : carrying('snack') || w.stand.shelf!.count > 0 ? t.at(w.stand.staffZone) : t.at(w.farm.outZone)),
        done: () => home().orders >= 2,
        progress: orderProgress,
      },
      // 6-9: the helpers, until the backyard runs by itself
      t.unlockStep('ai-farm2', '🐜 Grow your ant farm! Lv 2: a Gatherer ant feeds it crumbs'),
      t.unlockStep('ai-farm3', '🐜 Farm Lv 3: a Carrier ant takes the snack packs to your stand'),
      t.unlockStep('ai-stand-cashier', '🍪 Hire a cashier for your snack stand: she serves your neighbors while you\'re busy'),
      t.unlockStep('ai-stand-banker', '🏦 A banker ant collects the stand\'s cash: now your backyard runs by itself!'),
      // 10-11: planks, and the next plot
      {
        text: () => '📦 Fill the delivery crate with snack packs and crumbs: it brings back 🪵 planks',
        target: () => (w.crate ? t.at(w.crate.zone) : null),
        done: () => home().crate.trips > 0,
        progress: crateProgress,
      },
      {
        ...t.unlockStep('ai-cafe', '☕ Open the next plot: the Corner Café! (the sign by the gate shows what it needs)'),
        // (the bar fills as you meet each thing the plot needs: level, ants, planks, then the cash)
        progress: () => {
          const def = HOME_UNLOCKS.find((d) => d.id === 'ai-cafe')!;
          const met = (w.save.level >= (def.level ?? 0) ? 1 : 0) + (w.workers.length >= HOME.plot.ants ? 1 : 0) + (home().planks >= HOME.plot.planks ? 1 : 0);
          return (met + (t.paidOf('ai-cafe') ?? 0)) / 4;
        },
      },
      // 12-14: coffee, and the chest
      {
        text: () => (carrying('beans') ? '☕ Drop the beans on the COFFEE MACHINE\'s IN tray' : '🫘 The café sells coffee! Grab a few sacks of coffee beans'),
        target: () => (!w.machine || !w.beans ? null : carrying('beans') ? t.at(w.machine.inZone) : t.at(w.beans.zone)),
        done: () => t.owns('ai-cafe-gatherer'), // (or dropping beans in: STEP.beans. With a gatherer, its tray is often full)
      },
      {
        text: () => (carrying('coffee') ? '☕ Bring the coffee to the café\'s SELL spot' : '☕ Take the coffee from the machine\'s OUT tray to the café'),
        target: () => (!w.cafe || !w.machine ? null : carrying('coffee') || (w.cafe.shelf?.count ?? 0) > 0 ? t.at(w.cafe.staffZone) : t.at(w.machine.outZone)),
      },
      {
        text: () => '🎁 Every new plot hides a chest. Find it!',
        target: () => (w.chest ? w.chest.group.position.clone().setY(0) : null),
        done: () => home().chest,
      },
    ],
  };
}
