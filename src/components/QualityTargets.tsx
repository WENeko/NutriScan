import { qualityTargets, type UserPreset } from "@/utils/metabolic-quality";

interface Props {
  preset: UserPreset;
  weightKg: number;
  calories: number;
  totals: { proteins: number; fats: number };
  nutrients: Record<string, number>;
}

/** Daily profile targets; a nutrient with no recorded value shows "—" instead of 0. */
export function QualityTargets({ preset, weightKg, calories, totals, nutrients }: Props) {
  const t = qualityTargets(preset, weightKg, calories);
  const val = (k: string) => (typeof nutrients[k] === "number" ? nutrients[k] : null);
  const rows: { label: string; value: number | null; target: string; ok: boolean | null; unit: string }[] = [];
  const [pMin, pMax] = t.proteinG;
  rows.push({ label: "Protéines", value: totals.proteins, unit: "g",
    target: pMin === pMax ? `${Math.round(pMin)}` : `${Math.round(pMin)}–${Math.round(pMax)}`, ok: totals.proteins >= pMin });
  if (t.fatMinG !== null) rows.push({ label: "Lipides min", value: totals.fats, unit: "g", target: `≥ ${Math.round(t.fatMinG)}`, ok: totals.fats >= t.fatMinG });
  const add = (label: string, key: string, limit: number | null, min: boolean, unit: string) => {
    if (limit === null) return;
    const v = val(key);
    rows.push({ label, value: v, unit, target: `${min ? "≥" : "≤"} ${Math.round(limit)}`, ok: v === null ? null : min ? v >= limit : v <= limit });
  };
  add("Oméga‑3", "omega3_mg", t.omega3MinMg, true, "mg");
  add("Sucres", "sugar", t.sugarMaxG, false, "g");
  add("Fibres", "fiber", t.fiberMinG, true, "g");
  add("Saturés", "saturated_fat", t.saturatedMaxG, false, "g");

  return (
    <div className="space-y-1">
      <p className="text-[11px] font-semibold text-muted-foreground">Objectifs du profil</p>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        {rows.map(r => (
          <div key={r.label} className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{r.label}</span>
            <span className={r.ok === null ? "text-muted-foreground" : r.ok ? "text-primary font-semibold" : "text-destructive font-semibold"}>
              {r.value === null ? "—" : Math.round(r.value)}/{r.target} {r.unit}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
