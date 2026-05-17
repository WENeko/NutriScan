// Edge function: sync-record — upsert générique pour profiles, body_composition, water_logs, sleep_logs, custom_foods
// Déployer sur la BDD PERSO: supabase functions deploy sync-record --no-verify-jwt
// Env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, LOVABLE_BRIDGE_SECRET

import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-shared-secret, x-client-info, apikey, content-type",
};

const ALLOWED = new Set([
  "profiles", "body_composition", "water_logs", "sleep_logs", "custom_foods",
]);

function decodeJwtSub(jwt: string): string | null {
  try {
    const [, payload] = jwt.split(".");
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof json.sub === "string" ? json.sub : null;
  } catch { return null; }
}

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

// @ts-ignore
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST")     return new Response("Method not allowed", { status: 405, headers: cors });

  // @ts-ignore
  const BRIDGE = Deno.env.get("LOVABLE_BRIDGE_SECRET");
  if (!BRIDGE || req.headers.get("x-shared-secret") !== BRIDGE) return json({ error: "Forbidden" }, 403);

  const auth = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  const jwtSub = auth ? decodeJwtSub(auth) : null;

  let body: any;
  try { body = await req.json(); }
  catch { return json({ error: "Invalid JSON" }, 400); }

  const { table, userId, row, onConflict, mode = "insert" } = body ?? {};
  if (!table || !ALLOWED.has(table)) return json({ error: `table not allowed: ${table}` }, 400);
  if (!userId) return json({ error: "userId required" }, 400);
  if (!row || typeof row !== "object") return json({ error: "row required" }, 400);
  if (jwtSub && jwtSub !== userId) return json({ error: "userId / JWT mismatch" }, 403);

  const admin = createClient(
    // @ts-ignore
    Deno.env.get("SUPABASE_URL")!,
    // @ts-ignore
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const payload = { ...row, user_id: userId };

  try {
    let res;
    if (mode === "upsert") {
      res = await admin.from(table).upsert(payload, onConflict ? { onConflict } : undefined).select();
    } else if (mode === "update") {
      const { id, ...rest } = payload;
      if (!id) return json({ error: "id required for update" }, 400);
      res = await admin.from(table).update(rest).eq("id", id).eq("user_id", userId).select();
    } else if (mode === "delete") {
      const { id } = payload;
      if (!id) return json({ error: "id required for delete" }, 400);
      res = await admin.from(table).delete().eq("id", id).eq("user_id", userId).select();
    } else {
      res = await admin.from(table).insert(payload).select();
    }
    if (res.error) return json({ error: res.error.message, details: res.error }, 500);
    return json({ ok: true, data: res.data });
  } catch (e: any) {
    return json({ error: e.message }, 500);
  }
});
