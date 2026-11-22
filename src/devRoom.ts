// ============================================================================
// devRoom.ts — 🧪 the DEV ROOM (temporary): a performance test for the Custom
// Character Builder System's female body in this game.
//
// Joshua's idea (2026-11-14): one model in the game, loaded ONCE and cloned,
// each clone with its own body sizes and painted clothes, instead of a file per
// person. This room measures what that costs on a phone:
//
//   - the builder's own body + hair are loaded once, straight from the builder's
//     site (same server as this game, so nothing is copied into this repo);
//   - each person is a clone: the mesh and textures are shared, each one gets
//     her own skeleton, shape (morph weights, height) and outfit colours;
//   - pick how many walk around, and read the frames per second on screen. The
//     game's current (small) Sarah model is there to compare against.
//
// The people wear Joshua's first three saved looks (LOOKS below), in turn. Their
// outfits are painted on in the shader by height (about what one of the builder's
// painted garments costs to draw), not with the builder's own fabric code.
//
// Opened from ⚙️ Settings -> 🧪 DEV Room, or ?devroom=1. It never touches the
// save: main.ts hands over here before the game starts.
// ============================================================================
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Sneakers, SNEAKER_COLOURS, SNEAKER_PARTS } from './vendor/ccbs/sarahlab/sneakers';
import { ClothTest, SARAH_TEE } from './devRoomCloth';
import { VERSION } from './core/updater';
import { MeshoptSimplifier } from 'meshoptimizer/simplifier';
// The builder's own posing code (a copy: see src/vendor/ccbs/README.md): how she stands, breathes and walks
import { HumanRig } from './vendor/ccbs/HumanRigView';
import { measureHuman } from './vendor/ccbs/humanSkeleton';
import { poseHuman, humanStride } from './vendor/ccbs/humanPose';
import { walkWeight, weighWalk } from './vendor/ccbs/walkWeight';
import type { HumanMeasure, MutableJointTurn } from './vendor/ccbs/humanRig';
// The builder's heads (v0.57, a copy at its commit 6e0b67b): its hairstyles and their colours, and its face types
import { HAIR_STYLES, HAIR_LENGTH_MORPH, MALE_HAIR_STYLES } from './vendor/ccbs/sarahlab/hairStyles';
// (v0.93: his face's frame, so the face types are laid on his head as the builder lays them)
import { MALE_FACE } from './vendor/ccbs/sarahlab/maleFace';
import type { FaceFrame } from './vendor/ccbs/sarahlab/faceRig';
import { HAIR_COLOURS } from './vendor/ccbs/sarahlab/hairColours';
import { patchHairMaterial, setHairColour } from './vendor/ccbs/sarahlab/hairMaterial';
import { FACE_TYPES } from './vendor/ccbs/sarahlab/faceShapes';
import { faceFieldOn, headPoints } from './vendor/ccbs/sarahlab/faceShapeFields';
import { MOTION_TARGETS, motionWeights, restingBellySpring, stepBellySpring, stepBreastSpring, walkBounceAccel, walkSwayAccel, type BellySpring } from './vendor/ccbs/bellyMotion';

/** The builder's published models (GitHub Pages: the same origin as this game when it's live). */
// (🧪 in development, ?localccbs reads the builder's files from this server's own /_ccbs/ folder: a test machine
// that can't reach the builder's site)
const BUILDER = import.meta.env.DEV && new URLSearchParams(location.search).has('localccbs')
  ? `${import.meta.env.BASE_URL}_ccbs/`
  : 'https://capflyingfun.github.io/Custom-Character-Builder-System/models/';

/**
 * 🧍 THE CROWD, IN A GAME (v0.78). The same people as this room's, made and drawn by the same code, but standing in
 * the game's own scene: the airport's female passengers. Given a host, startDevRoom() builds no page, no camera and no
 * loop of its own; the game adds people one at a time, says how fast each is walking, and calls step() every frame.
 */
export interface CrowdHost {
  scene: THREE.Scene; camera: THREE.Camera; renderer: THREE.WebGLRenderer;
  /** Where the player's own character is (world): people are drawn out to a range from there (smart FPS, the fade). */
  focus?: () => THREE.Vector3;
}
export interface CrowdPerson {
  /** Put this in the scene and move it. She stands 2.8 units tall at scale 1 (HEIGHT), feet at its origin. */
  root: THREE.Group;
  /** How fast she is walking right now, in the game's units a second (0: standing). */
  speed: number;
  dispose(): void;
}
export interface Crowd {
  /** Her body and hair have loaded: add() gives people from now on. */
  ready: Promise<boolean>;
  /** A new woman: her belly's size in %, whether she wears the cloth tee (else a painted one), and a number she is dealt her looks from.
   *  `male` (v0.93): a man of the builder's instead (null until his body is in: see `men`). */
  add(opts: { bump: number; cloth: boolean; male?: boolean }): CrowdPerson | null;
  /** 👨 The builder's male body has loaded too (v0.93): add({ male: true }) gives men from now on. */
  readonly men: boolean;
  /** One frame: everybody's detail, pose, tee. */
  step(dt: number): void;
  /** What the room's own readout says, for the game's Settings. */
  info(): string;
}
/** A person is this tall at scale 1. */
export const CROWD_HEIGHT = 2.8;

interface ModelDef {
  key: string;
  label: string;
  files: string[];       // loaded once, then cloned per person
  builder: boolean;      // the builder's body: random shape + stand-in outfits
  /** 👨 (v0.93) the builder's MALE base model: his hairstyles, his face's frame, his looks. */
  male?: boolean;
}
const MODELS: ModelDef[] = [
  { key: 'builder', label: "Builder body", files: [BUILDER + 'sarah-v2-body-slim.glb'], builder: true }, // (her hair: one of HAIR_STYLES' light files a person, loaded beside her)
  { key: 'game', label: "Game's Sarah", files: [`${import.meta.env.BASE_URL}models/h-sarah.glb`], builder: false },
  // 👨 (v0.93; Joshua, 2026-11-22: "male models now that we can randomize") the builder's Male Base Model, his
  // hairstyles beside him (models/hair/male/: six men's cuts and her six as he wears them)
  { key: 'male', label: 'Builder man', files: [BUILDER + 'male-base.glb'], builder: true, male: true },
];
const MALE_MODEL = MODELS[2];

/**
 * WHERE THE STAND-IN CLOTHES GO ON A BODY (v0.93): heights up the body and distances out from its middle, as shares
 * of its height in its own rest pose. Hers are the numbers the room has always painted with; his are read off his file
 * (his shoulders are broader, his hands hang further out). GAME TUNING.
 */
interface PaintFit { waist: number; collar: number; armpit: number; torsoX: number; sleeveX: number; legX: number; shoe: number }
const FIT_HER: PaintFit = { waist: 0.57, collar: 0.835, armpit: 0.71, torsoX: 0.115, sleeveX: 0.2, legX: 0.125, shoe: 0.04 };
const FIT_HIM: PaintFit = { waist: 0.57, collar: 0.835, armpit: 0.71, torsoX: 0.13, sleeveX: 0.21, legX: 0.135, shoe: 0.04 };
/** How many people the room can hold (v0.49; Joshua: "a slider from 1-400 people but also where I can manually type in a specific number"). */
const MOST_PEOPLE = 400;
const HEIGHT = 2.8; // people are this tall in the game
/**
 * DETAIL (v0.29.3, Joshua's "smart LOD" idea): how much of the model's triangles are drawn, in %.
 * The model FILE is never changed: when it has loaded, a lighter triangle list is worked out here for
 * the same points (so her skeleton, her shapes and her outfit all still fit), and swapped in.
 */
const DETAILS = [100, 50, 25, 10, 5, 3, 2, 1]; // (3% of the builder body is about 9k triangles: the "under 10k" gameplay target)
const NO_MORPHS = {};
/**
 * AUTO DETAIL (v0.35; Joshua: "closer to the camera the higher %, and further away less"). The distance is
 * from the CAMERA to each person (to her middle, in 3D), so zooming in raises her detail in the top-down
 * view exactly as walking up to her does in the 👁️ view. The table is Joshua's, in metres; the game's units
 * are smaller: people are 2.8 units tall (a 1.68 m woman), so one metre is 1 / 0.6 units.
 */
const METRE = 1 / 0.6;
const AUTO = [
  // (v0.36: capped at 30%. Joshua's first table went to 100% within 3 m and 50% within 6 m: thirty times the
  // triangles of the far level, for a difference a phone screen doesn't show. He approved this one on 2026-11-14.)
  { within: 4 * METRE, detail: 30 },   // 0-4 m
  { within: 8 * METRE, detail: 20 },   // 4-8 m
  { within: 12 * METRE, detail: 10 },  // 8-12 m
  { within: 15 * METRE, detail: 5 },   // 12-15 m
  { within: Infinity, detail: 3 },     // 15 m and beyond
];
/**
 * AUTO LITE (v0.39; Joshua, after 40 people at 3% held 25-30 FPS on his phone with every shape live:
 * "0-3m = 3% + Live On / 4-8m = 2% + Live Off / >=9m = 1% + Live Off"). Everyone is light; only the few people
 * right by the camera have all 43 of their body shapes blended live, and the rest are baked as in AUTO.
 */
const AUTO_LITE: { within: number; detail: number; live?: boolean }[] = [
  // (v0.50, Joshua: "0-2m: 3% live on / 3-4: 2% live off / 5-8m: 1% live off / 9m: start fading, totally be
  // invisible at 18m". Before: 3% to 4 m, 2% to 7 m. The fading is FADE, below.)
  { within: 3 * METRE, detail: 3, live: true }, // 0-2 m (up to 3)
  { within: 5 * METRE, detail: 2 },             // 3-4 m (up to 5)
  { within: Infinity, detail: 1 },              // 5 m and beyond
];
/**
 * FADE (v0.50; Joshua, with 400 in the room: "the people kept popping in and out... need to do some gradual fade to
 * nothing... 9m: start fading, totally be invisible at 18m"). Past `start` a person is drawn with more and more of
 * her dots left out (a screen-door fade: no see-through sorting, and every dot left out is a dot not shaded), and
 * past `end` she isn't drawn at all. SMART FPS's limit on how many are drawn works through this too: it pulls both
 * distances in until that many are left, so the furthest fade out where they used to pop.
 */
// (v0.50, later the same day: "quicker fade with haze like a 5% white colored model": she is whole to 15 m, not 9,
// and as she goes she pales toward white, so she reads as far off in the haze and not as a see-through person.)
const FADE = { start: 15 * METRE, end: 18 * METRE, least: 4 * METRE, haze: 0.85 };
/** Adds the fade to a material's program: `fade.value` 1 = all of her, 0 = none. */
function fadeShader(shader: { uniforms: Record<string, unknown>; fragmentShader: string }, fade: { value: number }) {
  shader.uniforms.uFade = fade;
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform float uFade;')
    .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n{ float drDot = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))); if (drDot >= uFade) discard; }')
    // (the haze: paler the further gone she is. Her shadow's program has no such line, and is left alone)
    .replace('#include <opaque_fragment>', `#include <opaque_fragment>\ngl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0), (1.0 - uFade) * ${FADE.haze.toFixed(2)});`);
}
/** A person's own copy of one of her other materials (her hair, a flat test colour), with the fade. */
function fadedMaterial(base: THREE.Material, fade: { value: number }) {
  const m = base.clone();
  m.onBeforeCompile = (shader) => fadeShader(shader, fade);
  m.customProgramCacheKey = () => 'devroom-fade';
  m.userData.devRoomOwn = true;
  return m;
}
/**
 * AUTO LIVE (v0.44; Joshua: "an Auto Live version that goes 1-3% like the Auto Lite but works with the Live Body"):
 * Auto lite's distances and detail, with every level's shapes live.
 */
const AUTO_LIVE: { within: number; detail: number; live?: boolean }[] = AUTO_LITE.map((a) => ({ ...a, live: true }));
/** The table in use: AUTO, AUTO_LITE or AUTO_LIVE (their buttons). */
// (v0.48: the room opens on AUTO LIVE with SMART FPS on, as Joshua ran his stress tests.)
// (v0.43.1, the room's defaults, as Joshua tested them on his phone at 54-56 FPS with 40 walking and about 16 in
// view: "Set these settings as default": Auto lite, body shapes LIVE, shadows on, cloth tee off, out of view not drawn.
// With the shapes live everybody is drawn at 3% with all her shapes: Auto lite's lighter levels are baked bodies.)
// (v0.42.1: the room opens on AUTO LITE. Joshua, 2026-11-14, on his phone with 40 walking: "These settings work best")
// (v0.50: still AUTO LIVE. Joshua: "It should be Auto Live not Lite".)
let TABLE: { within: number; detail: number; live?: boolean }[] = AUTO_LIVE;
/** A person this far down the table (5% or lighter) lets go of her heaviest bodies again, to save memory. */
const AUTO_DROP_FROM = 3;
/** Cloth tees: how many are dressed at a time on their way to being frozen, and the most simulated for good. GAME TUNING. */
const CLOTH_DRESSING_AT_ONCE = 2, CLOTH_SIMULATED_AT_MOST = 6;
/** 'Cloth tee: near the camera': within this of the camera a tee is simulated (Auto lite's own live range: up to 4 m). */
const CLOTH_NEAR = 4 * METRE;
/** `faces`: the face types have been added to this mesh's shapes (once). */
interface GeoKeep { faces?: boolean; index0: THREE.BufferAttribute | null; morph0: THREE.BufferGeometry['morphAttributes']; lods: Map<string, THREE.BufferAttribute>; auto?: THREE.BufferAttribute[]; flat?: Float32Array | null; liveGeos?: Map<number, THREE.BufferGeometry> }

/**
 * JOSHUA'S FIRST THREE LOOKS, saved in the builder on 2026-11-14 (its export, traddomium-characters.json:
 * Char1, Char2, Char3). What this test takes from each: her belly size (the builder's `bump`, in %), her
 * height (cm from the standard body), and her painted outfit: which leggings and tee, and their fabric
 * colours (the builder's swatch tables, fabricLibrary.ts). Her finer body controls (waist, hips, limb
 * lengths, the belly's and bust's own shapes) and the fabrics' knit are the builder's own code, not copied
 * here: this room is about what she costs to draw.
 */
interface Look {
  name: string;
  bump: number;        // belly size, %
  navel?: number;      // the builder's NAVEL control, her body's own: -100 (deepest innie) to +100 (fullest outie)
  bustDetail?: number; // how much of her bust's fine detail shows through her tee, 0 (none) to 1 (all, as her skin has it)
  legLength?: number;  // leggings' length down her leg (the builder's legEnd): 0.25 = shorts, 0.78 = capris, 1 = to the ankle
  bust?: number;       // the builder's breast SIZE control, -100 (half the volume) to +100 (twice); 0 = as her belly gives
  heightCm: number;    // from the standard body (about 168 cm)
  top: number;         // tee colour
  legs: number;        // leggings colour
  capri: boolean;      // leggings end mid-calf (leggingsCapri) or at the ankle
  longSleeves: boolean; // teeLong or teeShort
  /** Her head (v0.57): a hairstyle of the builder's, how long (0 its shortest to 1), its colour ('#rrggbb', or null: her own copper), and her face as FACE_TYPES' weights. */
  head?: { style: string; length: number; colour: string | null; face: Record<string, number> };
  /** Her sneakers' colour (v0.84): which of SHOE_COLOURS; the builder's own navy without one. */
  shoe?: number;
  /** (the crowd in a game) her tee is painted on even where the cloth tee is worn. */
  paint?: boolean;
  /** 👨 (v0.93) a man's look: painted on his body's own fit, no belly or bust of hers. */
  male?: boolean;
}
/** The name a face type has among a mesh's shapes. */
const FACE_SHAPE = (id: string) => `faceType:${id}`;
/**
 * HER HAIR'S MATERIAL: her own copy of the file's, with the builder's two patches (its cards lit as one lock from both
 * sides; its strands drawn in her colour), and the room's fade after them.
 */
function hairMaterialFor(base: THREE.Material, colour: string | null, fade?: { value: number }) {
  const m = base.clone();
  patchHairMaterial(m);
  setHairColour(m, colour);
  if (fade) {
    const before = m.onBeforeCompile, key = m.customProgramCacheKey;
    m.onBeforeCompile = function (shader, renderer) { before.call(this, shader, renderer); fadeShader(shader, fade); };
    m.customProgramCacheKey = function () { return `${key.call(this)}|devroom-fade`; };
  }
  m.userData.devRoomOwn = true;
  return m;
}
/**
 * THE FACE TYPES AS SHAPES (v0.57). The builder shapes a face on the CPU from 21 sliders, each a smooth field in space
 * (faceShapes.ts). A crowd can't afford that per person, so each of its seven named faces (oval, round, heart...) is
 * worked out ONCE for a mesh's own points, as one more of its shapes beside the belly's and the bust's: a person's face
 * is then a weight or two, blended like the rest of her. Her hair gets the same seven, so her hairline stays on her head.
 */
function addFaceTypes(mesh: THREE.Mesh, morph0: THREE.BufferGeometry['morphAttributes'], frame?: FaceFrame) {
  const g = mesh.geometry, pos = g.attributes.position, nrm = g.attributes.normal, n = pos.count;
  const basePos = new Float32Array(n * 3);
  for (let v = 0; v < n; v++) { basePos[v * 3] = pos.getX(v); basePos[v * 3 + 1] = pos.getY(v); basePos[v * 3 + 2] = pos.getZ(v); }
  // (normals too only where the mesh's other shapes carry them: three wants as many of one as of the other)
  const withNormals = !!nrm && !!(morph0.normal?.length || !morph0.position?.length);
  let baseNrm: Float32Array | null = null;
  if (withNormals) { baseNrm = new Float32Array(n * 3); for (let v = 0; v < n; v++) { baseNrm[v * 3] = nrm.getX(v); baseNrm[v * 3 + 1] = nrm.getY(v); baseNrm[v * 3 + 2] = nrm.getZ(v); } }
  const points = headPoints(basePos, frame);
  const fields = new Map<string, ReturnType<typeof faceFieldOn>>();
  const positions = (morph0.position ??= []), normals = withNormals ? (morph0.normal ??= []) : null;
  const dict = (mesh.morphTargetDictionary ??= {}), influences = (mesh.morphTargetInfluences ??= []);
  for (const type of FACE_TYPES) {
    const dp = new Float32Array(n * 3), dn = withNormals ? new Float32Array(n * 3) : null;
    for (const [slider, w] of Object.entries(type.look)) {
      let f = fields.get(slider);
      if (!f) fields.set(slider, (f = faceFieldOn(slider, basePos, baseNrm, points, frame)));
      for (let k = 0; k < f.index.length; k++) {
        const v = f.index[k] * 3;
        for (let c = 0; c < 3; c++) { dp[v + c] += f.pos[k * 3 + c] * w; if (dn && f.nrm) dn[v + c] += f.nrm[k * 3 + c] * w; }
      }
    }
    dict[FACE_SHAPE(type.id)] = positions.length;
    positions.push(new THREE.BufferAttribute(dp, 3));
    if (normals && dn) normals.push(new THREE.BufferAttribute(dn, 3));
    influences.push(0);
  }
  g.morphTargetsRelative = true;
}
const LOOKS: Look[] = [
  { name: 'Char1', bump: 23, heightCm: 3.5, top: 0x4e642e, legs: 0x37383e, capri: false, longSleeves: false, navel: 47, bustDetail: 0.45 },  // jersey: olive tee, charcoal leggings
  { name: 'Char2', bump: 21, heightCm: -7, top: 0x9c9ca3, legs: 0x1631bc, capri: false, longSleeves: false, navel: 47, bustDetail: 0.45 },   // ribbed: grey tee, blue leggings
  { name: 'Char3', bump: 5, heightCm: -6.5, top: 0xeec415, legs: 0x0b7e3a, capri: true, longSleeves: true, navel: 47, bustDetail: 0.45, legLength: 0.78 },    // sweater: yellow long tee, green capris (navel 47 and detail 0.45 are this look's own, used for all three)
];
/** The standard body with the stand-in outfit ("Looks: off"). */
const PLAIN: Look = { name: 'Base', bump: 0, heightCm: 0, top: 0xd8473f, legs: 0x33343f, capri: false, longSleeves: false };
const STANDARD_CM = 168;
const SNEAKERS = 0xf2f2f2;
/**
 * 👟 HER SNEAKERS (v0.84; Joshua, of the painted white feet in random colours: "the shoes you have appear fixed and
 * not the shoes that are already enabled in the CCBS room"). The Character Builder's own pair (vendor/ccbs/sarahlab/
 * sneakers.ts: built round her foot, carried by her foot's bones), in these colours for the upper: the builder's
 * dusty navy first, then a wardrobe's worth. The midsole stays the builder's white. GAME TUNING.
 */
const SHOE_COLOURS = [SNEAKER_COLOURS.upper, 0x26262b, 0xf0f0f0, 0x8d9096, 0xc23b3b, 0xe0709f, 0x1f8a99, 0x3f8f4a, 0x6f3fa3, 0xe08a2a, 0xe2c23a, 0x6fb1e0];
/**
 * How much of the builder's sneakers' triangles a crowd's pair keeps. MEASURED: the builder's pair is 33,884
 * triangles, and a whole woman at the 1% she is drawn at from the game's camera (some 15 of her metres off) is
 * about 2,000. A pair is a few millimetres of a phone's screen there.
 */
const SHOE_DETAIL = 0.03;
interface CrowdShoes { geos: THREE.BufferGeometry[]; material: THREE.MeshStandardMaterial; triangles: number }
/**
 * The pair, made ONCE for everybody: the builder's two shoes built on the body file's own skin, joined into one
 * mesh with one material (a part's colour is in its points: the builder's seven materials would be fourteen draw
 * calls a woman), lightened, and given one colouring for each of SHOE_COLOURS over the same points.
 */
function makeCrowdShoes(template: THREE.SkinnedMesh, modelRoot: THREE.Object3D, ankles: number[]): CrowdShoes {
  modelRoot.updateWorldMatrix(true, true);
  const sk = template.skeleton;
  // (the builder's restOfMesh: her mesh's own units to her rest frame, +y up, as her bones were bound)
  const skinned = new THREE.Matrix4().copy(template.bindMatrixInverse).multiply(sk.bones[0].matrixWorld).multiply(sk.boneInverses[0]).multiply(template.bindMatrix);
  const toRest = new THREE.Matrix4().copy(modelRoot.matrixWorld).invert().multiply(template.matrixWorld).multiply(skinned);
  const P = template.geometry.getAttribute('position'), basePos = new Float32Array(P.count * 3);
  for (let i = 0; i < P.count; i++) { basePos[3 * i] = P.getX(i); basePos[3 * i + 1] = P.getY(i); basePos[3 * i + 2] = P.getZ(i); }
  const pair = new Sneakers(template, basePos, toRest, ankles);
  // each point's part (its material's group) and, on the knit, how dark its overlay is: read back from the builder's tint
  const navy = new THREE.Color(SNEAKER_COLOURS.upper), over = new THREE.Color(SNEAKER_COLOURS.overlay);
  const parts: number[] = [], shades: number[] = [];
  const singles = pair.meshes.map((mesh) => {
    const g = mesh.geometry, n = g.getAttribute('position').count, part = new Uint8Array(n), index = g.index!, col = g.getAttribute('color');
    for (const gr of g.groups) for (let k = gr.start; k < gr.start + gr.count; k++) part[index.getX(k)] = gr.materialIndex ?? 0;
    for (let i = 0; i < n; i++) { parts.push(part[i]); shades.push(THREE.MathUtils.clamp((col.getX(i) - navy.r) / (over.r - navy.r || 1), 0, 1)); }
    const one = g.clone();
    one.clearGroups();
    return one;
  });
  const joined = mergeGeometries(singles, false);
  for (const g of singles) g.dispose();
  pair.dispose(); // (the builder's own two meshes, off the body file again)
  // lighter: the same points, fewer triangles between them
  let index = joined.index!.array as Uint32Array;
  const full = index.length / 3;
  try {
    const target = Math.floor((index.length * SHOE_DETAIL) / 3) * 3;
    const [lighter] = MeshoptSimplifier.simplify(new Uint32Array(index), joined.getAttribute('position').array as Float32Array, 3, target, 0.5);
    if (lighter.length >= 300) index = lighter;
  } catch (e) { console.warn('[devroom] her sneakers are left whole', e); }
  const n = parts.length, idOf = (name: string) => SNEAKER_PARTS.indexOf(name as typeof SNEAKER_PARTS[number]);
  const upper = idOf('upper'), tongue = idOf('tongue'), laces = idOf('laces'), collar = idOf('collar'), midsole = idOf('midsole'), outsole = idOf('outsole');
  const c = new THREE.Color(), dark = new THREE.Color();
  const geos = SHOE_COLOURS.map((hex) => {
    const colour = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const part = parts[i];
      if (part === upper || part === tongue) c.set(hex).lerp(dark.set(hex).multiplyScalar(0.7), shades[i]);
      else if (part === laces) c.set(hex).multiplyScalar(0.55);
      else if (part === collar) c.set(hex).multiplyScalar(0.72);
      else if (part === midsole) c.set(SNEAKER_COLOURS.midsole);
      else if (part === outsole) c.set(SNEAKER_COLOURS.outsole);
      else c.set(SNEAKER_COLOURS.label);
      c.toArray(colour, 3 * i);
    }
    const g = new THREE.BufferGeometry();
    for (const name of ['position', 'normal', 'uv', 'skinIndex', 'skinWeight']) g.setAttribute(name, joined.getAttribute(name));
    g.setAttribute('color', new THREE.BufferAttribute(colour, 3));
    g.setIndex(new THREE.BufferAttribute(index, 1));
    g.userData.devRoomShared = true;
    return g;
  });
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0, side: THREE.DoubleSide });
  console.info(`[devroom] sneakers: ${full} triangles a pair as the builder makes them, ${index.length / 3} in the crowd`);
  return { geos, material, triangles: index.length / 3 };
}

/**
 * The builder's belly sizes (its sarahLabTool.ts BELLY_KEYS): the file itself is the 100%
 * belly, each named morph is that belly at another size ('belly' = flat, 0%), and a size in
 * between cross-fades the two keys either side of it.
 */
const BELLY_KEYS: [number, string | null][] = [
  [2, 'belly200'], [1.5, 'belly150'], [1, null], [0.75, 'belly75'], [0.6, 'belly60'], [0.5, 'belly50'], [0.3, 'belly30'], [0.25, 'belly25'], [0, 'belly'],
];
function bellyWeights(size: number): Record<string, number> {
  const s = Math.min(2, Math.max(0, size));
  const out: Record<string, number> = {};
  for (let i = 0; i + 1 < BELLY_KEYS.length; i++) {
    const [hi, hiName] = BELLY_KEYS[i];
    const [lo, loName] = BELLY_KEYS[i + 1];
    if (s > hi || s < lo) continue;
    const k = (s - lo) / (hi - lo);
    if (hiName) out[hiName] = k;
    if (loName) out[loName] = 1 - k;
    break;
  }
  return out;
}

/** The builder's bust for a belly size (its breastVolumeRatio / breastGrowWeight): it grows a little with the belly. */
/**
 * ...and its SIZE control on top (its bustVolume / breastGrowUnits): +100 is twice the volume of her own
 * 0% bust, -100 is half, whatever her belly. Up to 1.55x is the 'breastGrow' shape; the rest of the way to
 * 2.0x is 'shape:breastGrowMore'. Under 1x, 'breastGrow' runs backwards.
 */
function bustWeights(bumpPercent: number, sizePercent = 0): Record<string, number> {
  const p = Math.min(200, Math.max(0, bumpPercent));
  const base = p <= 100 ? 1 + (0.3 * p) / 100 : 1.3 + (0.25 * (p - 100)) / 100;
  const size = Math.min(100, Math.max(-100, sizePercent));
  const volume = base + ((size >= 0 ? 2.0 : 0.5) - base) * (Math.abs(size) / 100);
  const units = (Math.cbrt(volume) - 1) / (Math.cbrt(1.55) - 1);
  return { breastGrow: Math.min(1, units), 'shape:breastGrowMore': Math.max(0, units - 1) };
}

const hooks: { tweak: ((look: Look, i: number) => Look) | null } = { tweak: null };

/** The bust's size against her own 0% bust, as a length (the cube root of its volume): the builder's bustScale. */
function bustLinear(bumpPercent: number, sizePercent = 0) {
  const p = Math.min(200, Math.max(0, bumpPercent));
  const base = p <= 100 ? 1 + (0.3 * p) / 100 : 1.3 + (0.25 * (p - 100)) / 100;
  const size = Math.min(100, Math.max(-100, sizePercent));
  return Math.cbrt(base + ((size >= 0 ? 2.0 : 0.5) - base) * (Math.abs(size) / 100));
}

/**
 * The builder's NAVEL control (its navelFlatFor): the weight of her 'navelFlat' shape. Her outie is modelled
 * into the file; 'navelFlat' settles it into an ordinary navel (fully on up to a 75% belly, eased off by 100%).
 * The control slides her from there: -100 the deepest innie, +100 the fullest outie.
 */
function navelFlatFor(bumpPercent: number, navelPercent: number) {
  const p = Math.min(200, Math.max(0, bumpPercent));
  const t = Math.min(1, Math.max(0, (p - 75) / 25));
  const auto = t * t * (3 - 2 * t); // how far out her pregnancy alone puts it
  const n = Math.min(100, Math.max(-100, navelPercent)) / 100;
  const outie = n < 0 ? auto + n * (auto + 0.6) : auto + n * (1 + 0.3 - auto);
  return 1 - outie;
}

/**
 * HER BUST UNDER A TEE (v0.38). Her clothes here are paint on her skin, so every bit of her skin's relief shows
 * through them. The builder has a BREAST DETAIL setting for how much a fabric lets through; this is the DEV
 * Room's stand-in for it: worked out once per model, how far each point at the tip of each breast would move
 * (and its surface direction turn) if that small raised patch were laid level with the curve round it, as
 * cloth lying across it would. A character takes (1 - her detail) of it in her painted material.
 *
 * The tip is found without any markings on the model: among the points her 'breastGrow' shape moves, the one
 * furthest forward on each side, then (three times) the one standing furthest out along the way the surface
 * round it faces. Measured on Sarah v2: the raised patch is about 2.5 cm across the surface from its tip and
 * stands 6 mm proud of the curve of the breast.
 *
 * The curve it is laid level with is the breast's own: a curved sheet (heights as a quadratic of position)
 * fitted to the ring of skin just outside the patch. So she keeps her shape; only the patch goes.
 */
function bustSmoothing(g: THREE.BufferGeometry, keep: GeoKeep, dict: Record<string, number>, box: THREE.Box3): Float32Array | null {
  const pos = g.attributes.position as THREE.BufferAttribute, nor = g.attributes.normal as THREE.BufferAttribute | undefined;
  const grow = (keep.morph0.position as THREE.BufferAttribute[] | undefined)?.[dict.breastGrow];
  const index = keep.index0;
  if (!nor || !grow || !index) return null;
  const n = pos.count;
  const H = box.max.y - box.min.y, cx = (box.min.x + box.max.x) / 2;
  const R = 0.017 * H, FULL = 0.0135 * H, RING = 0.025 * H; // the patch; where it is wholly levelled; the ring fitted to
  const P = new Float32Array(n * 3);
  for (let v = 0; v < n; v++) { P[v * 3] = pos.getX(v); P[v * 3 + 1] = pos.getY(v); P[v * 3 + 2] = pos.getZ(v); }
  let most = 0;
  for (let v = 0; v < n; v++) most = Math.max(most, Math.hypot(grow.getX(v), grow.getY(v), grow.getZ(v)));
  const S = P.slice();                      // her points with the two patches levelled
  const amount = new Float32Array(n);       // how much of the levelling each point took, 0 to 1
  const face = new THREE.Vector3(), u = new THREE.Vector3(), w = new THREE.Vector3(), T = new THREE.Vector3(), d = new THREE.Vector3();
  for (const side of [0, 1]) {
    let tip = -1;
    for (let v = 0; v < n; v++) {
      if ((P[v * 3] > cx ? 0 : 1) !== side || Math.hypot(grow.getX(v), grow.getY(v), grow.getZ(v)) < most * 0.3) continue;
      if (tip < 0 || P[v * 3 + 2] > P[tip * 3 + 2]) tip = v;
    }
    if (tip < 0) return null;
    let near: number[] = [];
    for (let pass = 0; pass < 3; pass++) {
      T.set(P[tip * 3], P[tip * 3 + 1], P[tip * 3 + 2]);
      near = [];
      face.set(0, 0, 0);
      for (let v = 0; v < n; v++) {
        if (Math.hypot(P[v * 3] - T.x, P[v * 3 + 1] - T.y, P[v * 3 + 2] - T.z) > 0.03 * H) continue;
        near.push(v);
        face.add(d.set(nor.getX(v), nor.getY(v), nor.getZ(v)).normalize());
      }
      face.normalize();
      let best = -Infinity;
      for (const v of near) { const out = P[v * 3] * face.x + P[v * 3 + 1] * face.y + P[v * 3 + 2] * face.z; if (out > best) { best = out; tip = v; } }
    }
    T.set(P[tip * 3], P[tip * 3 + 1], P[tip * 3 + 2]);
    u.set(0, 1, 0).cross(face).normalize();
    w.copy(face).cross(u);
    // Each nearby point as (across, up, height) from the tip; the sheet fitted to the ring by least squares
    const A = Array.from({ length: 6 }, () => new Float64Array(7));
    const local = near.map((v) => { d.set(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]).sub(T); return [d.dot(u), d.dot(w), d.dot(face)]; });
    local.forEach(([x, y, h]) => {
      const r = Math.hypot(x, y);
      if (r < R || r > RING) return;
      const row = [1, x / H, y / H, (x * x) / (H * H), (x * y) / (H * H), (y * y) / (H * H)];
      for (let i = 0; i < 6; i++) { for (let j = 0; j < 6; j++) A[i][j] += row[i] * row[j]; A[i][6] += row[i] * (h / H); }
    });
    for (let i = 0; i < 6; i++) {
      let piv = i;
      for (let k = i + 1; k < 6; k++) if (Math.abs(A[k][i]) > Math.abs(A[piv][i])) piv = k;
      [A[i], A[piv]] = [A[piv], A[i]];
      if (Math.abs(A[i][i]) < 1e-12) return null;
      for (let k = 0; k < 6; k++) {
        if (k === i) continue;
        const f = A[k][i] / A[i][i];
        for (let j = i; j < 7; j++) A[k][j] -= f * A[i][j];
      }
    }
    const c = A.map((row, i) => row[6] / row[i]);
    near.forEach((v, k) => {
      const [x, y, h] = local[k];
      const r = Math.hypot(x, y);
      if (r >= R) return;
      const t = Math.min(1, (R - r) / (R - FULL));
      const a = t * t * (3 - 2 * t);
      const sheet = (c[0] + (c[1] * x) / H + (c[2] * y) / H + (c[3] * x * x) / (H * H) + (c[4] * x * y) / (H * H) + (c[5] * y * y) / (H * H)) * H;
      const lift = (sheet - h) * a;
      amount[v] = a;
      S[v * 3] += face.x * lift; S[v * 3 + 1] += face.y * lift; S[v * 3 + 2] += face.z * lift;
    });
  }
  // The levelled patches' own surface directions, from their triangles (points in the same place share one)
  const place = new Map<string, THREE.Vector3>();
  const key = (v: number) => `${Math.round(P[v * 3] * 1e5)},${Math.round(P[v * 3 + 1] * 1e5)},${Math.round(P[v * 3 + 2] * 1e5)}`;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const ix = index.array;
  for (let t = 0; t < ix.length; t += 3) {
    const i0 = ix[t], i1 = ix[t + 1], i2 = ix[t + 2];
    if (!amount[i0] && !amount[i1] && !amount[i2]) continue;
    a.set(S[i0 * 3], S[i0 * 3 + 1], S[i0 * 3 + 2]); b.set(S[i1 * 3], S[i1 * 3 + 1], S[i1 * 3 + 2]); c.set(S[i2 * 3], S[i2 * 3 + 1], S[i2 * 3 + 2]);
    b.sub(a); c.sub(a); b.cross(c);
    for (const v of [i0, i1, i2]) {
      if (!amount[v]) continue;
      const k = key(v);
      let acc = place.get(k);
      if (!acc) place.set(k, (acc = new THREE.Vector3()));
      acc.add(b);
    }
  }
  // What each patch point moves by, and its direction turns by: [dx, dy, dz, dnx, dny, dnz] per point
  const flat = new Float32Array(n * 6);
  for (let v = 0; v < n; v++) {
    if (!amount[v]) continue;
    flat[v * 6] = S[v * 3] - P[v * 3]; flat[v * 6 + 1] = S[v * 3 + 1] - P[v * 3 + 1]; flat[v * 6 + 2] = S[v * 3 + 2] - P[v * 3 + 2];
    const dir = place.get(key(v));
    if (!dir || dir.lengthSq() === 0) continue;
    const len = dir.length(), ol = Math.hypot(nor.getX(v), nor.getY(v), nor.getZ(v)) || 1;
    const turn = Math.min(1, amount[v] * 4); // (eased in at the rim, where her own smooth directions are the better ones)
    flat[v * 6 + 3] = (dir.x / len - nor.getX(v) / ol) * turn * ol; flat[v * 6 + 4] = (dir.y / len - nor.getY(v) / ol) * turn * ol; flat[v * 6 + 5] = (dir.z / len - nor.getZ(v) / ol) * turn * ol;
  }
  return flat;
}

/**
 * A RANDOM LOOK (v0.37; Joshua, 2026-11-14: "randomize the belly size from 0-50%, the breast size (-100 to +100),
 * and the shirt and leggings colors"). The same person number gets the same look every time; SHUFFLE deals
 * everyone a new one. Her height, sleeves and leggings' length vary too.
 */
function randomLook(i: number, seed: number): Look {
  const r = rng(90001 + i * 7919 + seed * 104729);
  // (a pale orange or peach tee reads as bare skin from any distance: in that part of the colour wheel only
  // strong, darker colours are dealt, a real red or a burnt orange)
  const color = (h: number, sat: number, light: number) => {
    const skinLike = h < 0.15 || h > 0.94;
    return new THREE.Color().setHSL(h, skinLike ? Math.max(sat, 0.72) : sat, skinLike ? Math.min(light, 0.46) : light).getHex();
  };
  // Tees: any colour, from soft to bright. Leggings: half of them dark neutrals, the rest a deeper colour
  const top = color(r(), 0.35 + r() * 0.45, 0.42 + r() * 0.3);
  const legs = r() < 0.5 ? color(r(), 0.05 + r() * 0.12, 0.14 + r() * 0.2) : color(r(), 0.45 + r() * 0.4, 0.22 + r() * 0.2);
  return {
    name: `Random ${i + 1}`,
    bump: Math.round(r() * 50),
    bust: Math.round(-100 + r() * 200),
    heightCm: Math.round((-9 + r() * 18) * 2) / 2,
    top, legs,
    capri: false,
    // (v0.38; Joshua: "leggings leg length from 0.25 (shorts) to 1.00, breast details through clothing between
    // 0-30%, navel 35-45%: not through clothing but actual depth")
    legLength: Math.round((0.25 + r() * 0.75) * 100) / 100,
    bustDetail: Math.round(r() * 30) / 100,
    navel: Math.round(35 + r() * 10),
    longSleeves: r() < 0.4,
    // (v0.57: her head. Drawn last, so everything above is as it was for the same person.)
    head: randomHead(r),
    // (v0.84: her sneakers' colour, one of SHOE_COLOURS. Drawn after her head, so she is otherwise who she was.)
    shoe: Math.min(SHOE_COLOURS.length - 1, Math.floor(r() * SHOE_COLOURS.length)),
  };
}
/**
 * A random head: any of the builder's hairstyles at any length; a natural hair colour nine times in ten (the darker
 * ones a little more often), a dyed one the tenth; and a face that is mostly one of the builder's types, sometimes
 * with a little of a second.
 */
function randomHead(r: () => number): NonNullable<Look['head']> {
  const pick = <T,>(list: readonly T[]) => list[Math.min(list.length - 1, Math.floor(r() * list.length))];
  // (v0.83.1: not strawberry blonde. It is her skin's own tone, and from the game's height a woman with it in a bun
  // or cut short read as bald: Joshua, of one in a picture, "It looks like this one is bald, lol")
  const natural = HAIR_COLOURS.slice(0, 12).filter((c) => c.id !== 'strawberry-blonde'), dyed = HAIR_COLOURS.slice(12);
  const colour = r() < 0.9 ? (r() < 0.35 ? pick(natural.slice(0, 4)) : pick(natural)) : pick(dyed.length ? dyed : natural);
  const face: Record<string, number> = { [pick(FACE_TYPES).id]: Math.round((0.5 + r() * 0.5) * 100) / 100 };
  if (r() < 0.35) { const second = pick(FACE_TYPES).id; if (!(second in face)) face[second] = Math.round((0.2 + r() * 0.3) * 100) / 100; }
  return { style: pick(HAIR_STYLES).id, length: Math.round(r() * 100) / 100, colour: colour.colour, face };
}

/** 👨 The men's hairstyles in the crowd (v0.93.1): his short cuts only, no man bun and none of her long styles (only
 *  these are downloaded). */
const MEN_HAIR = MALE_HAIR_STYLES.filter((s) => ['crew', 'buzz', 'side-part', 'slicked-back', 'curly-top'].includes(s.id));

/**
 * 👨 A RANDOM MAN (v0.93): a tee in any colour over shorts or trousers (half of them dark neutrals), long sleeves now
 * and then, 170 to 188 cm tall, one of his short cuts (MEN_HAIR) in black or dark brown, a face type, and sneakers. His own random numbers (the women's are dealt as they always were).
 */
function randomManLook(i: number, seed: number): Look {
  const r = rng(70003 + i * 6007 + seed * 104729);
  const pick = <T,>(list: readonly T[]) => list[Math.min(list.length - 1, Math.floor(r() * list.length))];
  const color = (h: number, sat: number, light: number) => {
    const skinLike = h < 0.15 || h > 0.94;
    return new THREE.Color().setHSL(h, skinLike ? Math.max(sat, 0.72) : sat, skinLike ? Math.min(light, 0.46) : light).getHex();
  };
  const top = color(r(), 0.3 + r() * 0.45, 0.3 + r() * 0.38);
  // (his trousers: dark neutrals half the time, then denim, khaki, and now and then a colour)
  const lr = r();
  const legs = lr < 0.5 ? color(r(), 0.04 + r() * 0.1, 0.12 + r() * 0.2)
    : lr < 0.75 ? color(0.6 + r() * 0.04, 0.35 + r() * 0.25, 0.2 + r() * 0.2)
      : lr < 0.9 ? color(0.1 + r() * 0.03, 0.25 + r() * 0.2, 0.42 + r() * 0.16)
        : color(r(), 0.35 + r() * 0.35, 0.22 + r() * 0.18);
  // (shorts a third of the time, else trousers to the ankle)
  const legLength = r() < 0.35 ? Math.round((0.22 + r() * 0.15) * 100) / 100 : 1;
  const longSleeves = r() < 0.3;
  const heightCm = Math.round((2 + r() * 18) * 2) / 2;
  // (v0.93.1, Joshua: "make all the men for now with dark brown or black hair, and also not do long hair at the
  // moment… it's hard to tell the male from female if they have similar looks": his six men's cuts only, black or
  // dark brown. The r() calls are kept as they were, so each man is otherwise who he was.)
  const style = (r(), pick(MEN_HAIR));
  r(); r(); r();
  const colour = HAIR_COLOURS.find((c) => c.id === (r() < 0.5 ? 'black' : 'dark-brown')) ?? HAIR_COLOURS[0];
  const face: Record<string, number> = { [pick(FACE_TYPES).id]: Math.round((0.5 + r() * 0.5) * 100) / 100 };
  // (his short cuts near their full length, so a crew cut stays a crew cut)
  const length = Math.round((0.6 + r() * 0.4) * 100) / 100;
  return {
    name: `Man ${i + 1}`, male: true, bump: 0, bust: 0, bustDetail: 1, navel: 0, heightCm, top, legs, capri: false, legLength, longSleeves,
    head: { style: style.id, length, colour: colour.colour, face },
    shoe: Math.min(SHOE_COLOURS.length - 1, Math.floor(r() * SHOE_COLOURS.length)),
  };
}

/**
 * EACH OF A POINT'S VALUES IN AN ARRAY OF ITS OWN (v0.93). His file keeps a point's place, facing, picture spot, bones
 * and weights packed together, 52 bytes a point; hers is stored a value to an array. The room reads `attribute.array`
 * by `point * itemSize` when it bakes a person's lighter body, which on his packed data read other values: his body
 * came apart in spikes. So a packed attribute is unpacked once, as the file is read.
 */
function deinterleave(root: THREE.Object3D) {
  root.traverse((o) => {
    const g = (o as THREE.Mesh).geometry;
    if (!g) return;
    const fix = (a: THREE.BufferAttribute | THREE.InterleavedBufferAttribute) => {
      if (!(a as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute) return a;
      const ia = a as THREE.InterleavedBufferAttribute;
      const Arr = ia.data.array.constructor as new (n: number) => THREE.TypedArray;
      const out = new Arr(ia.count * ia.itemSize);
      for (let i = 0; i < ia.count; i++) for (let c = 0; c < ia.itemSize; c++) out[i * ia.itemSize + c] = ia.getComponent(i, c);
      return new THREE.BufferAttribute(out, ia.itemSize, ia.normalized);
    };
    for (const name of Object.keys(g.attributes)) g.setAttribute(name, fix(g.attributes[name]) as THREE.BufferAttribute);
    for (const kind of Object.keys(g.morphAttributes)) g.morphAttributes[kind] = g.morphAttributes[kind].map((m) => fix(m) as THREE.BufferAttribute);
  });
}

/** A small seeded random (the same person looks the same every time). */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Stand-in painted clothes: the skin's own material, with a top and leggings
 * mixed over it by where each point of her is in her rest pose (height up her
 * body, distance from her middle). One compiled program for everyone; each
 * clone has its own two colours.
 */
function paintedMaterial(base: THREE.Material, box: THREE.Box3, look: Look, fine = true, fade?: { value: number }, fit: PaintFit = FIT_HER) {
  const m = base.clone();
  // (her skin's bump detail is drawn from a second picture, the normal map. On a much lighter body the
  // picture no longer lines up with the big triangles, and it shows as dark blotches on her face: off below 25%)
  if (!fine) (m as THREE.MeshStandardMaterial).normalMap = null;
  const uniforms = {
    uTop: { value: new THREE.Color(look.top) },
    uLegs: { value: new THREE.Color(look.legs) },
    uShoe: { value: new THREE.Color(SHOE_COLOURS[look.shoe ?? 0] ?? SNEAKERS) }, // (under her sneakers, and in their place far off)
    uLegEnd: { value: look.legLength !== undefined ? fit.waist - Math.min(1, Math.max(0.1, look.legLength)) * (fit.waist - fit.shoe) : look.capri ? 0.17 : 0.04 },      // where the leggings end (height up her body)
    uSleeveEnd: { value: look.longSleeves ? fit.waist - 0.01 : fit.armpit }, // where the sleeves end
    // (v0.93: where each piece goes on this body: FIT_HER, or his)
    uWaist: { value: fit.waist }, uCollar: { value: fit.collar }, uArmpit: { value: fit.armpit },
    uTorsoX: { value: fit.torsoX }, uSleeveX: { value: fit.sleeveX }, uLegX: { value: fit.legX }, uShoeY: { value: fit.shoe },
    uY0: { value: box.min.y },
    uH: { value: box.max.y - box.min.y },
    // (how much of the levelling of her bust's tips she takes under her tee: all of it at 0 detail; the patch
    // grows with her bust. Done here, on the graphics chip, as the builder does it, so it holds for a live body
    // as for a baked one: v0.39.1, Joshua: "I play it live in the CCBS room with no issues")
    uSoften: { value: (1 - Math.min(1, Math.max(0, look.bustDetail ?? 1))) * bustLinear(look.bump, look.bust ?? 0) },
  };
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vRest;\nuniform float uY0;\nuniform float uH;\nuniform float uSoften;\nattribute vec3 softPos;\nattribute vec3 softNrm;')
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nobjectNormal += softNrm * uSoften;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += softPos * uSoften;\nvRest = vec2(abs(position.x) / uH, (position.y - uY0) / uH);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vRest;\nuniform vec3 uTop;\nuniform vec3 uLegs;\nuniform vec3 uShoe;\nuniform float uLegEnd;\nuniform float uSleeveEnd;\nuniform float uWaist;\nuniform float uCollar;\nuniform float uArmpit;\nuniform float uTorsoX;\nuniform float uSleeveX;\nuniform float uLegX;\nuniform float uShoeY;\nfloat drCloth = 0.0;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          // leggings: waist down to their hem. tee: waist to collar, with its sleeves. sneakers.
          float legs = step(uLegEnd, vRest.y) * step(vRest.y, uWaist) * step(vRest.x, uLegX); // (her hands hang further out than her hips)
          float torso = step(uWaist - 0.02, vRest.y) * step(vRest.y, uCollar) * step(vRest.x, uTorsoX);
          // (below her shoulder, only what is out at her arm is sleeve)
          float sleeve = step(uSleeveEnd, vRest.y) * step(vRest.y, uCollar) * step(vRest.x, uSleeveX) * max(step(uArmpit, vRest.y), step(uTorsoX, vRest.x));
          float topMask = max(torso, sleeve);
          float shoe = step(vRest.y, uShoeY);
          diffuseColor.rgb = mix(diffuseColor.rgb, uLegs, legs * (1.0 - topMask));
          diffuseColor.rgb = mix(diffuseColor.rgb, uTop, topMask);
          diffuseColor.rgb = mix(diffuseColor.rgb, uShoe, shoe);
          drCloth = max(max(legs, topMask), shoe);
        }`,
      )
      // (cloth is smooth: her skin's fine detail isn't drawn through it, as under the builder's paint)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize(mix(normal, nonPerturbedNormal, drCloth));')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.85, drCloth);');
    if (fade) fadeShader(shader, fade);
  };
  m.customProgramCacheKey = () => (fine ? 'devroom-painted-v2' : 'devroom-painted-plain-v2') + (fade ? '-fade' : '');
  m.userData.devRoomOwn = true;
  return m;
}

/** One of a person's meshes under AUTO detail: its baked body per level (made when first needed), its two materials. */
interface MorphSet { dict: Record<string, number>; influences: number[] }
interface PersonLod {
  mesh: THREE.Mesh; geos: (THREE.BufferGeometry | null)[]; make: (level: number) => THREE.BufferGeometry; fine?: THREE.Material | THREE.Material[]; plain?: THREE.Material | THREE.Material[];
  /** AUTO LITE: her shape weights for a baked level (her four motion shapes) and for a live one (all 43), and her motion springs' handle on them. */
  bakedSet?: MorphSet; liveSet?: MorphSet; soft?: { influences: number[]; at: number[] };
}

interface Person {
  root: THREE.Group;
  angle: number;   // where she is on her circle
  radius: number;
  speed: number;   // radians per second (its sign is her direction)
  phase: number;
  /** AUTO detail: her baked body at each level, and the level she is drawn at now. */
  lods: PersonLod[];
  /** The builder's cloth tee on her (the 'Cloth tee' option), and how to put it on her when her turn comes. */
  cloth?: ClothTest;
  /** 👟 Her sneakers (the builder's pair, one mesh on her own skeleton). */
  shoes?: THREE.SkinnedMesh;
  clothMake?: (freeze: boolean) => ClothTest;
  /** How far she is from the camera (to her middle), as of this frame. */
  dist?: number;
  /** She is inside the camera's picture (whether or not she is near enough to be drawn). */
  inView?: boolean;
  /** FADE: how far she is for the fade: from the player's spot or from the camera, whichever is nearer. */
  far?: number;
  /** FADE: how much of her is drawn, 1 = all (every one of her materials reads this one value). */
  fade: { value: number };
  /** (the crowd in a game) how fast the game says she is walking, and where she is in the world. */
  speedNow?: number;
  at?: THREE.Vector3;
  /** She is in the scene (someone not drawn is taken out of it, so her 80 bones cost nothing: v0.50). */
  shown: boolean;
  /** Her shadow's material (it thins out with her). */
  depth?: THREE.Material;
  /** AUTO detail: the level her distance alone asks for (SMART FPS may draw her lighter: `level` is what she is drawn at). */
  band?: number;
  /** Her tee is being simulated because she is near the camera ('Cloth tee: near the camera'). */
  clothNear?: boolean;
  level: number;
  /** The builder body's own moving skeleton (v0.29.5): her bones posed each frame by the builder's code. */
  live?: {
    rig: HumanRig;
    measure: HumanMeasure;
    carry: number;      // her belly, 0..2 (a big belly walks shorter and wider)
    perUnit: number;    // her skeleton's own units per one of the room's
    walked: number;     // how far she has walked, in the room's units
    out: MutableJointTurn[];
    out2: MutableJointTurn[];
    // Her belly's and bust's weight: two springs, and where her four motion shapes are on each of her meshes
    belly: BellySpring;
    breast: BellySpring;
    bumpPercent: number;
    soft: { influences: number[]; at: number[] }[];
    weights: number[];
  };
}

export async function startDevRoom(embed?: CrowdHost): Promise<Crowd | void> {
  // ---- The page: our own canvas and a small panel, over everything else ----
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#9fd3f5;touch-action:none;font-family:system-ui,sans-serif;';
  // (in a game: the page below is made but never shown, and the game's own renderer, scene and camera are used)
  if (!embed) document.body.appendChild(host);
  const renderer = embed?.renderer ?? new THREE.WebGLRenderer({ antialias: true });
  if (!embed) {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // (as the game does)
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(renderer.domElement);
  }
  const panel = document.createElement('div');
  panel.style.cssText =
    'position:absolute;left:calc(8px + env(safe-area-inset-left));right:calc(8px + env(safe-area-inset-right));top:calc(8px + env(safe-area-inset-top));' +
    'display:flex;flex-direction:column;gap:6px;align-items:flex-start;pointer-events:none;color:#fff;';
  host.appendChild(panel);
  const css = document.createElement('style');
  css.textContent = `
    .dr-row { display:flex; flex-wrap:wrap; gap:4px; pointer-events:auto; }
    .dr-b { font:600 12px system-ui,sans-serif; color:#fff; background:rgba(28,35,42,.82); border:0; border-radius:8px; padding:5px 8px; min-width:32px; min-height:30px; }
    .dr-b.on { background:#2f7fd0; }
    .dr-stat { font:600 11px/1.3 ui-monospace,Menlo,monospace; background:rgba(28,35,42,.82); border-radius:8px; padding:5px 8px; white-space:pre-wrap; max-width:100%; box-sizing:border-box; pointer-events:none; }
    .dr-fps { font-size:18px; }
    .dr-shut .dr-set { display:none; }
    .dr-num { font:600 13px ui-monospace,Menlo,monospace; color:#fff; background:rgba(28,35,42,.9); border:1px solid rgba(255,255,255,.25); border-radius:8px; padding:4px 6px; width:64px; box-sizing:border-box; pointer-events:auto; }
    .dr-slide { flex:1 1 100px; min-width:80px; pointer-events:auto; accent-color:#2f7fd0; }
    .dr-log { font:600 11px/1.35 ui-monospace,Menlo,monospace; color:#fff; background:rgba(28,35,42,.9); border:0; border-radius:8px; padding:6px 8px; width:min(100%, 340px); height:150px; box-sizing:border-box; pointer-events:auto; resize:none; -webkit-user-select:text; user-select:text; }
  `;
  host.appendChild(css);
  const row = () => {
    const d = document.createElement('div');
    d.className = 'dr-row';
    panel.appendChild(d);
    return d;
  };
  const button = (parent: HTMLElement, text: string, onClick: () => void) => {
    const b = document.createElement('button');
    b.className = 'dr-b';
    b.textContent = text;
    b.addEventListener('click', onClick);
    parent.appendChild(b);
    return b;
  };
  const top = row();
  button(top, '← Back to the game', () => {
    const u = new URL(location.href);
    u.searchParams.delete('devroom');
    location.href = u.toString();
  });
  const title = document.createElement('div');
  title.className = 'dr-stat';
  title.textContent = `🧪 DEV Room · v${VERSION}`; // (the build it is: so a phone shows whether it has the latest)
  top.appendChild(title);
  // (v0.43; Joshua: "fix the UI and compress it so it is easier to see": smaller buttons, and one that folds the
  // settings away so only the readout is over the picture)
  const foldBtn = button(top, '▲ Hide settings', () => {
    const shut = panel.classList.toggle('dr-shut');
    foldBtn.textContent = shut ? '▼ Settings' : '▲ Hide settings';
  });
  const modelRow = row();
  const countRow = row();
  const detailRow = row();
  const detailLabel = document.createElement('div');
  detailLabel.className = 'dr-stat';
  detailLabel.textContent = 'Detail';
  detailRow.appendChild(detailLabel);
  const optRow = row();
  for (const r of [modelRow, countRow, detailRow, optRow]) r.classList.add('dr-set');
  // 🧪 THE STRESS TEST's row (v0.46): it stays when the settings are folded away
  const stressRow = row();
  const stressLog = document.createElement('textarea');
  stressLog.className = 'dr-log';
  stressLog.readOnly = true;
  stressLog.style.display = 'none';
  panel.appendChild(stressLog);
  const stat = document.createElement('div');
  stat.className = 'dr-stat';
  panel.appendChild(stat);

  // ---- The scene: grass, sky, a sun with shadows (like the backyard) ----
  const scene = embed?.scene ?? new THREE.Scene();
  if (!embed) scene.background = new THREE.Color(0x9fd3f5);
  if (!embed) scene.add(new THREE.HemisphereLight(0xffffff, 0x88aa66, 1.15));
  const sun = new THREE.DirectionalLight(0xfff2d6, 2.0);
  sun.position.set(-14, 26, 16);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -20; sc.right = 20; sc.top = 20; sc.bottom = -20; sc.near = 1; sc.far = 80;
  if (!embed) scene.add(sun);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(22, 48), new THREE.MeshStandardMaterial({ color: 0x7ec850, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  if (!embed) scene.add(ground);
  const camera = (embed?.camera as THREE.PerspectiveCamera | undefined) ?? new THREE.PerspectiveCamera(42, 1, 0.1, 300);
  // Drag: orbit. Pinch / wheel: zoom.
  // (v0.50: the camera starts nearer, 5.4 m from the middle and not 15.6: at the old distance the fade would have
  // had the whole room half gone, and nobody near enough for the 3% and 2% levels)
  const view = { yaw: 0, pitch: 0.62, dist: 9 };
  const pointers = new Map<number, { x: number; y: number }>();
  let pinch = 0;
  const el = embed ? document.createElement('canvas') : renderer.domElement; // (a game's own canvas keeps its own touches)
  el.addEventListener('pointerdown', (e) => { pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); pinch = 0; });
  const up = (e: PointerEvent) => { pointers.delete(e.pointerId); pinch = 0; };
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    if (pointers.size === 1) {
      view.yaw -= (e.clientX - p.x) * 0.006;
      view.pitch = THREE.MathUtils.clamp(view.pitch + (e.clientY - p.y) * 0.004, 0.12, 1.4);
    }
    p.x = e.clientX;
    p.y = e.clientY;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch) view.dist = THREE.MathUtils.clamp(view.dist * (pinch / d), 4, 60);
      pinch = d;
    }
  });
  el.addEventListener('wheel', (e) => { view.dist = THREE.MathUtils.clamp(view.dist * (1 + Math.sign(e.deltaY) * 0.1), 4, 60); }, { passive: true });
  const people: Person[] = [];
  // (the defaults are the settings Joshua settled on, 2026-11-14: 40 walking, auto detail, baked, smart, pieces skipped)
  const state = { model: MODELS[0], count: 40, looks: 'random' as 'random' | 'saved' | 'off', seed: 0, shadows: true, detail: 3, shapes: 'baked' as 'live' | 'baked' | 'off', underwear: false, auto: true, fps: true, smart: true, cull: true, fade: true, heads: true, target: 30 as 30 | 45 | 60, cloth: 'off' as 'off' | 'live' | 'freeze' | 'near', perChar: 0, motion: 'walk' as 'walk' | 'idle' | 'off', plain: false, sharp: true, loading: '', error: '', info: null as Loaded | null };
  // (in a game: nobody until the game adds her; no draw range or fade of this room's (the game's camera is far off:
  // they would hide everyone); the cloth tee frozen once dressed, as Joshua's settings have it)
  // (v0.82, Joshua, of the game still a little laggy: "Match the settings exactly… I am able to get a lot of people
  // with amazing fps" in this room. So in a game everything is as this room opens: AUTO LIVE (3%, 2%, 1%), smart FPS
  // on with its target of 30, far away fades out, shadows on, no cloth tee. Only the room's own crowd is not made.)
  if (embed) state.count = 0;
  const resize = () => {
    if (embed) return;
    renderer.setPixelRatio(state.sharp ? Math.min(window.devicePixelRatio, 2) : 1);
    renderer.setSize(host.clientWidth, host.clientHeight, false);
    el.style.width = '100%';
    el.style.height = '100%';
    camera.aspect = host.clientWidth / Math.max(1, host.clientHeight);
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();

  // ---- Loading a model (once), then cloning it per person ----
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  interface Loaded { male: boolean; shoes?: CrowdShoes | null; hairs: Map<string, THREE.Object3D>; parts: THREE.Object3D[]; scale: number; minY: number; box: THREE.Box3; tris: number; mb: number; ms: number }
  const cache = new Map<string, Promise<Loaded>>();
  const load = (def: ModelDef) => {
    let p = cache.get(def.key);
    if (!p) {
      p = (async () => {
        const t0 = performance.now();
        let bytes = 0;
        const parts: THREE.Object3D[] = [];
        for (const url of def.files) {
          const buf = await (await fetch(url)).arrayBuffer();
          bytes += buf.byteLength;
          const gltf = await loader.parseAsync(buf, '');
          deinterleave(gltf.scene);
          parts.push(gltf.scene);
        }
        // HER HAIR (v0.57): the builder's hairstyles, each one's LIGHT file (about 5k triangles, a fifth of the full
        // one), all loaded with her: 2 MB together. If they can't be had, the one hairstyle she had before.
        const hairs = new Map<string, THREE.Object3D>();
        if (def.builder) {
          const one = async (url: string) => {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`${res.status}`);
            const buf = await res.arrayBuffer();
            bytes += buf.byteLength;
            const scene = (await loader.parseAsync(buf, '')).scene;
            deinterleave(scene);
            return scene;
          };
          const styles = def.male ? MEN_HAIR : HAIR_STYLES;
          try {
            const got = await Promise.all(styles.map((style) => one(BUILDER + style.lightFile.replace(/^models\//, ''))));
            styles.forEach((style, k) => hairs.set(style.id, got[k]));
          } catch (e) {
            hairs.clear();
            // (his: what of them did come is all he has; hers: the one hairstyle she had before)
            if (def.male) throw e;
            hairs.set('ponytail', await one(BUILDER + 'sarah-v2-hair.glb'));
          }
          parts.push(...hairs.values());
        }
        // Her size as she stands (skinned, in the world), from the first part (the body)
        const world = new THREE.Box3();
        const rest = new THREE.Box3(); // ...and in her geometry's own units (for the painted outfit)
        let tris = 0;
        for (const part of parts) {
          part.updateWorldMatrix(true, true);
          part.traverse((o) => {
            const mesh = o as THREE.SkinnedMesh;
            if (!mesh.isMesh) return;
            mesh.castShadow = true;
            mesh.frustumCulled = false; // (a skinned mesh's bounds are its rest pose's)
            const g = mesh.geometry;
            if (parts.indexOf(part) < 2) tris += (g.index ? g.index.count : g.attributes.position.count) / 3; // (her body and one hairstyle)
            if (part !== parts[0]) return;
            // (her rest pose alone: a geometry's own bounding box also covers every morph, the 200% belly included)
            rest.union(new THREE.Box3().setFromBufferAttribute(g.attributes.position as THREE.BufferAttribute));
            world.union(new THREE.Box3().setFromObject(mesh, true));
          });
        }
        const h = Math.max(0.001, world.max.y - world.min.y);
        return { male: !!def.male, hairs, parts, scale: HEIGHT / h, minY: world.min.y, box: rest, tris: Math.round(tris), mb: bytes / 1e6, ms: performance.now() - t0 };
      })();
      cache.set(def.key, p);
    }
    return p;
  };


  /**
   * The test switches that change the model itself, for everyone at once: its detail (a lighter triangle
   * list over the same points) and whether it carries its 43 body shapes at all.
   */
  const applyModelSettings = async (src: Loaded) => {
    await MeshoptSimplifier.ready;
    for (const part of src.parts) {
      part.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const g = mesh.geometry;
        const keep: GeoKeep = (g.userData.devRoom ??= { index0: g.index, morph0: g.morphAttributes, lods: new Map() });
        const isHair = (mesh.material as THREE.Material).name === 'sarahHair';
        // (v0.57, once: the builder's face types, as seven more shapes of her skin's and of each hairstyle's)
        if (!keep.faces && src.hairs.size && (isHair || (mesh.material as THREE.Material).name === 'Material_0')) { keep.faces = true; addFaceTypes(mesh, keep.morph0, src.male ? MALE_FACE.frame : undefined); }
        // (her skin only, once: what smoothing the tips of her bust under a tee would move: bustSmoothing)
        if (keep.flat === undefined) {
          const isSkin = !src.male && src.box.max.y > src.box.min.y && (mesh.material as THREE.Material).name === 'Material_0';
          keep.flat = isSkin ? bustSmoothing(g, keep, (mesh as THREE.Mesh).morphTargetDictionary ?? {}, src.box) : null;
          // (as two extra values on each of her points, which her painted material adds in by her own amount)
          const softPos = new Float32Array(g.attributes.position.count * 3), softNrm = new Float32Array(g.attributes.position.count * 3);
          if (keep.flat) for (let v = 0; v < g.attributes.position.count; v++) for (let c = 0; c < 3; c++) { softPos[v * 3 + c] = keep.flat[v * 6 + c]; softNrm[v * 3 + c] = keep.flat[v * 6 + 3 + c]; }
          g.setAttribute('softPos', new THREE.BufferAttribute(softPos, 3));
          g.setAttribute('softNrm', new THREE.BufferAttribute(softNrm, 3));
        }
        let index = keep.index0;
        const index0 = keep.index0;
        const lodFor = (detail: number) => {
          const index = index0!;
          if (detail >= 100) return index; // (as the file has her)
          // SMART DETAIL (v0.33): her head keeps three times the share of triangles her body gets (a face reads
          // from far away; a back or a thigh doesn't), for the same total. Only on her skin, which has the head.
          const smart = state.smart && src.box.max.y > src.box.min.y && (mesh.material as THREE.Material).name === 'Material_0';
          const key = `${detail}${smart ? 's' : ''}`;
          let lod = keep.lods.get(key);
          if (!lod) {
            const pos = g.attributes.position;
            const points = new Float32Array(pos.count * 3);
            for (let i = 0; i < pos.count; i++) { points[i * 3] = pos.getX(i); points[i * 3 + 1] = pos.getY(i); points[i * 3 + 2] = pos.getZ(i); }
            const all = new Uint32Array(index.array);
            const target = Math.max(3, Math.floor((index.count * detail) / 100 / 3) * 3);
            let lighter: Uint32Array;
            if (smart) {
              // WHICH PARTS OF HER KEEP THEIR TRIANGLES (v0.34; Joshua: "keep certain parts masked as is, but
              // other parts can be consolidated", "protect the hands"). Every point of her gets an IMPORTANCE:
              // 1 on a back or a thigh, more on her face, her hands, her bust, her belly, most on her navel.
              // Her own body shapes say where those are: the points the navel shapes move ARE her navel, the
              // points 'breastGrow' moves are her bust, the points 'belly' moves are her belly (and each
              // fades out smoothly, as the shape does). Her head and hands are found by where they are.
              //
              // The lightening then works on a copy of her in which every point is pushed out from her middle
              // by its importance: an important part looks bigger to it, so a mistake there counts for more
              // and it keeps more of its triangles. Importance changes smoothly, so there are no seams between
              // parts. Only the choice of triangles comes from the copy: her real points are never moved.
              const dict = (mesh as THREE.Mesh).morphTargetDictionary ?? {};
              const morphs = (keep.morph0.position ?? []) as THREE.BufferAttribute[];
              const n = pos.count;
              const B = src.box;
              const H = B.max.y - B.min.y;
              const cx = (B.min.x + B.max.x) / 2, cy = (B.min.y + B.max.y) / 2, cz = (B.min.z + B.max.z) / 2;
              const ease = (k: number) => { const u = Math.min(1, Math.max(0, k)); return u * u * (3 - 2 * u); };
              const weight = new Float32Array(n).fill(1);
              for (let v = 0; v < n; v++) {
                const xr = Math.abs(points[v * 3] - cx) / H, yr = (points[v * 3 + 1] - B.min.y) / H;
                const head = ease((yr - 0.84) / 0.04);                                             // above her neck
                const hand = ease((xr - 0.125) / 0.015) * ease((0.57 - yr) / 0.02) * ease((yr - 0.38) / 0.02); // out at her sides, below her wrists
                // (between her legs, where her thighs meet her hips: a tight fold that tears first when it's lightened)
                const groin = ease((0.075 - xr) / 0.02) * ease((yr - 0.43) / 0.02) * ease((0.53 - yr) / 0.02);
                weight[v] = 1 + 2 * Math.max(head, hand, groin);
              }
              const mark = (names: string[], extra: number, full: number) => {
                for (const name of names) {
                  const m = morphs[dict[name]];
                  if (!m) continue;
                  let most = 0;
                  const moved = new Float32Array(n);
                  for (let v = 0; v < n; v++) { moved[v] = Math.hypot(m.getX(v), m.getY(v), m.getZ(v)); if (moved[v] > most) most = moved[v]; }
                  if (!(most > 0)) continue;
                  // (full importance where the shape moves a point at least `full` of its most, fading to none)
                  for (let v = 0; v < n; v++) weight[v] = Math.max(weight[v], 1 + extra * ease(moved[v] / most / full));
                }
              };
              mark(['belly'], 1, 0.5);
              mark(['breastGrow'], 2, 0.3);
              mark(['navelIn', 'navelOut', 'navelFlat'], 5, 0.3);
              // The lightening is told two more things about every point, beside where it is: where it sits on
              // her skin's picture (so the picture isn't dragged sideways: without it her face came out blotchy),
              // and its place again, scaled by its extra importance. A mistake at an important point then
              // counts several times over, so that part keeps more of its triangles; her real shape is what
              // the lightening works on throughout. (Its first version worked on a copy of her with the
              // important parts blown up instead; that left thin dark slivers on her inner thighs.)
              const uv = g.attributes.uv as THREE.BufferAttribute | undefined;
              const extra = new Float32Array(n * 5);
              for (let v = 0; v < n; v++) {
                extra[v * 5] = uv ? uv.getX(v) : 0;
                extra[v * 5 + 1] = uv ? uv.getY(v) : 0;
                const k = weight[v] - 1;
                extra[v * 5 + 2] = (points[v * 3] - cx) * k;
                extra[v * 5 + 3] = (points[v * 3 + 1] - cy) * k;
                extra[v * 5 + 4] = (points[v * 3 + 2] - cz) * k;
              }
              [lighter] = MeshoptSimplifier.simplifyWithAttributes(all, points, 3, extra, 5, [H * 1.5, H * 1.5, 1, 1, 1], null, target, 1);
            } else {
              [lighter] = MeshoptSimplifier.simplify(all, points, 3, target, 1);
            }
            lod = new THREE.BufferAttribute(lighter, 1);
            keep.lods.set(key, lod);
          }
          return lod;
        };
        // (a hairstyle's light file is already a fifth of its triangles: it is lightened an eighth as hard as her body)
        if (index && state.detail < 100) index = lodFor(isHair && index.count < 30000 ? Math.min(100, state.detail * 8) : state.detail);
        // (AUTO: the three levels a person switches between by her distance, ready for the baking)
        keep.auto = index0 && state.auto && !isHair ? TABLE.map((a) => lodFor(a.detail)) : undefined;
        // (AUTO LITE's live body is one for everybody near the camera; a new one for each change of settings)
        for (const lg of keep.liveGeos?.values() ?? []) lg.dispose();
        keep.liveGeos = undefined;
        // (her hair always has its shapes: its length and her face's)
        const morphs = state.shapes === 'live' || (isHair && keep.morph0.position?.length) ? keep.morph0 : NO_MORPHS;
        if (g.index === index && g.morphAttributes === morphs) return;
        g.dispose(); // (so nothing of the old setting stays on the graphics chip: her shapes alone are a big texture)
        g.setIndex(index);
        g.morphAttributes = morphs;
      });
    }
  };

  /**
   * BAKED SHAPES (v0.29.4): "lock her shape down". Live, the graphics chip re-blends her 43 body shapes for
   * every point of her on every frame. Baked, her final shape is worked out ONCE, here, into a plain body of
   * her own (only the points her detail level still draws), and nothing is blended while she walks.
   */
  const bakeGeometry = (g: THREE.BufferGeometry, weights: [number, number][], live: [string, number][], index: THREE.BufferAttribute = g.index!, detail = state.detail) => {
    const keep = g.userData.devRoom as GeoKeep;
    const src = g.attributes;
    // Only the points this detail level uses, renumbered
    const remap = new Int32Array(src.position.count).fill(-1);
    const order: number[] = [];
    const tri = new Uint32Array(index.count);
    for (let i = 0; i < index.count; i++) {
      const v = index.getX(i);
      if (remap[v] < 0) { remap[v] = order.length; order.push(v); }
      tri[i] = remap[v];
    }
    const n = order.length;
    const out = new THREE.BufferGeometry();
    for (const [name, a] of Object.entries(src) as [string, THREE.BufferAttribute][]) {
      const size = a.itemSize;
      if (name === 'position' || name === 'normal') {
        // (as real numbers: her base shape plus each of her shapes at its weight)
        const morphs = keep.morph0[name] as THREE.BufferAttribute[] | undefined;
        const arr = new Float32Array(n * 3);
        for (let k = 0; k < n; k++) {
          const o = order[k];
          let x = a.getX(o), y = a.getY(o), z = a.getZ(o);
          if (morphs) {
            for (const [mi, w] of weights) {
              const m = morphs[mi];
              if (!m) continue;
              if (g.morphTargetsRelative) { x += m.getX(o) * w; y += m.getY(o) * w; z += m.getZ(o) * w; }
              else { x += (m.getX(o) - a.getX(o)) * w; y += (m.getY(o) - a.getY(o)) * w; z += (m.getZ(o) - a.getZ(o)) * w; }
            }
          }
          arr[k * 3] = x; arr[k * 3 + 1] = y; arr[k * 3 + 2] = z;
        }
        out.setAttribute(name, new THREE.BufferAttribute(arr, 3));
      } else {
        // (everything else is copied as it is: her texture coordinates, which bones move each point)
        const from = a.array as unknown as { [i: number]: number; constructor: new (len: number) => THREE.TypedArray };
        const arr = new from.constructor(n * size);
        for (let k = 0; k < n; k++) for (let c = 0; c < size; c++) arr[k * size + c] = from[order[k] * size + c];
        out.setAttribute(name, new THREE.BufferAttribute(arr, size, a.normalized));
      }
    }
    // HER MOTION SHAPES STAY LIVE (Joshua, 2026-11-14: "leave belly/breasts/breathing live, the rest baked"): the
    // four that move with her walk are carried over, for her own points only. Her breathing is her bones.
    for (const kind of ['position', 'normal'] as const) {
      const morphs = keep.morph0[kind] as THREE.BufferAttribute[] | undefined;
      const base = src[kind] as THREE.BufferAttribute | undefined;
      if (!morphs || !base || live.length === 0) continue;
      out.morphAttributes[kind] = live.map(([name, mi]) => {
        const m = morphs[mi];
        const arr = new Float32Array(n * 3);
        for (let k = 0; k < n; k++) {
          const o = order[k];
          const rel = g.morphTargetsRelative;
          arr[k * 3] = m.getX(o) - (rel ? 0 : base.getX(o));
          arr[k * 3 + 1] = m.getY(o) - (rel ? 0 : base.getY(o));
          arr[k * 3 + 2] = m.getZ(o) - (rel ? 0 : base.getZ(o));
        }
        const a = new THREE.BufferAttribute(arr, 3);
        a.name = name;
        return a;
      });
    }
    // ON A MUCH LIGHTER BODY, NEW SURFACE DIRECTIONS (v0.34). Each point remembers which way the fine skin
    // faced there, and lighting uses that. Once most points are gone, a point from under her jaw can end up
    // holding a triangle on her chin, and her chin is lit as if it faced the ground (dark, greenish blotches).
    // So the directions are worked out again from the triangles she has now: each triangle's own facing, added
    // up at its three points (points in the same place share one sum, so the skin picture's seams don't show).
    const P = out.attributes.position as THREE.BufferAttribute | undefined;
    if (detail < 25 && P && out.attributes.normal) {
      const sum = new Map<string, [number, number, number]>();
      const key = (i: number) => `${Math.round(P.getX(i) * 4096)},${Math.round(P.getY(i) * 4096)},${Math.round(P.getZ(i) * 4096)}`;
      const keys: string[] = [];
      for (let i = 0; i < n; i++) { keys.push(key(i)); if (!sum.has(keys[i])) sum.set(keys[i], [0, 0, 0]); }
      const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
      for (let t = 0; t < tri.length; t += 3) {
        a.fromBufferAttribute(P, tri[t]); b.fromBufferAttribute(P, tri[t + 1]); c.fromBufferAttribute(P, tri[t + 2]);
        b.sub(a); c.sub(a); b.cross(c); // (its length is twice the triangle's area: big triangles count for more)
        for (let k = 0; k < 3; k++) { const acc = sum.get(keys[tri[t + k]])!; acc[0] += b.x; acc[1] += b.y; acc[2] += b.z; }
      }
      let top = -Infinity, bottom = Infinity;
      for (let i = 0; i < n; i++) { const y = P.getY(i); if (y > top) top = y; if (y < bottom) bottom = y; }
      const faceY = bottom + (top - bottom) * 0.86; // (her neck; only her skin reaches both her feet and her crown)
      const N = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const acc = sum.get(keys[i])!;
        const len = Math.hypot(acc[0], acc[1], acc[2]) || 1;
        N[i * 3] = acc[0] / len; N[i * 3 + 1] = acc[1] / len; N[i * 3 + 2] = acc[2] / len;
        // (...but only where the remembered direction is badly off, more than about 45 degrees: everywhere else
        // the fine skin's own direction is kept, because it hides the big flat triangles far better)
        const old = out.attributes.normal as THREE.BufferAttribute;
        const ox = old.getX(i), oy = old.getY(i), oz = old.getZ(i);
        const ol = Math.hypot(ox, oy, oz) || 1;
        // (stricter on her face, about 20 degrees: a wrong tint shows there first)
        if ((ox * N[i * 3] + oy * N[i * 3 + 1] + oz * N[i * 3 + 2]) / ol > (P.getY(i) > faceY ? 0.94 : 0.7)) { N[i * 3] = ox / ol; N[i * 3 + 1] = oy / ol; N[i * 3 + 2] = oz / ol; }
      }
      out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    }
    out.morphTargetsRelative = true;
    out.setIndex(new THREE.BufferAttribute(tri, 1));
    out.userData.devRoomOwn = true;
    return out;
  };

  /** Her skin is the part carrying the builder's `_cloth_cover`; his file has none: his is the skinned mesh in Material_0. */
  const isSkinOf = (mesh: THREE.Mesh, src: Loaded) =>
    !!mesh.geometry.getAttribute('_cloth_cover') || (src.male && (mesh as THREE.SkinnedMesh).isSkinnedMesh && (mesh.material as THREE.Material).name === 'Material_0');
  const makePerson = (def: ModelDef, src: Loaded, i: number): Person => {
    const r = rng(1000 + i * 7919);
    const root = new THREE.Group();
    const inner = new THREE.Group();
    // Which look she wears: Joshua's three in turn, or the plain standard body
    const picked = def.male ? randomManLook(i, state.seed) : !def.builder || state.looks === 'off' ? PLAIN : state.looks === 'random' ? randomLook(i, state.seed) : LOOKS[i % LOOKS.length];
    const fit = def.male ? FIT_HIM : FIT_HER;
    // (a test's own changes to a look, for side-by-side comparisons: window.devRoom.tweak = (look, i) => ({ ...look, navel: -100 }))
    const tweaked = def.builder && hooks.tweak ? hooks.tweak(picked, i) : picked;
    // (the cloth tee's wearer has its colour painted on her skin beneath it, so a point of skin showing between the
    // cloth's own points is the tee's colour too)
    // (v0.41: everybody, as a clothing option. The first keeps Sarah's own red; the rest wear it in their own colour)
    const wearsCloth = def.builder && !def.male && state.cloth !== 'off' && !tweaked.paint;
    const look = wearsCloth ? { ...tweaked, top: i === 0 ? new THREE.Color(SARAH_TEE.colour).getHex() : tweaked.top, longSleeves: false } : tweaked;
    const tall = 1 + look.heightCm / STANDARD_CM;
    inner.scale.setScalar(src.scale * tall);
    inner.position.y = -src.minY * src.scale * tall;
    // Her shape, with the builder's own morphs and rules: her belly at her look's size, her bust with it
    // (v0.57: her head. 'Heads: all the same' gives everybody the hair and face she had before)
    const head = state.heads ? look.head : undefined;
    const faceShape: Record<string, number> = {};
    for (const [id, w] of Object.entries(head?.face ?? {})) faceShape[FACE_SHAPE(id)] = w;
    const shape: Record<string, number> = { ...bellyWeights(look.bump / 100), ...bustWeights(look.bump, look.bust ?? 0), navelFlat: navelFlatFor(look.bump, look.navel ?? 0), ...faceShape };
    const hairPart = src.hairs.get(head?.style ?? 'ponytail') ?? src.hairs.values().next().value;
    const parts = src.hairs.size ? (hairPart ? [src.parts[0], hairPart] : [src.parts[0]]) : src.parts;
    const lods: PersonLod[] = [];
    // (FADE: one value for all of her, read by each of her materials and by her shadow's)
    const fadeValue = { value: 1 };
    const fade = state.fade ? fadeValue : undefined;
    let fadeDepth: THREE.MeshDepthMaterial | undefined;
    if (fade) {
      fadeDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
      fadeDepth.onBeforeCompile = (shader) => fadeShader(shader, fade);
      fadeDepth.customProgramCacheKey = () => 'devroom-fade';
    }
    let skin: { mesh: THREE.SkinnedMesh; dict: Record<string, number> } | undefined;
    for (const part of parts) {
      const copy = cloneSkinned(part); // (shares the geometry and textures; her skeleton is her own)
      copy.traverse((o) => {
        const mesh = o as THREE.SkinnedMesh;
        if (!mesh.isMesh) return;
        const body = def.builder && part === src.parts[0];
        let auto: PersonLod | undefined; // (this mesh's entry under AUTO detail, if it has one)
        const dict = mesh.morphTargetDictionary;
        if (body && dict && mesh.isSkinnedMesh && isSkinOf(mesh, src)) skin = { mesh, dict };
        const isHair = (mesh.material as THREE.Material).name === 'sarahHair';
        if (isHair && dict && mesh.morphTargetInfluences && mesh.geometry.morphAttributes.position?.length) {
          // (her hair's own shapes: how long it is, and her face's, so it sits on the head she has)
          mesh.morphTargetInfluences.fill(0);
          if (dict[HAIR_LENGTH_MORPH] !== undefined) mesh.morphTargetInfluences[dict[HAIR_LENGTH_MORPH]] = 1 - (head?.length ?? 1);
          for (const [name, w] of Object.entries(faceShape)) if (dict[name] !== undefined) mesh.morphTargetInfluences[dict[name]] = w;
        } else if (state.shapes !== 'live') {
          mesh.morphTargetInfluences = undefined;
          mesh.morphTargetDictionary = undefined;
        }
        // (her underwear pieces are about half her points, and they are under her painted outfit)
        if (body && !state.underwear && (mesh.material as THREE.Material).name === 'bikini') {
          mesh.visible = false;
          return;
        }
        if (body && state.shapes === 'baked' && mesh.geometry.index) {
          const weights: [number, number][] = [];
          for (const [name, v] of Object.entries(shape)) if (dict && dict[name] !== undefined && v !== 0) weights.push([dict[name], v]);
          const live: [string, number][] = [];
          if (state.motion !== 'off' && dict) for (const name of MOTION_TARGETS) if (dict[name] !== undefined) live.push([name, dict[name]]);
          const source = mesh.geometry;
          const levels = (source.userData.devRoom as GeoKeep | undefined)?.auto;
          if (levels) {
            // (AUTO: her body baked once at each level; she starts at the lightest and switches by her distance)
            // (...each one baked the first time she needs it, not all seven up front: her full-detail body is
            // several megabytes, and most people never come that close)
            const geos: (THREE.BufferGeometry | null)[] = levels.map(() => null);
            const keep = source.userData.devRoom as GeoKeep;
            // (a LIVE level: the model's own points and all its shapes, with that level's lighter triangle list.
            // One body shared by everyone that close, since its shapes are one big picture on the graphics chip;
            // each person's own sizes are her mesh's weights)
            const liveBody = (k: number) => {
              // (v0.44: only the points that level draws, with all 43 shapes for those points alone. The whole body's
              // shapes are one picture of about 160 MB on the graphics chip; a 3% body's are about 7 MB, so each
              // level can have its own)
              const made = (keep.liveGeos ??= new Map());
              let lg = made.get(k);
              if (!lg) {
                const all = Object.entries(dict!).sort((a, b) => a[1] - b[1]);
                lg = bakeGeometry(source, [], all, levels[k], TABLE[k].detail);
                lg.userData.devRoomShared = true;
                lg.userData.devRoomOwn = false;
                made.set(k, lg);
              }
              return lg;
            };
            const make = (k: number) => (TABLE[k].live && dict ? liveBody(k) : bakeGeometry(source, weights, live, levels[k], TABLE[k].detail));
            auto = { mesh: mesh as THREE.Mesh, geos, make };
            if (dict && TABLE.some((a) => a.live)) {
              const influences = new Array<number>(Object.keys(dict).length).fill(0);
              for (const [name, v] of Object.entries(shape)) if (dict[name] !== undefined) influences[dict[name]] = v;
              auto.liveSet = { dict, influences };
            }
            lods.push(auto);
            mesh.geometry = geos[geos.length - 1] = make(geos.length - 1);
          } else {
            mesh.geometry = bakeGeometry(source, weights, live);
          }
          if (live.length) mesh.updateMorphTargets(); // (only her motion shapes now, by name)
          if (auto && mesh.morphTargetDictionary && mesh.morphTargetInfluences) auto.bakedSet = { dict: mesh.morphTargetDictionary, influences: mesh.morphTargetInfluences };
          // (AUTO LIVE: the level she starts at is a live one, so she starts with all her shapes' weights)
          if (auto?.liveSet && TABLE[TABLE.length - 1].live) { mesh.morphTargetDictionary = auto.liveSet.dict; mesh.morphTargetInfluences = auto.liveSet.influences; }
        }
        if (state.plain) {
          // (the cheapest material there is, one flat colour: is it her skin and outfit that cost?)
          mesh.material = new THREE.MeshLambertMaterial({ color: def.builder ? look.top : 0xc9a27e });
          mesh.material.userData.devRoomOwn = true;
          if (fade) { mesh.material.onBeforeCompile = (shader) => fadeShader(shader, fade); mesh.material.customProgramCacheKey = () => 'devroom-fade'; }
        } else if (isHair) {
          // (her hair: her own copy of its material, in her own colour, fading with her)
          mesh.material = Array.isArray(mesh.material) ? mesh.material.map((m) => hairMaterialFor(m, head?.colour ?? null, fade)) : hairMaterialFor(mesh.material, head?.colour ?? null, fade);
        } else if (fade && !body) {
          // (anything else of hers: her own copies, so they fade with her)
          mesh.material = Array.isArray(mesh.material) ? mesh.material.map((m) => fadedMaterial(m, fade)) : fadedMaterial(mesh.material, fade);
        }
        // (her shadow thins out with her)
        if (fadeDepth) mesh.customDepthMaterial = fadeDepth;
        if (body) {
          if (!state.plain) {
            const base = mesh.material;
            mesh.material = Array.isArray(mesh.material)
              ? mesh.material.map((m) => paintedMaterial(m, src.box, look, state.detail >= 25 && !auto, fade, fit))
              : paintedMaterial(mesh.material, src.box, look, state.detail >= 25 && !auto, fade, fit);
            if (auto) {
              // (AUTO: a second material with her fine bump picture, for the levels heavy enough to carry it)
              auto.plain = mesh.material;
              auto.fine = Array.isArray(base) ? base.map((m) => paintedMaterial(m, src.box, look, true, fade, fit)) : paintedMaterial(base, src.box, look, true, fade, fit);
            }
          }
          if (state.shapes === 'live' && dict && mesh.morphTargetInfluences) {
            mesh.morphTargetInfluences.fill(0);
            for (const [name, v] of Object.entries(shape)) if (dict[name] !== undefined) mesh.morphTargetInfluences[dict[name]] = v;
          }
        }
      });
      inner.add(copy);
    }
    root.add(inner);
    if (!embed) scene.add(root); // (a game puts her where it wants her)
    const ring = Math.floor(i / 6);
    const radius = 4 + ring * 3.2;
    const person: Person = { root, lods, fade: fadeValue, shown: true, depth: fadeDepth, level: TABLE.length - 1, angle: (i % 6) * (Math.PI / 3) + ring * 0.5, radius, speed: ((2.0 - ring * 0.15) / radius) * (ring % 2 ? -1 : 1), phase: r() * 6 };
    if (def.builder && state.motion !== 'off') {
      try {
        const body = inner.children[0];
        const rig = new HumanRig(body);
        // Her hair is its own file on its own copy of her skeleton: hang it on her body's bones, by name
        const byName = new Map<string, THREE.Bone>();
        body.traverse((o) => { if ((o as THREE.Bone).isBone) byName.set(o.name, o as THREE.Bone); });
        for (const extra of inner.children.slice(1)) {
          extra.traverse((o) => {
            const hair = o as THREE.SkinnedMesh;
            if (!hair.isSkinnedMesh) return;
            const old = hair.skeleton;
            hair.bind(new THREE.Skeleton(old.bones.map((b) => byName.get(b.name) ?? b), old.boneInverses), hair.bindMatrix);
            old.dispose();
          });
        }
        const measure = measureHuman(rig.bind);
        // 👟 her sneakers: the pair is made once on the body file, then each woman has it on her own bones
        const mine = skin as { mesh: THREE.SkinnedMesh } | undefined;
        if (mine && src.shoes !== null) {
          try {
            if (!src.shoes) {
              let template: THREE.SkinnedMesh | undefined;
              src.parts[0].traverse((o) => { const m = o as THREE.SkinnedMesh; if (m.isSkinnedMesh && isSkinOf(m, src)) template = m; });
              if (!template) throw new Error('no skin to build them on');
              src.shoes = makeCrowdShoes(template, src.parts[0], [measure.joints.ankleL, measure.joints.ankleR]);
            }
            const shoes = new THREE.SkinnedMesh(src.shoes.geos[look.shoe ?? 0] ?? src.shoes.geos[0], fade ? fadedMaterial(src.shoes.material, fade) : src.shoes.material);
            shoes.name = 'sneakers';
            shoes.frustumCulled = false;
            mine.mesh.add(shoes);
            shoes.bindMode = mine.mesh.bindMode;
            shoes.bind(mine.mesh.skeleton, mine.mesh.bindMatrix);
            person.shoes = shoes;
          } catch (e) { src.shoes = null; console.error('[devroom] no sneakers', e); }
        }
        // How big her skeleton's units are in the room: two of her joints, measured both ways
        root.updateWorldMatrix(true, true);
        const bones = (body.getObjectByProperty('isSkinnedMesh', true as unknown as string) as THREE.SkinnedMesh).skeleton.bones;
        const a = measure.joints.head, b = measure.joints.ankleL;
        const inRoom = bones[a].getWorldPosition(new THREE.Vector3()).distanceTo(bones[b].getWorldPosition(new THREE.Vector3()));
        const inBind = Math.hypot(rig.bind[a].x - rig.bind[b].x, rig.bind[a].y - rig.bind[b].y, rig.bind[a].z - rig.bind[b].z);
        const soft: { influences: number[]; at: number[] }[] = [];
        body.traverse((o) => {
          const mesh = o as THREE.Mesh;
          const d = mesh.morphTargetDictionary;
          if (!mesh.isMesh || !mesh.visible || !d || !mesh.morphTargetInfluences) return;
          const entry = { influences: mesh.morphTargetInfluences, at: MOTION_TARGETS.map((name) => d[name] ?? -1) };
          soft.push(entry);
          const lod = lods.find((l) => l.mesh === mesh);
          if (lod) lod.soft = entry; // (so a change of level can point her springs at that level's weights)
        });
        person.live = {
          rig, measure, carry: look.bump / 100, perUnit: inBind / Math.max(1e-6, inRoom), walked: r() * 10, out: [], out2: [],
          belly: restingBellySpring(), breast: restingBellySpring(), bumpPercent: look.bump, soft, weights: [0, 0, 0, 0],
        };
      } catch (e) {
        state.error = `No moving skeleton: ${e instanceof Error ? e.message : String(e)}`;
      }
    }
    const worn = skin as { mesh: THREE.SkinnedMesh; dict: Record<string, number> } | undefined;
    if (wearsCloth && worn) {
      // (put on her when her turn comes: see the tick's queue)
      person.clothMake = (freeze: boolean) => {
        let keep: GeoKeep | undefined;
        src.parts[0].traverse((o) => { const g = (o as THREE.Mesh).geometry; if (!keep && g?.getAttribute?.('_cloth_cover')) keep = g.userData.devRoom as GeoKeep; });
        if (!keep?.index0) throw new Error('her body has no triangle list');
        root.updateMatrixWorld(true);
        return new ClothTest({ part: src.parts[0], display: worn.mesh, inner, tall, index: keep.index0, morphs: keep.morph0, dict: worn.dict, shape, motion: MOTION_TARGETS, scene, freeze, colour: look.top });
      };
    }
    return person;
  };

  const frustum = new THREE.Frustum(), cullMatrix = new THREE.Matrix4(), cullBall = new THREE.Sphere(new THREE.Vector3(), 2.4), cullAt = new THREE.Vector3();
  let inView = 0;
  let drawn = 0;
  /** Where nobody is drawn any more, right now: SMART FPS's draw range, or the fade's own end. */
  let fadeEnd: number = FADE.end;
  const seen: Person[] = [];
  /** Everybody inside the camera's picture this frame (SMART FPS picks its number of people from these, nearest first). */
  const near: Person[] = [];
  /** The one point the draw range and the fade are measured from (see the frame loop). */
  const fadeFrom = new THREE.Vector3();
  // --------------------------------------------------------------------------
  // 🎚️ SMART FPS (v0.52; Joshua, 2026-11-14: "it only draws in a 3D 20m radius around the camera, and if FPS is
  // better... it will slowly (maybe in 1m increments - per second) increase the draw range, but if the FPS drops...
  // will freeze the extra range, and if it keeps dropping, then it will start lowering the range 1m every 0.5s",
  // and then "the minimum +/-10% of 30FPS... could add target FPS as well").
  //
  // One dial, the DRAW RANGE: how far out people are drawn, measured from the camera or from the player's spot,
  // whichever is nearer to her (the room has no player: its middle, where the camera looks, stands in). The last
  // SMART.edge of the range is the fade, so nobody pops. Twice a second the frame rate is looked at:
  //   10% or more over the target (or as fast as this screen goes)  -> the range grows 1 m a second
  //   within 10% of the target                                       -> it holds
  //   10% or more under                                              -> it shrinks 1 m every half second
  //   a third or more under                                          -> twice as fast
  // (v0.48 to v0.51 was a ladder instead: everybody a level lighter, then everybody at the lightest, then ten
  // fewer drawn a step. Joshua: "Let's leave the % alone". It is in the git history at b507cda.)
  // --------------------------------------------------------------------------
  // (v0.54, from Joshua's two 30 s logs: "the FPS acts like a yoyo... find a way to balance quicker/smoother".
  // What the logs showed, every 12 s or so: holding at 30 with the range still; people walk into the range (86 drawn
  // becomes 101 with nothing changed); the rate falls to 22; the range shrinks 2 m a second and goes on shrinking for
  // two seconds after there are few enough, because the phone's browser takes that long to come back up from a slow
  // frame rate; by then a third of the people are gone and it runs at 49; then it grows straight back to the same
  // edge. And in the top-down view 43 of 92 people were in the 3 m fade at once. So now:
  //   - the dial is a NUMBER OF PEOPLE, not a distance: the range is wherever that many people end, so people
  //     walking in and out no longer change the load;
  //   - too slow: ONE cut, sized by how far under the target it is (5 to 20% fewer), then SMART.settle seconds to
  //     let the frame rate come back before judging again;
  //   - a ceiling a little under the number that was too many, so it does not grow straight back into the same
  //     trouble. Once things have been fast for a while the ceiling is tried again, one person a second, and each
  //     time that fails soon after, it waits twice as long before the next try (10 s, 20, 40, 60);
  //   - the fade is the last 15% of the range (1 to 3 m), not always 3 m.)
  const SMART = { first: 60, fewest: 8, least: 3 * METRE, most: 60 * METRE, every: 0.5, band: 0.1, settle: 1.5, probe: 10, probeMost: 60 };
  const smart = { count: SMART.first, ceil: MOST_PEOPLE, hold: 0, probe: SMART.probe, cutAt: -999, clock: 0, tries: 0, doing: 'holding', range: 20 * METRE, edge: 3 * METRE, shown: 0, bound: false, t: 0, frames: 0, ms: 0, cap: 0, rate: 0, work: 0, workMs: 0 };
  const smartReset = () => { smart.count = SMART.first; smart.ceil = MOST_PEOPLE; smart.hold = 0; smart.probe = SMART.probe; smart.cutAt = -999; smart.doing = 'holding'; smart.t = 0; smart.frames = 0; smart.ms = 0; smart.work = 0; };
  /** One frame (`ms` = the real time since the last one, `work` = how long this frame's own work took): every SMART.every seconds, judge. */
  const smartTick = (ms: number, work: number) => {
    if (document.hidden || ms > 3000) { smart.t = 0; smart.frames = 0; smart.ms = 0; smart.work = 0; return; } // (back from the background: not a frame time)
    smart.frames++; smart.ms += ms; smart.work += work; smart.t += ms / 1000;
    if (smart.t < SMART.every) return;
    const rate = (smart.frames * 1000) / smart.ms, took = smart.t;
    smart.workMs = smart.work / smart.frames;
    smart.t = 0; smart.frames = 0; smart.ms = 0; smart.work = 0;
    smart.rate = rate;
    smart.clock += took;
    // (the fastest this screen has gone: a phone in Low Power Mode never passes 30, a 60 Hz screen never passes 60,
    // so "10% over the target" could never come. Running flat out at the screen's own limit counts as over.)
    smart.cap = Math.max(smart.cap, Math.min(rate, 125));
    if (!state.fps) { smart.doing = 'off'; return; }
    const target = state.target;
    smart.hold = Math.max(0, smart.hold - took);
    if (rate < target * (1 - SMART.band)) {
      if (smart.hold > 0) { smart.doing = 'waiting'; return; }
      const had = Math.max(SMART.fewest, Math.min(smart.count, smart.shown));
      // (a try at the ceiling that failed soon after: wait twice as long before the next)
      smart.probe = smart.clock - smart.cutAt < smart.probe * 2 + 8 ? Math.min(SMART.probeMost, smart.probe * 2) : SMART.probe;
      smart.count = Math.max(SMART.fewest, Math.floor(had * THREE.MathUtils.clamp(rate / target, 0.8, 0.95)));
      smart.ceil = Math.max(smart.count, Math.floor(had * 0.95));
      smart.hold = SMART.settle;
      smart.cutAt = smart.clock;
      smart.tries = 0;
      smart.doing = 'fewer';
    } else if (rate >= target * (1 + SMART.band) || rate >= smart.cap * 0.95) {
      if (!smart.bound) { smart.doing = 'everyone in reach'; return; } // (the number isn't what limits it: nothing to add)
      // (fast for long enough: the ceiling itself is tried again, half as quickly as the growing under it)
      if (smart.count >= smart.ceil && smart.clock - smart.cutAt > smart.probe && ++smart.tries % 2 === 0) smart.ceil = Math.min(MOST_PEOPLE, smart.ceil + 1);
      if (smart.count < smart.ceil) { smart.count++; smart.doing = 'more'; } else smart.doing = 'at its limit';
    } else smart.doing = 'holding';
  };
  /** Let go of everything that was one person's own (her materials, baked bodies, skeleton, tee): the model is shared. */
  const disposePerson = (p: Person) => {
    p.root.traverse((o) => {
      const mesh = o as THREE.SkinnedMesh;
      if (!mesh.isMesh) return;
      // (only what this person owned: her painted materials and her skeleton; the mesh and textures are shared)
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) if (m.userData.devRoomOwn) m.dispose();
      if (mesh.geometry.userData.devRoomOwn) mesh.geometry.dispose();
      mesh.skeleton?.dispose();
    });
    for (const l of p.lods) {
      for (const geo of l.geos) if (!geo?.userData.devRoomShared) geo?.dispose(); // (her other detail levels; the shared live body isn't hers)
      for (const set of [l.fine, l.plain]) for (const m of set ? (Array.isArray(set) ? set : [set]) : []) m.dispose();
    }
    p.depth?.dispose();
    p.cloth?.dispose();
    p.live?.rig.dispose();
    p.root.removeFromParent();
  };
  let building = 0;
  let lastSrc: Loaded | null = null;
  let onBuilt = () => {};
  const rebuild = async () => {
    if (stress.on) stressEnd(`stopped at ${people.length}: a setting was changed`);
    const ticket = ++building;
    state.loading = `Loading ${state.model.label}…`;
    state.error = '';
    let src: Loaded;
    try {
      src = await load(state.model);
    } catch (e) {
      cache.delete(state.model.key);
      if (ticket === building) {
        state.loading = '';
        state.error = `Couldn't load ${state.model.label}: ${e instanceof Error ? e.message : String(e)}`;
      }
      return;
    }
    if (ticket !== building) return;
    for (const p of people.splice(0)) disposePerson(p);
    state.loading = 'Preparing…';
    await applyModelSettings(src);
    if (ticket !== building) return;
    // (a big crowd is made a few at a time, so the page keeps answering while it is; past 40 they are packed
    // evenly, as in the stress test, where the rings of the small room would stretch out of sight)
    for (let i = 0; i < state.count; i++) {
      const p = makePerson(state.model, src, i);
      if (state.count > 40) stressPlace(p, i);
      people.push(p);
      if (i % 8 === 7 && i < state.count - 1) {
        state.loading = `Adding people… ${i + 1} of ${state.count}`;
        await new Promise((next) => requestAnimationFrame(next));
        if (ticket !== building) return;
      }
    }
    ground.scale.setScalar(state.count > 40 ? Math.max(1, (stressSpot(state.count).radius + 6) / 22) : 1);
    // How many triangles ONE of them is, as she is drawn now (her visible pieces and her hair)
    let tris = 0;
    people[0]?.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || !mesh.visible) return;
      const g = mesh.geometry;
      tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
    });
    state.perChar = Math.round(tris);
    state.info = src;
    lastSrc = src;
    state.loading = '';
    onBuilt();
  };

  // --------------------------------------------------------------------------
  // 🧪 THE STRESS TEST (v0.46; Joshua, 2026-11-14: "start with one model... it will add another random model once
  // every 3s while logging the average FPS over that 3s, and then have a manual stop button to stop it or if the
  // average is below 10 FPS... and I can copy and paste the log", and "there would be total and in view... so do
  // maybe two tests").
  //
  // Two tests, with the room's settings as they stand:
  //   ALL IN VIEW: the camera pulls back as the crowd grows, so everybody is always drawn.
  //   ROOM VIEW:   the camera stays where you left it, so as the crowd spreads some are out of view (and not
  //                drawn, while OUT OF VIEW is on): the log gives the total and how many were in view.
  // People are packed evenly (a sunflower's spiral, about 1.5 units apart) and walk their own circles.
  // Each step: one more person, half a second for her to settle (making her is a hitch of its own), then the
  // frames of the next 2.5 seconds are averaged.
  // --------------------------------------------------------------------------
  const STRESS = { every: 3, settle: 0.5, stopBelow: 10, most: 400 };
  const stress = { on: false, mode: 'view' as 'view' | 'room', t: 0, frames: 0, ms: 0, lines: [] as string[], results: [] as { n: number; fps: number; seen: number }[] };
  const stressSpot = (i: number) => ({ radius: 1.5 + 1.5 * Math.sqrt(i), angle: i * 2.39996 });
  const stressPlace = (p: Person, i: number) => {
    const spot = stressSpot(i);
    p.radius = spot.radius;
    p.angle = spot.angle;
    p.speed = (1.3 / spot.radius) * (i % 2 ? -1 : 1);
  };
  const stressShow = () => {
    stressLog.style.display = stress.lines.length ? '' : 'none';
    stressLog.value = stress.lines.join('\n');
    stressLog.scrollTop = stressLog.scrollHeight;
  };
  const stressSettings = () => [
    state.auto ? (TABLE === AUTO ? 'Auto' : TABLE === AUTO_LITE ? 'Auto lite' : 'Auto live') : `${state.detail}%`,
    `shapes ${state.auto && TABLE === AUTO_LIVE ? 'live' : state.shapes}`, `shadows ${state.shadows ? 'on' : 'off'}`, `motion ${state.motion}`,
    `out of view ${state.cull ? 'not drawn' : 'drawn'}`, stress.mode === 'view' ? 'everyone drawn (no smart FPS or fade in this test)' : `smart FPS ${state.fps ? `on, target ${state.target}` : 'off'} · far away ${state.fade ? 'fades out' : 'cut off'}`, state.cloth === 'off' ? '' : `cloth ${state.cloth}`, `sharpness ${state.sharp ? '2x' : '1x'}`,
  ].filter(Boolean).join(' · ');
  const stressEnd = (why: string) => {
    if (!stress.on) return;
    stress.on = false;
    const best = (min: number) => {
      // (the most people it held `min` FPS with, before the first step that fell below it)
      let n = 0;
      for (const r of stress.results) { if (r.fps < min) break; n = r.n; }
      return n;
    };
    stress.lines.push(why, `--- ${best(50)} people at 50+ FPS · ${best(30)} at 30+ FPS · ${best(20)} at 20+ FPS ---`);
    const top = Math.max(0, ...stress.results.map((r) => r.fps));
    if (stress.results.length > 3 && top <= 31) stress.lines.push('(never above 30 FPS: Low Power Mode may be on, which caps it at 30)');
    stressShow();
    sync();
  };
  const stressStart = async (mode: 'view' | 'room') => {
    stress.on = false;
    stress.mode = mode;
    stress.lines = [`DEV Room v${VERSION} · stress test: ${mode === 'view' ? 'ALL IN VIEW' : 'ROOM VIEW (total / in view)'}`, stressSettings(), `screen ${renderer.domElement.width} x ${renderer.domElement.height}`, 'loading the first one…'];
    stress.results = [];
    stressShow();
    state.count = 1;
    sync();
    await rebuild();
    if (!people.length || !lastSrc) { stress.lines.push(`could not start: ${state.error || 'nothing loaded'}`); stressShow(); return; }
    stressPlace(people[0], 0);
    // (ROOM VIEW: in among them, as in the game's own view, so the crowd soon spreads past the edges of the screen)
    if (mode === 'room') { view.dist = 11; view.pitch = 0.42; }
    stress.lines.pop();
    stress.t = 0; stress.frames = 0; stress.ms = 0;
    stress.on = true;
    sync();
  };
  /** One frame of the test (`ms` = the real time since the last frame). */
  const stressTick = (ms: number) => {
    if (!stress.on) return;
    stress.t += ms / 1000;
    if (stress.t >= STRESS.settle) { stress.frames++; stress.ms += ms; }
    if (stress.mode === 'view') {
      // (pulled back far enough to hold the whole crowd, looking down on it)
      view.pitch = 0.95;
      view.dist = Math.max(14, stressSpot(people.length).radius * 2.5 + 8);
    }
    ground.scale.setScalar(Math.max(1, (stressSpot(people.length).radius + 6) / 22));
    if (stress.t < STRESS.every) return;
    const fps = stress.ms > 0 ? (stress.frames * 1000) / stress.ms : 0;
    const n = people.length, seen = people.filter((q) => q.root.visible).length;
    stress.results.push({ n, fps, seen });
    const shownNow = people.filter((q) => q.root.visible).length;
    const who = (stress.mode === 'room' ? `${n} (${inView} in view${shownNow < inView ? `, ${shownNow} drawn` : ''})` : shownNow < n ? `${n} (${shownNow} drawn)` : `${n}`);
    const note = state.fps && stress.mode !== 'view' ? ` · ${smart.count} people to ${(smart.range / METRE).toFixed(0)} m` : '';
    stress.t = 0; stress.frames = 0; stress.ms = 0;
    if (fps < STRESS.stopBelow) {
      stressEnd(`${who} = <${STRESS.stopBelow} fps 🛑`);
      return;
    }
    stress.lines.push(`${who} = ${fps.toFixed(0)} fps${note}`);
    if (n >= STRESS.most || !lastSrc) { stressEnd(`stopped at ${n}: the test's own limit`); return; }
    try {
      const p = makePerson(state.model, lastSrc, n);
      stressPlace(p, n);
      people.push(p);
    } catch (e) {
      stressEnd(`stopped at ${n}: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    stressShow();
  };
  // --------------------------------------------------------------------------
  // 🎥 RECORD 30 s (v0.53; Joshua: "can you create a 30s auto log that logs everything and I can share it? Maybe
  // have it save as a JSON or easy file to read the logs to debug a few minor issues"). Twice a second for 30 s:
  // the frame rate, who is in view, drawn, solid and fading, SMART FPS's range and what it is doing, the camera,
  // and the three distances that show a fade gone wrong (the nearest person fading, the furthest still solid, the
  // nearest in view and not drawn). At the end, everybody in view, one by one. Use the room as usual meanwhile.
  // The result is JSON, one sample a line, in the log box: Copy log, or Save file (the share sheet on a phone).
  // --------------------------------------------------------------------------
  const REC = { secs: 30, every: 0.5 };
  const rec = { on: false, t: 0, next: 0, frames: 0, ms: 0, worst: 0, head: '', samples: [] as string[], file: '' };
  const m1 = (units: number) => Math.round((units / METRE) * 10) / 10;
  const recStart = () => {
    if (stress.on) stressEnd(`stopped at ${people.length}: recording`);
    rec.on = true; rec.t = 0; rec.next = REC.every; rec.frames = 0; rec.ms = 0; rec.worst = 0; rec.samples = []; rec.file = '';
    rec.head = JSON.stringify({
      devRoom: VERSION, when: new Date().toISOString(), people: people.length, model: state.model.label,
      settings: { detail: state.auto ? 'auto live' : `${state.detail}%`, levels: TABLE.map((a) => `${a.detail}% to ${a.within === Infinity ? 'the end' : m1(a.within) + ' m'}`), shapes: state.shapes, shadows: state.shadows, motion: state.motion, cloth: state.cloth, outOfViewDrawn: !state.cull, fade: state.fade, smartFps: state.fps, target: state.target, sharp: state.sharp },
      smart: { firstPeople: SMART.first, fewestPeople: SMART.fewest, mostM: m1(SMART.most), band: SMART.band, settleS: SMART.settle, probeS: SMART.probe, fade: 'last 15% of the range, 1 to 3 m' },
      screen: `${renderer.domElement.width} x ${renderer.domElement.height}`, pixelRatio: window.devicePixelRatio, browser: navigator.userAgent,
      distances: 'metres. cam = from the camera; from = from the point the range is measured from',
    });
    stress.lines = [`recording ${REC.secs} s: use the room as usual…`];
    stressShow(); sync();
  };
  const recEnd = () => {
    rec.on = false;
    const each = people.filter((q) => q.inView).sort((a, b) => (a.dist ?? 0) - (b.dist ?? 0))
      .map((q) => `[${m1(q.dist ?? 0)},${m1(q.far ?? 0)},${Math.round(q.fade.value * 100) / 100},${TABLE[q.level]?.detail ?? 0}]`);
    rec.file = `{\n"head": ${rec.head},\n"samples": [\n${rec.samples.join(',\n')}\n],\n"inViewAtEnd": { "columns": ["cam m", "from m", "how solid 0-1", "detail %"], "people": [${each.join(',')}] }\n}`;
    stress.lines = rec.file.split('\n');
    stressShow(); stressLog.scrollTop = 0; sync();
  };
  const recTick = (ms: number) => {
    if (!rec.on) return;
    rec.t += ms / 1000; rec.frames++; rec.ms += ms; rec.worst = Math.max(rec.worst, ms);
    if (rec.t < rec.next) return;
    rec.next += REC.every;
    let solid = 0, fadingNow = 0, nearFade = Infinity, farSolid = 0, nearHidden = Infinity;
    const lv: Record<string, number> = {};
    for (const q of people) {
      if (!q.inView) continue;
      const d = q.dist ?? 0;
      if (!q.shown) { if (d < nearHidden) nearHidden = d; continue; }
      const key = `${TABLE[q.level]?.detail ?? 0}%`;
      lv[key] = (lv[key] ?? 0) + 1;
      if (q.fade.value >= 1) { solid++; if (d > farSolid) farSolid = d; } else { fadingNow++; if (d < nearFade) nearFade = d; }
    }
    const r = renderer.info.render;
    rec.samples.push(JSON.stringify({
      t: Math.round(rec.t * 10) / 10, fps: Math.round((rec.frames * 1000) / rec.ms), worstMs: Math.round(rec.worst),
      total: people.length, inView, drawn, solid, fading: fadingNow,
      budget: state.fps ? smart.count : null, ceiling: state.fps ? smart.ceil : null, rangeM: state.fps ? m1(smart.range) : null, fadeM: state.fps ? m1(smart.edge) : null, doing: smart.doing, probeS: smart.probe, workMs: Math.round(smart.workMs * 10) / 10,
      smartRate: Math.round(smart.rate), cap: Math.round(smart.cap), target: state.target,
      nearestFadingCam: nearFade === Infinity ? null : m1(nearFade), furthestSolidCam: m1(farSolid), nearestNotDrawnCam: nearHidden === Infinity ? null : m1(nearHidden),
      levels: lv, calls: r.calls, tris: r.triangles,
      cam: { distM: m1(view.dist), pitchDeg: Math.round((view.pitch * 180) / Math.PI), yawDeg: Math.round((((view.yaw * 180) / Math.PI) % 360 + 360) % 360) },
    }));
    rec.frames = 0; rec.ms = 0; rec.worst = 0;
    stress.lines = [`recording… ${Math.max(0, REC.secs - rec.t).toFixed(0)} s left`];
    stressShow();
    if (rec.t >= REC.secs) recEnd();
  };
  const recBtn = button(stressRow, '', () => { if (rec.on) recEnd(); else recStart(); });
  const recSaveBtn = button(stressRow, '💾 Save file', () => {
    const name = `devroom-log-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
    const file = new File([rec.file], name, { type: 'application/json' });
    const download = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); };
    // (a phone: its share sheet, to send the file straight on; anything else: an ordinary download)
    if (navigator.canShare?.({ files: [file] })) navigator.share({ files: [file] }).catch((e) => { if ((e as Error)?.name !== 'AbortError') download(); }); else download();
  });
  const stressViewBtn = button(stressRow, '▶ Stress test: all in view', () => void stressStart('view'));
  const stressRoomBtn = button(stressRow, '▶ Stress test: room view', () => void stressStart('room'));
  const stressStopBtn = button(stressRow, '🛑 Stop', () => stressEnd(`stopped by hand at ${people.length}`));
  const stressCopyBtn = button(stressRow, '📋 Copy log', () => {
    const text = stress.lines.join('\n');
    const done = () => { stressCopyBtn.textContent = '✅ Copied'; setTimeout(() => (stressCopyBtn.textContent = '📋 Copy log'), 1500); };
    const byHand = () => { stressLog.focus(); stressLog.select(); stressLog.setSelectionRange(0, text.length); try { document.execCommand('copy'); done(); } catch { /* (it is selected: copy from the menu) */ } };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, byHand); else byHand();
  });

  // ---- The panel's buttons ----
  const modelBtns = MODELS.map((def) => button(modelRow, def.label, () => { state.model = def; sync(); void rebuild(); }));
  // HOW MANY PEOPLE: a slider and a box to type a number in, 1 to MOST_PEOPLE (they show the same number)
  const countLabel = document.createElement('div');
  countLabel.className = 'dr-stat';
  countLabel.textContent = 'People';
  const countSlide = document.createElement('input');
  countSlide.type = 'range';
  countSlide.min = '1';
  countSlide.max = String(MOST_PEOPLE);
  countSlide.step = '1';
  countSlide.className = 'dr-slide';
  const countBox = document.createElement('input');
  countBox.type = 'number';
  countBox.inputMode = 'numeric';
  countBox.min = '1';
  countBox.max = String(MOST_PEOPLE);
  countBox.className = 'dr-num';
  countRow.style.alignItems = 'center';
  countRow.style.flexWrap = 'nowrap'; // (the three stay on one line)
  countRow.style.maxWidth = '360px';
  countRow.append(countLabel, countSlide, countBox);
  const setCount = (raw: string) => {
    const n = Math.min(MOST_PEOPLE, Math.max(1, Math.round(Number(raw)) || 1));
    if (n === state.count) { sync(); return; }
    state.count = n;
    sync();
    void rebuild();
  };
  // (dragging shows the number; the room is rebuilt when the slider is let go)
  countSlide.addEventListener('input', () => { countBox.value = countSlide.value; });
  countSlide.addEventListener('change', () => setCount(countSlide.value));
  countBox.addEventListener('change', () => setCount(countBox.value));
  countBox.addEventListener('keydown', (e) => { if (e.key === 'Enter') countBox.blur(); });
  const detailBtns = DETAILS.map((d) => button(detailRow, `${d}%`, () => { state.detail = d; state.auto = false; sync(); void rebuild(); }));
  const setAuto = (table: typeof TABLE) => {
    const on = !(state.auto && TABLE === table);
    state.auto = on;
    TABLE = on ? table : AUTO;
    if (on) { state.detail = table === AUTO ? 10 : 3; state.shapes = 'baked'; }
    sync(); void rebuild();
  };
  // (v0.50: the Auto and Auto lite buttons are gone. Joshua: "let's remove the stuff that doesn't work for Live". Their
  // tables stay in the code, as he asked for everything to be kept; only Auto live, which is every level live, is offered.)
  const liveBtn = button(detailRow, 'Auto live', () => setAuto(AUTO_LIVE));
  const morphBtn = button(optRow, '', () => { state.looks = state.looks === 'random' ? 'saved' : state.looks === 'saved' ? 'off' : 'random'; sync(); void rebuild(); });
  const shuffleBtn = button(optRow, '🎲 Shuffle', () => { state.seed++; state.looks = 'random'; sync(); void rebuild(); });
  const shadowBtn = button(optRow, '', () => { state.shadows = !state.shadows; sync(); });
  const shapeBtn = button(optRow, '', () => { state.shapes = state.shapes === 'live' ? 'baked' : state.shapes === 'baked' ? 'off' : 'live'; if (state.shapes !== 'baked') state.auto = false; sync(); void rebuild(); }); // (the Auto buttons work on baked bodies: off, they'd be lit and doing nothing)
  const motionBtn = button(optRow, '', () => { state.motion = state.motion === 'walk' ? 'idle' : state.motion === 'idle' ? 'off' : 'walk'; sync(); void rebuild(); });
  const smartBtn = button(optRow, '', () => { state.smart = !state.smart; sync(); void rebuild(); });
  const underBtn = button(optRow, '', () => { state.underwear = !state.underwear; sync(); void rebuild(); });
  const headsBtn = button(optRow, '', () => { state.heads = !state.heads; sync(); void rebuild(); });
  const plainBtn = button(optRow, '', () => { state.plain = !state.plain; sync(); void rebuild(); });
  const clothBtn = button(optRow, '', () => { state.cloth = state.cloth === 'off' ? 'live' : state.cloth === 'live' ? 'freeze' : state.cloth === 'freeze' ? 'near' : 'off'; sync(); void rebuild(); });
  const cullBtn = button(optRow, '', () => { state.cull = !state.cull; sync(); });
  const fadeBtn = button(optRow, '', () => { state.fade = !state.fade; sync(); void rebuild(); });
  const fpsBtn = button(optRow, '', () => { state.fps = !state.fps; smartReset(); sync(); });
  const targetBtn = button(optRow, '', () => { state.target = state.target === 30 ? 45 : state.target === 45 ? 60 : 30; smartReset(); sync(); });
  const sharpBtn = button(optRow, '', () => { state.sharp = !state.sharp; sync(); resize(); });
  const sync = () => {
    modelBtns.forEach((b, i) => b.classList.toggle('on', MODELS[i] === state.model));
    countSlide.value = String(state.count);
    if (document.activeElement !== countBox) countBox.value = String(state.count);
    morphBtn.textContent = `Looks: ${state.looks === 'saved' ? 'Char1-3' : state.looks}`;
    morphBtn.classList.toggle('on', state.looks !== 'off');
    shuffleBtn.classList.toggle('on', false);
    shadowBtn.textContent = `Shadows: ${state.shadows ? 'on' : 'off'}`;
    shadowBtn.classList.toggle('on', state.shadows);
    sun.castShadow = state.shadows;
    detailBtns.forEach((b, i) => b.classList.toggle('on', !state.auto && DETAILS[i] === state.detail));
    liveBtn.classList.toggle('on', state.auto && TABLE === AUTO_LIVE);
    shapeBtn.textContent = `Body shapes: ${state.auto && TABLE === AUTO_LIVE ? 'live (Auto live)' : state.auto && TABLE === AUTO_LITE ? 'live near, baked far' : state.shapes}`;
    shapeBtn.classList.toggle('on', state.shapes !== 'off');
    motionBtn.textContent = `Motion: ${state.motion}`;
    motionBtn.classList.toggle('on', state.motion !== 'off');
    smartBtn.textContent = `Smart detail: ${state.smart ? 'on' : 'off'}`;
    smartBtn.classList.toggle('on', state.smart);
    underBtn.textContent = `Hidden pieces: ${state.underwear ? 'drawn' : 'skipped'}`;
    underBtn.classList.toggle('on', state.underwear);
    headsBtn.textContent = `Heads: ${state.heads ? 'all different' : 'all the same'}`;
    headsBtn.classList.toggle('on', state.heads);
    plainBtn.textContent = `Materials: ${state.plain ? 'plain' : 'full'}`;
    plainBtn.classList.toggle('on', !state.plain);
    clothBtn.textContent = `Cloth tee: ${state.cloth === 'off' ? 'off' : state.cloth === 'live' ? 'simulated' : state.cloth === 'freeze' ? 'frozen once dressed' : 'simulated near the camera'}`;
    clothBtn.classList.toggle('on', state.cloth !== 'off');
    sharpBtn.textContent = `Sharpness: ${state.sharp ? '2x' : '1x'}`;
    sharpBtn.classList.toggle('on', state.sharp);
    stressViewBtn.classList.toggle('on', stress.on && stress.mode === 'view');
    stressRoomBtn.classList.toggle('on', stress.on && stress.mode === 'room');
    stressStopBtn.style.display = stress.on ? '' : 'none';
    stressCopyBtn.style.display = stress.lines.length && !rec.on ? '' : 'none';
    recBtn.textContent = rec.on ? '⏹ Stop recording' : '🎥 Record 30 s log';
    recBtn.classList.toggle('on', rec.on);
    recSaveBtn.style.display = rec.file && !rec.on && stress.lines[0] === '{' ? '' : 'none';
    cullBtn.textContent = `Out of view: ${state.cull ? 'not drawn' : 'drawn'}`;
    cullBtn.classList.toggle('on', state.cull);
    fadeBtn.textContent = `Far away: ${state.fade ? 'fades out' : 'no fade'}`;
    fadeBtn.classList.toggle('on', state.fade);
    fpsBtn.textContent = `Smart FPS: ${state.fps ? 'on' : 'off'}`;
    fpsBtn.classList.toggle('on', state.fps);
    targetBtn.textContent = `Target: ${state.target} FPS`;
    targetBtn.classList.toggle('on', state.fps);
  };
  sync();
  const firstBuild = rebuild();

  // ---- The loop: they walk their circles; frames per second, averaged over a second ----
  let last = performance.now();
  let frames = 0;
  let acc = 0;
  let worst = 0;
  let fps = 0;
  let worstShown = 0;
  let t = 0;
  const camAt = new THREE.Vector3(), scaleAt = new THREE.Vector3();
  let lastReal = 0;
  const tick = (now: number, gameDt?: number) => {
    if (!embed) requestAnimationFrame(tick);
    const ms = gameDt !== undefined ? gameDt * 1000 : Math.max(0, now - last);
    last = now;
    const frameStart = performance.now();
    const dt = Math.min(0.05, ms / 1000);
    t += dt;
    let simulating = 0;
    // (in a game she may be anywhere, at any size, even riding a bug: where she is and how big, in the world)
    if (embed) camera.getWorldPosition(camAt); else camAt.copy(camera.position);
    for (const p of people) {
      const at = embed ? p.root.getWorldPosition((p.at ??= new THREE.Vector3())) : p.root.position;
      const unit = embed ? p.root.getWorldScale(scaleAt).x || 1 : 1;
      p.dist = Math.hypot(camAt.x - at.x, camAt.y - (at.y + 1.4 * unit), camAt.z - at.z) / unit;
      if (p.lods.length && p.root.visible) { // (someone out of view keeps the level she had: no baking for nobody to see)
        // AUTO detail: her level by her distance from the camera (a level is only left once she is 10% past
        // its edge, so someone walking along an edge doesn't flicker between two)
        const d = p.dist; // (to her middle)
        let band = p.band ?? p.level;
        while (band > 0 && d < TABLE[band - 1].within * 0.95) band--;
        while (band < TABLE.length - 1 && d > TABLE[band].within * 1.05) band++;
        p.band = band;
        const level = band;
        if (level !== p.level) {
          p.level = level;
          for (const l of p.lods) {
            l.mesh.geometry = l.geos[level] ??= l.make(level);
            // (her skin's fine bump picture only on the heavier levels: see paintedMaterial)
            const mat = TABLE[level].detail >= 25 ? l.fine : l.plain;
            if (mat) l.mesh.material = mat;
            if (l.liveSet) {
              // (AUTO LITE: all her shapes when she is drawn live, her four motion shapes when she is baked)
              const set = TABLE[level].live ? l.liveSet : l.bakedSet;
              l.mesh.morphTargetDictionary = set?.dict;
              l.mesh.morphTargetInfluences = set?.influences;
              if (l.soft) { l.soft.influences = set?.influences ?? []; l.soft.at = MOTION_TARGETS.map((name) => set?.dict[name] ?? -1); }
            }
            if (TABLE === AUTO && level >= AUTO_DROP_FROM) for (let k = 0; k < 2; k++) { l.geos[k]?.dispose(); l.geos[k] = null; }
          }
        }
      }
      // (her own walking speed along the ground, in this room's units: round her circle, or what the game says)
      const pace = embed ? (p.speedNow ?? 0) / unit : Math.abs(p.speed) * p.radius;
      const walking = embed ? pace > 0.05 : state.motion !== 'idle';
      if (walking && !embed) p.angle += p.speed * dt;
      const x = Math.cos(p.angle) * p.radius;
      const z = Math.sin(p.angle) * p.radius;
      const m = p.live;
      // (someone out of view isn't posed either, unless her tee is being simulated on her: her place on her circle goes on)
      if (m && (p.root.visible || (p.cloth && p.cloth.phase !== 'frozen'))) {
        // The builder's own pose for this frame: standing and breathing, or a step of her walk with its weight
        if (walking) m.walked += pace * dt;
        const phase = ((m.walked * m.perUnit) / humanStride(m.measure, 'walk', m.carry)) % 1;
        let turns = poseHuman(m.measure, m.rig.bind, { stance: walking ? 'walk' : 'stand', phase, seconds: t + p.phase, lean: 0, carry: m.carry }, m.out);
        if (walking) turns = weighWalk(m.measure, turns, walkWeight(phase, 'walk'), m.out2);
        m.rig.apply(turns);
        // Her belly's and bust's weight: the walk's bounce and sway, felt by their springs (the builder's own rule)
        const stride = humanStride(m.measure, 'walk', m.carry);
        const strideSeconds = walking ? stride / Math.max(1e-6, pace * m.perUnit) : 0;
        const upA = walking ? walkBounceAccel(phase, strideSeconds) : 0;
        const leftA = walking ? walkSwayAccel(phase, strideSeconds) : 0;
        stepBellySpring(m.belly, dt, upA, leftA);
        stepBreastSpring(m.breast, dt, upA, leftA);
        motionWeights(m.bumpPercent, m.belly, m.breast, m.weights);
        for (const sm of m.soft) for (let k = 0; k < 4; k++) if (sm.at[k] >= 0) sm.influences[sm.at[k]] = m.weights[k];
      }
      if (!embed) {
        p.root.position.set(x, m ? 0 : Math.abs(Math.sin(t * 5 + p.phase)) * 0.05, z);
        p.root.rotation.y = -p.angle + (p.speed > 0 ? 0 : Math.PI); // (facing the way she goes)
      }
      p.cloth?.update(dt);
      if (p.cloth && p.cloth.phase !== 'frozen') simulating++;
    }
    // THE CLOTH TEES' QUEUE: a tee being simulated is several milliseconds of every frame, and a copy of her whole
    // body in memory. So only a few are simulated at once: frozen once dressed, the next in line takes its place, a
    // few at a time until everybody is dressed; simulated for good, the first few wear cloth and the rest wait in paint.
    const putOn = (q: Person, freeze: boolean) => {
      q.cloth?.dispose();
      q.cloth = undefined;
      try { q.cloth = q.clothMake!(freeze); } catch (e) { q.clothMake = undefined; console.error('[devroom] the cloth tee could not be put on her', e); state.error = `No cloth tee: ${e instanceof Error ? e.message : String(e)}`; }
    };
    if (simulating < (state.cloth === 'live' ? CLOTH_SIMULATED_AT_MOST : CLOTH_DRESSING_AT_ONCE)) {
      const next = people.find((q) => q.clothMake && !q.cloth);
      if (next) putOn(next, state.cloth !== 'live');
    }
    // NEAR THE CAMERA (v0.42; Joshua: "0-3m = 3% + Live/Sim On", beyond it off): everybody is dressed and frozen as
    // above; then whoever comes within CLOTH_NEAR of the camera has her tee simulated again (the nearest first, at most
    // CLOTH_DRESSING_AT_ONCE at once), and it is frozen again as it hangs when she has gone back past it.
    if (state.cloth === 'near') {
      for (const q of people) if (q.cloth && q.cloth.phase !== 'frozen' && q.clothNear && (q.dist ?? 0) > CLOTH_NEAR * 1.1) { q.cloth.release(); q.clothNear = false; }
      if (simulating < CLOTH_DRESSING_AT_ONCE && !people.some((q) => q.clothMake && !q.cloth)) {
        const near = people.filter((q) => q.clothMake && q.cloth?.phase === 'frozen' && (q.dist ?? Infinity) < CLOTH_NEAR * 0.95).sort((a, b) => a.dist! - b.dist!)[0];
        if (near) { putOn(near, false); near.clothNear = true; }
      }
    }
    if (!embed) {
      camera.position.set(Math.sin(view.yaw) * Math.cos(view.pitch) * view.dist, Math.sin(view.pitch) * view.dist + 1.2, Math.cos(view.yaw) * Math.cos(view.pitch) * view.dist);
      camera.lookAt(0, 1.2, 0);
    }
    // OUT OF VIEW, NOT DRAWN (v0.43; Joshua: "hide completely models that are not in the camera viewing frame... as
    // soon as the camera or person walks into the camera view, it shows"). three.js can't do this for these bodies by
    // itself (a skinned body's own bounds are its rest pose's, so its culling is off): each person is a ball round her
    // middle, tested against the camera's view. The ball is wide enough for her stride, and for her shadow while
    // shadows are on, so a shadow doesn't vanish from the picture while its owner is just outside it.
    inView = 0;
    if (state.cull) {
      camera.updateMatrixWorld();
      frustum.setFromProjectionMatrix(cullMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      cullBall.radius = state.shadows ? 4.5 : 2.4;
    }
    seen.length = 0;
    // (FADE: off for the ALL IN VIEW stress test, which is there to count how many can be drawn at once)
    const whole = stress.on && stress.mode === 'view';
    const fading = state.fade && !whole, ranging = state.fps && !whole;
    // (where nobody is drawn any more: SMART FPS's draw range, or without it the fade's own 18 m; and the stretch
    // before it that she fades over. Smart FPS without the fade is a hard edge.)
    fadeEnd = ranging ? smart.range : fading ? FADE.end : Infinity;
    const fadeBand = !fading ? 0 : ranging ? smart.edge : FADE.end - FADE.start;
    near.length = 0;
    let reach = 0;
    let fadeUnit = 1;
    if (embed) {
      // (in a game the spot is the player's own character, and a metre is a person's own: the camera itself while
      // it is within 4 of her metres of the player, otherwise the point 4 m from the player on the way to it)
      fadeUnit = people.length ? people[0].root.getWorldScale(scaleAt).x || 1 : 1;
      const spot = embed.focus?.() ?? camAt;
      const d = camAt.distanceTo(spot), k = Math.min(1, (4 * METRE * fadeUnit) / Math.max(0.001, d));
      fadeFrom.copy(spot).lerp(camAt, k);
    } else {
      const d = Math.hypot(camera.position.x, camera.position.y - 1.2, camera.position.z), k = Math.min(1, (4 * METRE) / Math.max(0.001, d));
      fadeFrom.set(camera.position.x * k, 1.2 + (camera.position.y - 1.2) * k, camera.position.z * k);
    }
    inView = 0;
    for (const p of people) {
      const unit = embed ? p.root.getWorldScale(scaleAt).x || 1 : 1, at = embed && p.at ? p.at : p.root.position;
      let show = !state.cull || frustum.intersectsSphere(new THREE.Sphere(cullAt.set(at.x, at.y + 1.4 * unit, at.z), cullBall.radius * unit));
      if (show) inView++;
      p.inView = show;
      let f = 1;
      if (fading || ranging) {
        // (v0.51, Joshua: "if I zoom out too far, they all disappear... make it distance away from the player's
        // character and the camera, that way there is always people shown even zoomed way out". The room has no
        // player, so the spot the camera looks at, its middle, stands in for one: she is as far as the nearer of the two.)
        // (v0.53, Joshua: "kind of random who fades and who doesn't and sometimes places the fade person closer
        // and others further are normal". The nearer of two points made two bubbles, one round the camera and one
        // round the middle, and someone between them faded while people behind her didn't. Now it is ONE point,
        // `fadeFrom`: the camera itself while it is within 4 m of the spot it looks at, and otherwise the point
        // 4 m from that spot on the way to the camera. So from the camera's side, nearer is always more solid.)
        p.far = embed ? Math.hypot(fadeFrom.x - at.x, fadeFrom.y - (at.y + 1.4 * unit), fadeFrom.z - at.z) / unit : Math.hypot(fadeFrom.x - p.root.position.x, fadeFrom.y - 1.4, fadeFrom.z - p.root.position.z);
        if (show) { near.push(p); if (p.far > reach) reach = p.far; }
        f = fadeBand > 0 ? THREE.MathUtils.clamp((fadeEnd - p.far) / fadeBand, 0, 1) : p.far < fadeEnd ? 1 : 0;
        if (f <= 0) show = false;
      }
      p.fade.value = f;
      p.root.visible = show;
      if (show) seen.push(p);
    }
    drawn = seen.length;
    smart.shown = drawn;
    if (ranging) {
      // (SMART FPS: the range is where its number of people ends: just short of the first one too many. It glides
      // there, quicker coming in than going out, so a cut is a quick fade and not a pop.)
      let want = Math.min(SMART.most, reach + smart.edge);
      smart.bound = near.length > smart.count;
      if (smart.bound) {
        near.sort((a, b) => (a.far ?? 0) - (b.far ?? 0));
        want = THREE.MathUtils.clamp(near[smart.count].far ?? want, SMART.least, SMART.most);
      }
      smart.range += (want - smart.range) * Math.min(1, (ms / 1000) * (want < smart.range ? 5 : 2));
      smart.edge = THREE.MathUtils.clamp(smart.range * 0.15, 1 * METRE, 3 * METRE);
    }
    // (someone not drawn is taken out of the scene: 400 people are some 40,000 bones, and three.js works out where
    // every bone in the scene is each frame, drawn or not. That was most of the cost of a big crowd out of view.)
    if (!embed) for (const p of people) {
      const on = p.root.visible;
      if (on !== p.shown) { p.shown = on; if (on) scene.add(p.root); else scene.remove(p.root); }
    }
    for (const p of people) p.cloth?.show(p.root.visible);
    if (embed) {
      // (the game draws its own picture; smart FPS judges by the clock's own time between its frames)
      const real = performance.now();
      if (lastReal) smartTick(real - lastReal, real - frameStart);
      lastReal = real;
      return;
    }
    renderer.info.reset();
    renderer.render(scene, camera);
    // (how long this frame's own work took, start to end: unlike the frame rate, the screen's refresh doesn't round it)
    smartTick(ms, performance.now() - frameStart);
    if (document.hidden || ms > 3000) return; // (back from the background: not a frame time)
    stressTick(ms);
    recTick(ms);
    frames++;
    acc += ms;
    worst = Math.max(worst, ms);
    if (acc >= 1000) {
      fps = (frames * 1000) / acc;
      worstShown = worst;
      frames = 0;
      acc = 0;
      worst = 0;
      paint();
    }
  };
  /** The cloth tees' line of the readout: how many are where, and what the simulated ones cost a frame. */
  const clothLine = () => {
    if (state.cloth === 'off') return '';
    const worn = people.filter((q) => q.cloth), frozen = worn.filter((q) => q.cloth!.phase === 'frozen'), live = worn.filter((q) => q.cloth!.phase !== 'frozen');
    const waiting = people.filter((q) => q.clothMake && !q.cloth).length;
    const costs = live.map((q) => q.cloth!.cost()), ms = costs.reduce((a, c) => a + c.ms, 0);
    const triangles = worn.reduce((a, q) => a + q.cloth!.cost().triangles, 0);
    const parts = [
      live.length ? `${live.length} simulated · ${ms.toFixed(ms < 10 ? 1 : 0)} ms a frame${costs[0] ? ` · ${costs[0].points} points each` : ''}` : '',
      frozen.length ? `${frozen.length} frozen` : '',
      waiting ? `${waiting} waiting${state.cloth === 'live' ? ` (at most ${CLOTH_SIMULATED_AT_MOST} simulated at once)` : ''}` : '',
    ].filter(Boolean);
    return `cloth tees: ${parts.join(' · ') || 'none yet'}${triangles ? ` · ${(triangles / 1000).toFixed(0)}k triangles` : ''}`;
  };
  const paint = () => {
    {
      const info = state.info;
      const r = renderer.info.render;
      stat.innerHTML = '';
      const big = document.createElement('div');
      big.className = 'dr-fps';
      big.textContent = `${fps.toFixed(0)} FPS`;
      big.style.color = fps >= 50 ? '#7dffa0' : fps >= 30 ? '#ffd166' : '#ff7b7b';
      stat.appendChild(big);
      const lines = [
        `slowest frame ${worstShown.toFixed(0)} ms`,
        `${people.length} x ${state.model.label}${state.cull ? ` · ${inView} in view` : ''}${drawn < inView ? ` · ${drawn} drawn` : ''}`,
        stress.on && stress.mode === 'view' ? 'smart FPS and fade: off for this test'
          : state.fps ? `smart FPS: up to ${smart.count} people, to ${(smart.range / METRE).toFixed(0)} m · ${smart.doing} · target ${state.target}`
          : state.fade ? 'fade: from 15 m · gone at 18 m' : '',
        `${(r.triangles / 1e6).toFixed(2)}M triangles drawn · ${r.calls} draw calls`,
        state.auto && people.some((q) => q.lods.length)
          ? `auto${TABLE === AUTO ? '' : TABLE === AUTO_LITE ? ' lite' : ' live'}: ${TABLE.map((a, k) => [`${a.detail}%${a.live ? ' live' : ''}`, people.filter((q) => q.level === k).length] as const).filter(([, c]) => c > 0).map(([d, c]) => `${c} at ${d}`).join(' · ')}`
          : state.perChar ? `each character: ${(state.perChar / 1000).toFixed(1)}k triangles as drawn` : '',
        clothLine(),
        info ? `the file: ${(info.tris / 1000).toFixed(0)}k triangles · ${info.mb.toFixed(1)} MB · loaded in ${(info.ms / 1000).toFixed(1)} s` : '',
        `screen ${renderer.domElement.width} x ${renderer.domElement.height}`,
        state.loading,
        state.error,
      ].filter(Boolean);
      stat.appendChild(document.createTextNode(lines.join('\n')));
    }
  };
  onBuilt = paint;
  if (embed) {
    // 🧍 THE CROWD'S HANDLE for the game (see Crowd, at the top)
    // (🧪 development builds only: a test machine draws at 1 to 4 fps, so smart FPS draws nobody; this lets a test
    // switch it off to take a picture)
    if (import.meta.env.DEV) (window as unknown as { __crowd: unknown }).__crowd = { state, smart };
    let dealt = 0, dealtMen = 0;
    // 👨 HIS BODY (v0.93), loaded once hers is in (so the women walk in first), and made ready as hers is
    let maleSrc: Loaded | null = null;
    void firstBuild.then(async () => {
      try {
        const src = await load(MALE_MODEL);
        await applyModelSettings(src);
        maleSrc = src;
        console.info(`[devroom] his body is in: ${src.mb.toFixed(1)} MB, ${src.hairs.size} hairstyles, ${src.tris} triangles`);
      } catch (e) { cache.delete(MALE_MODEL.key); console.error('[devroom] no male body', e); }
    });
    return {
      ready: firstBuild.then(() => !!lastSrc),
      get men() { return !!maleSrc; },
      add: ({ bump, cloth, male }) => {
        if (male && !maleSrc) return null;
        if (!male && !lastSrc) return null;
        // (her looks dealt as the room's random ones are, then her belly as the game rolled it; his are his own)
        hooks.tweak = male ? null : (look) => ({ ...look, bump, paint: !cloth });
        let p: Person;
        try { p = male ? makePerson(MALE_MODEL, maleSrc!, dealtMen++) : makePerson(state.model, lastSrc!, dealt++); } finally { hooks.tweak = null; }
        people.push(p);
        return {
          root: p.root,
          get speed() { return p.speedNow ?? 0; },
          set speed(v: number) { p.speedNow = v; },
          dispose: () => { const k = people.indexOf(p); if (k >= 0) people.splice(k, 1); disposePerson(p); },
        };
      },
      step: (dt) => tick(performance.now(), dt),
      info: () => `${drawn} of ${people.length} people drawn${maleSrc ? '' : ' (his body loading)'} · smart FPS ${smart.doing}, up to ${smart.count} to ${(smart.range / METRE).toFixed(0)} m · ${smart.rate.toFixed(0)} fps`,

    };
  }
  requestAnimationFrame(tick);
  renderer.info.autoReset = false;

  // (for the headless tests)
  (window as unknown as { devRoom: unknown }).devRoom = Object.assign(hooks, { stressTest: STRESS, stressLines: () => stress.lines, state, people, renderer, looks: LOOKS, randomLook, randomManLook, get fps() { return fps; } });
}
