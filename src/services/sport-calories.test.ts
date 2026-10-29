import { afterEach, describe, expect, it, vi } from "vitest";
import { completedSportDayKeys, computeSmoothedDailySport } from "./sport-calories";
import { calculateScientificGoals } from "@/utils/goals-calc";

const { query } = vi.hoisted(() => {
  const query = { select: vi.fn(), eq: vi.fn(), gte: vi.fn(), lte: vi.fn() };
  return { query };
});
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => query } }));

describe("sept jours sportifs locaux révolus", () => {
  afterEach(() => vi.useRealTimers());
  it("couvre exactement J-7 à J-1, y compris le changement d'heure", () => {
    expect(completedSportDayKeys(new Date(2026, 9, 29, 0, 15))).toEqual([
      "2026-10-28", "2026-10-27", "2026-10-26", "2026-10-25", "2026-10-24", "2026-10-23", "2026-10-22",
    ]);
  });
  it("inclut les jours sans activité et exclut aujourd'hui même si des séances sont importées", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 29, 0, 15));
    for (const fn of [query.select, query.eq, query.gte]) fn.mockReturnValue(query);
    const sample = (day: string, kcal: number) => ({ recorded_date: day, source_package: "watch", start_time: `${day}T17:00:00Z`, end_time: `${day}T18:00:00Z`, value_kcal: kcal });
    query.lte.mockResolvedValue({ data: [sample("2026-10-28", 700), sample("2026-10-29", 1400), sample("2026-10-21", 2100)] });
    expect(await computeSmoothedDailySport("user", ["watch"])).toBe(100);
    expect(query.gte).toHaveBeenCalledWith("recorded_date", "2026-10-22");
    expect(query.lte).toHaveBeenCalledWith("recorded_date", "2026-10-28");
  });
  it("ajoute la moyenne sportive une seule fois au budget de maintien", () => {
    const input = { weight_kg: 70, height_cm: 175, age: 30, gender: "male", activity_level: "sedentary", goal_type: "maintain" };
    expect(calculateScientificGoals({ ...input, sport_daily_avg: 100 }).calories - calculateScientificGoals(input).calories).toBe(100);
  });
});