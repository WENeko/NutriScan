import { useEffect } from "react";
import { App as CapApp } from "@capacitor/app";

/**
 * Gestion centralisée du bouton retour (Android natif + navigateur).
 * Chaque vue enregistre un handler : le plus récemment enregistré est appelé
 * en premier. Si un handler renvoie true, l'événement est consommé.
 * Si aucun handler ne consomme, l'app est mise en arrière-plan (natif).
 */

type BackHandler = () => boolean;

const handlers: BackHandler[] = [];
let initialized = false;

function register(handler: BackHandler) {
  handlers.push(handler);
  return () => {
    const i = handlers.lastIndexOf(handler);
    if (i >= 0) handlers.splice(i, 1);
  };
}

function runHandlers(): boolean {
  for (let i = handlers.length - 1; i >= 0; i--) {
    try {
      if (handlers[i]()) return true;
    } catch {
      /* handler défectueux : on continue */
    }
  }
  return false;
}

export async function initBackNavigation() {
  if (initialized) return;
  initialized = true;

  // Android natif : bouton retour matériel / gestuel.
  try {
    await CapApp.addListener("backButton", () => {
      if (!runHandlers()) void CapApp.exitApp();
    });
  } catch {
    /* web */
  }

  // Web / PWA : geste de retour du navigateur.
  try {
    history.pushState({ nutriscan: true }, "");
    window.addEventListener("popstate", () => {
      const handled = runHandlers();
      // On garde toujours un état tampon pour pouvoir intercepter le prochain retour.
      history.pushState({ nutriscan: true }, "");
      if (!handled) {
        // Aucune vue à fermer : on laisse l'utilisateur quitter réellement.
        history.go(-2);
      }
    });
  } catch {
    /* environnement restreint */
  }
}

/**
 * Enregistre un handler de retour tant que `enabled` est vrai.
 * Le handler doit renvoyer true s'il a géré le retour.
 */
export function useBackHandler(handler: BackHandler, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    return register(handler);
  }, [handler, enabled]);
}
