import React from "react";
import { LayoutDashboard, TrendingUp, BookOpen, MessageCircle } from "lucide-react";

export type TabId = "dashboard" | "coach" | "evolution" | "library";

interface BottomNavProps {
  active: TabId;
  onChange: (tab: TabId) => void;
}

const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: "dashboard", label: "Accueil", icon: <LayoutDashboard className="w-5 h-5" /> },
  { id: "coach", label: "Coach", icon: <MessageCircle className="w-5 h-5" /> },
  { id: "evolution", label: "Évolution", icon: <TrendingUp className="w-5 h-5" /> },
  { id: "library", label: "Mes Produits", icon: <BookOpen className="w-5 h-5" /> },
];

const BottomNav: React.FC<BottomNavProps> = ({ active, onChange }) => {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-20 glass-card border-t border-border/50 pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center justify-around max-w-lg mx-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`flex flex-col items-center gap-0.5 py-2.5 px-4 transition-colors ${
              active === tab.id ? "text-primary" : "text-muted-foreground"
            }`}
          >
            {tab.icon}
            <span className="text-[10px] font-semibold">{tab.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
};

export default BottomNav;
