/**
 * Proxy serveur pour lister les modèles d'un fournisseur d'IA.
 *
 * Certains fournisseurs (GitHub Models, NVIDIA NIM, Azure AI…) n'envoient
 * aucun en-tête CORS : un `fetch` depuis le navigateur échoue avec
 * "Failed to fetch". On relaie donc l'appel côté serveur.
 *
 * La clé de l'utilisateur transite uniquement dans le corps de la requête
 * (HTTPS) et n'est jamais journalisée.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { api_type, base_url, models_endpoint, api_key } = await req.json();

    if (!base_url || typeof base_url !== "string") return json({ error: "base_url requis" }, 400);
    let parsed: URL;
    try {
      parsed = new URL(base_url);
    } catch {
      return json({ error: "base_url invalide" }, 400);
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return json({ error: "Protocole non supporté" }, 400);
    }

    const key = typeof api_key === "string" ? api_key.trim() : "";

    if (api_type === "gemini") {
      const endpoint = /\/models\b/.test(models_endpoint ?? "") ? models_endpoint : "/v1beta/models";
      const url = `${joinUrl(base_url, endpoint)}?key=${encodeURIComponent(key)}`;
      const res = await fetch(url);
      const text = await res.text();
      if (!res.ok) {
        console.error(`Gemini models failed [${res.status}]: ${text.slice(0, 500)}`);
        return json({ error: `Erreur ${res.status} du fournisseur`, details: text.slice(0, 500) }, res.status);
      }
      const data = JSON.parse(text);
      const models = (data?.models ?? []) as Array<{ name: string; supportedGenerationMethods?: string[] }>;
      return json({
        models: models
          .filter((m) => !m.supportedGenerationMethods || m.supportedGenerationMethods.includes("generateContent"))
          .map((m) => m.name.replace(/^models\//, ""))
          .filter((n) => /gemini/i.test(n))
          .sort(),
      });
    }

    // Compatible OpenAI : /models avec Bearer token
    const endpoint = models_endpoint && /models\s*$/.test(models_endpoint) ? models_endpoint : "/models";
    const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
    if (key) headers.Authorization = `Bearer ${key}`;

    // GitHub Models : l'ancien hôte Azure est hors service et le catalogue vit
    // sur une URL dédiée (hors préfixe /inference).
    const host = parsed.hostname.toLowerCase();
    const isGitHubModels = host === "models.github.ai" || host === "models.inference.ai.azure.com";
    const targetUrl = isGitHubModels
      ? "https://models.github.ai/catalog/models"
      : joinUrl(base_url, endpoint);
    if (isGitHubModels) headers["X-GitHub-Api-Version"] = "2022-11-28";

    const res = await fetch(targetUrl, { headers });
    const text = await res.text();
    if (!res.ok) {
      console.error(`Provider models failed [${res.status}]: ${text.slice(0, 500)}`);
      return json({ error: `Erreur ${res.status} du fournisseur`, details: text.slice(0, 500) }, res.status);
    }
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      return json({ error: "Réponse du fournisseur illisible", details: text.slice(0, 300) }, 502);
    }
    const list = (Array.isArray(data)
      ? data
      : ((data as any)?.data ?? (data as any)?.models ?? [])) as Array<{ id?: string; name?: string }>;
    return json({
      models: list
        .map((m) => {
          const id = m.id ?? "";
          if (id && !id.includes("://")) return id;
          return m.name ?? id ?? "";
        })
        .filter(Boolean)
        .sort(),
    });
  } catch (e) {
    console.error("list-provider-models error:", e);
    return json({ error: e instanceof Error ? e.message : "Erreur inconnue" }, 500);
  }
});
