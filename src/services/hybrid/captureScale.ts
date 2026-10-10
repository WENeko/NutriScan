/**
 * Échelle de prise de vue : distance de mise au point + focale.
 *
 * Cascade (photo caméra OU galerie) :
 *   1. EXIF SubjectDistance (0x9206, mètres) — distance de mise au point.
 *   2. XMP (ex. Camera:FocusDistance / GCamera / drone:RelativeAltitude) si présent.
 *   3. Rien d'exploitable → null (stratégie de secours : le modèle reste
 *      invariant à l'échelle, aucune hypothèse de diamètre d'assiette).
 * La focale (FocalLength / FocalLengthIn35mmFilm) est aussi relevée.
 */
export interface CaptureScale {
  distanceM: number | null;
  focalMm: number | null;
  focal35Mm: number | null;
  source: "camera2" | "exif" | "xmp" | "camera-exif" | "manual" | "none";
  /** Camera2 : qualité de l'unité de LENS_FOCUS_DISTANCE. */
  calibration?: "calibrated" | "approximate" | "uncalibrated";
  focusDiopters?: number | null;
}

let last: CaptureScale | null = null;
export function setCaptureScale(s: CaptureScale | null) { last = s; }
export function consumeCaptureScale(): CaptureScale | null { const s = last; last = null; return s; }

const valid = (d: number | null | undefined) =>
  typeof d === "number" && Number.isFinite(d) && d > 0.03 && d < 10 ? d : null;

/** Analyse les octets JPEG (EXIF APP1 + XMP). */
export function parseImageScale(buf: ArrayBuffer): CaptureScale {
  const v = new DataView(buf);
  const out: CaptureScale = { distanceM: null, focalMm: null, focal35Mm: null, source: "none" };
  if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return out;
  let off = 2;
  while (off + 4 < v.byteLength) {
    if (v.getUint8(off) !== 0xff) break;
    const marker = v.getUint8(off + 1);
    const len = v.getUint16(off + 2);
    const start = off + 4;
    if (marker === 0xe1) {
      const head = String.fromCharCode(...new Uint8Array(buf, start, Math.min(29, len - 2)));
      if (head.startsWith("Exif\0")) readExif(v, start + 6, out);
      else if (head.startsWith("http://ns.adobe.com/xap")) readXmp(new Uint8Array(buf, start, len - 2), out);
    }
    if (marker === 0xda) break;
    off = start + len - 2;
  }
  scanXmpAnywhere(buf, out);
  return out;
}

function readExif(v: DataView, tiff: number, out: CaptureScale) {
  try {
    const le = v.getUint16(tiff) === 0x4949;
    const u16 = (o: number) => v.getUint16(o, le);
    const u32 = (o: number) => v.getUint32(o, le);
    const rational = (o: number) => { const d = u32(o + 4); return d ? u32(o) / d : null; };
    const ifd = (o: number, cb: (tag: number, entry: number) => void) => {
      const n = u16(o);
      for (let i = 0; i < n; i++) { const e = o + 2 + i * 12; cb(u16(e), e); }
    };
    let exifIfd = 0;
    ifd(tiff + u32(tiff + 4), (tag, e) => { if (tag === 0x8769) exifIfd = tiff + u32(e + 8); });
    if (!exifIfd) return;
    let range = 0;
    ifd(exifIfd, (tag, e) => {
      if (tag === 0x9206) {
        const num = u32(tiff + u32(e + 8));
        // 0xFFFFFFFF = infini, 0 = inconnu (norme EXIF).
        const d = num === 0xffffffff ? null : rational(tiff + u32(e + 8));
        if (valid(d)) { out.distanceM = d; out.source = "exif"; }
      } else if (tag === 0x920a) out.focalMm = rational(tiff + u32(e + 8));
      else if (tag === 0xa405) out.focal35Mm = u16(e + 8) || null;
      else if (tag === 0xa40c) range = u16(e + 8);
    });
    // Repli : SubjectDistanceRange (1 = macro, 2 = vue rapprochée) → valeur approximative.
    if (!out.distanceM && (range === 1 || range === 2)) {
      out.distanceM = range === 1 ? 0.2 : 0.4;
      out.source = "exif";
      out.calibration = "approximate";
    }
  } catch { /* EXIF corrompu : ignoré */ }
}

const XMP_KEYS = /(?:FocusDistance|SubjectDistance|focus_distance|FocalDistance|ApproximateFocusDistance|DepthNear)\s*(?:=\s*"|>)\s*([\d.]+)(?:\s*\/\s*([\d.]+))?/i;

function readXmp(bytes: Uint8Array, out: CaptureScale) {
  if (out.distanceM) return;
  const xml = new TextDecoder().decode(bytes);
  const m = xml.match(XMP_KEYS);
  if (!m) return;
  let d = parseFloat(m[1]);
  if (m[2]) d = d / parseFloat(m[2]); // forme rationnelle "42/100"
  if (valid(d)) { out.distanceM = d; out.source = "xmp"; }
}

/** Dernier recours : XMP hors segment APP1 standard (XMP étendu, fichiers retouchés). */
function scanXmpAnywhere(buf: ArrayBuffer, out: CaptureScale) {
  if (out.distanceM) return;
  const bytes = new Uint8Array(buf, 0, Math.min(buf.byteLength, 512 * 1024));
  const txt = new TextDecoder("latin1").decode(bytes);
  const i = txt.indexOf("<x:xmpmeta");
  if (i < 0) return;
  const j = txt.indexOf("</x:xmpmeta>", i);
  readXmp(bytes.subarray(i, j > i ? j : Math.min(bytes.length, i + 65536)), out);
}

/** Depuis l'objet `exif` renvoyé par le plugin Camera (prise de vue en direct). */
export function scaleFromCameraExif(exif: Record<string, unknown> | undefined): CaptureScale | null {
  if (!exif) return null;
  const num = (k: string) => {
    const raw = exif[k];
    if (raw == null) return null;
    const s = String(raw);
    if (s.includes("/")) { const [a, b] = s.split("/").map(Number); return b ? a / b : null; }
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  };
  const d = valid(num("SubjectDistance"));
  return {
    distanceM: d,
    focalMm: num("FocalLength"),
    focal35Mm: num("FocalLengthIn35mmFilm"),
    source: d ? "camera-exif" : "none",
  };
}

/** Lecture sans effacement (pour l'affichage du badge). */
export function peekCaptureScale(): CaptureScale | null { return last; }
