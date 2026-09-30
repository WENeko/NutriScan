import React from "react";

interface CircularProgressProps {
  value: number;
  max: number;
  size?: number;
  strokeWidth?: number;
  color: string;
  label: string;
  unit?: string;
  children?: React.ReactNode;
}

const CircularProgress: React.FC<CircularProgressProps> = ({
  value,
  max,
  size = 100,
  strokeWidth = 8,
  color,
  label,
  unit = "g",
  children,
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = Number.isFinite(value) && Number.isFinite(max) && max > 0
    ? Math.max(0, value / max)
    : 0;
  const baseProgress = Math.min(ratio, 1);
  // À chaque nouveau tour, le surplus repart du haut sans masquer l'anneau de base.
  const surplusTurns = Math.max(0, ratio - 1);
  const surplusProgress = surplusTurns > 0
    ? (surplusTurns % 1 === 0 ? 1 : surplusTurns % 1)
    : 0;

  const showInner = !children && (label || unit);

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }} role="img" aria-label={`${label || "Progression"} : ${Math.round(value)} sur ${Math.round(max)}${unit ? ` ${unit}` : ""}${surplusTurns > 0 ? `, surplus de ${Math.round(value - max)}` : ""}`}>
        <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="hsl(var(--muted))"
            strokeWidth={strokeWidth}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - baseProgress)}
            strokeLinecap="round"
            className="transition-all duration-700 ease-out motion-reduce:transition-none"
          />
          {surplusProgress > 0 && (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="hsl(var(--progress-surplus))"
              strokeWidth={strokeWidth}
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - surplusProgress)}
              strokeLinecap="round"
              className="transition-all duration-700 ease-out motion-reduce:transition-none"
            />
          )}
        </svg>
        {children && <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>}
        {showInner && (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-lg font-display font-bold text-foreground leading-none">
              {Math.round(value)}
            </span>
            {unit && <span className="text-[10px] text-muted-foreground">{unit}</span>}
          </div>
        )}
      </div>
      {label && <span className="text-xs font-medium text-muted-foreground">{label}</span>}
    </div>
  );
};

export default CircularProgress;
