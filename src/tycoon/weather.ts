// ============================================================================
// weather.ts — 🌙🌧️🌬️ DAY & NIGHT, RAIN AND WIND (v0.91): the airfield's sky.
//
//   ☀️🌙 THE DAY goes round in about eight and a half minutes of play: a long day, a short dusk, a night, a dawn.
//        The sky, the fog, the sun and the sky light all turn with it (the night is moonlit, never black). At night
//        the RUNWAY LIGHTS come on (pale lamps down both edges, green where planes touch down and red at the far
//        end), fireflies drift over the field, and NIGHT FLIGHTS PAY MORE (`NIGHT_BONUS` of every fare).
//   🌧️🌈 RAIN every few minutes, for 45 s: the nectar flowers fill twice as fast (it replaces the dew shower) and
//        every plane taxis and flies a little slower. A RAINBOW follows it for a minute: fares pay `BOW_BONUS` more.
//   🌬️   THE WIND turns now and then. Planes take off and land INTO it, so the runways change direction: the
//        holding circle moves to the other end, the windsock swings round and the green and red lamps swap ends.
//
// The airfield asks: which way (`dir`), how much more a fare pays (`bonus`), how fast planes and flowers go
// (`planeMult`, `flowerMult`), what to say (`alert`, `label`). Only played time counts, and the sky stands still
// (a fine morning) during the tutorial. Every number here is GAME TUNING.
// ============================================================================
import * as THREE from 'three';
import type { Hud } from '../ui/hud';
import { AT, type FieldDef } from './data';
import { PAL } from './kit';

/** Seconds of each part of the day (played time). */
export const DAY = { day: 300, dusk: 30, night: 150, dawn: 30 };
const TOTAL = DAY.day + DAY.dusk + DAY.night + DAY.dawn;
/** How much more every fare pays at night, and under a rainbow (they add up). */
export const NIGHT_BONUS = 0.25;
export const BOW_BONUS = 0.5;
const RAIN = { secs: 45, bow: 60, first: [150, 240], wait: [240, 400], plane: 0.8, flower: 2 };
const WIND = { first: [200, 300], wait: [220, 360] };

export interface WeatherHooks {
  scene: THREE.Scene;
  camera: THREE.Camera;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  hud: Hud;
  /** How high the surface is (the runway's top). */
  ground: (x: number, z: number) => number;
  /** Tell the windsock which way to stream (a yaw). */
  sock: (yaw: number) => void;
}

const rand = ([a, b]: number[]) => a + Math.random() * (b - a);
const C = (hex: number) => new THREE.Color(hex);
/** The sky by day, at dusk and at night; the sun's light; the sky light's two colours. */
const SKY = [C(PAL.sky), C(0xf0a875), C(0x14224a)];
const SUN = [C(0xffffff), C(0xffc48a), C(0x9db6ff)];
const HEMI_UP = [C(0xffffff), C(0xffd9b8), C(0x8ea4ea)];
const HEMI_DOWN = [C(0x8d6e4a), C(0x7a5a4a), C(0x2b3555)];
const GREY = C(0x8496a8);
const LAMP = { edge: C(0xfff0b8), green: C(0x6dff8a), red: C(0xff5a4a) };

/** `a` by day, `b` at the middle of dusk, `c` at night. */
function three(out: THREE.Color, [a, b, c]: THREE.Color[], dark: number) {
  return dark < 0.5 ? out.copy(a).lerp(b, dark * 2) : out.copy(b).lerp(c, (dark - 0.5) * 2);
}

/** A soft round glow (white in the middle, nothing at its edge). */
function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const FLIES = 48;
const FLY_BOX = 64;
/** 🏮 Your lantern: how bright at night, how far it reaches, how high it hangs. */
const LANTERN = { power: 50, reach: 34, up: 7 };

export class Weather {
  /** 🌬️ +1: planes take off and land toward the east (+x). -1: toward the west. */
  dir: 1 | -1 = 1;
  rain = false;
  rainbow = false;
  /** Seconds into the day (0 = morning). */
  private t = 0;
  /** 0 by day .. 1 at night (and 0..1 how wet the sky is). */
  private dark = 0;
  private wet = 0;
  private wasNight = false;
  private rainT = rand(RAIN.first);
  private windT = rand(WIND.first);
  private tick = 0;
  // the lamps along the runways
  private lamps = new THREE.Group();
  private bulbMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
  private poolMat: THREE.MeshBasicMaterial;
  private lampKey = '';
  // fireflies, stars and the moon
  private flies: THREE.Points;
  private flySeed: { x: number; y: number; z: number; p: number; s: number }[] = [];
  private sky = new THREE.Group();
  private starMat: THREE.PointsMaterial;
  private moonMat = new THREE.MeshBasicMaterial({ color: 0xf6f2dc, transparent: true, opacity: 0, fog: false, depthWrite: false });
  /**
   * 🏮 YOUR LANTERN: one warm light that hangs over wherever you're looking (your ant, or the plane you're watching)
   * and comes on at dusk, so the night is moonlit far off and warm close by. It's in the scene all day at no
   * brightness: a light that appeared at dusk would make every material compile again, a hitch each evening.
   */
  private lantern = new THREE.PointLight(0xffc58a, 0, LANTERN.reach, 1.5);
  private storm = document.getElementById('storm');
  private bow: HTMLElement;
  private tmp = new THREE.Color();

  constructor(private h: WeatherHooks, saved?: { t?: number; dir?: number }) {
    this.t = Math.max(0, saved?.t ?? 0) % TOTAL;
    this.dir = saved?.dir === -1 ? -1 : 1;
    this.dark = this.darkAt(this.t);
    this.wasNight = this.night;
    const glow = glowTexture();
    this.poolMat = new THREE.MeshBasicMaterial({ map: glow, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    this.lamps.visible = false;
    h.scene.add(this.lamps, this.lantern);

    // ✨ fireflies: a handful of soft green-gold lights drifting about wherever you are
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(FLIES * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(FLIES * 3), 3));
    for (let i = 0; i < FLIES; i++) this.flySeed.push({ x: Math.random() * FLY_BOX, y: 2.5 + Math.random() * 7, z: Math.random() * FLY_BOX, p: Math.random() * 20, s: 0.5 + Math.random() * 0.8 });
    this.flies = new THREE.Points(geo, new THREE.PointsMaterial({ size: 2.4, map: glow, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.flies.frustumCulled = false;
    this.flies.visible = false;
    h.scene.add(this.flies);

    // ⭐ the stars and the moon (seen when you look up: your ant's own eyes)
    const N = 240;
    const stars = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const a = Math.random() * Math.PI * 2;
      const up = 0.08 + Math.random() * 0.92;
      const r = Math.sqrt(1 - up * up);
      stars.set([Math.cos(a) * r * 700, up * 700, Math.sin(a) * r * 700], i * 3);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(stars, 3));
    this.starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
    const points = new THREE.Points(sg, this.starMat);
    points.frustumCulled = false;
    const moon = new THREE.Mesh(new THREE.CircleGeometry(30, 28), this.moonMat);
    moon.position.set(-260, 330, -560);
    moon.lookAt(0, 0, 0);
    this.sky.add(points, moon);
    this.sky.visible = false;
    this.sky.renderOrder = -1;
    h.scene.add(this.sky);

    // 🌈 the rainbow: a faint arc over the top of the view
    if (!document.getElementById('weatherCss')) {
      const css = document.createElement('style');
      css.id = 'weatherCss';
      css.textContent = `.rainbow{position:fixed;inset:0;pointer-events:none;opacity:0;transition:opacity 3s ease;z-index:0;
        background:radial-gradient(circle 75vw at 50% calc(34vh - 75vw),transparent 90.5%,rgba(160,90,255,.27) 92%,rgba(70,130,255,.27) 93.5%,rgba(60,210,120,.27) 95%,rgba(255,235,80,.3) 96.5%,rgba(255,150,50,.3) 98%,rgba(255,70,70,.27) 99.3%,transparent 100%)}
        .rainbow.on{opacity:1}`;
      document.head.appendChild(css);
    }
    this.bow = document.createElement('div');
    this.bow.className = 'rainbow';
    (this.storm?.parentElement ?? document.body).insertBefore(this.bow, this.storm?.nextSibling ?? null);
    this.h.sock(this.sockYaw);
    this.light();
  }

  /** 🏮 Where you're looking (the camera's target): the lantern hangs over it. */
  follow(at: THREE.Vector3) {
    this.lantern.position.set(at.x, at.y + LANTERN.up, at.z + 3);
  }

  /** What to keep in the save. */
  saved() {
    this.keep.t = Math.round(this.t);
    this.keep.dir = this.dir;
    return this.keep;
  }
  private keep = { t: 0, dir: 1 };
  /** 🌙 It's night (the lamps are on, and flights pay more). */
  get night() {
    return this.dark >= 0.5;
  }
  /** How much MORE every fare pays right now (0.25 = a quarter more). */
  get bonus() {
    return (this.night ? NIGHT_BONUS : 0) + (this.rainbow ? BOW_BONUS : 0);
  }
  get planeMult() {
    return this.rain ? RAIN.plane : 1;
  }
  get flowerMult() {
    return this.rain ? RAIN.flower : 1;
  }
  /** What the bonus is for (the words floated over a plane as it's paid). */
  get bonusName() {
    return this.rainbow ? (this.night ? '🌈🌙 Rainbow night' : '🌈 Rainbow') : '🌙 Night';
  }
  /** The windsock streams DOWNWIND: planes head into the wind, so it points the other way. */
  private get sockYaw() {
    return this.dir > 0 ? Math.PI : 0;
  }

  private darkAt(t: number) {
    if (t < DAY.day) return 0;
    if (t < DAY.day + DAY.dusk) return (t - DAY.day) / DAY.dusk;
    if (t < DAY.day + DAY.dusk + DAY.night) return 1;
    return 1 - (t - DAY.day - DAY.dusk - DAY.night) / DAY.dawn;
  }

  /** The time on the airfield's clock (7 AM .. 7 PM by day, the night from 8:30 PM to 5:30 AM). */
  private get hour() {
    const t = this.t;
    if (t < DAY.day) return 7 + (t / DAY.day) * 12;
    if (t < DAY.day + DAY.dusk) return 19 + ((t - DAY.day) / DAY.dusk) * 1.5;
    if (t < DAY.day + DAY.dusk + DAY.night) return (20.5 + ((t - DAY.day - DAY.dusk) / DAY.night) * 9) % 24;
    return 5.5 + ((t - DAY.day - DAY.dusk - DAY.night) / DAY.dawn) * 1.5;
  }
  /** For the corner of the screen: "☀️ 2 PM", "🌙 11 PM". */
  label() {
    const h = Math.floor(this.hour);
    const icon = this.rain ? '🌧️' : this.dark >= 0.5 ? '🌙' : this.dark > 0 ? (this.t < DAY.day + DAY.dusk ? '🌇' : '🌅') : '☀️';
    return `${icon} ${((h + 11) % 12) + 1} ${h < 12 ? 'AM' : 'PM'}`;
  }

  /** What's going on, for the alert above the flight chips (the rain and the rainbow count down). */
  alert(): { text: string; bad: boolean } | null {
    if (this.rain) return { text: `🌧️ Rain · flowers fill ×2 · planes slower · ${Math.max(0, Math.ceil(this.rainT))}s`, bad: false };
    if (this.rainbow) return { text: `🌈 Rainbow · fares +${Math.round(BOW_BONUS * 100)}% · ${Math.max(0, Math.ceil(this.rainT))}s`, bad: false };
    return null;
  }

  /** `active` = the day, the rain and the wind move on (not during the tutorial). `fields` = the runways in use. */
  update(dt: number, active: boolean, focus: THREE.Vector3, fields: FieldDef[]) {
    this.tick += dt;
    if (active) {
      this.t = (this.t + dt) % TOTAL;
      // 🌧️ rain, then its rainbow, then a dry spell
      this.rainT -= dt;
      if (this.rainT <= 0) {
        if (this.rain) {
          this.rain = false;
          this.rainbow = true;
          this.rainT = RAIN.bow;
          this.storm?.classList.remove('on', 'dew');
          this.bow.classList.add('on');
          this.h.hud.banner('🌈 A rainbow!', `Every fare pays +${Math.round(BOW_BONUS * 100)}% while it lasts`, 3600);
        } else if (this.rainbow) {
          this.rainbow = false;
          this.rainT = rand(RAIN.wait);
          this.bow.classList.remove('on');
        } else {
          this.rain = true;
          this.rainT = RAIN.secs;
          this.storm?.classList.add('on', 'dew');
          this.h.hud.banner('🌧️ Rain!', 'The nectar flowers fill twice as fast · planes taxi and fly a little slower', 3800);
        }
      }
      // 🌬️ the wind turns
      this.windT -= dt;
      if (this.windT <= 0) {
        this.windT = rand(WIND.wait);
        this.dir = this.dir > 0 ? -1 : 1;
        this.h.sock(this.sockYaw);
        this.h.hud.banner('🌬️ The wind has turned', `Planes now take off and land toward the ${this.dir > 0 ? 'EAST ➡️' : 'WEST ⬅️'}`, 3800);
      }
    }
    this.dark = this.darkAt(this.t);
    if (this.night !== this.wasNight) {
      this.wasNight = this.night;
      if (this.night) this.h.hud.banner('🌙 Night falls', `The runway lights are on · night flights pay +${Math.round(NIGHT_BONUS * 100)}%`, 3800);
      else this.h.hud.banner('☀️ Good morning!', 'A new day at Anthill Airways', 2800);
    }
    this.wet += ((this.rain ? 1 : 0) - this.wet) * Math.min(1, dt * 0.5);
    this.light();
    this.updateLamps(fields);
    this.updateFlies(focus);
    // (the stars and the moon stay round the camera, so they're always far away)
    this.sky.visible = this.dark > 0.02;
    if (this.sky.visible) {
      this.sky.position.copy(this.h.camera.position).setY(0);
      this.starMat.opacity = Math.max(0, this.dark * 1.4 - 0.4) * (1 - this.wet * 0.8);
      this.moonMat.opacity = this.dark * (1 - this.wet * 0.6);
    }
  }

  /** The sky's colour, the fog, the sun and the sky light. */
  private light() {
    const { scene, sun, hemi } = this.h;
    const d = this.dark;
    const w = this.wet;
    const sky = three(this.tmp, SKY, d);
    // (rain greys it: by day toward a pale grey, at night only a little)
    sky.lerp(GREY, w * (0.7 - 0.5 * d));
    if (scene.background instanceof THREE.Color) scene.background.copy(sky);
    scene.fog?.color.copy(sky);
    three(sun.color, SUN, d);
    sun.intensity = THREE.MathUtils.lerp(2.2, 0.7, d) * (1 - 0.4 * w);
    this.lantern.intensity = LANTERN.power * THREE.MathUtils.smoothstep(d, 0.3, 0.8);
    three(hemi.color, HEMI_UP, d);
    three(hemi.groundColor, HEMI_DOWN, d);
    hemi.intensity = THREE.MathUtils.lerp(1.6, 1.1, d) * (1 - 0.12 * w);
  }

  // --------------------------------------------------------------------------
  // 💡 The runway lights
  // --------------------------------------------------------------------------
  private updateLamps(fields: FieldDef[]) {
    const key = `${fields.length}|${this.dir}`;
    if (key !== this.lampKey) {
      this.lampKey = key;
      this.layLamps(fields);
    }
    this.lamps.visible = true;
    // (by day they're small unlit fittings; at dusk they come on, with a pool of light on the ground under each)
    const on = THREE.MathUtils.smoothstep(this.dark, 0.25, 0.7);
    this.bulbMat.color.setScalar(0.42 + 0.58 * on);
    this.poolMat.opacity = 0.5 * on;
    this.poolMat.visible = on > 0.01;
  }

  private layLamps(fields: FieldDef[]) {
    for (const o of [...this.lamps.children]) {
      o.removeFromParent();
      (o as THREE.InstancedMesh).geometry.dispose();
    }
    const spots: { x: number; z: number; c: THREE.Color; big?: boolean }[] = [];
    fields.forEach((f, k) => {
      const rw = f.runway;
      const x0 = rw.x - rw.length / 2 + 3;
      const x1 = rw.x + rw.length / 2 - 3;
      const edge = rw.width / 2 - 1.1;
      // down both edges, one every 8 (not where the people's crossing goes over the first runway)
      for (let x = x0 + 6; x < x1 - 5; x += 8) {
        if (k === 0 && Math.abs(x - AT.crossing.x) < 5) continue;
        for (const s of [-1, 1]) spots.push({ x, z: rw.z + s * edge, c: LAMP.edge });
      }
      // across each end: green where planes touch down (they land toward `dir`), red at the far end
      for (let i = 0; i < 5; i++) {
        const z = rw.z - edge + (i / 4) * edge * 2;
        spots.push({ x: x0, z, c: this.dir > 0 ? LAMP.green : LAMP.red, big: true });
        spots.push({ x: x1, z, c: this.dir > 0 ? LAMP.red : LAMP.green, big: true });
      }
    });
    if (!spots.length) return;
    const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.3, 8, 6), this.bulbMat, spots.length);
    const pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), this.poolMat, spots.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    spots.forEach((s, i) => {
      const y = this.h.ground(s.x, s.z);
      m.compose(new THREE.Vector3(s.x, y + 0.22, s.z), q, new THREE.Vector3(1, 1, 1).multiplyScalar(s.big ? 1.25 : 1));
      bulbs.setMatrixAt(i, m);
      bulbs.setColorAt(i, s.c);
      m.compose(new THREE.Vector3(s.x, y + 0.07, s.z), q, new THREE.Vector3(s.big ? 5 : 6.5, 1, s.big ? 5 : 6.5));
      pools.setMatrixAt(i, m);
      pools.setColorAt(i, s.c);
    });
    bulbs.frustumCulled = pools.frustumCulled = false;
    pools.renderOrder = 3;
    this.lamps.add(pools, bulbs);
  }

  // --------------------------------------------------------------------------
  // ✨ Fireflies
  // --------------------------------------------------------------------------
  private updateFlies(focus: THREE.Vector3) {
    const on = THREE.MathUtils.smoothstep(this.dark, 0.45, 0.9) * (1 - this.wet);
    this.flies.visible = on > 0.01;
    if (!this.flies.visible) return;
    const pos = this.flies.geometry.getAttribute('position') as THREE.BufferAttribute;
    const col = this.flies.geometry.getAttribute('color') as THREE.BufferAttribute;
    const t = this.tick;
    this.flySeed.forEach((f, i) => {
      // (each keeps its own place in the world, wrapped round so there are always some about you)
      const wx = f.x + Math.sin(t * 0.31 * f.s + f.p) * 5;
      const wz = f.z + Math.cos(t * 0.27 * f.s + f.p * 1.7) * 5;
      const x = focus.x + ((((wx - focus.x) % FLY_BOX) + FLY_BOX * 1.5) % FLY_BOX) - FLY_BOX / 2;
      const z = focus.z + ((((wz - focus.z) % FLY_BOX) + FLY_BOX * 1.5) % FLY_BOX) - FLY_BOX / 2;
      pos.setXYZ(i, x, f.y + Math.sin(t * 0.9 * f.s + f.p) * 1.2, z);
      // a slow blink: lit about a third of the time
      const blink = Math.max(0, Math.sin(t * 1.3 * f.s + f.p * 3)) ** 3 * on;
      col.setXYZ(i, 0.85 * blink, 1.0 * blink, 0.35 * blink);
    });
    pos.needsUpdate = col.needsUpdate = true;
  }
}
