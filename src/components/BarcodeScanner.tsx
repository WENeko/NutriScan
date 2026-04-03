import React, { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Loader2, ScanBarcode, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import NumericInput from "./NumericInput";

interface BarcodeScannerProps {
  onProductFound: (product: {
    name: string;
    calories: number;
    proteins: number;
    carbs: number;
    fats: number;
    weight_g: number;
    barcode?: string;
    fiber?: number;
    sodium_mg?: number;
    potassium_mg?: number;
    omega3_mg?: number;
    saturated_fat?: number;
    sugar?: number;
    calcium_mg?: number;
    magnesium_mg?: number;
    vitamin_b_mg?: number;
    vitamin_c_mg?: number;
    vitamin_d_mcg?: number;
    vitamin_e_mg?: number;
    serving_size_g?: number;
  }) => void;
}

const BarcodeScanner: React.FC<BarcodeScannerProps> = ({ onProductFound }) => {
  const [scanning, setScanning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pendingProduct, setPendingProduct] = useState<any>(null);
  const [portionG, setPortionG] = useState<number>(100);
  const scannerRef = useRef<Html5Qrcode | null>(null);

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
      const servingG = p.serving_quantity || p.product_quantity || 100;
      
      const vitaminBPer100g = [
        nutriments["vitamin-b1_100g"],
        nutriments["vitamin-b2_100g"],
        nutriments["vitamin-b3_100g"],
        nutriments["vitamin-b5_100g"],
        nutriments["vitamin-b6_100g"],
        nutriments["vitamin-b9_100g"],
        nutriments["vitamin-b12_100g"],
      ].reduce((sum, value) => sum + (Number(value) || 0), 0);

      // Store per-100g values and let user choose portion
      setPendingProduct({
        barcode,
        name: p.product_name || p.generic_name || "Produit inconnu",
        servingG,
        // Use raw energy-kcal from API (priority over P*4+G*4+L*9)
        calories_100g: Number(nutriments["energy-kcal_100g"]) || 0,
        proteins_100g: Number(nutriments.proteins_100g) || 0,
        carbs_100g: Number(nutriments.carbohydrates_100g) || 0,
        fats_100g: Number(nutriments.fat_100g) || 0,
        fiber_100g: Number(nutriments.fiber_100g) || 0,
        sodium_100g: (Number(nutriments.sodium_100g) || 0) * 1000,
        potassium_100g: (Number(nutriments.potassium_100g) || 0) * 1000,
        saturated_fat_100g: Number(nutriments["saturated-fat_100g"]) || 0,
        sugar_100g: Number(nutriments.sugars_100g) || 0,
        calcium_100g: (Number(nutriments.calcium_100g) || 0) * 1000,
        magnesium_100g: (Number(nutriments.magnesium_100g) || 0) * 1000,
        vitamin_b_100g: vitaminBPer100g,
        vitamin_c_100g: Number(nutriments["vitamin-c_100g"] || nutriments["vitamin-c"]) || 0,
        vitamin_d_100g: Number(nutriments["vitamin-d_100g"] || nutriments["vitamin-d"]) || 0,
        vitamin_e_100g: Number(nutriments["vitamin-e_100g"] || nutriments["vitamin-e"]) || 0,
      });
      setPortionG(servingG);
      toast({ title: "Produit trouvé !", description: p.product_name });
    } catch (err: any) {
      toast({ title: "Erreur", description: "Impossible de rechercher le produit", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const confirmPortion = () => {
    if (!pendingProduct) return;
    const p = pendingProduct;
    const ratio = portionG / 100;
    onProductFound({
      barcode: p.barcode,
      name: p.name,
      // Use raw kcal from API, not recalculated
      calories: Math.round(p.calories_100g * ratio),
      proteins: Math.round(p.proteins_100g * ratio * 10) / 10,
      carbs: Math.round(p.carbs_100g * ratio * 10) / 10,
      fats: Math.round(p.fats_100g * ratio * 10) / 10,
      weight_g: portionG,
      serving_size_g: p.servingG,
      fiber: Math.round(p.fiber_100g * ratio * 10) / 10 || undefined,
      sodium_mg: Math.round(p.sodium_100g * ratio) || undefined,
      potassium_mg: Math.round(p.potassium_100g * ratio) || undefined,
      saturated_fat: Math.round(p.saturated_fat_100g * ratio * 10) / 10 || undefined,
      sugar: Math.round(p.sugar_100g * ratio * 10) / 10 || undefined,
      calcium_mg: Math.round(p.calcium_100g * ratio) || undefined,
      magnesium_mg: Math.round(p.magnesium_100g * ratio) || undefined,
      vitamin_b_mg: Math.round(p.vitamin_b_100g * ratio * 10) / 10 || undefined,
      vitamin_c_mg: Math.round(p.vitamin_c_100g * ratio * 10) / 10 || undefined,
      vitamin_d_mcg: Math.round(p.vitamin_d_100g * ratio * 10) / 10 || undefined,
      vitamin_e_mg: Math.round(p.vitamin_e_100g * ratio * 10) / 10 || undefined,
    });
    setPendingProduct(null);
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

  // Pending product - let user adjust portion
  if (pendingProduct) {
    const ratio = portionG / 100;
    return (
      <div className="space-y-3 animate-fade-up">
        <div className="bg-card rounded-xl p-3 shadow-card">
          <p className="text-sm font-semibold">{pendingProduct.name}</p>
          <p className="text-[10px] text-muted-foreground">Code : {pendingProduct.barcode}</p>
        </div>
        <div className="bg-card rounded-xl p-3 shadow-card space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Portion (g)</span>
            <NumericInput value={portionG} onChange={setPortionG} className="h-8 w-24 rounded-lg text-sm text-center" />
          </div>
          <p className="text-[10px] text-muted-foreground">Portion par défaut : {pendingProduct.servingG}g</p>
          <div className="bg-accent rounded-lg p-2 text-xs">
            <strong className="text-primary">{Math.round(pendingProduct.calories_100g * ratio)} kcal</strong>
            {" · "}P:{Math.round(pendingProduct.proteins_100g * ratio)}g
            {" · "}G:{Math.round(pendingProduct.carbs_100g * ratio)}g
            {" · "}L:{Math.round(pendingProduct.fats_100g * ratio)}g
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setPendingProduct(null)}>
            <X className="w-4 h-4 mr-1" /> Annuler
          </Button>
          <Button className="flex-1 rounded-xl nutri-gradient text-primary-foreground" onClick={confirmPortion}>
            Ajouter
          </Button>
        </div>
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
