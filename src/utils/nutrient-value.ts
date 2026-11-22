/** Strict decimal parsing; absent/invalid measurements remain unknown. */
export function observedNutrient(value: unknown): number | undefined {
  if (value == null || (typeof value !== "number" && typeof value !== "string")) return undefined;
  if (typeof value === "string" && !value.trim()) return undefined;
  const number = typeof value === "number" ? value : Number(value.trim().replace(",", "."));
  return Number.isFinite(number) && number >= 0 ? number : undefined;
}

/** Required macro fields use zero when the input cannot be stored. */
export function safeNutrient(value: unknown): number {
  return observedNutrient(value) ?? 0;
}