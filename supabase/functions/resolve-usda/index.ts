// Résolution nutritionnelle complète via USDA FoodData Central (étage de la
// chaîne principale : bibliothèque → CIQUAL → Open Food Facts → USDA).
// Renvoie les valeurs POUR 100 g (macros + micros standards) ; le client
// applique la règle de trois sur la portion. Aucune valeur n'est inventée :
// si l'aliment est introuvable, per100 est null.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { translate } from "../_shared/microAi.ts";

const Body = z.object({
  queries: z.array(z.string().min(1).max(120)).min(1).max(10),
  nutrients: z.array(z.object({ key: z.string().min(1).max(60), label: z.string().max(80).optional(), unit: z.string().min(1).max(10) })).max(80).optional(),
});

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// Numéro de nutriment USDA → clé NutriScan (valeurs déjà pour 100 g).
const USDA_MAP: Record<string, { key: string; factor: number }> = {
  "208": { key: "calories", factor: 1 },      // Énergie (kcal)
  "203": { key: "proteins", factor: 1 },      // Protéines (g)
  "205": { key: "carbs", factor: 1 },         // Glucides (g)
  "204": { key: "fats", factor: 1 },          // Lipides (g)
  "291": { key: "fiber", factor: 1 },
  "269": { key: "sugar", factor: 1 },
  "606": { key: "saturated_fat", factor: 1 },
  "307": { key: "sodium_mg", factor: 1 },
  "306": { key: "potassium_mg", factor: 1 },
  "304": { key: "magnesium_mg", factor: 1 },
  "301": { key: "calcium_mg", factor: 1 },
  "303": { key: "iron_mg", factor: 1 },
  "309": { key: "zinc_mg", factor: 1 },
  "401": { key: "vitamin_c_mg", factor: 1 },
  "328": { key: "vitamin_d_mcg", factor: 1 },
  "417": { key: "vitamin_b9_mcg", factor: 1 },
  "418": { key: "vitamin_b12_mcg", factor: 1 },
  "323": { key: "vitamin_e_mg", factor: 1 },
};
const USDA_OMEGA3 = ["851", "629", "621", "631"]; // ALA, EPA, DHA, DPA (g) → mg

async function fetchJson(url: string, ms = 6000): Promise<any> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { signal: c.signal });
    return r.ok ? await r.json() : null;
  } catch { return null; } finally { clearTimeout(t); }
}

async function usdaPer100(query: string, key: string): Promise<Record<string, number> | null> {
  const url = `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(query)}` +
    `&dataType=Foundation,SR%20Legacy&pageSize=1&api_key=${key}`;
  const food = (await fetchJson(url))?.foods?.[0];
  if (!food?.foodNutrients) return null;
  const out: Record<string, number> = {};
  let omega = 0, hasOmega = false;
  for (const n of food.foodNutrients) {
    const num = String(n.nutrientNumber ?? "");
    const v = Number(n.value);
    if (!Number.isFinite(v)) continue;
    if (USDA_MAP[num]) out[USDA_MAP[num].key] = v * USDA_MAP[num].factor;
    if (USDA_OMEGA3.includes(num)) { omega += v; hasOmega = true; }
  }
  if (hasOmega) out.omega3_mg = omega * 1000;
  // Sans énergie ni protéines, la fiche est inexploitable pour la résolution.
  if (!out.calories && !out.proteins) return null;
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return json({ error: "Non autorisé" }, 401);
    const url = Deno.env.get("SUPABASE_URL");
    const anon = Deno.env.get("SUPABASE_ANON_KEY");
    if (!url || !anon) throw new Error("Configuration indisponible");
    const sb = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const { data: claims, error: authErr } = await sb.auth.getClaims(auth.slice(7));
    if (authErr || !claims?.claims?.sub) return json({ error: "Non autorisé" }, 401);

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);

    const usdaKey = Deno.env.get("FDC_API_KEY") || "DEMO_KEY";
    // USDA recherche en anglais ; cette passe traduit uniquement les noms,
    // sans jamais générer de valeurs nutritionnelles.
    let english = parsed.data.queries;
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (apiKey) english = await translate(apiKey, parsed.data.queries);
    const allowed = new Set(["calories", "proteins", "carbs", "fats", ...(parsed.data.nutrients?.map((n) => n.key) ?? Object.values(USDA_MAP).map((n) => n.key)), "omega3_mg"]);
    const results = await Promise.all(
      parsed.data.queries.map(async (q, index) => {
        const per100 = await usdaPer100(english[index], usdaKey);
        return { query: q, per100: per100 ? Object.fromEntries(Object.entries(per100).filter(([k]) => allowed.has(k))) : null };
      }),
    );
    return json({ results });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Erreur inconnue" }, 500);
  }
});
