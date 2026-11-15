// ============================================================================
// gasStation.ts — ⛽ THE GAS STATION (v0.45, the first stop on the road from your
// street to the airport; Joshua, 2026-11-14: "start with a gas station, then kind
// of work our way to the airport").
//
// The first business whose customers are CARS. They come off the street's own
// traffic (traffic.ts), pull up to the curb beside a pump, are filled can by can
// from the station's fuel rack, pay onto the cash pad and drive off.
//
//   ⛽ fuel cans (the depot: filled by the TANKER, not by itself)
//      -> the FUEL RACK by the pumps (you carry them, or the Fuel Carrier ant does)
//      -> a car at a PUMP (you pump while you stand at the pumps, or the Attendant does)
//      -> 💵 the cash pad
//
// It is shaped like a counter for the ⬆️ panels (priceMult, paceMult, bulk, lines,
// opts.label): PRICES & CUSTOMERS, then the 2ND ATTENDANT (the second pump opens)
// and BIGGER ORDERS (fuller tanks), exactly as at the shops.
//
// The pumps stand on the sidewalk at the curb, where the street's cars already
// park, so nothing new had to be taught to the traffic: a customer is a ride that
// parks at a pump (`Traffic.arrive`), and so is the tanker.
// ============================================================================
import * as THREE from 'three';
import { lod } from '../core/lod';
import { bump } from '../core/totals';
import type { Sfx } from '../core/audio';
import type { CreatureModel } from '../actors/models';
import { Flyers, ITEM_VALUE, Stack, StackItem, makeItem } from './items';
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

export interface GasOpts {
  /** Where along the street each pump stands (world x): a car parks at the curb beside it. */
  pumps: [number, number];
  /** The sidewalk line the pumps stand on (world z), and the fuel rack's place. */
  pumpZ: number;
  rack: { x: number; z: number };
  /** Seconds between cars (before PRICES & CUSTOMERS), cans a car takes (lowest, highest), seconds per can. */
  interval: number;
  wants: [number, number];
  serve: number;
  /** The tanker: seconds between deliveries, cans per delivery, and the depot it fills. */
  truckEvery: number;
  truckLoad: number;
  depot: ResourcePile;
  /** For the ⬆️ panels (the same fields a counter has). */
  label: string;
  itemType: 'fuel';
}

interface Bay {
  x: number;
  ride: Ride | null;
  wants: number;      // cans still to go
  bought: number;     // cans pumped so far
  t: number;          // seconds on the can being pumped
  tanker: boolean;    // this ride is the tanker, not a customer
  sign: TextSprite;   // "⛽ 3" over the car while it waits
}

export class GasStation {
  group = new THREE.Group();
  /** The fuel rack: cans waiting to be pumped. */
  shelf: Stack;
  /** Stand here to pump (and to put cans on the rack)... */
  staffZone: Zone;
  /** ...and where the Fuel Carrier ant stocks the rack from. */
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
  /** Cars filled (for the save). */
  onCar: () => void = () => {};

  private bays: Bay[];
  private nextCar: number;
  private nextTruck: number;
  private staff: CreatureModel | null = null;
  private staff2: CreatureModel | null = null;
  private roof = new THREE.Group();      // the canopy's top: off in the top-down view, like the shops' roofs
  private nozzle = new THREE.Object3D(); // where a paid bill pops out (by the pumps)
  private tmp = new THREE.Vector3();

  constructor(private scene: THREE.Scene, private traffic: Traffic, private flyers: Flyers, private cashPad: CashPad, public opts: GasOpts) {
    const [x0, x1] = opts.pumps;
    const mid = (x0 + x1) / 2;
    // (the group sits at the middle of the two pumps: the ⬆️ panel's button shows when you are next to it)
    this.group.position.set(mid, 0, opts.pumpZ);
    scene.add(this.group);
    lod.add(this.group, 9);
    const red = mat(0xd62828, 0.55), white = mat(0xf4f1ea, 0.6), dark = mat(0x2b2f36, 0.7), steel = mat(0xb9bec6, 0.45, 0.4);
    // The two pumps, each on a little island of kerb
    for (const px of opts.pumps) {
      const lx = px - mid;
      this.group.add(box(1.5, 0.16, 0.9, mat(0xd9d4c8, 0.9), lx, 0.08, 0));
      this.group.add(box(0.7, 1.7, 0.5, red, lx, 1.0, 0));
      this.group.add(box(0.74, 0.5, 0.54, white, lx, 1.55, 0));
      this.group.add(box(0.5, 0.3, 0.05, dark, lx, 1.55, 0.29));   // its little screen, facing the street
      this.group.add(box(0.08, 0.7, 0.08, dark, lx + 0.42, 1.0, 0.1)); // the hose
      this.blockers.push({ minX: px - 0.5, maxX: px + 0.5, minZ: opts.pumpZ - 0.4, maxZ: opts.pumpZ + 0.4 });
    }
    // The canopy over the pumps and the curb lane, on four posts
    const span = x1 - x0 + 5;
    for (const lx of [-span / 2 + 0.4, span / 2 - 0.4]) for (const lz of [-1.3, 3.6]) this.group.add(box(0.22, 4.4, 0.22, steel, lx, 2.2, lz));
    this.roof.add(box(span, 0.35, 6.0, white, 0, 4.55, 1.15), box(span + 0.06, 0.2, 6.06, red, 0, 4.3, 1.15));
    this.group.add(this.roof);
    const sign = new TextSprite(0.7, '#ffffff');
    sign.setText('⛽ GAS');
    sign.sprite.position.set(0, 5.5, 1.15);
    this.group.add(sign.sprite);
    // The fuel rack (a low shelf of cans) between the pumps, back from the curb
    const rack = new THREE.Group();
    rack.position.set(opts.rack.x - mid, 0, opts.rack.z - opts.pumpZ);
    rack.add(box(1.9, 0.14, 1.9, mat(0x6b7280, 0.8), 0, 0.07, 0));
    this.group.add(rack);
    this.shelf = new Stack(rack, gridLayout(3, 3, 0.52, 0.52, 0.16), 27);
    this.blockers.push({ minX: opts.rack.x - 1.0, maxX: opts.rack.x + 1.0, minZ: opts.rack.z - 1.0, maxZ: opts.rack.z + 1.0 });
    // (you stand between the rack and the curb, in reach of both pumps' hoses)
    this.staffZone = new Zone(opts.rack.x, opts.pumpZ + 0.05, 2.2, 0.75);
    this.loadZone = new Zone(opts.rack.x, opts.rack.z - 1.7, 0.7, 0.7);
    this.nozzle.position.set(0, 1.5, 0.4);
    this.group.add(this.nozzle);

    this.bays = opts.pumps.map((x) => {
      const t = new TextSprite(0.55, '#ffffff');
      t.sprite.visible = false;
      scene.add(t.sprite);
      return { x, ride: null, wants: 0, bought: 0, t: 0, tanker: false, sign: t };
    });
    this.nextCar = 3;
    this.nextTruck = opts.truckEvery;
    // (the depot is filled by the tanker alone: it does not regrow by itself, and has no ⬆️ REGROW)
    opts.depot.spawnEvery = () => Infinity;
  }

  /** Cars at the pumps right now, waiting or being filled (for the map's ❗ and the ⬆️ panel's status). */
  get waiting() {
    return this.bays.filter((b) => b.ride && !b.tanker && b.ride.state === 'parked').length;
  }

  /** ⛽ The Attendant: pumps for you. */
  hireStaff(model: CreatureModel, animate: boolean, title: string) {
    this.hasStaff = true;
    this.staff = model;
    this.place(model, this.opts.pumps[0] + 1.2, title, animate);
  }

  /** The ⬆️ panel's 2ND ATTENDANT: the second pump opens. */
  hireStaff2(animate: boolean) {
    if (this.staff2) return;
    this.lines = 2;
    this.staff2 = person('h-crew1');
    this.place(this.staff2, this.opts.pumps[1] - 1.2, '⛽ ATTENDANT 2', animate);
  }

  private place(model: CreatureModel, x: number, title: string, animate: boolean) {
    model.root.position.set(x, 0, this.opts.pumpZ + 0.2);
    model.root.rotation.y = 0; // facing the street
    titleTag(model, title, TITLE.human);
    this.scene.add(model.root);
    if (animate) this.flyers.grow(model.root);
  }

  /** Top-down view: the canopy's top is taken off so you can see the pumps (its posts stay). */
  setCutaway(on: boolean) {
    this.roof.visible = !on;
  }

  update(dt: number, playerServing: boolean, sfx: Sfx) {
    const o = this.opts;
    // 🚚 The tanker: on its round, or sooner if the depot is nearly dry. It takes the second pump's place at the curb.
    this.nextTruck -= dt;
    const dry = o.depot.stack.count <= 3;
    const tankerBay = this.bays[1];
    if ((this.nextTruck <= 0 || (dry && this.nextTruck < o.truckEvery - 12)) && !tankerBay.ride && !o.depot.stack.full) {
      this.nextTruck = o.truckEvery;
      tankerBay.tanker = true;
      tankerBay.ride = this.traffic.arrive(tankerBay.x, 'north', {
        kind: 'truck',
        onParked: (ride) => {
          // (its cans hop from the curb onto the depot's pallet, as many as fit)
          const room = o.depot.stack.max - o.depot.stack.count;
          for (let i = 0; i < Math.min(room, o.truckLoad); i++) {
            const it: StackItem = { mesh: makeItem('fuel'), type: 'fuel', value: 0, flying: false };
            it.mesh.position.copy(ride.curb).setY(1.2);
            this.scene.add(it.mesh);
            this.flyers.pushInto(it, o.depot.stack, 0.5 + i * 0.03);
          }
          ride.leaveIn(3.5);
        },
      });
    }
    // 🚗 The next customer, to a pump that is free (the second one only once its attendant works there)
    this.nextCar -= dt * this.paceMult;
    if (this.nextCar <= 0) {
      const free = this.bays.find((b, i) => !b.ride && i < this.lines);
      if (free) {
        this.nextCar = o.interval * (0.75 + Math.random() * 0.5);
        free.tanker = false;
        free.wants = Math.min(20, Math.round((o.wants[0] + Math.floor(Math.random() * (o.wants[1] - o.wants[0] + 1))) * this.bulk));
        free.bought = 0;
        free.t = 0;
        free.ride = this.traffic.arrive(free.x, 'north', { kind: Math.random() < 0.8 ? 'car' : 'van' });
      } else this.nextCar = 0.5;
    }
    const pumping = this.hasStaff || playerServing;
    for (const b of this.bays) {
      const ride = b.ride;
      if (!ride) continue;
      if (ride.state === 'gone' || ride.away) {
        b.ride = null;
        b.sign.sprite.visible = false;
        continue;
      }
      if (b.tanker || ride.state !== 'parked') {
        b.sign.sprite.visible = false;
        continue;
      }
      // (what it still wants, over the car)
      b.sign.sprite.visible = b.wants > 0;
      b.sign.sprite.position.set(ride.curb.x, 3.1, ride.curb.z + 1.6);
      b.sign.setText(`⛽ ${b.wants}`);
      if (b.wants <= 0) continue;
      if (!pumping || !this.shelf.canPop()) continue;
      b.t += dt * this.paceMult;
      if (b.t < o.serve) continue;
      b.t = 0;
      const can = this.shelf.pop();
      if (!can) continue;
      // (the can flies to the car's tank, and its price is paid as it lands)
      const at = this.tmp.copy(ride.curb).setY(1.0);
      at.z += 1.4;
      const target = at.clone();
      this.flyers.fly(can.mesh, () => target, () => can.mesh.removeFromParent(), 0.3, 0.9);
      b.wants--;
      b.bought++;
      const value = Math.round(ITEM_VALUE.fuel * this.valueMult() * this.priceMult);
      bump('sold');
      payBill(this.scene, this.flyers, this.cashPad, this.nozzle, value);
      sfx.sale();
      this.onServe(!this.hasStaff && playerServing);
      if (b.wants <= 0) {
        b.sign.sprite.visible = false;
        ride.leaveIn(0.9);
        this.onCar();
      }
    }
  }

  /** People at the pumps (for the cars' brakes): the attendants stand on the sidewalk, not the road, so nobody. */
  walkers(_out: THREE.Vector3[]) {}
}
