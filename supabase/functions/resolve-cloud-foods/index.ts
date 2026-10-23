import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { translate, FoodSelectionError } from "../_shared/microAi.ts";
import { selectFoodCandidates } from "../_shared/foodSelection.ts";
import { chooseRecords, hasCompositionMacros, offRecords, usdaRecords, type CompositionRecord } from "../_shared/compositionRecords.ts";

const Body = z.object({
  items: z.array(z.object({ index: z.number().int().min(0).max(100), name: z.string().min(1).max(300) })).min(1).max(10),
  candidates: z.array(z.object({
    id: z.string().min(1).max(100), name: z.string().min(1).max(300), aliases: z.array(z.string().max(120)).max(30).optional(),
    source: z.enum(["library", "reference"]), per100: z.record(z.string().max(60), z.number().finite().nonnegative()),
  })).max(300),
  nutrients: z.array(z.object({ key: z.string().max(60), label: z.string().max(80).optional(), unit: z.string().max(10) })).max(80),
});
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, "Content-Type": "application/json" },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return json({ error: "Non autorisé" }, 401);
    const sb = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "", { global: { headers: { Authorization: auth } } });
    const { data, error } = await sb.auth.getClaims(auth.slice(7));
    if (error || !data?.claims?.sub) return json({ error: "Non autorisé" }, 401);
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
    const { items, candidates, nutrients } = parsed.data;
    if (new Set(items.map((i) => i.index)).size !== items.length || new Set(candidates.map((c) => c.id)).size !== candidates.length) return json({ error: "Identifiants dupliqués" }, 400);
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "Sélection nutritionnelle indisponible" }, 503);
    const selected = new Map<number, CompositionRecord>();
    // Strict exact library hits avoid an unnecessary AI call; fuzzy library hits do not.
    const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    for (const it of items) {
      const exact = candidates.filter((c) => c.source === "library" && normalize(c.name) === normalize(it.name) && hasCompositionMacros(c));
      if (exact.length === 1) selected.set(it.index, exact[0]);
    }
    // Preserve source priority, but only after semantic approval of the record.
    for (const source of ["library", "reference"] as const) {
      const pool = candidates.filter((c) => c.source === source && hasCompositionMacros(c));
      const requests = items.filter((it) => !selected.has(it.index)).map((it) => ({ index: it.index, name: it.name, candidates: pool.map(({ id, name, aliases }) => ({ id, name, aliases })) }));
      const choices = await selectFoodCandidates(apiKey, requests);
      for (const [index, id] of choices) {
        const record = pool.find((c) => c.id === id);
        if (record) selected.set(index, record);
      }
    }
    const pending = () => items.filter((it) => !selected.has(it.index));
    if (pending().length) {
      const requests = await Promise.all(pending().map(async (it) => ({ ...it, records: (await offRecords(it.name)).filter(hasCompositionMacros) })));
      for (const [index, record] of await chooseRecords(apiKey, requests)) selected.set(index, record);
    }
    if (pending().length) {
      const unresolved = pending();
      const english = await translate(apiKey, unresolved.map((it) => it.name), true);
      const requests = await Promise.all(unresolved.map(async (it, i) => ({ ...it, records: (await usdaRecords(english[i] ?? it.name, Deno.env.get("FDC_API_KEY") || "DEMO_KEY")).filter(hasCompositionMacros) })));
      for (const [index, record] of await chooseRecords(apiKey, requests)) selected.set(index, record);
    }
    const allowed = new Set(["calories", "proteins", "carbs", "fats", ...nutrients.map((n) => n.key)]);
    return json({ results: items.map((it) => {
      const record = selected.get(it.index);
      return record ? { index: it.index, ...record, per100: Object.fromEntries(Object.entries(record.per100).filter(([key]) => allowed.has(key))) } : { index: it.index, per100: null, source: "unresolved" };
    }) });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Résolution indisponible" }, error instanceof FoodSelectionError ? error.status : 500);
  }
});