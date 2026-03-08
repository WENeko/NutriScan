/**
 * Personalized daily micronutrient recommendations
 * Based on ANSES/EFSA/NIH guidelines, adapted by sex, age, weight, and activity level.
 */

export interface UserProfile {
  gender?: string | null; // "male" | "female"
  age?: number | null;
  weight_kg?: number | null;
  activity_level?: string | null; // "sedentary" | "light" | "moderate" | "active" | "very_active"
}

export interface MicroGoals {
  fiber: number;
  sugar: number;
  saturated_fat: number;
  omega3_mg: number;
  sodium_mg: number;
  potassium_mg: number;
  magnesium_mg: number;
  calcium_mg: number;
  vitamin_b_mg: number;
  vitamin_c_mg: number;
  vitamin_d_mcg: number;
  vitamin_e_mg: number;
}

const isActive = (level?: string | null) =>
  level === "active" || level === "very_active" || level === "athletic";

export function getPersonalizedMicroGoals(profile: UserProfile): MicroGoals {
  const isMale = profile.gender !== "female";
  const age = profile.age ?? 30;
  const active = isActive(profile.activity_level);
  const weight = profile.weight_kg ?? 70;

  // Fiber: 25g women, 30g men; +5g if active
  const fiber = (isMale ? 30 : 25) + (active ? 5 : 0);

  // Sugar: <50g men, <40g women (OMS)
  const sugar = isMale ? 50 : 40;

  // Saturated fat: ~10% of ~2000-2500kcal = 22-28g
  const saturated_fat = isMale ? 25 : 20;

  // Omega-3: 500mg, +250mg if active
  const omega3_mg = 500 + (active ? 250 : 0);

  // Sodium: <2300mg, athletes can go to 2500
  const sodium_mg = active ? 2500 : 2300;

  // Potassium: 3500mg men, 2600mg women; +500mg if active
  const potassium_mg = (isMale ? 3500 : 2600) + (active ? 500 : 0);

  // Magnesium: ~6mg/kg body weight, min 300 women / 380 men
  const magnesium_mg = Math.max(
    isMale ? 380 : 300,
    Math.round(weight * 6)
  ) + (active ? 50 : 0);

  // Calcium: 1000mg; 1200mg if >50 or <25
  const calcium_mg = age > 50 || age < 25 ? 1200 : 1000;

  // Vitamin B12: 2.4µg = mg; slightly higher for older adults
  const vitamin_b_mg = age > 50 ? 3 : 2.4;

  // Vitamin C: 90mg men, 75mg women; +35mg if active
  const vitamin_c_mg = (isMale ? 90 : 75) + (active ? 35 : 0);

  // Vitamin D: 15µg; 20µg if >70
  const vitamin_d_mcg = age > 70 ? 20 : 15;

  // Vitamin E: 15mg
  const vitamin_e_mg = 15;

  return {
    fiber, sugar, saturated_fat, omega3_mg, sodium_mg, potassium_mg,
    magnesium_mg, calcium_mg, vitamin_b_mg, vitamin_c_mg, vitamin_d_mcg, vitamin_e_mg,
  };
}

/** Human-readable info string with personalized goal */
export function getMicroInfo(key: string, goal: number): string {
  const map: Record<string, (g: number) => string> = {
    fiber: (g) => `Digestion et satiété. Objectif : ${g}g/jour.`,
    sugar: (g) => `Glucides simples. Limitez à <${g}g/jour.`,
    saturated_fat: (g) => `Santé cardiovasculaire. Limitez à <${g}g/jour.`,
    omega3_mg: (g) => `Inflammation et santé cardiaque. ${g}mg/jour.`,
    sodium_mg: (g) => `Équilibre hydrique. <${g}mg/jour.`,
    potassium_mg: (g) => `Équilibre hydrique et muscles. ${g}mg/jour.`,
    magnesium_mg: (g) => `Récupération et santé osseuse. ${g}mg/jour.`,
    calcium_mg: (g) => `Santé osseuse. ${g}mg/jour.`,
    vitamin_b_mg: (g) => `Énergie et système nerveux. ${g}mg/jour.`,
    vitamin_c_mg: (g) => `Antioxydants et immunité. ${g}mg/jour.`,
    vitamin_d_mcg: (g) => `Immunité et hormones. ${g}µg/jour.`,
    vitamin_e_mg: (g) => `Antioxydants. ${g}mg/jour.`,
  };
  return map[key]?.(goal) ?? "";
}
