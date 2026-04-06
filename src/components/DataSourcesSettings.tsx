import React, { useState, useEffect } from "react";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, Smartphone, Weight, Activity, Moon, Flame, Shield, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import {
  getHealthConnectPreferences,
  setHealthConnectPreferences,
  isHealthConnectAvailable,
  requestHealthPermissions,
  readNativeHealthData,
  syncHealthData,
  onAppResumeRecheck,
  type HealthConnectPreferences,
} from "@/services/health-connect";
import { supabase } from "@/integrations/supabase/client";

interface DataSourcesSettingsProps {
  onBack: () => void;
}

const DATA_SOURCES = [
  {
    key: "sync_weight" as keyof HealthConnectPreferences,
    icon: Weight,
    label: "Poids & Composition",
    description: "Synchronise le poids, la masse grasse et la masse musculaire squelettique depuis Health Connect.",
    permissions: ["read_weight", "read_skeletal_muscle_mass"],
  },
  {
    key: "sync_body_fat" as keyof HealthConnectPreferences,
    icon: Activity,
    label: "Masse Grasse",
    description: "Récupère le % de masse grasse pour le calcul Katch-McArdle du métabolisme de base.",
    permissions: ["read_body_fat"],
  },
  {
    key: "sync_calories" as keyof HealthConnectPreferences,
    icon: Flame,
    label: "Calories & Pas",
    description: "Importe les calories brûlées et les pas pour ajuster ton objectif calorique.",
    permissions: ["read_total_energy_burned", "read_steps"],
  },
  {
    key: "sync_sleep" as keyof HealthConnectPreferences,
    icon: Moon,
    label: "Sommeil",
    description: "Suit la durée et les phases de sommeil pour optimiser la récupération.",
    permissions: ["read_sleep"],
  },
];

const DataSourcesSettings: React.FC<DataSourcesSettingsProps> = ({ onBack }) => {
  const [prefs, setPrefs] = useState<HealthConnectPreferences>(getHealthConnectPreferences());
  const [isConnected, setIsConnected] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    checkAvailability();
    const cleanup = onAppResumeRecheck(() => checkAvailability());
    return () => { cleanup?.(); };
  }, []);

  useEffect(() => {
    setHealthConnectPreferences(prefs);
  }, [prefs]);

  const checkAvailability = async () => {
    setIsChecking(true);
    const available = await isHealthConnectAvailable();
    console.log("[DataSources] Health Connect available:", available);
    setIsConnected(available);
    setIsChecking(false);
  };

  const handleConnect = async () => {
    const granted = await requestHealthPermissions();
    if (granted) {
      setIsConnected(true);
      toast({ title: "Health Connect activé", description: "Permissions accordées avec succès." });
    } else {
      toast({ title: "Permissions refusées", description: "Autorise l'accès depuis les réglages.", variant: "destructive" });
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({ title: "Non connecté", description: "Connecte-toi pour synchroniser.", variant: "destructive" });
        return;
      }
      const healthData = await readNativeHealthData(30);
      const result = await syncHealthData(user.id, healthData, prefs);
      if (result.synced.length) {
        toast({ title: "Synchronisation réussie", description: `Données synchronisées : ${result.synced.join(", ")}` });
      }
      if (result.errors.length) {
        toast({ title: "Erreurs partielles", description: result.errors.join("; "), variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Erreur de synchronisation", description: e.message, variant: "destructive" });
    } finally {
      setIsSyncing(false);
    }
  };

  const togglePref = (key: keyof HealthConnectPreferences) => {
    setPrefs((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 rounded-xl hover:bg-muted transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h2 className="font-display font-bold text-lg">Sources de Données</h2>
          <p className="text-xs text-muted-foreground">Connecte tes appareils de santé</p>
        </div>
      </div>

      {/* Connection status */}
      <div className={`rounded-2xl p-4 flex items-center gap-3 ${isConnected ? "bg-accent" : "bg-muted"}`}>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isConnected ? "bg-primary text-primary-foreground" : "bg-muted-foreground/20 text-muted-foreground"}`}>
          <Smartphone className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <p className="font-semibold text-sm">
            {isChecking ? "Vérification…" : isConnected ? "Health Connect activé" : "Health Connect non disponible"}
          </p>
          <p className="text-xs text-muted-foreground">
            {isChecking
              ? "Détection en cours…"
              : isConnected
              ? "Les données sont synchronisées automatiquement"
              : "Installe l'app native pour activer la synchronisation"}
          </p>
        </div>
        <div className={`w-2.5 h-2.5 rounded-full ${isConnected ? "bg-primary animate-pulse" : "bg-muted-foreground/30"}`} />
      </div>

      {/* Connect / Sync buttons */}
      {!isChecking && (
        <div className="flex gap-2">
          {!isConnected ? (
            <Button onClick={handleConnect} className="flex-1" variant="outline">
              <Smartphone className="w-4 h-4 mr-2" /> Connecter
            </Button>
          ) : (
            <Button onClick={handleSync} className="flex-1" disabled={isSyncing}>
              <RefreshCw className={`w-4 h-4 mr-2 ${isSyncing ? "animate-spin" : ""}`} />
              {isSyncing ? "Synchronisation…" : "Synchroniser maintenant"}
            </Button>
          )}
        </div>
      )}

      {/* Data source switches */}
      <div className="space-y-3">
        {DATA_SOURCES.map((source) => {
          const Icon = source.icon;
          const enabled = prefs[source.key];
          return (
            <div
              key={source.key}
              className={`bg-card rounded-2xl p-4 shadow-card transition-all ${enabled ? "ring-1 ring-primary/20" : ""}`}
            >
              <div className="flex items-start gap-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${enabled ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                  <Icon className="w-4.5 h-4.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-sm">{source.label}</p>
                    <Switch
                      checked={enabled}
                      onCheckedChange={() => togglePref(source.key)}
                      disabled={!isConnected}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    {source.description}
                  </p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {source.permissions.map((p) => (
                      <span key={p} className="text-[9px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-mono">
                        {p}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Privacy notice */}
      <div className="bg-accent/50 rounded-2xl p-4 flex gap-3">
        <Shield className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-xs">Confidentialité</p>
          <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
            Tes données Health Connect sont lues uniquement sur ton appareil et synchronisées de façon sécurisée. Aucune donnée n'est partagée avec des tiers.
          </p>
        </div>
      </div>

      {/* Android permissions reference */}
      <details className="bg-card rounded-2xl p-4 shadow-card">
        <summary className="font-semibold text-xs cursor-pointer">
          Permissions Android requises
        </summary>
        <div className="mt-3 space-y-2 text-[11px] text-muted-foreground font-mono">
          <p>android.permission.health.READ_WEIGHT</p>
          <p>android.permission.health.READ_BODY_FAT</p>
          <p>android.permission.health.READ_SKELETAL_MUSCLE_MASS</p>
          <p>android.permission.health.READ_LEAN_BODY_MASS</p>
          <p>android.permission.health.READ_TOTAL_CALORIES_BURNED</p>
          <p>android.permission.health.READ_SLEEP</p>
          <p>android.permission.health.READ_STEPS</p>
          <p>android.permission.health.READ_HEALTH_DATA_HISTORY</p>
        </div>
      </details>
    </div>
  );
};

export default DataSourcesSettings;
