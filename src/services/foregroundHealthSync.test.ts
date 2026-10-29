import { afterEach, describe, expect, it, vi } from "vitest";
import { createThrottledHealthSync, startForegroundHealthSync } from "./foregroundHealthSync";

describe("import au premier plan", () => {
  afterEach(() => vi.restoreAllMocks());
  it("partage un import en cours même après 60 secondes", async () => {
    let finish: (() => void) | undefined;
    let now = 0;
    const importData = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    const sync = createThrottledHealthSync(importData, () => now);
    const first = sync("user");
    await Promise.resolve();
    now = 70_000;
    expect(sync("user")).toBe(first);
    expect(importData).toHaveBeenCalledTimes(1);
    finish?.();
    await first;
  });
  it("importe à nouveau à 60 secondes, mais pas avant", async () => {
    let now = 0;
    const importData = vi.fn(async () => {});
    const sync = createThrottledHealthSync(importData, () => now);
    await sync("user");
    now = 59_999;
    await sync("user");
    expect(importData).toHaveBeenCalledTimes(1);
    now = 60_000;
    await sync("user");
    expect(importData).toHaveBeenCalledTimes(2);
  });
  it("ne partage pas la temporisation entre comptes", async () => {
    const importData = vi.fn(async () => {});
    const sync = createThrottledHealthSync(importData, () => 0);
    await sync("first"); await sync("second");
    expect(importData).toHaveBeenCalledTimes(2);
  });
  it("libère le verrou après erreur sans provoquer une boucle immédiate", async () => {
    let now = 0;
    const importData = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined);
    const sync = createThrottledHealthSync(importData, () => now);
    await expect(sync("user")).rejects.toThrow("offline");
    await sync("user");
    expect(importData).toHaveBeenCalledTimes(1);
    now = 60_000;
    await sync("user");
    expect(importData).toHaveBeenCalledTimes(2);
  });
  it("importe au montage et à la reprise, recharge ensuite et supprime les écouteurs", async () => {
    const sequence: string[] = [];
    let resume: (() => void) | undefined;
    const remove = vi.fn(async () => {});
    const sync = vi.fn(async () => { sequence.push("import"); });
    const refresh = vi.fn(async () => { sequence.push("refresh"); });
    const stop = startForegroundHealthSync("user", sync, refresh, async (callback) => { resume = callback; return { remove }; });
    await vi.waitFor(() => expect(sequence).toEqual(["import", "refresh"]));
    resume?.();
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.waitFor(() => expect(sequence).toEqual(["import", "refresh", "import", "refresh"]));
    stop();
    await Promise.resolve();
    expect(remove).toHaveBeenCalledTimes(1);
    resume?.(); document.dispatchEvent(new Event("visibilitychange"));
    expect(sync).toHaveBeenCalledTimes(2);
  });
  it("actualise aussi au retour visible de la PWA", async () => {
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    const refresh = vi.fn(async () => {});
    const sync = vi.fn(async () => {});
    const stop = startForegroundHealthSync("user", sync, refresh, async () => ({ remove: async () => {} }));
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
    stop();
  });
});