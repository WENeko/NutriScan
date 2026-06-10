import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  buildSystemContent,
  buildCustomFoodsContext,
  buildUserPromptText,
} from "../_shared/mealAnalysisPrompt.ts";

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
    const body = await req.json();
    const { image, text, custom_foods, custom_nutrients, local_time } = body;

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

    // Custom nutrients (user-defined) à concaténer dans chaque item
    let customNutrientsContext = "";
    if (Array.isArray(custom_nutrients) && custom_nutrients.length > 0) {
      customNutrientsContext = "\n\nNUTRIMENTS CUSTOM à estimer pour chaque item (clé JSON exacte = unité) :\n" +
        custom_nutrients
          .filter((c: any) => c?.key && c?.unit)
          .map((c: any) => `- ${c.key} (${c.unit}) — ${c.label ?? c.key}`)
          .join("\n");
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
          { role: "system", content: SYSTEM_PROMPT + customFoodsContext + customNutrientsContext },
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
