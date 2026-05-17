/**
 * Bridge sync vers la BDD perso.
 * Tout passe par les edge functions service-role déployées sur la BDD perso
 * (cf. supabase-perso/functions/*). Les anciennes signatures restent exposées
 * pour rester drop-in compatible avec MealInput.tsx / MealScanner.tsx.
 */

import { supabase } from "@/integrations/supabase/client";
import { callPersoBridge, isPersonalDbEnabled, pingPersoBridge } from "./mealPersistenceService";

/**
 * Garantit que l'utilisateur existe dans `auth.users` de la BDD perso.
 * No-op si la BDD perso n'est pas configurée.
 */
export async function ensureUserInPersonalDB(userId: string, email?: string): Promise<boolean> {
  if (!isPersonalDbEnabled()) {
    console.log("[DB Sync] BDD perso non configurée");
    return false;
  }
  let mail = email;
  if (!mail) {
    const { data: { user } } = await supabase.auth.getUser();
    mail = user?.email ?? `${userId}@bridge.local`;
  }
  const res = await callPersoBridge("create-user-in-personal-db", {
    id: userId,
    email: mail,
    name: mail.split("@")[0],
  });
  if (!res.ok) {
    console.warn("[DB Sync] ensureUserInPersonalDB KO", res);
    return false;
  }
  return true;
}

/**
 * Upsert d'un record dans une table autorisée de la BDD perso via bridge.
 */
export async function syncRecordToPersonal(
  table: "profiles" | "body_composition" | "water_logs" | "sleep_logs" | "custom_foods",
  userId: string,
  row: Record<string, unknown>,
  opts?: { mode?: "insert" | "upsert" | "update" | "delete"; onConflict?: string },
) {
  if (!isPersonalDbEnabled()) return { ok: false, error: "perso disabled" as const };
  return callPersoBridge("sync-record", {
    table, userId, row,
    mode: opts?.mode ?? "insert",
    onConflict: opts?.onConflict,
  });
}

/**
 * Ping le bridge perso et log un rapport — utilisé au démarrage de l'app.
 */
export async function logDatabaseHealth() {
  console.group("🔍 [DB Sync] Rapport BDD perso");
  if (!isPersonalDbEnabled()) {
    console.log("⚠️  BDD perso désactivée (VITE_PERSONAL_SUPABASE_URL / VITE_PERSONAL_BRIDGE_SECRET manquants)");
    console.groupEnd();
    return { ok: false, enabled: false };
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    console.log("ℹ️  Aucun utilisateur connecté, skip ping");
    console.groupEnd();
    return { ok: false, enabled: true, noUser: true };
  }
  const ping = await pingPersoBridge(user.id);
  if (ping.ok) console.log("✅ Bridge perso joignable");
  else console.warn("❌ Bridge perso KO:", ping.error);
  console.groupEnd();
  return { ok: ping.ok, enabled: true, detail: ping };
}
