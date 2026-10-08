import { useState } from "react";
import { Ruler } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import NumericInput from "./NumericInput";
import type { CaptureScale } from "@/services/hybrid/captureScale";

const SOURCE_LABEL: Record<CaptureScale["source"], string> = {
  camera2: "mise au point caméra",
  exif: "données de la photo",
  xmp: "données de la photo",
  "camera-exif": "données de la photo",
  manual: "saisie manuelle",
  none: "non détectée",
};

interface Props {
  scale: CaptureScale | null;
  /** Nouvelle distance (m) ; null = effacer. */
  onChange?: (distanceM: number | null) => void;
  disabled?: boolean;
}

/** Badge en surimpression sur la photo : distance à l'aliment, corrigeable au clic. */
export default function DistanceBadge({ scale, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const cm = scale?.distanceM ? Math.round(scale.distanceM * 100) : null;
  const [value, setValue] = useState<string>(cm ? String(cm) : "");
  const approx = scale?.source === "camera2" && scale.calibration !== "calibrated";

  const apply = (v: number | null) => {
    onChange?.(v && v >= 5 && v <= 300 ? v / 100 : null);
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        disabled={disabled || !onChange}
        onClick={() => { setValue(cm ? String(cm) : ""); setOpen(true); }}
        className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-background/80 backdrop-blur px-2.5 py-1 text-xs font-medium text-foreground shadow-sm border border-border"
      >
        <Ruler className="w-3.5 h-3.5" />
        {cm ? `${approx ? "≈ " : ""}${cm} cm` : "Distance ?"}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Distance à l'aliment</DialogTitle>
            <DialogDescription>
              Source : {scale ? SOURCE_LABEL[scale.source] : "non détectée"}
              {approx ? " (approximative)" : ""}. Corrigez-la pour affiner le poids estimé.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            {[25, 35, 45].map((d) => (
              <Button key={d} variant="outline" size="sm" className="flex-1" onClick={() => apply(d)}>{d} cm</Button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <NumericInput value={value} onChange={(v: string) => setValue(v)} placeholder="cm" />
            <span className="text-sm text-muted-foreground">cm</span>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" className="flex-1" onClick={() => apply(null)}>Inconnue</Button>
            <Button className="flex-1" onClick={() => apply(parseFloat(value.replace(",", ".")))}>Valider</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
