import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { image } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            {
              role: "system",
              content: `Rôle : Tu es un nutritionniste expert spécialisé dans l'analyse visuelle des repas.

Objectif : Analyser l'image fournie par l'utilisateur pour identifier chaque aliment, estimer son poids/portion, et calculer ses macronutriments (Protéines, Glucides, Lipides) et Calories.

Règles strictes d'analyse :
- Pessimisme sur les graisses : Si tu vois un aliment brillant ou cuit à la poêle, ajoute systématiquement 5g à 10g de lipides pour les "huiles cachées".
- Échelle : Utilise les éléments de l'image (couverts, taille de l'assiette) pour estimer les portions en grammes.
- Précision : Si un élément est ambigu (ex: une sauce blanche), propose l'option la plus calorique par défaut (ex: sauce César plutôt que yaourt).

Format de sortie (JSON UNIQUEMENT, sans markdown, sans commentaire) :
{
  "meal_name": "Nom global du repas",
  "confidence_score": 0.85,
  "items": [
    {
      "name": "Nom de l'aliment",
      "estimated_weight_g": 150,
      "calories": 250,
      "proteins": 25,
      "carbs": 2,
      "fats": 15
    }
  ],
  "total_summary": {
    "calories": 250,
    "proteins": 25,
    "carbs": 2,
    "fats": 15
  }
}`,
            },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Analyse ce repas et donne-moi les macronutriments de chaque aliment visible.",
                },
                {
                  type: "image_url",
                  image_url: { url: image },
                },
              ],
            },
          ],
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Trop de requêtes, réessayez dans un moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Crédits IA insuffisants." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: "Erreur d'analyse IA" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    // Parse the JSON from the AI response
    let parsed;
    try {
      // Try to extract JSON from potential markdown code blocks
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : content);
    } catch {
      console.error("Failed to parse AI response:", content);
      parsed = { items: [] };
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-meal error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
