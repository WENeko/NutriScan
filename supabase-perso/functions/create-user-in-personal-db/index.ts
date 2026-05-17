// Edge function: create-user-in-personal-db
// Déployer sur la BDD PERSO avec: supabase functions deploy create-user-in-personal-db --no-verify-jwt
// Env vars requis: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, LOVABLE_BRIDGE_SECRET

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
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...cors, "Content-Type": "application/json" } });
  }

  const auth = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  const jwtSub = auth ? decodeJwtSub(auth) : null;

  let body: any;
  try { body = await req.json(); }
  catch { return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } }); }

  const { id, email, name } = body ?? {};
  if (!id || !email) return new Response(JSON.stringify({ error: "id and email required" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
  if (jwtSub && jwtSub !== id) return new Response(JSON.stringify({ error: "userId / JWT mismatch" }), { status: 403, headers: { ...cors, "Content-Type": "application/json" } });

  const admin = createClient(
    // @ts-ignore
    Deno.env.get("SUPABASE_URL")!,
    // @ts-ignore
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  try {
    const existing = await admin.auth.admin.getUserById(id);
    if (existing.data?.user) {
      return new Response(JSON.stringify({ message: "already exists", user: existing.data.user }), { headers: { ...cors, "Content-Type": "application/json" } });
    }
    // @ts-ignore - crypto in Deno
    const randomPwd = crypto.randomUUID() + crypto.randomUUID();
    const { data, error } = await admin.auth.admin.createUser({
      id, email, password: randomPwd, email_confirm: true,
      user_metadata: { name: name ?? email.split("@")[0], source: "lovable_bridge" },
    });
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    return new Response(JSON.stringify({ message: "created", user: data.user }), { status: 201, headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
