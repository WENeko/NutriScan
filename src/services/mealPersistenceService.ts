/**
 * Service de persistance des repas avec adaptation automatique des structures de BDD
 * Gère à la fois les colonnes individuelles et les colonnes JSONB (nutrients_std/nutrients_custom)
 */

import { supabase } from "@/integrations/supabase/client";
import { createClient } from "@supabase/supabase-js";
import type { MicroNutrientFields } from "@/utils/nutrition-logic";
import { appLogger } from "./appLogger";

// Initialisation du client personnel (Base secondaire)
const personalUrl = import.meta.env.VITE_PERSONAL_SUPABASE_URL;
const personalKey = import.meta.env.VITE_PERSONAL_SUPABASE_ANON_KEY;

const personalSupabase = (personalUrl && personalKey) 
  ? createClient(personalUrl, personalKey, {
      auth: {
        storage: localStorage,
        persistSession: true,
        autoRefreshToken: true,
      }
    }) 
  : null;

/**
 * Crée automatiquement l'utilisateur dans la BDD perso via edge function
 * Appelé quand un utilisateur se connecte pour la première fois
 */
async function ensureUserInPersonalDb(userId: string, email: string, name?: string): Promise<boolean> {
  if (!personalSupabase) {
    appLogger.debug("MealSave", "Pas de BDD perso configurée - skip création user");
    return false;
  }

  const personalUrl = import.meta.env.VITE_PERSONAL_SUPABASE_URL;
  const functionUrl = `${personalUrl}/functions/v1/create-user-in-personal-db`;

  try {
    appLogger.info("MealSave", "Création utilisateur dans BDD perso...", { userId, email });

    // Récupérer la session actuelle pour le token
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      appLogger.error("MealSave", "Pas de session pour appeler l'edge function");
      return false;
    }

    const response = await fetch(functionUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: userId,
        email,
        name: name || email.split("@")[0],
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      // Si l'utilisateur existe déjà, c'est OK
      if (result.message?.includes("already exists")) {
        appLogger.info("MealSave", "Utilisateur existe déjà dans BDD perso");
        return true;
      }
      appLogger.error("MealSave", "Erreur création user dans BDD perso", result);
      return false;
    }

    appLogger.info("MealSave", "Utilisateur créé avec succès dans BDD perso", result);
    return true;

  } catch (error) {
    appLogger.error("MealSave", "Exception création user dans BDD perso", error);
    return false;
  }
}

/**
 * Synchronise la session d'authentification de Supabase Lovable vers la BDD perso
 * Nécessaire pour que RLS fonctionne (auth.uid() doit être défini)
 */
async function syncAuthSessionToPersonalDb(): Promise<boolean> {
  if (!personalSupabase) {
    appLogger.debug("MealSave", "Pas de BDD perso configurée");
    return false;
  }
  
  try {
    // Récupérer la session actuelle de Lovable
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError) {
      appLogger.error("MealSave", "Erreur récupération session Lovable", sessionError);
      return false;
    }
    
    if (!session) {
      appLogger.warn("MealSave", "Pas de session active sur Lovable");
      return false;
    }
    
    appLogger.debug("MealSave", "Session Lovable trouvée", { 
      userId: session.user.id,
      expiresAt: session.expires_at 
    });
    
    // Vérifier si personalSupabase a déjà la même session
    const { data: { session: personalSession } } = await personalSupabase.auth.getSession();
    
    if (personalSession?.access_token === session.access_token) {
      appLogger.debug("MealSave", "Session déjà synchronisée");
      return true;
    }
    
    // Définir la session sur personalSupabase
    const { error: setSessionError } = await personalSupabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });
    
    if (setSessionError) {
      appLogger.error("MealSave", "Erreur définition session perso", setSessionError);
      return false;
    }
    
    appLogger.info("MealSave", "Session synchronisée vers BDD perso");
    return true;
    
  } catch (error) {
    appLogger.error("MealSave", "Exception synchronisation session", error);
    return false;
  }
}

// Cache de détection des colonnes
let personalDbSchema: { 
  hasIndividualColumns: boolean; 
  hasJsonbColumns: boolean;
} | null = null;

/**
 * Détecte la structure de la BDD perso (colonnes individuelles vs JSONB)
 * Conforme aux schémas fournis - meals n'a que les macros totales
 */
async function detectPersonalDbSchema(): Promise<{ 
  hasIndividualColumns: boolean; 
  hasJsonbColumns: boolean;
}> {
  if (!personalSupabase) return { hasIndividualColumns: false, hasJsonbColumns: false };
  if (personalDbSchema) return personalDbSchema;

  try {
    // Tester si meal_items a les colonnes micro individuelles (calcium_mg, etc.)
    const { error: microError } = await personalSupabase
      .from("meal_items")
      .select("calcium_mg")
      .limit(1);
    
    const hasIndividualColumns = !microError?.message?.includes("calcium_mg");

    // Tester si nutrients_std existe (structure JSONB)
    const { error: jsonbError } = await personalSupabase
      .from("meal_items")
      .select("nutrients_std")
      .limit(1);
    
    const hasJsonbColumns = !jsonbError?.message?.includes("nutrients_std");

    personalDbSchema = { hasIndividualColumns, hasJsonbColumns };
    
    appLogger.debug("DB Schema", "Schéma détecté", personalDbSchema);
    
    return personalDbSchema;
  } catch (err) {
    appLogger.error("DB Schema", "Erreur détection schéma", err);
    // Fallback : assume structure minimale (pas de colonnes micro dans items)
    return { hasIndividualColumns: false, hasJsonbColumns: false };
  }
}

// Type pour un item alimentaire
interface MealItem {
  food_name: string;
  name?: string;
  calories: number;
  proteins: number;
  carbs: number;
  fats: number;
  quantity?: number;
  estimated_weight_g?: number;
  unit_count?: number;
  unit_label?: string;
  unit_weight_g?: number;
}

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
    raw_ai_analysis?: string | null;
    is_confirmed?: boolean;
    source?: string;
  };
  items: MealItemWithMicros[];
}

// ============================================================
// FONCTIONS DE CONSTRUCTION - LOVABLE (Structure complète)
// ============================================================

function buildLovableMeal(mealData: SaveMealParams["mealData"], userId: string) {
  return {
    user_id: userId,
    meal_name: mealData.meal_name,
    total_calories: mealData.total_calories,
    total_proteins: mealData.total_proteins,
    total_carbs: mealData.total_carbs,
    total_fats: mealData.total_fats,
    timestamp: mealData.timestamp ?? new Date().toISOString(),
    image_url: mealData.image_url ?? null,
    raw_ai_analysis: mealData.raw_ai_analysis ?? null,
    is_confirmed: mealData.is_confirmed ?? true,
    source: mealData.source ?? "ai"
  };
}

function buildLovableItems(items: MealItemWithMicros[], mealId: string) {
  return items.map(item => ({
    meal_id: mealId,
    name: item.food_name || item.name || "Aliment",
    // Macros
    calories: item.calories,
    proteins: item.proteins,
    carbs: item.carbs,
    fats: item.fats,
    fiber: item.fiber ?? 0,
    sugar: item.sugar ?? 0,
    saturated_fat: item.saturated_fat ?? 0,
    // Micros (conforme au schéma meal_items complet)
    sodium_mg: item.sodium_mg ?? 0,
    potassium_mg: item.potassium_mg ?? 0,
    magnesium_mg: item.magnesium_mg ?? 0,
    calcium_mg: item.calcium_mg ?? 0,
    iron_mg: item.iron_mg ?? 0,
    zinc_mg: item.zinc_mg ?? 0,
    omega3_mg: item.omega3_mg ?? 0,
    vitamin_b_mg: item.vitamin_b_mg ?? 0,
    vitamin_b9_mcg: item.vitamin_b9_mcg ?? 0,
    vitamin_b12_mcg: item.vitamin_b12_mcg ?? 0,
    vitamin_c_mg: item.vitamin_c_mg ?? 0,
    vitamin_d_mcg: item.vitamin_d_mcg ?? 0,
    vitamin_e_mg: item.vitamin_e_mg ?? 0,
    // Unités
    quantity: item.quantity || (item.unit_count && item.unit_weight_g ? item.unit_count * item.unit_weight_g : 100),
    unit_count: item.unit_count ?? null,
    unit_label: item.unit_label ?? null,
    unit_weight_g: item.unit_weight_g ?? null
  }));
}

// ============================================================
// FONCTIONS DE CONSTRUCTION - PERSONNEL (Adaptatif)
// ============================================================

function buildPersonalMeal(
  mealData: SaveMealParams["mealData"], 
  userId: string, 
  schema: { hasIndividualColumns: boolean; hasJsonbColumns: boolean }
) {
  // Structure conforme au schéma exact de la table meals
  return {
    user_id: userId,
    meal_name: mealData.meal_name,
    timestamp: mealData.timestamp ?? new Date().toISOString(),
    image_url: mealData.image_url ?? null,
    total_calories: mealData.total_calories,
    total_proteins: mealData.total_proteins,
    total_carbs: mealData.total_carbs,
    total_fats: mealData.total_fats,
    raw_ai_analysis: mealData.raw_ai_analysis ?? null,
    is_confirmed: mealData.is_confirmed ?? true,
    source: mealData.source ?? "ai"
  };
}

function buildPersonalItems(
  items: MealItemWithMicros[], 
  mealId: string,
  schema: { hasIndividualColumns: boolean; hasJsonbColumns: boolean }
) {
  return items.map(item => {
    const base = {
      meal_id: mealId,
      name: item.food_name || item.name || "Aliment",
      quantity: item.quantity ?? 1,
      calories: item.calories,
      proteins: item.proteins,
      carbs: item.carbs,
      fats: item.fats
    };

    // Construction du payload JSONB pour nutrients_std (conforme au schéma meal_items complet)
    const nutrientsStd = {
      fiber: item.fiber ?? 0,
      sugar: item.sugar ?? 0,
      saturated_fat: item.saturated_fat ?? 0,
      sodium_mg: item.sodium_mg ?? 0,
      potassium_mg: item.potassium_mg ?? 0,
      magnesium_mg: item.magnesium_mg ?? 0,
      calcium_mg: item.calcium_mg ?? 0,
      iron_mg: item.iron_mg ?? 0,
      zinc_mg: item.zinc_mg ?? 0,
      omega3_mg: item.omega3_mg ?? 0,
      vitamin_b_mg: item.vitamin_b_mg ?? 0,
      vitamin_b9_mcg: item.vitamin_b9_mcg ?? 0,
      vitamin_b12_mcg: item.vitamin_b12_mcg ?? 0,
      vitamin_c_mg: item.vitamin_c_mg ?? 0,
      vitamin_d_mcg: item.vitamin_d_mcg ?? 0,
      vitamin_e_mg: item.vitamin_e_mg ?? 0
    };

    // Construction conforme au schéma meal_items
    const fullItem = {
      ...base,
      // Macros
      fiber: item.fiber ?? 0,
      sugar: item.sugar ?? 0,
      saturated_fat: item.saturated_fat ?? 0,
      // Micros (conforme au schéma complet)
      sodium_mg: item.sodium_mg ?? 0,
      potassium_mg: item.potassium_mg ?? 0,
      magnesium_mg: item.magnesium_mg ?? 0,
      calcium_mg: item.calcium_mg ?? 0,
      iron_mg: item.iron_mg ?? 0,
      zinc_mg: item.zinc_mg ?? 0,
      omega3_mg: item.omega3_mg ?? 0,
      vitamin_b_mg: item.vitamin_b_mg ?? 0,
      vitamin_b9_mcg: item.vitamin_b9_mcg ?? 0,
      vitamin_b12_mcg: item.vitamin_b12_mcg ?? 0,
      vitamin_c_mg: item.vitamin_c_mg ?? 0,
      vitamin_d_mcg: item.vitamin_d_mcg ?? 0,
      vitamin_e_mg: item.vitamin_e_mg ?? 0,
      // Unités
      quantity: item.quantity || (item.unit_count && item.unit_weight_g ? item.unit_count * item.unit_weight_g : 100),
      unit_count: item.unit_count ?? null,
      unit_label: item.unit_label ?? null,
      unit_weight_g: item.unit_weight_g ?? null
    };

    if (schema.hasJsonbColumns) {
      // Ajouter JSONB si la colonne existe
      return {
        ...fullItem,
        nutrients_std: nutrientsStd,
        nutrients_custom: {}
      };
    } else {
      // Structure simple sans JSONB
      return fullItem;
    }
  });
}

// ============================================================
// FONCTION PRINCIPALE
// ============================================================

export const saveMealWithDualWrite = async ({ userId, mealData, items }: SaveMealParams) => {
  const personalUrlConfigured = !!import.meta.env.VITE_PERSONAL_SUPABASE_URL;
  const personalKeyConfigured = !!import.meta.env.VITE_PERSONAL_SUPABASE_ANON_KEY;
  
  appLogger.info("MealSave", "Démarrage sauvegarde repas", { 
    userId, 
    mealName: mealData.meal_name,
    itemsCount: items?.length || 0,
    hasPersonalDb: !!personalSupabase,
    personalUrlConfigured,
    personalKeyConfigured
  });
  
  if (!personalSupabase) {
    appLogger.warn("MealSave", "BDD perso non configurée", { 
      VITE_PERSONAL_SUPABASE_URL: personalUrlConfigured,
      VITE_PERSONAL_SUPABASE_ANON_KEY: personalKeyConfigured 
    });
  }
  
  // Détecter la structure de la BDD perso
  const schema = await detectPersonalDbSchema();
  appLogger.debug("MealSave", "Schéma détecté", schema);
  
  // --- 1. ÉCRITURE SUR LA BASE PRIMAIRE (LOVABLE) ---
  const lovableMeal = buildLovableMeal(mealData, userId);
  appLogger.debug("MealSave", "Données Lovable", lovableMeal);
  
  const { data: primaryMeal, error: primaryError } = await supabase
    .from("meals")
    .insert([lovableMeal])
    .select()
    .single();

  if (primaryError) {
    appLogger.error("MealSave", "Erreur insertion Lovable meals", primaryError);
    throw primaryError;
  }

  // Insertion des items sur Lovable
  if (items && items.length > 0) {
    const lovableItems = buildLovableItems(items, primaryMeal.id);
    appLogger.debug("MealSave", `Insertion ${lovableItems.length} items Lovable`, { premierItem: lovableItems[0] });
    const { data: insertedItems, error: itemsError } = await supabase.from("meal_items").insert(lovableItems).select();
    if (itemsError) {
      appLogger.error("MealSave", "Erreur insertion items Lovable", itemsError);
      throw new Error(`Erreur insertion meal_items: ${itemsError.message}`);
    } else {
      appLogger.info("MealSave", `${insertedItems?.length || 0} items Lovable insérés`);
    }
  }

  // --- 2. ÉCRITURE SUR LA BASE SECONDAIRE (PERSONNELLE) ---
  let secondaryMeal: any = null;
  let itemsError: any = null;
  
  if (personalSupabase) {
    try {
      appLogger.info("MealSave", "Sauvegarde via RPC (contourne RLS)");
      
      // Préparer les items au format JSONB pour la fonction RPC
      const itemsJsonb = items.map(item => ({
        name: item.food_name || item.name,
        quantity: item.quantity || 1,
        unit_count: item.unit_count || 1,
        unit_label: item.unit_label || 'unit',
        unit_weight_g: item.unit_weight_g || 0,
        calories: item.calories || 0,
        protein: item.protein || 0,
        carbs: item.carbs || 0,
        fat: item.fat || 0,
        vitamin_a: item.vitamin_a || 0,
        vitamin_c: item.vitamin_c || 0,
        vitamin_d: item.vitamin_d || 0,
        calcium: item.calcium || 0,
        iron: item.iron || 0,
        magnesium: item.magnesium || 0,
        omega_3: item.omega_3 || 0,
      }));
      
      // Appeler la fonction RPC qui contourne RLS avec SECURITY DEFINER
      const { data: rpcResult, error: rpcError } = await personalSupabase.rpc('save_meal_with_items', {
        p_user_id: userId,
        p_name: mealData.meal_name,
        p_meal_type: (mealData as any).meal_type || 'snack',
        p_eaten_at: (mealData as any).eaten_at || mealData.timestamp || new Date().toISOString(),
        p_total_calories: mealData.total_calories || null,
        p_total_protein: mealData.total_proteins || null,
        p_total_carbs: mealData.total_carbs || null,
        p_total_fat: mealData.total_fats || null,
        p_image_url: mealData.image_url || null,
        p_items: itemsJsonb
      });
      
      appLogger.debug("MealSave", "Résultat RPC", { rpcResult, rpcError });
      
      let secondaryError = rpcError;
      let insertedMeal = null;
      
      if (!rpcError && rpcResult?.success) {
        insertedMeal = { id: rpcResult.meal_id };
        secondaryMeal = insertedMeal;
        appLogger.info("MealSave", `Repas perso sauvegardé via RPC: ${rpcResult.meal_id}`);
      } else if (!rpcError && !rpcResult?.success) {
        // Erreur retournée par la fonction
        secondaryError = new Error(rpcResult?.error || 'Erreur inconnue dans la fonction RPC');
      }

      if (secondaryError) {
        appLogger.error("MealSave", `Échec RPC meal perso: ${secondaryError.message}`, { 
          code: secondaryError.code,
          details: secondaryError.details,
          rpcResult
        });
      } else if (rpcResult?.success) {
        appLogger.info("MealSave", `Repas perso sauvegardé via RPC: ${rpcResult.meal_id}, ${rpcResult.items_count} items`);
      }
    } catch (err) {
      appLogger.error("MealSave", "Erreur inattendue BDD perso", err);
    }
  }

  // Retourner les deux résultats pour permettre le diagnostic
  return { 
    lovable: primaryMeal, 
    personal: personalSupabase ? { 
      mealSaved: !!secondaryMeal, 
      itemsSaved: !itemsError 
    } : null 
  };
};

// Export pour réinitialiser le cache si nécessaire
export function resetSchemaCache() {
  personalDbSchema = null;
}
