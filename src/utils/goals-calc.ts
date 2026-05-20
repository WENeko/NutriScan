/**
 * Calcul scientifique des objectifs caloriques et macros.
 * Extrait de ProfilePage pour être réutilisable (sync Health Connect, etc.).
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
  const tdee = Math.round(bmr * factor);

  const g = GOAL_MODIFIERS[goal_type] || GOAL_MODIFIERS.maintain;
  let calories = Math.round(tdee * (1 + g.cal));
  if (goal_type === "bulk" && input.mass_gain_phase && MASS_GAIN_SURPLUS[input.mass_gain_phase]) {
    calories = Math.round(tdee + MASS_GAIN_SURPLUS[input.mass_gain_phase]);
  }

  const proteins = Math.round(weight * g.protein);
  const fats = Math.round((calories * 0.25) / 9);
  const carbs = Math.max(Math.round((calories - proteins * 4 - fats * 9) / 4), 50);

  return { calories, proteins, carbs, fats, bmr, tdee };
}
