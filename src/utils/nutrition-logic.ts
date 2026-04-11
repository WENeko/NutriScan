/**
 * NutriVibe Intelligence Engine - v0.87.0
 * Algorithmes de personnalisation avancée basés sur les recommandations 
 * de l'ANSES (France) et de l'EFSA (Europe).
 */

export interface UserProfile {
  age?: number;
  gender?: 'male' | 'female';
  weight?: number;
  totalCaloriesGoal?: number;
  isAthlete?: boolean;      // Sportif régulier (> 5h/semaine)
  isSmoker?: boolean;       // Stress oxydatif accru
  isPregnant?: boolean;     // Besoins spécifiques Fer/B9
}

/**
 * Calcule les objectifs de micronutriments personnalisés
 * @param profile Les données physiologiques de l'utilisateur
 */
export const calculateMicroGoals = (profile: UserProfile = {}) => {
  // --- FALLBACKS (Valeurs par défaut si données manquantes) ---
  const age = profile.age || 30;
  const gender = profile.gender || 'male';
  const weight = profile.weight || 75;
  const calories = profile.totalCaloriesGoal || 2000;
  const isAthlete = !!profile.isAthlete;
  const isSmoker = !!profile.isSmoker;
  const isPregnant = !!profile.isPregnant;

  // --- 1. MACRO-RÉGULATEURS (Basés sur l'apport énergétique) ---
  // Fibres : 14g / 1000kcal (EFSA)
  const fiberGoal = Math.max(25, Math.round((calories / 1000) * 14));
  // Sucres : < 10% de l'apport énergétique (OMS)
  const sugarMax = Math.round((calories * 0.1) / 4);
  // Acides Gras Saturés : < 10% de l'apport énergétique (ANSES)
  const satFatMax = Math.round((calories * 0.1) / 9);

  // --- 2. MINÉRAUX (Basés sur le profil physiologique) ---
  // Magnésium : 6mg/kg. Sportif : +20% pour compenser les pertes sudorales.
  const magnesium = Math.round(weight * (isAthlete ? 7.2 : 6));
  // Potassium : Différencié par sexe (EFSA)
  const potassium = gender === 'male' ? 3500 : 3000;
  // Calcium : Augmenté pour les seniors et femmes > 50 ans
  const calcium = (gender === 'female' && age > 50) || age > 70 ? 1200 : 1000;
  // Fer : Homme (11mg), Femme (16mg), Enceinte (27mg)
  const iron = isPregnant ? 27 : (gender === 'female' && age <= 50 ? 16 : 11);
  // Zinc : Synthèse protéique. Sportif : +25%.
  const zinc = Math.round((gender === 'male' ? 11 : 8) * (isAthlete ? 1.25 : 1));
  // Sodium : Plafond OMS (2300mg). Augmenté pour sportifs (pertes par la sueur).
  const sodiumMax = isAthlete ? 3000 : 2300;

  // --- 3. VITAMINES DYNAMIQUES ---
  // Vitamine C : Standard 110mg. +35mg fumeur. +20mg sportif.
  const vitC = 110 + (isSmoker ? 35 : 0) + (isAthlete ? 20 : 0);
  // Vitamine D : 15µg standard, 20µg pour les seniors
  const vitD = age > 70 ? 20 : 15;
  // Vitamine B9 (Folate) : Crucial pendant la grossesse
  const vitB9 = isPregnant ? 600 : 400;
  // Vitamine B12 : Énergie nerveuse. Sportif : besoins accrus.
  const vitB12 = isAthlete ? 5 : 4;
  // Vitamine E : Protection lipidique. Sportif : +20%. Fumeur : +2mg.
  const vitE = Math.round(15 * (isAthlete ? 1.2 : 1) + (isSmoker ? 2 : 0));

  // --- 4. ACIDES GRAS ESSENTIELS ---
  // Oméga-3 (EPA/DHA) : Base 500mg. Sportif (Anti-inflammatoire) : 1000mg.
  const omega3 = isAthlete ? 1000 : 500;

  return {
    fiber: fiberGoal,
    sugar: sugarMax,
    saturated_fat: satFatMax,
    omega3_mg: omega3,
    sodium_mg: sodiumMax,
    potassium_mg: potassium,
    magnesium_mg: magnesium,
    calcium_mg: calcium,
    iron_mg: iron,
    zinc_mg: zinc,
    vitamin_c_mg: vitC,
    vitamin_d_mcg: vitD,
    vitamin_b9_mcg: vitB9,
    vitamin_b12_mcg: vitB12,
    vitamin_e_mg: vitE
  };
};
