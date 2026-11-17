// ============================================================================
// tycoonMain.ts — starts 🐜✈️ AIRPORT TYCOON (v0.68), the insect-scale airport run by your fire ant colony.
//
// A save slot whose campaign is 'tycoon' plays this (Settings → 💾 a new slot → 🐜✈️ Airport Tycoon). main.ts
// sets up what every game shares (renderer, HUD, sounds, input, the save, Settings) and hands over here; the
// world itself is tycoon/airfield.ts. This file wires it to the HUD and runs the main loop (the same shape as
// homeMain.ts: saving, offline earnings, auto quality, the minimap, first/third person).
// ============================================================================
import * as THREE from 'three';
import type { Hud } from '../ui/hud';
import type { Sfx } from '../core/audio';
import type { Input } from '../core/input';
import { SaveData, writeSave } from '../core/save';
import type { Progress, QueenProgress } from '../core/progress';
import { loadModels } from '../actors/creatures';
import { lod } from '../core/lod';
import { tickClock } from '../core/clock';
import { income } from '../core/income';
import { bump } from '../core/totals';
import { pace } from '../core/pace';
import { GAME_SPEED, OFFLINE } from '../data/config';
import { Updater, versionLabel } from '../core/updater';
import { Minimap } from '../ui/minimap';
import { Airfield, clockText, type FlightRow } from './airfield';
import { FlightUi } from './flightUi';

export interface TycoonContext {
  app: HTMLElement;
  renderer: THREE.WebGLRenderer;
  save: SaveData;
  hud: Hud;
  sfx: Sfx;
  input: Input;
  progress: Progress;
  queenProgress: QueenProgress;
  /** Seconds since this slot was last saved: 💤 offline earnings. */
  away: number;
}

const HOWTO_TITLE = '🐜✈️ How to play: Airport Tycoon';
const HOWTO_HTML = `
  <p>Your fire ant colony runs an airport at insect size. Everything is real size: the lawn is a forest,
  a pebble is a boulder, and a ladybug is your first plane.</p>
  <ul>
    <li>🌼 <b>Nectar is the fuel.</b> Stand at a flower to pick drops up, then stand on a gate's <b>FUEL</b> pad.</li>
    <li>🎫 <b>Passengers</b> walk in from the lawn and line up in the 🐚 <b>terminal</b>. Stand behind its
      <b>CHECK-IN</b> counter to check them in: each one pays a ticket.</li>
    <li>🍪 The <b>Nectar Café</b> (a tile): carry picnic crumbs to the kitchen's oven; the snacks go to the café
      counter inside the terminal, and passengers buy one on the way to their gate.</li>
    <li>🧳 Each passenger's <b>seed-bag</b> goes to the <b>BAG DROP</b> outside the terminal. Carry the bags to
      the gate's <b>BAGS</b> pad: a plane won't leave without its passengers' bags.</li>
    <li>🐞 A fuelled plane boards its passengers, taxis to the <b>HOLD</b> line, takes off and flies its route.
      🗼 The tower lets <b>one bug use the runway at a time</b>: planes wait their turn at the HOLD line, or circle
      before landing. The arriving passengers pay a landing fee.</li>
    <li>✈️ Tap a chip at the bottom (or a plane) for its <b>flight card</b>: passengers, bags, nectar and what it's
      doing. 🎯 on the card points the camera at it until you walk. 📋 is the whole flight board.</li>
    <li>🛫 <b>The north field</b> (the Runway 2 + Gate 5 tile, beyond the runway): four more gates with a runway of
      their own. Walk over the 🚸 crossing west of Gate 1. Its planes never wait for the first runway.</li>
    <li>📦 <b>Cargo</b> (the Cargo Depot tile, south-west of the terminal): carry its crates to a gate's <b>CARGO</b> pad. The next
      plane to leave takes them and they pay at take-off, more on a far route.</li>
    <li>🗺️ <b>Destinations:</b> the 🗺️ button (top right) is a map of the garden. Open far-away places for cash:
      they pay a higher fare. 📣 Advertise a place to raise its fare, or switch its flights off and on.</li>
    <li>📅 <b>Daily goals</b> (the bar under the airfield's name): finish each day's goals quickly for ⭐⭐⭐
      and a cash bonus.</li>
    <li>⬆️ <b>Upgrades:</b> a bouncing green arrow floats over anything you can afford to upgrade. Tap the building
      (a gate, a flower, the terminal, the café kitchen…), or walk up to it and tap the <b>⬆️</b> button, for its menu.
      The <b>MANAGER</b> ant on the check-in counter upgrades your ants' jobs and your backpack.</li>
    <li>🛖 Build the <b>Hangar</b> (east of the gates): its menu unlocks bigger aircraft and upgrades the whole
      fleet (💺 extra seats, 💨 speed).</li>
    <li>🗑️ Carrying something you don't need? Stand on a <b>trash bin</b> to toss it for a little cash. The
      ♻️ <b>Recycler</b> (a tile) turns 3 nectar into a drop of <b>jet fuel</b> that fuels a whole flight, and pays for
      everything else. Once it's open, passengers put wrappers in the bins: carry them to the recycler, or hire the
      🧹 <b>Janitor ant</b>.</li>
    <li>🗺️ <b>Route</b> tiles open longer routes that pay higher fares.</li>
    <li>🎁 The <b>Gift Shop</b> sells pollen sweets to passengers; the 👑 <b>VIP Lounge</b> brings golden VIPs who pay ×3.</li>
    <li>🦎 Now and then something happens: a lizard sunbathing on the runway (walk up to shoo it), a 🌧️ dew shower
      (flowers fill twice as fast), or a 🪶 feather to find.</li>
    <li>💵 Walk over the <b>cash pad</b> to collect. Spend it on the <b>glowing tiles</b>: ants who fuel the planes,
      check passengers in and collect the cash for you.</li>
    <li>🎯 <b>Quests</b> (the card under the airfield's name): there's always one, with a cash reward. The yellow
      arrow shows where to go. Skip passes one over.</li>
    <li>📖 When something new opens, a card shows how it works, then the arrow walks you through it once.
      <b>How things work</b> (below) has them all again.</li>
    <li>🎒 Tap the <b>backpack</b> to see where each thing you're carrying goes. Small green arrows bob over the pads
      that take it.</li>
    <li>👁️ The eye button switches to first person: see the airport through your ant's eyes.</li>
  </ul>`;

export async function startTycoon({ app, renderer, save, hud, sfx, input, progress, queenProgress, away }: TycoonContext) {
  // 1) Your colony's ants are the real 3D models (every other creature is built from code)
  await loadModels((d, t) => hud.setLoading(d / t));
  const field = new Airfield(hud, sfx, save, progress);
  // (the builder's women are drawn with the game's own renderer: now it has one, the tiny people can start)
  field.renderer = renderer;
  if (field.people) field.setPeople(true, true);

  // 2) The HUD: one world (no switching, route board or shrine yet)
  hud.setNext(null);
  document.getElementById('modeBtn')?.classList.add('hidden');
  hud.initStats(progress, queenProgress, ['luck', 'tough']);
  hud.initShrine(progress, () => false);
  progress.onChange = () => hud.renderLevel();
  progress.onLevelUp = (level) => {
    sfx.levelUp();
    hud.banner(`LEVEL UP! Lv ${level}`, 'Tap your level (top left) to spend your point', 2600);
    writeSave(save);
  };

  // 🗺️ The minimap
  const map = new Minimap(document.getElementById('mapSlot')!, Airfield.MAP_BOUNDS, () => field.mapView(), 40);

  // ✈️ The flight board (📋 on the chips row): every gate's departure / arrival, ticking while it's open.
  const boardPanel = document.getElementById('departures')!;
  const boardRows = document.getElementById('boardRows')!;
  const rowHtml = (r: FlightRow) =>
    `<div class="board-row fl ${r.tone}"><div class="no">${r.no || '—'}</div><div class="nm">${r.place}</div><div class="gt">G${r.gate}</div>` +
    `<div class="st">${r.status}${r.eta !== null ? ` · ${clockText(r.eta)}` : ''}</div></div>`;
  const drawBoard = () => {
    const rows = field.flightBoard();
    const dep = rows.filter((r) => r.kind === 'dep');
    const arr = rows.filter((r) => r.kind === 'arr');
    boardRows.innerHTML =
      `<div class="fl-sec">🛫 DEPARTURES</div>${dep.map(rowHtml).join('') || '<div class="fl-none">No departures right now</div>'}` +
      `<div class="fl-sec">🛬 ARRIVALS</div>${arr.map(rowHtml).join('') || '<div class="fl-none">Nothing in the air</div>'}`;
  };
  let boardTimer = 0;
  const openBoard = () => {
    boardPanel.querySelector('.board-title')!.textContent = '✈️ ANTHILL AIRWAYS';
    boardPanel.querySelector('.board-tip')!.innerHTML =
      'A plane goes when it has <b>⛽ nectar</b> on its gate\'s FUEL pad, its passengers\' <b>🧳 bags</b> on the BAGS pad, ' +
      'and passengers aboard (it waits a few seconds for more). 🗼 The tower lets one bug use the runway at a time.';
    drawBoard();
    boardPanel.classList.remove('hidden');
    window.clearInterval(boardTimer);
    boardTimer = window.setInterval(() => (boardPanel.classList.contains('hidden') ? window.clearInterval(boardTimer) : drawBoard()), 500);
  };
  document.getElementById('closeBoard')!.addEventListener('click', () => boardPanel.classList.add('hidden'));

  // ✈️ The chips along the bottom and the flight card (tap a chip, or tap a plane)
  const flights = new FlightUi(document.getElementById('hud')!, {
    info: () => field.planeInfo(),
    select: (g) => (field.selected = g),
    watch: (g) => {
      field.watch = g;
      hud.banner('🎯 Watching the plane', 'Walk to come back to your ant', 1800);
    },
    board: openBoard,
    fleet: () => field.openTarget('hangar'),
    // ⚠️ what's happening right now (the lizard, a feather, the dew): tap it to look there
    alert: () => {
      const a = field.events.alert();
      return a && { text: a.text, bad: a.bad };
    },
    alertTap: () => {
      const at = field.events.alert()?.at;
      if (!at) return;
      field.watch = null;
      field.watchAt = at;
      field.watchEvent = true;
      hud.banner('🎯 Over here!', 'Walk to come back to your ant', 1800);
    },
  });
  input.onTap = (x, y) => {
    // (a plane first: its flight card; else a building: its ⬆️ upgrade menu)
    const g = field.planeAt(x, y, app.clientWidth, app.clientHeight);
    if (g === null) return field.tapTarget(x, y, app.clientWidth, app.clientHeight);
    flights.show(g);
    return true;
  };

  // 📅 The daily goals: a bar under the zone name (tap it for the panel)
  document.getElementById('nextBtn')!.classList.add('goal-bar');
  document.body.classList.add('tycoon');
  const goalsPanel = document.createElement('div');
  goalsPanel.className = 'overlay hidden';
  goalsPanel.innerHTML = `<div class="card goals-card"><h2>📅 Daily Goals</h2><div class="gl-body"></div><button class="menu-btn">Close</button></div>`;
  document.getElementById('hud')!.appendChild(goalsPanel);
  const goalsBody = goalsPanel.querySelector('.gl-body')!;
  let goalsTimer = 0;
  goalsPanel.querySelector('button')!.addEventListener('click', () => goalsPanel.classList.add('hidden'));
  document.getElementById('nextBtn')!.addEventListener('click', () => {
    goalsBody.innerHTML = field.goals.panelHtml();
    goalsPanel.classList.remove('hidden');
    window.clearInterval(goalsTimer);
    goalsTimer = window.setInterval(() => (goalsPanel.classList.contains('hidden') ? window.clearInterval(goalsTimer) : (goalsBody.innerHTML = field.goals.panelHtml())), 1000);
  });
  window.setInterval(() => {
    flights.update();
    hud.setNext(field.goals.barText());
  }, 250);

  // 🗺️ The destinations map
  const routesBtn = document.getElementById('routesBtn') as HTMLButtonElement;
  routesBtn.hidden = false;
  routesBtn.addEventListener('click', () => field.openRouteMap());

  // 3) First-person / third-person view
  const viewBtn = document.getElementById('viewBtn')!;
  const applyView = () => {
    const fp = save.view === 'first';
    field.player.setFirstPerson(fp);
    viewBtn.classList.toggle('on', fp);
    viewBtn.textContent = fp ? '🎥' : '👁️';
    viewBtn.setAttribute('aria-label', fp ? 'Switch to third-person view' : 'Switch to first-person view');
  };
  viewBtn.addEventListener('click', () => {
    save.view = save.view === 'first' ? 'third' : 'first';
    applyView();
    if (save.view === 'first') hud.banner('👁️ First person', 'Left side: walk · Right side: drag to look', 2600);
    writeSave(save);
  });
  applyView();

  // 4) ⚙️ Settings → 📖 How to play
  // 🧍 Passengers: bugs or TRADDOMIUM's tiny people (v0.77.1: its own button in Settings, with how many are ready)
  const peopleBtn = document.getElementById('peopleBtn') as HTMLButtonElement;
  peopleBtn.hidden = false;
  const peopleLabel = () => {
    peopleBtn.textContent = field.people ? `🧍 Passengers: tiny people (${field.peopleReady()} ready · ${field.detailText()})` : '🐛 Passengers: bugs';
  };
  peopleLabel();
  window.setInterval(peopleLabel, 1000);
  peopleBtn.addEventListener('click', () => {
    field.setPeople(!field.people);
    if (!field.people) hud.banner('🐛 Bugs are back', 'New passengers are aphids again', 2600);
    writeSave(save);
    peopleLabel();
  });

  document.getElementById('howtoBtn')!.addEventListener('click', () => {
    document.getElementById('settings')!.classList.add('hidden');
    hud.showGuide(HOWTO_TITLE, HOWTO_HTML, [
      {
        label: '🔁 Replay the tutorial',
        cls: 'menu-btn',
        onClick: () => {
          field.tutorial.replay();
          writeSave(save);
          hud.banner('🎓 Tutorial restarted', 'Follow the yellow arrow 🔽', 4000);
        },
      },
      {
        label: '📖 How things work',
        cls: 'menu-btn',
        onClick: () => hud.showGuide('📖 How things work', field.guideList(), [{ label: 'Close', cls: 'big-btn' }]),
      },
      { label: 'Close', cls: 'big-btn' },
    ]);
  });

  // 5) Full-screen canvas
  let lastW = 0;
  let lastH = 0;
  const resize = () => {
    lastW = app.clientWidth;
    lastH = app.clientHeight;
    renderer.setSize(lastW, lastH, false);
    field.resize(lastW, lastH);
  };
  window.addEventListener('resize', resize);
  window.visualViewport?.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 250));
  resize();

  // 6) Save every few seconds and when the app is hidden (coming back pays for the time away)
  window.setInterval(() => writeSave(save), 5000);
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      writeSave(save);
      hiddenAt = Date.now();
    } else if (hiddenAt) {
      void offerOffline((Date.now() - hiddenAt) / 1000);
      hiddenAt = 0;
    }
  });

  // 7) The +$/min idle rate (only cash the Banker ant collects), and 💤 offline earnings from it
  let prevCash = save.cash;
  let winEarned = 0;
  let winT = 0;
  hud.setRate(save.rate * 60);
  const trackIncome = (dt: number) => {
    bump('played', dt);
    const gained = save.cash - prevCash;
    if (gained > 0) bump('earned', gained);
    prevCash = save.cash;
    winEarned += income.auto;
    income.auto = 0;
    winT += dt;
    if (winT >= 10) {
      save.rate = save.rate * 0.85 + (winEarned / winT) * 0.15;
      if (save.rate < 0.02) save.rate = 0;
      hud.setRate(save.rate * 60);
      winEarned = 0;
      winT = 0;
    }
  };
  let welcomeOpen = false;
  const offerOffline = async (secs: number): Promise<void> => {
    if (welcomeOpen || secs < OFFLINE.minAwaySecs) return;
    const counted = Math.min(secs, progress.offlineHours * 3600);
    const share = progress.offlineShare;
    const amount = Math.floor(save.rate * counted * share);
    if (amount < 1) return; // (no Banker ant yet: nothing earns while you're away)
    welcomeOpen = true;
    await hud.showWelcome(secs, counted, share, amount, { run: false, who: 'Your ants' });
    welcomeOpen = false;
    sfx.welcome();
    field.addCash(amount);
    prevCash = save.cash;
    writeSave(save);
  };
  window.setTimeout(() => void offerOffline(away), 900);

  // 8) 📊 Lifetime stats
  hud.initTotals(() => {
    const n = (k: string) => save.totals[k] ?? 0;
    const money = (v: number) => `$${Math.round(v).toLocaleString()}`;
    const secs = n('played');
    const t = save.tycoon!;
    return [
      'AIRPORT TYCOON',
      { icon: '💵', label: 'Cash earned', value: money(n('earned')) },
      { icon: '⏱️', label: 'Time played', value: `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m` },
      { icon: '⭐', label: 'Your level', value: String(save.level) },
      { icon: '🛫', label: 'Flights', value: t.flights.toLocaleString() },
      { icon: '🎫', label: 'Passengers checked in', value: t.passengers.toLocaleString() },
      { icon: '🧳', label: 'Bags loaded', value: (t.bagsLoaded ?? 0).toLocaleString() },
      { icon: '🛬', label: 'Landings', value: (t.landings ?? 0).toLocaleString() },
      { icon: '📅', label: 'Days flown', value: `${t.day?.stars.length ?? 0} · ⭐ ${field.goals.totalStars}` },
      { icon: '🐜', label: 'Ants working', value: String(field.workers.length + field.bankers.length + (save.unlocked.includes('ty-checkin') ? 1 : 0) + (save.unlocked.includes('ty-atc') ? 1 : 0)) },
      { icon: '💤', label: 'Idle income now', value: `${money(save.rate * 60)}/min` },
    ];
  });

  // 9) 🐢 / 🐇 Movement speed (Settings slider, saved on this device)
  try {
    pace.move = THREE.MathUtils.clamp(Number(localStorage.getItem(GAME_SPEED.key)) || 1, GAME_SPEED.min, GAME_SPEED.max);
  } catch {
    /* ignore */
  }
  hud.initSpeed(pace.move, (v) => {
    pace.move = v;
    try {
      localStorage.setItem(GAME_SPEED.key, String(v));
    } catch {
      /* ignore */
    }
  });

  // 10) Auto-update
  const updater = new Updater({
    canReload: () => !welcomeOpen,
    beforeReload: () => writeSave(save),
    onStatus: (t) => hud.setUpdateStatus(t),
    confirm: (version) => hud.showUpdate(version, 10),
  });
  hud.initVersion(versionLabel(), () => updater.check(true));

  // 11) Auto quality: if it can't keep up, step down (shadows first, then pixels)
  const dpr = Math.min(window.devicePixelRatio, 2);
  const QUALITY = [
    { pixelRatio: dpr, shadow: 2048 },
    { pixelRatio: dpr, shadow: 1024 },
    { pixelRatio: Math.min(dpr, 1.75), shadow: 1024 },
    { pixelRatio: Math.min(dpr, 1.5), shadow: 512 },
  ];
  let quality = 0;
  let frameSum = 0;
  let frameCount = 0;
  let qualityWait = 4;
  const watchQuality = (rawMs: number) => {
    if (document.hidden || rawMs > 250) return;
    qualityWait -= rawMs / 1000;
    if (qualityWait > 0) return;
    frameSum += rawMs;
    if (++frameCount < 90) return;
    const avg = frameSum / frameCount;
    frameSum = frameCount = 0;
    if (avg > 25 && quality < QUALITY.length - 1) {
      quality++;
      renderer.setPixelRatio(QUALITY[quality].pixelRatio);
      field.setShadowSize(QUALITY[quality].shadow);
      resize();
      qualityWait = 3;
    }
  };

  // 12) The main loop. `?speed=4` fast-forwards (testing).
  const testSpeed = Math.min(10, Number(new URLSearchParams(location.search).get('speed')) || 1);
  // 🧪 Testing only: ?sim=1 runs without drawing (fast headless playthroughs)
  if (import.meta.env.DEV && new URLSearchParams(location.search).get('sim') === '1') renderer.render = () => {};
  let gameTime = 0;
  const steps = (dt: number) => {
    const n = Math.max(1, Math.ceil(dt / 0.05 - 1e-6));
    return Array.from({ length: n }, () => dt / n);
  };
  hud.hideLoading();
  let last = performance.now();
  const errors = new Set<string>();
  const frame = (now: number) => {
    requestAnimationFrame(frame);
    try {
      tick(now);
    } catch (e) {
      const msg = e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e);
      if (!errors.has(msg)) {
        errors.add(msg);
        console.error('Airport Tycoon frame error:', msg);
      }
    }
  };
  const tick = (now: number) => {
    const rawMs = Math.max(0, now - last);
    last = now;
    const dt = Math.min(0.05, rawMs / 1000) * testSpeed;
    gameTime += dt;
    tickClock(rawMs / 1000, Math.min(0.05, rawMs / 1000));
    watchQuality(rawMs);
    sfx.setMusic('colony');
    trackIncome(Math.min(1, rawMs / 1000));
    if (app.clientWidth !== lastW || app.clientHeight !== lastH) resize();
    input.splitLook = save.view === 'first';
    input.update();
    const look = input.takeLook();
    field.player.look(look.dx, look.dy);
    for (const step of steps(dt)) field.update(step, input.move);
    lod.update(field.scene, field.camera, field.focus);
    renderer.render(field.scene, field.camera);
    map.update(Math.min(0.1, rawMs / 1000));
  };
  requestAnimationFrame(frame);

  // Handy for testing in the browser console (and the headless tests)
  (window as unknown as { game: unknown }).game = {
    field, save, progress, renderer, map,
    get time() { return gameTime; },
  };
}
