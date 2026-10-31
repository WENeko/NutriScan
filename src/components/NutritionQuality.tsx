import { calculateMealQuality, type QualityInput, type UserPreset } from "@/utils/metabolic-quality";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Info } from "lucide-react";

export function QualityBadge({ score, grade, coverage }: { score: number | null; grade: string | null; coverage: number }) {
  return <div className="flex flex-wrap items-center gap-2 text-xs">
    <span className={`font-semibold ${grade === "A" || grade === "B" ? "text-primary" : grade === "D" ? "text-destructive" : "text-muted-foreground"}`}>
      IQM {score === null ? "—" : `${score}/100 · ${grade}`}
    </span>
    <span className="text-muted-foreground">{coverage < 0.999 ? "Provisoire · " : ""}couverture {Math.round(coverage * 100)} %</span>
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground" aria-label="À propos de l’IQM">
          <Info className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="max-w-64 text-xs p-3 leading-relaxed" side="top">
        Score indicatif, non clinique. Les valeurs manquantes restent inconnues. La couverture représente les critères calculables.
      </PopoverContent>
    </Popover>
  </div>;
}

const format = (value: number | null | undefined, unit = "g") => value == null ? "—" : `${Math.round(value * 10) / 10} ${unit}`;
export function QualityFractions({ input }: { input: QualityInput }) {
  const sugar = input.nutrients_std?.sugar, fiber = input.nutrients_std?.fiber, sat = input.nutrients_std?.saturated_fat;
  // Fibre is separate: its inclusion in carbohydrate totals differs by catalogue.
  const bars = [
    { label: "Glucides", total: input.carbs, detail: sugar, fraction: "Sucres totaux", className: "quality-sugar" },
    { label: "Lipides", total: input.fats, detail: sat, fraction: "Saturés", className: "quality-saturated" },
  ];
  return <div className="space-y-3">
    {bars.map(bar => <div key={bar.label} className="space-y-1">
      <div className="flex flex-wrap justify-between gap-1 text-xs"><span className="font-semibold">{bar.label} · {format(bar.total)}</span><span className="text-muted-foreground">{bar.fraction} {format(bar.detail)}{bar.detail != null && bar.total != null && bar.total > 0 ? ` · ${Math.round(bar.detail / bar.total * 100)} %` : ""}</span></div>
      <div className="flex h-2 overflow-hidden rounded-sm bg-muted" role="img" aria-label={`${bar.fraction} ${format(bar.detail)} sur ${format(bar.total)}`}>
        {bar.detail != null && bar.total != null && bar.total > 0 && <div className={bar.className} style={{ width: `${Math.min(100, bar.detail / bar.total * 100)}%` }} />}
      </div>
    </div>)}
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"><span>Fibres {format(fiber)}</span><span>Oméga-3 {format(input.nutrients_std?.omega3_mg, "mg")}</span></div>
  </div>;
}
export default function NutritionQuality({ input, preset = "hypertrophy" }: { input: QualityInput; preset?: UserPreset }) {
  const result = calculateMealQuality(input, preset);
  return <div className="space-y-3 py-2"><QualityBadge {...result} /><QualityFractions input={input} /></div>;
}
