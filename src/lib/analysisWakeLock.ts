/**
 * Maintien de l'écran/processus actif pendant une analyse IA.
 *
 * Quand l'écran s'éteint ou que l'app passe en arrière-plan, la WebView met en
 * pause les timers (chronomètre figé) et Android peut suspendre la requête.
 * On demande donc un Screen Wake Lock pendant toute la durée de l'analyse et on
 * le ré-acquiert automatiquement si l'app redevient visible.
 */
type SentinelLike = { released: boolean; release: () => Promise<void> };

let sentinel: SentinelLike | null = null;
let refCount = 0;
let visibilityBound = false;

async function request() {
  const wl = (navigator as any)?.wakeLock;
  if (!wl?.request) return;
  try {
    sentinel = await wl.request("screen");
  } catch {
    sentinel = null;
  }
}

function onVisibilityChange() {
  if (document.visibilityState === "visible" && refCount > 0 && (!sentinel || sentinel.released)) {
    void request();
  }
}

/** Acquiert le verrou (compteur de références) et renvoie la fonction de libération. */
export async function acquireAnalysisWakeLock(): Promise<() => void> {
  refCount += 1;
  if (!visibilityBound) {
    document.addEventListener("visibilitychange", onVisibilityChange);
    visibilityBound = true;
  }
  if (!sentinel || sentinel.released) await request();

  let released = false;
  return () => {
    if (released) return;
    released = true;
    refCount = Math.max(0, refCount - 1);
    if (refCount === 0) {
      const s = sentinel;
      sentinel = null;
      if (s && !s.released) void s.release().catch(() => {});
      if (visibilityBound) {
        document.removeEventListener("visibilitychange", onVisibilityChange);
        visibilityBound = false;
      }
    }
  };
}
