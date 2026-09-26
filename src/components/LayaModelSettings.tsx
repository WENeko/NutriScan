import React, { useCallback, useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { ScanEye, RefreshCw, Upload, Check, Loader2 } from "lucide-react";
import {
  isLayaAvailable,
  listLayaModels,
  importLayaModel,
  getSelectedLayaModel,
  setSelectedLayaModel,
} from "@/services/hybrid/layaVision";

/**
 * Carte de gestion du modèle de détection visuelle Laya-Vision (étage 1 du
 * pipeline hybride) : recherche des modèles .onnx/.tflite sur l'appareil,
 * import depuis les fichiers et sélection du modèle actif.
 */
const LayaModelSettings: React.FC = () => {
  const isNative = Capacitor.isNativePlatform();
  const [models, setModels] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(getSelectedLayaModel());
  const [available, setAvailable] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [importing, setImporting] = useState(false);

  const scan = useCallback(async () => {
    if (!isNative) return;
    setScanning(true);
    try {
      const found = await listLayaModels();
      setModels(found);
      setAvailable(await isLayaAvailable());
      if (found.length > 0 && !getSelectedLayaModel()) {
        setSelectedLayaModel(found[0]);
        setSelected(found[0]);
      }
    } catch (e: any) {
      toast({ title: "Recherche impossible", description: e?.message, variant: "destructive" });
    } finally {
      setScanning(false);
    }
  }, [isNative]);

  useEffect(() => {
    void scan();
  }, [scan]);

  const handleImport = async () => {
    setImporting(true);
    try {
      const res = await importLayaModel();
      toast({ title: "Modèle importé", description: res.model });
      await scan();
    } catch (e: any) {
      if (!/annulé/i.test(e?.message ?? "")) {
        toast({ title: "Import impossible", description: e?.message, variant: "destructive" });
      }
    } finally {
      setImporting(false);
    }
  };

  const handleSelect = (name: string) => {
    setSelectedLayaModel(name);
    setSelected(name);
  };

  return (
    <Card className="bg-card rounded-2xl p-4 shadow-card space-y-3">
      <div className="flex items-center gap-2">
        <ScanEye className="w-4 h-4 text-primary" />
        <h3 className="font-display font-semibold text-sm">Détection visuelle locale (Laya-Vision)</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        Modèle de décision on-device (photo → aliments + pesée estimée en grammes, sans réseau).
        Importez le fichier <span className="font-mono">laya_vision_int8.onnx</span> depuis vos Téléchargements.
      </p>

      {!isNative ? (
        <p className="text-[11px] text-muted-foreground bg-muted/50 rounded-lg p-2">
          Disponible uniquement dans l'application Android native.
        </p>
      ) : (
        <>
          <div className="flex gap-2">
            <Button onClick={scan} variant="outline" size="sm" disabled={scanning} className="flex-1 h-9 rounded-xl">
              {scanning ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
              Rechercher
            </Button>
            <Button onClick={handleImport} size="sm" disabled={importing} className="flex-1 h-9 rounded-xl">
              {importing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />}
              Importer un modèle
            </Button>
          </div>

          {models.length === 0 ? (
            <p className="text-[11px] text-muted-foreground bg-muted/50 rounded-lg p-2">
              Aucun modèle détecté. Importez un fichier <span className="font-mono">.onnx</span> ou{" "}
              <span className="font-mono">.tflite</span>.
            </p>
          ) : (
            <div className="space-y-1.5">
              {models.map((m) => (
                <button
                  key={m}
                  onClick={() => handleSelect(m)}
                  className={`w-full flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-left transition-colors ${
                    selected === m ? "bg-accent border border-primary/40" : "bg-muted/40 hover:bg-muted"
                  }`}
                >
                  <span className="flex-1 truncate font-mono">{m}</span>
                  {selected === m && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                </button>
              ))}
            </div>
          )}

          <p className="text-[10px] text-muted-foreground">
            {available
              ? "✅ Détection locale prête — le mode hybride utilisera ce modèle pour les photos."
              : "Le mode hybride photo sera actif dès qu'un modèle sera importé."}
          </p>
        </>
      )}
    </Card>
  );
};

export default LayaModelSettings;
