/**
 * Détecteur VLM local (MiniCPM-V 4.6 & co, GGUF + projecteur mmproj) pour le
 * mode hybride. Le VLM ne fait QUE la perception (aliments + grammes) ; les
 * nutriments viennent toujours du résolveur déterministe.
 *
 * Inférence native dans le processus Android séparé « :vlm » (LocalVlmPlugin).
 */
import { Capacitor, registerPlugin } from "@capacitor/core";
import { appLogger } from "@/services/appLogger";

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
export const VLM_SYSTEM_PROMPT =
  "Tu es un détecteur d'aliments. Tu identifies chaque aliment visible dans l'assiette et estimes sa masse. " +
  "Tu ne donnes JAMAIS de calories ni de nutriments. Réponds UNIQUEMENT par un tableau JSON valide.";
export const VLM_USER_PROMPT =
  'Liste les aliments visibles. Format exact : [{"ingredient":"nom simple en français","weight_g":150,"count":2}]. ' +
  '"count" seulement pour les aliments comptables (œufs, boulettes, tranches). Aucun texte hors du JSON.';

export interface VlmDetection { name: string; weightG?: number; count?: number }

/** Parse tolérant de la sortie du VLM (JSON entouré de texte, clés variées, doublons fusionnés). */
export function parseVlmOutput(raw: string): VlmDetection[] {
  const text = String(raw ?? "").replace(/```(?:json)?/gi, "");
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  let arr: unknown = null;
  if (start >= 0 && end > start) {
    try { arr = JSON.parse(text.slice(start, end + 1)); } catch { arr = null; }
  }
  if (!Array.isArray(arr)) {
    // Repli : objets isolés {...} ligne par ligne.
    arr = (text.match(/\{[^{}]*\}/g) ?? []).map((s) => { try { return JSON.parse(s); } catch { return null; } });
  }
  const merged = new Map<string, VlmDetection>();
  for (const e of arr as any[]) {
    if (!e || typeof e !== "object") continue;
    const name = String(e.ingredient ?? e.name ?? e.food ?? e.aliment ?? "").replace(/[_]+/g, " ").trim().toLowerCase();
    if (!name) continue;
    const w = Number(e.weight_g ?? e.weight ?? e.grams ?? e.masse_g);
    const c = Number(e.count ?? e.quantity ?? e.pieces);
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
  const res = await p.analyze({ image, system: VLM_SYSTEM_PROMPT, prompt: VLM_USER_PROMPT, maxTokens: 384 });
  const rawText = (res?.text ?? "").trim();
  const detections = parseVlmOutput(rawText);
  appLogger.info("LocalVlm", `Détection VLM en ${res?.latencyMs ?? 0} ms (chargement ${res?.loadMs ?? 0} ms) — Réponse brute : "${rawText || '<VIDE>'}"`);

  return { detections, latencyMs: Number(res?.latencyMs) || 0, model: res?.model || "vlm" };
}
