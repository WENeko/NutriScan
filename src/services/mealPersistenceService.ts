import { supabase } from "@/integrations/supabase/client";
import { createClient } from "@supabase/supabase-js";
import type { MicroNutrientFields, getNutrientKeys } from "@/utils/nutrition-logic";

// Initialisation du client personnel (Base secondaire)
const personalUrl = import.meta.env.VITE_PERSONAL_SUPABASE_URL;
const personalKey = import.meta.env.VITE_PERSONAL_SUPABASE_ANON_KEY;

const personalSupabase = (personalUrl && personalKey) 
  ? createClient(personalUrl, personalKey) 
  : null;

// Type pour un item alimentaire
interface MealItem {
  food_name: string;
  name?: string; // alias pour compatibilité BDD perso
  calories: number;
  proteins: number;
  carbs: number;
  fats: number;
  quantity?: number; // pour BDD perso
  estimated_weight_g?: number;
  unit_count?: number;
  unit_label?: string;
  unit_weight_g?: number;
}

// Type étendu avec micronutriments
type MealItemWithMicros = MealItem & MicroNutrientFields;

interface SaveMealParams {
  userId: string;
  mealData: {
    meal_name: string;
    total_calories: number;
    total_proteins: number;
    total_carbs: number;
    total_fats: number;
    image_url?: string | null;
    timestamp?: string;
    // Micronutriments agrégés
    total_fiber?: number;
    total_sugar?: number;
    total_sodium_mg?: number;
    total_potassium_mg?: number;
    total_magnesium_mg?: number;
    total_calcium_mg?: number;
    total_iron_mg?: number;
    total_zinc_mg?: number;
    total_vitamin_c_mg?: number;
    total_vitamin_d_mcg?: number;
    total_vitamin_b9_mcg?: number;
    total_vitamin_b12_mcg?: number;
    total_vitamin_e_mg?: number;
    total_omega3_mg?: number;
    total_saturated_fat?: number;
  };
  items: MealItemWithMicros[];
}

/**
 * Construit l'objet meal pour la base Lovable (structure avec colonnes individuelles)
 */
function buildLovableMeal(mealData: SaveMealParams['mealData'], userId: string) {
  return {
    user_id: userId,
    timestamp: mealData.timestamp || new Date().toISOString(),
    image_url: mealData.image_url,
    raw_ai_analysis: mealData.meal_name, // Lovable utilise raw_ai_analysis
    total_calories: mealData.total_calories,
    total_proteins: mealData.total_proteins,
    total_carbs: mealData.total_carbs,
    total_fats: mealData.total_fats,
    // Micronutriments totaux
    total_fiber: mealData.total_fiber,
    total_sugar: mealData.total_sugar,
    total_sodium_mg: mealData.total_sodium_mg,
    total_potassium_mg: mealData.total_potassium_mg,
    total_magnesium_mg: mealData.total_magnesium_mg,
    total_calcium_mg: mealData.total_calcium_mg,
    total_iron_mg: mealData.total_iron_mg,
    total_zinc_mg: mealData.total_zinc_mg,
    total_vitamin_c_mg: mealData.total_vitamin_c_mg,
    total_vitamin_d_mcg: mealData.total_vitamin_d_mcg,
    total_vitamin_b9_mcg: mealData.total_vitamin_b9_mcg,
    total_vitamin_b12_mcg: mealData.total_vitamin_b12_mcg,
    total_vitamin_e_mg: mealData.total_vitamin_e_mg,
    total_omega3_mg: mealData.total_omega3_mg,
    total_saturated_fat: mealData.total_saturated_fat,
    is_confirmed: true
  };
}

/**
 * Construit l'objet meal pour la base perso (structure minimaliste)
 * Les totaux sont calculés côté client si besoin, ou stockés dans les items
 */
function buildPersonalMeal(mealData: SaveMealParams['mealData'], userId: string) {
  return {
    user_id: userId,
    meal_name: mealData.meal_name,
    created_at: mealData.timestamp || new Date().toISOString()
    // Note: La BDD perso n'a pas de colonnes de totaux dans meals
  };
}

/**
 * Construit les items pour la base Lovable (colonnes individuelles)
 */
function buildLovableItems(items: MealItemWithMicros[], mealId: string, userId: string) {
  return items.map(item => ({
    meal_id: mealId,
    user_id: userId,
    name: item.food_name,
    quantity: item.unit_count ? `${item.unit_count} ${item.unit_label || 'unité'}` : `${item.estimated_weight_g || 100}g`,
    calories: item.calories,
    proteins: item.proteins,
    carbs: item.carbs,
    fats: item.fats,
    // Micronutriments
    fiber: item.fiber,
    sugar: item.sugar,
    sodium_mg: item.sodium_mg,
    potassium_mg: item.potassium_mg,
    magnesium_mg: item.magnesium_mg,
    calcium_mg: item.calcium_mg,
    iron_mg: item.iron_mg,
    zinc_mg: item.zinc_mg,
    vitamin_c_mg: item.vitamin_c_mg,
    vitamin_d_mcg: item.vitamin_d_mcg,
    vitamin_b9_mcg: item.vitamin_b9_mcg,
    vitamin_b12_mcg: item.vitamin_b12_mcg,
    vitamin_e_mg: item.vitamin_e_mg,
    omega3_mg: item.omega3_mg,
    saturated_fat: item.saturated_fat
  }));
}

/**
 * Construit les items pour la base perso (avec nutrients_std en JSONB)
 */
function buildPersonalItems(items: MealItemWithMicros[], mealId: string) {
  return items.map(item => {
    // Regrouper les micronutriments dans nutrients_std
    const nutrientsStd: Record<string, number> = {};
    
    // Ajouter tous les micronutriments définis
    if (item.fiber !== undefined) nutrientsStd.fiber = item.fiber;
    if (item.sugar !== undefined) nutrientsStd.sugar = item.sugar;
    if (item.sodium_mg !== undefined) nutrientsStd.sodium_mg = item.sodium_mg;
    if (item.potassium_mg !== undefined) nutrientsStd.potassium_mg = item.potassium_mg;
    if (item.magnesium_mg !== undefined) nutrientsStd.magnesium_mg = item.magnesium_mg;
    if (item.calcium_mg !== undefined) nutrientsStd.calcium_mg = item.calcium_mg;
    if (item.iron_mg !== undefined) nutrientsStd.iron_mg = item.iron_mg;
    if (item.zinc_mg !== undefined) nutrientsStd.zinc_mg = item.zinc_mg;
    if (item.vitamin_c_mg !== undefined) nutrientsStd.vitamin_c_mg = item.vitamin_c_mg;
    if (item.vitamin_d_mcg !== undefined) nutrientsStd.vitamin_d_mcg = item.vitamin_d_mcg;
    if (item.vitamin_b9_mcg !== undefined) nutrientsStd.vitamin_b9_mcg = item.vitamin_b9_mcg;
    if (item.vitamin_b12_mcg !== undefined) nutrientsStd.vitamin_b12_mcg = item.vitamin_b12_mcg;
    if (item.vitamin_e_mg !== undefined) nutrientsStd.vitamin_e_mg = item.vitamin_e_mg;
    if (item.omega3_mg !== undefined) nutrientsStd.omega3_mg = item.omega3_mg;
    if (item.saturated_fat !== undefined) nutrientsStd.saturated_fat = item.saturated_fat;

    return {
      meal_id: mealId,
      name: item.food_name,
      quantity: item.estimated_weight_g || 100,
      calories: item.calories,
      proteins: item.proteins,
      carbs: item.carbs,
      fats: item.fats,
      nutrients_std: nutrientsStd
    };
  });
}

/**
 * Sauvegarde un repas et ses composants sur deux instances Supabase en parallèle.
 * Adapte automatiquement le format aux schémas différents :
 * - Lovable : colonnes individuelles pour chaque nutriment
 * - Perso : JSONB nutrients_std pour les micronutriments
 */
export const saveMealWithDualWrite = async ({ userId, mealData, items }: SaveMealParams) => {
  // --- 1. ÉCRITURE SUR LA BASE PRIMAIRE (LOVABLE) ---
  const lovableMeal = buildLovableMeal(mealData, userId);
  
  const { data: primaryMeal, error: primaryError } = await supabase
    .from("meals")
    .insert([lovableMeal])
    .select()
    .single();

  if (primaryError) {
    console.error("Erreur critique sur la base primaire (Lovable) :", primaryError.message);
    throw primaryError;
  }

  // Insertion des items sur la base primaire
  if (items && items.length > 0) {
    const lovableItems = buildLovableItems(items, primaryMeal.id, userId);
    const { error: itemsError } = await supabase.from("meal_items").insert(lovableItems);
    if (itemsError) {
      console.error("Erreur items base Lovable :", itemsError.message);
      console.error("Items tentés :", JSON.stringify(lovableItems[0], null, 2));
    }
  }

  // --- 2. ÉCRITURE SUR LA BASE SECONDAIRE (PERSONNELLE) ---
  if (personalSupabase) {
    try {
      const personalMeal = buildPersonalMeal(mealData, userId);
      
      const { data: secondaryMeal, error: secondaryError } = await personalSupabase
        .from("meals")
        .insert([personalMeal])
        .select()
        .single();

      if (secondaryError) {
        console.warn("Échec insertion meal sur DB Perso :", secondaryError.message);
      } else if (secondaryMeal && items.length > 0) {
        const personalItems = buildPersonalItems(items, secondaryMeal.id);
        const { error: itemsError } = await personalSupabase.from("meal_items").insert(personalItems);
        
        if (itemsError) {
          console.warn("Échec insertion items sur DB Perso :", itemsError.message);
          console.warn("Items tentés :", JSON.stringify(personalItems[0], null, 2));
        } else {
          console.log("Synchronisation DB Perso effectuée avec succès.");
        }
      }
    } catch (err) {
      console.warn("Erreur silencieuse lors de la double écriture :", err);
    }
  }

  return primaryMeal;
};
