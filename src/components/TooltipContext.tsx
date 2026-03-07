import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

interface TooltipContextType {
  openId: string | null;
  open: (id: string) => void;
  close: () => void;
}

const TooltipCtx = createContext<TooltipContextType>({ openId: null, open: () => {}, close: () => {} });

export const useTooltipCtx = () => useContext(TooltipCtx);

export const TooltipProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [openId, setOpenId] = useState<string | null>(null);

  const open = useCallback((id: string) => setOpenId((prev) => (prev === id ? null : id)), []);
  const close = useCallback(() => setOpenId(null), []);

  useEffect(() => {
    if (!openId) return;
    const handleScroll = () => setOpenId(null);
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-info-bubble]")) setOpenId(null);
    };
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("click", handleClick);
    return () => {
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("click", handleClick);
    };
  }, [openId]);

  return <TooltipCtx.Provider value={{ openId, open, close }}>{children}</TooltipCtx.Provider>;
};
