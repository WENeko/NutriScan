import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `Tu es un expert en nutrition. On te donne un micronutriment (ou complément) personnalisé suivi par un utilisateur.
Rédige une description COURTE pour un tooltip, dans le même style que celles des micros standard :
- 1 phrase concise décrivant les bienfaits ou l'impact principal sur le corps/la santé.
- Si une quantité ou limite journalière de référence existe, mentionne-la brièvement (ex: "Visez ~5 g/jour" ou "Limitez à <2 g/jour").
- Pas de markdown, pas de guillemets, 200 caractères maximum.
Réponds UNIQUEMENT en JSON strict : { "description": "..." }`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { label, unit, goal, is_limit, category } = await req.json();

    if (!label || typeof label !== "string") {
      return new Response(JSON.stringify({ error: "label requis" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const userMsg = `Nutriment : ${label}
Unité : ${unit ?? "n/a"}
Catégorie : ${category ?? "n/a"}
Type d'objectif : ${is_limit ? "limite à ne pas dépasser" : "minimum à atteindre"}
Objectif quotidien fourni par l'utilisateur : ${goal != null && goal !== "" ? `${goal}${unit ?? ""}` : "non précisé (propose une valeur de référence usuelle si pertinent)"}`;

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
          { role: "user", content: userMsg },
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

    let description = "";
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : content);
      description = String(parsed.description ?? "").trim();
    } catch {
      description = content.replace(/^["']|["']$/g, "").trim();
    }

    description = description.slice(0, 240);

    return new Response(JSON.stringify({ description }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("describe-nutrient error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
