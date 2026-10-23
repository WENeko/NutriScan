export async function fetchJson(url: string, ms = 6000, init?: RequestInit): Promise<any> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { ...init, signal: c.signal });
    return r.ok ? await r.json() : null;
  } catch { return null; } finally { clearTimeout(t); }
}

export async function aiChat(apiKey: string, system: string, user: string, strict = false): Promise<string> {
  if (strict) {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        response_format: { type: "json_object" },
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new FoodSelectionError(response.status, String(data?.error?.message ?? data?.message ?? "Sélection nutritionnelle indisponible"));
    const content = data?.choices?.[0]?.message?.content;
    if (!content || data?.choices?.[0]?.message?.refusal) throw new FoodSelectionError(403, "Sélection nutritionnelle refusée");
    return content;
  }
  const d = await fetchJson("https://ai.gateway.lovable.dev/v1/chat/completions", 25000, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      response_format: { type: "json_object" },
    }),
  });
  return d?.choices?.[0]?.message?.content ?? "";
}

export class FoodSelectionError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function parseObj(s: string): any {
  const m = String(s).match(/\{[\s\S]*\}/);
  try { return m ? JSON.parse(m[0]) : null; } catch { return null; }
}

/** Traduit les noms en requêtes anglaises (noms uniquement, aucune valeur nutritionnelle). */
export async function translate(apiKey: string, names: string[]): Promise<string[]> {
  const raw = await aiChat(apiKey,
    "Translate food names to short generic English USDA search terms (e.g. 'poulet rôti' -> 'chicken, roasted'). JSON only.",
    `{"names":${JSON.stringify(names)}} -> {"en":["..."]} same order.`);
  const en = parseObj(raw)?.en;
  return Array.isArray(en) && en.length === names.length ? en.map(String) : names;
}

