import { afterEach, describe, expect, it, vi } from "vitest";
import { checkForUpdate, hasUnseenInstalledVersion, skipUpdate, type UpdateInfo } from "./appUpdate";
const release: UpdateInfo = { versionName: "2099.01.01.01", versionCode: 2099010101, notes: "", apkUrl: null, publishedAt: null, sizeBytes: null };
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });
describe("update management", () => {
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
});