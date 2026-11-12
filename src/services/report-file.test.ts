import { beforeEach, describe, expect, it, vi } from "vitest";
const native = vi.hoisted(() => ({ platform: "web", save: vi.fn(), write: vi.fn(), share: vi.fn() }));
vi.mock("@capacitor/core", () => ({
  Capacitor: { getPlatform: () => native.platform, isNativePlatform: () => native.platform !== "web" },
  registerPlugin: () => ({ save: native.save }),
}));
vi.mock("@capacitor/filesystem", () => ({ Filesystem: { writeFile: native.write }, Directory: { Cache: "CACHE" } }));
vi.mock("@capacitor/share", () => ({ Share: { share: native.share } }));
import { deliverReportFile, shareReportFile } from "./report-file";

beforeEach(() => {
  vi.clearAllMocks(); native.platform = "web";
  native.write.mockResolvedValue({ uri: "file:///cache/reports/bilan.pdf" });
  native.save.mockResolvedValue({ saved: true, location: "Téléchargements/NutriScan" });
});
describe("report delivery actions", () => {
  it("downloads on touch browsers without invoking sharing and delays URL cleanup", async () => {
    vi.useFakeTimers();
    const create = vi.fn(() => "blob:report"), revoke = vi.fn(), share = vi.fn();
    vi.stubGlobal("URL", { createObjectURL: create, revokeObjectURL: revoke });
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await deliverReportFile(new Blob(["test"], { type: "text/csv" }), "bilan.csv");
    expect(click).toHaveBeenCalledOnce(); expect(share).not.toHaveBeenCalled();
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(30000); expect(revoke).toHaveBeenCalledWith("blob:report");
    click.mockRestore(); vi.unstubAllGlobals(); vi.useRealTimers();
  });
  it("saves Android downloads without opening the share sheet", async () => {
    native.platform = "android";
    const result = await deliverReportFile(new Blob(["pdf"], { type: "application/pdf" }), "bilan.pdf");
    expect(native.save).toHaveBeenCalledWith({ uri: "file:///cache/reports/bilan.pdf", filename: "bilan.pdf", mimeType: "application/pdf" });
    expect(result.saved).toBe(true); expect(native.share).not.toHaveBeenCalled();
  });
  it("opens native sharing only for the explicit share action", async () => {
    native.platform = "android";
    await shareReportFile(new Blob(["pdf"], { type: "application/pdf" }), "bilan.pdf");
    expect(native.share).toHaveBeenCalledWith(expect.objectContaining({ files: ["file:///cache/reports/bilan.pdf"] }));
    expect(native.save).not.toHaveBeenCalled();
  });
});