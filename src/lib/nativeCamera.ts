import { Capacitor, registerPlugin } from "@capacitor/core";
import {
  readCurrentAngle,
  setCaptureAngle,
  startAngleTracking,
  stopAngleTracking,
} from "@/services/hybrid/captureAngle";
import { parseImageScale, scaleFromCameraExif, setCaptureScale } from "@/services/hybrid/captureScale";

/**
 * Capture / sélection d'image via le plugin natif Camera.
 * Caméra : angle d'inclinaison mémorisé + distance de mise au point (EXIF).
 * Galerie : fouille EXIF/XMP du fichier ; sinon aucune échelle (secours).
 */
export async function captureImageFile(source: "camera" | "gallery"): Promise<File | null> {
  if (!Capacitor.isNativePlatform()) return null;
  setCaptureAngle(null);
  setCaptureScale(null);
  if (source === "camera") startAngleTracking();
  try {
    // Caméra en direct : Camera2 natif (distance de mise au point matérielle).
    if (source === "camera" && Capacitor.getPlatform() === "android") {
      const f = await captureWithCamera2();
      if (f !== undefined) return f;
    }
    const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");
    const photo = await Camera.getPhoto({
      quality: 85,
      allowEditing: false,
      correctOrientation: true,
      resultType: CameraResultType.Base64,
      source: source === "gallery" ? CameraSource.Photos : CameraSource.Camera,
    });
    if (source === "camera") setCaptureAngle(readCurrentAngle());
    if (!photo?.base64String) return null;
    const mime = photo.format === "png" ? "image/png" : "image/jpeg";
    const bytes = Uint8Array.from(atob(photo.base64String), (c) => c.charCodeAt(0));
    const fromPlugin = scaleFromCameraExif((photo as { exif?: Record<string, unknown> }).exif);
    const fromFile = parseImageScale(bytes.buffer);
    setCaptureScale(fromPlugin?.distanceM ? fromPlugin : fromFile.distanceM ? fromFile : fromPlugin ?? fromFile);
    return new File([bytes], `meal.${photo.format || "jpg"}`, { type: mime });
  } catch (e) {
    console.warn("[camera] capture annulée ou indisponible", e);
    return null;
  } finally {
    stopAngleTracking();
  }
}

interface Camera2Result {
  base64: string;
  distanceM?: number;
  focusDiopters?: number;
  focalMm?: number;
  calibration?: "calibrated" | "approximate" | "uncalibrated";
}

/** null = annulé ; undefined = plugin indisponible (repli sur @capacitor/camera). */
async function captureWithCamera2(): Promise<File | null | undefined> {
  const plugin = registerPlugin<{ capture(): Promise<Camera2Result> }>("Camera2");
  let r: Camera2Result;
  try {
    r = await plugin.capture();
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    if (msg.includes("cancelled") || msg.includes("permission")) return null;
    console.warn("[camera2] indisponible, repli caméra système", e);
    return undefined;
  }
  setCaptureAngle(readCurrentAngle());
  const bytes = Uint8Array.from(atob(r.base64), (c) => c.charCodeAt(0));
  const d = r.distanceM && r.distanceM > 0.03 && r.distanceM < 10 ? r.distanceM : null;
  setCaptureScale({
    distanceM: d,
    focalMm: r.focalMm ?? null,
    focal35Mm: null,
    focusDiopters: r.focusDiopters ?? null,
    calibration: r.calibration,
    source: d ? "camera2" : "none",
  });
  return new File([bytes], "meal.jpg", { type: "image/jpeg" });
}
