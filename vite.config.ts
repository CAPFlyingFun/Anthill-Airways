// Vite build config.
// - `base` must match the GitHub repo name so the game works at
//   https://capflyingfun.github.io/Anthill-Airways/
//   (renamed from Anthill-Airways-Dino in v0.67.1; the old address redirects here, see src/core/carry.ts)
// - VitePWA writes the web app manifest + a service worker so the game
//   can be installed to the iPhone home screen and played offline.
// - Every build gets a VERSION + BUILD ID baked into the code, and a
//   version.json file next to it. The game compares the two to know when a
//   newer build is live (see src/core/updater.ts).
import { defineConfig, Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
// On GitHub Actions use the commit id; locally use the time.
const BUILD_ID = (process.env.GITHUB_SHA ?? '').slice(0, 7) || `local-${Date.now().toString(36)}`;
const BUILD_TIME = new Date().toISOString();

/** Writes dist/version.json = { version, build, time } */
function versionFile(): Plugin {
  return {
    name: 'version-file',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ version: pkg.version, build: BUILD_ID, time: BUILD_TIME }),
      });
    },
  };
}

export default defineConfig({
  base: '/Anthill-Airways/',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_ID__: JSON.stringify(BUILD_ID),
    __BUILD_TIME__: JSON.stringify(BUILD_TIME),
  },
  plugins: [
    versionFile(),
    VitePWA({
      registerType: 'autoUpdate', // a new service worker takes over as soon as it's installed
      includeAssets: ['icons/apple-touch-icon.png'],
      manifest: {
        name: 'Anthill Airways',
        short_name: 'Anthill Air',
        description: 'Start as an ant. End up running an airline to an island full of dinosaurs.',
        theme_color: '#2b7a3d',
        background_color: '#7cc35a',
        display: 'fullscreen',
        orientation: 'any',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // version.json is deliberately NOT cached, so update checks always see the live one.
        globPatterns: ['**/*.{js,css,html,png,svg,webmanifest,glb,woff}'], // woff = the ground-text font
        // The people (models/h-*.glb, ~11 MB) aren't pre-downloaded: they load
        // when you reach Act 2 and are cached then (see runtimeCaching).
        // Same for the island (d-, s-, t- models): loaded when you first fly there.
        globIgnores: ['**/models/h-*.glb', '**/models/d-*.glb', '**/models/s-*.glb', '**/models/t-*.glb'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024, // the 3D bug models are up to ~1.5 MB each
        runtimeCaching: [
          {
            urlPattern: /\/models\/h-[\w-]+\.glb(\?.*)?$/,
            handler: 'CacheFirst',
            options: { cacheName: 'human-models', expiration: { maxEntries: 40 } }, // (17 people since v0.63)
          },
          {
            // 🔊 Sounds + music (public/audio, made with ElevenLabs): cached the first time
            // they play. Each URL carries ?v=<version>, so a regenerated sound is a new URL.
            urlPattern: /\/audio\/[\w-]+\.mp3(\?.*)?$/,
            handler: 'CacheFirst',
            options: { cacheName: 'audio', expiration: { maxEntries: 80 } },
          },
          {
            // 🧍 (v0.93.2) the Character Builder's bodies and hairstyles (its own site, the same host as this game):
            // about 16 MB for hers and 19 MB for his, downloaded once and kept on the phone. Before, they were not
            // kept, and on a slow connection every visit fetched them again (all bugs until they were in). Kept until
            // Settings' "Save people for offline" fetches them afresh (builderFiles.ts).
            urlPattern: /\/Custom-Character-Builder-System\/models\/.+\.(glb|bin|png|webp)(\?.*)?$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'builder-models',
              expiration: { maxEntries: 40 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            urlPattern: /\/models\/[dst]-[\w-]+\.glb(\?.*)?$/,
            handler: 'CacheFirst',
            options: { cacheName: 'island-models', expiration: { maxEntries: 30 } },
          },
        ],
      },
    }),
  ],
});
