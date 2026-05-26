/**
 * Calcul scientifique des objectifs caloriques et macros.
 * Formule (v2) : Calories = BMR * activity_factor + sport_daily_avg + ajustement_phase
 *  - ajustement = mode 'percent'  → (BMR*factor + sport) * value/100
 *                 mode 'absolute' → value (kcal)
 */

export interface GoalsInput {
  weight_kg: number;
  height_cm: number;
  age: number;
  gender: string;
  activity_level: string;
  goal_type: string;
  bmr_method?: string;
  body_fat_percent?: number | null;
  morphotype?: string | null;
  mass_gain_phase?: string | null;
  /** Moyenne quotidienne des kcal sportives sur 7 j (Mode Scientifique uniquement). */
  sport_daily_avg?: number;
  /** Mode d'ajustement de phase : 'percent' (par défaut, legacy) ou 'absolute'. */
  phase_adjust_mode?: "percent" | "absolute";
  /** Valeur d'ajustement : -15 (=−15 %) ou -400 (=−400 kcal). Si non fourni → legacy GOAL_MODIFIERS. */
  phase_adjust_value?: number | null;
}

export interface GoalsOutput {
  calories: number;
  proteins: number;
  carbs: number;
  fats: number;
  bmr: number;
  tdee: number;
}

const ACTIVITY_FACTORS: Record<string, number> = {
  sedentary: 1.2,
  lightly_active: 1.35,
  moderate: 1.55,
  athletic: 1.8,
};

const GOAL_MODIFIERS: Record<string, { cal: number; protein: number }> = {
  cut: { cal: -0.15, protein: 1.6 },
  maintain: { cal: 0, protein: 1.8 },
  bulk: { cal: 0.10, protein: 2.0 },
};

const MORPHO_FACTOR: Record<string, number> = {
  ecto: 1.05,
  meso: 1.0,
  endo: 0.95,
  "ecto-meso": 1.02,
  "endo-meso": 0.97,
};

const MASS_GAIN_SURPLUS: Record<string, number> = {
  initial: 500,
  growth: 700,
  stabilization: 500,
};

export function calculateScientificGoals(input: GoalsInput): GoalsOutput {
  const { weight_kg: weight, height_cm: height, age, gender, activity_level, goal_type } = input;
  const bmr_method = input.bmr_method || "mifflin";
  const bf = input.body_fat_percent || null;
  const leanMass = bf && weight > 0 ? weight * (1 - bf / 100) : null;

  let bmr = 0;
  if (bmr_method === "katch" && leanMass && leanMass > 0) {
    bmr = Math.round(21.6 * leanMass + 370);
  } else if (gender === "female") {
    bmr = Math.round(10 * weight + 6.25 * height - 5 * age - 161);
  } else {
    bmr = Math.round(10 * weight + 6.25 * height - 5 * age + 5);
  }

  const morphoFactor = (input.morphotype && MORPHO_FACTOR[input.morphotype]) || 1.0;
  bmr = Math.round(bmr * morphoFactor);

  const factor = ACTIVITY_FACTORS[activity_level] ?? 1.55;
  const tdeeBase = bmr * factor;
  const sport = Math.max(0, Number(input.sport_daily_avg) || 0);
  const tdee = Math.round(tdeeBase + sport);

  // ── Ajustement de phase ──
  let calories: number;
  const hasNewPhaseMode = input.phase_adjust_mode !== undefined && input.phase_adjust_value !== undefined && input.phase_adjust_value !== null;
  if (hasNewPhaseMode) {
    const v = Number(input.phase_adjust_value) || 0;
    const adjust = input.phase_adjust_mode === "absolute" ? v : (tdeeBase + sport) * (v / 100);
    calories = Math.round(tdeeBase + sport + adjust);
  } else {
    // Legacy
    const g = GOAL_MODIFIERS[goal_type] || GOAL_MODIFIERS.maintain;
    calories = Math.round(tdee * (1 + g.cal));
    if (goal_type === "bulk" && input.mass_gain_phase && MASS_GAIN_SURPLUS[input.mass_gain_phase]) {
      calories = Math.round(tdee + MASS_GAIN_SURPLUS[input.mass_gain_phase]);
    }
  }

  const proteinPerKg = (GOAL_MODIFIERS[goal_type] || GOAL_MODIFIERS.maintain).protein;
  const proteins = Math.round(weight * proteinPerKg);
  const fats = Math.round((calories * 0.25) / 9);
  const carbs = Math.max(Math.round((calories - proteins * 4 - fats * 9) / 4), 50);

  return { calories, proteins, carbs, fats, bmr, tdee };
}
