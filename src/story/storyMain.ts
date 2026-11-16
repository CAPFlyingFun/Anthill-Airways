// ============================================================================
// storyMain.ts — starts 🦖 THE STORY (the remake's Chapter 1, a test version, v0.63).
//
// A save slot whose campaign is 'story' plays this (Settings → 💾 a new slot → 🦖 Story). main.ts sets up what
// every game shares (renderer, HUD, sounds, input, the save, Settings) and hands over here. The chapter itself
// lives in story/storyWorld.ts; this file loads the models, asks who you want to play (the character card),
// runs the frame loop, and saves.
//
// Never punished for closing the app (the remake plan): while the app is hidden nothing drains or attacks, and
// coming back shows one summary of what your helper did meanwhile ("Your ant stocked 6 logs").
// ============================================================================
import * as THREE from 'three';
import type { Hud } from '../ui/hud';
import type { Sfx } from '../core/audio';
import type { Input } from '../core/input';
import { SaveData, writeSave } from '../core/save';
import type { Progress, QueenProgress } from '../core/progress';
import { loadIsland, loadModels, loadPeople } from '../actors/creatures';
import { CAST, CastId, castFiles, lookFor, Look } from '../actors/cast';
import { Avatar } from '../ui/avatar';
import { Minimap } from '../ui/minimap';
import { lod } from '../core/lod';
import { tickClock } from '../core/clock';
import { bump } from '../core/totals';
import { pace } from '../core/pace';
import { GAME_SPEED } from '../data/config';
import { Updater, versionLabel } from '../core/updater';
import { StoryWorld } from './storyWorld';
import { P, T } from './storyData';

export interface StoryContext {
  app: HTMLElement;
  renderer: THREE.WebGLRenderer;
  save: SaveData;
  hud: Hud;
  sfx: Sfx;
  input: Input;
  progress: Progress;
  queenProgress: QueenProgress;
  /** Seconds since this slot was last saved (= since you last played). */
  away: number;
}

const HOW_TO_TITLE = '🦖 Story: Chapter 1 (test)';
const HOW_TO_HTML = `
  <p>The remake's first chapter: <b>The Landing</b>. Follow the 🎯 quest card (top left) and the yellow arrow 🔽.</p>
  <ul>
    <li>👆 <b>Drag</b> to walk. Walk onto a pad to pick things up or drop them off.</li>
    <li>💬 When someone talks, <b>tap anywhere</b> for the next line. In a cutscene, <b>Skip ⏭</b> is top right.</li>
    <li>💧 On the island your <b>water</b> drains while you're out. Stand in the stream to drink. Run dry and your ❤️
      health drops; at zero you pass out and wake at camp, without the logs and berries you carried.</li>
    <li>⏸️ Close the app any time: nothing drains while you're away, and your helper ant keeps working.</li>
    <li>🗺️ Tap the minimap (top right) for the whole island.</li>
  </ul>`;

/** The character card's live heads while it's open during the game (the frame loop draws them). */
const cardHeads: Avatar[] = [];

export async function startStory({ app, renderer, save, hud, sfx, input, progress, queenProgress, away }: StoryContext) {
  // 1) The models: the ants (your helper), only the story's people, the island's trees and dinos
  const people = castFiles(['jack', 'sarah', 'rae']);
  await loadModels((d, t) => hud.setLoading((d / t) * 0.3));
  await loadPeople(people, (d, t) => hud.setLoading(0.3 + (d / t) * 0.45));
  await loadIsland((d, t) => hud.setLoading(0.75 + (d / t) * 0.25));
  hud.hideLoading();
  hud.setZone('');
  // (no cash, planks, world switching or route board in the story, yet)
  for (const id of ['cash', 'planks', 'rate', 'modeBtn', 'nextBtn']) document.getElementById(id)?.classList.add('hidden');

  // 2) Who are you? (once, in a new game)
  if (!save.story?.hero) {
    const hero = await pickHero(renderer, hud);
    save.story = { ...(save.story ?? ({} as NonNullable<SaveData['story']>)), hero };
    writeSave(save);
  }

  // 3) While you were away: your ant kept stocking the workbench (up to what it holds). Nothing else moved.
  let stocked = 0;
  const st0 = save.story!;
  if (st0.flags?.runner && st0.bench && away > 60) {
    stocked = Math.max(0, Math.min(T.benchMax - st0.bench.logs, Math.floor(away / T.antLogSecs)));
    st0.bench.logs += stocked;
  }

  const world = new StoryWorld(hud, sfx, save, progress);

  // 4) The HUD
  hud.setNext(null);
  hud.initStats(progress, queenProgress, ['luck', 'tough']);
  hud.initShrine(progress, () => false);
  progress.onChange = () => hud.renderLevel();
  // 🧍 You, live in the player card (top left)
  const avaSlot = document.getElementById('pcAva')!;
  const look = lookFor(world.heroId, world.heroWant);
  let avatar = look ? Avatar.make(look.file, avaSlot) : null;
  avaSlot.classList.toggle('live', !!avatar);
  progress.onLevelUp = (level) => {
    avatar?.nod();
    sfx.levelUp();
    hud.banner(`LEVEL UP! Lv ${level}`, 'Tap your level (top left) to spend your point', 2600);
    writeSave(save);
  };
  // 🗺️ The minimap (the island only)
  const map = new Minimap(document.getElementById('mapSlot')!, StoryWorld.MAP_BOUNDS, () => world.mapView(), 22);
  document.getElementById('mapSlot')?.classList.toggle('hidden', world.area !== 'island');
  input.onTap = () => false;

  // 5) First-person / third-person view
  const viewBtn = document.getElementById('viewBtn')!;
  const applyView = () => {
    const fp = save.view === 'first';
    world.player.setFirstPerson(fp);
    viewBtn.classList.toggle('on', fp);
    viewBtn.textContent = fp ? '🎥' : '👁️';
  };
  viewBtn.addEventListener('click', () => {
    save.view = save.view === 'first' ? 'third' : 'first';
    applyView();
    writeSave(save);
  });
  applyView();

  // 5b) 🧍 Change character: a button at the top of your stats (tap your level card). Same place, same backpack.
  const statsCard = document.querySelector('#stats .stats-card');
  if (statsCard && !document.getElementById('heroBtn')) {
    const btn = document.createElement('button');
    btn.id = 'heroBtn';
    btn.className = 'menu-btn hero-btn';
    btn.textContent = '🧍 Change character';
    statsCard.querySelector('#statsTitle')?.after(btn);
    btn.addEventListener('click', async () => {
      document.getElementById('stats')!.classList.add('hidden');
      const hero = await pickHero(renderer, hud, cardHeads);
      world.setHero(hero);
      avatar?.dispose();
      const l = lookFor(world.heroId, world.heroWant);
      avatar = l ? Avatar.make(l.file, avaSlot) : null;
      avaSlot.classList.toggle('live', !!avatar);
      applyView();
      hud.banner(`🧍 You're playing ${CAST[world.heroId].name}`, 'Same place, same backpack, same story.', 2400);
    });
  }

  // 6) ⚙️ Settings → 📖 How to play
  document.getElementById('howtoBtn')!.addEventListener('click', () => {
    document.getElementById('settings')!.classList.add('hidden');
    hud.showGuide(HOW_TO_TITLE, HOW_TO_HTML, [{ label: 'Close', cls: 'big-btn' }]);
  });
  // 📊 Lifetime stats
  hud.initTotals(() => {
    const secs = save.totals.played ?? 0;
    const s = world.st;
    return [
      'STORY · CHAPTER 1 (TEST)',
      { icon: '⏱️', label: 'Time played', value: `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m` },
      { icon: '⭐', label: 'Your level', value: String(save.level) },
      { icon: '📖', label: 'Logbook pages found', value: String(s.pages.length) },
      { icon: '🦕', label: 'Your dino', value: s.dino.state === 'trust' ? 'Friends' : s.dino.state === 'hidden' ? '?' : 'Not yet' },
    ];
  });

  // 7) Full-screen canvas
  let lastW = 0;
  let lastH = 0;
  const resize = () => {
    lastW = app.clientWidth;
    lastH = app.clientHeight;
    renderer.setSize(lastW, lastH, false);
    world.resize(lastW, lastH);
  };
  window.addEventListener('resize', resize);
  window.visualViewport?.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 250));
  resize();

  // 8) Saving: every few seconds, and whenever the app is hidden (where you are, what you carry, your needs)
  const saveNow = () => {
    world.sync();
    writeSave(save);
  };
  window.setInterval(saveNow, 5000);
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      saveNow();
      hiddenAt = Date.now();
    } else if (hiddenAt) {
      welcomeBack((Date.now() - hiddenAt) / 1000);
      hiddenAt = 0;
    }
  });
  window.addEventListener('pagehide', saveNow);
  /** Back after a while: what your ant did (the only thing that moves while you're away). */
  const welcomeBack = (secs: number) => {
    if (secs < 60 || !world.st.flags.runner) return;
    const n = world.stockBench(Math.floor(secs / T.antLogSecs));
    if (n > 0) hud.banner('🐜 Welcome back!', `While you were away, your ant stocked the workbench with ${n} log${n > 1 ? 's' : ''}.`, 4200);
  };
  window.setTimeout(() => {
    if (stocked > 0) hud.banner('🐜 Welcome back!', `While you were away, your ant stocked the workbench with ${stocked} log${stocked > 1 ? 's' : ''}.`, 4200);
    if (world.st.flags.signal) hud.setHint('🏕️ Chapter 2 is coming soon. Your camp keeps running!');
  }, 900);

  // 9) 🐢 / 🐇 Movement speed (Settings slider)
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

  // 10) Auto-update (never in the middle of a story moment)
  const updater = new Updater({
    canReload: () => !world.busy,
    beforeReload: saveNow,
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
      world.setShadowSize(QUALITY[quality].shadow);
      resize();
      qualityWait = 3;
    }
  };

  // 12) The main loop (`?speed=4` fast-forwards, for testing)
  const testSpeed = Math.min(10, Number(new URLSearchParams(location.search).get('speed')) || 1);
  const steps = (dt: number) => {
    const n = Math.max(1, Math.ceil(dt / 0.05 - 1e-6));
    return Array.from({ length: n }, () => dt / n);
  };
  let last = performance.now();
  const errors = new Set<string>();
  const tick = (now: number) => {
    // (a frame after the app was hidden spans the time away: it's clamped to 50 ms, so nothing jumps)
    const rawMs = Math.max(0, now - last);
    last = now;
    const dt = Math.min(0.05, rawMs / 1000) * testSpeed;
    tickClock(rawMs / 1000, Math.min(0.05, rawMs / 1000));
    watchQuality(rawMs);
    bump('played', Math.min(1, rawMs / 1000));
    if (app.clientWidth !== lastW || app.clientHeight !== lastH) resize();
    input.splitLook = save.view === 'first';
    input.update();
    const look = input.takeLook();
    if (!world.busy) world.player.look(look.dx, look.dy);
    for (const step of steps(dt)) world.update(step, input.move);
    lod.update(world.scene, world.camera, world.focus);
    renderer.render(world.scene, world.camera);
    const realDt = Math.min(0.05, rawMs / 1000);
    avatar?.render(renderer, realDt);      // (🧍 you, in the player card)
    for (const h of cardHeads) h.render(renderer, realDt); // (🧍 the character card's heads, while it's open)
    world.talk.update(renderer, realDt);   // (💬 whoever is talking)
    world.renderNeeds();
    map.update(Math.min(0.1, rawMs / 1000));
  };
  const frame = (now: number) => {
    requestAnimationFrame(frame);
    try {
      tick(now);
    } catch (e) {
      const msg = e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e);
      if (!errors.has(msg)) {
        errors.add(msg);
        console.error('Story frame error:', msg);
      }
    }
  };
  requestAnimationFrame(frame);

  // (handy in the browser console, and for the headless tests)
  (window as unknown as { game: unknown }).game = { world, save, progress, renderer, map, P };
}

// ============================================================================
// 🧍 The character card: who you play, then how they look (with live 3D heads)
// ============================================================================
async function pickHero(renderer: THREE.WebGLRenderer, hud: Hud, shared?: Avatar[]) {
  // (a little loop of its own draws the heads while the card is up: the game isn't running yet)
  const heads: Avatar[] = shared ?? [];
  let on = !shared; // (in the game, the frame loop draws them)
  let last = performance.now();
  const loop = (now: number) => {
    if (!on) return;
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.setClearColor(0x14253f, 1);
    renderer.clear();
    for (const h of heads) h.render(renderer, dt);
  };
  if (on) requestAnimationFrame(loop);
  const clearHeads = () => {
    for (const h of heads) h.dispose();
    heads.length = 0;
  };
  const addHeads = (slots: [string, Look][]) => {
    for (const [id, l] of slots) {
      const slot = document.getElementById(id);
      const a = slot && Avatar.make(l.file, slot, { bg: 0x2f6fdc });
      if (a) heads.push(a);
    }
  };
  const ask = <T,>(title: string, html: string, buttons: { label: string; value: T; cls?: string }[], slots: () => [string, Look][]) =>
    new Promise<T>((resolve) => {
      hud.showGuide(title, html, buttons.map((b) => ({ label: b.label, cls: b.cls ?? 'big-btn', onClick: () => resolve(b.value) })));
      // (the card's HTML is in the page now: put a head in each slot)
      requestAnimationFrame(() => addHeads(slots()));
    });

  // Who?
  const ids: CastId[] = ['jack', 'sarah'];
  const first = (id: CastId) => lookFor(id)!;
  const id = await ask<CastId>(
    '🧍 Who are you?',
    `<p>Pick who you play. (More choices are coming with the Character Builder.)</p>
     <div class="pick-row">${ids.map((i) => `<div class="pick"><span class="pick-ava" id="pick-${i}"></span><b>${CAST[i].name}</b></div>`).join('')}</div>`,
    ids.map((i) => ({ label: `${i === 'jack' ? '🧍‍♂️' : '🧍‍♀️'} ${CAST[i].name}`, value: i })),
    () => ids.map((i) => [`pick-${i}`, first(i)] as [string, Look]),
  );
  clearHeads();
  // How do they look?
  const looks = CAST[id].looks.filter((l) => lookFor(id, { file: l.file })?.file === l.file);
  let chosen = looks[0];
  if (looks.length > 1) {
    chosen = await ask<Look>(
      `🧍 ${CAST[id].name}: pick a look`,
      `<p>Your outfit. (The company suit is the airline's uniform.)</p>
       <div class="pick-row">${looks.map((l, k) => `<div class="pick"><span class="pick-ava" id="look-${k}"></span><b>${l.label}</b></div>`).join('')}</div>`,
      looks.map((l, k) => ({ label: l.label, value: l, cls: k === 0 ? 'big-btn' : 'menu-btn' })),
      () => looks.map((l, k) => [`look-${k}`, l] as [string, Look]),
    );
  }
  clearHeads();
  on = false;
  return { id: id as 'jack' | 'sarah', outfit: chosen.file, pregnant: chosen.pregnant };
}
