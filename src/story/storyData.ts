// ============================================================================
// storyData.ts — 🦖 Chapter 1's map and words (v0.63): where everything is, how fast things go, and every line
// that's said. (The names are working names: Joshua is still planning them. Change them here.)
//
// Units: a person is 2.8 tall (the same as the airport's people). The island's origin is the camp; north is -z.
// The house is far away at x = HOME_X, so the two never show at once.
// ============================================================================
import type { Line } from './dialogue';

/** The house's spot in the world (far from the island). */
export const HOME_X = 2000;

export const P = {
  human: 2.8,
  // --- 🏠 The house (local to HOME_X) ---------------------------------------
  house: { minX: -10, maxX: 10, minZ: -7, maxZ: 7, wallH: 1.25 },
  partition: { x: 2, doorFrom: -1.2, doorTo: 2.2 },     // the wall between the living room and the bedroom
  frontDoor: { x: -6, from: -7.6, to: -4.4 },           // in the south wall
  spawnHome: { x: -3, z: 0 },
  phone: { x: -8.2, z: -5.6 },
  desk: { x: -1, z: -5.6 },                              // your ant farm is on it
  dresser: { x: 8.6, z: 3.2 },
  bed: { x: 6.5, z: -3.8 },
  suitcase: { x: 4.6, z: 1.4 },
  couch: { x: -4.5, z: 2.6 },
  // --- 🏝️ The island ----------------------------------------------------------
  land: { x: 0, z: -30, rx: 62, rz: 80 },
  strip: { z: 30, from: -46, to: 46, w: 9 },
  plane: { x: -4, z: 30, scale: 1.35 },
  rae: { x: 4.4, z: 27.6 },                   // by the engine (before)
  raeHurt: { x: 0.8, z: 22.6 },               // sitting on a crate (after)
  radio: { x: -6.5, z: 26.4 },                // by the plane's door
  fuelDrop: { x: 4.5, z: 25.6 },
  spawnIsland: { x: -1, z: 24.5 },
  campfire: { x: 4.2, z: 18.6 },
  bench: { x: -10, z: 17.4 },
  logs: { x: -20, z: 13 },
  nest: { x: -16, z: 24.5 },
  stones: { x: 9.5, z: 7.4 },                 // 🪨 on the stream bank
  saplings: { x: -15, z: 7.5 },               // 🌿 young trees to knock branches off
  ferns: { x: 18, z: 22 },                    // 🌱 plant fiber
  workshop: { x: 1.6, z: 20.3 },              // 🪓 where you bring Rae what she needs (in front of her crate)
  berries: { x: 13, z: 12 },
  stream: { z: 4, half: 1.6 },
  /** The trail: from the camp, north to the research camp. */
  trail: [[0, 18], [0, 4], [5, -14], [-3, -34], [-5, -48], [4, -66], [8, -78]] as [number, number][],
  trap: { x: -11.5, z: -46 },                 // where the little dino is pinned (beside the trail)
  research: { x: 8, z: -88, r: 15 },          // the old research camp (its clearing)
  fuelShed: { x: 20, z: -84 },
  radioShed: { x: -5, z: -84 },
  table: { x: 8, z: -86 },                    // the expedition's notebook
  rexFrom: { x: 64, z: 6 },
  rexAt: { x: 13, z: 28 },
  rexTo: { x: 72, z: -24 },
};

/** How fast things go. */
export const T = {
  waterSecs: 210,      // full -> empty, while you're out and about on the island (v0.66: was 150)
  thirsty: 35,         // the warning (%)
  hurtSecs: 26,        // full health -> passing out, once your water is empty
  drink: 45,           // % a second, standing in the stream
  logPile: 8,          // logs the fallen trees hold
  logRegrow: 2.6,      // seconds per log
  berryPile: 6,
  berryRegrow: 3.5,
  campfire: 4,         // logs
  bench: 6,            // logs
  mast: 6,             // logs a radio mast takes
  mastSecs: 8,         // the workbench making it
  benchMax: 12,        // logs the workbench holds (the ant stocks it up to here)
  antFeed: 2,          // berries for the ants
  dinoFeed: 2,         // berries for the little dino
  lift: 2.4,           // seconds holding the fallen tree up
  antLogSecs: 7,       // offline: one log brought every ... (up to benchMax)
  // 🪓 v0.65: tools, ARK style
  stonePile: 4,        // stones on the stream bank
  stoneRegrow: 4,
  stoneUses: 8,        // branches a stone knocks loose before it goes dull and cracks
  branchSecs: 1.1,     // one branch every ... (with a stone)
  fiberPile: 6,
  fiberRegrow: 3,
  hatchet: { stone: 1, branch: 1, fiber: 2 }, // what Rae needs to lash a hatchet together
  carryCap: { stone: 2, branch: 2, fiber: 3, berry: 2 } as Record<string, number>, // (you only pick up this many: no full hands of branches)
  spares: { stone: 3, branch: 3, fiber: 4 },  // what Rae keeps for the next hatchet (drop leftovers on her pad)
  hatchetSecs: 5,      // Rae making it
  hatchetUses: 30,     // logs it chops before it breaks
  chopSecs: 0.8,       // one log every ... (with a hatchet)
  antChewSecs: 5,      // once your ant works: it chews a log loose from the fallen trees every ...
};

/** 📱 The phone call. */
export const CALL: Line[] = [
  { who: 'rae', text: "It's me! Remember that island I kept telling you about? The one that isn't on any map?" },
  { who: 'you', text: 'Rae. That was a story you told at a barbecue.' },
  { who: 'rae', text: "Not anymore. I found it. There's an old airstrip and everything. I'm flying out at dawn." },
  { who: 'rae', text: 'I need a second pair of hands, and you are the most stubborn pair I know.' },
  { who: 'you', text: '...How long?' },
  { who: 'rae', text: "A weekend. Pack light. And yes, you can bring your ants. I know you'll ask." },
  { who: 'note', text: 'She hangs up before you can say no. You were never going to say no.' },
];

export const PACKED: Line[] = [
  { who: 'you', text: "Clothes, check. Ant farm, check. Sorry, guys: you're coming on an adventure." },
];

/** ✈️ The landing (after the flight). */
export const LANDING: Line[] = [
  { who: 'rae', text: 'Welcome to nowhere! Told you it was real.' },
  { who: 'rae', text: "Tank's lower than I'd like, though. My old charts say the research camp up that trail stored fuel." },
  { who: 'rae', text: "Grab two cans for me while I look the engine over? It's a short walk north." },
  { who: 'you', text: 'Two cans. On it.' },
  { who: 'rae', text: "Stay on the trail, and drink at the stream if you get thirsty. It's hot out here." },
];

/** 🏚️ The research camp. */
export const CAMP: Line[] = [
  { who: 'note', text: 'Nobody has been here in years. Vines through the windows, a door hanging by one hinge.' },
  { who: 'you', text: "Whoever ran this place left in a hurry. Fuel shed's on the right." },
];

/** 📖 The first logbook page. */
export const PAGE_1 = {
  title: '📖 Field log, page 1',
  html: `<div class="logbook"><p><i>The ink is smudged, the corner chewed.</i></p>
    <p>Day 41. The herds came through early again: three weeks ahead of last year. The strip is only safe while
    they graze the north side. When they turn south, nothing lands here and nothing leaves.</p>
    <p>We're mapping the routes they take and the weeks they take them. If we get it right, a pilot could come and go
    safely, in the right windows.</p>
    <p>If we get it wrong...</p>
    <p><i>The rest of the page is torn away.</i></p></div>`,
};

/** 🦖 After the rex: running back. */
export const ROAR: Line[] = [{ who: 'you', text: 'That came from the airstrip. Rae!' }];

/** Back at the plane. */
export const RETURN: Line[] = [
  { who: 'rae', text: "I'm okay. Mostly. Ankle's done for. Don't look at the plane." },
  { who: 'you', text: "...I'm looking at the plane." },
  { who: 'rae', text: "Fuel isn't the problem anymore. That wing's matchwood, and the radio mast went with it." },
  { who: 'rae', text: 'Your ant farm was in the back. The case broke open. The ants made it, though: they ran for the tail.' },
  { who: 'rae', text: 'Sun goes down in a few hours. We need a fire and a workbench, so: wood. And there is no axe on board.' },
  { who: 'rae', text: 'So we make one. Find a sharp stone by the stream, knock a branch off a sapling with it, and pull some fiber from the ferns.' },
  { who: 'rae', text: "Bring them to me. I can't walk, but I can still tie a knot." },
];

/** 🪓 Rae makes the hatchet. */
export const HATCHET: Line[] = [
  { who: 'rae', text: 'One hatchet. Slightly wonky, fully functional. Go chop us some logs at the fallen trees, west of camp.' },
  { who: 'you', text: 'Stones wear out. I am guessing hatchets do too?' },
  { who: 'rae', text: 'Everything does, out here. When it breaks, bring me the same again and I will make another.' },
];

export const FIRE: Line[] = [
  { who: 'rae', text: 'Ahh, better. Fire means we live here now. Next: a workbench, by the fallen trees.' },
];

export const ANTS: Line[] = [
  { who: 'rae', text: 'Hey. Look by the tail. Your ants!' },
  { who: 'you', text: "They're building a nest already. Tough little things." },
  { who: 'rae', text: 'They look hungry. There are berry bushes east of the fire. Bet they work for sugar.' },
];

export const RUNNER: Line[] = [
  { who: 'note', text: 'One ant scurries off to the fallen trees, chews a chunk of deadwood loose... and drags back a log ten times its size.' },
  { who: 'you', text: "No way. You're helping?" },
  { who: 'rae', text: 'Ants work for sugar. Smart ants work for berries. Now: a radio mast. The workbench can make one.' },
];

export const MAST: Line[] = [
  { who: 'rae', text: "Mast's up. Moment of truth..." },
  { who: 'radio', text: '...' },
  { who: 'rae', text: "Nothing. The power module's fried. Of course it is." },
  { who: 'rae', text: 'The research camp had a radio shed. If there is a spare anywhere, it is in there.' },
  { who: 'rae', text: 'Fair warning: those things weigh a ton. You will not carry one alone.' },
];

export const TRAPPED: Line[] = [
  { who: 'you', text: "Hey, hey. Easy. That tree came down on you when the big one went through, didn't it?" },
];
export const FREED: Line[] = [
  { who: 'note', text: 'The little dinosaur scrambles free and backs away, trembling. It looks hungry.' },
  { who: 'you', text: "It's okay. I won't hurt you. Let me find you something to eat." },
];
export const TRUST: Line[] = [
  { who: 'note', text: 'It takes the berries from your hand, then presses its head against your arm.' },
  { who: 'you', text: "Friends? Friends. Okay. Want to help me carry something heavy?" },
];
export const SHED_ALONE: Line[] = [
  { who: 'you', text: "There it is: the radio's power module. Oof. Rae was right: I can't even lift it." },
];
export const LOADED: Line[] = [
  { who: 'note', text: 'You heave the module onto the little dino\'s back. It doesn\'t even notice the weight.' },
  { who: 'you', text: 'Good job, buddy. Back to camp. Stay close.' },
];

/** 📻 The first signal (the chapter's end). */
export const SIGNAL_1: Line[] = [
  { who: 'rae', text: "You brought a dinosaur. To camp. ...Okay. We'll talk about that later. Power module, please." },
  { who: 'rae', text: 'Power in. Mast up. This is it.' },
  { who: 'rae', text: 'Mayday, mayday. Anyone on this frequency? Two people down on an uncharted island.' },
  { who: 'radio', text: '...kssshh... read you... weak signal... say again...' },
  { who: 'rae', text: 'We are down on an island, no name on any chart. Two of us. The plane is damaged!' },
  { who: 'radio', text: '...copy... storm front... nobody flies in... window in three days... stay by the radio...' },
  { who: 'note', text: 'Then only static.' },
  { who: 'rae', text: 'Someone is out there. Someone heard us!' },
  { who: 'you', text: 'Three days. Then we had better fix that wing.' },
];
