import { Button } from "@/components/ui/button";
import { Armchair, Dumbbell, Zap, Check } from "lucide-react";
import { useWorkoutSuggestion } from "@/hooks/useWorkoutSuggestion";
import type { WorkoutContext } from "@/utils/metabolic-quality";

export const WORKOUT_LABELS: Record<WorkoutContext, string> = {
  none: "Standard", pre_workout: "Pré-effort", intra_workout: "Pendant", post_workout: "Post-effort",
};
export default function WorkoutContextPicker({ userId, timestamp, value, onChange, allowSuggestion = true }: {
  userId: string; timestamp: string; value: WorkoutContext; onChange: (value: WorkoutContext) => void; allowSuggestion?: boolean;
}) {
  const suggestion = useWorkoutSuggestion(userId, timestamp);
  return <div className="space-y-2" onClick={event => event.stopPropagation()}>
    <p className="text-xs font-semibold text-muted-foreground">Contexte sportif</p>
    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4" role="group" aria-label="Contexte sportif">
      {(["none", "pre_workout", "intra_workout", "post_workout"] as const).map(context => {
        const Icon = context === "none" ? Armchair : context === "pre_workout" ? Zap : Dumbbell;
        return <Button key={context} type="button" size="sm" variant={value === context ? "default" : "outline"}
          aria-pressed={value === context} onClick={() => onChange(context)} className="px-2 text-xs">
          <Icon />{WORKOUT_LABELS[context]}
        </Button>;
      })}
    </div>
    {allowSuggestion && suggestion !== "none" && suggestion !== value && <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <span>Séance à proximité · {WORKOUT_LABELS[suggestion]}</span>
      <Button type="button" variant="secondary" size="sm" onClick={() => onChange(suggestion)}><Check />Confirmer</Button>
    </div>}
  </div>;
}