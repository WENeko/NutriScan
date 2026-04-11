/**
 * NutriVibe Intelligence Engine - v0.87.0
 * Algorithmes de personnalisation (Focus Vitamines B, E & Minéraux)
 */

export interface UserProfile {
  age: number;
  gender: 'male' | 'female';
  weight: number;
  totalCaloriesGoal: number;
  isAthlete?: boolean;
  isSmoker?: boolean;
  isPregnant?: boolean;
}

export const calculateMicroGoals = (profile: UserProfile) => {
  const { age, gender, weight, totalCaloriesGoal, isAthlete, isSmoker, isPregnant } = profile;

  // --- MACRO-RÉGULATEURS ---
  const fiberGoal = Math.max(25, Math.round((totalCaloriesGoal / 1000) * 14));
  const sugarMax = Math.round((totalCaloriesGoal * 0.1) / 4);
  const satFatMax = Math.round((totalCaloriesGoal * 0.1) / 9);

  // --- MINÉRAUX ADAPTÉS ---
  let magnesium = weight * 6;
  if (isAthlete) magnesium *= 1.2;

  let iron = gender === 'male' ? 11 : 16;
  if (isPregnant) iron = 27;

  let zinc = gender === 'male' ? 11 : 8;
  if (isAthlete) zinc *= 1.25;

  const potassium = gender === 'male' ? 3500 : 3000;
  const calcium = (gender === 'female' && age > 50) || age > 70 ? 1200 : 1000;

  // --- VITAMINES DYNAMIQUES ---

  // VITAMINE E : Base 15mg. 
  // +20% pour les sportifs (protection des membranes cellulaires).
  // +2mg pour les fumeurs (stress oxydatif lipidique).
  let vitE = 15;
  if (isAthlete) vitE *= 1.2;
  if (isSmoker) vitE += 2;

  // VITAMINE C : Base 110mg. 
  let vitC = 110;
  if (isSmoker) vitC += 35; 
  if (isAthlete) vitC += 20;

  // VITAMINES B : Focus B9 et B12
  const vitB9 = isPregnant ? 600 : 400; // µg
  let vitB12 = 4; // µg
  if (isAthlete) vitB12 = 5;

  // VITAMINE D : 15µg (Standard). 20µg (Seniors).
  const vitD = age > 70 ? 20 : 15;

  return {
    fiber: fiberGoal,
    sugar: sugarMax,
    saturated_fat: satFatMax,
    omega3_mg: isAthlete ? 1000 : 500,
    sodium_mg: isAthlete ? 3000 : 2300,
    potassium_mg: Math.round(potassium),
    magnesium_mg: Math.round(magnesium),
    calcium_mg: Math.round(calcium),
    iron_mg: Math.round(iron),
    zinc_mg: Math.round(zinc),
    vitamin_c_mg: Math.round(vitC),
    vitamin_d_mcg: Math.round(vitD),
    vitamin_b9_mcg: Math.round(vitB9),
    vitamin_b12_mcg: Math.round(vitB12),
    vitamin_e_mg: Math.round(vitE)
  };
};
