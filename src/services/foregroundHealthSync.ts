import { App } from "@capacitor/app";

export const HEALTH_SYNC_INTERVAL_MS = 60_000;

/** Per-user single flight and start-time throttle, shared across dashboard mounts. */
export function createThrottledHealthSync(sync: (userId: string) => Promise<void>, now = Date.now) {
  const states = new Map<string, { started: number; running?: Promise<void> }>();
  return (userId: string): Promise<void> => {
    if (!userId) return Promise.resolve();
    const previous = states.get(userId);
    if (previous?.running) return previous.running;
    if (previous && now() - previous.started < HEALTH_SYNC_INTERVAL_MS) return Promise.resolve();
    const state: { started: number; running?: Promise<void> } = { started: now() };
    states.set(userId, state);
    state.running = Promise.resolve().then(() => sync(userId)).finally(() => { state.running = undefined; });
    return state.running;
  };
}

/** Refresh after import (including throttled imports), not before it finishes. */
export function startForegroundHealthSync(
  userId: string,
  sync: (userId: string) => Promise<void>,
  refresh: () => Promise<void>,
  registerResume = (callback: () => void) => App.addListener("resume", callback),
) {
  let disposed = false;
  let running: Promise<void> | undefined;
  const run = () => {
    if (disposed || running) return;
    running = (async () => {
      try { await sync(userId); }
      catch (error) { console.warn("[health] foreground import failed", error); }
      if (!disposed) await refresh();
    })().catch((error) => console.warn("[health] foreground refresh failed", error))
      .finally(() => { running = undefined; });
  };
  const visible = () => { if (document.visibilityState === "visible") run(); };
  document.addEventListener("visibilitychange", visible);
  const handle = registerResume(run);
  run();
  return () => {
    disposed = true;
    document.removeEventListener("visibilitychange", visible);
    void handle.then((listener) => listener.remove()).catch(() => {});
  };
}