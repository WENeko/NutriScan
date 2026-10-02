import { Capacitor } from "@capacitor/core";
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
