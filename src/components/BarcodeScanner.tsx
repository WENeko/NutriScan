import React, { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Loader2, ScanBarcode, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";

interface BarcodeScannerProps {
  onProductFound: (product: {
    name: string;
    calories: number;
    proteins: number;
    carbs: number;
    fats: number;
    weight_g: number;
    fiber?: number;
    sodium_mg?: number;
    potassium_mg?: number;
    omega3_mg?: number;
    saturated_fat?: number;
    sugar?: number;
    calcium_mg?: number;
    magnesium_mg?: number;
  }) => void;
}

const BarcodeScanner: React.FC<BarcodeScannerProps> = ({ onProductFound }) => {
  const [scanning, setScanning] = useState(false);
  const [loading, setLoading] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const readerRef = useRef<HTMLDivElement>(null);

  const startScanner = async () => {
    setScanning(true);
    try {
      const scanner = new Html5Qrcode("barcode-reader");
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 150 } },
        async (decodedText) => {
          await scanner.stop();
          scannerRef.current = null;
          setScanning(false);
          await lookupBarcode(decodedText);
        },
        () => {}
      );
    } catch (err: any) {
      setScanning(false);
      toast({ title: "Erreur caméra", description: err.message || "Impossible d'accéder à la caméra", variant: "destructive" });
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current) {
      try { await scannerRef.current.stop(); } catch {}
      scannerRef.current = null;
    }
    setScanning(false);
  };

  const lookupBarcode = async (barcode: string) => {
    setLoading(true);
    try {
      const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`);
      const data = await res.json();

      if (data.status !== 1 || !data.product) {
        toast({ title: "Produit non trouvé", description: `Code-barres : ${barcode}`, variant: "destructive" });
        return;
      }

      const p = data.product;
      const nutriments = p.nutriments || {};
      const servingG = p.serving_quantity || 100;

      onProductFound({
        name: p.product_name || p.generic_name || "Produit inconnu",
        calories: Math.round(nutriments["energy-kcal_100g"] * servingG / 100) || 0,
        proteins: Math.round((nutriments.proteins_100g || 0) * servingG / 100),
        carbs: Math.round((nutriments.carbohydrates_100g || 0) * servingG / 100),
        fats: Math.round((nutriments.fat_100g || 0) * servingG / 100),
        weight_g: servingG,
        fiber: Math.round((nutriments.fiber_100g || 0) * servingG / 100) || undefined,
        sodium_mg: Math.round((nutriments.sodium_100g || 0) * 1000 * servingG / 100) || undefined,
        potassium_mg: Math.round((nutriments.potassium_100g || 0) * 1000 * servingG / 100) || undefined,
        saturated_fat: Math.round((nutriments["saturated-fat_100g"] || 0) * servingG / 100) || undefined,
        sugar: Math.round((nutriments.sugars_100g || 0) * servingG / 100) || undefined,
        calcium_mg: Math.round((nutriments.calcium_100g || 0) * 1000 * servingG / 100) || undefined,
        magnesium_mg: Math.round((nutriments.magnesium_100g || 0) * 1000 * servingG / 100) || undefined,
      });

      toast({ title: "Produit trouvé !", description: p.product_name });
    } catch (err: any) {
      toast({ title: "Erreur", description: "Impossible de rechercher le produit", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    return () => { stopScanner(); };
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Recherche du produit...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div id="barcode-reader" className="rounded-xl overflow-hidden" />
      {!scanning ? (
        <button
          onClick={startScanner}
          className="w-full h-40 rounded-2xl border-2 border-dashed border-primary/30 bg-accent/50 flex flex-col items-center justify-center gap-3 hover:border-primary/60 transition-colors active:scale-[0.98]"
        >
          <div className="w-14 h-14 rounded-full nutri-gradient flex items-center justify-center">
            <ScanBarcode className="w-7 h-7 text-primary-foreground" />
          </div>
          <span className="text-sm font-semibold text-primary">Scanner un code-barres</span>
        </button>
      ) : (
        <Button onClick={stopScanner} variant="outline" className="w-full rounded-xl">
          <X className="w-4 h-4 mr-1" /> Arrêter le scan
        </Button>
      )}
    </div>
  );
};

export default BarcodeScanner;
