// Edge function: save-meal
// Déployer sur la BDD PERSO: supabase functions deploy save-meal --no-verify-jwt
// Env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, LOVABLE_BRIDGE_SECRET

import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-shared-secret, x-client-info, apikey, content-type",
};

function decodeJwtSub(jwt: string): string | null {
  try {
    const [, payload] = jwt.split(".");
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof json.sub === "string" ? json.sub : null;
  } catch { return null; }
}

// @ts-ignore
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST")     return new Response("Method not allowed", { status: 405, headers: cors });

  // @ts-ignore
  const BRIDGE = Deno.env.get("LOVABLE_BRIDGE_SECRET");
  if (!BRIDGE || req.headers.get("x-shared-secret") !== BRIDGE) {
    return json({ error: "Forbidden" }, 403);
  }

  const auth = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  const jwtSub = auth ? decodeJwtSub(auth) : null;

  let body: any;
  try { body = await req.json(); }
  catch { return json({ error: "Invalid JSON" }, 400); }

  const { userId, meal, items, dryRun } = body ?? {};
  if (!userId || !meal) return json({ error: "userId and meal required" }, 400);
  if (jwtSub && jwtSub !== userId) return json({ error: "userId / JWT mismatch" }, 403);

  if (dryRun) return json({ ok: true, dryRun: true });

  const admin = createClient(
    // @ts-ignore
    Deno.env.get("SUPABASE_URL")!,
    // @ts-ignore
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  // 1. Ensure user exists in auth.users (idempotent)
  const existing = await admin.auth.admin.getUserById(userId);
  if (!existing.data?.user) {
    const email = meal.email || `${userId}@bridge.local`;
    // @ts-ignore
    const pwd = crypto.randomUUID() + crypto.randomUUID();
    const { error: createErr } = await admin.auth.admin.createUser({
      id: userId, email, password: pwd, email_confirm: true,
      user_metadata: { source: "lovable_bridge" },
    });
    if (createErr && !/already/i.test(createErr.message)) {
      return json({ error: `createUser failed: ${createErr.message}` }, 500);
    }
  }

  // 2. Insert meal
  const mealRow = { ...meal, user_id: userId };
  delete (mealRow as any).email;
  const { data: insertedMeal, error: mealErr } = await admin
    .from("meals").insert(mealRow).select().single();
  if (mealErr) return json({ error: `meal insert: ${mealErr.message}`, details: mealErr }, 500);

  // 3. Insert items
  let itemsInserted = 0;
  if (Array.isArray(items) && items.length > 0) {
    const rows = items.map((it: any) => ({ ...it, meal_id: insertedMeal.id }));
    const { error: itemsErr, count } = await admin
      .from("meal_items").insert(rows, { count: "exact" });
    if (itemsErr) {
      // rollback meal
      await admin.from("meals").delete().eq("id", insertedMeal.id);
      return json({ error: `items insert: ${itemsErr.message}`, details: itemsErr }, 500);
    }
    itemsInserted = count ?? rows.length;
  }

  return json({ ok: true, meal: insertedMeal, itemsInserted }, 201);
});

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...cors, "Content-Type": "application/json" },
  });
}
