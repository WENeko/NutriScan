import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `Tu es un coach nutritionniste expert. À partir du profil utilisateur (anthropométrie, activité, morphotype, objectifs corporels) et de son prompt en langage naturel, calcule des objectifs quotidiens cohérents et personnalisés.

LISTE STANDARD des micronutriments DÉJÀ suivis (n'en propose PAS de nouveaux pour ceux-ci, mais tu peux suggérer un objectif personnalisé) :
fiber, sugar, saturated_fat, omega3_mg, sodium_mg, potassium_mg, magnesium_mg, calcium_mg, iron_mg, zinc_mg, vitamin_c_mg, vitamin_d_mcg, vitamin_b9_mcg, vitamin_b12_mcg, vitamin_e_mg.

Tu peux suggérer des micronutriments CUSTOM à ajouter (créatine, taurine, choline, oméga-6, etc.) selon l'objectif exprimé.

Réponds UNIQUEMENT en JSON strict, sans markdown :
{
  "calories": 2400,
  "proteins": 180,
  "carbs": 260,
  "fats": 75,
  "suggested_custom_nutrients": [
    { "key": "creatine_g", "label": "Créatine", "unit": "g", "category": "macro", "goal": 5 }
  ],
  "rationale": "Phrase courte expliquant la logique des objectifs (1-2 phrases max)."
}

Règles :
- Catégories autorisées : "macro", "mineral", "vitamin", "lipid".
- Unités : g, mg, µg, kcal, IU, ml.
- Clés en snake_case ASCII, suffixées par l'unité (ex: choline_mg, creatine_g).
- Ne renvoie JAMAIS de clé déjà dans la liste standard ci-dessus.
- Macros cohérentes avec calories : (P*4) + (G*4) + (L*9) ≈ calories ± 5%.
- Protéines : 1.4-2.4 g/kg selon objectif.
- Lipides : ≥ 0.8 g/kg.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { profile, prompt } = await req.json();

    if (!prompt || typeof prompt !== "string") {
      return new Response(JSON.stringify({ error: "Prompt requis" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const profileSummary = `PROFIL:
- Genre: ${profile?.gender ?? "n/a"}
- Âge: ${profile?.age ?? "n/a"} ans
- Poids: ${profile?.weight_kg ?? "n/a"} kg
- Taille: ${profile?.height_cm ?? "n/a"} cm
- Masse grasse: ${profile?.body_fat_percent ?? "n/a"} %
- Masse musculaire: ${profile?.muscle_mass_kg ?? "n/a"} kg
- Activité: ${profile?.activity_level ?? "n/a"}
- Morphotype: ${profile?.morphotype ?? "n/a"}
- MB estimé: ${profile?.bmr ?? "n/a"} kcal
- Calories sport/j: ${profile?.sport_calories_daily ?? 0}
- Poids cible: ${profile?.target_weight_kg ?? "n/a"} kg
- Gras cible: ${profile?.target_body_fat_percent ?? "n/a"} %
- Muscle cible: ${profile?.target_muscle_mass_kg ?? "n/a"} kg
- Nutriments custom déjà suivis: ${
      Array.isArray(profile?.custom_nutrients) && profile.custom_nutrients.length > 0
        ? profile.custom_nutrients.map((c: any) => `${c.key}(${c.unit})`).join(", ")
        : "aucun"
    }

OBJECTIF UTILISATEUR (texte libre):
"${prompt}"`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: profileSummary },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Trop de requêtes, réessayez dans un moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Crédits IA insuffisants." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ error: "Erreur d'analyse IA" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    let parsed;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : content);
    } catch {
      console.error("Failed to parse AI response:", content);
      return new Response(JSON.stringify({ error: "Réponse IA invalide" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("coach-goals error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
