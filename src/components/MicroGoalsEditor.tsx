/**
 * Mode expert : édition des objectifs micros standards.
 * - Chaque ligne : input (placeholder = valeur scientifique) + switch is_limit + reset.
 * - Stocke uniquement les valeurs OVERRIDÉES dans `overrides` (clés absentes = défaut auto).
 * - Source unique de vérité : resolveMicroGoals (utils/nutrition-logic.ts).
 */
import React, { useMemo } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FlaskConical, RotateCcw, ArrowUp, ArrowDown } from "lucide-react";
import {
  NUTRIENTS_STD_LIST,
  resolveMicroGoals,
  type MicroOverrides,
  type UserProfile,
} from "@/utils/nutrition-logic";

import { useMicroCategories } from "@/hooks/useMicroCategories";

interface Props {
  userProfile: UserProfile;
  overrides: MicroOverrides;
  onChange: (next: MicroOverrides) => void;
}

const MicroGoalsEditor: React.FC<Props> = ({ userProfile, overrides, onChange }) => {
  const { labelOf } = useMicroCategories();
  // Résolution complète (mais on n'édite QUE les std ici, les custom ont leur propre éditeur)
  const resolved = useMemo(
    () => resolveMicroGoals(userProfile, [], overrides).filter((r) => !r.isCustom),
    [userProfile, overrides],
  );

  const groups = useMemo(() => {
    const map = new Map<string, typeof resolved>();
    resolved.forEach((r) => {
      const arr = map.get(r.category) ?? [];
      arr.push(r);
      map.set(r.category, arr);
    });
    return Array.from(map.entries());
  }, [resolved]);

  const setOverride = (key: string, patch: Partial<{ goal: number | undefined; is_limit: boolean | undefined }>) => {
    const next: MicroOverrides = { ...overrides };
    const current = { ...(next[key] ?? {}) };
    if ("goal" in patch) {
      if (patch.goal == null || !Number.isFinite(patch.goal)) delete current.goal;
      else current.goal = patch.goal;
    }
    if ("is_limit" in patch) {
      if (patch.is_limit == null) delete current.is_limit;
      else current.is_limit = patch.is_limit;
    }
    if (current.goal == null && current.is_limit == null) delete next[key];
    else next[key] = current;
    onChange(next);
  };

  const reset = (key: string) => {
    const next = { ...overrides };
    delete next[key];
    onChange(next);
  };

  return (
    <section className="bg-card rounded-2xl p-5 shadow-card animate-fade-up">
      <div className="flex items-center gap-2 mb-2">
        <FlaskConical className="w-4 h-4 text-primary" />
        <h2 className="font-display font-semibold text-base">Objectifs micros (mode expert)</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Personnalise les objectifs. Laisse vide pour conserver la valeur scientifique.
        Le toggle <strong>↑ / ↓</strong> indique si la valeur est un <em>minimum à atteindre</em> ou
        une <em>limite à ne pas dépasser</em> (affecte la coloration des graphiques).
      </p>

      <div className="space-y-4">
        {groups.map(([cat, items]) => (
          <div key={cat}>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2">{CAT_LABEL[cat] ?? cat}</p>
            <div className="space-y-2">
              {items.map((r) => {
                const ov = overrides[r.key] ?? {};
                const isOver = ov.goal != null || ov.is_limit != null;
                return (
                  <div key={r.key} className="bg-accent rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <Label className="text-xs font-medium flex-1 min-w-0 truncate">
                        {r.label} <span className="text-muted-foreground">({r.unit})</span>
                      </Label>
                      {isOver && (
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => reset(r.key)}
                          aria-label="Réinitialiser"
                          title="Réinitialiser aux valeurs scientifiques"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        inputMode="decimal"
                        value={ov.goal ?? ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          setOverride(r.key, { goal: v === "" ? undefined : Number(v) });
                        }}
                        placeholder={r.scientificGoal != null ? String(r.scientificGoal) : ""}
                        className="h-9 flex-1"
                      />
                      <div className="flex items-center gap-1.5 bg-card rounded-lg px-2 py-1.5">
                        {r.isLimit ? (
                          <ArrowDown className="w-3.5 h-3.5 text-destructive" />
                        ) : (
                          <ArrowUp className="w-3.5 h-3.5 text-primary" />
                        )}
                        <span className="text-[10px] font-semibold">
                          {r.isLimit ? "Max" : "Min"}
                        </span>
                        <Switch
                          checked={r.isLimit}
                          onCheckedChange={(v) => {
                            const defaultLimit = !!NUTRIENTS_STD_LIST.find((n) => n.key === r.key)?.isLimitDefault;
                            setOverride(r.key, { is_limit: v === defaultLimit ? undefined : v });
                          }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

export default MicroGoalsEditor;
