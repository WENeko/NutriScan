import { afterEach, describe, expect, it, vi } from "vitest";
import { checkForUpdate, hasUnseenInstalledVersion, installedReleaseNotes, markInstalledVersionSeen, skipUpdate, useHasUpdate, type UpdateInfo } from "./appUpdate";
import { renderHook, waitFor } from "@testing-library/react";
vi.mock("@/data/release-history.json", () => ({ default: [16, 17, 18, 19].map(day => ({
  versionName: `2026.11.${day}.01`, versionCode: Number(`202611${day}01`),
  changes: [{ id: String(day), sections: [{ title: "Amélioration", items: ["Nouveauté"] }] }],
})) }));
const release: UpdateInfo = { versionName: "2099.01.01.01", versionCode: 2099010101, notes: "", apkUrl: null, publishedAt: null, sizeBytes: null };
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });
describe("update management", () => {
  it("mounts the update hook without crashing and detects postponed releases", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ tag_name: "v2099.01.01.01", assets: [] }) })));
    skipUpdate(release);
    const { result, unmount } = renderHook(() => useHasUpdate());
    await waitFor(() => expect(result.current).toBe(true));
    unmount();
  });
  it("allows a manual check to find a previously postponed update", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ tag_name: "v2099.01.01.01", assets: [] }) })));
    skipUpdate(release);
    expect(await checkForUpdate()).toBeNull();
    expect((await checkForUpdate({ ignoreSkipped: true }))?.versionCode).toBe(2099010101);
  });
  it("shows news only after installing a newer version, never for a first launch", () => {
    expect(hasUnseenInstalledVersion(2026111801, 2026111701)).toBe(true);
    expect(hasUnseenInstalledVersion(2026111801, 2026111801)).toBe(false);
    expect(hasUnseenInstalledVersion(2026111801, 0)).toBe(false);
  });
  it("loads three missed releases offline and persists acknowledgement of the installed version", async () => {
    vi.stubGlobal("__APP_VERSION_CODE__", "2026111801");
    const fetchMock = vi.fn(() => { throw new Error("Offline"); });
    vi.stubGlobal("fetch", fetchMock);
    localStorage.setItem("nutriscan-update-seen-version", "2026111501");
    expect((await installedReleaseNotes()).map(e => e.versionCode)).toEqual([2026111801, 2026111701, 2026111601]);
    expect(fetchMock).not.toHaveBeenCalled();
    markInstalledVersionSeen();
    expect(localStorage.getItem("nutriscan-update-seen-version")).toBe("2026111801");
    expect(await installedReleaseNotes()).toEqual([]);
  });
  it("initializes first launch without announcing old releases", async () => {
    vi.stubGlobal("__APP_VERSION_CODE__", "2026111801");
    expect(await installedReleaseNotes()).toEqual([]);
    expect(localStorage.getItem("nutriscan-update-seen-version")).toBe("2026111801");
  });
});