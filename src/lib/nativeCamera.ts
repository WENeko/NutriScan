import { Capacitor } from "@capacitor/core";

/**
 * Capture / sélection d'image.
 * Sur mobile natif, le clic programmatique sur un <input type="file"> est bloqué
 * par la WebView (pas de geste utilisateur) : on passe donc par le plugin
 * natif Camera, ce qui rend les widgets « Caméra » et « Galerie » fonctionnels.
 */
export async function captureImageFile(source: "camera" | "gallery"): Promise<File | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");
    const photo = await Camera.getPhoto({
      quality: 85,
      allowEditing: false,
      correctOrientation: true,
      resultType: CameraResultType.Base64,
      source: source === "gallery" ? CameraSource.Photos : CameraSource.Camera,
    });
    if (!photo?.base64String) return null;
    const mime = photo.format === "png" ? "image/png" : "image/jpeg";
    const bytes = Uint8Array.from(atob(photo.base64String), (c) => c.charCodeAt(0));
    return new File([bytes], `meal.${photo.format || "jpg"}`, { type: mime });
  } catch (e) {
    console.warn("[camera] capture annulée ou indisponible", e);
    return null;
  }
}
