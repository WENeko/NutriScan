import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import {
  buildSystemContent,
  buildCloudDetectionSystemContent,
  buildCloudDetectionUserPrompt,
  buildCustomFoodsContext,
  buildUserPromptText,
} from "../_shared/mealAnalysisPrompt.ts";

const Nutrient = z.object({ key: z.string().min(1).max(60), label: z.string().max(80).optional(), unit: z.string().min(1).max(10) });
const Body = z.object({
  image: z.string().min(1).max(20000000).optional(), text: z.string().min(1).max(10000).optional(),
  custom_foods: z.array(z.object({ name: z.string().min(1).max(255) }).passthrough()).max(2000).optional(),
  custom_nutrients: z.array(Nutrient).max(80).optional(), std_nutrients: z.array(Nutrient).max(80).optional(),
  local_time: z.string().max(80).optional(), detection_only: z.boolean().optional(), ping: z.boolean().optional(),
});

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auth = req.headers.get("Authorization") ?? "";
    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!url || !anonKey) throw new Error("Configuration indisponible");
    const sb = createClient(url, anonKey, { global: { headers: { Authorization: auth } } });
    const { data: claims, error: authError } = await sb.auth.getClaims(auth.replace(/^Bearer /, ""));
    if (!auth.startsWith("Bearer ") || authError || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Non autorisé" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const parsedBody = Body.safeParse(await req.json().catch(() => null));
    if (!parsedBody.success) return new Response(JSON.stringify({ error: parsedBody.error.flatten().fieldErrors }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const { image, text, custom_foods, custom_nutrients, std_nutrients, local_time, detection_only, ping } = parsedBody.data;
    if (ping) return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    if (!image && !text) {
      return new Response(
        JSON.stringify({ error: "Fournissez une image ou un texte." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Prompt construit depuis la SOURCE UNIQUE DE VÉRITÉ partagée (_shared).
    const customFoodsContext = buildCustomFoodsContext(custom_foods);
    const systemContent = detection_only ? buildCloudDetectionSystemContent() : buildSystemContent(std_nutrients, custom_nutrients);
    const prompt = detection_only
      ? buildCloudDetectionUserPrompt({ hasImage: !!image, text, local_time, custom_foods })
      : buildUserPromptText({ hasImage: !!image, text, local_time, customFoodsContext });

    const userContent: any[] = [];
    if (image) {
      userContent.push(
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: image } }
      );
    } else if (text) {
      userContent.push({
        type: "text",
        text: prompt,
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
          { role: "system", content: systemContent },
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
