/**
 * Service de synchronisation automatique entre BDD Lovable et Personnelle
 * Gère la création automatique des profils et tables manquants
 */

import { supabase as supabaseLovable } from "@/integrations/supabase/client";
import { createClient } from "@supabase/supabase-js";

const personalUrl = import.meta.env.VITE_PERSONAL_SUPABASE_URL;
const personalKey = import.meta.env.VITE_PERSONAL_SUPABASE_ANON_KEY;

const personalSupabase = (personalUrl && personalKey)
  ? createClient(personalUrl, personalKey)
  : null;

/**
 * Vérifie si l'utilisateur existe dans la BDD perso, sinon tente de le créer
 */
export async function ensureUserInPersonalDB(userId: string, email?: string): Promise<boolean> {
  if (!personalSupabase) {
    console.log("[DB Sync] Pas de BDD perso configurée");
    return false;
  }

  try {
    // 1. Vérifier si l'utilisateur existe déjà dans profiles
    const { data: existingProfile, error: checkError } = await personalSupabase
      .from("profiles")
      .select("user_id")
      .eq("user_id", userId)
      .single();

    if (checkError && checkError.code !== "PGRST116") {
      // PGRST116 = pas de résultat, ce qu'on veut
      console.error("[DB Sync] Erreur vérification profil:", checkError);
    }

    if (existingProfile) {
      console.log("[DB Sync] Profil déjà existant dans BDD perso");
      return true;
    }

    // 2. Récupérer les infos de l'utilisateur depuis Lovable
    const { data: lovableProfile, error: fetchError } = await supabaseLovable
      .from("profiles")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (fetchError) {
      console.warn("[DB Sync] Impossible de récupérer profil Lovable:", fetchError.message);
    }

    // 3. Créer le profil dans la BDD perso (même sans FK dans auth.users)
    const profileData = lovableProfile || {
      user_id: userId,
      email: email || null,
      goals: { calories: 2000, proteins: 150, carbs: 250, fats: 70 }
    };

    const { error: insertError } = await personalSupabase
      .from("profiles")
      .insert({
        user_id: profileData.user_id,
        email: profileData.email,
        goals: profileData.goals,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

    if (insertError) {
      // Si erreur de duplicate key, c'est que l'utilisateur existe déjà
      if (insertError.message?.includes("duplicate key")) {
        console.log("[DB Sync] Profil existe déjà (race condition)");
        return true;
      }
      
      // Si erreur FK sur user_id, c'est que la contrainte FK existe toujours
      if (insertError.message?.includes("foreign key") || insertError.code === "23503") {
        console.warn("[DB Sync] Contrainte FK active - impossible de créer le profil automatiquement");
        console.warn("[DB Sync] Exécutez le script SQL FIX_DATABASE_PERSO.sql dans Supabase");
        return false;
      }

      console.error("[DB Sync] Erreur création profil:", insertError);
      return false;
    }

    console.log("[DB Sync] Profil créé avec succès dans BDD perso");
    return true;

  } catch (err) {
    console.error("[DB Sync] Erreur ensureUserInPersonalDB:", err);
    return false;
  }
}

/**
 * Vérifie si les tables nécessaires existent dans la BDD perso
 * Retourne un rapport des problèmes trouvés
 */
export async function checkPersonalDatabaseHealth(): Promise<{
  ok: boolean;
  missingTables: string[];
  missingColumns: Record<string, string[]>;
  canWrite: boolean;
}> {
  if (!personalSupabase) {
    return {
      ok: false,
      missingTables: ["N/A - Pas de connexion BDD perso"],
      missingColumns: {},
      canWrite: false
    };
  }

  const result = {
    ok: true,
    missingTables: [] as string[],
    missingColumns: {} as Record<string, string[]>,
    canWrite: false
  };

  try {
    // Tester une écriture simple
    const { error: testError } = await personalSupabase
      .from("meals")
      .insert({
        user_id: "00000000-0000-0000-0000-000000000000", // UUID test
        meal_name: "TEST_CONNECTION"
      })
      .select();

    if (testError) {
      if (testError.message?.includes("foreign key")) {
        result.canWrite = false;
        result.ok = false;
      } else if (testError.message?.includes("does not exist")) {
        result.missingTables.push("meals");
        result.ok = false;
      }
    } else {
      result.canWrite = true;
      // Supprimer le test
      await personalSupabase
        .from("meals")
        .delete()
        .eq("meal_name", "TEST_CONNECTION");
    }

  } catch (err) {
    console.error("[DB Sync] Erreur health check:", err);
    result.ok = false;
  }

  return result;
}

/**
 * Affiche un rapport de santé de la BDD perso dans la console
 */
export async function logDatabaseHealth() {
  const health = await checkPersonalDatabaseHealth();
  
  console.group("🔍 [DB Sync] Rapport Santé BDD Personnelle");
  
  if (health.ok) {
    console.log("✅ Tout est configuré correctement");
  } else {
    console.log("❌ Problèmes détectés:");
    
    if (health.missingTables.length > 0) {
      console.log("   Tables manquantes:", health.missingTables);
    }
    
    if (Object.keys(health.missingColumns).length > 0) {
      console.log("   Colonnes manquantes:", health.missingColumns);
    }
    
    if (!health.canWrite) {
      console.log("   ⚠️  Impossible d'écrire - Contrainte FK active");
      console.log("   💡 Solution: Exécutez FIX_DATABASE_PERSO.sql dans Supabase SQL Editor");
    }
  }
  
  console.groupEnd();
  
  return health;
}
