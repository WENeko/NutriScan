/**
 * Upload de la photo d'un repas, tolérant aux coupures réseau.
 *
 * Contexte : sur mobile, le POST vers le storage échoue régulièrement avec
 * "Failed to fetch" (préflight OPTIONS OK, puis requête interrompue). Avant,
 * cette erreur faisait échouer TOUT l'enregistrement du repas : les données
 * nutritionnelles étaient perdues. On réessaie donc plusieurs fois, puis on
 * enregistre le repas sans photo plutôt que de tout perdre.
 */
import { supabase } from "@/integrations/supabase/client";
import { appLogger } from "@/services/appLogger";

export interface MealImageUploadResult {
  url: string | null;
  failed: boolean;
  error?: string;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function uploadMealImage(
  userId: string,
  file: File,
  attempts = 3,
): Promise<MealImageUploadResult> {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  let lastError = "";

  for (let i = 1; i <= attempts; i++) {
    const path = `${userId}/${Date.now()}.${ext}`;
    try {
      const { error } = await supabase.storage
        .from("meal-images")
        .upload(path, file, { contentType: file.type || "image/jpeg", upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from("meal-images").getPublicUrl(path);
      return { url: data.publicUrl, failed: false };
    } catch (e: any) {
      lastError = e?.message || String(e);
      appLogger.warn("MealImageUpload", `Tentative ${i}/${attempts} échouée`, lastError);
      if (i < attempts) await wait(800 * i);
    }
  }

  appLogger.error("MealImageUpload", "Upload photo abandonné, repas sauvegardé sans image", lastError);
  return { url: null, failed: true, error: lastError };
}
