import { parseISO } from "date-fns";

export interface BodyTimelineReading {
  key: string;
  weight: number | null;
  bodyFat: number | null;
  muscleMass: number | null;
}

/** Join measurements onto the same local-day axis as nutrition and sessions.
 * Missing measurements stay null; previous/out-of-window readings are not copied.
 */
export function alignBodyTimeline<T extends { key: string }>(
  days: T[], readings: BodyTimelineReading[],
) {
  const byDate = new Map(readings.map((reading) => [reading.key, reading]));
  return days.map((day) => {
    const reading = byDate.get(day.key);
    return {
      ...day,
      weight: reading?.weight ?? null,
      bodyFat: reading?.bodyFat ?? null,
      muscleMass: reading?.muscleMass ?? null,
    };
  });
}

/** Numeric local-midnight coordinates avoid duplicate dd/MM categories across years. */
export function localDayCoordinate(key: string): number {
  return parseISO(key).getTime();
}

export function timelineTicks(days: { time: number }[], maxTicks = 6): number[] {
  if (!days.length) return [];
  const count = Math.min(days.length, Math.max(2, maxTicks));
  return Array.from(new Set(Array.from({ length: count }, (_, i) =>
    days[Math.round(i * (days.length - 1) / (count - 1))].time,
  )));
}