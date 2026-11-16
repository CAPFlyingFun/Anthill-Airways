// ============================================================================
// carry.ts — bringing saves over from the game's old address (v0.67.1).
//
// The repo was renamed from Anthill-Airways-Dino to Anthill-Airways, so the game moved from
// capflyingfun.github.io/Anthill-Airways-Dino/ to capflyingfun.github.io/Anthill-Airways/. In Safari both
// addresses share one localStorage, so nothing is lost. But an iPhone home-screen app keeps its OWN storage, so
// the old address now holds a small redirect page that packs every "anthill-airways…" save into the link:
//   /Anthill-Airways/#carry=<base64 of {key: value, …}>
// This runs before anything reads a save: each carried save is kept if this browser has none for that slot,
// or if the carried one was played more recently (its lastSeen is newer). Then the link is cleaned up.
// ============================================================================
(() => {
  const m = location.hash.match(/[#&]carry=([^&]+)/);
  if (!m) return;
  try {
    const json = decodeURIComponent(escape(atob(decodeURIComponent(m[1]))));
    const carried = JSON.parse(json) as Record<string, string>;
    const lastSeen = (raw: string | null) => {
      try {
        return Number(JSON.parse(raw ?? '{}').lastSeen) || 0;
      } catch {
        return 0;
      }
    };
    for (const [key, value] of Object.entries(carried)) {
      if (!key.startsWith('anthill-airways') || typeof value !== 'string') continue; // (only our own saves)
      const mine = localStorage.getItem(key);
      // a save slot: keep whichever was played last; anything else (which slot is picked): only if missing
      const isSave = value.trimStart().startsWith('{');
      if (mine === null || (isSave && lastSeen(value) > lastSeen(mine))) localStorage.setItem(key, value);
    }
  } catch {
    // (a broken link: start as usual)
  }
  history.replaceState(null, '', location.pathname + location.search);
})();
