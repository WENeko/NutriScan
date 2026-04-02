import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `Tu es un nutritionniste expert. Analyse l'entrée (image ou texte) et estime précisément le poids de chaque ingrédient. Si c'est une image, sois pessimiste sur les graisses cachées (+5-10g de lipides si l'aspect est brillant/frit). Utilise les éléments visuels (couverts, assiette) pour estimer les portions. Si un élément est ambigu, propose l'option la plus calorique par défaut.

IMPORTANT - Extraction temporelle :
Si le texte contient une indication de temps (ex: "hier à 22h", "ce matin", "lundi midi"), extrais-la et retourne-la dans le champ "suggested_timestamp" au format ISO 8601. Sinon, ne mets pas ce champ.

IMPORTANT - Détection des aliments comptables en unités :
Pour CHAQUE aliment, détermine s'il se consomme/gère naturellement en unités plutôt qu'en poids brut.

RÈGLE PRINCIPALE : Si l'utilisateur mentionne un nombre SANS unité de poids ou volume après (g, kg, ml, cl, L), c'est un indice TRÈS FORT que cet aliment se compte en unités. Exemples :
- "2 tranches de jambon" → unit_count=2, unit_label="tranche" (PAS de poids mentionné = unités)
- "3 oeufs" → unit_count=3, unit_label="oeuf" (PAS de poids mentionné = unités)
- "1 portion de Kiri" → unit_count=1, unit_label="portion" (PAS de poids mentionné = unités)
- "2 fromages triangle" → unit_count=2, unit_label="triangle" (PAS de poids mentionné = unités)
- "2 Babybel" → unit_count=2, unit_label="portion" (PAS de poids mentionné = unités)
- "4 biscuits" → unit_count=4, unit_label="biscuit" (PAS de poids mentionné = unités)
- "200g de riz" → poids brut (unité de poids mentionnée = PAS d'unités)
En résumé : nombre + nom d'aliment SANS g/kg/ml/cl/L = TOUJOURS utiliser unit_count/unit_label/unit_weight_g.

Autres cas où utiliser des unités même sans nombre explicite :
- Oeufs, tranches (jambon, pain de mie, fromage, bacon), portions (fromage type Kiri/Vache qui rit/Babybel/triangle), biscuits, tartines, crêpes, saucisses, nuggets, fruits entiers (pomme, banane, abricot), tomates cerises, olives, crevettes, boulettes, bonbons, etc.

Si l'aliment se compte en unités, remplis ces 3 champs :
- "unit_count": nombre d'unités (entier, ex: 3)
- "unit_weight_g": poids moyen d'UNE unité en grammes (entier, ex: 60)
- "unit_label": libellé court de l'unité (ex: "oeuf", "tranche", "portion")
Le champ "estimated_weight_g" doit être = unit_count * unit_weight_g.
Si l'aliment ne se compte PAS en unités (riz, pâtes, sauce, huile, etc.), ne mets PAS ces champs.

IMPORTANT - Micronutriments :
Pour chaque aliment, estime aussi les micronutriments suivants (valeurs pour le poids estimé, pas pour 100g) :
- fiber (g), sugar (g), saturated_fat (g), omega3_mg (mg)
- sodium_mg (mg), potassium_mg (mg), magnesium_mg (mg), calcium_mg (mg)
- vitamin_b_mg (mg), vitamin_c_mg (mg), vitamin_d_mcg (µg), vitamin_e_mg (mg)

Réponds UNIQUEMENT en JSON strict, sans markdown, sans commentaire :
{
  "meal_name": "string",
  "confidence_score": 0.85,
  "suggested_timestamp": "2025-01-15T22:00:00" (optionnel),
  "items": [
    {
      "name": "string",
      "estimated_weight_g": 150,
      "unit_count": 3 (optionnel),
      "unit_weight_g": 50 (optionnel),
      "unit_label": "portion" (optionnel),
      "calories": 250,
      "proteins": 25,
      "carbs": 2,
      "fats": 15,
      "fiber": 2,
      "sugar": 1,
      "saturated_fat": 3,
      "omega3_mg": 50,
      "sodium_mg": 200,
      "potassium_mg": 300,
      "magnesium_mg": 30,
      "calcium_mg": 50,
      "vitamin_b_mg": 0.4,
      "vitamin_c_mg": 40,
      "vitamin_d_mcg": 0,
      "vitamin_e_mg": 0.2
    }
  ],
  "total_summary": {
    "calories": 250,
    "proteins": 25,
    "carbs": 2,
    "fats": 15
  }
}`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { image, text, custom_foods, local_time } = body;

    if (!image && !text) {
      return new Response(
        JSON.stringify({ error: "Fournissez une image ou un texte." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Build custom foods context if available
    let customFoodsContext = "";
    if (custom_foods && Array.isArray(custom_foods) && custom_foods.length > 0) {
      customFoodsContext = "\n\nIMPORTANT - L'utilisateur a une bibliothèque personnelle d'aliments. UTILISE CES DONNÉES EN PRIORITÉ quand tu reconnais un de ces aliments :\n";
      custom_foods.forEach((f: any) => {
        customFoodsContext += `- ${f.name}: portion=${f.serving_size_g ?? 100}g, Cal=${f.calories_per_100g}kcal/100g, P=${f.proteins_per_100g}g/100g, G=${f.carbs_per_100g}g/100g, L=${f.fats_per_100g}g/100g, Fibres=${f.fiber_per_100g ?? 0}g/100g, Sucres=${f.sugar_per_100g ?? 0}g/100g, AGS=${f.saturated_fat_per_100g ?? 0}g/100g, Omega3=${f.omega3_mg_per_100g ?? 0}mg/100g, Sodium=${f.sodium_mg_per_100g ?? 0}mg/100g, Potassium=${f.potassium_mg_per_100g ?? 0}mg/100g, Magnesium=${f.magnesium_mg_per_100g ?? 0}mg/100g, Calcium=${f.calcium_mg_per_100g ?? 0}mg/100g, VitB=${f.vitamin_b_per_100g ?? 0}mg/100g, VitC=${f.vitamin_c_per_100g ?? 0}mg/100g, VitD=${f.vitamin_d_per_100g ?? 0}µg/100g, VitE=${f.vitamin_e_per_100g ?? 0}mg/100g\n`;
      });
    }

    const userContent: any[] = [];

    if (image) {
      userContent.push(
        { type: "text", text: `Analyse ce repas et donne-moi les macronutriments et micronutriments de chaque aliment visible.${customFoodsContext}` },
        { type: "image_url", image_url: { url: image } }
      );
    } else if (text) {
      const timeContext = local_time ? `\nL'heure locale actuelle de l'utilisateur est : ${local_time}. Utilise cette référence pour calculer "hier", "ce matin", etc.` : "";
      userContent.push({
        type: "text",
        text: `Analyse cette description de repas et donne-moi les macronutriments et micronutriments de chaque aliment mentionné : "${text}"${customFoodsContext}${timeContext}`,
      });
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT + customFoodsContext },
          { role: "user", content: userContent },
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
