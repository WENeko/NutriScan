import { detectWorkoutContext, type WorkoutInterval, type WorkoutWindows } from "./metabolic-quality";

export const WORKOUT_COUNTDOWN_SECONDS = 5;
export interface ClassifiableMeal {
  id: string; timestamp: string; meal_name: string | null; peri_workout: string | null; workout_context_locked: boolean;
}
export function classifySavedMeals(meals: ClassifiableMeal[], sessions: WorkoutInterval[], windows: WorkoutWindows) {
  return meals.flatMap(meal => {
    if (meal.workout_context_locked || (meal.peri_workout && meal.peri_workout !== "none")) return [];
    const context = detectWorkoutContext(meal.timestamp, sessions, windows);
    return context === "none" ? [] : [{ ...meal, context }];
  });
}