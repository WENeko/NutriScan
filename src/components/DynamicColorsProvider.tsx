import { useEffect } from "react";
import { useTheme } from "next-themes";
import { applyColorOverrides, COLORS_CHANGED_EVENT, type ColorMode } from "@/lib/themeColors";

/**
 * Applique les couleurs personnalisées de l'utilisateur sur :root,
 * en suivant le mode courant (clair / sombre / système).
 */
const DynamicColorsProvider: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const { resolvedTheme } = useTheme();
  const mode: ColorMode = resolvedTheme === "dark" ? "dark" : "light";

  useEffect(() => {
    applyColorOverrides(mode);
    const reapply = () => applyColorOverrides(mode);
    window.addEventListener(COLORS_CHANGED_EVENT, reapply);
    window.addEventListener("storage", reapply);
    return () => {
      window.removeEventListener(COLORS_CHANGED_EVENT, reapply);
      window.removeEventListener("storage", reapply);
    };
  }, [mode]);

  return <>{children}</>;
};

export default DynamicColorsProvider;
