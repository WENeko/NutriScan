import { supabase } from "@/integrations/supabase/client";
import { createClient } from "@supabase/supabase-js";

// Initialisation du client personnel (Base secondaire)
// Ces variables doivent être ajoutées à ton fichier .env
const personalUrl = import.meta.env.VITE_PERSONAL_SUPABASE_URL;
const personalKey = import.meta.env.VITE_PERSONAL_SUPABASE_ANON_KEY;

// Création d'une instance conditionnelle pour ne pas bloquer l'app si les clés manquent
const personalSupabase = (personalUrl && personalKey) 
  ? createClient(personalUrl, personalKey) 
  : null;

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
  };
  items: any[];
}

/**
 * Sauvegarde un repas et ses composants sur deux instances Supabase en parallèle.
 * La réussite sur l'instance Lovable (primaire) est bloquante.
 * La réussite sur l'instance Personnelle (secondaire) est facultative (silencieuse).
 */
export const saveMealWithDualWrite = async ({ userId, mealData, items }: SaveMealParams) => {
  const timestamp = mealData.timestamp || new Date().toISOString();

  // --- 1. ÉCRITURE SUR LA BASE PRIMAIRE (LOVABLE) ---
  const { data: primaryMeal, error: primaryError } = await supabase
    .from("meals")
    .insert([{ ...mealData, user_id: userId, timestamp }])
    .select()
    .single();

  if (primaryError) {
    console.error("Erreur critique sur la base primaire :", primaryError.message);
    throw primaryError; // On stoppe tout si la base principale échoue
  }

  // Insertion des items sur la base primaire
  if (items && items.length > 0) {
    const itemsToInsert = items.map(item => ({
      ...item,
      meal_id: primaryMeal.id,
      user_id: userId
    }));
    const { error: itemsError } = await supabase.from("meal_items").insert(itemsToInsert);
    if (itemsError) console.error("Erreur items base primaire :", itemsError.message);
  }

  // --- 2. ÉCRITURE SUR LA BASE SECONDAIRE (PERSONNELLE) ---
  if (personalSupabase) {
    try {
      // On insère le repas sur la base perso
      const { data: secondaryMeal, error: secondaryError } = await personalSupabase
        .from("meals")
        .insert([{ ...mealData, user_id: userId, timestamp }])
        .select()
        .single();

      if (!secondaryError && secondaryMeal && items.length > 0) {
        // On insère les items liés au NOUVEL ID du repas de la base perso
        const secondaryItems = items.map(item => ({
          ...item,
          meal_id: secondaryMeal.id,
          user_id: userId
        }));
        await personalSupabase.from("meal_items").insert(secondaryItems);
      }
      
      if (secondaryError) {
        console.warn("Échec de synchronisation secondaire (DB Perso) :", secondaryError.message);
      } else {
        console.log("Synchronisation DB Perso effectuée avec succès.");
      }
      
    } catch (err) {
      // On capture l'erreur pour ne pas faire crash l'UI si la base perso est offline
      console.warn("Erreur silencieuse lors de la double écriture :", err);
    }
  } else {
    console.warn("Configuration manquante : VITE_PERSONAL_SUPABASE_URL / KEY");
  }

  return primaryMeal;
};
