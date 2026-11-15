// ============================================================================
// carService.ts — 🚗 BUSINESSES WHOSE CUSTOMERS ARE CARS (v0.45 the gas station,
// v0.47 made general for the road to the airport: Joshua, 2026-11-14, "start with
// a gas station, then kind of work our way to the airport").
//
// A car comes off the street's own traffic (traffic.ts), pulls up to the curb at
// one of the business's two BAYS, is served, pays onto the cash pad, drives off.
// What "served" means is the business's KIND:
//
//   ⛽ GAS     cans from the RACK by the pumps, one at a time, each paid as it goes in
//             (the depot the cans come from is filled by a TANKER, not by itself)
//   🚿 WASH    nothing to carry: the wash takes its time, and is paid when it is done
//   🔧 GARAGE  a big, slow job: a few PARTS from the rack, each fitted in turn
//
// You serve while you stand at the bays; the business's person does it for you
// once hired. For the ⬆️ panels it is shaped like a counter (priceMult, paceMult,
// bulk, lines, opts.label): PRICES & CUSTOMERS, then the 2ND WORKER (the second
// bay opens) and BIGGER ORDERS.
//
// The bays are at the curb, where the street's cars already park, so nothing new
// was taught to the traffic: a customer is a ride that parks at a bay.
// ============================================================================
import * as THREE from 'three';
import { lod } from '../core/lod';
import { bump } from '../core/totals';
import type { Sfx } from '../core/audio';
import type { CreatureModel } from '../actors/models';
import type { HumanKind } from '../actors/creatures';
import { Flyers, ItemType, Stack, StackItem, makeItem } from './items';
import { TextSprite, TITLE, titleTag } from './labels';
import { Blocker, CashPad, ResourcePile, Zone, gridLayout } from './stations';
import { payBill, person } from './airportWorld';
import type { Ride, Traffic } from './traffic';

const mat = (color: number, roughness = 0.7, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
function box(w: number, h: number, d: number, material: THREE.Material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export type CarServiceKind = 'gas' | 'wash' | 'garage' | 'diner' | 'bakery' | 'post' | 'bank' | 'laundry' | 'fire' | 'police' | 'pharmacy' | 'hospital' | 'taxi' | 'motel' | 'parking' | 'airport';

export interface CarServiceOpts {
  kind: CarServiceKind;
  /** Where along the street each bay is (world x): a car parks at the curb beside it. */
  bays: [number, number];
  /** The sidewalk line the bays' fittings stand on (world z), and the rack's place (businesses that use up goods). */
  curbZ: number;
  rack: { x: number; z: number };
  /** What a car uses up (null: nothing, it is served by time alone) and what each one is worth. */
  item: ItemType | null;
  unitValue: number;
  /** Seconds between cars (before PRICES & CUSTOMERS), units a car takes (lowest, highest), seconds per unit. */
  interval: number;
  wants: [number, number];
  serve: number;
  /** A truck that fills the supply pile (it does not regrow by itself then): seconds between visits, items a visit. */
  truck?: { every: number; load: number; pile: ResourcePile };
  /** The icon over a waiting car, the sign over the bays, the second worker's title and looks. */
  icon: string;
  sign: string;
  staff2: { title: string; kind: HumanKind };
  /** For the ⬆️ panels (the same fields a counter has). */
  label: string;
  itemType: string;
}

interface Bay {
  x: number;
  ride: Ride | null;
  wants: number;      // units still to go
  t: number;          // seconds on the unit in hand
  truck: boolean;     // this ride is the delivery truck, not a customer
  sign: TextSprite;   // over the car while it waits
}

const LOOK: Record<CarServiceKind, { main: number; trim: number }> = {
  gas: { main: 0xd62828, trim: 0xf4f1ea },
  wash: { main: 0x2a7fd6, trim: 0xe8f4ff },
  garage: { main: 0xf4a000, trim: 0x30343b },
  diner: { main: 0xc1121f, trim: 0xfff3e0 },
  bakery: { main: 0xb5651d, trim: 0xfff0d2 },
  post: { main: 0x1d4e9e, trim: 0xeef3fb },
  bank: { main: 0x2e7d32, trim: 0xf2f5ec },
  laundry: { main: 0x00838f, trim: 0xeefafa },
  fire: { main: 0xb71c1c, trim: 0xfbeeea },
  police: { main: 0x1a237e, trim: 0xeceff8 },
  pharmacy: { main: 0x2e9e4f, trim: 0xffffff },
  hospital: { main: 0xd32f2f, trim: 0xffffff },
  taxi: { main: 0xf9a825, trim: 0x2b2f36 },
  motel: { main: 0x6a1b9a, trim: 0xf7eefb },
  parking: { main: 0x1565c0, trim: 0xffd600 },
  airport: { main: 0x0277bd, trim: 0xf3f9ff },
};

export class CarService {
  group = new THREE.Group();
  /** The rack of goods waiting to go into cars (always there; unused where nothing is used up). */
  shelf: Stack;
  /** Stand here to serve (and to put goods on the rack)... */
  staffZone: Zone;
  /** ...and where the carrier ant stocks the rack from. */
  loadZone: Zone;
  blockers: Blocker[] = [];
  hasStaff = false;
  // ⬆️ The same dials a counter has
  priceMult = 1;
  paceMult = 1;
  bulk = 1;
  lines = 1;
  valueMult: () => number = () => 1;
  onServe: (byPlayer: boolean) => void = () => {};
  /** A car is done (for the save). */
  onCar: () => void = () => {};

  private bays: Bay[];
  private nextCar = 3;
  private nextTruck: number;
  private staff2: CreatureModel | null = null;
  private roof = new THREE.Group();      // the canopy's top: off in the top-down view, like the shops' roofs
  private till = new THREE.Object3D();   // where a paid bill pops out
  private tmp = new THREE.Vector3();

  constructor(private scene: THREE.Scene, private traffic: Traffic, private flyers: Flyers, private cashPad: CashPad, public opts: CarServiceOpts) {
    const [x0, x1] = opts.bays;
    const mid = (x0 + x1) / 2;
    // (the group sits at the middle of the two bays: the ⬆️ panel's button shows when you are next to it)
    this.group.position.set(mid, 0, opts.curbZ);
    scene.add(this.group);
    lod.add(this.group, 9);
    const look = LOOK[opts.kind];
    const main = mat(look.main, 0.55), trim = mat(look.trim, 0.6), dark = mat(0x2b2f36, 0.7), steel = mat(0xb9bec6, 0.45, 0.4);
    for (const bx of opts.bays) {
      const lx = bx - mid;
      this.group.add(box(1.5, 0.16, 0.9, mat(0xd9d4c8, 0.9), lx, 0.08, 0)); // a little island of kerb
      if (opts.kind === 'gas') {
        // a pump: its body, its head with a little screen facing the street, its hose
        this.group.add(box(0.7, 1.7, 0.5, main, lx, 1.0, 0), box(0.74, 0.5, 0.54, trim, lx, 1.55, 0), box(0.5, 0.3, 0.05, dark, lx, 1.55, 0.29), box(0.08, 0.7, 0.08, dark, lx + 0.42, 1.0, 0.1));
      } else if (opts.kind === 'wash') {
        // two tall brushes and a bucket
        for (const k of [-0.45, 0.45]) {
          const brush = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 2.2, 12), main);
          brush.position.set(lx + k, 1.25, 0);
          brush.castShadow = true;
          this.group.add(brush);
        }
        this.group.add(box(0.36, 0.36, 0.36, trim, lx, 0.34, 0.2));
      } else if (opts.kind === 'diner') {
        // a drive-thru order post: a menu board on a pole (three rows of dishes), a speaker box, a little striped awning
        this.group.add(box(0.14, 1.5, 0.14, steel, lx, 0.9, 0), box(1.2, 0.9, 0.12, dark, lx, 1.95, 0), box(1.3, 0.14, 0.5, main, lx, 2.5, 0.12), box(0.3, 0.36, 0.2, trim, lx + 0.55, 1.05, 0.1));
        for (const [k, c] of [[0.24, 0xffd166], [0, 0xfff3e0], [-0.24, 0x8ecf6a]] as const) this.group.add(box(0.95, 0.14, 0.03, mat(c, 0.7), lx, 1.95 + k, 0.07));
      } else if (opts.kind !== 'garage') {
        // (v0.56, waves 3 to 5: each business has its own fitting at each bay, a few boxes and cylinders in its colours)
        const add = (...o: THREE.Object3D[]) => this.group.add(...o);
        const cyl = (r: number, h: number, m: THREE.Material, x: number, y: number, z: number, flat = false) => {
          const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 14), m);
          c.position.set(x, y, z);
          if (flat) c.rotation.x = Math.PI / 2;
          c.castShadow = true;
          return c;
        };
        const white = mat(0xffffff, 0.6), glass = mat(0xbfe3f5, 0.25, 0.1);
        switch (opts.kind) {
          case 'bakery': // a glass case of loaves under a striped awning
            add(box(1.2, 0.8, 0.5, trim, lx, 0.56, 0), box(1.2, 0.5, 0.5, glass, lx, 1.2, 0), box(1.4, 0.12, 0.8, main, lx, 1.95, 0.1), box(0.1, 0.5, 0.1, steel, lx - 0.6, 1.7, 0), box(0.1, 0.5, 0.1, steel, lx + 0.6, 1.7, 0));
            for (const k of [-0.3, 0, 0.3]) add(cyl(0.09, 0.3, mat(0xd9a05b, 0.8), lx + k, 1.1, 0.05, true));
            break;
          case 'post': // a mailbox with a rounded top, and a parcel on a stand
            add(box(0.6, 1.0, 0.5, main, lx - 0.3, 0.66, 0), cyl(0.3, 0.5, main, lx - 0.3, 1.16, 0, true), box(0.4, 0.06, 0.04, dark, lx - 0.3, 1.1, 0.27), box(0.5, 0.5, 0.4, steel, lx + 0.5, 0.41, 0), box(0.4, 0.3, 0.34, mat(0xc9a36b, 0.9), lx + 0.5, 0.81, 0));
            break;
          case 'bank': // a teller pillar: a screen, a keypad shelf, a tube going up
            add(box(0.8, 1.7, 0.5, trim, lx, 1.01, 0), box(0.5, 0.36, 0.05, dark, lx, 1.45, 0.27), box(0.6, 0.08, 0.3, main, lx, 1.05, 0.3), cyl(0.09, 1.3, glass, lx + 0.55, 1.6, 0), box(0.84, 0.16, 0.54, main, lx, 1.94, 0));
            break;
          case 'laundry': // a washing machine with its round door, and a basket
            add(box(0.9, 1.0, 0.6, white, lx - 0.15, 0.66, 0), cyl(0.28, 0.06, glass, lx - 0.15, 0.66, 0.31, true), box(0.9, 0.1, 0.6, main, lx - 0.15, 1.21, 0), box(0.44, 0.34, 0.4, mat(0xd9c7a1, 0.9), lx + 0.7, 0.33, 0.1));
            break;
          case 'fire': // a hydrant and a hose reel on a post
            add(cyl(0.2, 0.8, main, lx - 0.35, 0.56, 0), cyl(0.26, 0.12, main, lx - 0.35, 1.0, 0), box(0.5, 0.14, 0.14, main, lx - 0.35, 0.66, 0), box(0.12, 1.4, 0.12, steel, lx + 0.45, 0.86, 0), cyl(0.34, 0.14, mat(0xe0c060, 0.7), lx + 0.45, 1.5, 0.1, true));
            break;
          case 'police': // a booth with a window and a blue lamp on top
            add(box(0.9, 1.9, 0.6, trim, lx, 1.11, 0), box(0.6, 0.5, 0.05, glass, lx, 1.5, 0.31), box(0.94, 0.14, 0.64, main, lx, 2.1, 0), cyl(0.12, 0.2, mat(0x3d7bff, 0.3), lx, 2.27, 0), box(0.94, 0.3, 0.64, main, lx, 0.31, 0));
            break;
          case 'pharmacy':
          case 'hospital': { // a white post with a cross on it (green: the pharmacy; red: the hospital), and a hatch
            add(box(0.9, 1.2, 0.5, white, lx, 0.76, 0), box(0.6, 0.3, 0.05, glass, lx, 1.0, 0.27), box(0.16, 1.0, 0.16, steel, lx, 1.86, 0));
            add(box(0.6, 0.18, 0.1, main, lx, 2.3, 0.05), box(0.18, 0.6, 0.1, main, lx, 2.3, 0.05));
            if (opts.kind === 'hospital') add(box(0.5, 0.4, 0.4, main, lx + 0.8, 0.36, 0.1)); // (a red kit bag beside it)
            break;
          }
          case 'taxi': // a stand sign on a pole, and a bench
            add(box(0.12, 2.2, 0.12, dark, lx - 0.5, 1.26, 0), box(0.7, 0.4, 0.08, main, lx - 0.5, 2.2, 0), box(1.1, 0.1, 0.4, mat(0x8a5a2b, 0.9), lx + 0.4, 0.6, 0), box(0.1, 0.44, 0.36, steel, lx - 0.05, 0.38, 0), box(0.1, 0.44, 0.36, steel, lx + 0.85, 0.38, 0));
            break;
          case 'motel': // a little desk with a bell, and a board of keys
            add(box(1.2, 1.0, 0.5, main, lx, 0.66, 0), box(1.3, 0.08, 0.6, trim, lx, 1.2, 0), cyl(0.1, 0.1, mat(0xffd166, 0.3, 0.6), lx + 0.35, 1.29, 0.1), box(0.8, 0.6, 0.06, mat(0x8a5a2b, 0.9), lx, 1.95, -0.1), box(0.1, 0.8, 0.1, steel, lx, 1.5, -0.1));
            for (const k of [-0.24, 0, 0.24]) add(box(0.06, 0.2, 0.03, mat(0xffd166, 0.3, 0.6), lx + k, 1.95, -0.06));
            break;
          case 'parking': // a ticket machine and a striped barrier arm
            add(box(0.5, 1.3, 0.4, main, lx - 0.4, 0.81, 0), box(0.3, 0.2, 0.05, dark, lx - 0.4, 1.2, 0.22), box(0.2, 1.0, 0.2, steel, lx + 0.5, 0.66, 0));
            for (let k = 0; k < 4; k++) add(box(0.36, 0.1, 0.1, k % 2 ? white : trim, lx + 0.5, 1.2, 0.3 + k * 0.36));
            break;
          default: // ✈️ the airport: a check-in desk with a screen, and a luggage cart
            add(box(1.1, 1.0, 0.5, trim, lx - 0.2, 0.66, 0), box(1.1, 0.14, 0.54, main, lx - 0.2, 1.23, 0), box(0.5, 0.36, 0.05, dark, lx - 0.2, 1.55, 0), box(0.06, 0.2, 0.06, dark, lx - 0.2, 1.36, 0));
            add(box(0.7, 0.08, 0.5, steel, lx + 0.85, 0.3, 0.1), box(0.06, 0.8, 0.06, steel, lx + 1.18, 0.66, 0.1), box(0.4, 0.34, 0.3, mat(0x8e5a3c, 0.8), lx + 0.8, 0.52, 0.1));
        }
      } else {
        // a tool cabinet with a red toolbox on top, and a jack beside it
        this.group.add(box(1.1, 1.1, 0.5, main, lx, 0.71, 0), box(0.7, 0.3, 0.4, mat(0xc1121f, 0.6), lx, 1.41, 0), box(0.5, 0.22, 0.3, trim, lx + 0.9, 0.27, 0.15));
      }
      this.blockers.push({ minX: bx - 0.6, maxX: bx + 0.6, minZ: opts.curbZ - 0.4, maxZ: opts.curbZ + 0.4 });
    }
    // The canopy over the bays and the curb lane, on four posts
    const span = x1 - x0 + 5;
    for (const lx of [-span / 2 + 0.4, span / 2 - 0.4]) for (const lz of [-1.3, 3.6]) this.group.add(box(0.22, 4.4, 0.22, steel, lx, 2.2, lz));
    this.roof.add(box(span, 0.35, 6.0, trim, 0, 4.55, 1.15), box(span + 0.06, 0.2, 6.06, main, 0, 4.3, 1.15));
    this.group.add(this.roof);
    const sign = new TextSprite(0.7, '#ffffff');
    sign.setText(opts.sign);
    sign.sprite.position.set(0, 5.5, 1.15);
    this.group.add(sign.sprite);
    // The rack (a low shelf) between the bays, back from the curb: only where goods are used up
    const rack = new THREE.Group();
    rack.position.set(opts.rack.x - mid, 0, opts.rack.z - opts.curbZ);
    this.group.add(rack);
    this.shelf = new Stack(rack, gridLayout(3, 3, 0.52, 0.52, 0.16), 27);
    if (opts.item) {
      rack.add(box(1.9, 0.14, 1.9, mat(0x6b7280, 0.8), 0, 0.07, 0));
      this.blockers.push({ minX: opts.rack.x - 1.0, maxX: opts.rack.x + 1.0, minZ: opts.rack.z - 1.0, maxZ: opts.rack.z + 1.0 });
    }
    // (you stand between the rack and the curb, in reach of both bays)
    this.staffZone = new Zone(opts.rack.x, opts.curbZ + 0.05, 2.2, 0.75);
    this.loadZone = new Zone(opts.rack.x, opts.rack.z - 1.7, 0.7, 0.7);
    this.till.position.set(0, 1.5, 0.4);
    this.group.add(this.till);

    this.bays = opts.bays.map((x) => {
      const t = new TextSprite(0.55, '#ffffff');
      t.sprite.visible = false;
      scene.add(t.sprite);
      return { x, ride: null, wants: 0, t: 0, truck: false, sign: t };
    });
    this.nextTruck = opts.truck?.every ?? Infinity;
    // (a pile a truck fills does not regrow by itself, and has no ⬆️ REGROW)
    if (opts.truck) opts.truck.pile.spawnEvery = () => Infinity;
  }

  /** Cars at the bays right now, waiting or being served (for the map's ❗ and the ⬆️ panel's status). */
  /** The delivery truck, while it is on its way, unloading or pulling out. */
  private truckRide: Ride | null = null;

  get waiting() {
    return this.bays.filter((b) => b.ride && !b.truck && b.ride.state === 'parked').length;
  }

  /** Cars are waiting and there is nothing on the rack for them (the map's ❗). */
  get starved() {
    return !!this.opts.item && this.waiting >= 1 && this.shelf.count === 0;
  }

  /** The business's person: serves the cars for you. */
  hireStaff(model: CreatureModel, animate: boolean, title: string) {
    this.hasStaff = true;
    this.place(model, this.opts.bays[0] + 1.3, title, animate);
  }

  /** The ⬆️ panel's 2ND WORKER: the second bay opens. */
  hireStaff2(animate: boolean) {
    if (this.staff2) return;
    this.lines = 2;
    this.staff2 = person(this.opts.staff2.kind);
    this.place(this.staff2, this.opts.bays[1] - 1.3, this.opts.staff2.title, animate);
  }

  private place(model: CreatureModel, x: number, title: string, animate: boolean) {
    model.root.position.set(x, 0, this.opts.curbZ + 0.2);
    model.root.rotation.y = 0; // facing the street
    titleTag(model, title, TITLE.human);
    this.scene.add(model.root);
    if (animate) this.flyers.grow(model.root);
  }

  /** Top-down view: the canopy's top is taken off so you can see the bays (its posts stay). */
  setCutaway(on: boolean) {
    this.roof.visible = !on;
  }

  update(dt: number, playerServing: boolean, sfx: Sfx) {
    const o = this.opts;
    // 🚚 The delivery truck: on its round, or sooner if the pile is nearly empty. It has its OWN place at the curb,
    // past the second bay. (v0.58: until now it took the second bay's place, and so could not come while a car stood
    // there. With both bays full of cars waiting for goods that only the truck brings, nothing ever moved again:
    // Joshua's gas station, 2026-11-15, "the ant isn't grabbing fuel and it's just sitting there".)
    const truck = o.truck;
    if (truck) {
      this.nextTruck -= dt;
      if (this.truckRide && (this.truckRide.state === 'gone' || this.truckRide.away)) this.truckRide = null;
      const dry = truck.pile.stack.count <= 3;
      if ((this.nextTruck <= 0 || (dry && this.nextTruck < truck.every - 12)) && !this.truckRide && !truck.pile.stack.full) {
        this.nextTruck = truck.every;
        this.truckRide = this.traffic.arrive(this.bays[1].x + 6, 'north', {
          kind: 'truck',
          onParked: (ride) => {
            // (its load hops from the curb onto the pile's pallet, as much as fits)
            const room = truck.pile.stack.max - truck.pile.stack.count;
            for (let i = 0; i < Math.min(room, truck.load); i++) {
              const it: StackItem = { mesh: makeItem(truck.pile.type), type: truck.pile.type, value: 0, flying: false };
              it.mesh.position.copy(ride.curb).setY(1.2);
              this.scene.add(it.mesh);
              this.flyers.pushInto(it, truck.pile.stack, 0.5 + i * 0.03);
            }
            ride.leaveIn(3.5);
          },
        });
      }
    }
    // 🚗 The next customer, to a bay that is free (the second one only once its worker is there)
    this.nextCar -= dt * this.paceMult;
    if (this.nextCar <= 0) {
      const free = this.bays.find((b, i) => !b.ride && i < this.lines);
      if (free) {
        this.nextCar = o.interval * (0.75 + Math.random() * 0.5);
        free.truck = false;
        const units = o.wants[0] + Math.floor(Math.random() * (o.wants[1] - o.wants[0] + 1));
        // (⬆️ BIGGER ORDERS: more units where goods are used up; a dearer job where they are not)
        free.wants = o.item ? Math.min(20, Math.round(units * this.bulk)) : units;
        free.t = 0;
        free.ride = this.traffic.arrive(free.x, 'north', { kind: Math.random() < 0.8 ? 'car' : 'van' });
      } else this.nextCar = 0.5;
    }
    const serving = this.hasStaff || playerServing;
    for (const b of this.bays) {
      const ride = b.ride;
      if (!ride) continue;
      if (ride.state === 'gone' || ride.away) {
        b.ride = null;
        b.sign.sprite.visible = false;
        continue;
      }
      if (b.truck || ride.state !== 'parked') {
        b.sign.sprite.visible = false;
        continue;
      }
      // (what it still wants, over the car)
      b.sign.sprite.visible = b.wants > 0;
      b.sign.sprite.position.set(ride.curb.x, 3.1, ride.curb.z + 1.6);
      b.sign.setText(o.item ? `${o.icon} ${b.wants}` : `${o.icon} ${Math.min(99, Math.round((b.t / o.serve) * 100))}%`);
      if (b.wants <= 0) continue;
      if (!serving || (o.item && !this.shelf.canPop())) continue;
      b.t += dt * this.paceMult;
      if (b.t < o.serve) continue;
      b.t = 0;
      if (o.item) {
        const it = this.shelf.pop();
        if (!it) continue;
        // (it flies to the car, and its price is paid as it goes)
        const target = this.tmp.copy(ride.curb).setY(1.0).clone();
        target.z += 1.4;
        this.flyers.fly(it.mesh, () => target, () => it.mesh.removeFromParent(), 0.3, 0.9);
      }
      b.wants--;
      const value = Math.round(o.unitValue * (o.item ? 1 : this.bulk) * this.valueMult() * this.priceMult);
      bump('sold');
      payBill(this.scene, this.flyers, this.cashPad, this.till, value);
      sfx.sale();
      this.onServe(!this.hasStaff && playerServing);
      if (b.wants <= 0) {
        b.sign.sprite.visible = false;
        ride.leaveIn(0.9);
        this.onCar();
      }
    }
  }

  /** People at the bays (for the cars' brakes): the workers stand on the sidewalk, not the road, so nobody. */
  walkers(_out: THREE.Vector3[]) {}
}
