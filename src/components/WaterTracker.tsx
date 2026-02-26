import React, { useState } from "react";
import { Droplets, Plus } from "lucide-react";

interface WaterTrackerProps {
  current: number;
  goal: number;
  onAdd: (ml: number) => void;
}

const WaterTracker: React.FC<WaterTrackerProps> = ({ current, goal, onAdd }) => {
  const percent = Math.min((current / goal) * 100, 100);
  const glasses = Math.floor(current / 250);

  return (
    <div className="bg-card rounded-2xl p-4 shadow-card flex items-center gap-4">
      <div className="relative w-12 h-12 flex-shrink-0">
        <Droplets className="w-12 h-12 text-nutri-blue/20" />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xs font-bold text-nutri-blue">{glasses}</span>
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="font-semibold">Hydratation</span>
          <span className="text-muted-foreground">{current}ml / {goal}ml</span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${percent}%`, background: "hsl(var(--nutri-blue))" }} />
        </div>
      </div>
      <button
        onClick={() => onAdd(250)}
        className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold nutri-gradient text-primary-foreground flex-shrink-0"
      >
        <Plus className="w-3 h-3" /> 250ml
      </button>
    </div>
  );
};

export default WaterTracker;
