// ============================================================================
// builderFiles.ts — 📥 THE CHARACTER BUILDER'S FILES ON THIS PHONE (v0.93.2)
//
// Every traveller is one of the Character Builder's people (devRoom.ts's crowd), drawn from files on the builder's own
// site: her body and her six hairstyles, his body and his five short cuts (about 35 MB). The game's service worker
// keeps them once fetched (vite.config.ts, cache 'builder-models'), and Settings can fetch them all at once on purpose
// ("Save people for offline": Joshua, 2026-11-22, "can we save the male and female body locally to the app… with
// manual download"), so a slow connection, or none, still has them.
//
// The crowd asks for these very addresses, so what is saved here is what it is answered with.
// ============================================================================
import { HAIR_STYLES, MALE_HAIR_STYLES } from './vendor/ccbs/sarahlab/hairStyles';

/** The builder's published models (GitHub Pages: the same host as this game when it's live). */
// (🧪 in development, ?localccbs reads the builder's files from this server's own /_ccbs/ folder: a test machine
// that can't reach the builder's site)
export const BUILDER = import.meta.env.DEV && new URLSearchParams(location.search).has('localccbs')
  ? `${import.meta.env.BASE_URL}_ccbs/`
  : 'https://capflyingfun.github.io/Custom-Character-Builder-System/models/';

/** 👨 The men's hairstyles in the crowd (v0.93.1): his short cuts only, no man bun and none of her long styles. */
export const MEN_HAIR_IDS = ['crew', 'buzz', 'side-part', 'slicked-back', 'curly-top'];

const CACHE = 'builder-models';

/** Every file the crowd fetches, by the address it fetches it at. */
export function builderFiles(): string[] {
  const hair = (file: string) => BUILDER + file.replace(/^models\//, '');
  return [
    BUILDER + 'sarah-v2-body-slim.glb',
    ...HAIR_STYLES.map((s) => hair(s.lightFile)),
    BUILDER + 'male-base.glb',
    ...MALE_HAIR_STYLES.filter((s) => MEN_HAIR_IDS.includes(s.id)).map((s) => hair(s.lightFile)),
  ];
}

export interface OfflineState { saved: number; total: number; mb: number }

/** How many of the files are kept on this phone, and how big they are. */
export async function offlineState(): Promise<OfflineState> {
  const files = builderFiles();
  if (!('caches' in window)) return { saved: 0, total: files.length, mb: 0 };
  try {
    const cache = await caches.open(CACHE);
    let saved = 0, bytes = 0;
    for (const url of files) {
      const hit = await cache.match(url);
      if (!hit) continue;
      saved++;
      bytes += Number(hit.headers.get('content-length')) || (await hit.clone().blob()).size;
    }
    return { saved, total: files.length, mb: bytes / 1e6 };
  } catch {
    return { saved: 0, total: files.length, mb: 0 };
  }
}

/**
 * Fetch every file afresh and keep it (what was kept before is replaced only once its new copy is in). `progress` is
 * told the megabytes so far and the total as it is known.
 */
export async function saveForOffline(progress: (doneMb: number, totalMb: number, file: number, files: number) => void) {
  if (!('caches' in window)) throw new Error('this browser keeps no files');
  const cache = await caches.open(CACHE);
  const files = builderFiles();
  let done = 0, total = 0;
  for (const [i, url] of files.entries()) {
    const res = await fetch(url, { cache: 'reload' });
    if (!res.ok || !res.body) throw new Error(`${res.status} for ${url.split('/').pop()}`);
    const size = Number(res.headers.get('content-length')) || 0;
    total += size;
    const reader = res.body.getReader();
    const parts: Uint8Array[] = [];
    for (;;) {
      const { done: end, value } = await reader.read();
      if (end) break;
      parts.push(value);
      done += value.byteLength;
      progress(done / 1e6, Math.max(total, done) / 1e6, i + 1, files.length);
    }
    const blob = new Blob(parts as BlobPart[], { type: res.headers.get('content-type') ?? 'application/octet-stream' });
    await cache.put(url, new Response(blob, { headers: { 'content-type': blob.type, 'content-length': String(blob.size) } }));
  }
  return done / 1e6;
}
