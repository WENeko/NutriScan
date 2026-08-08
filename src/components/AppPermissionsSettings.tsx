import React, { useCallback, useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { ShieldCheck, Camera as CameraIcon, Images, HeartPulse, Bell, RefreshCw, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { checkHealthPermissions, requestHealthPermissions } from "@/services/health-connect";
import { useToast } from "@/hooks/use-toast";

type Status = "granted" | "denied" | "unknown" | "unavailable";

interface PermItem {
  id: string;
  icon: any;
  label: string;
  desc: string;
  status: Status;
  request?: () => Promise<void>;
}

const STATUS_META: Record<Status, { label: string; className: string }> = {
  granted: { label: "Accordée", className: "bg-primary/15 text-primary" },
  denied: { label: "Refusée", className: "bg-destructive/15 text-destructive" },
  unknown: { label: "À vérifier", className: "bg-muted text-muted-foreground" },
  unavailable: { label: "Web / indisponible", className: "bg-muted text-muted-foreground" },
};

/** Plugin natif (Android) : réglages système + autorisation de notifications. */
type AppSettingsPluginType = {
  openAppSettings(): Promise<void>;
  openNotificationSettings(): Promise<void>;
  checkNotifications(): Promise<{ status: string }>;
  requestNotifications(): Promise<{ status: string }>;
};

async function getAppSettingsPlugin(): Promise<AppSettingsPluginType> {
  const { registerPlugin } = await import("@capacitor/core");
  return registerPlugin<AppSettingsPluginType>("AppSettings");
}

/** Menu des autorisations de l'application (Profil → Réglages). */
const AppPermissionsSettings: React.FC = () => {
  const { toast } = useToast();
  const isNative = Capacitor.isNativePlatform();
  const [camera, setCamera] = useState<Status>(isNative ? "unknown" : "unavailable");
  const [photos, setPhotos] = useState<Status>(isNative ? "unknown" : "unavailable");
  const [health, setHealth] = useState<Status>(isNative ? "unknown" : "unavailable");
  const [notifications, setNotifications] = useState<Status>("unknown");
  const [loading, setLoading] = useState(false);


  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      if (isNative) {
        try {
          const { Camera } = await import("@capacitor/camera");
          const res = await Camera.checkPermissions();
          setCamera(res.camera === "granted" ? "granted" : res.camera === "denied" ? "denied" : "unknown");
          setPhotos(res.photos === "granted" ? "granted" : res.photos === "denied" ? "denied" : "unknown");
        } catch {
          setCamera("unknown");
          setPhotos("unknown");
        }
        try {
          setHealth((await checkHealthPermissions()) ? "granted" : "denied");
        } catch {
          setHealth("unknown");
        }
      }
      if (typeof Notification !== "undefined") {
        const p = Notification.permission;
        setNotifications(p === "granted" ? "granted" : p === "denied" ? "denied" : "unknown");
      } else {
        setNotifications("unavailable");
      }
    } finally {
      setLoading(false);
    }
  }, [isNative]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const requestCamera = async () => {
    try {
      const { Camera } = await import("@capacitor/camera");
      const res = await Camera.requestPermissions({ permissions: ["camera", "photos"] });
      setCamera(res.camera === "granted" ? "granted" : "denied");
      setPhotos(res.photos === "granted" ? "granted" : "denied");
    } catch (e: any) {
      toast({ title: "Autorisation caméra indisponible", description: e?.message, variant: "destructive" });
    }
  };

  const requestHealth = async () => {
    try {
      const ok = await requestHealthPermissions();
      setHealth(ok ? "granted" : "denied");
      if (!ok) toast({ title: "Autorisations Santé refusées", variant: "destructive" });
    } catch (e: any) {
      toast({ title: "Santé Connect indisponible", description: e?.message, variant: "destructive" });
    }
  };

  const requestNotifications = async () => {
    if (typeof Notification === "undefined") return;
    const res = await Notification.requestPermission();
    setNotifications(res === "granted" ? "granted" : "denied");
  };

  const items: PermItem[] = [
    { id: "camera", icon: CameraIcon, label: "Caméra", desc: "Photographier un repas pour l'analyse IA", status: camera, request: isNative ? requestCamera : undefined },
    { id: "photos", icon: Images, label: "Photos / Galerie", desc: "Choisir une photo existante à analyser", status: photos, request: isNative ? requestCamera : undefined },
    { id: "health", icon: HeartPulse, label: "Santé Connect", desc: "Poids, masse grasse, calories sportives, pas", status: health, request: isNative ? requestHealth : undefined },
    { id: "notifications", icon: Bell, label: "Notifications", desc: "Rappels de pesée et confirmations rapides", status: notifications, request: requestNotifications },
  ];

  const openSystemSettings = async () => {
    if (!isNative) {
      toast({ title: "Disponible sur mobile", description: "Ouvre les réglages du système depuis l'app installée." });
      return;
    }
    try {
      // Plugin natif : ACTION_APPLICATION_DETAILS_SETTINGS (package:com.nutriscan.app)
      const { registerPlugin } = await import("@capacitor/core");
      const AppSettings = registerPlugin<{ openAppSettings(): Promise<void> }>("AppSettings");
      await AppSettings.openAppSettings();
    } catch {
      toast({
        title: "Réglages système indisponibles",
        description: "Android : Paramètres → Applications → NutriScan → Autorisations.",
      });
    }
  };

  return (
    <section className="bg-card rounded-2xl p-5 shadow-card animate-fade-up" style={{ animationDelay: "45ms" }}>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-primary" />
          <h2 className="font-display font-semibold text-base">Autorisations de l'app</h2>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={refresh} disabled={loading} aria-label="Rafraîchir les autorisations">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Vérifie et accorde les autorisations nécessaires au scan, à la synchronisation santé et aux rappels.
      </p>

      <div className="space-y-2">
        {items.map((item) => {
          const meta = STATUS_META[item.status];
          return (
            <div key={item.id} className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
              <item.icon className="w-4 h-4 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{item.label}</p>
                <p className="text-[11px] text-muted-foreground truncate">{item.desc}</p>
              </div>
              <span className={`text-[10px] font-semibold px-2 py-1 rounded-full whitespace-nowrap ${meta.className}`}>
                {meta.label}
              </span>
              {item.request && item.status !== "granted" && (
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => void item.request?.()}>
                  Autoriser
                </Button>
              )}
            </div>
          );
        })}
      </div>

      <Button variant="outline" className="w-full mt-4 rounded-xl" onClick={openSystemSettings}>
        <ExternalLink className="w-4 h-4 mr-2" />
        Ouvrir les réglages système
      </Button>
    </section>
  );
};

export default AppPermissionsSettings;
