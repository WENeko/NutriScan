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
import { FOOD101_LABELS } from "./food101Labels";
import { ISIA500_LABELS } from "./isia500Labels";
import { consumeCaptureAngle } from "./captureAngle";
import { consumeCaptureScale } from "./captureScale";

export interface LayaPrediction {
  /** Libellé brut renvoyé par le modèle (ex: "grilled_chicken_breast" ou "class_42"). */
  label: string;
  /** Confiance 0→1. */
  confidence: number;
  /** Indice de classe (modèle ONNX Laya-Vision, 500 sorties). */
  classIndex?: number;
  /** Masse estimée en grammes par la tête de régression (modèle ONNX). */
  massG?: number;
}

export interface LayaDetection extends LayaPrediction {
  /** Libellé lisible, normalisé (ex: "grilled chicken breast"). */
  name: string;
  /** Poids estimé en grammes, si la tête de pesée du modèle l'a fourni. */
  weightG?: number;
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
  deleteModel(opts: { model: string }): Promise<{ deleted?: boolean; stillInDownloads?: boolean }>;
  classify(opts: { image: string; model?: string; maxResults?: number; angle?: number; distance?: number }): Promise<{
    predictions?: LayaPrediction[];
    latencyMs?: number;
    model?: string;
    angleUsed?: boolean;
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

/** Supprime un modèle importé du stockage privé de l'app. */
export async function deleteLayaModel(model: string): Promise<{ deleted: boolean; stillInDownloads: boolean }> {
  const plugin = getPlugin();
  if (!plugin) throw new Error("Suppression disponible uniquement dans l'app Android native.");
  const res = await plugin.deleteModel({ model });
  if (getSelectedLayaModel() === model) setSelectedLayaModel(null);
  return { deleted: !!res?.deleted, stillInDownloads: !!res?.stillInDownloads };
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

const LS_LABELS_PREFIX = "nutriscan-laya-labels:";

/** Enregistre la liste ordonnée des classes exportée avec le checkpoint. */
export function setLayaLabels(model: string, labels: string[] | null): void {
  try {
    if (labels?.length) localStorage.setItem(LS_LABELS_PREFIX + model, JSON.stringify(labels));
    else localStorage.removeItem(LS_LABELS_PREFIX + model);
  } catch {
    /* ignoré */
  }
}

export function getLayaLabels(model: string | null): string[] | null {
  if (!model) return null;
  try {
    const raw = localStorage.getItem(LS_LABELS_PREFIX + model);
    const arr = raw ? JSON.parse(raw) : null;
    return Array.isArray(arr) && arr.length ? arr.map(String) : null;
  } catch {
    return null;
  }
}

/** Lit un fichier de classes : JSON tableau, JSON {idx: nom}/{nom: idx}, ou texte (1 par ligne). */
export function parseLabelsFile(text: string): string[] {
  const t = text.trim();
  try {
    const j = JSON.parse(t);
    const obj = Array.isArray(j) ? j : j.classes ?? j.idx_to_class ?? j.class_to_idx ?? j;
    if (Array.isArray(obj)) return obj.map(String);
    const entries = Object.entries(obj as Record<string, unknown>);
    if (entries.every(([k]) => /^\d+$/.test(k)))
      return entries.sort((a, b) => +a[0] - +b[0]).map(([, v]) => String(v));
    return entries.sort((a, b) => Number(a[1]) - Number(b[1])).map(([k]) => k);
  } catch {
    return t.split(/\r?\n/).map((l) => l.replace(/^\s*\d+[\s,;:\t]+/, "").trim()).filter(Boolean);
  }
}

/** Résout le nom lisible : libellé direct, classes importées, ou table embarquée. */
function resolveName(p: LayaPrediction, model: string | null): string {
  if (p.label && !/^class_\d+$/i.test(p.label)) return humanizeLabel(p.label);
  const i = p.classIndex;
  if (typeof i === "number") {
    const custom = getLayaLabels(model);
    if (custom?.[i]) return humanizeLabel(custom[i]);
    const table = /isia|500|moe|bi_?input/i.test(model ?? "") || i >= FOOD101_LABELS.length ? ISIA500_LABELS : FOOD101_LABELS;
    if (table[i]) return humanizeLabel(table[i]);
    return `aliment ${i}`;
  }
  return humanizeLabel(p.label || "aliment inconnu");
}

/**
 * Lance la détection sur une image (data URL ou base64 brut).
 * Ne conserve que les prédictions au-dessus du seuil de confiance.
 */
export async function detectFoodsWithLaya(
  image: string,
  opts: { minConfidence?: number; maxResults?: number; angle?: number | null } = {},
): Promise<LayaClassifyResult> {
  const plugin = getPlugin();
  if (!plugin) throw new Error("Détection Laya disponible uniquement dans l'app Android native.");

  const minConfidence = opts.minConfidence ?? 0.25;
  const maxResults = opts.maxResults ?? 5;
  const model = getSelectedLayaModel() ?? undefined;

  // Angle de prise de vue (capteur) : transmis si connu ; le plugin ne l'utilise
  // que si le modèle ONNX possède une 2e entrée (« angle »).
  const angle = opts.angle !== undefined ? opts.angle : consumeCaptureAngle();
  const scale = consumeCaptureScale();
  const res = await plugin.classify({
    image,
    model,
    maxResults,
    ...(typeof angle === "number" ? { angle } : {}),
    ...(scale?.distanceM ? { distance: scale.distanceM } : {}),
  });
  const raw = Array.isArray(res?.predictions) ? res.predictions : [];

  const detections: LayaDetection[] = raw
    .filter((p) => p && p.label && Number.isFinite(Number(p.confidence)))
    .map((p) => {
      const mass = Number(p.massG);
      const weightG = Number.isFinite(mass) && mass > 0 ? Math.round(mass) : undefined;
      return {
        label: p.label,
        confidence: Math.max(0, Math.min(1, Number(p.confidence))),
        classIndex: typeof p.classIndex === "number" ? p.classIndex : undefined,
        massG: weightG,
        weightG,
        name: resolveName(p, res?.model || model || null),
      };
    })
    .filter((p) => p.confidence >= minConfidence)
    .sort((a, b) => b.confidence - a.confidence);

  appLogger.info("LayaVision", `Détection en ${res?.latencyMs ?? 0} ms`, {
    count: detections.length,
    top: detections[0]?.name,
    angle,
    angleUsed: !!res?.angleUsed,
    scale,
  });

  return {
    detections,
    latencyMs: Number(res?.latencyMs) || 0,
    model: res?.model || model || "laya",
  };
}
