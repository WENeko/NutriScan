/**
 * Mémorise l'angle de prise de vue de la dernière photo (degrés au-dessus du
 * plan de la table : 90 = vue du dessus, 45 = vue inclinée, 0 = vue rasante).
 * Calculé à partir du capteur d'orientation du téléphone (beta/gamma).
 * null = inconnu (ex : photo importée depuis la galerie).
 */
let lastAngle: number | null = null;
let latest: { beta: number; gamma: number } | null = null;
let listening = false;

function onOrientation(e: DeviceOrientationEvent) {
  if (e.beta == null || e.gamma == null) return;
  latest = { beta: e.beta, gamma: e.gamma };
}

/** Démarre l'écoute du capteur (à appeler juste avant d'ouvrir la caméra). */
export function startAngleTracking(): void {
  if (listening || typeof window === "undefined") return;
  window.addEventListener("deviceorientation", onOrientation);
  listening = true;
}

export function stopAngleTracking(): void {
  if (!listening) return;
  window.removeEventListener("deviceorientation", onOrientation);
  listening = false;
}

/** Angle caméra/table en degrés depuis la dernière mesure, ou null. */
export function readCurrentAngle(): number | null {
  if (!latest) return null;
  const b = (latest.beta * Math.PI) / 180;
  const g = (latest.gamma * Math.PI) / 180;
  // Inclinaison de l'écran par rapport à l'horizontale (0 = posé à plat).
  const tilt = (Math.acos(Math.max(-1, Math.min(1, Math.cos(b) * Math.cos(g)))) * 180) / Math.PI;
  // Caméra arrière : téléphone à plat au-dessus de l'assiette = 90° (vue du dessus).
  return Math.round(Math.max(0, Math.min(90, 90 - tilt)));
}

export function setCaptureAngle(angle: number | null): void {
  lastAngle = angle;
}

/** Lit puis efface l'angle de la dernière capture. */
export function consumeCaptureAngle(): number | null {
  const a = lastAngle;
  lastAngle = null;
  return a;
}
