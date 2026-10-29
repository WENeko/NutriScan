import { describe, expect, it, vi, afterEach } from "vitest";
import { readNativeHealthData, syncHealthData } from "./health-connect";

const { query, smoothing } = vi.hoisted(() => {
  const query = { upsert: vi.fn(), select: vi.fn(), eq: vi.fn(), single: vi.fn() };
  return { query, smoothing: vi.fn(async () => 100) };
});
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => query } }));
vi.mock("./sport-calories", () => ({ computeSmoothedDailySport: smoothing }));

describe("import sportif et changement de journée", () => {
  afterEach(() => { vi.useRealTimers(); delete (window as any).Capacitor; });
  it("affecte les séances à la date locale de début, pas à la date UTC", async () => {
    const start = new Date(2026, 9, 29, 0, 15);
    (window as any).Capacitor = { Plugins: {
      Health: { readSamples: async () => ({ samples: [] }) },
      SportSamples: { readSamples: async () => ({ samples: [{ source_package: "watch", start_time: start.toISOString(), end_time: new Date(start.getTime() + 3600_000).toISOString(), value_kcal: 100 }] }) },
    } };
    expect((await readNativeHealthData()).sportSamples?.[0].recorded_date).toBe("2026-10-29");
  });
  it("recalcule le lissage même sans nouvelles séances et stocke la date locale du jour", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 29, 0, 15));
    query.select.mockReturnValue(query); query.eq.mockReturnValue(query);
    query.single.mockResolvedValue({ data: { sport_allowed_sources: ["watch"], goals_mode: "manual" } });
    query.upsert.mockResolvedValue({ error: null });
    const result = await syncHealthData("user", { sportSamples: [] }, { sync_weight: false, sync_body_fat: false, sync_calories: true, sync_sleep: false });
    expect(smoothing).toHaveBeenCalledWith("user", ["watch"]);
    expect(query.upsert).toHaveBeenCalledWith({ user_id: "user", recorded_at: "2026-10-29", active_calories_kcal: 100, source: "health_connect" }, { onConflict: "user_id,recorded_at" });
    expect(result.errors).toEqual([]);
  });
});