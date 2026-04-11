/**
 * Calcule les objectifs de micronutriments basés sur le profil utilisateur
 * Références : ANSES / OMS
 */

export interface UserProfile {
  age: number;
  gender: 'male' | 'female';
  weight: number;
}

export const calculateMicroGoals = (profile: UserProfile) => {
  const { age, gender, weight } = profile;

  return {
    fiber: 30, // Standard pour adultes
    sugar: 50, // < 10% de l'apport énergétique moyen
    saturated_fat: 22, 
    omega3_mg: 500,
    
    // Sodium : Réduction si possible, mais max 2300mg
    sodium_mg: 2300,
    
    // Potassium : Plus élevé chez l'homme ou si poids élevé
    potassium_mg: gender === 'male' ? 3500 : 3000,
    
    // Magnésium : 6mg / kg de poids corporel (Standard scientifique)
    magnesium_mg: Math.round(weight * 6),
    
    // Calcium : Augmente après 50 ans (femme) ou 70 ans (homme)
    calcium_mg: (gender === 'female' && age > 50) || age > 70 ? 1200 : 1000,
    
    vitamin_b_mg: 1.4,
    vitamin_c_mg: 110,
    vitamin_d_mcg: age > 70 ? 20 : 15,
    vitamin_e_mg: 15
  };
};
