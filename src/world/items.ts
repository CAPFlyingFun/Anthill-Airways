// ============================================================================
// items.ts — the little things you carry (crumbs, snack packs, cash bills),
// plus two helpers that make the whole "carry and stack" feel work:
//
//   Stack  — a pile of items attached to something (an ant's back, a table,
//            a cash pad). A `layout` function decides where item #i sits.
//   Flyers — animates items hopping in an arc from one place to another.
//
// Rule that keeps things simple: items are only ever taken off the TOP of a
// stack, and only once they have finished flying in.
// ============================================================================
import * as THREE from 'three';

export type ItemType = 'crumb' | 'snack' | 'leaf' | 'wrap' | 'sugar' | 'candy' | 'cash' | 'bag' | 'snackbox'
  // Act 3 (Dino Island)
  | 'fruit' | 'smoothie' | 'meat' | 'egg' | 'ticket'
  // Act 4 (Volcano)
  | 'obsidian' | 'gem' | 'magma' | 'crystal'
  // Act 5 (Hotel)
  | 'laundry' | 'towel' | 'grocery' | 'tray'
  // 🏝️ Anthill Island: the Corner Café's coffee
  | 'beans' | 'coffee'
  // 🏝️ Anthill Island: the Corner Store's bag of groceries
  | 'shopbag'
  // 🏝️ Anthill Island: the Gas Station's can of fuel (v0.45)
  | 'fuel'
  // 🐜✈️ Airport Tycoon: a drop of flower nectar, the bugs' jet fuel (v0.68)
  | 'nectar'
  // 🏝️ Anthill Island: the Repair Garage's box of parts (v0.47)
  | 'part'
  // 🏝️ Anthill Island: the Drive-Thru Diner's meal bag (v0.55)
  | 'meal'
  // 🏝️ Anthill Island, waves 3 to 5 (v0.56): the bakery's loaf, the post office's parcel, the fire station's
  // extinguisher, the pharmacy's medicine, the hospital's medical kit, the airport's suitcase
  | 'bread' | 'parcel' | 'extinguisher' | 'medicine' | 'medkit' | 'luggage'
  // 🦖 The story (v0.63): packing at home (clothes, your ant farm), and on the island: logs, berries,
  // the radio mast you build at the workbench and the radio's spare power module
  | 'clothes' | 'antfarm' | 'log' | 'berry' | 'mast' | 'radio'
  // 🪓 v0.65: ARK-style first tools: a sharp stone, a branch, plant fiber (Rae lashes them into a hatchet)
  | 'stone' | 'branch' | 'fiber';

/** Height of one item when stacked. */
export const ITEM_H: Record<ItemType, number> = { nectar: 0.4, clothes: 0.24, antfarm: 0.5, log: 0.34, berry: 0.3, mast: 1.0, radio: 0.5, stone: 0.26, branch: 0.14, fiber: 0.16, bread: 0.2, parcel: 0.3, extinguisher: 0.5, medicine: 0.3, medkit: 0.3, luggage: 0.46, meal: 0.42, part: 0.3, fuel: 0.44, crumb: 0.3, snack: 0.32, leaf: 0.14, wrap: 0.32, sugar: 0.4, candy: 0.3, cash: 0.11, bag: 0.48, snackbox: 0.36, fruit: 0.4, smoothie: 0.5, meat: 0.32, egg: 0.42, ticket: 0.1, obsidian: 0.36, gem: 0.4, magma: 0.4, crystal: 0.52, laundry: 0.4, towel: 0.2, grocery: 0.42, tray: 0.36, beans: 0.38, coffee: 0.4, shopbag: 0.5 };

// Shared geometry + materials: every crumb reuses the same ones (fast).
const geo = {
  crumb: new THREE.BoxGeometry(0.42, 0.28, 0.42),
  snack: new THREE.BoxGeometry(0.56, 0.3, 0.42),
  cash: new THREE.BoxGeometry(0.62, 0.1, 0.36),
  // A leaf: a squashed, pointed ellipsoid (scale baked into the geometry)
  leaf: new THREE.SphereGeometry(0.3, 12, 6).scale(1, 0.22, 1.5),
  // A leaf wrap: a rolled-up leaf lying on its side
  wrap: new THREE.CylinderGeometry(0.16, 0.16, 0.56, 12).rotateZ(Math.PI / 2),
  sugar: new THREE.BoxGeometry(0.4, 0.38, 0.4),
  candy: new THREE.BoxGeometry(0.5, 0.28, 0.38),
  // Act 2 (airport): a suitcase, and a snack box shipped from the ant colony
  bag: new THREE.BoxGeometry(0.7, 0.46, 0.32),
  bagHandle: new THREE.TorusGeometry(0.1, 0.025, 6, 12, Math.PI),
  snackbox: new THREE.BoxGeometry(0.6, 0.34, 0.46),
  // Act 3 (Dino Island)
  fruit: new THREE.SphereGeometry(0.22, 12, 8).scale(1, 0.9, 1.25),     // a big tropical fruit
  leafTop: new THREE.ConeGeometry(0.1, 0.18, 6),
  cup: new THREE.CylinderGeometry(0.2, 0.15, 0.42, 14),                  // smoothie cup
  straw: new THREE.CylinderGeometry(0.025, 0.025, 0.34, 6),
  meat: new THREE.CylinderGeometry(0.17, 0.2, 0.42, 10),                 // a big drumstick
  bone: new THREE.CylinderGeometry(0.05, 0.05, 0.3, 6),
  egg: new THREE.SphereGeometry(0.17, 14, 10).scale(1, 1.3, 1),
  ticket: new THREE.BoxGeometry(0.5, 0.08, 0.3),
  // Act 4 (Volcano)
  rock: new THREE.DodecahedronGeometry(0.22).scale(1.15, 0.85, 1),       // a chunk of obsidian / magma
  gem: new THREE.OctahedronGeometry(0.2).scale(1, 1.25, 1),              // a polished obsidian gem
  crystal: new THREE.ConeGeometry(0.15, 0.5, 6),                         // a Fire Crystal shard
  // Act 5 (Hotel)
  laundry: new THREE.IcosahedronGeometry(0.26, 1).scale(1.2, 0.8, 1),   // a lumpy bundle of sheets
  towel: new THREE.BoxGeometry(0.5, 0.18, 0.36),                          // a folded towel
  grocery: new THREE.BoxGeometry(0.46, 0.34, 0.34),                       // a crate of groceries
  beans: new THREE.SphereGeometry(0.22, 12, 9).scale(1.1, 0.8, 1.0),       // a little burlap bag of coffee beans...
  beanTie: new THREE.CylinderGeometry(0.06, 0.09, 0.1, 8),                  // ...tied at the top
  coffee: new THREE.CylinderGeometry(0.18, 0.13, 0.34, 16),                 // a takeaway coffee cup...
  coffeeLid: new THREE.CylinderGeometry(0.19, 0.19, 0.05, 16),             // ...its lid...
  coffeeSleeve: new THREE.CylinderGeometry(0.172, 0.155, 0.13, 16),        // ...and its cardboard sleeve
  tray: new THREE.CylinderGeometry(0.28, 0.28, 0.04, 18),                 // a silver tray...
  cloche: new THREE.SphereGeometry(0.2, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), // ...with a dome lid
  veg: new THREE.SphereGeometry(0.1, 8, 6),
  bread: new THREE.CapsuleGeometry(0.1, 0.24, 3, 8),                        // a loaf (the Bakery)
  parcel: new THREE.BoxGeometry(0.4, 0.28, 0.34),                           // a brown parcel (the Post Office)
  extinguisher: new THREE.CylinderGeometry(0.11, 0.11, 0.4, 10),            // a fire extinguisher (the Fire Station)
  medicine: new THREE.BoxGeometry(0.34, 0.28, 0.24),                        // a white box with a green cross (the Pharmacy)
  medkit: new THREE.BoxGeometry(0.4, 0.28, 0.3),                            // a red kit with a white cross (the Hospital)
  luggage: new THREE.BoxGeometry(0.4, 0.44, 0.2),                           // a suitcase (the Airport)
  meal: new THREE.BoxGeometry(0.3, 0.36, 0.22),                             // a take-away bag (the Drive-Thru Diner)
  part: new THREE.BoxGeometry(0.4, 0.28, 0.4),                              // a box of car parts (the Repair Garage)
  fuel: new THREE.BoxGeometry(0.34, 0.42, 0.2),                             // a red jerry can (the Gas Station)
  nectar: new THREE.SphereGeometry(0.2, 14, 10).scale(1, 1.05, 1).translate(0, 0, 0), // 🐜✈️ a drop of amber nectar
  shopbag: new THREE.BoxGeometry(0.36, 0.44, 0.26),                        // a paper bag of groceries (the Corner Store)
  baguette: new THREE.CylinderGeometry(0.035, 0.035, 0.34, 8),
  // 🦖 The story
  clothes: new THREE.BoxGeometry(0.5, 0.22, 0.38),                           // folded clothes
  antfarm: new THREE.BoxGeometry(0.62, 0.46, 0.16),                          // your ant farm (a thin glass case)
  log: new THREE.CylinderGeometry(0.16, 0.17, 0.7, 9).rotateZ(Math.PI / 2), // a log, lying across your arms
  berry: new THREE.SphereGeometry(0.075, 8, 6),                              // one berry of a bunch
  stone: new THREE.DodecahedronGeometry(0.16),
  branch: new THREE.CylinderGeometry(0.035, 0.05, 0.8, 6).rotateZ(Math.PI / 2),
  strand: new THREE.CylinderGeometry(0.015, 0.015, 0.6, 4).rotateZ(Math.PI / 2),
  mastBase: new THREE.CylinderGeometry(0.2, 0.2, 0.04, 8),
  mastLeg: new THREE.CylinderGeometry(0.018, 0.022, 1, 5),                  // a radio mast: a lattice section
  mastBrace: new THREE.CylinderGeometry(0.01, 0.01, 1, 4),
  mastDish: new THREE.SphereGeometry(0.18, 12, 6, 0, Math.PI * 2, 0, Math.PI / 3),
  radio: new THREE.BoxGeometry(0.62, 0.46, 0.46),                            // the radio's power module (heavy!)
};
const mat = {
  crumb: new THREE.MeshStandardMaterial({ color: 0xdca44a, roughness: 0.9 }),
  snackSide: new THREE.MeshStandardMaterial({ color: 0xe0533c, roughness: 0.6 }),
  snackTop: new THREE.MeshStandardMaterial({ color: 0xffd25a, roughness: 0.6 }),
  cashSide: new THREE.MeshStandardMaterial({ color: 0x3f9d4a, roughness: 0.7 }),
  cashTop: new THREE.MeshStandardMaterial({ color: 0x8be36a, roughness: 0.7 }),
  leaf: new THREE.MeshStandardMaterial({ color: 0x4caf3a, roughness: 0.7 }),
  wrapSide: new THREE.MeshStandardMaterial({ color: 0x2f7d32, roughness: 0.6 }),
  wrapEnd: new THREE.MeshStandardMaterial({ color: 0xa5d66f, roughness: 0.6 }),
  sugar: new THREE.MeshStandardMaterial({ color: 0xf6f8ff, roughness: 0.35 }),
  candySide: new THREE.MeshStandardMaterial({ color: 0xff6fb5, roughness: 0.35 }),
  candyTop: new THREE.MeshStandardMaterial({ color: 0xfff1f8, roughness: 0.35 }),
  bags: [0x2d6cdf, 0xe63946, 0x2a9d8f, 0xf4a261, 0x6a4c93, 0x333a44].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 })),
  handle: new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5 }),
  boxSide: new THREE.MeshStandardMaterial({ color: 0xf28c28, roughness: 0.6 }),
  boxTop: new THREE.MeshStandardMaterial({ color: 0xb8321e, roughness: 0.6 }),
  fruit: new THREE.MeshStandardMaterial({ color: 0xffb02e, roughness: 0.55 }),
  cup: new THREE.MeshStandardMaterial({ color: 0xff6fa8, roughness: 0.35 }),
  straw: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }),
  meat: new THREE.MeshStandardMaterial({ color: 0xa0412d, roughness: 0.7 }),
  bone: new THREE.MeshStandardMaterial({ color: 0xf2ead8, roughness: 0.6 }),
  egg: new THREE.MeshStandardMaterial({ color: 0xf3e3c3, roughness: 0.5 }),
  ticket: new THREE.MeshStandardMaterial({ color: 0x2ec4b6, roughness: 0.5 }),
  obsidian: new THREE.MeshStandardMaterial({ color: 0x1b1a24, roughness: 0.15, metalness: 0.35 }),
  gem: new THREE.MeshStandardMaterial({ color: 0x5b3fa0, roughness: 0.1, metalness: 0.4, emissive: 0x2a1250, emissiveIntensity: 0.6 }),
  magma: new THREE.MeshStandardMaterial({ color: 0x5a1606, roughness: 0.6, emissive: 0xff4a12, emissiveIntensity: 1.3 }),
  crystal: new THREE.MeshStandardMaterial({ color: 0xff7a3d, roughness: 0.2, metalness: 0.1, emissive: 0xff3300, emissiveIntensity: 0.9 }),
  laundry: new THREE.MeshStandardMaterial({ color: 0xb8c4d6, roughness: 1 }),
  towel: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 }),
  towelStripe: new THREE.MeshStandardMaterial({ color: 0x2ec4b6, roughness: 0.9 }),
  grocery: new THREE.MeshStandardMaterial({ color: 0xc89b5e, roughness: 0.9 }),
  veg: new THREE.MeshStandardMaterial({ color: 0x4caf50, roughness: 0.8 }),
  bread: new THREE.MeshStandardMaterial({ color: 0xd9a05b, roughness: 0.85 }),
  parcel: new THREE.MeshStandardMaterial({ color: 0xb98a55, roughness: 0.95 }),
  tape: new THREE.MeshStandardMaterial({ color: 0xf2e6d0, roughness: 0.8 }),
  extinguisher: new THREE.MeshStandardMaterial({ color: 0xd32f2f, roughness: 0.5 }),
  white: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 }),
  green: new THREE.MeshStandardMaterial({ color: 0x2e9e4f, roughness: 0.7 }),
  medkit: new THREE.MeshStandardMaterial({ color: 0xd32f2f, roughness: 0.7 }),
  luggage: new THREE.MeshStandardMaterial({ color: 0x2f6fb3, roughness: 0.7 }),
  meal: new THREE.MeshStandardMaterial({ color: 0xf2e6d0, roughness: 0.95 }),
  mealBand: new THREE.MeshStandardMaterial({ color: 0xc1121f, roughness: 0.7 }),
  part: new THREE.MeshStandardMaterial({ color: 0x5b7c99, roughness: 0.7 }),
  fuel: new THREE.MeshStandardMaterial({ color: 0xd62828, roughness: 0.6 }),
  nectar: new THREE.MeshStandardMaterial({ color: 0xffb02e, roughness: 0.15, metalness: 0.05, emissive: 0x6a3a00, emissiveIntensity: 0.5 }),
  shopbag: new THREE.MeshStandardMaterial({ color: 0xc9a36b, roughness: 0.95 }),
  baguette: new THREE.MeshStandardMaterial({ color: 0xe0b46a, roughness: 0.8 }),
  silver: new THREE.MeshStandardMaterial({ color: 0xdfe4ea, roughness: 0.25, metalness: 0.8 }),
  beans: new THREE.MeshStandardMaterial({ color: 0xa47a4a, roughness: 1 }),
  beanTie: new THREE.MeshStandardMaterial({ color: 0x5b3a1e, roughness: 0.9 }),
  coffee: new THREE.MeshStandardMaterial({ color: 0xf7f4ee, roughness: 0.45 }),
  coffeeLid: new THREE.MeshStandardMaterial({ color: 0x4a2c1a, roughness: 0.5 }),
  coffeeSleeve: new THREE.MeshStandardMaterial({ color: 0xc8975a, roughness: 0.85 }),
  clothes: [0x3a6ea5, 0xd96c4f, 0x6b8f5a, 0xe3c567].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95 })),
  glass: new THREE.MeshStandardMaterial({ color: 0xcfeaff, roughness: 0.1, transparent: true, opacity: 0.45 }),
  sand: new THREE.MeshStandardMaterial({ color: 0xd8b878, roughness: 1 }),
  bark: new THREE.MeshStandardMaterial({ color: 0x7a5232, roughness: 0.95 }),
  logEnd: new THREE.MeshStandardMaterial({ color: 0xe0b77c, roughness: 0.9 }),
  berry: new THREE.MeshStandardMaterial({ color: 0xc2185b, roughness: 0.4 }),
  metal: new THREE.MeshStandardMaterial({ color: 0x9aa3ab, roughness: 0.35, metalness: 0.6 }),
  radio: new THREE.MeshStandardMaterial({ color: 0x4d5b3a, roughness: 0.7 }),
  stone: new THREE.MeshStandardMaterial({ color: 0x8c8f93, roughness: 0.85, flatShading: true }),
  fiber: new THREE.MeshStandardMaterial({ color: 0x8fbf4a, roughness: 0.9 }),
  twine: new THREE.MeshStandardMaterial({ color: 0xc9a86a, roughness: 0.9 }),
  dish: new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.4, side: THREE.DoubleSide }),
  amber: new THREE.MeshStandardMaterial({ color: 0xffb703, roughness: 0.3, emissive: 0xff8800, emissiveIntensity: 0.6 }),
};

/** Cash value of each sellable item (counter price; gate runs pay the same per item). */
export const ITEM_VALUE: Record<ItemType, number> = { nectar: 4, stone: 0, branch: 0, fiber: 0, clothes: 0, antfarm: 0, log: 0, berry: 0, mast: 0, radio: 0, bread: 2000, parcel: 4500, extinguisher: 20000, medicine: 34000, medkit: 40000, luggage: 125000, meal: 1300, part: 600, fuel: 90, crumb: 2, snack: 5, leaf: 3, wrap: 14, sugar: 10, candy: 40, cash: 0, bag: 15, snackbox: 25, fruit: 0, smoothie: 60, meat: 0, egg: 80, ticket: 50, obsidian: 0, gem: 150, magma: 0, crystal: 450, laundry: 0, towel: 0, grocery: 0, tray: 220, beans: 2, coffee: 20, shopbag: 50 };

/** Build the 3D mesh for one item. Box faces order: +x, -x, +y(top), -y, +z, -z */
export function makeItem(type: ItemType): THREE.Mesh {
  let m: THREE.Mesh;
  if (type === 'crumb') {
    m = new THREE.Mesh(geo.crumb, mat.crumb);
    m.rotation.y = Math.random() * 0.8 - 0.4; // crumbs look more natural a bit crooked
  } else if (type === 'snack') {
    const s = mat.snackSide;
    m = new THREE.Mesh(geo.snack, [s, s, mat.snackTop, s, s, s]);
  } else if (type === 'leaf') {
    m = new THREE.Mesh(geo.leaf, mat.leaf);
    m.rotation.y = Math.random() * 0.8 - 0.4;
  } else if (type === 'wrap') {
    m = new THREE.Mesh(geo.wrap, [mat.wrapSide, mat.wrapEnd, mat.wrapEnd]);
  } else if (type === 'sugar') {
    m = new THREE.Mesh(geo.sugar, mat.sugar);
  } else if (type === 'candy') {
    const s = mat.candySide;
    m = new THREE.Mesh(geo.candy, [s, s, mat.candyTop, s, s, s]);
  } else if (type === 'bag') {
    // A suitcase in a random color, with a little handle on top
    m = new THREE.Mesh(geo.bag, mat.bags[Math.floor(Math.random() * mat.bags.length)]);
    const handle = new THREE.Mesh(geo.bagHandle, mat.handle);
    handle.position.y = 0.23;
    m.add(handle);
  } else if (type === 'fruit') {
    m = new THREE.Mesh(geo.fruit, mat.fruit);
    const top = new THREE.Mesh(geo.leafTop, mat.leaf); // reuses the leaf green
    top.position.y = 0.2;
    m.add(top);
  } else if (type === 'smoothie') {
    m = new THREE.Mesh(geo.cup, mat.cup);
    const straw = new THREE.Mesh(geo.straw, mat.straw);
    straw.position.set(0.06, 0.28, 0);
    straw.rotation.z = -0.25;
    m.add(straw);
  } else if (type === 'meat') {
    m = new THREE.Mesh(geo.meat, mat.meat);
    m.rotation.z = Math.PI / 2; // lies on its side
    const bone = new THREE.Mesh(geo.bone, mat.bone);
    bone.position.y = 0.32;
    m.add(bone);
  } else if (type === 'egg') {
    m = new THREE.Mesh(geo.egg, mat.egg);
  } else if (type === 'ticket') {
    m = new THREE.Mesh(geo.ticket, mat.ticket);
  } else if (type === 'laundry') {
    m = new THREE.Mesh(geo.laundry, mat.laundry);
    m.rotation.y = Math.random() * 3;
  } else if (type === 'towel') {
    // (extra parts ride along as children of the main mesh)
    m = new THREE.Mesh(geo.towel, mat.towel);
    const stripe = new THREE.Mesh(geo.towel, mat.towelStripe);
    stripe.scale.set(1.02, 1.02, 0.25);
    m.add(stripe);
  } else if (type === 'grocery') {
    m = new THREE.Mesh(geo.grocery, mat.grocery);
    for (const [vx, vz] of [[-0.12, 0], [0.1, 0.05], [0, -0.08]]) {
      const v = new THREE.Mesh(geo.veg, mat.veg);
      v.position.set(vx, 0.2, vz);
      m.add(v);
    }
  } else if (type === 'bread') {
    // A loaf lying on its side
    m = new THREE.Mesh(geo.bread, mat.bread);
    m.rotation.z = Math.PI / 2;
  } else if (type === 'parcel') {
    // A brown parcel with tape across it
    m = new THREE.Mesh(geo.parcel, mat.parcel);
    m.add(new THREE.Mesh(new THREE.BoxGeometry(0.41, 0.29, 0.07), mat.tape));
  } else if (type === 'extinguisher') {
    // A red cylinder with a dark handle on top
    m = new THREE.Mesh(geo.extinguisher, mat.extinguisher);
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.06), mat.cashSide);
    top.position.y = 0.24;
    m.add(top);
  } else if (type === 'medicine' || type === 'medkit') {
    // A box with a cross on its lid: white with a green cross (medicine), red with a white one (a medical kit)
    const kit = type === 'medkit';
    m = new THREE.Mesh(kit ? geo.medkit : geo.medicine, kit ? mat.medkit : mat.white);
    for (const [w, d] of [[0.2, 0.07], [0.07, 0.2]]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(w, 0.02, d), kit ? mat.white : mat.green);
      bar.position.y = 0.15;
      m.add(bar);
    }
  } else if (type === 'luggage') {
    // A blue suitcase with a handle
    m = new THREE.Mesh(geo.luggage, mat.luggage);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.04), mat.cashSide);
    handle.position.y = 0.25;
    m.add(handle);
  } else if (type === 'meal') {
    // A white take-away bag with a red band round it and its top folded over
    m = new THREE.Mesh(geo.meal, mat.meal);
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.1, 0.23), mat.mealBand);
    band.position.y = -0.02;
    const fold = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.1), mat.mealBand);
    fold.position.set(0, 0.2, 0);
    m.add(band, fold);
  } else if (type === 'part') {
    // A box of parts with a gear on its lid
    m = new THREE.Mesh(geo.part, mat.part);
    const gear = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.05, 8), mat.cashSide);
    gear.position.y = 0.16;
    m.add(gear);
  } else if (type === 'nectar') {
    // A round drop of glowing amber nectar with a little shine on top (the bugs' jet fuel)
    m = new THREE.Mesh(geo.nectar, mat.nectar);
    const shine = new THREE.Mesh(geo.veg, mat.white);
    shine.scale.setScalar(0.35);
    shine.position.set(-0.07, 0.11, 0.08);
    m.add(shine);
  } else if (type === 'fuel') {
    // A jerry can: its body, a spout at one corner and a handle across the top
    m = new THREE.Mesh(geo.fuel, mat.fuel);
    const spout = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.07), mat.cashSide);
    spout.position.set(0.11, 0.26, 0);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 0.06), mat.fuel);
    handle.position.set(-0.03, 0.25, 0);
    m.add(spout, handle);
  } else if (type === 'shopbag') {
    // A paper bag with greens and a baguette sticking out of the top
    m = new THREE.Mesh(geo.shopbag, mat.shopbag);
    for (const [vx, vz] of [[-0.08, 0.03], [0.07, -0.04]]) {
      const v = new THREE.Mesh(geo.veg, mat.veg);
      v.position.set(vx, 0.23, vz);
      m.add(v);
    }
    const bread = new THREE.Mesh(geo.baguette, mat.baguette);
    bread.position.set(0.1, 0.27, 0.06);
    bread.rotation.z = -0.3;
    m.add(bread);
  } else if (type === 'tray') {
    m = new THREE.Mesh(geo.tray, mat.silver);
    const lid = new THREE.Mesh(geo.cloche, mat.silver);
    lid.position.y = 0.02;
    m.add(lid);
  } else if (type === 'obsidian') {
    m = new THREE.Mesh(geo.rock, mat.obsidian);
    m.rotation.y = Math.random() * 3;
  } else if (type === 'magma') {
    m = new THREE.Mesh(geo.rock, mat.magma);
    m.rotation.y = Math.random() * 3;
  } else if (type === 'gem') {
    m = new THREE.Mesh(geo.gem, mat.gem);
  } else if (type === 'crystal') {
    m = new THREE.Mesh(geo.crystal, mat.crystal);
  } else if (type === 'beans') {
    m = new THREE.Mesh(geo.beans, mat.beans);
    const tie = new THREE.Mesh(geo.beanTie, mat.beanTie);
    tie.position.y = 0.2;
    m.add(tie);
    m.rotation.y = Math.random() * 3;
  } else if (type === 'coffee') {
    m = new THREE.Mesh(geo.coffee, mat.coffee);
    const lid = new THREE.Mesh(geo.coffeeLid, mat.coffeeLid);
    lid.position.y = 0.19;
    const sleeve = new THREE.Mesh(geo.coffeeSleeve, mat.coffeeSleeve);
    sleeve.position.y = -0.01;
    m.add(lid, sleeve);
  } else if (type === 'clothes') {
    m = new THREE.Mesh(geo.clothes, mat.clothes[Math.floor(Math.random() * mat.clothes.length)]);
  } else if (type === 'antfarm') {
    // A thin glass case with sand inside and a wooden frame along the bottom and top
    m = new THREE.Mesh(geo.antfarm, mat.glass);
    const sand = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.3, 0.12), mat.sand);
    sand.position.y = -0.07;
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.06, 0.2), mat.bark);
    base.position.y = -0.25;
    const lid = base.clone();
    lid.position.y = 0.25;
    m.add(sand, base, lid);
  } else if (type === 'log') {
    m = new THREE.Mesh(geo.log, [mat.bark, mat.logEnd, mat.logEnd]);
    m.rotation.y = Math.random() * 0.3 - 0.15;
  } else if (type === 'berry') {
    // A bunch of berries on a leaf
    m = new THREE.Mesh(geo.leaf, mat.leaf);
    m.scale.setScalar(0.8);
    for (let i = 0; i < 6; i++) {
      const b = new THREE.Mesh(geo.berry, mat.berry);
      b.position.set(Math.cos(i * 1.05) * 0.1, 0.08 + (i % 2) * 0.06, Math.sin(i * 1.05) * 0.1);
      m.add(b);
    }
  } else if (type === 'stone') {
    // A sharp grey stone (flat-shaded, a little squashed)
    m = new THREE.Mesh(geo.stone, mat.stone);
    m.scale.set(1.2, 0.8, 1);
    m.rotation.set(Math.random(), Math.random(), 0);
  } else if (type === 'branch') {
    // A branch with a twig and a couple of leaves still on it
    m = new THREE.Mesh(geo.branch, mat.bark);
    const twig = new THREE.Mesh(geo.branch, mat.bark);
    twig.scale.set(0.4, 0.6, 0.6);
    twig.rotation.y = 0.7;
    twig.position.set(0.15, 0, 0.1);
    const leaf = new THREE.Mesh(geo.leaf, mat.leaf);
    leaf.scale.setScalar(0.5);
    leaf.position.set(0.32, 0.03, 0.18);
    m.add(twig, leaf);
  } else if (type === 'fiber') {
    // A bundle of green plant fiber, tied in the middle
    m = new THREE.Mesh(geo.strand, mat.fiber);
    for (let i = 0; i < 6; i++) {
      const s2 = new THREE.Mesh(geo.strand, mat.fiber);
      s2.position.set(0, (i % 3) * 0.03, (i - 2.5) * 0.03);
      s2.rotation.y = (i - 2.5) * 0.06;
      m.add(s2);
    }
    const tie = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 8).rotateZ(Math.PI / 2), mat.twine);
    m.add(tie);
  } else if (type === 'mast') {
    // A radio mast, carried upright: a three-legged lattice section with a little white dish and a red light
    // (v0.63: the first version, a pole carried sideways, looked like a sword)
    m = new THREE.Mesh(geo.mastBase, mat.metal); // (its foot plate)
    const legs: THREE.Vector3[] = [];
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const leg = new THREE.Mesh(geo.mastLeg, mat.metal);
      leg.position.set(Math.cos(a) * 0.12, 0.5, Math.sin(a) * 0.12);
      m.add(leg);
      legs.push(new THREE.Vector3(Math.cos(a) * 0.12, 0, Math.sin(a) * 0.12));
    }
    for (let k = 0; k < 4; k++) {
      for (let i = 0; i < 3; i++) {
        const p0 = legs[i].clone().setY(k * 0.25);
        const p1 = legs[(i + 1) % 3].clone().setY((k + 1) * 0.25);
        const brace = new THREE.Mesh(geo.mastBrace, mat.metal);
        brace.scale.y = p0.distanceTo(p1);
        brace.position.copy(p0).add(p1).multiplyScalar(0.5);
        brace.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p1.clone().sub(p0).normalize());
        m.add(brace);
      }
    }
    const dish = new THREE.Mesh(geo.mastDish, mat.dish);
    dish.rotation.x = -Math.PI / 2 - 0.4;
    dish.position.set(0, 0.8, 0.12);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), mat.fuel);
    tip.position.y = 1.03;
    m.add(dish, tip);
  } else if (type === 'radio') {
    // An army-green box with dials and an amber light (the radio's power module)
    m = new THREE.Mesh(geo.radio, mat.radio);
    for (const x of [-0.14, 0.02]) {
      const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 10), mat.metal);
      dial.rotation.x = Math.PI / 2;
      dial.position.set(x, 0.05, 0.24);
      m.add(dial);
    }
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), mat.amber);
    lamp.position.set(0.18, 0.08, 0.24);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.06), mat.handle);
    handle.position.y = 0.25;
    m.add(lamp, handle);
  } else if (type === 'snackbox') {
    const s = mat.boxSide;
    m = new THREE.Mesh(geo.snackbox, [s, s, mat.boxTop, s, s, s]);
  } else {
    const s = mat.cashSide;
    m = new THREE.Mesh(geo.cash, [s, s, mat.cashTop, s, s, s]);
  }
  m.castShadow = true;
  return m;
}

export interface StackItem {
  mesh: THREE.Mesh;
  type: ItemType;
  value: number;    // only used by cash bills
  flying: boolean;  // true while it's still hopping into place
}

/** Where item #i of a stack sits, in the parent's local space. */
export type Layout = (i: number, type: ItemType, out: THREE.Vector3) => THREE.Vector3;

export class Stack {
  items: StackItem[] = [];

  constructor(
    public parent: THREE.Object3D,
    public layout: Layout,
    public max: number,
  ) {}

  get count() {
    return this.items.length;
  }
  get full() {
    return this.items.length >= this.max;
  }
  get topType(): ItemType | null {
    return this.items.length ? this.items[this.items.length - 1].type : null;
  }
  /** True if the top item has landed and can be taken. */
  canPop() {
    const top = this.items[this.items.length - 1];
    return !!top && !top.flying;
  }
  pop(): StackItem | undefined {
    return this.canPop() ? this.items.pop() : undefined;
  }
  /** Does the stack hold a landed item of this type (anywhere, not just the top)? */
  has(type: ItemType) {
    return this.items.some((it) => it.type === type && !it.flying);
  }
  /** How many of each type (for the inventory panel). */
  counts() {
    const out = new Map<ItemType, number>();
    for (const it of this.items) out.set(it.type, (out.get(it.type) ?? 0) + 1);
    return out;
  }
  /**
   * Take the highest landed item of `type` out of the stack, wherever it is.
   * (The items above it slide down; the owner re-lays them out each frame.)
   */
  popType(type: ItemType): StackItem | undefined {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      if (it.type === type && !it.flying) {
        this.items.splice(i, 1);
        return it;
      }
    }
    return undefined;
  }
  /** World position of slot i (for flying items to aim at). */
  slotWorld(i: number, type: ItemType, out: THREE.Vector3) {
    this.layout(i, type, out);
    return this.parent.localToWorld(out);
  }
  /** Add an item with no animation (used when piles regrow / on load). */
  addInstant(type: ItemType, value = 0): StackItem {
    const it: StackItem = { mesh: makeItem(type), type, value, flying: false };
    this.items.push(it);
    this.layout(this.items.length - 1, type, it.mesh.position);
    this.parent.add(it.mesh);
    return it;
  }
  /** Remove every item (used when a cart launches on a run). */
  clear() {
    this.items.forEach((it) => it.mesh.removeFromParent());
    this.items = [];
  }
}

interface Flight {
  mesh: THREE.Object3D;
  from: THREE.Vector3;
  target: () => THREE.Vector3;
  t: number;
  dur: number;
  arc: number;
  onLand: () => void;
}

interface Grow {
  obj: THREE.Object3D;
  t: number;
  dur: number;
  to: number;
}

export class Flyers {
  private flights: Flight[] = [];
  private grows: Grow[] = [];
  private tmp = new THREE.Vector3();

  constructor(private scene: THREE.Scene) {}

  /** Fly any object from where it is now to a (possibly moving) target. */
  fly(mesh: THREE.Object3D, target: () => THREE.Vector3, onLand: () => void, dur = 0.28, arc = 1.1) {
    const from = new THREE.Vector3();
    mesh.getWorldPosition(from);
    mesh.removeFromParent();
    mesh.position.copy(from);
    this.scene.add(mesh);
    this.flights.push({ mesh, from, target, t: 0, dur, arc, onLand });
  }

  /** Put an item onto a stack with a hop animation. */
  pushInto(it: StackItem, to: Stack, dur = 0.28) {
    it.flying = true;
    to.items.push(it);
    const tmp = new THREE.Vector3();
    // Aim for the item's CURRENT place in the stack, not the one it had when it
    // was thrown: if items below it are taken while it's in the air (e.g. the
    // assistant sweeps a cash pad), it drops down instead of landing mid-air.
    const slot = () => Math.max(0, to.items.indexOf(it));
    this.fly(
      it.mesh,
      () => to.slotWorld(slot(), it.type, tmp),
      () => {
        it.flying = false;
        to.parent.add(it.mesh);
        to.layout(slot(), it.type, it.mesh.position);
      },
      dur,
    );
  }

  /** Move the top item of one stack onto another. Returns the item or null. */
  transfer(from: Stack, to: Stack): StackItem | null {
    if (to.full) return null;
    const it = from.pop();
    if (!it) return null;
    this.pushInto(it, to);
    return it;
  }

  /** Move one item of a given type (from anywhere in `from`) onto `to`. */
  transferType(from: Stack, to: Stack, type: ItemType): StackItem | null {
    if (to.full) return null;
    const it = from.popType(type);
    if (!it) return null;
    this.pushInto(it, to);
    return it;
  }

  /** Make something pop into existence with a little bounce. */
  grow(obj: THREE.Object3D, dur = 0.35) {
    // Already popping? Its scale right now is mid-bounce (it overshoots), so keep the size
    // it's heading for. (Quick taps on an upgrade used to leave buildings bigger each time.)
    const i = this.grows.findIndex((g) => g.obj === obj);
    const to = i >= 0 ? this.grows[i].to : obj.scale.x || 1;
    if (i >= 0) this.grows.splice(i, 1);
    obj.scale.setScalar(0.001);
    this.grows.push({ obj, t: 0, dur, to });
  }

  update(dt: number) {
    for (let i = this.flights.length - 1; i >= 0; i--) {
      const f = this.flights[i];
      f.t = Math.min(1, f.t + dt / f.dur);
      const e = f.t * f.t * (3 - 2 * f.t); // smoothstep easing
      const target = f.target();
      this.tmp.lerpVectors(f.from, target, e);
      this.tmp.y += Math.sin(Math.PI * f.t) * f.arc; // the hop
      f.mesh.position.copy(this.tmp);
      if (f.t >= 1) {
        this.flights.splice(i, 1);
        f.onLand();
      }
    }
    for (let i = this.grows.length - 1; i >= 0; i--) {
      const g = this.grows[i];
      g.t = Math.min(1, g.t + dt / g.dur);
      // "back out" easing: overshoots a little, then settles = bouncy pop
      const c = 1.70158;
      const x = g.t - 1;
      const s = 1 + (c + 1) * x * x * x + c * x * x;
      g.obj.scale.setScalar(Math.max(0.001, s * g.to));
      if (g.t >= 1) this.grows.splice(i, 1);
    }
  }
}
