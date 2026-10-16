/**
 * Détecteur VLM local (MiniCPM-V 4.6 & co, GGUF + projecteur mmproj) pour le
 * mode hybride. Le VLM ne fait QUE la perception (aliments + grammes) ; les
 * nutriments viennent toujours du résolveur déterministe.
 *
 * Inférence native dans le processus Android séparé « :vlm » (LocalVlmPlugin).
 */
import { Capacitor, registerPlugin } from "@capacitor/core";
import { appLogger } from "@/services/appLogger";
import { buildDetectionSystemContent, buildUserPromptText } from "../../../supabase/functions/_shared/mealAnalysisPrompt";

export interface VlmFile { name: string; size: number; kind: "model" | "mmproj" }

interface LocalVlmNative {
  isAvailable(): Promise<{ available: boolean }>;
  listModels(): Promise<{ models: VlmFile[] }>;
  importModel(opts: { kind: "model" | "mmproj" }): Promise<VlmFile & { model: string }>;
  deleteModel(opts: { model: string }): Promise<{ deleted: boolean }>;
  analyze(opts: { image: string; system: string; prompt: string; model?: string; mmproj?: string; maxTokens?: number }): Promise<{
    text: string; latencyMs?: number; loadMs?: number; model?: string;
  }>;
}

const LocalVlm = registerPlugin<LocalVlmNative>("LocalVlm");
const plugin = () => (Capacitor.isNativePlatform() ? LocalVlm : null);

// ── Choix du détecteur du mode hybride ───────────────────────────────────────
export type HybridDetector = "laya" | "vlm";
const LS_DETECTOR = "nutriscan-hybrid-detector";

export function getHybridDetector(): HybridDetector {
  try { return localStorage.getItem(LS_DETECTOR) === "vlm" ? "vlm" : "laya"; } catch { return "laya"; }
}
export function setHybridDetector(d: HybridDetector): void {
  try { localStorage.setItem(LS_DETECTOR, d); } catch { /* ignoré */ }
}

// ── Gestion des fichiers ─────────────────────────────────────────────────────
export async function isVlmAvailable(): Promise<boolean> {
  const p = plugin();
  if (!p) return false;
  try { return !!(await p.isAvailable())?.available; } catch { return false; }
}
export async function listVlmFiles(): Promise<VlmFile[]> {
  const p = plugin();
  if (!p) throw new Error("Disponible uniquement dans l'app Android native.");
  const res = await p.listModels();
  return Array.isArray(res?.models) ? res.models : [];
}
export async function importVlmFile(kind: "model" | "mmproj") {
  const p = plugin();
  if (!p) throw new Error("Import disponible uniquement dans l'app Android native.");
  return p.importModel({ kind });
}
export async function deleteVlmFile(name: string) {
  const p = plugin();
  if (!p) throw new Error("Suppression disponible uniquement dans l'app Android native.");
  return p.deleteModel({ model: name });
}

// ── Prompt & parsing ─────────────────────────────────────────────────────────
// Source unique de vérité : mêmes règles expertes que le prompt cloud.
export interface VlmDetection { name: string; weightG?: number; count?: number }

export const VLM_SYSTEM_PROMPT = buildDetectionSystemContent();

export const VLM_USER_PROMPT = buildUserPromptText({ hasImage: true, customFoodsContext: "" }) +
  " Réponds directement par le tableau JSON [ :";

/** Parse tolérant de la sortie du VLM (JSON strict, guillemets simples, tuples, liste texte). */
export function parseVlmOutput(raw: string): VlmDetection[] {
  const text = String(raw ?? "").replace(/```(?:json)?/gi, "").trim();
  // Tuples ['fish', 250] (guillemets simples, sans objet)
  const tuples = [...text.matchAll(/\[\s*['"]([^'"\]]+)['"]\s*,\s*(\d+(?:[.,]\d+)?)\s*\]/g)];
  if (tuples.length > 0 && !/\{/.test(text)) {
    return parseVlmOutput(JSON.stringify(tuples.map((m) => ({ name: m[1], weight_g: Number(m[2].replace(",", ".")) }))));
  }
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  let arr: unknown = null;
  const tryParse = (s: string) => { try { return JSON.parse(s); } catch { try { return JSON.parse(s.replace(/'/g, '"')); } catch { return null; } } };
  if (start >= 0 && end > start) arr = tryParse(text.slice(start, end + 1));
  if (!Array.isArray(arr)) {
    // Repli 1 : objets {...} isolés
    arr = (text.match(/\{[^{}]*\}/g) ?? []).map(tryParse);
  }

  const merged = new Map<string, VlmDetection>();


  // Repli 2 : Si le modèle a répondu sous forme de liste texte libre (ex: "- Poisson : 150g")
  if (!Array.isArray(arr) || arr.filter(Boolean).length === 0) {
    const lines = text.split("\n");
    for (const line of lines) {
      const match = line.match(/[-*•]?\s*([a-zA-ZÀ-ÿ\s'-]+)[:=,\s]+(\d+)\s*g?/i);
      if (match) {
        const name = match[1].trim().toLowerCase();
        const weightG = parseInt(match[2], 10);
        if (name.length > 2 && weightG > 2 && weightG < 3000) {
          merged.set(name, { name, weightG });
        }
      }
    }
    if (merged.size > 0) return [...merged.values()];
  }

  for (const e of (arr as any[]) ?? []) {
    if (!e || typeof e !== "object") continue;
    const name = String(e.ingredient ?? e.name ?? e.food ?? e.aliment ?? e.item ?? e.label ?? "").replace(/[_]+/g, " ").trim().toLowerCase();
    if (!name || name === "nom de l'aliment") continue;
    const w = Number(e.estimated_weight_g ?? e.weight_g ?? e.weight ?? e.grams ?? e.masse_g ?? e.portion_g);
    const c = Number(e.unit_count ?? e.count ?? e.quantity ?? e.pieces);
    const weightG = Number.isFinite(w) && w > 2 && w < 3000 ? Math.round(w) : undefined;
    const count = Number.isFinite(c) && c >= 1 && c < 100 ? Math.round(c) : undefined;
    const prev = merged.get(name);
    if (prev) {
      if (weightG) prev.weightG = (prev.weightG ?? 0) + weightG;
      if (count) prev.count = (prev.count ?? 0) + count;
    } else merged.set(name, { name, weightG, count });
  }
  return [...merged.values()];
}


export async function detectFoodsWithVlm(image: string): Promise<{ detections: VlmDetection[]; latencyMs: number; model: string }> {
  const p = plugin();
  if (!p) throw new Error("VLM local disponible uniquement dans l'app Android native.");
  try {
    const res = await p.analyze({ image, system: VLM_SYSTEM_PROMPT, prompt: VLM_USER_PROMPT, maxTokens: 192 });
    const rawText = (res?.text ?? "").trim();
    const detections = parseVlmOutput(rawText);
    appLogger.info("LocalVlm", `Détection VLM en ${res?.latencyMs ?? 0} ms (chargement ${res?.loadMs ?? 0} ms) — Réponse brute : "${rawText || '<VIDE>'}"`);
    return { detections, latencyMs: Number(res?.latencyMs) || 0, model: res?.model || "vlm" };
  } catch (err: any) {
    const msg = err?.message || String(err);
    appLogger.error("LocalVlm", `Échec appel VLM : ${msg}`);
    throw err;
  }
}

