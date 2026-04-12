/**
 * NutriVibe Intelligence Engine - v1.0.0
 * Source Unique de Vérité pour la logique nutritionnelle.
 */

export interface NutrientDef {
  key: string;
  label: string;
  unit: string;
  category: 'macro' | 'mineral' | 'vitamin' | 'lipid';
}

export const NUTRIENTS_MASTER_LIST: NutrientDef[] = [
  { key: "fiber", label: "Fibres", unit: "g", category: "macro" },
  { key: "sugar", label: "Sucres", unit: "g", category: "macro" },
  { key: "saturated_fat", label: "AG Sat.", unit: "g", category: "macro" },
  { key: "omega3_mg", label: "Oméga-3", unit: "mg", category: "lipid" },
  { key: "sodium_mg", label: "Sodium", unit: "mg", category: "mineral" },
  { key: "potassium_mg", label: "Potassium", unit: "mg", category: "mineral" },
  { key: "magnesium_mg", label: "Magnésium", unit: "mg", category: "mineral" },
  { key: "calcium_mg", label: "Calcium", unit: "mg", category: "mineral" },
  { key: "iron_mg", label: "Fer", unit: "mg", category: "mineral" },
  { key: "zinc_mg", label: "Zinc", unit: "mg", category: "mineral" },
  { key: "vitamin_c_mg", label: "Vit. C", unit: "mg", category: "vitamin" },
  { key: "vitamin_d_mcg", label: "Vit. D", unit: "µg", category: "vitamin" },
  { key: "vitamin_b9_mcg", label: "Vit. B9", unit: "µg", category: "vitamin" },
  { key: "vitamin_b12_mcg", label: "Vit. B12", unit: "µg", category: "vitamin" },
  { key: "vitamin_e_mg", label: "Vit. E", unit: "mg", category: "vitamin" },
];

export interface UserProfile {
  age?: number;
  gender?: 'male' | 'female';
  weight?: number;
  totalCaloriesGoal?: number;
  isAthlete?: boolean;
  isSmoker?: boolean;
  isPregnant?: boolean;
}

// Type pour l'objet de retour (ex: { iron_mg: number, ... })
export type MicroGoals = Record<string, number>;

/**
 * Calcule les objectifs de micronutriments personnalisés
 */
export const calculateMicroGoals = (profile: UserProfile = {}): MicroGoals => {
  // --- FALLBACKS ---
  const age = profile.age ?? 30;
  const gender = profile.gender ?? 'male';
  const weight = profile.weight ?? 75;
  const calories = profile.totalCaloriesGoal ?? 2000;
  const isAthlete = !!profile.isAthlete;
  const isSmoker = !!profile.isSmoker;
  const isPregnant = !!profile.isPregnant;

  const goals: MicroGoals = {};

  // --- LOGIQUE DE CALCUL PAR CLÉ ---
  NUTRIENTS_MASTER_LIST.forEach((n) => {
    let value = 0;

    switch (n.key) {
      // MACROS
      case "fiber":
        value = Math.max(25, (calories / 1000) * 14);
        break;
      case "sugar":
        value = (calories * 0.1) / 4;
        break;
      case "saturated_fat":
        value = (calories * 0.1) / 9;
        break;

      // MINÉRAUX
      case "magnesium_mg":
        value = weight * (isAthlete ? 7.2 : 6);
        break;
      case "potassium_mg":
        value = gender === "male" ? 3500 : 3000;
        break;
      case "calcium_mg":
        // Correction de la condition logique pour plus de clarté
        value = (age > 70 || (gender === "female" && age > 50)) ? 1200 : 1000;
        break;
      case "iron_mg":
        value = isPregnant ? 27 : (gender === "female" && age <= 50 ? 16 : 11);
        break;
      case "zinc_mg":
        value = (gender === "male" ? 11 : 8) * (isAthlete ? 1.25 : 1);
        break;
      case "sodium_mg":
        value = isAthlete ? 3000 : 2300;
        break;

      // VITAMINES
      case "vitamin_c_mg":
        value = 110 + (isSmoker ? 35 : 0) + (isAthlete ? 20 : 0);
        break;
      case "vitamin_d_mcg":
        value = age > 70 ? 20 : 15;
        break;
      case "vitamin_b9_mcg":
        value = isPregnant ? 600 : 400;
        break;
      case "vitamin_b12_mcg":
        value = isAthlete ? 5 : 4;
        break;
      case "vitamin_e_mg":
        value = 15 * (isAthlete ? 1.2 : 1) + (isSmoker ? 2 : 0);
        break;

      // LIPIDES
      case "omega3_mg":
        value = isAthlete ? 1000 : 500;
        break;

      default:
        value = 0;
    }

    goals[n.key] = Math.round(value);
  });

  return goals;
};
