// Complétion des micronutriments manquants : USDA FoodData Central → Fichier
// canadien des éléments nutritifs (CNF) → passe IA ciblée sur les seules cases vides.
// Ne renvoie JAMAIS de calories/macros.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { fetchJson, aiChat, parseObj, translate, FoodSelectionError } from "../_shared/microAi.ts";
import { chooseRecords, usdaRecords, selectedCnfRecords } from "../_shared/compositionRecords.ts";

const Body = z.object({
  items: z.array(z.object({
    index: z.number().int().min(0).max(50),
    name: z.string().min(1).max(120),
    weight_g: z.number().positive().max(5000),
    missing: z.array(z.string().max(60)).max(60),
  })).max(20),
  nutrients: z.array(z.object({
    key: z.string().max(60), label: z.string().max(80), unit: z.string().max(10), custom: z.boolean().optional(),
  })).max(80),
  allow_ai: z.boolean().optional(),
  semantic_only: z.boolean().optional(),
});

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// USDA : numéro de nutriment → clé NutriScan (facteur de conversion).
const USDA_MAP: Record<string, { key: string; factor: number }> = {
  "291": { key: "fiber", factor: 1 }, "269": { key: "sugar", factor: 1 }, "606": { key: "saturated_fat", factor: 1 },
  "307": { key: "sodium_mg", factor: 1 }, "306": { key: "potassium_mg", factor: 1 }, "304": { key: "magnesium_mg", factor: 1 },
  "301": { key: "calcium_mg", factor: 1 }, "303": { key: "iron_mg", factor: 1 }, "309": { key: "zinc_mg", factor: 1 },
  "401": { key: "vitamin_c_mg", factor: 1 }, "328": { key: "vitamin_d_mcg", factor: 1 }, "417": { key: "vitamin_b9_mcg", factor: 1 },
  "418": { key: "vitamin_b12_mcg", factor: 1 }, "323": { key: "vitamin_e_mg", factor: 1 },
};
const USDA_OMEGA3 = ["851", "629", "621", "631"]; // ALA, EPA, DHA, DPA (g) → mg

// CNF : libellé anglais → clé NutriScan.
const CNF_MAP: [RegExp, string][] = [
  [/^fibre, total dietary/i, "fiber"], [/^sugars, total/i, "sugar"], [/^fatty acids, saturated, total/i, "saturated_fat"],
  [/^sodium/i, "sodium_mg"], [/^potassium/i, "potassium_mg"], [/^magnesium/i, "magnesium_mg"], [/^calcium/i, "calcium_mg"],
  [/^iron/i, "iron_mg"], [/^zinc/i, "zinc_mg"], [/^vitamin c/i, "vitamin_c_mg"], [/^vitamin d \(/i, "vitamin_d_mcg"],
  [/^folate, total|^total folate/i, "vitamin_b9_mcg"], [/^vitamin b-?12/i, "vitamin_b12_mcg"], [/^alpha-tocopherol/i, "vitamin_e_mg"],
];

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
  return Object.keys(out).length ? out : null;
}

let cnfFoods: { code: number; desc: string }[] | null = null;
async function cnfPer100(query: string): Promise<Record<string, number> | null> {
  if (!cnfFoods) {
    const list = await fetchJson("https://food-nutrition.canada.ca/api/canadian-nutrient-file/food/?lang=en&type=json", 10000);
    cnfFoods = Array.isArray(list) ? list.map((f: any) => ({ code: f.food_code, desc: String(f.food_description ?? "").toLowerCase() })) : [];
  }
  const words = query.toLowerCase().split(/[\s,]+/).filter((w) => w.length > 2);
  if (!words.length || !cnfFoods.length) return null;
  let best: { code: number; score: number } | null = null;
  for (const f of cnfFoods) {
    const score = words.filter((w) => f.desc.includes(w)).length / words.length - f.desc.length / 1000;
    if (score > 0.6 && (!best || score > best.score)) best = { code: f.code, score };
  }
  if (!best) return null;
  const rows = await fetchJson(`https://food-nutrition.canada.ca/api/canadian-nutrient-file/nutrientamount/?id=${best.code}&lang=en&type=json`);
  if (!Array.isArray(rows)) return null;
  const out: Record<string, number> = {};
  for (const r of rows) {
    const name = String(r.nutrient_web_name ?? r.nutrient_name ?? "");
    const v = Number(r.nutrient_value);
    if (!Number.isFinite(v)) continue;
    const hit = CNF_MAP.find(([re]) => re.test(name));
    if (hit && out[hit[1]] == null) out[hit[1]] = v;
  }
  return Object.keys(out).length ? out : null;
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
    const { items, nutrients, allow_ai, semantic_only } = parsed.data;
    const apiKey = Deno.env.get("LOVABLE_API_KEY") ?? "";
    const usdaKey = Deno.env.get("FDC_API_KEY") || "DEMO_KEY";
    const std = new Set(nutrients.filter((n) => !n.custom).map((n) => n.key));
    const allowed = new Set(nutrients.map((n) => n.key));

    const english = apiKey ? await translate(apiKey, items.map((i) => i.name), !!semantic_only) : items.map((i) => i.name);

    if (semantic_only) {
      // Cloud hybrid never consumes generated micro values or first search hits.
      const requests = await Promise.all(items.map(async (it, i) => ({ ...it, records: await usdaRecords(english[i], usdaKey) })));
      const chosen = await chooseRecords(apiKey, requests);
      const stillMissing = items.filter((it) => it.missing.some((k) => std.has(k) && chosen.get(it.index)?.per100[k] == null));
      const cnf = await selectedCnfRecords(apiKey, stillMissing.map((it) => ({ index: it.index, name: it.name, english: english[items.indexOf(it)] })));
      return json({ items: items.map((it) => {
        const values: Record<string, number> = {}, sources: Record<string, string> = {};
        for (const key of it.missing) {
          if (!allowed.has(key) || !std.has(key) || ["calories", "proteins", "carbs", "fats"].includes(key)) continue;
          const record = chosen.get(it.index)?.per100[key] != null ? chosen.get(it.index) : cnf.get(it.index);
          const value = record?.per100[key];
          if (value == null) continue;
          values[key] = Math.round(value * it.weight_g / 100 * 10) / 10;
          sources[key] = record?.source ?? "usda";
        }
        return { index: it.index, values, sources };
      }) });
    }

    const results = await Promise.all(items.map(async (it, i) => {
      const values: Record<string, number> = {};
      const sources: Record<string, string> = {};
      let remaining = [...new Set(it.missing)].filter((k) => allowed.has(k) && !["calories", "proteins", "carbs", "fats"].includes(k));
      const apply = (per100: Record<string, number> | null, src: string) => {
        if (!per100) return;
        for (const k of remaining) {
          if (std.has(k) && per100[k] != null) {
            values[k] = Math.round(per100[k] * it.weight_g / 100 * 10) / 10;
            sources[k] = src;
          }
        }
        remaining = remaining.filter((k) => values[k] == null);
      };
      if (remaining.some((k) => std.has(k))) apply(await usdaPer100(english[i], usdaKey), "usda");
      if (remaining.some((k) => std.has(k))) apply(await cnfPer100(english[i]), "cnf");
      return { index: it.index, name: it.name, values, sources, remaining };
    }));

    // Passe IA ciblée : un seul appel pour tout le repas, uniquement les cases restantes.
    const todo = results.filter((r) => r.remaining.length > 0);
    if (allow_ai && apiKey && todo.length) {
      const defs = new Map(nutrients.map((n) => [n.key, n]));
      const ask = todo.map((r) => ({
        index: r.index, food: r.name, grams: items.find((x) => x.index === r.index)?.weight_g,
        keys: r.remaining.map((k) => `${k} (${defs.get(k)?.unit ?? ""}, ${defs.get(k)?.label ?? k})`),
      }));
      const raw = await aiChat(apiKey,
        "Tu es une table de composition nutritionnelle (références CIQUAL/USDA). Donne uniquement les valeurs demandées, " +
        "pour la portion indiquée, en nombres. Si une valeur est réellement inconnue, omets la clé. Aucune calorie ni macro. JSON uniquement.",
        `${JSON.stringify(ask)}\nRéponds : {"items":[{"index":0,"values":{"cle":nombre}}]}`);
      const ai = parseObj(raw)?.items;
      if (Array.isArray(ai)) {
        for (const a of ai) {
          const r = todo.find((t) => t.index === Number(a?.index));
          if (!r || !a?.values) continue;
          for (const k of r.remaining) {
            const v = Number(a.values[k]);
            if (Number.isFinite(v) && v >= 0) { r.values[k] = v; r.sources[k] = "ai"; }
          }
        }
      }
    }

    return json({ items: results.map(({ index, values, sources }) => ({ index, values, sources })) });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Erreur inconnue" }, e instanceof FoodSelectionError ? e.status : 500);
  }
});
