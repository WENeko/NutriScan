/**
 * Étage 1 du pipeline hybride : détection visuelle « Laya ».
 *
 * Un modèle de décision non-autorégressif (classifieur d'images `.tflite`)
 * tourne DIRECTEMENT sur l'appareil via le plugin Capacitor natif `LayaVision`
 * (MediaPipe Tasks Vision / LiteRT). Contrairement à un LLM multimodal, il ne
 * génère pas de texte : il renvoie en une seule passe des décisions typées
 * (label + score de confiance) en quelques dizaines de millisecondes.
 *
 * Le plugin natif expose :
 *   isAvailable(): Promise<{ available: boolean }>
 *   listModels(): Promise<{ models: string[] }>
 *   importModel(): Promise<{ model: string; path?: string; size?: number }>
 *   classify({ image, model?, maxResults? }): Promise<{ predictions, latencyMs }>
 *
 * Sur le web (ou sans plugin), le pont est indisponible : le moteur de routage
 * bascule alors sur la priorité suivante (LLM classique).
 */
import { Capacitor, registerPlugin } from "@capacitor/core";
import { appLogger } from "@/services/appLogger";

export interface LayaPrediction {
  /** Libellé brut renvoyé par le modèle (ex: "grilled_chicken_breast"). */
  label: string;
  /** Confiance 0→1. */
  confidence: number;
}

export interface LayaDetection extends LayaPrediction {
  /** Libellé lisible, normalisé (ex: "grilled chicken breast"). */
  name: string;
}

export interface LayaClassifyResult {
  detections: LayaDetection[];
  latencyMs: number;
  model: string;
}

interface LayaVisionNativePlugin {
  isAvailable(): Promise<{ available: boolean }>;
  listModels(): Promise<{ models: string[] }>;
  importModel(): Promise<{ model: string; path?: string; size?: number }>;
  classify(opts: { image: string; model?: string; maxResults?: number }): Promise<{
    predictions?: LayaPrediction[];
    latencyMs?: number;
    model?: string;
  }>;
}

const LayaVision = registerPlugin<LayaVisionNativePlugin>("LayaVision");

/** Clé localStorage du modèle de détection sélectionné. */
const LS_LAYA_MODEL = "nutriscan-laya-model";

function getPlugin(): LayaVisionNativePlugin | null {
  if (!Capacitor.isNativePlatform()) return null;
  return LayaVision;
}

/** true si le moteur de détection Laya est disponible sur cet appareil. */
export async function isLayaAvailable(): Promise<boolean> {
  const plugin = getPlugin();
  if (!plugin) return false;
  try {
    const res = await plugin.isAvailable();
    return !!res?.available;
  } catch (e) {
    appLogger.warn("LayaVision", "isAvailable a échoué", e);
    return false;
  }
}

/** Recherche les modèles de classification `.tflite` disponibles sur l'appareil. */
export async function listLayaModels(): Promise<string[]> {
  const plugin = getPlugin();
  if (!plugin) throw new Error("Recherche disponible uniquement dans l'app Android native.");
  const res = await plugin.listModels();
  return Array.isArray(res?.models) ? res.models.filter(Boolean) : [];
}

/** Importe un modèle `.tflite` via le sélecteur de fichiers Android. */
export async function importLayaModel(): Promise<{ model: string; path?: string; size?: number }> {
  const plugin = getPlugin();
  if (!plugin) throw new Error("Import disponible uniquement dans l'app Android native.");
  const res = await plugin.importModel();
  if (res?.model) setSelectedLayaModel(res.model);
  return res;
}

export function getSelectedLayaModel(): string | null {
  try {
    return localStorage.getItem(LS_LAYA_MODEL) || null;
  } catch {
    return null;
  }
}

export function setSelectedLayaModel(model: string | null): void {
  try {
    if (model) localStorage.setItem(LS_LAYA_MODEL, model);
    else localStorage.removeItem(LS_LAYA_MODEL);
  } catch {
    /* stockage indisponible */
  }
}

/** Transforme un label technique en nom lisible ("grilled_chicken" → "grilled chicken"). */
export function humanizeLabel(label: string): string {
  return label
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Lance la détection sur une image (data URL ou base64 brut).
 * Ne conserve que les prédictions au-dessus du seuil de confiance.
 */
export async function detectFoodsWithLaya(
  image: string,
  opts: { minConfidence?: number; maxResults?: number } = {},
): Promise<LayaClassifyResult> {
  const plugin = getPlugin();
  if (!plugin) throw new Error("Détection Laya disponible uniquement dans l'app Android native.");

  const minConfidence = opts.minConfidence ?? 0.25;
  const maxResults = opts.maxResults ?? 5;
  const model = getSelectedLayaModel() ?? undefined;

  const res = await plugin.classify({ image, model, maxResults });
  const raw = Array.isArray(res?.predictions) ? res.predictions : [];

  const detections: LayaDetection[] = raw
    .filter((p) => p && p.label && Number.isFinite(Number(p.confidence)))
    .map((p) => ({
      label: p.label,
      confidence: Math.max(0, Math.min(1, Number(p.confidence))),
      name: humanizeLabel(p.label),
    }))
    .filter((p) => p.confidence >= minConfidence)
    .sort((a, b) => b.confidence - a.confidence);

  appLogger.info("LayaVision", `Détection en ${res?.latencyMs ?? 0} ms`, {
    count: detections.length,
    top: detections[0]?.name,
  });

  return {
    detections,
    latencyMs: Number(res?.latencyMs) || 0,
    model: res?.model || model || "laya",
  };
}
