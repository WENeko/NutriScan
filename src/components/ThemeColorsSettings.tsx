import React, { useMemo, useState } from "react";
import { useTheme } from "next-themes";
import { Palette, RotateCcw, Sun, Moon, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import {
  COLOR_GROUPS,
  COLOR_PRESETS,
  DEFAULT_COLORS,
  ALL_TOKENS,
  effectiveColor,
  emptyOverrides,
  hexToHslString,
  hslStringToHex,
  loadColorOverrides,
  saveColorOverrides,
  type ColorMode,
  type ColorOverrides,
} from "@/lib/themeColors";

/** Réglage complet et dynamique de toutes les couleurs de l'application. */
const ThemeColorsSettings: React.FC = () => {
  const { resolvedTheme } = useTheme();
  const [overrides, setOverrides] = useState<ColorOverrides>(() => loadColorOverrides());
  const [mode, setMode] = useState<ColorMode>(resolvedTheme === "dark" ? "dark" : "light");
  const [openGroup, setOpenGroup] = useState<string>("brand");

  const customCount = useMemo(
    () => ALL_TOKENS.filter((t) => overrides[mode]?.[t]).length,
    [overrides, mode],
  );

  const commit = (next: ColorOverrides) => {
    setOverrides(next);
    saveColorOverrides(next);
  };

  const setToken = (token: string, hex: string) => {
    const next: ColorOverrides = {
      light: { ...overrides.light },
      dark: { ...overrides.dark },
    };
    next[mode][token] = hexToHslString(hex);
    commit(next);
  };

  const resetToken = (token: string) => {
    const next: ColorOverrides = {
      light: { ...overrides.light },
      dark: { ...overrides.dark },
    };
    delete next[mode][token];
    commit(next);
  };

  const applyPreset = (presetId: string) => {
    const preset = COLOR_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    const next: ColorOverrides = {
      light: { ...(preset.colors.light || {}) },
      dark: { ...(preset.colors.dark || {}) },
    };
    commit(next);
    toast({ title: "Palette appliquée", description: preset.label });
  };

  const resetAll = () => {
    commit(emptyOverrides());
    toast({ title: "Couleurs réinitialisées" });
  };

  return (
    <section className="bg-card rounded-2xl p-5 shadow-card animate-fade-up">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Palette className="w-4 h-4 text-primary" />
          <h2 className="font-display font-semibold text-base">Couleurs de l'application</h2>
        </div>
        <button
          onClick={resetAll}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Tout réinitialiser
        </button>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Chaque couleur est appliquée immédiatement à toute l'app (et aux widgets d'écran d'accueil).
        {customCount > 0 && ` ${customCount} couleur(s) personnalisée(s) en mode ${mode === "dark" ? "sombre" : "clair"}.`}
      </p>

      {/* Sélecteur de mode édité */}
      <div className="flex rounded-xl bg-muted p-1 gap-1 mb-4">
        {([
          { id: "light" as ColorMode, label: "Mode clair", icon: Sun },
          { id: "dark" as ColorMode, label: "Mode sombre", icon: Moon },
        ]).map((m) => {
          const Icon = m.icon;
          return (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-semibold transition-all ${
                mode === m.id ? "bg-card text-foreground shadow-card" : "text-muted-foreground"
              }`}
            >
              <Icon className="w-4 h-4" />
              {m.label}
            </button>
          );
        })}
      </div>

      {/* Palettes prédéfinies */}
      <div className="mb-4">
        <p className="text-xs font-semibold text-muted-foreground mb-2">Palettes rapides</p>
        <div className="flex flex-wrap gap-2">
          {COLOR_PRESETS.map((p) => {
            const swatch = p.colors[mode]?.primary || DEFAULT_COLORS[mode].primary;
            return (
              <button
                key={p.id}
                onClick={() => applyPreset(p.id)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-muted text-xs font-semibold hover:opacity-80 transition-opacity"
              >
                <span
                  className="w-4 h-4 rounded-full border border-border"
                  style={{ background: `hsl(${swatch})` }}
                />
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Groupes de tokens */}
      <div className="space-y-2">
        {COLOR_GROUPS.map((group) => {
          const open = openGroup === group.id;
          return (
            <div key={group.id} className="rounded-xl border border-border overflow-hidden">
              <button
                onClick={() => setOpenGroup(open ? "" : group.id)}
                className="w-full flex items-center justify-between px-3 py-2.5 bg-muted/50"
              >
                <span className="text-sm font-semibold">{group.label}</span>
                <div className="flex items-center gap-1">
                  {group.tokens.slice(0, 5).map((t) => (
                    <span
                      key={t.token}
                      className="w-3.5 h-3.5 rounded-full border border-border"
                      style={{ background: `hsl(${effectiveColor(overrides, mode, t.token)})` }}
                    />
                  ))}
                </div>
              </button>

              {open && (
                <div className="p-3 space-y-3">
                  {group.tokens.map((t) => {
                    const value = effectiveColor(overrides, mode, t.token);
                    const hex = hslStringToHex(value);
                    const isCustom = Boolean(overrides[mode]?.[t.token]);
                    return (
                      <div key={t.token} className="flex items-center gap-3">
                        <label className="relative shrink-0">
                          <span
                            className="block w-9 h-9 rounded-xl border border-border shadow-card"
                            style={{ background: `hsl(${value})` }}
                          />
                          <input
                            type="color"
                            value={hex}
                            onChange={(e) => setToken(t.token, e.target.value)}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            aria-label={t.label}
                          />
                        </label>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium flex items-center gap-1.5">
                            {t.label}
                            {isCustom && <Check className="w-3 h-3 text-primary" />}
                          </div>
                          {t.hint && <div className="text-[10px] text-muted-foreground truncate">{t.hint}</div>}
                        </div>
                        <input
                          type="text"
                          value={hex}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (/^#?[0-9a-fA-F]{6}$/.test(v)) setToken(t.token, v.startsWith("#") ? v : `#${v}`);
                          }}
                          className="w-[86px] h-9 rounded-lg bg-muted px-2 text-xs font-mono text-center outline-none focus:ring-2 focus:ring-ring"
                        />
                        {isCustom && (
                          <button
                            onClick={() => resetToken(t.token)}
                            className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                            title="Valeur par défaut"
                          >
                            <RotateCcw className="w-3.5 h-3.5 text-muted-foreground" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Aperçu */}
      <div className="mt-5 rounded-xl border border-border p-4 space-y-3">
        <p className="text-xs font-semibold text-muted-foreground">Aperçu</p>
        <div className="flex items-center gap-2">
          <Button className="h-9 rounded-xl nutri-gradient text-primary-foreground text-xs px-4">Principal</Button>
          <span className="px-3 py-2 rounded-xl bg-accent text-accent-foreground text-xs font-semibold">Accent</span>
          <span className="px-3 py-2 rounded-xl bg-destructive text-destructive-foreground text-xs font-semibold">Alerte</span>
        </div>
        <div className="flex items-center gap-4">
          {[
            { label: "P", color: "hsl(var(--macro-protein))" },
            { label: "G", color: "hsl(var(--macro-carb))" },
            { label: "L", color: "hsl(var(--macro-fat))" },
            { label: "kcal", color: "hsl(var(--primary))" },
          ].map((m) => (
            <div key={m.label} className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full" style={{ background: m.color }} />
              <span className="text-xs font-semibold">{m.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ThemeColorsSettings;
