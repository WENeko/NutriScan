/**
 * Pont vers l'IA locale native Android (inférence on-device).
 *
 * Contrairement au mode "local" (HTTP compatible OpenAI), ce pont exécute le
 * modèle DIRECTEMENT sur l'appareil via le plugin Capacitor natif `LocalAiGallery`
 * (moteur MediaPipe LLM Inference / LiteRT — le même que Google AI Edge Gallery).
 * Aucune clé, aucun réseau : le modèle (.task) est chargé localement.
 *
 * Le plugin natif `LocalAiGallery` expose :
 *   isAvailable(): Promise<{ available: boolean }>
 *   importModel(): Promise<{ model: string; path: string; size: number }>
 *   generate({ system, prompt, image?, model? }): Promise<{ text: string }>
 *
 * Sur le web (ou si le plugin n'est pas installé), le pont est indisponible et lève
 * une erreur explicite — le moteur de cascade bascule alors sur la priorité suivante.
 */
import { appLogger } from "@/services/appLogger";
import { Capacitor, registerPlugin } from "@capacitor/core";

interface LocalAiGalleryPlugin {
  isAvailable(): Promise<{ available: boolean }>;
  importModel(): Promise<{ model: string; path?: string; size?: number }>;
  listModels(): Promise<{ models: string[] }>;
  generate(opts: { system?: string; prompt?: string; image?: string; model?: string }): Promise<{ text: string }>;
}

// En Capacitor 8, les plugins natifs custom doivent être déclarés côté JS via
// registerPlugin — ils ne sont PAS exposés automatiquement sur Capacitor.Plugins.
// registerPlugin renvoie un proxy ; le pont natif n'est réellement présent que
// sur plateforme native (Android), d'où la garde isNativePlatform ci-dessous.
const LocalAiGallery = registerPlugin<LocalAiGalleryPlugin>("LocalAiGallery");

function getPlugin(): LocalAiGalleryPlugin | null {
  if (!Capacitor.isNativePlatform()) return null;
  return LocalAiGallery;
}

/** true si l'IA locale native est disponible sur cet appareil. */
export async function isLocalIntentAvailable(): Promise<boolean> {
  const plugin = getPlugin();
  if (!plugin) return false;
  try {
    const res = await plugin.isAvailable();
    return !!res?.available;
  } catch (e) {
    appLogger.warn("LocalAiBridge", "isAvailable a échoué", e);
    return false;
  }
}

/** Importe un fichier `.task` via le sélecteur Android vers le stockage privé de l'app. */
export async function importLocalIntentModel(): Promise<{ model: string; path?: string; size?: number }> {
  const plugin = getPlugin();
  if (!plugin) {
    throw new Error("Import disponible uniquement dans l'app Android native.");
  }
  return plugin.importModel();
}

/** Recherche automatiquement les fichiers `.task` compatibles dans les emplacements connus. */
export async function listLocalIntentModels(): Promise<string[]> {
  const plugin = getPlugin();
  if (!plugin) {
    throw new Error("Recherche disponible uniquement dans l'app Android native.");
  }
  const res = await plugin.listModels();
  return Array.isArray(res?.models) ? res.models.filter(Boolean) : [];
}

export interface LocalIntentRequest {
  system: string;
  prompt: string;
  /** Image en data URL / base64 (optionnel, pour l'analyse de photos). */
  image?: string;
  /** Modèle local sélectionné (optionnel, transmis tel quel au plugin). */
  model?: string;
}

/**
 * Lance une inférence sur l'IA locale native Android.
 * Retourne le texte brut renvoyé par le modèle (à parser par l'appelant).
 */
export async function runLocalIntentChat(req: LocalIntentRequest): Promise<string> {
  const plugin = getPlugin();
  if (!plugin) {
    throw new Error(
      "IA locale native indisponible : le plugin Android (Google AI Edge Gallery) n'est pas installé. Utilisez l'app native ou le mode local HTTP.",
    );
  }
  appLogger.info("LocalAiBridge", "Inférence locale native", { model: req.model });
  const res = await plugin.generate({
    system: req.system,
    prompt: req.prompt,
    image: req.image ?? undefined,
    model: req.model ?? undefined,
  });
  const text = res?.text ?? "";
  if (!text || !String(text).trim()) {
    throw new Error("L'IA locale native n'a renvoyé aucune réponse.");
  }
  return String(text);
}
